# Drizzle ORM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw `better-sqlite3` SQL in `electron/storage/` with Drizzle ORM, splitting the monolithic `WorkspaceStore` into focused stores while preserving the existing public API.

**Architecture:** A single `schema.ts` defines all Drizzle table definitions. Six focused stores (`ProjectStore`, `WorktreeStore`, `ThreadStore`, `RunStore`, `NotificationStore`, `SettingsStore`) each receive an `AppDatabase` instance and own their DDL via `initialize()`. A thin `WorkspaceStore` coordinator assembles `getSnapshot()` and handles cross-table operations via transactions.

**Tech Stack:** drizzle-orm, drizzle-kit (dev), better-sqlite3, vitest

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| CREATE | `electron/storage/schema.ts` | All Drizzle table definitions |
| CREATE | `electron/storage/db.ts` | `openDatabase` factory, `AppDatabase` type |
| CREATE | `electron/storage/stores/ProjectStore.ts` | projects table CRUD |
| CREATE | `electron/storage/stores/WorktreeStore.ts` | worktrees + worktree_editor_state CRUD |
| CREATE | `electron/storage/stores/ThreadStore.ts` | threads + thread_sessions CRUD |
| CREATE | `electron/storage/stores/RunStore.ts` | runs + run_events CRUD |
| CREATE | `electron/storage/stores/NotificationStore.ts` | notifications CRUD |
| CREATE | `electron/storage/stores/SettingsStore.ts` | app_state + github_pr_settings |
| REWRITE | `electron/storage/WorkspaceStore.ts` | thin coordinator (replaces store.ts) |
| MODIFY | `electron/mainApp.ts` | swap store init, remove schema.sql read |
| CREATE | `electron/storage/__tests__/testDb.ts` | shared test DB helper |
| CREATE | `electron/storage/__tests__/ProjectStore.test.ts` | ProjectStore unit tests |
| CREATE | `electron/storage/__tests__/WorktreeStore.test.ts` | WorktreeStore unit tests |
| CREATE | `electron/storage/__tests__/ThreadStore.test.ts` | ThreadStore unit tests |
| CREATE | `electron/storage/__tests__/NotificationStore.test.ts` | NotificationStore unit tests |
| CREATE | `electron/storage/__tests__/SettingsStore.test.ts` | SettingsStore unit tests |
| MODIFY | `electron/storage/__tests__/store.test.ts` | update import path to WorkspaceStore |
| DELETE | `electron/storage/store.ts` | replaced by WorkspaceStore.ts + stores/ |
| DELETE | `electron/storage/schema.sql` | superseded by schema.ts |

---

