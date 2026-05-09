import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db.js";
import type { Thread, ThreadAgent, ThreadSession, ThreadSessionLaunchMode, ThreadSessionStatus } from "../../src/shared/domain.js";

export class ThreadStore {
  constructor(private readonly db: AppDatabase) {}

  initialize(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        title TEXT NOT NULL,
        agent TEXT NOT NULL,
        created_branch TEXT,
        resume_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    const hasCreatedBranch = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('threads') WHERE name = 'created_branch' LIMIT 1
    `);
    if (!hasCreatedBranch) {
      this.db.run(sql`ALTER TABLE threads ADD COLUMN created_branch TEXT`);
    }

    const hasResumeId = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('threads') WHERE name = 'resume_id' LIMIT 1
    `);
    if (!hasResumeId) {
      this.db.run(sql`ALTER TABLE threads ADD COLUMN resume_id TEXT`);
    }

    // Migrate worktree_id → worktree_path for legacy rows
    this.migrateWorktreeIdToPathIfNeeded();

    this.migrateDropSortOrderIfNeeded();

    this.db.run(sql`
      CREATE INDEX IF NOT EXISTS threads_project_id_idx ON threads (project_id)
    `);
    this.db.run(sql`
      CREATE INDEX IF NOT EXISTS threads_worktree_path_idx ON threads (worktree_path)
    `);

    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS thread_sessions (
        thread_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        resume_id TEXT,
        initial_prompt TEXT,
        title_captured_at TEXT,
        launch_mode TEXT NOT NULL DEFAULT 'fresh',
        status TEXT NOT NULL DEFAULT 'idle',
        last_activity_at TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  private migrateWorktreeIdToPathIfNeeded(): void {
    const hasWorktreeId = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('threads') WHERE name = 'worktree_id' LIMIT 1
    `);
    if (!hasWorktreeId) return;

    const hasWorktreePath = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('threads') WHERE name = 'worktree_path' LIMIT 1
    `);
    if (hasWorktreePath) return;

    // Rebuild: copy worktree_id → worktree_path (UUID becomes the path value for legacy rows)
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS threads_v2 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        title TEXT NOT NULL,
        agent TEXT NOT NULL,
        created_branch TEXT,
        resume_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    this.db.run(sql`
      INSERT INTO threads_v2 (id, project_id, worktree_path, title, agent, created_branch, resume_id, created_at, updated_at)
      SELECT id, project_id, COALESCE(
        (SELECT path FROM worktrees WHERE worktrees.id = threads.worktree_id),
        worktree_id
      ), title, agent, created_branch, resume_id, created_at, updated_at
      FROM threads
    `);
    this.db.run(sql`DROP TABLE threads`);
    this.db.run(sql`ALTER TABLE threads_v2 RENAME TO threads`);
  }

  private migrateDropSortOrderIfNeeded(): void {
    const hasSortOrder = this.db.get<{ v: number }>(sql`
      SELECT 1 AS v FROM pragma_table_info('threads') WHERE name = 'sort_order' LIMIT 1
    `);
    if (!hasSortOrder) return;

    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS threads_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        title TEXT NOT NULL,
        agent TEXT NOT NULL,
        created_branch TEXT,
        resume_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    this.db.run(sql`
      INSERT INTO threads_new (id, project_id, worktree_path, title, agent, created_branch, resume_id, created_at, updated_at)
      SELECT id, project_id, worktree_path, title, agent, created_branch, resume_id, created_at, updated_at
      FROM threads
    `);
    this.db.run(sql`DROP TABLE threads`);
    this.db.run(sql`ALTER TABLE threads_new RENAME TO threads`);
  }

  upsertThread(thread: Thread): void {
    this.db.run(sql`
      INSERT INTO threads (
        id, project_id, worktree_path, title, agent,
        created_branch, resume_id, created_at, updated_at
      )
      VALUES (
        ${thread.id},
        ${thread.projectId},
        ${thread.worktreePath},
        ${thread.title},
        ${thread.agent},
        ${thread.createdBranch ?? null},
        ${thread.resumeId ?? null},
        ${thread.createdAt},
        ${thread.updatedAt}
      )
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        worktree_path = excluded.worktree_path,
        title = excluded.title,
        agent = excluded.agent,
        created_branch = excluded.created_branch,
        resume_id = excluded.resume_id,
        updated_at = excluded.updated_at
    `);
  }

