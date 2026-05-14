# Symphony Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Electron main-process daemon that polls Linear/GitHub, creates threads, starts runs, and handles post-run completion actions — the entire backend for Symphony automation.

**Architecture:** A `SymphonyOrchestrator` service runs inside the Electron main process, instantiated in `mainApp.ts`. It polls the tracker on each `interval_ms` tick, creates threads via `workspaceService.createThread`, starts runs via `runService.start`, and reconciles active runs on each tick. New IPC channels expose config and task state to the renderer.

**Tech Stack:** TypeScript, Node.js fs, `js-yaml` (new dep), existing `better-sqlite3`/drizzle-orm store pattern, existing `WorkspaceService` + `RunService`, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/desktop/electron/symphony/types.ts` | All Symphony domain types (electron-side) |
| Create | `apps/desktop/src/shared/symphony.ts` | Renderer-visible Symphony types (IPC boundary) |
| Create | `apps/desktop/electron/storage/stores/SymphonyConfigStore.ts` | SQLite store for per-project tracker credentials |
| Create | `apps/desktop/electron/storage/__tests__/SymphonyConfigStore.test.ts` | Store tests |
| Modify | `apps/desktop/src/shared/domain.ts` | Add `metadataJson` to `Thread` |
| Modify | `apps/desktop/src/shared/ipc.ts` | Add `metadataJson` to `CreateThreadInput`, add Symphony IPC input types |
| Modify | `apps/desktop/electron/storage/stores/ThreadStore.ts` | Persist + return `metadata_json` |
| Modify | `apps/desktop/electron/services/workspaceService.ts` | Pass `metadataJson` through `createThread` |
| Create | `apps/desktop/electron/symphony/workflowReader.ts` | Parse WORKFLOW.md front matter + render prompt template |
| Create | `apps/desktop/electron/symphony/__tests__/workflowReader.test.ts` | WorkflowReader tests |
| Create | `apps/desktop/electron/symphony/adapters/linear.ts` | Linear GraphQL adapter |
| Create | `apps/desktop/electron/symphony/adapters/github.ts` | GitHub Issues REST adapter |
| Create | `apps/desktop/electron/symphony/adapters/__tests__/linear.test.ts` | Linear adapter tests |
| Modify | `apps/desktop/electron/services/runService.ts` | Add `getRunStatus(runId)` method |
| Create | `apps/desktop/electron/symphony/completionHandler.ts` | open_pr / commit / mark_done actions |
| Create | `apps/desktop/electron/symphony/orchestrator.ts` | Polling loop, dispatch, reconcile |
| Create | `apps/desktop/electron/symphony/__tests__/orchestrator.test.ts` | Orchestrator unit tests |
| Modify | `apps/desktop/electron/ipcChannels.ts` | Add symphony IPC channel constants |
| Modify | `apps/desktop/electron/mainApp.ts` | Instantiate orchestrator, register IPC handlers |
| Modify | `apps/desktop/electron/preload.ts` | Expose `symphonyApi` to renderer |

---

## Task 1: Install js-yaml and create symphony types

**Files:**
- Create: `apps/desktop/electron/symphony/types.ts`
- Create: `apps/desktop/src/shared/symphony.ts`

- [ ] **Step 1.1: Install js-yaml**

```bash
cd apps/desktop && pnpm add js-yaml && pnpm add -D @types/js-yaml
```

- [ ] **Step 1.2: Create electron-side types**

Create `apps/desktop/electron/symphony/types.ts`:

```typescript
export interface KanbanColumn {
  label: string;
  state: string;
}

export interface SymphonyConfig {
  tracker: {
    kind: 'linear' | 'github';
    project_slug: string;
    active_states: string[];
    terminal_states: string[];
  };
  polling: { interval_ms: number };
  workspace?: { root?: string };
  hooks?: { after_create?: string; before_remove?: string };
  agent: {
    max_concurrent_agents: number;
    max_turns?: number;
    on_complete: 'open_pr' | 'commit' | 'mark_done';
  };
  codex: {
    command: 'claude' | 'codex' | 'gemini' | 'cursor';
    approval_policy?: string;
  };
  kanban: { columns: KanbanColumn[] };
}

export interface TrackerIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  labels: string[];
  url: string;
}

export interface SymphonyTask {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  issueState: string;
  threadId: string | null;
  runStatus: 'idle' | 'running' | 'done' | 'failed' | 'needsReview' | null;
  startedAt: number | null;
  prUrl: string | null;
  errorHint: string | null;
}

