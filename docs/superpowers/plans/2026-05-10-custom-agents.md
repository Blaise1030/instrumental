# Custom Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to add arbitrary CLI coding agents alongside the four built-in agents (claude, cursor, codex, gemini), with per-agent start commands, resume templates, icons, and skill directories — all persisted in SQLite.

**Architecture:** Widen `ThreadAgent` from a 4-literal union to `BuiltInAgent | (string & {})`, add a `customAgents` SQLite table owned by a new `CustomAgentStore`, expose CRUD via IPC, and thread custom-agent resolution through the bootstrap/resume/settings/thread-creation flows. Built-in agents stay protected (editable but not deletable).

**Tech Stack:** Vue 3, TypeScript, Drizzle ORM (better-sqlite3), Electron ipcMain/ipcRenderer, Tanstack Query (via composables), Vitest

---

## File Map

| Action | File |
|--------|------|
| Modify | `apps/desktop/src/shared/domain.ts` |
| Modify | `apps/desktop/src/shared/threadAgentBootstrap.ts` |
| Modify | `apps/desktop/src/shared/ipc.ts` |
| Modify | `apps/desktop/electron/storage/schema.ts` |
| **Create** | `apps/desktop/electron/storage/stores/CustomAgentStore.ts` |
| Modify | `apps/desktop/electron/storage/WorkspaceStore.ts` |
| Modify | `apps/desktop/electron/ipcChannels.ts` |
| Modify | `apps/desktop/electron/preload.ts` |
| Modify | `apps/desktop/electron/mainApp.ts` |
| Modify | `apps/desktop/src/app-context/type.ts` |
| **Create** | `apps/desktop/src/app-context/customAgentService.ts` |
| Modify | `apps/desktop/src/app-context/AppContext.vue` |
| Modify | `apps/desktop/src/components/ui/AgentIcon.vue` |
| Modify | `apps/desktop/src/modules/agent/hooks/useAgentBootstrapCommands.ts` |
| Modify | `apps/desktop/src/modules/agent/hooks/useAgentSkillRoots.ts` |
| Modify | `apps/desktop/src/modules/agent/components/AgentCommandsSettingsDialog.vue` |
| Modify | `apps/desktop/src/modules/settings/pages/SettingsPage.vue` |
| Modify | `apps/desktop/src/components/WorkspaceLauncherModal.vue` |
| Modify | `apps/desktop/src/modules/agent/pages/AgentPage.vue` |
| Modify | `apps/desktop/electron/services/workspaceService.ts` |

---

## Task 1: Widen shared types

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/src/shared/threadAgentBootstrap.ts`

- [ ] **Step 1: Add `BuiltInAgent`, `CustomAgent`, `isBuiltInAgent` to `domain.ts`**

Open `apps/desktop/src/shared/domain.ts`. Replace the `ThreadAgent` line and add the new exports after it:

```ts
// Before (remove this line):
export type ThreadAgent = "claude" | "cursor" | "codex" | "gemini";

// After (replace with):
export type BuiltInAgent = "claude" | "cursor" | "codex" | "gemini";

/**
 * `(string & {})` keeps autocomplete for built-in literals while allowing any custom agent id.
 * Custom agent ids use the "custom:" prefix (e.g. "custom:aider").
 */
export type ThreadAgent = BuiltInAgent | (string & {});

