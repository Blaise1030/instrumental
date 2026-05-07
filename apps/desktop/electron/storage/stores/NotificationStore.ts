import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import type { AppNotificationKind } from "../../../src/shared/domain.js";

export interface NotificationRow {
  id: string;
  threadId: string;
  projectId: string;
  kind: AppNotificationKind;
  threadTitle: string;
  projectName: string;
  read: number;
  createdAt: string;
}

interface NotificationRaw {
  id: string;
  thread_id: string;
  project_id: string;
  kind: string;
  thread_title: string;
  project_name: string;
  read: number;
  created_at: string;
}

function toRow(raw: NotificationRaw): NotificationRow {
  return {
    id: raw.id,
    threadId: raw.thread_id,
    projectId: raw.project_id,
    kind: raw.kind as AppNotificationKind,
    threadTitle: raw.thread_title,
    projectName: raw.project_name,
    read: raw.read,
    createdAt: raw.created_at,
  };
}

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

  upsert(notification: Omit<NotificationRow, never>): void {
    this.db.run(sql`
      INSERT OR REPLACE INTO notifications (
        id, thread_id, project_id, kind, thread_title, project_name, read, created_at
      ) VALUES (
        ${notification.id},
        ${notification.threadId},
        ${notification.projectId},
        ${notification.kind},
        ${notification.threadTitle},
        ${notification.projectName},
        ${notification.read},
        ${notification.createdAt}
      )
    `);
  }

  list(limit: number): NotificationRow[] {
    const rows = this.db.all<NotificationRaw>(sql`
      SELECT id, thread_id, project_id, kind, thread_title, project_name, read, created_at
      FROM notifications
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return rows.map(toRow);
  }

  markRead(id: string): void {
    this.db.run(sql`UPDATE notifications SET read = 1 WHERE id = ${id}`);
  }

  markAllRead(): void {
    this.db.run(sql`UPDATE notifications SET read = 1`);
  }
}