## Task 1: Install Drizzle dependencies

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
cd apps/desktop
pnpm add drizzle-orm
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('drizzle-orm'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Create stores directory**

```bash
mkdir -p electron/storage/stores
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "chore: add drizzle-orm dependency"
```

---

## Task 2: Create schema.ts

**Files:**
- Create: `electron/storage/schema.ts`

- [ ] **Step 1: Create schema.ts with all table definitions**

```ts
// electron/storage/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoPath: text("repo_path").notNull(),
  status: text("status").notNull(),
  lastActiveWorktreeId: text("last_active_worktree_id"),
  tabOrder: integer("tab_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const worktrees = sqliteTable("worktrees", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  branch: text("branch").notNull(),
  path: text("path").notNull(),
  isActive: integer("is_active").notNull().default(0),
  isDefault: integer("is_default").notNull().default(0),
  baseBranch: text("base_branch"),
  lastActiveThreadId: text("last_active_thread_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  worktreeId: text("worktree_id").notNull(),
  title: text("title").notNull(),
  agent: text("agent").notNull(),
  createdBranch: text("created_branch"),
  resumeId: text("resume_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const threadSessions = sqliteTable("thread_sessions", {
  threadId: text("thread_id").primaryKey(),
  provider: text("provider").notNull(),
  resumeId: text("resume_id"),
  initialPrompt: text("initial_prompt"),
  titleCapturedAt: text("title_captured_at"),
  launchMode: text("launch_mode").notNull(),
  status: text("status").notNull(),
  lastActivityAt: text("last_activity_at").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
});

export const runEvents = sqliteTable("run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});

export const appState = sqliteTable("app_state", {
  id: integer("id").primaryKey(),
  activeProjectId: text("active_project_id"),
  activeWorktreeId: text("active_worktree_id"),
  activeThreadId: text("active_thread_id"),
});

export const worktreeEditorState = sqliteTable("worktree_editor_state", {
  worktreeId: text("worktree_id").primaryKey(),
  selectedFilePath: text("selected_file_path"),
  openFilePathsJson: text("open_file_paths_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  threadTitle: text("thread_title").notNull(),
  projectName: text("project_name").notNull(),
  read: integer("read").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const githubPrSettings = sqliteTable("github_pr_settings", {
  id: integer("id").primaryKey(),
  token: text("token").notNull().default(""),
  owner: text("owner").notNull().default(""),
  repo: text("repo").notNull().default(""),
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/storage/schema.ts
git commit -m "feat(storage): add Drizzle schema definitions"
```

---

## Task 3: Create db.ts

**Files:**
- Create: `electron/storage/db.ts`

- [ ] **Step 1: Create db.ts**

```ts
// electron/storage/db.ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export function openDatabase(baseDir: string, filename = "workspace.db") {
  fs.mkdirSync(baseDir, { recursive: true });
  const dbPath = path.join(baseDir, filename);
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof openDatabase>;
```

- [ ] **Step 2: Create shared test DB helper**

```ts
// electron/storage/__tests__/testDb.ts
import { vi } from "vitest";

vi.mock("better-sqlite3", async () => {
  const module = await import("./betterSqlite3Compat");
  return { default: module.default };
});

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";
import type { AppDatabase } from "../db";

export function createTestDb(): AppDatabase {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  return drizzle(sqlite, { schema }) as AppDatabase;
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/storage/db.ts electron/storage/__tests__/testDb.ts
git commit -m "feat(storage): add Drizzle db factory and test helper"
```

---

## Task 4: ProjectStore

**Files:**
- Create: `electron/storage/stores/ProjectStore.ts`
- Create: `electron/storage/__tests__/ProjectStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/storage/__tests__/ProjectStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { ProjectStore } from "../stores/ProjectStore";
import type { AppDatabase } from "../db";

function makeProject(overrides: Partial<Parameters<ProjectStore["upsert"]>[0]> = {}) {
  return {
    id: "proj-1",
    name: "My Project",
    repoPath: "/home/user/repo",
    status: "idle" as const,
    lastActiveWorktreeId: null,
    tabOrder: 0,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjectStore", () => {
  let db: AppDatabase;
  let store: ProjectStore;

  beforeEach(() => {
    db = createTestDb();
    store = new ProjectStore(db);
    store.initialize();
  });

  it("upserts and lists a project", () => {
    store.upsert(makeProject());
    const all = store.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("proj-1");
    expect(all[0].repoPath).toBe("/home/user/repo");
  });

  it("updates project on conflict", () => {
    store.upsert(makeProject());
    store.upsert(makeProject({ name: "Renamed" }));
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].name).toBe("Renamed");
  });

  it("nextTabOrder returns 0 for empty store", () => {
    expect(store.nextTabOrder()).toBe(0);
  });

  it("nextTabOrder returns min-1 when projects exist", () => {
    store.upsert(makeProject({ tabOrder: 5 }));
    expect(store.nextTabOrder()).toBe(4);
  });

  it("reorder assigns sequential tab_order", () => {
    store.upsert(makeProject({ id: "p1", tabOrder: 0 }));
    store.upsert(makeProject({ id: "p2", tabOrder: 1 }));
    store.reorder(["p2", "p1"]);
    const all = store.list();
    const p2 = all.find((p) => p.id === "p2")!;
    const p1 = all.find((p) => p.id === "p1")!;
    expect(p2.tabOrder).toBe(0);
    expect(p1.tabOrder).toBe(1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/ProjectStore.test.ts
```

Expected: `Cannot find module '../stores/ProjectStore'`

- [ ] **Step 3: Implement ProjectStore**

```ts
// electron/storage/stores/ProjectStore.ts
import { sql, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import { projects } from "../schema.js";
import type { Project } from "../../src/shared/domain.js";

export class ProjectStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        status TEXT NOT NULL,
        last_active_worktree_id TEXT,
        tab_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const hasLastActiveWorktreeId = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'last_active_worktree_id' LIMIT 1
    `);
    if (!hasLastActiveWorktreeId) {
      this.db.run(sql`ALTER TABLE projects ADD COLUMN last_active_worktree_id TEXT`);
    }
    const hasTabOrder = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'tab_order' LIMIT 1
    `);
    if (!hasTabOrder) {
      this.db.run(sql`ALTER TABLE projects ADD COLUMN tab_order INTEGER NOT NULL DEFAULT 0`);
      const legacy = this.db.all<{ id: string }>(sql`
        SELECT id FROM projects ORDER BY updated_at DESC, id ASC
      `);
      for (let i = 0; i < legacy.length; i++) {
        this.db.run(sql`UPDATE projects SET tab_order = ${i} WHERE id = ${legacy[i].id}`);
      }
    }
  }

  upsert(project: Project): void {
    this.db
      .insert(projects)
      .values({
        id: project.id,
        name: project.name,
        repoPath: project.repoPath,
        status: project.status,
        lastActiveWorktreeId: project.lastActiveWorktreeId ?? null,
        tabOrder: project.tabOrder,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: sql`excluded.name`,
          repoPath: sql`excluded.repo_path`,
          status: sql`excluded.status`,
          lastActiveWorktreeId: sql`excluded.last_active_worktree_id`,
          tabOrder: sql`excluded.tab_order`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .run();
  }

  list(): Project[] {
    return this.db
      .select()
      .from(projects)
      .orderBy(asc(projects.tabOrder), asc(projects.id))
      .all() as Project[];
  }

  nextTabOrder(): number {
    const row = this.db.get<{ m: number | null }>(sql`SELECT MIN(tab_order) AS m FROM projects`);
    const min = row?.m;
    return min == null ? 0 : min - 1;
  }

  reorder(orderedIds: string[]): void {
    const existing = this.db.all<{ id: string }>(sql`SELECT id FROM projects`);
    const idSet = new Set(existing.map((r) => r.id));
    if (orderedIds.length !== idSet.size) {
      throw new Error("reorderProjects: ordered list must include each project exactly once");
    }
    for (const id of orderedIds) {
      if (!idSet.has(id)) throw new Error(`reorderProjects: unknown project id ${id}`);
    }
    this.db.transaction((tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        tx.run(sql`UPDATE projects SET tab_order = ${i} WHERE id = ${orderedIds[i]}`);
      }
    });
  }

  setLastActiveWorktree(projectId: string, worktreeId: string | null): void {
    this.db.run(sql`
      UPDATE projects SET last_active_worktree_id = ${worktreeId} WHERE id = ${projectId}
    `);
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/ProjectStore.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/storage/stores/ProjectStore.ts electron/storage/__tests__/ProjectStore.test.ts
git commit -m "feat(storage): add ProjectStore with Drizzle"
```

---

## Task 5: WorktreeStore

**Files:**
- Create: `electron/storage/stores/WorktreeStore.ts`
- Create: `electron/storage/__tests__/WorktreeStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/storage/__tests__/WorktreeStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { ProjectStore } from "../stores/ProjectStore";
import { WorktreeStore } from "../stores/WorktreeStore";
import type { AppDatabase } from "../db";

function makeWorktree(overrides = {}) {
  return {
    id: "wt-1",
    projectId: "proj-1",
    name: "main",
    branch: "main",
    path: "/repo",
    isActive: false,
    isDefault: true,
    baseBranch: null,
    lastActiveThreadId: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProject() {
  return {
    id: "proj-1", name: "P", repoPath: "/r", status: "idle" as const,
    lastActiveWorktreeId: null, tabOrder: 0,
    createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
  };
}

describe("WorktreeStore", () => {
  let db: AppDatabase;
  let store: WorktreeStore;

  beforeEach(() => {
    db = createTestDb();
    new ProjectStore(db).initialize();
    store = new WorktreeStore(db);
    store.initialize();
    new ProjectStore(db).upsert(makeProject());
  });

  it("upserts and lists a worktree", () => {
    store.upsert(makeWorktree());
    const all = store.listByProject("proj-1");
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("wt-1");
    expect(all[0].isDefault).toBe(true);
    expect(all[0].isActive).toBe(false);
  });

  it("getEditorState returns null for unknown worktree", () => {
    store.upsert(makeWorktree());
    expect(store.getEditorState("wt-1")).toBeNull();
  });

  it("setEditorState and getEditorState roundtrip", () => {
    store.upsert(makeWorktree());
    store.setEditorState("wt-1", "/file.ts", ["/file.ts", "/other.ts"]);
    const state = store.getEditorState("wt-1");
    expect(state?.selectedFilePath).toBe("/file.ts");
    expect(state?.openFilePaths).toContain("/file.ts");
    expect(state?.openFilePaths).toContain("/other.ts");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/WorktreeStore.test.ts
```