export interface CustomAgent {
  id: string;           // e.g. "custom:aider"
  label: string;
  icon: string;         // emoji or HTTPS URL
  startCommand: string;
  resumeTemplate: string; // e.g. "aider --resume {resumeId}" (empty = no resume)
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

- [ ] **Step 2: Add `resumeTemplate` param to `threadAgentResumeCommandLine`**

Open `apps/desktop/src/shared/threadAgentBootstrap.ts`. Update `threadAgentResumeCommandLine`:

```ts
/**
 * Resume line built from the user's configured bootstrap command (settings / localStorage)
 * plus provider-specific resume spelling — same flags as {@link threadAgentResumeCommand}.
 * Pass `resumeTemplate` for custom agents (e.g. "aider --resume {resumeId}").
 * An empty `resumeTemplate` returns "" which callers treat as "no resume".
 */
export function threadAgentResumeCommandLine(
  baseCommand: string,
  agent: ThreadAgent,
  resumeId: string,
  resumeTemplate?: string,
): string {
  if (resumeTemplate !== undefined)
    return resumeTemplate.replace("{resumeId}", resumeId);
  const base = baseCommand.trim();
  switch (agent) {
    case "claude":
      return `${base} --resume ${resumeId}`;
    case "cursor":
      return `${base} --resume=${resumeId}`;
    case "codex":
      return `${base} resume ${resumeId}`;
    case "gemini":
      return `${base} --resume ${resumeId}`;
    default:
      return "";
  }
}
```

- [ ] **Step 3: Fix `DEFAULT_THREAD_TITLES` in `workspaceService.ts` (type narrowing)**

Open `apps/desktop/electron/services/workspaceService.ts`. The `DEFAULT_THREAD_TITLES` map is typed `Record<Thread["agent"], string>`. Since `Thread["agent"]` is now `string`, change it to use a lookup function to avoid index-signature issues:

```ts
// Replace this:
const DEFAULT_THREAD_TITLES: Record<Thread["agent"], string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

// With this:
const DEFAULT_THREAD_TITLES: Partial<Record<string, string>> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};
```

No other logic in that function changes — the `DEFAULT_THREAD_TITLES[thread.agent]` lookup already handles undefined since it was optional before.

Also update `hasDefaultGeneratedTitle`:

```ts
function hasDefaultGeneratedTitle(thread: Thread): boolean {
  const base = DEFAULT_THREAD_TITLES[thread.agent];
  if (!base) return false;
  return thread.title === base || thread.title.startsWith(`${base} · `);
}
```

- [ ] **Step 4: Commit**

```bash
cd apps/desktop
git add src/shared/domain.ts src/shared/threadAgentBootstrap.ts electron/services/workspaceService.ts
git commit -m "feat(custom-agents): widen ThreadAgent type, add CustomAgent interface and resumeTemplate param"
```

---

## Task 2: Database schema + CustomAgentStore

**Files:**
- Modify: `apps/desktop/electron/storage/schema.ts`
- Create: `apps/desktop/electron/storage/stores/CustomAgentStore.ts`
- Modify: `apps/desktop/electron/storage/WorkspaceStore.ts`

- [ ] **Step 1: Add `customAgents` table to Drizzle schema**

Open `apps/desktop/electron/storage/schema.ts`. Append after the last table:

```ts
export const customAgents = sqliteTable("custom_agents", {
  id: text("id").primaryKey(),            // "custom:aider"
  label: text("label").notNull(),
  icon: text("icon").notNull(),            // emoji or URL
  startCommand: text("start_command").notNull(),
  resumeTemplate: text("resume_template").notNull().default(""),
  skillRoot: text("skill_root").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
```

- [ ] **Step 2: Create `CustomAgentStore.ts`**

Create `apps/desktop/electron/storage/stores/CustomAgentStore.ts`:

```ts
import { sql } from "drizzle-orm";
import type { CustomAgent } from "../../../src/shared/domain.js";
import type { AppDatabase } from "../db.js";

export interface CreateCustomAgentInput {
  id: string;
  label: string;
  icon: string;
  startCommand: string;
  resumeTemplate: string;
  skillRoot: string;
  sortOrder: number;
}

export interface UpdateCustomAgentInput {
  label?: string;
  icon?: string;
  startCommand?: string;
  resumeTemplate?: string;
  skillRoot?: string;
  sortOrder?: number;
}

interface CustomAgentRow {
  id: string;
  label: string;
  icon: string;
  start_command: string;
  resume_template: string;
  skill_root: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function rowToCustomAgent(row: CustomAgentRow): CustomAgent {
  return {
    id: row.id,
    label: row.label,
    icon: row.icon,
    startCommand: row.start_command,
    resumeTemplate: row.resume_template,
    skillRoot: row.skill_root,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CustomAgentStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS custom_agents (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        icon TEXT NOT NULL,
        start_command TEXT NOT NULL,
        resume_template TEXT NOT NULL DEFAULT '',
        skill_root TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  list(): CustomAgent[] {
    const rows = this.db.all<CustomAgentRow>(
      sql`SELECT * FROM custom_agents ORDER BY sort_order ASC, created_at ASC`
    );
    return rows.map(rowToCustomAgent);
  }

  create(input: CreateCustomAgentInput): CustomAgent {
    const now = new Date().toISOString();
    this.db.run(sql`
      INSERT INTO custom_agents (id, label, icon, start_command, resume_template, skill_root, sort_order, created_at, updated_at)
      VALUES (${input.id}, ${input.label}, ${input.icon}, ${input.startCommand}, ${input.resumeTemplate}, ${input.skillRoot}, ${input.sortOrder}, ${now}, ${now})
    `);
    const row = this.db.get<CustomAgentRow>(
      sql`SELECT * FROM custom_agents WHERE id = ${input.id}`
    );
    if (!row) throw new Error(`CustomAgent ${input.id} not found after insert`);
    return rowToCustomAgent(row);
  }

  update(id: string, input: UpdateCustomAgentInput): CustomAgent {
    const now = new Date().toISOString();
    if (input.label !== undefined) {
      this.db.run(sql`UPDATE custom_agents SET label = ${input.label}, updated_at = ${now} WHERE id = ${id}`);
    }
    if (input.icon !== undefined) {
      this.db.run(sql`UPDATE custom_agents SET icon = ${input.icon}, updated_at = ${now} WHERE id = ${id}`);
    }
    if (input.startCommand !== undefined) {
      this.db.run(sql`UPDATE custom_agents SET start_command = ${input.startCommand}, updated_at = ${now} WHERE id = ${id}`);
    }
    if (input.resumeTemplate !== undefined) {
      this.db.run(sql`UPDATE custom_agents SET resume_template = ${input.resumeTemplate}, updated_at = ${now} WHERE id = ${id}`);
    }
    if (input.skillRoot !== undefined) {
      this.db.run(sql`UPDATE custom_agents SET skill_root = ${input.skillRoot}, updated_at = ${now} WHERE id = ${id}`);
    }
    if (input.sortOrder !== undefined) {
      this.db.run(sql`UPDATE custom_agents SET sort_order = ${input.sortOrder}, updated_at = ${now} WHERE id = ${id}`);
    }
    const row = this.db.get<CustomAgentRow>(
      sql`SELECT * FROM custom_agents WHERE id = ${id}`
    );
    if (!row) throw new Error(`CustomAgent ${id} not found after update`);
    return rowToCustomAgent(row);
  }

  delete(id: string): void {
    this.db.run(sql`DELETE FROM custom_agents WHERE id = ${id}`);
  }

  getById(id: string): CustomAgent | null {
    const row = this.db.get<CustomAgentRow>(
      sql`SELECT * FROM custom_agents WHERE id = ${id}`
    );
    return row ? rowToCustomAgent(row) : null;
  }
}
```

- [ ] **Step 3: Register `CustomAgentStore` in `WorkspaceStore`**

Open `apps/desktop/electron/storage/WorkspaceStore.ts`. 

Add import at the top:
```ts
import { CustomAgentStore } from "./stores/CustomAgentStore.js";
import type { CustomAgent } from "../../src/shared/domain.js";
```

Add `customAgents` field to the class:
```ts
private readonly customAgents: CustomAgentStore;
```

In the constructor, add after `this.settings = new SettingsStore(db)`:
```ts
this.customAgents = new CustomAgentStore(db);
```

In `migrate()`, add after `this.settings.initialize()`:
```ts
this.customAgents.initialize();
```

Add CRUD delegation methods before the closing `}` of the class:
```ts
listCustomAgents(): CustomAgent[] {
  return this.customAgents.list();
}

createCustomAgent(input: Parameters<CustomAgentStore["create"]>[0]): CustomAgent {
  return this.customAgents.create(input);
}

updateCustomAgent(id: string, input: Parameters<CustomAgentStore["update"]>[1]): CustomAgent {
  return this.customAgents.update(id, input);
}

deleteCustomAgent(id: string): void {
  this.customAgents.delete(id);
}

getCustomAgentById(id: string): CustomAgent | null {
  return this.customAgents.getById(id);
}
```

Update `getSnapshot()` to include custom agents. Add to the return object:
```ts
// In getSnapshot(), change the return to:
return {
  projects,
  threads,
  threadSessions,
  customAgents: this.customAgents.list(),
  activeProjectId: active.activeProjectId,
  activeWorktreePath: active.activeWorktreePath,
  activeThreadId: active.activeThreadId,
};
```

- [ ] **Step 4: Commit**

```bash
git add electron/storage/schema.ts electron/storage/stores/CustomAgentStore.ts electron/storage/WorkspaceStore.ts
git commit -m "feat(custom-agents): add customAgents SQLite table and CustomAgentStore"
```

---

## Task 3: IPC channels + preload parity

**Files:**
- Modify: `apps/desktop/electron/ipcChannels.ts`
- Modify: `apps/desktop/electron/preload.ts`

- [ ] **Step 1: Add custom agent IPC channel keys to `ipcChannels.ts`**

Open `apps/desktop/electron/ipcChannels.ts`. Add inside the `IPC_CHANNELS` object, at the end before `} as const`:

```ts
  customAgentsList: "custom-agents:list",
  customAgentsCreate: "custom-agents:create",
  customAgentsUpdate: "custom-agents:update",
  customAgentsDelete: "custom-agents:delete",
```

- [ ] **Step 2: Add matching string literals to `preload.ts`**

Open `apps/desktop/electron/preload.ts`. Find the inline `IPC_CHANNELS` object (the one duplicated for sandbox reasons) and add the same four entries at the end of that object:

```ts
  customAgentsList: "custom-agents:list",
  customAgentsCreate: "custom-agents:create",
  customAgentsUpdate: "custom-agents:update",
  customAgentsDelete: "custom-agents:delete",
```

Also add the renderer-facing API methods to the `contextBridge.exposeInMainWorld` call. Find the object being exposed (look for `workspaceApi` or the main exposed object) and add four methods alongside the existing ones:

```ts
customAgentsList: () => ipcRenderer.invoke(IPC_CHANNELS.customAgentsList),
customAgentsCreate: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.customAgentsCreate, input),
customAgentsUpdate: (id: string, input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.customAgentsUpdate, id, input),
customAgentsDelete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.customAgentsDelete, id),
```

- [ ] **Step 3: Run the parity test to verify**

```bash
cd apps/desktop
npx vitest run electron/__tests__/preloadIpcChannelsParity.test.ts
```

Expected: all tests pass (all new channel strings appear in preload).

- [ ] **Step 4: Commit**

```bash
git add electron/ipcChannels.ts electron/preload.ts
git commit -m "feat(custom-agents): add custom-agents IPC channel keys and preload bindings"
```

---

## Task 4: Update shared IPC types + WorkspaceSnapshot

**Files:**
- Modify: `apps/desktop/src/shared/ipc.ts`

- [ ] **Step 1: Add `CustomAgent` to snapshot and add CRUD input types**

Open `apps/desktop/src/shared/ipc.ts`. 

Add `CustomAgent` to the imports at the top:
```ts
import type { Project, Thread, ThreadSession, ThreadAgent, CustomAgent } from "./domain";
```

Re-export `CustomAgent` for consumers:
```ts
export type { CustomAgent } from "./domain";
```

Update `WorkspaceSnapshot` to include the new field:
```ts
export interface WorkspaceSnapshot {
  projects: Project[];
  threads: Thread[];
  threadSessions: ThreadSession[];
  customAgents: CustomAgent[];          // ← add this
  activeProjectId: string | null;
  activeWorktreePath: string | null;
  activeThreadId: string | null;
}
```

Add CRUD input types at the bottom of the file:
```ts
export interface CreateCustomAgentInput {
  label: string;
  icon: string;
  startCommand: string;
  resumeTemplate: string;
  skillRoot: string;
}

export interface UpdateCustomAgentInput {
  label?: string;
  icon?: string;
  startCommand?: string;
  resumeTemplate?: string;
  skillRoot?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "feat(custom-agents): add customAgents to WorkspaceSnapshot and CRUD input types"
```

---

## Task 5: Electron IPC handlers in `mainApp.ts`

**Files:**
- Modify: `apps/desktop/electron/mainApp.ts`

- [ ] **Step 1: Import new input types**

Open `apps/desktop/electron/mainApp.ts`. Add `CreateCustomAgentInput` and `UpdateCustomAgentInput` to the IPC import block at the top:

```ts
import {
  IPC_CHANNELS,
  type AddProjectInput,
  type AppUpdateAvailability,
  type CreateWorktreeGroupInput,
  type CreateThreadInput,
  type CreateCustomAgentInput,
  type UpdateCustomAgentInput,
  // ... existing imports
} from "../src/shared/ipc.js";
```

- [ ] **Step 2: Register the four IPC handlers**

Find where other `ipcMain.handle` calls are registered (search for `ipcMain.handle(IPC_CHANNELS.workspace`). Add the four new handlers immediately after the GitHub PR settings handlers:

```ts
ipcMain.handle(IPC_CHANNELS.customAgentsList, () => {
  return store.listCustomAgents();
});

ipcMain.handle(IPC_CHANNELS.customAgentsCreate, (_event, input: CreateCustomAgentInput) => {
  const slug = input.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const id = `custom:${slug}`;
  const existing = store.getCustomAgentById(id);
  if (existing) {
    throw new Error(`An agent with id "${id}" already exists. Choose a different label.`);
  }
  return store.createCustomAgent({
    id,
    label: input.label,
    icon: input.icon,
    startCommand: input.startCommand,
    resumeTemplate: input.resumeTemplate,
    skillRoot: input.skillRoot,
    sortOrder: store.listCustomAgents().length,
  });
});

ipcMain.handle(IPC_CHANNELS.customAgentsUpdate, (_event, id: string, input: UpdateCustomAgentInput) => {
  return store.updateCustomAgent(id, input);
});

ipcMain.handle(IPC_CHANNELS.customAgentsDelete, (_event, id: string) => {
  store.deleteCustomAgent(id);
  return null;
});
```

Note: `store` here is the `WorkspaceStore` instance — verify the variable name used for it in your `mainApp.ts` setup (it may be called `workspaceStore` or `store`).

- [ ] **Step 3: Commit**

```bash
git add electron/mainApp.ts
git commit -m "feat(custom-agents): register customAgents CRUD IPC handlers in mainApp"
```

---

## Task 6: Frontend service + AppContext

**Files:**
- Create: `apps/desktop/src/app-context/customAgentService.ts`
- Modify: `apps/desktop/src/app-context/type.ts`
- Modify: `apps/desktop/src/app-context/AppContext.vue`

- [ ] **Step 1: Create `customAgentService.ts`**

Create `apps/desktop/src/app-context/customAgentService.ts`:

```ts
import type { CustomAgent, CreateCustomAgentInput, UpdateCustomAgentInput } from "@shared/ipc";

type CustomAgentApi = {
  customAgentsList: () => Promise<CustomAgent[]>;
  customAgentsCreate: (input: CreateCustomAgentInput) => Promise<CustomAgent>;
  customAgentsUpdate: (id: string, input: UpdateCustomAgentInput) => Promise<CustomAgent>;
  customAgentsDelete: (id: string) => Promise<void>;
};

function readApi(): CustomAgentApi | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as typeof globalThis & { workspaceApi?: CustomAgentApi }).workspaceApi as CustomAgentApi | undefined;
}

export class CustomAgentService {
  async list(): Promise<CustomAgent[]> {
    const api = readApi();
    if (!api) return [];
    return api.customAgentsList();
  }

  async create(input: CreateCustomAgentInput): Promise<CustomAgent> {
    const api = readApi();
    if (!api) throw new Error("customAgentApi not available");
    return api.customAgentsCreate(input);
  }

  async update(id: string, input: UpdateCustomAgentInput): Promise<CustomAgent> {
    const api = readApi();
    if (!api) throw new Error("customAgentApi not available");
    return api.customAgentsUpdate(id, input);
  }

  async delete(id: string): Promise<void> {
    const api = readApi();
    if (!api) throw new Error("customAgentApi not available");
    return api.customAgentsDelete(id);
  }
}
```

- [ ] **Step 2: Add `customAgentService` to `AppContext` type**

Open `apps/desktop/src/app-context/type.ts`. Add the import and the field:

```ts
import type { CustomAgentService } from "./customAgentService";

export type AppContext = {
  mode: AppMode;
  threadManagementService: ThreadManagementService;
  gitService: GitService;
  workspaceService: WorkspaceService;
  notificationService: NotificationService;
  fileService: FileService;
  customAgentService: CustomAgentService;  // ← add
};
```

- [ ] **Step 3: Provide `customAgentService` in `AppContext.vue`**

Open `apps/desktop/src/app-context/AppContext.vue`. Find where the context value is assembled (where `mode`, `workspaceService`, etc. are assigned) and add:

```ts
import { CustomAgentService } from "./customAgentService";

// Inside setup, alongside the other service instantiations:
const customAgentService = new CustomAgentService();

// In the context object passed to provide():
customAgentService,
```

- [ ] **Step 4: Commit**

```bash
git add src/app-context/customAgentService.ts src/app-context/type.ts src/app-context/AppContext.vue
git commit -m "feat(custom-agents): add CustomAgentService and wire into AppContext"
```

---

## Task 7: Extend `AgentIcon.vue` for custom agents

**Files:**
- Modify: `apps/desktop/src/components/ui/AgentIcon.vue`

- [ ] **Step 1: Update `AgentIcon.vue` to render emoji or URL icons for custom agents**

Open `apps/desktop/src/components/ui/AgentIcon.vue`. Replace the entire file content with:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ThreadAgent } from "@shared/domain";
import { isBuiltInAgent } from "@shared/domain";
import claudeSymbolSvg from "@/assets/claude-ai-symbol.svg?raw";