export interface TrackerAdapter {
  fetchEligibleIssues(
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<TrackerIssue[]>;
  transitionIssue(
    issueId: string,
    state: string,
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<void>;
}
```

- [ ] **Step 1.3: Create renderer-visible types**

Create `apps/desktop/src/shared/symphony.ts`:

```typescript
export interface KanbanColumn {
  label: string;
  state: string;
}

export type SymphonyRunStatus =
  | 'idle'
  | 'running'
  | 'done'
  | 'failed'
  | 'needsReview'
  | null;

export interface SymphonyTask {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  issueState: string;
  threadId: string | null;
  runStatus: SymphonyRunStatus;
  startedAt: number | null;
  prUrl: string | null;
  errorHint: string | null;
}

export interface SymphonyTasksSnapshot {
  tasks: SymphonyTask[];
  columns: KanbanColumn[];
  trackerError: string | null;
  enabled: boolean;
}

export interface SymphonySetConfigInput {
  projectId: string;
  trackerKind: 'linear' | 'github';
  apiKey: string;
  projectSlug: string;
}

export interface SymphonyStoredConfig {
  projectId: string;
  trackerKind: 'linear' | 'github';
  apiKey: string;
  projectSlug: string;
}
```

- [ ] **Step 1.4: Commit**

```bash
git add apps/desktop/electron/symphony/types.ts apps/desktop/src/shared/symphony.ts apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "feat(symphony): add symphony types and install js-yaml"
```

---

## Task 2: SymphonyConfigStore

**Files:**
- Create: `apps/desktop/electron/storage/stores/SymphonyConfigStore.ts`
- Create: `apps/desktop/electron/storage/__tests__/SymphonyConfigStore.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `apps/desktop/electron/storage/__tests__/SymphonyConfigStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { SymphonyConfigStore } from '../stores/SymphonyConfigStore.js';

function makeStore(): SymphonyConfigStore {
  const client = new Database(':memory:');
  const db = drizzle(client);
  const store = new SymphonyConfigStore(db as any);
  store.initialize();
  return store;
}

describe('SymphonyConfigStore', () => {
  let store: SymphonyConfigStore;
  beforeEach(() => { store = makeStore(); });

  it('returns null for unknown project', () => {
    expect(store.get('proj-1')).toBeNull();
  });

  it('upserts and retrieves config', () => {
    store.upsert({ projectId: 'proj-1', trackerKind: 'linear', apiKey: 'key-abc', projectSlug: 'my-team/my-proj' });
    const cfg = store.get('proj-1');
    expect(cfg).not.toBeNull();
    expect(cfg!.trackerKind).toBe('linear');
    expect(cfg!.apiKey).toBe('key-abc');
    expect(cfg!.projectSlug).toBe('my-team/my-proj');
  });

  it('updates existing config on second upsert', () => {
    store.upsert({ projectId: 'proj-1', trackerKind: 'linear', apiKey: 'old', projectSlug: 'slug' });
    store.upsert({ projectId: 'proj-1', trackerKind: 'github', apiKey: 'new', projectSlug: 'owner/repo' });
    const cfg = store.get('proj-1');
    expect(cfg!.trackerKind).toBe('github');
    expect(cfg!.apiKey).toBe('new');
  });

  it('deletes config', () => {
    store.upsert({ projectId: 'proj-1', trackerKind: 'linear', apiKey: 'k', projectSlug: 's' });
    store.delete('proj-1');
    expect(store.get('proj-1')).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run test — expect failure**

```bash
cd apps/desktop && pnpm test -- SymphonyConfigStore
```

Expected: `Cannot find module '../stores/SymphonyConfigStore.js'`

- [ ] **Step 2.3: Implement the store**

Create `apps/desktop/electron/storage/stores/SymphonyConfigStore.ts`:

```typescript
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../db.js';

export interface SymphonyProjectConfig {
  projectId: string;
  trackerKind: 'linear' | 'github';
  apiKey: string;
  projectSlug: string;
  createdAt: string;
  updatedAt: string;
}

export class SymphonyConfigStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS project_symphony_config (
        project_id TEXT PRIMARY KEY,
        tracker_kind TEXT NOT NULL,
        api_key TEXT NOT NULL,
        project_slug TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  get(projectId: string): SymphonyProjectConfig | null {
    const row = this.db.get<{
      projectId: string;
      trackerKind: string;
      apiKey: string;
      projectSlug: string;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        project_id AS projectId,
        tracker_kind AS trackerKind,
        api_key AS apiKey,
        project_slug AS projectSlug,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM project_symphony_config
      WHERE project_id = ${projectId}
    `);
    if (!row) return null;
    return {
      projectId: row.projectId,
      trackerKind: row.trackerKind as 'linear' | 'github',
      apiKey: row.apiKey,
      projectSlug: row.projectSlug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  upsert(config: Omit<SymphonyProjectConfig, 'createdAt' | 'updatedAt'>): void {
    const now = new Date().toISOString();
    this.db.run(sql`
      INSERT INTO project_symphony_config
        (project_id, tracker_kind, api_key, project_slug, created_at, updated_at)
      VALUES
        (${config.projectId}, ${config.trackerKind}, ${config.apiKey}, ${config.projectSlug}, ${now}, ${now})
      ON CONFLICT(project_id) DO UPDATE SET
        tracker_kind = excluded.tracker_kind,
        api_key      = excluded.api_key,
        project_slug = excluded.project_slug,
        updated_at   = excluded.updated_at
    `);
  }

  delete(projectId: string): void {
    this.db.run(sql`DELETE FROM project_symphony_config WHERE project_id = ${projectId}`);
  }
}
```

- [ ] **Step 2.4: Run tests — expect pass**

```bash
cd apps/desktop && pnpm test -- SymphonyConfigStore
```

Expected: all 4 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add apps/desktop/electron/storage/stores/SymphonyConfigStore.ts apps/desktop/electron/storage/__tests__/SymphonyConfigStore.test.ts
git commit -m "feat(symphony): add SymphonyConfigStore"
```

---

## Task 3: Extend Thread with metadataJson

The `threads` table already has a `metadata_json TEXT` column (added in a prior migration) but the TypeScript layer ignores it. This task wires it end-to-end.

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/electron/storage/stores/ThreadStore.ts`
- Modify: `apps/desktop/electron/services/workspaceService.ts`

- [ ] **Step 3.1: Add `metadataJson` to Thread interface**

In `apps/desktop/src/shared/domain.ts`, find the `Thread` interface and add the field after `resumeId`:

```typescript
export interface Thread {
  id: string;
  projectId: string;
  worktreePath: string;
  title: string;
  agent: ThreadAgent;
  createdBranch: string | null;
  resumeId: string | null;
  metadataJson: string | null;   // ← add this line
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 3.2: Add `metadataJson` to CreateThreadInput**

In `apps/desktop/src/shared/ipc.ts`, find `CreateThreadInput` and add the optional field:

```typescript
export interface CreateThreadInput {
  projectId: string;
  worktreePath: string;
  title: string;
  agent: ThreadAgent;
  metadataJson?: string | null;   // ← add this line
}
```

- [ ] **Step 3.3: Update ThreadStore.upsertThread to persist metadata_json**

In `apps/desktop/electron/storage/stores/ThreadStore.ts`, update `upsertThread` to include `metadata_json`:

```typescript
upsertThread(thread: Thread): void {
  this.db.run(sql`
    INSERT INTO threads (
      id, project_id, worktree_path, title, agent,
      created_branch, resume_id, metadata_json, created_at, updated_at
    )
    VALUES (
      ${thread.id},
      ${thread.projectId},
      ${thread.worktreePath},
      ${thread.title},
      ${thread.agent},
      ${thread.createdBranch ?? null},
      ${thread.resumeId ?? null},
      ${thread.metadataJson ?? null},
      ${thread.createdAt},
      ${thread.updatedAt}
    )
    ON CONFLICT(id) DO UPDATE SET
      project_id    = excluded.project_id,
      worktree_path = excluded.worktree_path,
      title         = excluded.title,
      agent         = excluded.agent,
      created_branch = excluded.created_branch,
      resume_id     = excluded.resume_id,
      metadata_json = excluded.metadata_json,
      updated_at    = excluded.updated_at
  `);
}
```

- [ ] **Step 3.4: Update all ThreadStore SELECT queries to return metadata_json**

Find every `SELECT` in `ThreadStore.ts` that returns thread rows (there are 3: `getThread`, `listAll`, `listByWorktreePath` — or similar names). Each one must add `metadata_json AS metadataJson` to the column list and `metadataJson: r.metadataJson` to the mapping object.

For `getThread` the shape row type gains `metadataJson: string | null` and the SELECT gains:
```sql
metadata_json AS metadataJson,
```
And the return object gains:
```typescript
metadataJson: row.metadataJson,
```

Repeat this pattern for every SELECT method that returns a `Thread` object in `ThreadStore.ts`.

- [ ] **Step 3.5: Pass metadataJson through workspaceService.createThread**

Open `apps/desktop/electron/services/workspaceService.ts`. Find `createThread` at line ~120. Update it to pass `input.metadataJson ?? null` when building the `Thread` object to call `store.upsertThread(thread)`.

The constructed `thread` object should gain:
```typescript
metadataJson: input.metadataJson ?? null,
```

- [ ] **Step 3.6: Run type check**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: no new errors. Fix any TS errors caused by the new required `metadataJson` field (add `metadataJson: null` to any test fixtures that construct `Thread` objects).

- [ ] **Step 3.7: Commit**

```bash
git add apps/desktop/src/shared/domain.ts apps/desktop/src/shared/ipc.ts apps/desktop/electron/storage/stores/ThreadStore.ts apps/desktop/electron/services/workspaceService.ts
git commit -m "feat(symphony): add metadataJson to Thread for symphony source tagging"
```

---

## Task 4: WorkflowReader

**Files:**
- Create: `apps/desktop/electron/symphony/workflowReader.ts`
- Create: `apps/desktop/electron/symphony/__tests__/workflowReader.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `apps/desktop/electron/symphony/__tests__/workflowReader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readWorkflowConfig, renderPromptTemplate } from '../workflowReader.js';
import type { TrackerIssue } from '../types.js';

const SAMPLE_WORKFLOW = `---
tracker:
  kind: linear
  project_slug: my-team/my-proj
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Cancelled

polling:
  interval_ms: 60000

agent:
  max_concurrent_agents: 3
  on_complete: open_pr

codex:
  command: claude

kanban:
  columns:
    - label: "Todo"
      state: "Todo"
    - label: "In Progress"
      state: "In Progress"
    - label: "Done"
      state: "Done"
---

You are working on {{ issue.identifier }}: {{ issue.title }}

{% if attempt %}
Retry attempt #{{ attempt }}.
{% endif %}

Description:
{{ issue.description }}
`;

const SAMPLE_ISSUE: TrackerIssue = {
  id: 'abc-123',
  identifier: 'PROJ-42',
  title: 'Fix login timeout',
  description: 'Users are logged out after 5 minutes.',
  state: 'In Progress',
  labels: ['bug', 'auth'],
  url: 'https://linear.app/my-team/issue/PROJ-42',
};

let tmpDir: string;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

describe('readWorkflowConfig', () => {
  it('returns null when WORKFLOW.md is absent', () => {
    expect(readWorkflowConfig(tmpDir)).toBeNull();
  });

  it('returns null when front matter is missing', () => {
    fs.writeFileSync(path.join(tmpDir, 'WORKFLOW.md'), 'no front matter here');
    expect(readWorkflowConfig(tmpDir)).toBeNull();
  });

  it('parses valid WORKFLOW.md front matter', () => {
    fs.writeFileSync(path.join(tmpDir, 'WORKFLOW.md'), SAMPLE_WORKFLOW);
    const cfg = readWorkflowConfig(tmpDir);
    expect(cfg).not.toBeNull();
    expect(cfg!.tracker.kind).toBe('linear');
    expect(cfg!.tracker.project_slug).toBe('my-team/my-proj');
    expect(cfg!.tracker.active_states).toEqual(['Todo', 'In Progress']);
    expect(cfg!.agent.max_concurrent_agents).toBe(3);
    expect(cfg!.agent.on_complete).toBe('open_pr');
    expect(cfg!.kanban.columns).toHaveLength(3);
  });

  it('reads raw WORKFLOW.md content for template rendering', () => {
    fs.writeFileSync(path.join(tmpDir, 'WORKFLOW.md'), SAMPLE_WORKFLOW);
    const cfg = readWorkflowConfig(tmpDir);
    expect(cfg).not.toBeNull();
  });
});

describe('renderPromptTemplate', () => {
  it('substitutes issue variables', () => {
    const result = renderPromptTemplate(SAMPLE_WORKFLOW, SAMPLE_ISSUE, 0);
    expect(result).toContain('PROJ-42');
    expect(result).toContain('Fix login timeout');
    expect(result).toContain('Users are logged out after 5 minutes.');
  });

  it('omits the attempt block when attempt is 0', () => {
    const result = renderPromptTemplate(SAMPLE_WORKFLOW, SAMPLE_ISSUE, 0);
    expect(result).not.toContain('Retry attempt');
  });

  it('includes the attempt block when attempt > 0', () => {
    const result = renderPromptTemplate(SAMPLE_WORKFLOW, SAMPLE_ISSUE, 2);
    expect(result).toContain('Retry attempt #2');
  });
});
```

- [ ] **Step 4.2: Run tests — expect failure**

```bash
cd apps/desktop && pnpm test -- workflowReader
```

Expected: `Cannot find module '../workflowReader.js'`

- [ ] **Step 4.3: Implement WorkflowReader**

Create `apps/desktop/electron/symphony/workflowReader.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { SymphonyConfig, TrackerIssue } from './types.js';

export function readWorkflowConfig(repoPath: string): SymphonyConfig | null {
  const filePath = path.join(repoPath, 'WORKFLOW.md');
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  try {
    const config = yaml.load(match[1]) as SymphonyConfig;
    if (!config?.tracker?.kind || !config?.agent?.on_complete) return null;
    return config;
  } catch {
    return null;
  }
}

export function readWorkflowRaw(repoPath: string): string | null {
  const filePath = path.join(repoPath, 'WORKFLOW.md');
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function renderPromptTemplate(
  workflowContent: string,
  issue: TrackerIssue,
  attempt: number,
): string {
  const bodyMatch = workflowContent.match(/^---[\s\S]*?---\r?\n([\s\S]*)$/);
  if (!bodyMatch) return workflowContent;
  let body = bodyMatch[1];

  // Resolve {% if attempt %}...{% endif %} blocks
  if (attempt > 0) {
    body = body.replace(/\{%-?\s*if attempt\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g, '$1');
  } else {
    body = body.replace(/\{%-?\s*if attempt\s*-?%\}[\s\S]*?\{%-?\s*endif\s*-?%\}/g, '');
  }

  // Substitute {{ variables }}
  body = body
    .replace(/\{\{\s*issue\.identifier\s*\}\}/g, issue.identifier)
    .replace(/\{\{\s*issue\.title\s*\}\}/g, issue.title)
    .replace(/\{\{\s*issue\.description\s*\}\}/g, issue.description ?? 'No description provided.')
    .replace(/\{\{\s*issue\.state\s*\}\}/g, issue.state)
    .replace(/\{\{\s*issue\.labels\s*\}\}/g, issue.labels.join(', '))
    .replace(/\{\{\s*issue\.url\s*\}\}/g, issue.url)
    .replace(/\{\{\s*attempt\s*\}\}/g, String(attempt));

  return body.trim();
}
```

- [ ] **Step 4.4: Run tests — expect pass**

```bash
cd apps/desktop && pnpm test -- workflowReader
```

Expected: all 7 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add apps/desktop/electron/symphony/workflowReader.ts apps/desktop/electron/symphony/__tests__/workflowReader.test.ts
git commit -m "feat(symphony): add WorkflowReader with YAML front-matter parsing and template rendering"
```

---

## Task 5: Linear Adapter

**Files:**
- Create: `apps/desktop/electron/symphony/adapters/linear.ts`
- Create: `apps/desktop/electron/symphony/adapters/__tests__/linear.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `apps/desktop/electron/symphony/adapters/__tests__/linear.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearAdapter } from '../linear.js';
import type { SymphonyConfig } from '../../types.js';

const CONFIG: SymphonyConfig = {
  tracker: {
    kind: 'linear',
    project_slug: 'my-team/my-proj',
    active_states: ['Todo', 'In Progress'],
    terminal_states: ['Done', 'Cancelled'],
  },
  polling: { interval_ms: 60000 },
  agent: { max_concurrent_agents: 3, on_complete: 'open_pr' },
  codex: { command: 'claude' },
  kanban: { columns: [] },
};

const MOCK_RESPONSE = {
  data: {
    issues: {
      nodes: [
        {
          id: 'lin-1',
          identifier: 'PROJ-42',
          title: 'Fix login timeout',
          description: 'Description here',
          state: { name: 'Todo' },
          labels: { nodes: [{ name: 'bug' }] },
          url: 'https://linear.app/issue/PROJ-42',
        },
      ],
    },
  },
};

describe('LinearAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let adapter: LinearAdapter;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESPONSE),
    });
    adapter = new LinearAdapter(fetchMock as unknown as typeof fetch);
  });

  it('fetches eligible issues matching active_states', async () => {
    const issues = await adapter.fetchEligibleIssues(CONFIG, 'my-api-key');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(issues).toHaveLength(1);
    expect(issues[0].identifier).toBe('PROJ-42');
    expect(issues[0].state).toBe('Todo');
    expect(issues[0].labels).toEqual(['bug']);
  });

  it('sends Authorization header with api key', async () => {
    await adapter.fetchEligibleIssues(CONFIG, 'secret-key');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('secret-key');
  });

  it('throws on non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') });
    await expect(adapter.fetchEligibleIssues(CONFIG, 'bad-key')).rejects.toThrow('Linear API error 401');
  });
});
```

- [ ] **Step 5.2: Run test — expect failure**

```bash
cd apps/desktop && pnpm test -- linear.test
```

Expected: `Cannot find module '../linear.js'`

- [ ] **Step 5.3: Implement LinearAdapter**

Create `apps/desktop/electron/symphony/adapters/linear.ts`:

```typescript
import type { TrackerAdapter, TrackerIssue, SymphonyConfig } from '../types.js';

const LINEAR_API = 'https://api.linear.app/graphql';

const ISSUES_QUERY = `
  query EligibleIssues($slug: String!, $states: [String!]!) {
    issues(
      filter: {
        project: { slugId: { eq: $slug } }
        state: { name: { in: $states } }
      }
      first: 50
    ) {
      nodes {
        id
        identifier
        title
        description
        state { name }
        labels { nodes { name } }
        url
      }
    }
  }
`;

const TRANSITION_MUTATION = `
  mutation TransitionIssue($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
    }
  }
`;

export class LinearAdapter implements TrackerAdapter {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async fetchEligibleIssues(
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<TrackerIssue[]> {
    const res = await this.fetchFn(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: ISSUES_QUERY,
        variables: {
          slug: config.tracker.project_slug,
          states: config.tracker.active_states,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linear API error ${res.status}: ${text}`);
    }

    const json = await res.json() as { data: { issues: { nodes: LinearIssueNode[] } } };
    return json.data.issues.nodes.map(nodeToIssue);
  }