- [ ] **Step 3: Implement WorktreeStore**

```ts
// electron/storage/stores/WorktreeStore.ts
import { sql, eq } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import { worktrees, worktreeEditorState } from "../schema.js";
import type { Worktree, WorktreeEditorState } from "../../src/shared/domain.js";

export class WorktreeStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS worktrees (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        branch TEXT NOT NULL,
        path TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        base_branch TEXT,
        last_active_thread_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      )
    `);
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS worktree_editor_state (
        worktree_id TEXT PRIMARY KEY,
        selected_file_path TEXT,
        open_file_paths_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        FOREIGN KEY(worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
      )
    `);
    this.db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_worktrees_project_id ON worktrees(project_id)
    `);

    // Column migration guards
    for (const col of ["is_default", "base_branch", "last_active_thread_id"]) {
      const exists = this.db.get<{ v: number }>(sql`
        SELECT 1 AS v FROM pragma_table_info('worktrees') WHERE name = ${col} LIMIT 1
      `);
      if (!exists) {
        if (col === "is_default") {
          this.db.run(sql`ALTER TABLE worktrees ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`);
          this.db.run(sql`UPDATE worktrees SET is_default = 1`);
        } else if (col === "base_branch") {
          this.db.run(sql`ALTER TABLE worktrees ADD COLUMN base_branch TEXT`);
        } else {
          this.db.run(sql`ALTER TABLE worktrees ADD COLUMN last_active_thread_id TEXT`);
        }
      }
    }
    // Ensure every project has at least one default worktree
    this.db.run(sql`
      UPDATE worktrees SET is_default = 1
      WHERE id IN (
        SELECT MIN(id) FROM worktrees
        WHERE project_id NOT IN (SELECT project_id FROM worktrees WHERE is_default = 1)
        GROUP BY project_id
      )
    `);

    const hasOpenFilePaths = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('worktree_editor_state')
      WHERE name = 'open_file_paths_json' LIMIT 1
    `);
    if (!hasOpenFilePaths) {
      this.db.run(sql`
        ALTER TABLE worktree_editor_state ADD COLUMN open_file_paths_json TEXT NOT NULL DEFAULT '[]'
      `);
      this.db.run(sql`
        UPDATE worktree_editor_state
        SET open_file_paths_json = CASE
          WHEN selected_file_path IS NULL OR trim(selected_file_path) = '' THEN '[]'
          ELSE json_array(selected_file_path)
        END
      `);
    }
  }

  upsert(worktree: Worktree): void {
    this.db
      .insert(worktrees)
      .values({
        id: worktree.id,
        projectId: worktree.projectId,
        name: worktree.name,
        branch: worktree.branch,
        path: worktree.path,
        isActive: worktree.isActive ? 1 : 0,
        isDefault: worktree.isDefault ? 1 : 0,
        baseBranch: worktree.baseBranch ?? null,
        lastActiveThreadId: worktree.lastActiveThreadId ?? null,
        createdAt: worktree.createdAt,
        updatedAt: worktree.updatedAt,
      })
      .onConflictDoUpdate({
        target: worktrees.id,
        set: {
          projectId: sql`excluded.project_id`,
          name: sql`excluded.name`,
          branch: sql`excluded.branch`,
          path: sql`excluded.path`,
          isActive: sql`excluded.is_active`,
          isDefault: sql`excluded.is_default`,
          baseBranch: sql`excluded.base_branch`,
          lastActiveThreadId: sql`excluded.last_active_thread_id`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .run();
  }

  listAll(): Worktree[] {
    return this.db
      .select()
      .from(worktrees)
      .all()
      .map((w) => ({ ...w, isActive: Boolean(w.isActive), isDefault: Boolean(w.isDefault) })) as Worktree[];
  }

  listByProject(projectId: string): Worktree[] {
    return this.db
      .select()
      .from(worktrees)
      .where(eq(worktrees.projectId, projectId))
      .all()
      .map((w) => ({ ...w, isActive: Boolean(w.isActive), isDefault: Boolean(w.isDefault) })) as Worktree[];
  }

  setLastActiveThread(worktreeId: string, threadId: string | null): void {
    this.db.run(sql`UPDATE worktrees SET last_active_thread_id = ${threadId} WHERE id = ${worktreeId}`);
  }

  getEditorState(worktreeId: string): (import("../../src/shared/ipc.js").WorktreeEditorState) | null {
    const row = this.db
      .select()
      .from(worktreeEditorState)
      .where(eq(worktreeEditorState.worktreeId, worktreeId))
      .get() as { worktreeId: string; selectedFilePath: string | null; openFilePathsJson: string; updatedAt: string } | undefined;
    if (!row) return null;
    let openFilePaths: string[] = [];
    try {
      const parsed = JSON.parse(row.openFilePathsJson) as unknown;
      if (Array.isArray(parsed)) {
        openFilePaths = parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      }
    } catch {
      openFilePaths = [];
    }
    if (row.selectedFilePath && !openFilePaths.includes(row.selectedFilePath)) {
      openFilePaths.unshift(row.selectedFilePath);
    }
    return { worktreeId: row.worktreeId, selectedFilePath: row.selectedFilePath, openFilePaths, updatedAt: row.updatedAt };
  }

  setEditorState(worktreeId: string, selectedFilePath: string | null, openFilePaths: string[]): void {
    const normalized = Array.from(new Set(
      openFilePaths.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    ));
    if (selectedFilePath && !normalized.includes(selectedFilePath)) normalized.unshift(selectedFilePath);
    const updatedAt = new Date().toISOString();
    this.db
      .insert(worktreeEditorState)
      .values({ worktreeId, selectedFilePath, openFilePathsJson: JSON.stringify(normalized), updatedAt })
      .onConflictDoUpdate({
        target: worktreeEditorState.worktreeId,
        set: {
          selectedFilePath: sql`excluded.selected_file_path`,
          openFilePathsJson: sql`excluded.open_file_paths_json`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .run();
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/WorktreeStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add electron/storage/stores/WorktreeStore.ts electron/storage/__tests__/WorktreeStore.test.ts
git commit -m "feat(storage): add WorktreeStore with Drizzle"
```

---

## Task 6: ThreadStore