function pathDFromSvg(svg: string): string {
  const m = svg.match(/\sd="([^"]+)"/);
  if (!m?.[1]) {
    throw new Error("claude-ai-symbol.svg: expected a single path with d attribute");
  }
  return m[1];
}

const claudePathD = pathDFromSvg(claudeSymbolSvg);

const props = defineProps<{
  agent: ThreadAgent;
  size?: number;
  /** Icon override for custom agents (emoji string or https URL). */
  icon?: string;
}>();

const isCustom = computed(() => !isBuiltInAgent(props.agent));
const isUrl = computed(() => Boolean(props.icon?.startsWith("http")));
const svgViewBox = computed(() => (props.agent === "claude" ? "0 0 1200 1200" : "0 0 24 24"));
const sizeVal = computed(() => props.size ?? 14);
</script>

<template>
  <!-- Custom agent: URL image -->
  <img
    v-if="isCustom && isUrl"
    :src="icon"
    :width="sizeVal"
    :height="sizeVal"
    :style="{ width: `${sizeVal}px`, height: `${sizeVal}px`, objectFit: 'contain' }"
    aria-hidden="true"
    alt=""
  />
  <!-- Custom agent: emoji -->
  <span
    v-else-if="isCustom"
    :style="{ fontSize: `${sizeVal}px`, lineHeight: '1', display: 'inline-block' }"
    aria-hidden="true"
  >{{ icon ?? '🤖' }}</span>
  <!-- Built-in agents: SVG paths -->
  <svg
    v-else
    :width="sizeVal"
    :height="sizeVal"
    :viewBox="svgViewBox"
    fill="currentColor"
    aria-hidden="true"
  >
    <path v-if="agent === 'claude'" :d="claudePathD" />
    <path
      v-else-if="agent === 'codex'"
      d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
    />
    <path
      v-else-if="agent === 'cursor'"
      d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0-.42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"
    />
    <path
      v-else-if="agent === 'gemini'"
      d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
    />
  </svg>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/AgentIcon.vue
