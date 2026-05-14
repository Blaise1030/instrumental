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
