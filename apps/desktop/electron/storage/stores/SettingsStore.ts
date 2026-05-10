import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";

export interface ActiveState {
  activeProjectId: string | null;
  activeWorktreePath: string | null;
  activeThreadId: string | null;
}

interface AppStateRaw {
  active_project_id: string | null;
  active_worktree_path: string | null;
  active_thread_id: string | null;
}

export class SettingsStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_project_id TEXT,
        active_worktree_path TEXT,
        active_thread_id TEXT
      )
    `);
    this.db.run(sql`
      INSERT OR IGNORE INTO app_state (id, active_project_id, active_worktree_path, active_thread_id)
      VALUES (1, NULL, NULL, NULL)
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
      INSERT OR IGNORE INTO github_pr_settings (id, token, owner, repo)
      VALUES (1, '', '', '')
    `);
    this.migrateLegacyGithubPrRepoOntoProjects();
    this.migrateLegacyGithubTokenOntoProjects();
  }

  /** One-time: copy legacy global PAT into per-project `github_pr_token`, then clear the global row. */
  private migrateLegacyGithubTokenOntoProjects(): void {
    const hasTokenCol = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'github_pr_token' LIMIT 1
    `);
    if (!hasTokenCol) return;
    this.db.run(sql`
      UPDATE projects
      SET github_pr_token = (SELECT token FROM github_pr_settings WHERE id = 1)
      WHERE trim(github_pr_token) = ''
        AND EXISTS (
          SELECT 1 FROM github_pr_settings WHERE id = 1 AND trim(token) != ''
        )
    `);
    this.db.run(sql`
      UPDATE github_pr_settings SET token = '' WHERE id = 1
    `);
  }

  /** One-time: copy legacy global owner/repo into per-project columns, then clear the global row. */
  private migrateLegacyGithubPrRepoOntoProjects(): void {
    const hasOwnerCol = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'github_pr_owner' LIMIT 1
    `);
    const hasRepoCol = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('projects') WHERE name = 'github_pr_repo' LIMIT 1
    `);
    if (!hasOwnerCol || !hasRepoCol) return;
    this.db.run(sql`
      UPDATE projects
      SET github_pr_owner = (SELECT owner FROM github_pr_settings WHERE id = 1),
          github_pr_repo = (SELECT repo FROM github_pr_settings WHERE id = 1)
      WHERE trim(github_pr_owner) = '' AND trim(github_pr_repo) = ''
        AND EXISTS (
          SELECT 1 FROM github_pr_settings
          WHERE id = 1 AND (trim(owner) != '' OR trim(repo) != '')
        )
    `);
    this.db.run(sql`
      UPDATE github_pr_settings SET owner = '', repo = '' WHERE id = 1
    `);
  }

  getActiveState(): ActiveState {
    const row = this.db.get<AppStateRaw>(
      sql`SELECT active_project_id, active_worktree_path, active_thread_id FROM app_state WHERE id = 1`
    );
    return {
      activeProjectId: row?.active_project_id ?? null,
      activeWorktreePath: row?.active_worktree_path ?? null,
      activeThreadId: row?.active_thread_id ?? null,
    };
  }

  setRawActiveState(
    projectId: string | null,
    worktreePath: string | null,
    threadId: string | null
  ): void {
    this.db.run(sql`
      UPDATE app_state
      SET active_project_id = ${projectId},
          active_worktree_path = ${worktreePath},
          active_thread_id = ${threadId}
      WHERE id = 1
    `);
  }
}