git commit -m "feat(custom-agents): extend AgentIcon to render emoji/URL icons for custom agents"
```

---

## Task 8: Update bootstrap + skill root hooks

**Files:**
- Modify: `apps/desktop/src/modules/agent/hooks/useAgentBootstrapCommands.ts`
- Modify: `apps/desktop/src/modules/agent/hooks/useAgentSkillRoots.ts`

- [ ] **Step 1: Update `useAgentBootstrapCommands` to accept custom agents list**

Open `apps/desktop/src/modules/agent/hooks/useAgentBootstrapCommands.ts`. Replace the entire file:

```ts
import { ref } from "vue";
import type { ThreadAgent, CustomAgent } from "@shared/domain";
import { isBuiltInAgent } from "@shared/domain";
import { threadBootstrapCommandLine } from "@shared/threadBootstrapCommandLine";
import { THREAD_AGENT_BOOTSTRAP_COMMAND } from "@shared/threadAgentBootstrap";

const STORAGE_KEY = "instrument.agentBootstrapCommands";

function mergeWithDefaults(
  stored: Partial<Record<string, string>> | null
): Record<string, string> {
  return {
    claude: stored?.claude ?? THREAD_AGENT_BOOTSTRAP_COMMAND.claude,
    codex: stored?.codex ?? THREAD_AGENT_BOOTSTRAP_COMMAND.codex,
    gemini: stored?.gemini ?? THREAD_AGENT_BOOTSTRAP_COMMAND.gemini,
    cursor: stored?.cursor ?? THREAD_AGENT_BOOTSTRAP_COMMAND.cursor,
  };
}

