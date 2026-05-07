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