  async transitionIssue(
    issueId: string,
    _state: string,
    _config: SymphonyConfig,
    apiKey: string,
  ): Promise<void> {
    // Linear requires the state ID not name; for now log and skip.
    // Full implementation requires a separate query to resolve state name → ID.
    console.warn(`[symphony:linear] transitionIssue not fully implemented for issueId=${issueId}`);
    void apiKey;
  }
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: { name: string };
  labels: { nodes: Array<{ name: string }> };
  url: string;
}

function nodeToIssue(node: LinearIssueNode): TrackerIssue {
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description,
    state: node.state.name,
    labels: node.labels.nodes.map((l) => l.name),
    url: node.url,
  };
}
```

- [ ] **Step 5.4: Run tests — expect pass**

```bash
cd apps/desktop && pnpm test -- linear.test
```

Expected: all 3 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add apps/desktop/electron/symphony/adapters/linear.ts apps/desktop/electron/symphony/adapters/__tests__/linear.test.ts
git commit -m "feat(symphony): add LinearAdapter"
```

---

## Task 6: GitHub Adapter

**Files:**
- Create: `apps/desktop/electron/symphony/adapters/github.ts`

No separate test file — GitHub adapter uses the same `TrackerAdapter` interface, covered by integration tests later.

- [ ] **Step 6.1: Implement GitHubAdapter**

