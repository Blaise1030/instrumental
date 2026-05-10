import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import type { Project } from "../../../src/shared/domain.js";

export class ProjectStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        status TEXT NOT NULL,
        tab_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
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
    const hasGithubPrOwner = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'github_pr_owner' LIMIT 1
    `);
    if (!hasGithubPrOwner) {
      this.db.run(sql`ALTER TABLE projects ADD COLUMN github_pr_owner TEXT NOT NULL DEFAULT ''`);
    }
    const hasGithubPrRepo = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'github_pr_repo' LIMIT 1
    `);
    if (!hasGithubPrRepo) {
      this.db.run(sql`ALTER TABLE projects ADD COLUMN github_pr_repo TEXT NOT NULL DEFAULT ''`);
    }
    const hasGithubPrToken = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'github_pr_token' LIMIT 1
    `);
    if (!hasGithubPrToken) {
      this.db.run(sql`ALTER TABLE projects ADD COLUMN github_pr_token TEXT NOT NULL DEFAULT ''`);
    }
  }

  upsert(project: Project): void {
    this.db.run(sql`
      INSERT INTO projects (
        id,
        name,
        repo_path,
        status,
        tab_order,
        created_at,
        updated_at,
        github_pr_owner,
        github_pr_repo,
        github_pr_token
      )
      VALUES (
        ${project.id},
        ${project.name},
        ${project.repoPath},
        ${project.status},
        ${project.tabOrder},
        ${project.createdAt},
        ${project.updatedAt},
        ${project.githubPrOwner},
        ${project.githubPrRepo},
        ${""}
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        repo_path = excluded.repo_path,
        status = excluded.status,
        tab_order = excluded.tab_order,
        updated_at = excluded.updated_at,
        github_pr_owner = excluded.github_pr_owner,
        github_pr_repo = excluded.github_pr_repo
    `);
  }

  setGitHubPr(projectId: string, token: string, owner: string, repo: string): void {
    const now = new Date().toISOString();
    this.db.run(sql`
      UPDATE projects
      SET github_pr_token = ${token},
          github_pr_owner = ${owner},
          github_pr_repo = ${repo},
          updated_at = ${now}
      WHERE id = ${projectId}
    `);
  }

  /** Update owner/repo only; leaves `github_pr_token` unchanged. */
  setGitHubPrMeta(projectId: string, owner: string, repo: string): void {
    const now = new Date().toISOString();
    this.db.run(sql`
      UPDATE projects
      SET github_pr_owner = ${owner},
          github_pr_repo = ${repo},
          updated_at = ${now}
      WHERE id = ${projectId}
    `);
  }

  getGitHubPrCipherRow(
    projectId: string
  ): { cipher: string; owner: string; repo: string } | null {
    return this.db.get<{
      cipher: string;
      owner: string;
      repo: string;
    }>(sql`
      SELECT
        github_pr_token AS cipher,
        github_pr_owner AS owner,
        github_pr_repo AS repo
      FROM projects
      WHERE id = ${projectId}
    `);
  }

  list(): Project[] {
    const rows = this.db.all<{
      id: string;
      name: string;
      repoPath: string;
      status: string;
      tabOrder: number;
      createdAt: string;
      updatedAt: string;
      githubPrOwner: string;
      githubPrRepo: string;
      githubPrTokenConfigured: number;
    }>(sql`
      SELECT
        id,
        name,
        repo_path AS repoPath,
        status,
        tab_order AS tabOrder,
        created_at AS createdAt,
        updated_at AS updatedAt,
        github_pr_owner AS githubPrOwner,
        github_pr_repo AS githubPrRepo,
        (CASE WHEN trim(github_pr_token) != '' THEN 1 ELSE 0 END) AS githubPrTokenConfigured
      FROM projects
      ORDER BY tab_order ASC, id ASC
    `);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      repoPath: r.repoPath,
      status: r.status as Project["status"],
      tabOrder: r.tabOrder,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      githubPrOwner: r.githubPrOwner,
      githubPrRepo: r.githubPrRepo,
      githubPrTokenConfigured: r.githubPrTokenConfigured !== 0,
    }));
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
}
