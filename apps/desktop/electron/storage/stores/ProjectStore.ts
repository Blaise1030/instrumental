import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
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
    const hasLastActive = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'last_active_worktree_id' LIMIT 1
    `);
    if (!hasLastActive) {
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
    this.db.run(sql`
      INSERT INTO projects (id, name, repo_path, status, last_active_worktree_id, tab_order, created_at, updated_at)
      VALUES (
        ${project.id},
        ${project.name},
        ${project.repoPath},
        ${project.status},
        ${project.lastActiveWorktreeId ?? null},
        ${project.tabOrder},
        ${project.createdAt},
        ${project.updatedAt}
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        repo_path = excluded.repo_path,
        status = excluded.status,
        last_active_worktree_id = excluded.last_active_worktree_id,
        tab_order = excluded.tab_order,
        updated_at = excluded.updated_at
    `);
  }

  list(): Project[] {
    return this.db.all<{
      id: string;
      name: string;
      repoPath: string;
      status: string;
      lastActiveWorktreeId: string | null;
      tabOrder: number;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        id,
        name,
        repo_path AS repoPath,
        status,
        last_active_worktree_id AS lastActiveWorktreeId,
        tab_order AS tabOrder,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM projects
      ORDER BY tab_order ASC, id ASC
    `) as Project[];
  }

  nextTabOrder(): number {
    const row = this.db.get<{ m: number | null }>(sql`SELECT MIN(tab_order) AS m FROM projects`);
    const min = row?.m;
    return min == null ? 0 : min - 1;
  }

  reorder(orderedIds: string[]): void {
    const existing = this.db.all<{ id: string }>(sql`SELECT id FROM projects`);
    const idSet = new Set(existing.map((r) => r.id));
    if (orderedIds.length !== idSet.size || new Set(orderedIds).size !== orderedIds.length) {
      throw new Error("reorderProjects: ordered list must include each project exactly once");
    }
    for (const id of orderedIds) {
      if (!idSet.has(id)) throw new Error(`reorderProjects: unknown project id ${id}`);
    }
    this.db.run(sql`BEGIN`);
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        this.db.run(sql`UPDATE projects SET tab_order = ${i} WHERE id = ${orderedIds[i]}`);
      }
      this.db.run(sql`COMMIT`);
    } catch (error) {
      this.db.run(sql`ROLLBACK`);
      throw error;
    }
  }

  setLastActiveWorktree(projectId: string, worktreeId: string | null): void {
    this.db.run(sql`
      UPDATE projects SET last_active_worktree_id = ${worktreeId} WHERE id = ${projectId}
    `);
  }
}
