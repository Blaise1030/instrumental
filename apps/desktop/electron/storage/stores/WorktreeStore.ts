import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import type { Worktree } from "../../src/shared/domain.js";
import type { WorktreeEditorState } from "../../src/shared/ipc.js";

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
        updated_at TEXT NOT NULL
      )
    `);

    // Column migration guards
    const hasIsDefault = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('worktrees') WHERE name = 'is_default' LIMIT 1
    `);
    if (!hasIsDefault) {
      this.db.run(sql`ALTER TABLE worktrees ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`);
    }

    const hasBaseBranch = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('worktrees') WHERE name = 'base_branch' LIMIT 1
    `);
    if (!hasBaseBranch) {
      this.db.run(sql`ALTER TABLE worktrees ADD COLUMN base_branch TEXT`);
    }

    const hasLastActiveThreadId = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('worktrees') WHERE name = 'last_active_thread_id' LIMIT 1
    `);
    if (!hasLastActiveThreadId) {
      this.db.run(sql`ALTER TABLE worktrees ADD COLUMN last_active_thread_id TEXT`);
    }

    // Indexes
    this.db.run(sql`
      CREATE INDEX IF NOT EXISTS worktrees_project_id_idx ON worktrees (project_id)
    `);

    // worktree_editor_state table
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS worktree_editor_state (
        worktree_id TEXT PRIMARY KEY,
        selected_file_path TEXT,
        open_file_paths_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      )
    `);

    const hasOpenFilePaths = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('worktree_editor_state') WHERE name = 'open_file_paths_json' LIMIT 1
    `);
    if (!hasOpenFilePaths) {
      this.db.run(sql`ALTER TABLE worktree_editor_state ADD COLUMN open_file_paths_json TEXT NOT NULL DEFAULT '[]'`);
    }
  }

  upsert(worktree: Worktree): void {
    this.db.run(sql`
      INSERT INTO worktrees (
        id, project_id, name, branch, path,
        is_active, is_default, base_branch, last_active_thread_id,
        created_at, updated_at
      )
      VALUES (
        ${worktree.id},
        ${worktree.projectId},
        ${worktree.name},
        ${worktree.branch},
        ${worktree.path},
        ${worktree.isActive ? 1 : 0},
        ${worktree.isDefault ? 1 : 0},
        ${worktree.baseBranch ?? null},
        ${worktree.lastActiveThreadId ?? null},
        ${worktree.createdAt},
        ${worktree.updatedAt}
      )
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        name = excluded.name,
        branch = excluded.branch,
        path = excluded.path,
        is_active = excluded.is_active,
        is_default = excluded.is_default,
        base_branch = excluded.base_branch,
        last_active_thread_id = excluded.last_active_thread_id,
        updated_at = excluded.updated_at
    `);
  }

  private rowToWorktree(row: {
    id: string;
    projectId: string;
    name: string;
    branch: string;
    path: string;
    isActive: number;
    isDefault: number;
    baseBranch: string | null;
    lastActiveThreadId: string | null;
    createdAt: string;
    updatedAt: string;
  }): Worktree {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      branch: row.branch,
      path: row.path,
      isActive: row.isActive !== 0,
      isDefault: row.isDefault !== 0,
      baseBranch: row.baseBranch,
      lastActiveThreadId: row.lastActiveThreadId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  listAll(): Worktree[] {
    const rows = this.db.all<{
      id: string;
      projectId: string;
      name: string;
      branch: string;
      path: string;
      isActive: number;
      isDefault: number;
      baseBranch: string | null;
      lastActiveThreadId: string | null;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        id,
        project_id AS projectId,
        name,
        branch,
        path,
        is_active AS isActive,
        is_default AS isDefault,
        base_branch AS baseBranch,
        last_active_thread_id AS lastActiveThreadId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM worktrees
      ORDER BY created_at ASC, id ASC
    `);
    return rows.map((r) => this.rowToWorktree(r));
  }

  listByProject(projectId: string): Worktree[] {
    const rows = this.db.all<{
      id: string;
      projectId: string;
      name: string;
      branch: string;
      path: string;
      isActive: number;
      isDefault: number;
      baseBranch: string | null;
      lastActiveThreadId: string | null;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        id,
        project_id AS projectId,
        name,
        branch,
        path,
        is_active AS isActive,
        is_default AS isDefault,
        base_branch AS baseBranch,
        last_active_thread_id AS lastActiveThreadId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM worktrees
      WHERE project_id = ${projectId}
      ORDER BY created_at ASC, id ASC
    `);
    return rows.map((r) => this.rowToWorktree(r));
  }

  setLastActiveThread(worktreeId: string, threadId: string | null): void {
    this.db.run(sql`
      UPDATE worktrees SET last_active_thread_id = ${threadId} WHERE id = ${worktreeId}
    `);
  }

  getEditorState(worktreeId: string): WorktreeEditorState | null {
    const row = this.db.get<{
      worktreeId: string;
      selectedFilePath: string | null;
      openFilePathsJson: string;
      updatedAt: string;
    }>(sql`
      SELECT
        worktree_id AS worktreeId,
        selected_file_path AS selectedFilePath,
        open_file_paths_json AS openFilePathsJson,
        updated_at AS updatedAt
      FROM worktree_editor_state
      WHERE worktree_id = ${worktreeId}
    `);
    if (!row) return null;
    return {
      worktreeId: row.worktreeId,
      selectedFilePath: row.selectedFilePath,
      openFilePaths: JSON.parse(row.openFilePathsJson ?? "[]"),
      updatedAt: row.updatedAt,
    };
  }

  setEditorState(
    worktreeId: string,
    selectedFilePath: string | null,
    openFilePaths: string[]
  ): void {
    const now = new Date().toISOString();
    this.db.run(sql`
      INSERT INTO worktree_editor_state (worktree_id, selected_file_path, open_file_paths_json, updated_at)
      VALUES (
        ${worktreeId},
        ${selectedFilePath ?? null},
        ${JSON.stringify(openFilePaths)},
        ${now}
      )
      ON CONFLICT(worktree_id) DO UPDATE SET
        selected_file_path = excluded.selected_file_path,
        open_file_paths_json = excluded.open_file_paths_json,
        updated_at = excluded.updated_at
    `);
  }
}