Create `apps/desktop/electron/symphony/adapters/github.ts`:

```typescript
import type { TrackerAdapter, TrackerIssue, SymphonyConfig } from '../types.js';

const GH_API = 'https://api.github.com';

export class GitHubAdapter implements TrackerAdapter {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async fetchEligibleIssues(
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<TrackerIssue[]> {
    const [owner, repo] = config.tracker.project_slug.split('/');
    if (!owner || !repo) throw new Error(`Invalid GitHub project_slug: ${config.tracker.project_slug}`);

    const params = new URLSearchParams({ state: 'open', per_page: '50' });
    const url = `${GH_API}/repos/${owner}/${repo}/issues?${params}`;

    const res = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }

    const issues = await res.json() as GHIssue[];
    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => {
        const labelNames = issue.labels.map((l) => l.name);
        const matchedState = config.tracker.active_states.find((s) =>
          labelNames.includes(s),
        );
        if (!matchedState) return null;
        return {
          id: String(issue.number),
          identifier: `#${issue.number}`,
          title: issue.title,
          description: issue.body ?? null,
          state: matchedState,
          labels: labelNames,
          url: issue.html_url,
        } satisfies TrackerIssue;
      })
      .filter((i): i is TrackerIssue => i !== null);
  }

  async transitionIssue(
    issueId: string,
    state: string,
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<void> {
    if (config.tracker.terminal_states.includes(state)) {
      const [owner, repo] = config.tracker.project_slug.split('/');
      const url = `${GH_API}/repos/${owner}/${repo}/issues/${issueId}`;
      await this.fetchFn(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ state: 'closed' }),
      });
    }
  }
}