  getThread(id: string): Thread | null {
    const row = this.db.get<{
      id: string;
      projectId: string;
      worktreePath: string;
      title: string;
      agent: string;
      createdBranch: string | null;
      resumeId: string | null;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        id,
        project_id AS projectId,
        worktree_path AS worktreePath,
        title,
        agent,
        created_branch AS createdBranch,
        resume_id AS resumeId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM threads
      WHERE id = ${id}
    `);
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.projectId,
      worktreePath: row.worktreePath,
      title: row.title,
      agent: row.agent as ThreadAgent,
      createdBranch: row.createdBranch,
      resumeId: row.resumeId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  listAll(): Thread[] {
    const rows = this.db.all<{
      id: string;
      projectId: string;
      worktreePath: string;
      title: string;
      agent: string;
      createdBranch: string | null;
      resumeId: string | null;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        id,
        project_id AS projectId,
        worktree_path AS worktreePath,
        title,
        agent,
        created_branch AS createdBranch,
        resume_id AS resumeId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM threads
      ORDER BY created_at ASC, id ASC
    `);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      worktreePath: r.worktreePath,
      title: r.title,
      agent: r.agent as ThreadAgent,
      createdBranch: r.createdBranch,
      resumeId: r.resumeId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  listByWorktreePath(worktreePath: string): Thread[] {
    const rows = this.db.all<{
      id: string;
      projectId: string;
      worktreePath: string;
      title: string;
      agent: string;
      createdBranch: string | null;
      resumeId: string | null;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        id,
        project_id AS projectId,
        worktree_path AS worktreePath,
        title,
        agent,
        created_branch AS createdBranch,
        resume_id AS resumeId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM threads
      WHERE worktree_path = ${worktreePath}
      ORDER BY created_at ASC, id ASC
    `);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      worktreePath: r.worktreePath,
      title: r.title,
      agent: r.agent as ThreadAgent,
      createdBranch: r.createdBranch,
      resumeId: r.resumeId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  rename(id: string, title: string): void {
    const now = new Date().toISOString();
    this.db.run(sql`
      UPDATE threads SET title = ${title}, updated_at = ${now} WHERE id = ${id}
    `);
  }

  deleteThread(id: string): void {
    this.db.run(sql`DELETE FROM thread_sessions WHERE thread_id = ${id}`);
    this.db.run(sql`DELETE FROM threads WHERE id = ${id}`);
  }

  upsertSession(session: ThreadSession): void {
    this.db.run(sql`
      INSERT INTO thread_sessions (
        thread_id, provider, resume_id, initial_prompt, title_captured_at,
        launch_mode, status, last_activity_at, metadata_json, created_at, updated_at
      )
      VALUES (
        ${session.threadId},
        ${session.provider},
        ${session.resumeId ?? null},
        ${session.initialPrompt ?? null},
        ${session.titleCapturedAt ?? null},
        ${session.launchMode},
        ${session.status},
        ${session.lastActivityAt},
        ${session.metadataJson ?? null},
        ${session.createdAt},
        ${session.updatedAt}
      )
      ON CONFLICT(thread_id) DO UPDATE SET
        provider = excluded.provider,
        resume_id = excluded.resume_id,
        initial_prompt = excluded.initial_prompt,
        title_captured_at = excluded.title_captured_at,
        launch_mode = excluded.launch_mode,
        status = excluded.status,
        last_activity_at = excluded.last_activity_at,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `);
    const trimmedResume = session.resumeId?.trim() ?? "";
    if (trimmedResume !== "") {
      this.db.run(sql`
        UPDATE threads
        SET resume_id = ${trimmedResume}, updated_at = ${session.updatedAt}
        WHERE id = ${session.threadId}
      `);
    }
  }

  /** Copies non-empty `thread_sessions.resume_id` onto `threads` when the thread row has none (startup repair). */
  backfillThreadResumeIdsFromSessions(): void {
    const now = new Date().toISOString();
    this.db.run(sql`
      UPDATE threads
      SET resume_id = (
        SELECT TRIM(s.resume_id) FROM thread_sessions s WHERE s.thread_id = threads.id LIMIT 1
      ),
      updated_at = ${now}
      WHERE EXISTS (
        SELECT 1 FROM thread_sessions s
        WHERE s.thread_id = threads.id
          AND s.resume_id IS NOT NULL
          AND TRIM(s.resume_id) != ''
      )
      AND (threads.resume_id IS NULL OR TRIM(threads.resume_id) = '')
    `);
  }

  deleteSession(threadId: string): void {
    this.db.run(sql`DELETE FROM thread_sessions WHERE thread_id = ${threadId}`);
  }

  getSession(threadId: string): ThreadSession | null {
    const row = this.db.get<{
      threadId: string;
      provider: string;
      resumeId: string | null;
      initialPrompt: string | null;
      titleCapturedAt: string | null;
      launchMode: string;
      status: string;
      lastActivityAt: string;
      metadataJson: string | null;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        thread_id AS threadId,
        provider,
        resume_id AS resumeId,
        initial_prompt AS initialPrompt,
        title_captured_at AS titleCapturedAt,
        launch_mode AS launchMode,
        status,
        last_activity_at AS lastActivityAt,
        metadata_json AS metadataJson,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM thread_sessions
      WHERE thread_id = ${threadId}
    `);
    if (!row) return null;
    return {
      threadId: row.threadId,
      provider: row.provider as ThreadAgent,
      resumeId: row.resumeId,
      initialPrompt: row.initialPrompt,
      titleCapturedAt: row.titleCapturedAt,
      launchMode: row.launchMode as ThreadSessionLaunchMode,
      status: row.status as ThreadSessionStatus,
      lastActivityAt: row.lastActivityAt,
      metadataJson: row.metadataJson,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  listSessions(): ThreadSession[] {
    const rows = this.db.all<{
      threadId: string;
      provider: string;
      resumeId: string | null;
      initialPrompt: string | null;
      titleCapturedAt: string | null;
      launchMode: string;
      status: string;
      lastActivityAt: string;
      metadataJson: string | null;
      createdAt: string;
      updatedAt: string;
    }>(sql`
      SELECT
        thread_id AS threadId,
        provider,
        resume_id AS resumeId,
        initial_prompt AS initialPrompt,
        title_captured_at AS titleCapturedAt,
        launch_mode AS launchMode,
        status,
        last_activity_at AS lastActivityAt,
        metadata_json AS metadataJson,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM thread_sessions
      ORDER BY created_at ASC, thread_id ASC
    `);
    return rows.map((r) => ({
      threadId: r.threadId,
      provider: r.provider as ThreadAgent,
      resumeId: r.resumeId,
      initialPrompt: r.initialPrompt,
      titleCapturedAt: r.titleCapturedAt,
      launchMode: r.launchMode as ThreadSessionLaunchMode,
      status: r.status as ThreadSessionStatus,
      lastActivityAt: r.lastActivityAt,
      metadataJson: r.metadataJson,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}
