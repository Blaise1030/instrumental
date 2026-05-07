# Drizzle ORM Migration Design

**Date:** 2026-05-07  
**Scope:** Replace raw `better-sqlite3` SQL in `electron/storage/` with Drizzle ORM, split `WorkspaceStore` into focused services.

---

## Goal

Replace the monolithic `WorkspaceStore` (raw SQL, inline migration guards) with:
- A typed Drizzle schema as the single source of truth
- Small focused store classes using Drizzle's query builder
- Each store managing its own schema setup via `initialize()`
- A thin coordinator that preserves the existing public API

No migration files. No `drizzle-kit migrate`. Schema is applied on startup ("push" model).

---

## Architecture

### Directory layout

```
electron/storage/
  schema.ts                  ← Drizzle table definitions (single source of truth)
  db.ts                      ← creates BetterSQLite3 db instance + Drizzle wrapper
  stores/
    ProjectStore.ts
    WorktreeStore.ts
    ThreadStore.ts
    RunStore.ts
    NotificationStore.ts
    SettingsStore.ts
  WorkspaceStore.ts           ← thin coordinator (replaces current store.ts)
  schema.sql                  ← DELETED (superseded by schema.ts)
```

### Drizzle dialect

`drizzle-orm/better-sqlite3` with `BetterSQLite3Database` as the db type passed to each store.

---

## Schema (`schema.ts`)

Defines all tables using `sqliteTable`. This file is imported by every store for type-safe queries.

Tables defined:
- `projects`
- `worktrees`
- `threads` (includes `resumeId` column added in previous session)
- `threadSessions`
- `runs`
- `runEvents`
- `appState`
- `worktreeEditorState`
- `notifications`
- `githubPrSettings`

Column types map directly from the existing `schema.sql`. Boolean columns (`is_active`, `is_default`) remain as `integer` in SQLite; stores convert to/from `boolean` as today.

---

## Database setup (`db.ts`)

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function openDatabase(baseDir: string, filename = "workspace.db") {
  const sqlite = new Database(path.join(baseDir, filename));
  sqlite.exec("PRAGMA foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof openDatabase>;
```

---

## Focused stores

Each store:
- Receives `AppDatabase` in its constructor
- Exposes an `initialize()` method that runs `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` guards (same logic as current `migrate()`, scoped to its tables)
- Uses Drizzle query builder (`db.select`, `db.insert`, `db.update`, `db.delete`) for all CRUD

### `ProjectStore`
Methods: `upsert`, `delete`, `nextTabOrder`, `reorder`, `list`  
Schema setup: `projects` table + `last_active_worktree_id`, `tab_order` column guards

### `WorktreeStore`
Methods: `upsert`, `delete`, `getEditorState`, `setEditorState`, `list`  
Schema setup: `worktrees` table + `is_default`, `base_branch`, `last_active_thread_id` column guards; `worktree_editor_state` table + `open_file_paths_json` guard

### `ThreadStore`
Methods: `upsert`, `delete`, `rename`, `get`, `list`, `upsertSession`, `deleteSession`, `getSession`, `listSessions`  
Schema setup: `threads` table + `created_branch`, `resume_id` column guards; `thread_sessions` table

### `RunStore`
Methods: `deleteByThread`, `deleteByWorktree`, `deleteByProject`  
Schema setup: `runs`, `run_events` tables

### `NotificationStore`
Methods: `list`, `markRead`, `markAllRead`, `upsert`  
Schema setup: `notifications` table

### `SettingsStore`
Methods: `getActiveState`, `setActiveState`, `getGitHubPrSettings`, `setGitHubPrSettings`  
Schema setup: `app_state`, `github_pr_settings` tables + seed rows

---

## Coordinator (`WorkspaceStore`)

Thin class that:
- Holds references to all focused stores
- Exposes `getSnapshot()` — queries each store and assembles `WorkspaceSnapshot`
- Exposes `setActiveState()` — delegates to `SettingsStore` + cross-table resolution logic
- Exposes `deleteProject()`, `deleteWorktreeGroup()`, `deleteThread()` — runs cross-store transactions using `db.transaction()`
- Exposes `migrate()` — calls `store.initialize()` on each focused store in dependency order (projects → worktrees → threads → ...)

The coordinator's public method signatures are **identical** to the current `WorkspaceStore` so `mainApp.ts` IPC handlers require no changes.

---

## Migration strategy

No drizzle-kit migration files. On startup:

1. `WorkspaceStore.migrate()` calls each store's `initialize()` in order
2. Each `initialize()` runs its own DDL: `CREATE TABLE IF NOT EXISTS` + column existence checks via `pragma_table_info`
3. Existing data is untouched; new columns get `NULL` defaults

The `schema.sql` file is deleted — the TypeScript schema is now authoritative.

---

## Dependencies to add

```
drizzle-orm        (runtime)
drizzle-kit        (devDependency — for schema introspection tooling, not migrations)
```

`better-sqlite3` is already installed.

---

## What does NOT change

- `src/shared/domain.ts` — `Thread`, `ThreadSession`, `Project`, etc. types are unchanged
- `electron/mainApp.ts` — IPC handlers call the same `WorkspaceStore` methods
- `env.d.ts`, preload, renderer code — no changes needed
- Test files in `electron/storage/__tests__/` — updated to use new store structure

---

## Out of scope

- Switching away from `better-sqlite3`
- Adding Drizzle relations / relational query API
- Running drizzle-kit migrations in CI