interface GHIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  pull_request?: unknown;
  labels: Array<{ name: string }>;
}
```

- [ ] **Step 6.2: Commit**

```bash
git add apps/desktop/electron/symphony/adapters/github.ts
git commit -m "feat(symphony): add GitHubAdapter"
```

---

## Task 7: Add RunService.getRunStatus

`RunService` manages in-memory run state. The orchestrator needs to poll whether a run is still active.

**Files:**
- Modify: `apps/desktop/electron/services/runService.ts`

- [ ] **Step 7.1: Read the current RunService to understand in-memory state**

Open `apps/desktop/electron/services/runService.ts` and find how run state is tracked (likely a `Map<string, RunState>` or similar). Note the field name.

- [ ] **Step 7.2: Add getRunStatus method**

Add this method to the `RunService` class, using whatever internal state map the service already uses. For example, if runs are tracked in a `Map<string, { status: string }>` called `activeRuns`:

```typescript
getRunStatus(runId: string): 'running' | 'done' | 'failed' | null {
  const run = this.activeRuns.get(runId);
  if (!run) return null;
  // Adapt the field name to match what RunService actually uses
  return run.status as 'running' | 'done' | 'failed';
}
```

If the RunService uses a different structure, adapt accordingly — the key requirement is: given a `runId` returned by `start()`, return whether it is still running, completed, or failed.

- [ ] **Step 7.3: Run type check**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7.4: Commit**

```bash
git add apps/desktop/electron/services/runService.ts
git commit -m "feat(symphony): expose RunService.getRunStatus for orchestrator polling"
```

---

## Task 8: CompletionHandler

**Files:**
- Create: `apps/desktop/electron/symphony/completionHandler.ts`

- [ ] **Step 8.1: Implement CompletionHandler**

Create `apps/desktop/electron/symphony/completionHandler.ts`:

```typescript
import type { SymphonyConfig, TrackerIssue, TrackerAdapter } from './types.js';
import type { DiffService } from '../services/diffService.js';

export interface CompletionContext {
  threadId: string;
  worktreePath: string;
  issue: TrackerIssue;
  config: SymphonyConfig;
  apiKey: string;
  adapter: TrackerAdapter;
  diffService: DiffService;
  githubToken?: string;
}

