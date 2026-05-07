import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";

export interface ActiveState {
  activeProjectId: string | null;
  activeWorktreePath: string | null;
  activeThreadId: string | null;
}

export interface GitHubPrSettings {
  token: string;
  owner: string;
  repo: string;
}

interface AppStateRaw {
  active_project_id: string | null;
  active_worktree_path: string | null;
  active_thread_id: string | null;
}

interface GitHubPrSettingsRaw {
  token: string;
  owner: string;
  repo: string;
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

  getGitHubPrSettings(): GitHubPrSettings {
    const row = this.db.get<GitHubPrSettingsRaw>(
      sql`SELECT token, owner, repo FROM github_pr_settings WHERE id = 1`
    );
    return {
      token: row?.token ?? "",
      owner: row?.owner ?? "",
      repo: row?.repo ?? "",
    };
  }

  setGitHubPrSettings(payload: GitHubPrSettings): void {
    this.db.run(sql`
      INSERT OR REPLACE INTO github_pr_settings (id, token, owner, repo)
      VALUES (1, ${payload.token}, ${payload.owner}, ${payload.repo})
    `);
  }
}