export function readStoredAgentCommands(): Record<string, string> {
  if (typeof localStorage === "undefined") return mergeWithDefaults(null);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return mergeWithDefaults(null);
    return mergeWithDefaults(JSON.parse(raw) as Partial<Record<string, string>>);
  } catch {
    return mergeWithDefaults(null);
  }
}

export function writeStoredAgentCommands(cmd: Record<string, string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cmd));
}

export function clearStoredAgentCommands(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Effective per-agent PTY bootstrap lines (defaults + optional localStorage overrides).
 * Pass `customAgents` so custom agent start commands can be resolved.
 */
export function useAgentBootstrapCommands(customAgents: CustomAgent[] = []) {
  const commands = ref<Record<string, string>>(readStoredAgentCommands());

  function persist(): void {
    writeStoredAgentCommands(commands.value);
  }

  function resetToAppDefaults(): void {
    clearStoredAgentCommands();
    commands.value = { ...THREAD_AGENT_BOOTSTRAP_COMMAND };
  }

  function bootstrapCommandFor(agent: ThreadAgent): string {
    if (isBuiltInAgent(agent)) return commands.value[agent] ?? agent;
    return customAgents.find((a) => a.id === agent)?.startCommand ?? agent;
  }

  function bootstrapCommandLineWithPrompt(agent: ThreadAgent, prompt: string): string {
    return threadBootstrapCommandLine(bootstrapCommandFor(agent), prompt);
  }

  function applySaved(next: Record<string, string>): void {
    commands.value = { ...next };
    persist();
  }

  return {
    commands,
    persist,
    resetToAppDefaults,
    bootstrapCommandFor,
    bootstrapCommandLineWithPrompt,
    applySaved,
  };
}
```

- [ ] **Step 2: Update `useAgentSkillRoots` to include custom agents**

Open `apps/desktop/src/modules/agent/hooks/useAgentSkillRoots.ts`. The hook currently uses `Record<ThreadAgent, string>`. Update the return type and `applySaved` to use `Record<string, string>` so custom agent skill roots can be stored:

```ts
import { ref } from "vue";
import type { ThreadAgent, CustomAgent } from "@shared/domain";
import { isBuiltInAgent } from "@shared/domain";
import { THREAD_AGENT_SKILL_ROOT_DEFAULT } from "@shared/threadAgentSkillRoots";

const STORAGE_KEY = "instrument.agentSkillRoots";

function mergeWithDefaults(
  stored: Partial<Record<string, string>> | null
): Record<string, string> {
  if (!stored) return { ...THREAD_AGENT_SKILL_ROOT_DEFAULT };
  const pick = (k: string): string => {
    if (!(k in stored) || stored[k] === undefined) {
      return (THREAD_AGENT_SKILL_ROOT_DEFAULT as Record<string, string>)[k] ?? "";
    }
    return String(stored[k]).trim();
  };
  return {
    claude: pick("claude"),
    codex: pick("codex"),
    gemini: pick("gemini"),
    cursor: pick("cursor"),
  };
}

export function expandUserSkillRoot(configured: string, homeDir: string | null): string | null {
  const raw = configured.trim();
  if (!raw) return null;
  const norm = raw.replace(/\\/g, "/");
  if (norm.startsWith("~/")) {
    if (!homeDir) return null;
    return `${homeDir}/${norm.slice(2)}`;
  }
  if (norm === "~") return homeDir;
  return norm;
}

export function readStoredAgentSkillRoots(): Record<string, string> {
  if (typeof localStorage === "undefined") return mergeWithDefaults(null);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return mergeWithDefaults(null);
    return mergeWithDefaults(JSON.parse(raw) as Partial<Record<string, string>>);
  } catch {
    return mergeWithDefaults(null);
  }
}

export function writeStoredAgentSkillRoots(roots: Record<string, string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roots));
}