**Files:**
- Create: `electron/storage/stores/ThreadStore.ts`
- Create: `electron/storage/__tests__/ThreadStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/storage/__tests__/ThreadStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { ProjectStore } from "../stores/ProjectStore";
import { WorktreeStore } from "../stores/WorktreeStore";
import { ThreadStore } from "../stores/ThreadStore";
import type { AppDatabase } from "../db";
import type { Thread, ThreadSession } from "../../../src/shared/domain";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t-1", projectId: "proj-1", worktreeId: "wt-1",
    title: "My thread", agent: "claude",
    createdBranch: "main", resumeId: null,
    createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<ThreadSession> = {}): ThreadSession {
  return {
    threadId: "t-1", provider: "claude", resumeId: null,
    initialPrompt: null, titleCapturedAt: null,
    launchMode: "fresh", status: "idle",
    lastActivityAt: "2024-01-01T00:00:00Z",
    metadataJson: null, createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ThreadStore", () => {
  let db: AppDatabase;
  let store: ThreadStore;

  beforeEach(() => {
    db = createTestDb();
    const ps = new ProjectStore(db); ps.initialize();
    ps.upsert({ id: "proj-1", name: "P", repoPath: "/r", status: "idle", lastActiveWorktreeId: null, tabOrder: 0, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" });
    const ws = new WorktreeStore(db); ws.initialize();
    ws.upsert({ id: "wt-1", projectId: "proj-1", name: "main", branch: "main", path: "/r", isActive: false, isDefault: true, baseBranch: null, lastActiveThreadId: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" });
    store = new ThreadStore(db);
    store.initialize();
  });

  it("upserts and gets a thread", () => {
    store.upsertThread(makeThread());
    const t = store.getThread("t-1");
    expect(t?.id).toBe("t-1");
    expect(t?.resumeId).toBeNull();
  });

  it("persists resumeId on thread", () => {
    store.upsertThread(makeThread({ resumeId: "abc-123" }));
    expect(store.getThread("t-1")?.resumeId).toBe("abc-123");
  });

  it("upserts and lists session", () => {
    store.upsertThread(makeThread());
    store.upsertSession(makeSession({ resumeId: "sess-id" }));
    const s = store.getSession("t-1");
    expect(s?.resumeId).toBe("sess-id");
    expect(store.listSessions()).toHaveLength(1);
  });

  it("deleteThread removes thread and cascades to session", () => {
    store.upsertThread(makeThread());
    store.upsertSession(makeSession());
    store.deleteThread("t-1");
    expect(store.getThread("t-1")).toBeNull();
    expect(store.getSession("t-1")).toBeNull();
  });

  it("rename updates title", () => {
    store.upsertThread(makeThread());
    store.rename("t-1", "New Title");
    expect(store.getThread("t-1")?.title).toBe("New Title");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/ThreadStore.test.ts
```

- [ ] **Step 3: Implement ThreadStore**

