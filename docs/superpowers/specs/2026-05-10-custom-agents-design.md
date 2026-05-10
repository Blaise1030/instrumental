# Custom Agents — Design Spec

**Date:** 2026-05-10  
**Status:** Approved

## Overview

Allow users to add custom CLI coding agents (e.g. Aider, Amp, Goose) alongside the four built-in agents (claude, cursor, codex, gemini). Custom agents are stored in SQLite, have their own start command and resume template, and appear everywhere built-in agents do — thread creation, settings, and the resume flow.

---

## Section 1: Data Layer

### New `customAgents` SQLite table (Drizzle schema)

```ts
customAgents {
  id: text (PK) — slug prefixed "custom:", e.g. "custom:aider"
  label: text NOT NULL — display name, e.g. "Aider"
  icon: text NOT NULL — emoji or HTTPS URL, e.g. "🤖"
  startCommand: text NOT NULL — shell command, e.g. "aider"
  resumeTemplate: text NOT NULL — e.g. "aider --resume {resumeId}" (empty = no resume)
  skillRoot: text NOT NULL DEFAULT ""
  sortOrder: integer NOT NULL DEFAULT 0
  createdAt: text NOT NULL
  updatedAt: text NOT NULL
}
```

### Type changes in `shared/domain.ts`

```ts
export type BuiltInAgent = "claude" | "cursor" | "codex" | "gemini";
export type ThreadAgent = BuiltInAgent | (string & {});
// (string & {}) preserves autocomplete for built-in literals while allowing any string
```

A `CustomAgent` interface and a helper `isBuiltInAgent(agent: ThreadAgent): agent is BuiltInAgent` are added to `shared/domain.ts`:

```ts
export interface CustomAgent {
  id: string;           // "custom:aider"
  label: string;
  icon: string;         // emoji or URL
  startCommand: string;
  resumeTemplate: string;
  skillRoot: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const BUILT_IN_AGENTS: BuiltInAgent[] = ["claude", "cursor", "codex", "gemini"];
export function isBuiltInAgent(agent: ThreadAgent): agent is BuiltInAgent {
  return (BUILT_IN_AGENTS as string[]).includes(agent);
}
```

`isBuiltInAgent` is used at every switch/branch site that previously assumed `ThreadAgent` was exhaustive.

### Resume template substitution in `shared/threadAgentBootstrap.ts`

`threadAgentResumeCommandLine` gains an optional `resumeTemplate` parameter:

```ts
export function threadAgentResumeCommandLine(
  baseCommand: string,
  agent: ThreadAgent,
  resumeId: string,
  resumeTemplate?: string,
): string {
  if (resumeTemplate !== undefined)
    return resumeTemplate.replace("{resumeId}", resumeId);
  // existing switch for built-ins unchanged
}
```

An empty `resumeTemplate` returns `""` — the existing `if (!resumeCmd.trim()) return` guard in `AgentPage.vue` skips the resume bootstrap silently.

---

## Section 2: IPC / Service Layer

### IPC keys

New module file: `electron/ipcChannels.ts` (or `agent` module's IPC keys file):

```ts
CUSTOM_AGENTS_IPC = {
  LIST:   "custom-agents:list",
  CREATE: "custom-agents:create",
  UPDATE: "custom-agents:update",
  DELETE: "custom-agents:delete",
}
```

### Electron-side handlers (`electron/storage/stores/`)

New `CustomAgentsStore` class:

| Handler | Behaviour |
|---------|-----------|
| `list` | `SELECT * FROM customAgents ORDER BY sortOrder, createdAt` |
| `create` | Insert row; auto-generate `id` as `custom:${slugify(label)}` |
| `update` | Update all mutable fields + `updatedAt` |
| `delete` | Remove row; threads keep their `agent` string and fall back gracefully |

### Snapshot

`WorkspaceStore.getSnapshot()` return type gets a new field:
```ts
customAgents: CustomAgent[]
```
This means the renderer receives the list in the same poll it already uses for threads/projects.

### AppContext

`customAgentService` is added to `AppContext`:
```ts
customAgentService: {
  list(): Promise<CustomAgent[]>
  create(input: CreateCustomAgentInput): Promise<CustomAgent>
  update(id: string, input: UpdateCustomAgentInput): Promise<CustomAgent>
  delete(id: string): Promise<void>
}
```

### Renderer data loading

```ts
useQuery({ queryKey: ['custom-agents'], queryFn: () => appContext.customAgentService.list() })
// Mutations call invalidateQueries(['custom-agents']) on success
```

---

## Section 3: UI (Settings Dialog)

### `AgentCommandsSettingsDialog.vue` — Agents tab

The "Agents" tab is split into two sections:

**Built-in agents** (unchanged behaviour)
- Same 4 cards: icon, label, start command, skill root
- Not deletable; always present

**Custom agents** (below a `<hr>` divider)
- Each custom agent renders as a card matching the built-in card shape, with two additional icon buttons: **Edit** (pencil) and **Delete** (trash)
- An **"Add agent"** button at the bottom opens an inline form within the same scroll panel (no nested dialog)

### Inline add/edit form fields

| Field | Input | Validation |
|-------|-------|------------|
| Icon | Emoji or URL (toggled tab) | Required, non-empty |
| Label | Text | Required, non-empty |
| Start command | Text | Required, non-empty |
| Resume template | Text + `{resumeId}` hint | If non-empty, must contain `{resumeId}` |
| Skills directory | Text | Optional |

- **Save / Cancel** buttons on the inline form
- ID is derived from label: `custom:${slugify(label)}`; collision with existing slug shows an inline error

### Save behaviour

Custom agents **save immediately** per mutation — not batched with built-ins. The dialog does not need to be closed to persist a custom agent.

---

## Section 4: Thread Creation & Resume Flow

### Thread creation

The add-thread overlay merges built-ins and custom agents into one list:

```ts
const allAgents = [...BUILT_IN_AGENT_ROWS, ...customAgents.map(toAgentRow)]
```

### Bootstrap command resolution (`useAgentBootstrapCommands`)

```ts
function bootstrapCommandFor(agent: ThreadAgent): string {
  if (isBuiltInAgent(agent)) return settings.commands[agent]   // existing path
  return customAgents.find(a => a.id === agent)?.startCommand ?? agent
}
```

### Resume flow (`AgentPage.vue`)

```ts
const resumeTemplate = isBuiltInAgent(thread.agent)
  ? undefined
  : customAgents.find(a => a.id === thread.agent)?.resumeTemplate

const resumeCmd = threadAgentResumeCommandLine(
  bootstrapCommandFor(thread.agent),
  thread.agent,
  session.resumeId,
  resumeTemplate,
)
// Empty resumeCmd → existing guard skips bootstrap silently
```

### Unknown agent fallback

If a thread's `agent` string no longer resolves to any custom agent (e.g. deleted), the thread still opens — no auto-bootstrap fires. The thread top bar displays a subtle "Agent not configured" label.

---

## Out of Scope

- Custom agent icons uploaded as local files (emoji/URL only)
- Reordering custom agents via drag-and-drop (sort order field is reserved for future use)
- Per-project custom agent overrides
- Sync of custom agents across machines