export function clearStoredAgentSkillRoots(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function useAgentSkillRoots(customAgents: CustomAgent[] = []) {
  const skillRoots = ref<Record<string, string>>(readStoredAgentSkillRoots());

  function persist(): void {
    writeStoredAgentSkillRoots(skillRoots.value);
  }

  function resetToAppDefaults(): void {
    clearStoredAgentSkillRoots();
    skillRoots.value = { ...THREAD_AGENT_SKILL_ROOT_DEFAULT };
  }

  function skillRootFor(agent: ThreadAgent): string {
    if (isBuiltInAgent(agent)) return skillRoots.value[agent] ?? "";
    return customAgents.find((a) => a.id === agent)?.skillRoot ?? "";
  }

  function applySaved(next: Record<string, string>): void {
    skillRoots.value = { ...next };
    persist();
  }

  return { skillRoots, persist, resetToAppDefaults, skillRootFor, applySaved };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/agent/hooks/useAgentBootstrapCommands.ts src/modules/agent/hooks/useAgentSkillRoots.ts
git commit -m "feat(custom-agents): update bootstrap and skill root hooks to resolve custom agents"
```

---

## Task 9: Settings UI — custom agent CRUD in `AgentCommandsSettingsDialog.vue` and `SettingsPage.vue`

**Files:**
- Modify: `apps/desktop/src/modules/agent/components/AgentCommandsSettingsDialog.vue`
- Modify: `apps/desktop/src/modules/settings/pages/SettingsPage.vue`

- [ ] **Step 1: Add custom agent CRUD state and methods to dialog `<script setup>`**

Open `apps/desktop/src/modules/agent/components/AgentCommandsSettingsDialog.vue`.

Add new props and emits alongside the existing ones:

```ts
const props = defineProps<{
  commands: Record<string, string>;
  skillRoots: Record<string, string>;
  customAgents: CustomAgent[];       // ← new
}>();

const emit = defineEmits<{
  save: [payload: { commands: Record<string, string>; skillRoots: Record<string, string> }];
  createCustomAgent: [input: CreateCustomAgentInput];    // ← new
  updateCustomAgent: [id: string, input: UpdateCustomAgentInput]; // ← new
  deleteCustomAgent: [id: string];                       // ← new
}>();
```

Add imports for the new types:
```ts
import type { CustomAgent } from "@shared/domain";
import type { CreateCustomAgentInput, UpdateCustomAgentInput } from "@shared/ipc";
import { Pencil, Trash2, PlusCircle } from "lucide-vue-next";
```

Add inline-form state below the existing `draft` refs:

```ts
interface CustomAgentDraft {
  id: string | null; // null = creating new
  label: string;
  icon: string;
  startCommand: string;
  resumeTemplate: string;
  skillRoot: string;
  iconMode: "emoji" | "url";
}

const emptyDraft = (): CustomAgentDraft => ({
  id: null, label: "", icon: "🤖", startCommand: "", resumeTemplate: "", skillRoot: "", iconMode: "emoji",
});

const showCustomAgentForm = ref(false);
const customAgentDraft = ref<CustomAgentDraft>(emptyDraft());
const customAgentFormErrors = ref<Partial<Record<keyof CustomAgentDraft, string>>>({});

function openAddForm(): void {
  customAgentDraft.value = emptyDraft();
  customAgentFormErrors.value = {};
  showCustomAgentForm.value = true;
}

function openEditForm(agent: CustomAgent): void {
  customAgentDraft.value = {
    id: agent.id,
    label: agent.label,
    icon: agent.icon,
    startCommand: agent.startCommand,
    resumeTemplate: agent.resumeTemplate,
    skillRoot: agent.skillRoot,
    iconMode: agent.icon.startsWith("http") ? "url" : "emoji",
  };
  customAgentFormErrors.value = {};
  showCustomAgentForm.value = true;
}

function closeCustomAgentForm(): void {
  showCustomAgentForm.value = false;
  customAgentDraft.value = emptyDraft();
  customAgentFormErrors.value = {};
}

function validateCustomAgentDraft(): boolean {
  const errs: Partial<Record<keyof CustomAgentDraft, string>> = {};
  if (!customAgentDraft.value.label.trim()) errs.label = "Label is required.";
  if (!customAgentDraft.value.startCommand.trim()) errs.startCommand = "Start command is required.";
  if (customAgentDraft.value.resumeTemplate.trim() && !customAgentDraft.value.resumeTemplate.includes("{resumeId}")) {
    errs.resumeTemplate = "Must contain {resumeId} placeholder, or leave empty to disable resume.";
  }
  if (!customAgentDraft.value.icon.trim()) errs.icon = "Icon is required.";
  customAgentFormErrors.value = errs;
  return Object.keys(errs).length === 0;
}

function saveCustomAgentForm(): void {
  if (!validateCustomAgentDraft()) return;
  const d = customAgentDraft.value;
  const input: CreateCustomAgentInput = {
    label: d.label.trim(),
    icon: d.icon.trim(),
    startCommand: d.startCommand.trim(),
    resumeTemplate: d.resumeTemplate.trim(),
    skillRoot: d.skillRoot.trim(),
  };
  if (d.id) {
    emit("updateCustomAgent", d.id, input);
  } else {
    emit("createCustomAgent", input);
  }
  closeCustomAgentForm();
}

function confirmDeleteCustomAgent(agent: CustomAgent): void {
  if (!confirm(`Delete agent "${agent.label}"? Existing threads using this agent will no longer auto-bootstrap.`)) return;
  emit("deleteCustomAgent", agent.id);
}
```

- [ ] **Step 2: Add custom agents section to template**

In the `AgentCommandsSettingsDialog.vue` template, inside the `v-show="activeSection === 'agents'"` div, add the custom agents section after the existing built-in agent cards:

```html
<!-- Custom agents section -->
<div class="mt-6 border-t border-border pt-4">
  <div class="mb-3 flex items-center justify-between">
    <h3 class="text-sm font-medium text-foreground">Custom agents</h3>
    <Button
      v-if="!showCustomAgentForm"
      type="button"
      variant="outline"
      size="sm"
      class="h-7 gap-1.5 px-2 text-xs"
      @click="openAddForm"
    >
      <PlusCircle class="size-3.5" />
      Add agent
    </Button>
  </div>

  <!-- Inline add/edit form -->
  <div
    v-if="showCustomAgentForm"
    class="mb-4 rounded-lg border border-border bg-muted/20 p-4"
  >
    <p class="mb-3 text-sm font-medium text-foreground">
      {{ customAgentDraft.id ? 'Edit agent' : 'New agent' }}
    </p>

    <!-- Icon mode toggle -->
    <div class="mb-3">
      <span class="mb-1 block text-xs font-medium text-muted-foreground">Icon type</span>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded px-2 py-0.5 text-xs"
          :class="customAgentDraft.iconMode === 'emoji' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          @click="customAgentDraft.iconMode = 'emoji'"
        >Emoji</button>
        <button
          type="button"
          class="rounded px-2 py-0.5 text-xs"
          :class="customAgentDraft.iconMode === 'url' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          @click="customAgentDraft.iconMode = 'url'"
        >URL</button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label class="mb-1 block text-xs font-medium text-muted-foreground" for="custom-agent-icon">
          {{ customAgentDraft.iconMode === 'emoji' ? 'Emoji' : 'Icon URL' }}
        </label>
        <input
          id="custom-agent-icon"
          v-model="customAgentDraft.icon"
          type="text"
          :placeholder="customAgentDraft.iconMode === 'emoji' ? '🤖' : 'https://...'"
          class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          autocomplete="off"
        />
        <p v-if="customAgentFormErrors.icon" class="mt-1 text-xs text-destructive">{{ customAgentFormErrors.icon }}</p>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-muted-foreground" for="custom-agent-label">Label</label>
        <input
          id="custom-agent-label"
          v-model="customAgentDraft.label"
          type="text"
          placeholder="Aider"
          class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          autocomplete="off"
        />
        <p v-if="customAgentFormErrors.label" class="mt-1 text-xs text-destructive">{{ customAgentFormErrors.label }}</p>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-muted-foreground" for="custom-agent-cmd">Start command</label>
        <input
          id="custom-agent-cmd"
          v-model="customAgentDraft.startCommand"
          type="text"
          placeholder="aider"
          class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-[13px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          autocomplete="off"
          spellcheck="false"
        />
        <p v-if="customAgentFormErrors.startCommand" class="mt-1 text-xs text-destructive">{{ customAgentFormErrors.startCommand }}</p>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-muted-foreground" for="custom-agent-resume">
          Resume template <span class="font-normal opacity-60">(optional)</span>
        </label>
        <input
          id="custom-agent-resume"
          v-model="customAgentDraft.resumeTemplate"
          type="text"
          placeholder="aider --resume {resumeId}"
          class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-[13px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          autocomplete="off"
          spellcheck="false"
        />
        <p v-if="customAgentFormErrors.resumeTemplate" class="mt-1 text-xs text-destructive">{{ customAgentFormErrors.resumeTemplate }}</p>
        <p class="mt-1 text-[11px] text-muted-foreground">Leave empty to disable resume for this agent.</p>
      </div>
      <div class="sm:col-span-2">
        <label class="mb-1 block text-xs font-medium text-muted-foreground" for="custom-agent-skill-root">Skills directory</label>
        <input
          id="custom-agent-skill-root"
          v-model="customAgentDraft.skillRoot"
          type="text"
          placeholder="~/.claude/skills"
          class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-[13px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <Button type="button" size="sm" @click="saveCustomAgentForm">
        {{ customAgentDraft.id ? 'Save changes' : 'Add agent' }}
      </Button>
      <Button type="button" variant="outline" size="sm" @click="closeCustomAgentForm">Cancel</Button>
    </div>
  </div>

  <!-- Existing custom agents list -->
  <div v-if="customAgents.length === 0 && !showCustomAgentForm" class="text-sm text-muted-foreground">
    No custom agents yet.
  </div>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div
      v-for="agent in customAgents"
      :key="agent.id"
      class="flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-muted/25 p-3"
    >
      <div class="flex items-center justify-between">
        <span class="flex items-center gap-2 text-sm font-medium text-foreground">
          <AgentIcon :agent="agent.id" :icon="agent.icon" :size="18" class="shrink-0 opacity-90" />
          {{ agent.label }}
        </span>
        <div class="flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" class="h-6 w-6" @click="openEditForm(agent)">
            <Pencil class="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" class="h-6 w-6 text-destructive hover:text-destructive" @click="confirmDeleteCustomAgent(agent)">
            <Trash2 class="size-3.5" />
          </Button>
        </div>
      </div>
      <p class="truncate font-mono text-[12px] text-muted-foreground">{{ agent.startCommand }}</p>
      <p v-if="agent.resumeTemplate" class="truncate font-mono text-[11px] text-muted-foreground opacity-70">
        resume: {{ agent.resumeTemplate }}
      </p>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Wire mutations in `SettingsPage.vue`**

Open `apps/desktop/src/modules/settings/pages/SettingsPage.vue`. 

Add imports:
```ts
import { useAppContext } from "@/app-context/useAppContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import type { CreateCustomAgentInput, UpdateCustomAgentInput } from "@shared/ipc";
```

Add custom agent query and mutations in the script setup:
```ts
const appContext = useAppContext();
const queryClient = useQueryClient();

const { data: customAgents } = useQuery({
  queryKey: ["custom-agents"],
  queryFn: () => appContext.value!.customAgentService.list(),
  initialData: [],
});

const createMutation = useMutation({
  mutationFn: (input: CreateCustomAgentInput) =>
    appContext.value!.customAgentService.create(input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom-agents"] }),
});

const updateMutation = useMutation({
  mutationFn: ({ id, input }: { id: string; input: UpdateCustomAgentInput }) =>
    appContext.value!.customAgentService.update(id, input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom-agents"] }),
});

const deleteMutation = useMutation({
  mutationFn: (id: string) => appContext.value!.customAgentService.delete(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom-agents"] }),
});
```

Update the `AgentCommandsSettingsDialog` usage in the template to pass new props and handle new events:
```html
<AgentCommandsSettingsDialog
  v-model="settingsOpen"
  :commands="agentCmd.commands.value"
  :skill-roots="agentRoots.skillRoots.value"
  :custom-agents="customAgents ?? []"
  @save="handleSave"
  @create-custom-agent="(input) => createMutation.mutate(input)"
  @update-custom-agent="(id, input) => updateMutation.mutate({ id, input })"
  @delete-custom-agent="(id) => deleteMutation.mutate(id)"
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/agent/components/AgentCommandsSettingsDialog.vue src/modules/settings/pages/SettingsPage.vue
git commit -m "feat(custom-agents): add CRUD UI for custom agents in settings dialog"
```

---

## Task 10: Thread creation — merge custom agents into launcher

**Files:**
- Modify: `apps/desktop/src/components/WorkspaceLauncherModal.vue`

- [ ] **Step 1: Load custom agents and merge into agent labels**

Open `apps/desktop/src/components/WorkspaceLauncherModal.vue`.

Add imports at the top of `<script setup>`:
```ts
import { useAppContext } from "@/app-context/useAppContext";
import { useQuery } from "@tanstack/vue-query";
import type { CustomAgent } from "@shared/domain";
```

Add query for custom agents:
```ts
const appContext = useAppContext();
const { data: customAgents } = useQuery({
  queryKey: ["custom-agents"],
  queryFn: () => appContext.value!.customAgentService.list(),
  initialData: [] as CustomAgent[],
});
```

Update `THREAD_AGENT_LABELS` from a static const to a computed Map:
```ts
// Remove the static const:
// const THREAD_AGENT_LABELS: Record<ThreadAgent, string> = { ... }

// Add a computed label lookup:
const agentLabel = computed(() => {
  const builtIn: Record<string, string> = {
    claude: "Claude Code",
    cursor: "Cursor Agent",
    codex: "Codex CLI",
    gemini: "Gemini CLI",
  };
  const custom = Object.fromEntries(
    (customAgents.value ?? []).map((a: CustomAgent) => [a.id, a.label])
  );
  return { ...builtIn, ...custom };
});
```

Replace all `THREAD_AGENT_LABELS[...]` usages in the template with `agentLabel[...]`.

- [ ] **Step 2: Commit**

```bash
git add src/components/WorkspaceLauncherModal.vue
git commit -m "feat(custom-agents): include custom agents in thread launcher agent labels"
```

---

## Task 11: Resume flow — pass resumeTemplate to `AgentPage.vue`

**Files:**
- Modify: `apps/desktop/src/modules/agent/pages/AgentPage.vue`

- [ ] **Step 1: Load custom agents and use resumeTemplate in resume flow**

Open `apps/desktop/src/modules/agent/pages/AgentPage.vue`.

Add imports:
```ts
import { useAppContext } from "@/app-context/useAppContext";
import { useQuery } from "@tanstack/vue-query";
import { isBuiltInAgent } from "@shared/domain";
import type { CustomAgent } from "@shared/domain";
```

Add query for custom agents, alongside the existing composable calls:
```ts
const appContext = useAppContext();
const { data: customAgents } = useQuery({
  queryKey: ["custom-agents"],
  queryFn: () => appContext.value!.customAgentService.list(),
  initialData: [] as CustomAgent[],
});
```

Update the `watch(threadId, ...)` block. Replace the `threadAgentResumeCommandLine` call:

```ts
// Find and replace this section in the watch:
const resumeCmd = threadAgentResumeCommandLine(
  bootstrapCommandFor(thread.agent),
  thread.agent,
  session.resumeId,
);

// Replace with:
const resumeTemplate = isBuiltInAgent(thread.agent)
  ? undefined
  : (customAgents.value ?? []).find((a: CustomAgent) => a.id === thread.agent)?.resumeTemplate;

const resumeCmd = threadAgentResumeCommandLine(
  bootstrapCommandFor(thread.agent),
  thread.agent,
  session.resumeId,
  resumeTemplate,
);
// Empty resumeCmd is already handled by the existing isValidPersistedResumeId guard above
```

Also pass `customAgents.value` to `bootstrapCommandFor`. Since `useAgentBootstrapCommands` now accepts a `customAgents` parameter, update the call:

```ts
// Change:
const { bootstrapCommandFor } = useAgentBootstrapCommands();
// To:
const { bootstrapCommandFor } = useAgentBootstrapCommands(customAgents.value ?? []);
```

Note: since `customAgents` is a ref updated reactively, you may need to watch it or use a getter. Safest approach — pass the array at call time inside the watch:

```ts
// In the watch callback, call bootstrapCommandFor after customAgents is available:
const agents = customAgents.value ?? [];
const { bootstrapCommandFor } = useAgentBootstrapCommands(agents);
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/agent/pages/AgentPage.vue
git commit -m "feat(custom-agents): wire resumeTemplate into AgentPage resume flow"
```

---

## Task 12: Unknown agent fallback label

**Files:**
- Modify: `apps/desktop/src/components/WorkspaceLauncherModal.vue` (already open from Task 10)

This is already handled: `agentLabel[thread.agent]` returns `undefined` for a deleted custom agent. Update any template usage to add a fallback:

```html
{{ agentLabel[thread.agent] ?? 'Unknown agent' }}
```

Search the template for all `THREAD_AGENT_LABELS` / `agentLabel` usages and ensure they all have `?? 'Unknown agent'` fallbacks.

- [ ] **Step 1: Add fallback label everywhere agentLabel is used, commit**

```bash
git add src/components/WorkspaceLauncherModal.vue
git commit -m "feat(custom-agents): add unknown agent fallback label in launcher"
```

---

## Self-Review Checklist

Run through the spec sections:

| Spec requirement | Covered in task |
|-----------------|-----------------|
| `customAgents` SQLite table | Task 2 |
| `BuiltInAgent`, `CustomAgent`, `isBuiltInAgent` in domain | Task 1 |
| `resumeTemplate` param in `threadAgentResumeCommandLine` | Task 1 |
| `CustomAgentStore` CRUD | Task 2 |
| `WorkspaceSnapshot.customAgents` | Task 2 + Task 4 |
| IPC CRUD channels | Task 3 |
| Preload parity | Task 3 |
| Electron IPC handlers | Task 5 |
| `CustomAgentService` in AppContext | Task 6 |
| `AgentIcon` emoji/URL rendering | Task 7 |
| Bootstrap hook resolves custom agents | Task 8 |
| Skill root hook resolves custom agents | Task 8 |
| Settings dialog CRUD UI | Task 9 |
| Inline form validation | Task 9 |
| Custom agents in thread launcher | Task 10 |
| Resume flow with template | Task 11 |
| Unknown agent fallback | Task 12 |