```ts
// electron/storage/stores/ThreadStore.ts
import { sql, eq } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import { threads, threadSessions } from "../schema.js";
import type { Thread, ThreadSession } from "../../src/shared/domain.js";

export class ThreadStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        worktree_id TEXT NOT NULL,
        title TEXT NOT NULL,
        agent TEXT NOT NULL,
        created_branch TEXT,
        resume_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(worktree_id) REFERENCES worktrees(id)
      )
    `);
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS thread_sessions (
        thread_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        resume_id TEXT,
        initial_prompt TEXT,
        title_captured_at TEXT,
        launch_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
      )
    `);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_threads_worktree_id ON threads(worktree_id)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_thread_sessions_status ON thread_sessions(status)`);

    // Drop legacy sort_order column if present
    this.migrateDropSortOrderIfNeeded();

    for (const col of ["created_branch", "resume_id"]) {
      const exists = this.db.get<{ v: number }>(sql`
        SELECT 1 AS v FROM pragma_table_info('threads') WHERE name = ${col} LIMIT 1
      `);
      if (!exists) {
        this.db.run(sql`ALTER TABLE threads ADD COLUMN ${sql.raw(col)} TEXT`);
      }
    }
  }

  private migrateDropSortOrderIfNeeded(): void {
    const col = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('threads') WHERE name = 'sort_order' LIMIT 1
    `);
    if (!col) return;

    this.db.run(sql`DROP INDEX IF EXISTS idx_threads_worktree_sort_order`);
    this.db.run(sql`PRAGMA foreign_keys = OFF`);
    this.db.transaction((tx) => {
      tx.run(sql`
        CREATE TABLE threads__no_sort (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          worktree_id TEXT NOT NULL,
          title TEXT NOT NULL,
          agent TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(project_id) REFERENCES projects(id),
          FOREIGN KEY(worktree_id) REFERENCES worktrees(id)
        )
      `);
      tx.run(sql`
        INSERT INTO threads__no_sort (id, project_id, worktree_id, title, agent, created_at, updated_at)
        SELECT id, project_id, worktree_id, title, agent, created_at, updated_at FROM threads
      `);
      tx.run(sql`DROP TABLE threads`);
      tx.run(sql`ALTER TABLE threads__no_sort RENAME TO threads`);
      tx.run(sql`CREATE INDEX IF NOT EXISTS idx_threads_worktree_id ON threads(worktree_id)`);
    });
    this.db.run(sql`PRAGMA foreign_keys = ON`);
  }

  upsertThread(thread: Thread): void {
    this.db
      .insert(threads)
      .values({
        id: thread.id,
        projectId: thread.projectId,
        worktreeId: thread.worktreeId,
        title: thread.title,
        agent: thread.agent,
        createdBranch: thread.createdBranch ?? null,
        resumeId: thread.resumeId ?? null,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      })
      .onConflictDoUpdate({
        target: threads.id,
        set: {
          projectId: sql`excluded.project_id`,
          worktreeId: sql`excluded.worktree_id`,
          title: sql`excluded.title`,
          agent: sql`excluded.agent`,
          createdBranch: sql`excluded.created_branch`,
          resumeId: sql`excluded.resume_id`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .run();
  }

  getThread(id: string): Thread | null {
    const row = this.db.select().from(threads).where(eq(threads.id, id)).get() as Thread | undefined;
    return row ?? null;
  }

  listAll(): Thread[] {
    return this.db.select().from(threads).all() as Thread[];
  }

  rename(id: string, title: string): void {
    const updatedAt = new Date().toISOString();
    this.db.run(sql`UPDATE threads SET title = ${title}, updated_at = ${updatedAt} WHERE id = ${id}`);
  }

  deleteThread(id: string): void {
    this.db.run(sql`DELETE FROM thread_sessions WHERE thread_id = ${id}`);
    this.db.run(sql`DELETE FROM threads WHERE id = ${id}`);
  }

  upsertSession(session: ThreadSession): void {
    const thread = this.getThread(session.threadId);
    if (!thread) throw new Error(`Cannot persist session for missing thread ${session.threadId}`);
    if (thread.agent !== session.provider) {
      throw new Error(`Session provider ${session.provider} must match thread agent ${thread.agent}`);
    }
    this.db
      .insert(threadSessions)
      .values({
        threadId: session.threadId,
        provider: session.provider,
        resumeId: session.resumeId ?? null,
        initialPrompt: session.initialPrompt ?? null,
        titleCapturedAt: session.titleCapturedAt ?? null,
        launchMode: session.launchMode,
        status: session.status,
        lastActivityAt: session.lastActivityAt,
        metadataJson: session.metadataJson ?? null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
      .onConflictDoUpdate({
        target: threadSessions.threadId,
        set: {
          provider: sql`excluded.provider`,
          resumeId: sql`excluded.resume_id`,
          initialPrompt: sql`excluded.initial_prompt`,
          titleCapturedAt: sql`excluded.title_captured_at`,
          launchMode: sql`excluded.launch_mode`,
          status: sql`excluded.status`,
          lastActivityAt: sql`excluded.last_activity_at`,
          metadataJson: sql`excluded.metadata_json`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .run();
  }

  deleteSession(threadId: string): void {
    this.db.delete(threadSessions).where(eq(threadSessions.threadId, threadId)).run();
  }

  getSession(threadId: string): ThreadSession | null {
    const row = this.db.select().from(threadSessions).where(eq(threadSessions.threadId, threadId)).get() as ThreadSession | undefined;
    return row ?? null;
  }

  listSessions(): ThreadSession[] {
    return this.db.select().from(threadSessions).all() as ThreadSession[];
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/ThreadStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add electron/storage/stores/ThreadStore.ts electron/storage/__tests__/ThreadStore.test.ts
git commit -m "feat(storage): add ThreadStore with Drizzle"
```

---

## Task 7: RunStore

**Files:**
- Create: `electron/storage/stores/RunStore.ts`

- [ ] **Step 1: Implement RunStore (no public-facing query methods; only cascade-delete helpers)**

```ts
// electron/storage/stores/RunStore.ts
import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";

export class RunStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(thread_id) REFERENCES threads(id)
      )
    `);
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES runs(id)
      )
    `);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_runs_thread_id ON runs(thread_id)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_events_run_id ON run_events(run_id)`);
  }

  deleteByThread(threadId: string): void {
    this.db.run(sql`DELETE FROM run_events WHERE run_id IN (SELECT id FROM runs WHERE thread_id = ${threadId})`);
    this.db.run(sql`DELETE FROM runs WHERE thread_id = ${threadId}`);
  }

  deleteByWorktree(worktreeId: string): void {
    this.db.run(sql`
      DELETE FROM run_events
      WHERE run_id IN (
        SELECT r.id FROM runs r
        INNER JOIN threads t ON t.id = r.thread_id
        WHERE t.worktree_id = ${worktreeId}
      )
    `);
    this.db.run(sql`
      DELETE FROM runs WHERE thread_id IN (SELECT id FROM threads WHERE worktree_id = ${worktreeId})
    `);
  }

  deleteByProject(projectId: string): void {
    this.db.run(sql`
      DELETE FROM run_events
      WHERE run_id IN (
        SELECT r.id FROM runs r
        INNER JOIN threads t ON t.id = r.thread_id
        WHERE t.project_id = ${projectId}
      )
    `);
    this.db.run(sql`
      DELETE FROM runs WHERE thread_id IN (SELECT id FROM threads WHERE project_id = ${projectId})
    `);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/storage/stores/RunStore.ts
git commit -m "feat(storage): add RunStore with Drizzle"
```

---

## Task 8: NotificationStore

**Files:**
- Create: `electron/storage/stores/NotificationStore.ts`
- Create: `electron/storage/__tests__/NotificationStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/storage/__tests__/NotificationStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { NotificationStore } from "../stores/NotificationStore";
import type { AppDatabase } from "../db";

function makeNotification(overrides = {}) {
  return {
    id: "n-1", threadId: "t-1", projectId: "p-1",
    kind: "run_completed", threadTitle: "My thread",
    projectName: "My project", read: 0,
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("NotificationStore", () => {
  let db: AppDatabase;
  let store: NotificationStore;

  beforeEach(() => {
    db = createTestDb();
    store = new NotificationStore(db);
    store.initialize();
  });

  it("upserts and lists notifications newest first", () => {
    store.upsert(makeNotification({ id: "n-1", createdAt: "2024-01-01T00:00:00Z" }));
    store.upsert(makeNotification({ id: "n-2", createdAt: "2024-01-02T00:00:00Z" }));
    const list = store.list(20);
    expect(list[0].id).toBe("n-2");
    expect(list[1].id).toBe("n-1");
  });

  it("markRead sets read flag", () => {
    store.upsert(makeNotification());
    store.markRead("n-1");
    expect(store.list(20)[0].read).toBe(1);
  });

  it("markAllRead sets all read flags", () => {
    store.upsert(makeNotification({ id: "n-1" }));
    store.upsert(makeNotification({ id: "n-2" }));
    store.markAllRead();
    expect(store.list(20).every((n) => n.read === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/NotificationStore.test.ts
```

- [ ] **Step 3: Implement NotificationStore**

```ts
// electron/storage/stores/NotificationStore.ts
import { sql, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import { notifications } from "../schema.js";

type NotificationRow = typeof notifications.$inferSelect;

export class NotificationStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        thread_title TEXT NOT NULL,
        project_name TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    this.db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC)
    `);
  }

  upsert(notification: NotificationRow): void {
    this.db
      .insert(notifications)
      .values(notification)
      .onConflictDoUpdate({
        target: notifications.id,
        set: {
          threadId: sql`excluded.thread_id`,
          projectId: sql`excluded.project_id`,
          kind: sql`excluded.kind`,
          threadTitle: sql`excluded.thread_title`,
          projectName: sql`excluded.project_name`,
          read: sql`excluded.read`,
          createdAt: sql`excluded.created_at`,
        },
      })
      .run();
  }

  list(limit: number): NotificationRow[] {
    return this.db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .all() as NotificationRow[];
  }

  markRead(id: string): void {
    this.db.run(sql`UPDATE notifications SET read = 1 WHERE id = ${id}`);
  }

  markAllRead(): void {
    this.db.run(sql`UPDATE notifications SET read = 1`);
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/NotificationStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add electron/storage/stores/NotificationStore.ts electron/storage/__tests__/NotificationStore.test.ts
git commit -m "feat(storage): add NotificationStore with Drizzle"
```

---

## Task 9: SettingsStore

**Files:**
- Create: `electron/storage/stores/SettingsStore.ts`
- Create: `electron/storage/__tests__/SettingsStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/storage/__tests__/SettingsStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { SettingsStore } from "../stores/SettingsStore";
import type { AppDatabase } from "../db";

describe("SettingsStore", () => {
  let db: AppDatabase;
  let store: SettingsStore;

  beforeEach(() => {
    db = createTestDb();
    store = new SettingsStore(db);
    store.initialize();
  });

  it("returns null active state after init", () => {
    const state = store.getActiveState();
    expect(state.activeProjectId).toBeNull();
    expect(state.activeWorktreeId).toBeNull();
    expect(state.activeThreadId).toBeNull();
  });

  it("sets and gets active state", () => {
    store.setRawActiveState("p-1", "wt-1", "t-1");
    const state = store.getActiveState();
    expect(state.activeProjectId).toBe("p-1");
    expect(state.activeWorktreeId).toBe("wt-1");
    expect(state.activeThreadId).toBe("t-1");
  });

  it("gets default GitHub PR settings", () => {
    const s = store.getGitHubPrSettings();
    expect(s.token).toBe("");
    expect(s.owner).toBe("");
    expect(s.repo).toBe("");
  });

  it("sets and gets GitHub PR settings", () => {
    store.setGitHubPrSettings({ token: "tok", owner: "me", repo: "my-repo" });
    const s = store.getGitHubPrSettings();
    expect(s.token).toBe("tok");
    expect(s.owner).toBe("me");
    expect(s.repo).toBe("my-repo");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/SettingsStore.test.ts
```

- [ ] **Step 3: Implement SettingsStore**

```ts
// electron/storage/stores/SettingsStore.ts
import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import { appState, githubPrSettings } from "../schema.js";

type ActiveState = { activeProjectId: string | null; activeWorktreeId: string | null; activeThreadId: string | null };

export class SettingsStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_project_id TEXT,
        active_worktree_id TEXT,
        active_thread_id TEXT
      )
    `);
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS github_pr_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        token TEXT NOT NULL DEFAULT '',
        owner TEXT NOT NULL DEFAULT '',
        repo TEXT NOT NULL DEFAULT ''
      )
    `);
    this.db.run(sql`
      INSERT OR IGNORE INTO app_state (id, active_project_id, active_worktree_id, active_thread_id)
      VALUES (1, NULL, NULL, NULL)
    `);
    this.db.run(sql`
      INSERT OR IGNORE INTO github_pr_settings (id, token, owner, repo) VALUES (1, '', '', '')
    `);
  }

  getActiveState(): ActiveState {
    const row = this.db.select().from(appState).get() as ActiveState | undefined;
    return row ?? { activeProjectId: null, activeWorktreeId: null, activeThreadId: null };
  }

  setRawActiveState(projectId: string | null, worktreeId: string | null, threadId: string | null): void {
    this.db.run(sql`
      UPDATE app_state SET active_project_id = ${projectId}, active_worktree_id = ${worktreeId}, active_thread_id = ${threadId}
      WHERE id = 1
    `);
  }

  getGitHubPrSettings(): { token: string; owner: string; repo: string } {
    const row = this.db.select().from(githubPrSettings).get() as { token: string; owner: string; repo: string } | undefined;
    return row ?? { token: "", owner: "", repo: "" };
  }

  setGitHubPrSettings(payload: { token: string; owner: string; repo: string }): void {
    this.db
      .insert(githubPrSettings)
      .values({ id: 1, ...payload })
      .onConflictDoUpdate({
        target: githubPrSettings.id,
        set: { token: sql`excluded.token`, owner: sql`excluded.owner`, repo: sql`excluded.repo` },
      })
      .run();
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/SettingsStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add electron/storage/stores/SettingsStore.ts electron/storage/__tests__/SettingsStore.test.ts
git commit -m "feat(storage): add SettingsStore with Drizzle"
```

---

## Task 10: WorkspaceStore coordinator

**Files:**
- Create: `electron/storage/WorkspaceStore.ts`
- Modify: `electron/storage/__tests__/store.test.ts` (update import path)

- [ ] **Step 1: Create WorkspaceStore.ts**

```ts
// electron/storage/WorkspaceStore.ts
import { sql } from "drizzle-orm";
import type { WorkspaceSnapshot } from "../src/shared/ipc.js";
import type { AppDatabase } from "./db.js";
import { ProjectStore } from "./stores/ProjectStore.js";
import { WorktreeStore } from "./stores/WorktreeStore.js";
import { ThreadStore } from "./stores/ThreadStore.js";
import { RunStore } from "./stores/RunStore.js";
import { NotificationStore } from "./stores/NotificationStore.js";
import { SettingsStore } from "./stores/SettingsStore.js";
import type { WorktreeEditorState } from "../src/shared/ipc.js";

export class WorkspaceStore {
  readonly projects: ProjectStore;
  readonly worktrees: WorktreeStore;
  readonly threads: ThreadStore;
  readonly runs: RunStore;
  readonly notifications: NotificationStore;
  readonly settings: SettingsStore;

  constructor(private readonly db: AppDatabase) {
    this.projects = new ProjectStore(db);
    this.worktrees = new WorktreeStore(db);
    this.threads = new ThreadStore(db);
    this.runs = new RunStore(db);
    this.notifications = new NotificationStore(db);
    this.settings = new SettingsStore(db);
  }

  /** Call once on startup — each store creates/migrates its own tables. */
  migrate(): void {
    this.projects.initialize();
    this.worktrees.initialize();
    this.threads.initialize();
    this.runs.initialize();
    this.notifications.initialize();
    this.settings.initialize();
    this.repairIntegrity();
  }

  private repairIntegrity(): void {
    this.db.run(sql`
      UPDATE projects SET last_active_worktree_id = NULL
      WHERE last_active_worktree_id IS NOT NULL
        AND last_active_worktree_id NOT IN (SELECT id FROM worktrees)
    `);
    this.db.run(sql`
      UPDATE worktrees SET last_active_thread_id = NULL
      WHERE last_active_thread_id IS NOT NULL
        AND last_active_thread_id NOT IN (SELECT id FROM threads)
    `);
    this.db.run(sql`
      DELETE FROM thread_sessions WHERE thread_id NOT IN (SELECT id FROM threads)
    `);
    this.db.run(sql`
      UPDATE app_state SET
        active_worktree_id = CASE
          WHEN active_worktree_id IS NOT NULL AND active_worktree_id NOT IN (SELECT id FROM worktrees)
          THEN NULL ELSE active_worktree_id END,
        active_thread_id = CASE
          WHEN active_thread_id IS NOT NULL AND active_thread_id NOT IN (SELECT id FROM threads)
          THEN NULL ELSE active_thread_id END
      WHERE id = 1
    `);
    this.db.run(sql`
      DELETE FROM worktree_editor_state WHERE worktree_id NOT IN (SELECT id FROM worktrees)
    `);
  }

  getSnapshot(): WorkspaceSnapshot {
    const projects = this.projects.list();
    const allWorktrees = this.worktrees.listAll();
    const worktrees = allWorktrees.map((w) => ({ ...w, baseBranch: w.baseBranch ?? null }));
    const rawThreads = this.threads.listAll();
    const threadsSorted = [...rawThreads].sort((a, b) => {
      const byWt = a.worktreeId.localeCompare(b.worktreeId);
      if (byWt !== 0) return byWt;
      const byCreated = b.createdAt.localeCompare(a.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.id.localeCompare(b.id);
    });
    const threadSessions = this.threads.listSessions();
    const active = this.settings.getActiveState();
    return {
      projects,
      worktrees,
      threads: threadsSorted,
      threadSessions,
      activeProjectId: active.activeProjectId,
      activeWorktreeId: active.activeWorktreeId,
      activeThreadId: active.activeThreadId,
    };
  }

  setActiveState(
    activeProjectId: string | null,
    activeWorktreeId: string | null,
    activeThreadId: string | null
  ): void {
    let resolvedWorktreeId = activeWorktreeId;
    let resolvedThreadId = activeThreadId;

    if (activeProjectId && resolvedWorktreeId == null) {
      const row = this.db.get<{ worktreeId: string | null }>(sql`
        SELECT p.last_active_worktree_id AS worktreeId
        FROM projects p
        WHERE p.id = ${activeProjectId}
          AND EXISTS (SELECT 1 FROM worktrees w WHERE w.id = p.last_active_worktree_id AND w.project_id = p.id)
      `);
      resolvedWorktreeId = row?.worktreeId ?? null;
    }

    if (resolvedWorktreeId) {
      if (resolvedThreadId == null) {
        const row = this.db.get<{ threadId: string | null }>(sql`
          SELECT w.last_active_thread_id AS threadId
          FROM worktrees w
          WHERE w.id = ${resolvedWorktreeId}
            AND EXISTS (SELECT 1 FROM threads t WHERE t.id = w.last_active_thread_id AND t.worktree_id = w.id)
        `);
        resolvedThreadId = row?.threadId ?? null;
      } else {
        const matches = this.db.get<{ v: number }>(sql`
          SELECT 1 AS v FROM threads WHERE id = ${resolvedThreadId} AND worktree_id = ${resolvedWorktreeId} LIMIT 1
        `);
        if (!matches) {
          resolvedThreadId = null;
        } else {
          this.worktrees.setLastActiveThread(resolvedWorktreeId, resolvedThreadId);
        }
      }
      if (activeProjectId) {
        const matchesProject = this.db.get<{ v: number }>(sql`
          SELECT 1 AS v FROM worktrees WHERE id = ${resolvedWorktreeId} AND project_id = ${activeProjectId} LIMIT 1
        `);
        if (matchesProject) {
          this.projects.setLastActiveWorktree(activeProjectId, resolvedWorktreeId);
        } else {
          resolvedWorktreeId = null;
          resolvedThreadId = null;
        }
      }
    } else {
      resolvedThreadId = null;
    }

    this.settings.setRawActiveState(activeProjectId, resolvedWorktreeId, resolvedThreadId);
  }

  upsertProject(project: Parameters<ProjectStore["upsert"]>[0]): void {
    this.projects.upsert(project);
  }

  nextProjectTabOrder(): number {
    return this.projects.nextTabOrder();
  }

  reorderProjects(orderedIds: string[]): void {
    this.projects.reorder(orderedIds);
  }

  deleteProject(projectId: string): void {
    const remaining = this.db.all<{ id: string }>(sql`
      SELECT id FROM projects WHERE id != ${projectId} ORDER BY tab_order ASC, id ASC
    `);
    const nextProjectId = remaining[0]?.id ?? null;
    const nextWorktreeId = nextProjectId
      ? (this.db.get<{ id: string }>(sql`
          SELECT id FROM worktrees WHERE project_id = ${nextProjectId}
          ORDER BY is_default DESC, updated_at DESC, id ASC LIMIT 1
        `)?.id ?? null)
      : null;
    const nextThreadId = nextWorktreeId
      ? (this.db.get<{ id: string }>(sql`
          SELECT id FROM threads WHERE worktree_id = ${nextWorktreeId}
          ORDER BY created_at DESC, id ASC LIMIT 1
        `)?.id ?? null)
      : null;

    this.db.transaction((tx) => {
      tx.run(sql`
        UPDATE projects SET last_active_worktree_id = NULL
        WHERE last_active_worktree_id IN (SELECT id FROM worktrees WHERE project_id = ${projectId})
      `);
      tx.run(sql`
        UPDATE app_state SET active_project_id = ${nextProjectId}, active_worktree_id = ${nextWorktreeId},
          active_thread_id = ${nextThreadId} WHERE id = 1
      `);
      this.runs.deleteByProject(projectId);
      tx.run(sql`DELETE FROM thread_sessions WHERE thread_id IN (SELECT id FROM threads WHERE project_id = ${projectId})`);
      tx.run(sql`DELETE FROM threads WHERE project_id = ${projectId}`);
      tx.run(sql`DELETE FROM worktrees WHERE project_id = ${projectId}`);
      tx.run(sql`DELETE FROM projects WHERE id = ${projectId}`);
    });
  }

  upsertWorktree(worktree: Parameters<WorktreeStore["upsert"]>[0]): void {
    this.worktrees.upsert(worktree);
  }

  deleteWorktreeGroup(worktreeId: string): void {
    this.db.transaction((tx) => {
      tx.run(sql`UPDATE projects SET last_active_worktree_id = NULL WHERE last_active_worktree_id = ${worktreeId}`);
      tx.run(sql`UPDATE app_state SET active_worktree_id = NULL WHERE active_worktree_id = ${worktreeId}`);
      tx.run(sql`
        UPDATE app_state SET active_thread_id = NULL
        WHERE active_thread_id IN (SELECT id FROM threads WHERE worktree_id = ${worktreeId})
      `);
      this.runs.deleteByWorktree(worktreeId);
      tx.run(sql`DELETE FROM thread_sessions WHERE thread_id IN (SELECT id FROM threads WHERE worktree_id = ${worktreeId})`);
      tx.run(sql`DELETE FROM threads WHERE worktree_id = ${worktreeId}`);
      tx.run(sql`DELETE FROM worktrees WHERE id = ${worktreeId}`);
    });
  }

  upsertThread(thread: Parameters<ThreadStore["upsertThread"]>[0]): void {
    this.threads.upsertThread(thread);
  }

  deleteThread(id: string): void {
    this.runs.deleteByThread(id);
    this.threads.deleteThread(id);
    this.worktrees.setLastActiveThread(id, null); // clears worktrees pointing to this thread
    this.db.run(sql`
      UPDATE worktrees SET last_active_thread_id = NULL WHERE last_active_thread_id = ${id}
    `);
    this.db.run(sql`
      UPDATE app_state SET active_thread_id = CASE WHEN active_thread_id = ${id} THEN NULL ELSE active_thread_id END
      WHERE id = 1
    `);
  }

  renameThread(id: string, title: string): void {
    this.threads.rename(id, title);
  }

  getThread(id: string): ReturnType<ThreadStore["getThread"]> {
    return this.threads.getThread(id);
  }

  upsertThreadSession(session: Parameters<ThreadStore["upsertSession"]>[0]): void {
    this.threads.upsertSession(session);
  }

  deleteThreadSession(threadId: string): void {
    this.threads.deleteSession(threadId);
  }

  getThreadSession(threadId: string): ReturnType<ThreadStore["getSession"]> {
    return this.threads.getSession(threadId);
  }

  listThreadSessions(): ReturnType<ThreadStore["listSessions"]> {
    return this.threads.listSessions();
  }

  getWorktreeEditorState(worktreeId: string): WorktreeEditorState | null {
    return this.worktrees.getEditorState(worktreeId);
  }

  setWorktreeEditorState(worktreeId: string, selectedFilePath: string | null, openFilePaths: string[]): void {
    const worktreeExists = this.db.get<{ v: number }>(sql`SELECT 1 AS v FROM worktrees WHERE id = ${worktreeId} LIMIT 1`);
    if (!worktreeExists) throw new Error(`Cannot persist editor state for missing worktree ${worktreeId}`);
    this.worktrees.setEditorState(worktreeId, selectedFilePath, openFilePaths);
  }

  getGitHubPrSettings(): { token: string; owner: string; repo: string } {
    return this.settings.getGitHubPrSettings();
  }

  setGitHubPrSettings(payload: { token: string; owner: string; repo: string }): void {
    this.settings.setGitHubPrSettings(payload);
  }

  captureResumeId(threadId: string, resumeId: string): boolean {
    const thread = this.threads.getThread(threadId);
    if (!thread) return false;
    this.threads.upsertThread({ ...thread, resumeId });
    return true;
  }
}
```

- [ ] **Step 2: Update existing store.test.ts import**

Change line 14 of `electron/storage/__tests__/store.test.ts`:
```ts
// Before:
import { WorkspaceStore } from "../store";
// After:
import { WorkspaceStore } from "../WorkspaceStore";
```

Also update the `store` construction. Current pattern:
```ts
const store = new WorkspaceStore(tmpDir);
store.migrate(schemaSql);
```

New pattern (the constructor now takes an `AppDatabase`):
```ts
import { openDatabase } from "../db";
// ...
const db = openDatabase(tmpDir);
const store = new WorkspaceStore(db);
store.migrate();
```

Update the test file's helper function and `afterEach` accordingly. Remove the `CURRENT_SCHEMA_PATH` constant and `schemaSql` reads.

- [ ] **Step 3: Run full test suite — expect all tests PASS**

```bash
cd apps/desktop && pnpm test electron/storage/__tests__/
```

Expected: All tests pass with no failures.

- [ ] **Step 4: Commit**

```bash
git add electron/storage/WorkspaceStore.ts electron/storage/__tests__/store.test.ts
git commit -m "feat(storage): add WorkspaceStore coordinator with Drizzle"
```

---

## Task 11: Wire mainApp.ts

**Files:**
- Modify: `electron/mainApp.ts`

- [ ] **Step 1: Find all store references in mainApp.ts**

```bash
grep -n 'WorkspaceStore\|store\.\|schemaSql\|schema\.sql\|readWorkspaceSchemaSql' electron/mainApp.ts | head -30
```

- [ ] **Step 2: Update import and initialization**

Replace the store import and initialization block. Find the section that looks like:

```ts
import { WorkspaceStore } from "./storage/store.js";
// ...
function readWorkspaceSchemaSql(): string { ... }
// ...
const schemaSql = readWorkspaceSchemaSql();
const store = new WorkspaceStore(baseDir);
store.migrate(schemaSql);
```

Replace with:

```ts
import { openDatabase } from "./storage/db.js";
import { WorkspaceStore } from "./storage/WorkspaceStore.js";
// ...
const db = openDatabase(baseDir);
const store = new WorkspaceStore(db);
store.migrate();
```

Remove the `readWorkspaceSchemaSql` function entirely.

- [ ] **Step 3: Typecheck**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add electron/mainApp.ts
git commit -m "feat(storage): wire Drizzle WorkspaceStore in mainApp"
```

---

## Task 12: Clean up old files

**Files:**
- Delete: `electron/storage/store.ts`
- Delete: `electron/storage/schema.sql`

- [ ] **Step 1: Delete old files**

```bash
rm apps/desktop/electron/storage/store.ts
rm apps/desktop/electron/storage/schema.sql
```

- [ ] **Step 2: Run full test suite — all pass**

```bash
cd apps/desktop && pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Typecheck**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(storage): remove legacy store.ts and schema.sql"
```

---

## Self-Review Checklist

- [x] All 10 tables defined in schema.ts
- [x] All `pragma_table_info` column guards preserved in each store's `initialize()`
- [x] `migrateThreadsDropSortOrderIfNeeded` preserved in ThreadStore
- [x] `repairIntegrity` runs cross-table cleanup on startup
- [x] `captureResumeId` on coordinator (used by lifecycle/quitResumeCapture.ts)
- [x] `deleteThread` correctly clears `worktrees.last_active_thread_id`
- [x] `setActiveState` complex fallback logic preserved verbatim in coordinator
- [x] `store.test.ts` updated to use new WorkspaceStore constructor
- [x] All existing public methods on coordinator match old `store.ts` API
- [x] `schema.sql` removed after TypeScript passes
