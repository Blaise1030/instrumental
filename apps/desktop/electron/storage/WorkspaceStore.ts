import { sql } from "drizzle-orm";
import type { Project, Thread, ThreadSession } from "../../src/shared/domain.js";
import type { WorkspaceSnapshot } from "../../src/shared/ipc.js";
import type { AppDatabase } from "./db.js";
import { NotificationStore } from "./stores/NotificationStore.js";
import { ProjectStore } from "./stores/ProjectStore.js";
import { RunStore } from "./stores/RunStore.js";
import { SettingsStore } from "./stores/SettingsStore.js";
import { ThreadStore } from "./stores/ThreadStore.js";

export class WorkspaceStore {
  private readonly projects: ProjectStore;
  private readonly threads: ThreadStore;
  private readonly runs: RunStore;
  private readonly notifications: NotificationStore;
  private readonly settings: SettingsStore;

  constructor(private readonly db: AppDatabase) {
    this.projects = new ProjectStore(db);
    this.threads = new ThreadStore(db);
    this.runs = new RunStore(db);
    this.notifications = new NotificationStore(db);
    this.settings = new SettingsStore(db);
  }

  migrate(): void {
    this.projects.initialize();
    this.threads.initialize();
    this.runs.initialize();
    this.notifications.initialize();
    this.settings.initialize();
    this.repairIntegrity();
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  getSnapshot(): WorkspaceSnapshot {
    const projects = this.projects.list();
    const allThreads = this.threads.listAll();
    const threads = [...allThreads].sort((a, b) => {
      const byPath = a.worktreePath.localeCompare(b.worktreePath);
      if (byPath !== 0) return byPath;
      const byCreated = b.createdAt.localeCompare(a.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.id.localeCompare(b.id);
    });
    const threadSessions = this.threads.listSessions();
    const active = this.settings.getActiveState();

    return {
      projects,
      threads,
      threadSessions,
      activeProjectId: active.activeProjectId,
      activeWorktreePath: active.activeWorktreePath,
      activeThreadId: active.activeThreadId,
    };
  }

  // ---------------------------------------------------------------------------
  // Active state
  // ---------------------------------------------------------------------------

  setActiveState(
    activeProjectId: string | null,
    activeWorktreePath: string | null,
    activeThreadId: string | null
  ): void {
    let resolvedWorktreePath = activeWorktreePath;
    let resolvedThreadId = activeThreadId;

    if (activeProjectId && resolvedWorktreePath == null) {
      // Try to restore the last remembered worktree path for this project
      // (stored in app_state or we just leave null since projects no longer store lastActiveWorktreePath)
      resolvedWorktreePath = null;
    }

    if (resolvedWorktreePath) {
      if (resolvedThreadId == null) {
        // Restore the last active thread for this worktree path
        const threadForPath = this.threads.listByWorktreePath(resolvedWorktreePath);
        // Pick the most recently created thread (list is ASC, so last is newest)
        const last = threadForPath[threadForPath.length - 1] ?? null;
        resolvedThreadId = last?.id ?? null;
      } else {
        // Verify thread belongs to this worktree path
        const thread = this.threads.getThread(resolvedThreadId);
        if (!thread || thread.worktreePath !== resolvedWorktreePath) {
          resolvedThreadId = null;
        }
      }
    } else {
      resolvedThreadId = null;
    }

    this.settings.setRawActiveState(activeProjectId, resolvedWorktreePath, resolvedThreadId);
  }

  // ---------------------------------------------------------------------------
  // Project delegates
  // ---------------------------------------------------------------------------

  upsertProject(project: Project): void {
    this.projects.upsert(project);
  }

  nextProjectTabOrder(): number {
    return this.projects.nextTabOrder();
  }

  reorderProjects(orderedProjectIds: string[]): void {
    this.projects.reorder(orderedProjectIds);
  }

  deleteProject(projectId: string): void {
    // Determine next project to activate
    const remaining = this.projects.list().filter((p) => p.id !== projectId);
    const nextProject = remaining[0] ?? null;
    const nextProjectId = nextProject?.id ?? null;

    // Find a thread in the next project to activate
    let nextWorktreePath: string | null = null;
    let nextThreadId: string | null = null;
    if (nextProjectId) {
      const nextThreads = this.threads.listAll().filter((t) => t.projectId === nextProjectId);
      if (nextThreads.length > 0) {
        const sorted = [...nextThreads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        nextThreadId = sorted[0]?.id ?? null;
        nextWorktreePath = sorted[0]?.worktreePath ?? null;
      }
    }

    this.db.run(sql`BEGIN`);
    try {
      // Update active state
      this.db.run(sql`
        UPDATE app_state
        SET active_project_id = ${nextProjectId},
            active_worktree_path = ${nextWorktreePath},
            active_thread_id = ${nextThreadId}
        WHERE id = 1
      `);

      // Delete all runs/events for project's threads
      this.db.run(sql`
        DELETE FROM run_events
        WHERE run_id IN (
          SELECT r.id FROM runs r
          INNER JOIN threads t ON t.id = r.thread_id
          WHERE t.project_id = ${projectId}
        )
      `);
      this.db.run(sql`
        DELETE FROM runs
        WHERE thread_id IN (SELECT id FROM threads WHERE project_id = ${projectId})
      `);
      // Delete thread sessions
      this.db.run(sql`
        DELETE FROM thread_sessions
        WHERE thread_id IN (SELECT id FROM threads WHERE project_id = ${projectId})
      `);
      // Delete threads
      this.db.run(sql`DELETE FROM threads WHERE project_id = ${projectId}`);
      // Delete project
      this.db.run(sql`DELETE FROM projects WHERE id = ${projectId}`);

      this.db.run(sql`COMMIT`);
    } catch (error) {
      this.db.run(sql`ROLLBACK`);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Thread delegates
  // ---------------------------------------------------------------------------

  upsertThread(thread: Thread): void {
    this.threads.upsertThread(thread);
  }

  deleteThread(id: string): void {
    this.db.run(sql`BEGIN`);
    try {
      this.runs.deleteByThread(id);
      this.threads.deleteSession(id);
      this.db.run(sql`DELETE FROM threads WHERE id = ${id}`);
      // Clear active thread if it was this thread
      this.db.run(sql`
        UPDATE app_state
        SET active_thread_id = CASE WHEN active_thread_id = ${id} THEN NULL ELSE active_thread_id END
        WHERE id = 1
      `);
      this.db.run(sql`COMMIT`);
    } catch (error) {
      this.db.run(sql`ROLLBACK`);
      throw error;
    }
  }

  renameThread(id: string, title: string): void {
    this.threads.rename(id, title);
  }

  getThread(id: string): Thread | null {
    return this.threads.getThread(id);
  }

  // ---------------------------------------------------------------------------
  // Thread session delegates
  // ---------------------------------------------------------------------------

  upsertThreadSession(threadSession: ThreadSession): void {
    const thread = this.threads.getThread(threadSession.threadId);
    if (!thread) {
      throw new Error(`Cannot persist thread session for missing thread ${threadSession.threadId}`);
    }
    if (thread.agent !== threadSession.provider) {
      throw new Error(
        `Thread session provider ${threadSession.provider} must match thread agent ${thread.agent} for ${threadSession.threadId}`
      );
    }
    this.threads.upsertSession(threadSession);
  }

  deleteThreadSession(threadId: string): void {
    this.threads.deleteSession(threadId);
  }

  getThreadSession(threadId: string): ThreadSession | null {
    return this.threads.getSession(threadId);
  }

  listThreadSessions(): ThreadSession[] {
    return this.threads.listSessions();
  }

  /**
   * Captures a resume ID for a thread session. Returns true if the session was
   * updated successfully, false if the thread or session was not found.
   */
  captureResumeId(threadId: string, resumeId: string): boolean {
    const thread = this.threads.getThread(threadId);
    if (!thread) return false;
    const existing = this.threads.getSession(threadId);
    if (!existing) return false;
    const now = new Date().toISOString();
    const trimmed = resumeId.trim();
    this.threads.upsertSession({
      ...existing,
      resumeId: trimmed,
      updatedAt: now,
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Settings delegates
  // ---------------------------------------------------------------------------

  getGitHubPrSettings(): { token: string; owner: string; repo: string } {
    return this.settings.getGitHubPrSettings();
  }

  setGitHubPrSettings(payload: { token: string; owner: string; repo: string }): void {
    this.settings.setGitHubPrSettings(payload);
  }

  // ---------------------------------------------------------------------------
  // Integrity repair (runs after all stores initialize)
  // ---------------------------------------------------------------------------

  private repairIntegrity(): void {
    // Remove orphaned thread sessions
    this.db.run(sql`
      DELETE FROM thread_sessions
      WHERE thread_id NOT IN (SELECT id FROM threads)
    `);

    // Clear active thread/worktree if they no longer exist
    this.db.run(sql`
      UPDATE app_state
      SET active_thread_id = CASE
            WHEN active_thread_id IS NOT NULL
             AND active_thread_id NOT IN (SELECT id FROM threads)
            THEN NULL
            ELSE active_thread_id
          END,
          active_worktree_path = CASE
            WHEN active_worktree_path IS NOT NULL
             AND active_worktree_path NOT IN (SELECT DISTINCT worktree_path FROM threads)
            THEN NULL
            ELSE active_worktree_path
          END
      WHERE id = 1
    `);

    this.threads.backfillThreadResumeIdsFromSessions();
  }
}