export class CompletionHandler {
  async handle(ctx: CompletionContext): Promise<{ prUrl: string | null; error: string | null }> {
    const action = ctx.config.agent.on_complete;
    try {
      if (action === 'open_pr') return await this.openPr(ctx);
      if (action === 'commit') return await this.commit(ctx);
      if (action === 'mark_done') return await this.markDone(ctx);
      return { prUrl: null, error: `Unknown on_complete action: ${action}` };
    } catch (err) {
      return { prUrl: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async openPr(ctx: CompletionContext): Promise<{ prUrl: string | null; error: null }> {
    await ctx.diffService.gitPush(ctx.worktreePath);

    if (!ctx.githubToken || ctx.config.tracker.kind !== 'github') {
      return { prUrl: null, error: null };
    }

    const [owner, repo] = ctx.config.tracker.project_slug.split('/');
    const branchRes = await ctx.diffService.readAbbrevRefHead?.(ctx.worktreePath);
    const branch = branchRes ?? 'main';

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: ctx.issue.title,
        head: branch,
        base: 'main',
        body: `Closes ${ctx.issue.url}\n\nAutomated by Symphony.`,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub PR creation failed ${res.status}: ${text}`);
    }

    const pr = await res.json() as { html_url: string };
    return { prUrl: pr.html_url, error: null };
  }

  private async commit(ctx: CompletionContext): Promise<{ prUrl: null; error: null }> {
    await ctx.diffService.stageAll(ctx.worktreePath);
    await ctx.diffService.commitStaged(
      ctx.worktreePath,
      `feat: ${ctx.issue.identifier} ${ctx.issue.title} (Symphony)`,
    );
    return { prUrl: null, error: null };
  }

  private async markDone(ctx: CompletionContext): Promise<{ prUrl: null; error: null }> {
    const doneState = ctx.config.tracker.terminal_states[0] ?? 'Done';
    await ctx.adapter.transitionIssue(ctx.issue.id, doneState, ctx.config, ctx.apiKey);
    return { prUrl: null, error: null };
  }
}
```

- [ ] **Step 8.2: Run type check**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: no errors. If `DiffService` doesn't export `readAbbrevRefHead` or `commitStaged`, adjust method names to match what `diffService.ts` actually exposes.

- [ ] **Step 8.3: Commit**

```bash
git add apps/desktop/electron/symphony/completionHandler.ts
git commit -m "feat(symphony): add CompletionHandler for open_pr, commit, mark_done"
```

---

## Task 9: SymphonyOrchestrator

**Files:**
- Create: `apps/desktop/electron/symphony/orchestrator.ts`
- Create: `apps/desktop/electron/symphony/__tests__/orchestrator.test.ts`

- [ ] **Step 9.1: Write the failing tests**

Create `apps/desktop/electron/symphony/__tests__/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SymphonyOrchestrator } from '../orchestrator.js';
import type { SymphonyConfig, TrackerIssue } from '../types.js';
import type { SymphonyConfigStore } from '../../storage/stores/SymphonyConfigStore.js';
import type { WorkspaceService } from '../../services/workspaceService.js';
import type { RunService } from '../../services/runService.js';
import type { CompletionHandler } from '../completionHandler.js';
import type { DiffService } from '../../services/diffService.js';

const WORKFLOW_CONFIG: SymphonyConfig = {
  tracker: { kind: 'linear', project_slug: 'my/proj', active_states: ['Todo'], terminal_states: ['Done'] },
  polling: { interval_ms: 60000 },
  agent: { max_concurrent_agents: 2, on_complete: 'commit' },
  codex: { command: 'claude' },
  kanban: { columns: [{ label: 'Todo', state: 'Todo' }] },
};

const MOCK_ISSUE: TrackerIssue = {
  id: 'iss-1', identifier: 'PROJ-1', title: 'My issue', description: null,
  state: 'Todo', labels: [], url: 'https://linear.app/issue/PROJ-1',
};

function makeOrchestrator() {
  const configStore = {
    get: vi.fn().mockReturnValue({ projectId: 'p1', trackerKind: 'linear', apiKey: 'key', projectSlug: 'my/proj' }),
  } as unknown as SymphonyConfigStore;

  const workspaceService = {
    getSnapshot: vi.fn().mockReturnValue({
      activeProjectId: 'p1',
      activeWorktreePath: '/repo',
      projects: [{ id: 'p1', repoPath: '/repo' }],
    }),
    createThread: vi.fn().mockReturnValue({ id: 'thread-1', worktreePath: '/repo', agent: 'claude' }),
  } as unknown as WorkspaceService;

  const runService = {
    start: vi.fn().mockReturnValue('run-1'),
    getRunStatus: vi.fn().mockReturnValue('done'),
    interrupt: vi.fn(),
  } as unknown as RunService;

  const completionHandler = {
    handle: vi.fn().mockResolvedValue({ prUrl: null, error: null }),
  } as unknown as CompletionHandler;

  const diffService = {} as unknown as DiffService;

  const adapter = {
    fetchEligibleIssues: vi.fn().mockResolvedValue([MOCK_ISSUE]),
    transitionIssue: vi.fn().mockResolvedValue(undefined),
  };

  const readWorkflow = vi.fn().mockReturnValue(WORKFLOW_CONFIG);
  const readWorkflowRaw = vi.fn().mockReturnValue('---\n...\n---\nPrompt {{ issue.title }}');

  const onStateChange = vi.fn();

  const orchestrator = new SymphonyOrchestrator({
    configStore,
    workspaceService,
    runService,
    completionHandler,
    diffService,
    readWorkflowConfig: readWorkflow,
    readWorkflowRaw,
    makeAdapter: () => adapter,
    onStateChange,
  });

  return { orchestrator, workspaceService, runService, adapter, completionHandler, onStateChange };
}

describe('SymphonyOrchestrator', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('dispatches a new thread for an eligible issue', async () => {
    const { orchestrator, workspaceService, runService } = makeOrchestrator();
    await orchestrator.tick();
    expect(workspaceService.createThread).toHaveBeenCalledOnce();
    expect(runService.start).toHaveBeenCalledOnce();
  });

  it('does not dispatch the same issue twice', async () => {
    const { orchestrator, workspaceService } = makeOrchestrator();
    await orchestrator.tick();
    await orchestrator.tick();
    expect(workspaceService.createThread).toHaveBeenCalledOnce();
  });

  it('calls completionHandler when run is done', async () => {
    const { orchestrator, completionHandler } = makeOrchestrator();
    await orchestrator.tick();
    await orchestrator.tick();
    expect(completionHandler.handle).toHaveBeenCalledOnce();
  });

  it('emits state change after dispatch', async () => {
    const { orchestrator, onStateChange } = makeOrchestrator();
    await orchestrator.tick();
    expect(onStateChange).toHaveBeenCalled();
  });

  it('does not dispatch when max_concurrent_agents reached', async () => {
    const { orchestrator, workspaceService, runService, adapter } = makeOrchestrator();
    adapter.fetchEligibleIssues.mockResolvedValue([
      MOCK_ISSUE,
      { ...MOCK_ISSUE, id: 'iss-2', identifier: 'PROJ-2' },
      { ...MOCK_ISSUE, id: 'iss-3', identifier: 'PROJ-3' },
    ]);
    runService.getRunStatus.mockReturnValue('running');
    await orchestrator.tick();
    expect(workspaceService.createThread).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 9.2: Run tests — expect failure**

```bash
cd apps/desktop && pnpm test -- orchestrator.test
```

Expected: `Cannot find module '../orchestrator.js'`

- [ ] **Step 9.3: Implement SymphonyOrchestrator**

Create `apps/desktop/electron/symphony/orchestrator.ts`:

```typescript
import type { SymphonyConfig, SymphonyTask, TrackerIssue, TrackerAdapter } from './types.js';
import type { SymphonyConfigStore } from '../storage/stores/SymphonyConfigStore.js';
import type { WorkspaceService } from '../services/workspaceService.js';
import type { RunService } from '../services/runService.js';
import type { CompletionHandler } from './completionHandler.js';
import type { DiffService } from '../services/diffService.js';
import { renderPromptTemplate } from './workflowReader.js';

interface ActiveRun {
  threadId: string;
  runId: string;
  worktreePath: string;
  issue: TrackerIssue;
  startedAt: number;
  prUrl: string | null;
  errorHint: string | null;
}

export interface OrchestratorDeps {
  configStore: SymphonyConfigStore;
  workspaceService: WorkspaceService;
  runService: RunService;
  completionHandler: CompletionHandler;
  diffService: DiffService;
  readWorkflowConfig: (repoPath: string) => SymphonyConfig | null;
  readWorkflowRaw: (repoPath: string) => string | null;
  makeAdapter: (kind: 'linear' | 'github') => TrackerAdapter;
  onStateChange: () => void;
}

export class SymphonyOrchestrator {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: OrchestratorDeps) {}

  start(): void {
    void this.tick();
  }

  stop(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async tick(): Promise<void> {
    try {
      const snapshot = this.deps.workspaceService.getSnapshot();
      if (!snapshot.activeProjectId || !snapshot.activeWorktreePath) return;

      const storeCfg = this.deps.configStore.get(snapshot.activeProjectId);
      if (!storeCfg) return;

      const repoPath = snapshot.projects.find((p: { id: string }) => p.id === snapshot.activeProjectId)?.repoPath;
      if (!repoPath) return;

      const workflowConfig = this.deps.readWorkflowConfig(repoPath);
      if (!workflowConfig) return;

      const workflowRaw = this.deps.readWorkflowRaw(repoPath) ?? '';
      const adapter = this.deps.makeAdapter(storeCfg.trackerKind);

      await this.reconcile(workflowConfig, storeCfg.apiKey, adapter, repoPath, snapshot.activeProjectId);
      await this.dispatch(workflowConfig, storeCfg.apiKey, adapter, workflowRaw, snapshot);

      this.deps.onStateChange();
    } catch (err) {
      console.error('[symphony] tick error:', err);
    } finally {
      this.scheduleNextTick(60_000);
    }
  }

  getTasks(projectId: string, workflowConfig: SymphonyConfig | null): SymphonyTask[] {
    return Array.from(this.activeRuns.values())
      .filter((r) => {
        const snapshot = this.deps.workspaceService.getSnapshot();
        return snapshot.projects.some((p: { id: string; repoPath: string }) =>
          this.activeRuns.has(r.issue.id),
        );
      })
      .map((r) => {
        const status = this.deps.runService.getRunStatus(r.runId);
        return {
          issueId: r.issue.id,
          issueIdentifier: r.issue.identifier,
          issueTitle: r.issue.title,
          issueUrl: r.issue.url,
          issueState: r.issue.state,
          threadId: r.threadId,
          runStatus: status ?? 'idle',
          startedAt: r.startedAt,
          prUrl: r.prUrl,
          errorHint: r.errorHint,
        };
      });
  }

  private async dispatch(
    config: SymphonyConfig,
    apiKey: string,
    adapter: TrackerAdapter,
    workflowRaw: string,
    snapshot: ReturnType<WorkspaceService['getSnapshot']>,
  ): Promise<void> {
    const issues = await adapter.fetchEligibleIssues(config, apiKey);
    const activeCount = Array.from(this.activeRuns.values()).filter((r) => {
      const status = this.deps.runService.getRunStatus(r.runId);
      return status === 'running';
    }).length;

    for (const issue of issues) {
      if (this.activeRuns.has(issue.id)) continue;
      if (activeCount >= config.agent.max_concurrent_agents) break;

      const thread = this.deps.workspaceService.createThread({
        projectId: snapshot.activeProjectId!,
        worktreePath: snapshot.activeWorktreePath!,
        title: `${issue.identifier}: ${issue.title}`,
        agent: config.codex.command as 'claude' | 'codex' | 'gemini' | 'cursor',
        metadataJson: JSON.stringify({ source: 'symphony', issueId: issue.id, identifier: issue.identifier, issueUrl: issue.url }),
      });

      const attempt = 0;
      const prompt = renderPromptTemplate(workflowRaw, issue, attempt);
      const runId = this.deps.runService.start(
        config.codex.command as 'claude',
        snapshot.activeWorktreePath!,
        prompt,
        () => {},
      );

      this.activeRuns.set(issue.id, {
        threadId: thread.id,
        runId,
        worktreePath: snapshot.activeWorktreePath!,
        issue,
        startedAt: Date.now(),
        prUrl: null,
        errorHint: null,
      });
    }
  }

  private async reconcile(
    config: SymphonyConfig,
    apiKey: string,
    adapter: TrackerAdapter,
    repoPath: string,
    projectId: string,
  ): Promise<void> {
    for (const [issueId, run] of this.activeRuns) {
      const status = this.deps.runService.getRunStatus(run.runId);

      if (status === 'done' || status === 'failed') {
        if (status === 'done') {
          const result = await this.deps.completionHandler.handle({
            threadId: run.threadId,
            worktreePath: run.worktreePath,
            issue: run.issue,
            config,
            apiKey,
            adapter,
            diffService: this.deps.diffService,
          });
          run.prUrl = result.prUrl;
          run.errorHint = result.error;
        } else {
          run.errorHint = 'Run failed';
        }
        // Keep in map so UI can show result; clear on next tracker poll if issue moved to terminal state
      }

      if (status === null) {
        // Run was evicted — treat as done
        this.activeRuns.delete(issueId);
      }
    }
  }

  private scheduleNextTick(defaultMs: number): void {
    this.pollTimer = setTimeout(() => void this.tick(), defaultMs);
  }
}
```

- [ ] **Step 9.4: Run tests — expect pass**

```bash
cd apps/desktop && pnpm test -- orchestrator.test
```

Expected: all 5 tests pass. Fix any type errors reported by Vitest.

- [ ] **Step 9.5: Commit**

```bash
git add apps/desktop/electron/symphony/orchestrator.ts apps/desktop/electron/symphony/__tests__/orchestrator.test.ts
git commit -m "feat(symphony): add SymphonyOrchestrator with polling, dispatch, and reconciliation"
```

---

## Task 10: IPC channels, preload, and mainApp wiring

**Files:**
- Modify: `apps/desktop/electron/ipcChannels.ts`
- Modify: `apps/desktop/electron/mainApp.ts`
- Modify: `apps/desktop/electron/preload.ts`

- [ ] **Step 10.1: Add symphony channels to ipcChannels.ts**

Open `apps/desktop/electron/ipcChannels.ts`. Find `export const IPC_CHANNELS = {` and add these entries (keep alphabetical order with other `symphony*` keys):

```typescript
symphonyGetConfig: 'symphony:getConfig',
symphonySetConfig: 'symphony:setConfig',
symphonyDeleteConfig: 'symphony:deleteConfig',
symphonyGetTasks: 'symphony:getTasks',
symphonyDidChange: 'symphony:didChange',
```

- [ ] **Step 10.2: Add symphony IPC input types to shared/ipc.ts**

Open `apps/desktop/src/shared/ipc.ts`. Add at the bottom, before the last export:

```typescript
export interface SymphonyGetTasksInput {
  projectId: string;
}

// Re-export these from shared/symphony.ts for IPC consumers
export type { SymphonySetConfigInput, SymphonyStoredConfig, SymphonyTasksSnapshot } from './symphony.js';
```

- [ ] **Step 10.3: Register IPC handlers in mainApp.ts**

Open `apps/desktop/electron/mainApp.ts`. After the existing store instantiation block (near `const store = new WorkspaceStore(db)` etc.), add:

```typescript
import { SymphonyConfigStore } from './storage/stores/SymphonyConfigStore.js';
import { SymphonyOrchestrator } from './symphony/orchestrator.js';
import { CompletionHandler } from './symphony/completionHandler.js';
import { LinearAdapter } from './symphony/adapters/linear.js';
import { GitHubAdapter } from './symphony/adapters/github.js';
import { readWorkflowConfig, readWorkflowRaw } from './symphony/workflowReader.js';
```

In the store initialization block, add:
```typescript
const symphonyConfigStore = new SymphonyConfigStore(db);
symphonyConfigStore.initialize();
```

After `workspaceService` is instantiated, add:
```typescript
const completionHandler = new CompletionHandler();
const orchestrator = new SymphonyOrchestrator({
  configStore: symphonyConfigStore,
  workspaceService,
  runService,
  completionHandler,
  diffService,
  readWorkflowConfig,
  readWorkflowRaw,
  makeAdapter: (kind) => kind === 'linear' ? new LinearAdapter() : new GitHubAdapter(),
  onStateChange: () => {
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send(IPC_CHANNELS.symphonyDidChange);
    });
  },
});
```

In the `registerIpc` function or equivalent, add these handlers:

```typescript
ipcMain.handle(IPC_CHANNELS.symphonyGetConfig, (_, payload: { projectId: string }) => {
  return symphonyConfigStore.get(payload.projectId);
});

ipcMain.handle(IPC_CHANNELS.symphonySetConfig, (_, payload: import('./storage/stores/SymphonyConfigStore.js').Omit<SymphonyProjectConfig, 'createdAt' | 'updatedAt'>) => {
  symphonyConfigStore.upsert(payload);
  orchestrator.stop();
  orchestrator.start();
});

ipcMain.handle(IPC_CHANNELS.symphonyDeleteConfig, (_, payload: { projectId: string }) => {
  symphonyConfigStore.delete(payload.projectId);
  orchestrator.stop();
});

ipcMain.handle(IPC_CHANNELS.symphonyGetTasks, (_, payload: { projectId: string }) => {
  const snapshot = workspaceService.getSnapshot();
  const repoPath = snapshot.projects.find((p) => p.id === payload.projectId)?.repoPath;
  const config = repoPath ? readWorkflowConfig(repoPath) : null;
  const tasks = orchestrator.getTasks(payload.projectId, config);
  return {
    tasks,
    columns: config?.kanban?.columns ?? [],
    trackerError: null,
    enabled: !!symphonyConfigStore.get(payload.projectId),
  };
});
```

After `app.whenReady()`, start the orchestrator:
```typescript
app.whenReady().then(() => {
  // ... existing code ...
  orchestrator.start();
});
```

On `app.on('before-quit')`, stop it:
```typescript
app.on('before-quit', () => {
  orchestrator.stop();
});
```

- [ ] **Step 10.4: Expose symphonyApi in preload.ts**

Open `apps/desktop/electron/preload.ts`. Find where `workspaceApi` is exposed via `contextBridge.exposeInMainWorld`. Add a similar block:

```typescript
contextBridge.exposeInMainWorld('symphonyApi', {
  getConfig: (payload: { projectId: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.symphonyGetConfig, payload),
  setConfig: (payload: { projectId: string; trackerKind: string; apiKey: string; projectSlug: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.symphonySetConfig, payload),
  deleteConfig: (payload: { projectId: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.symphonyDeleteConfig, payload),
  getTasks: (payload: { projectId: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.symphonyGetTasks, payload),
  onDidChange: (cb: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.symphonyDidChange, cb);
    return () => ipcRenderer.off(IPC_CHANNELS.symphonyDidChange, cb);
  },
});
```

Also add `symphonyApi` to the `window` type declaration at the top of `preload.ts` (or in `src/env.d.ts` if that's where window types are declared):

```typescript
declare global {
  interface Window {
    // ... existing entries ...
    symphonyApi: {
      getConfig: (payload: { projectId: string }) => Promise<import('./storage/stores/SymphonyConfigStore.js').SymphonyProjectConfig | null>;
      setConfig: (payload: { projectId: string; trackerKind: string; apiKey: string; projectSlug: string }) => Promise<void>;
      deleteConfig: (payload: { projectId: string }) => Promise<void>;
      getTasks: (payload: { projectId: string }) => Promise<import('../src/shared/symphony.js').SymphonyTasksSnapshot>;
      onDidChange: (cb: () => void) => () => void;
    };
  }
}
```

- [ ] **Step 10.5: Run type check and tests**

```bash
cd apps/desktop && pnpm typecheck && pnpm test
```

Expected: no type errors, all existing tests still pass.

- [ ] **Step 10.6: Commit**

```bash
git add apps/desktop/electron/ipcChannels.ts apps/desktop/electron/mainApp.ts apps/desktop/electron/preload.ts apps/desktop/src/shared/ipc.ts
git commit -m "feat(symphony): wire orchestrator IPC channels, preload bridge, and mainApp startup"
```

---

## Self-Review Checklist

After writing this plan, the following spec requirements are covered:

| Spec requirement | Task |
|---|---|
| `SymphonyOrchestrator` service | Task 9 |
| `TrackerAdapter/Linear` | Task 5 |
| `TrackerAdapter/GitHub` | Task 6 |
| `WorkflowReader` parses WORKFLOW.md | Task 4 |
| `CompletionHandler` (open_pr, commit, mark_done) | Task 8 |
| `project_symphony_config` SQLite table | Task 2 |
| Thread tagged `source: "symphony"` in metadata | Task 3 + Task 9 step 9.3 |
| `workspace:createThread` + `run:start` reuse | Task 9 step 9.3 |
| `run:interrupt` on external state change | Task 9 (reconcile method) |
| Poll interval from `WORKFLOW.md` | Task 9 (scheduleNextTick) |
| Tracker errors logged, skipped | Task 9 (try/catch in tick) |
| No new processes, no new protocols | Architecture — RunService/WorkspaceService reused |
| WORKFLOW.md re-read each tick | Task 9 (readWorkflowConfig called in tick) |

**Gap noted:** Poll interval uses a fixed 60s default in `scheduleNextTick`. Enhance to read `config.polling.interval_ms` when available — update the `scheduleNextTick` call in `tick()` to: `this.scheduleNextTick(workflowConfig?.polling?.interval_ms ?? 60_000)`. Move `workflowConfig` into scope before the `finally` block.
