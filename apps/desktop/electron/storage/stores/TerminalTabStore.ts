import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db.js";

export interface TerminalTabRow {
  id: string;
  worktreeId: string;
  sessionId: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface TerminalTabRaw {
  id: string;
  worktree_id: string;
  session_id: string;
  label: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

function toRow(raw: TerminalTabRaw): TerminalTabRow {
  return {
    id: raw.id,
    worktreeId: raw.worktree_id,
    sessionId: raw.session_id,
    label: raw.label,
    sortOrder: raw.sort_order,
    isActive: raw.is_active === 1,
    createdAt: raw.created_at,
  };
}

export class TerminalTabStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS terminal_tabs (
        id TEXT PRIMARY KEY,
        worktree_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    this.db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_terminal_tabs_worktree_id ON terminal_tabs(worktree_id)
    `);
  }

  list(worktreeId: string): TerminalTabRow[] {
    const rows = this.db.all<TerminalTabRaw>(sql`
      SELECT id, worktree_id, session_id, label, sort_order, is_active, created_at
      FROM terminal_tabs
      WHERE worktree_id = ${worktreeId}
      ORDER BY sort_order ASC, created_at ASC
    `);
    return rows.map(toRow);
  }

  create(worktreeId: string): TerminalTabRow {
    const existing = this.list(worktreeId);
    const sortOrder = existing.length;
    const label = `Terminal ${sortOrder + 1}`;
    const id = randomUUID();
    const sessionId = `__shell:${id}`;
    const createdAt = new Date().toISOString();

    if (existing.length > 0) {
      this.db.run(sql`UPDATE terminal_tabs SET is_active = 0 WHERE worktree_id = ${worktreeId}`);
    }

    this.db.run(sql`
      INSERT INTO terminal_tabs (id, worktree_id, session_id, label, sort_order, is_active, created_at)
      VALUES (${id}, ${worktreeId}, ${sessionId}, ${label}, ${sortOrder}, 1, ${createdAt})
    `);

    return { id, worktreeId, sessionId, label, sortOrder, isActive: true, createdAt };
  }

  delete(id: string): void {
    const tab = this.db.all<TerminalTabRaw>(sql`SELECT * FROM terminal_tabs WHERE id = ${id}`)[0];
    if (!tab) return;
    const wasActive = tab.is_active === 1;
    this.db.run(sql`DELETE FROM terminal_tabs WHERE id = ${id}`);

    if (wasActive) {
      const remaining = this.list(tab.worktree_id);
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1]!;
        this.db.run(sql`UPDATE terminal_tabs SET is_active = 1 WHERE id = ${next.id}`);
      }
    }
  }

  setActive(worktreeId: string, id: string): void {
    this.db.run(sql`UPDATE terminal_tabs SET is_active = 0 WHERE worktree_id = ${worktreeId}`);
    this.db.run(sql`UPDATE terminal_tabs SET is_active = 1 WHERE id = ${id}`);
  }
}
