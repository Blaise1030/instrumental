import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("better-sqlite3", async () => {
  const module = await import("./betterSqlite3Compat");
  return { default: module.default };
});

import Database from "better-sqlite3";
import type { Project, Thread, ThreadSession } from "../../../src/shared/domain";
import { openDatabase } from "../db";
import { WorkspaceStore } from "../WorkspaceStore";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "instrument-store-"));
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "instrument",
    repoPath: "/tmp/instrument",
    status: "idle",
    tabOrder: 0,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
    githubPrTokenConfigured: false,
    githubPrOwner: "",
    githubPrRepo: "",
    ...overrides
  };
}

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    worktreePath: "/tmp/instrument",
    title: "Codex CLI",
    agent: "codex",
    createdBranch: null,
    resumeId: null,
    metadataJson: null,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
    ...overrides
  };
}

function makeThreadSession(overrides: Partial<ThreadSession> = {}): ThreadSession {
  return {
    threadId: "thread-1",
    provider: "codex",
    resumeId: "resume-123",
    initialPrompt: "Fix the flaky sidebar test",
    titleCapturedAt: "2026-04-07T10:00:05.000Z",
    launchMode: "fresh",
    status: "resumable",
    lastActivityAt: "2026-04-07T10:01:00.000Z",
    metadataJson: '{"source":"wrapper"}',
    createdAt: "2026-04-07T10:00:00.000Z",
    updatedAt: "2026-04-07T10:01:00.000Z",
    ...overrides
  };
}

function seedBasicWorkspace(store: WorkspaceStore): void {
  store.upsertProject(makeProject());
}

function insertRunWithEvent(db: InstanceType<typeof Database>, runId: string, threadId: string): void {
  db.prepare(
    "INSERT INTO runs (id, thread_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)"
  ).run(runId, threadId, "running", "2026-04-07T10:00:00.000Z", null);
  db.prepare(
    "INSERT INTO run_events (id, run_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(`${runId}-event`, runId, "stdout", "hello", "2026-04-07T10:00:01.000Z");
}

describe("WorkspaceStore", () => {
  afterEach(() => {
    // Temp directories are created per test case and cleaned up eagerly.
  });

  it("returns threads ordered by created time within a worktree path (newest first)", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);

    store.upsertThread(
      makeThread({
        id: "thread-a",
        createdAt: "2026-04-06T00:01:00.000Z",
        updatedAt: "2026-04-06T00:01:00.000Z"
      })
    );
    store.upsertThread(
      makeThread({
        id: "thread-b",
        createdAt: "2026-04-06T00:03:00.000Z",
        updatedAt: "2026-04-06T00:03:00.000Z"
      })
    );
    store.upsertThread(
      makeThread({
        id: "thread-c",
        createdAt: "2026-04-06T00:02:00.000Z",
        updatedAt: "2026-04-06T00:02:00.000Z"
      })
    );

    expect(store.getSnapshot().threads.map((t) => t.id)).toEqual(["thread-b", "thread-c", "thread-a"]);
  });

  it("restores the last selected thread when switching back to a worktree path", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    store.upsertProject(makeProject());
    store.upsertThread(makeThread({ id: "thread-1", worktreePath: "/tmp/instrument/main" }));
    store.upsertThread(makeThread({ id: "thread-2", worktreePath: "/tmp/instrument/feature" }));

    store.setActiveState("project-1", "/tmp/instrument/main", "thread-1");
    store.setActiveState("project-1", "/tmp/instrument/feature", "thread-2");
    store.setActiveState("project-1", "/tmp/instrument/main", null);

    const snapshot = store.getSnapshot();
    expect(snapshot.activeWorktreePath).toBe("/tmp/instrument/main");
    expect(snapshot.activeThreadId).toBe("thread-1");
  });

  it("restores the last selected worktree path and thread when switching back to a project", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    store.upsertProject(makeProject({ id: "project-1" }));
    store.upsertProject(makeProject({ id: "project-2", repoPath: "/tmp/other", name: "other", tabOrder: 1 }));
    store.upsertThread(makeThread({ id: "thread-1", projectId: "project-1", worktreePath: "/tmp/instrument" }));
    store.upsertThread(makeThread({ id: "thread-2", projectId: "project-2", worktreePath: "/tmp/other" }));

    store.setActiveState("project-1", "/tmp/instrument", "thread-1");
    store.setActiveState("project-2", "/tmp/other", "thread-2");
    store.setActiveState("project-1", null, null);

    const snapshot = store.getSnapshot();
    expect(snapshot.activeProjectId).toBe("project-1");
    expect(snapshot.activeThreadId).toBeNull();
  });

  it("reorders projects by tab_order", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    store.upsertProject(makeProject({ id: "project-1", tabOrder: 0 }));
    store.upsertProject(makeProject({ id: "project-2", repoPath: "/tmp/other", name: "other", tabOrder: 1 }));
    expect(store.getSnapshot().projects.map((p) => p.id)).toEqual(["project-1", "project-2"]);
    store.reorderProjects(["project-2", "project-1"]);
    const after = store.getSnapshot().projects;
    expect(after.map((p) => p.id)).toEqual(["project-2", "project-1"]);
    expect(after.map((p) => p.tabOrder)).toEqual([0, 1]);
  });

  it("clears remembered thread when the active thread is deleted", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread({ id: "thread-1" }));

    store.setActiveState("project-1", "/tmp/instrument", "thread-1");
    store.deleteThread("thread-1");

    const snapshot = store.getSnapshot();
    expect(snapshot.activeThreadId).toBeNull();
  });

  it("deletes a project and all app-owned records while promoting another active project", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();

    store.upsertProject(makeProject({ id: "project-1" }));
    store.upsertProject(
      makeProject({
        id: "project-2",
        name: "posthog-client",
        repoPath: "/tmp/posthog-client",
        tabOrder: 1
      })
    );
    store.upsertThread(makeThread({ id: "thread-1", projectId: "project-1", worktreePath: "/tmp/instrument" }));
    store.upsertThread(makeThread({ id: "thread-2", projectId: "project-2", worktreePath: "/tmp/posthog-client" }));
    store.upsertThreadSession(makeThreadSession({ threadId: "thread-1" }));
    store.upsertThreadSession(
      makeThreadSession({
        threadId: "thread-2",
        provider: "codex",
        initialPrompt: "Second project prompt"
      })
    );

    const rawDb = new Database(path.join(baseDir, "workspace.db"));
    insertRunWithEvent(rawDb, "run-1", "thread-1");
    insertRunWithEvent(rawDb, "run-2", "thread-2");
    rawDb.close();

    store.setActiveState("project-1", "/tmp/instrument", "thread-1");
    store.deleteProject("project-1");

    const snapshot = store.getSnapshot();
    expect(snapshot.projects.map((p) => p.id)).toEqual(["project-2"]);
    expect(snapshot.threads.map((t) => t.id)).toEqual(["thread-2"]);
    expect(snapshot.threadSessions.map((s) => s.threadId)).toEqual(["thread-2"]);

    const verifyDb = new Database(path.join(baseDir, "workspace.db"));
    expect(verifyDb.prepare("SELECT COUNT(*) AS count FROM runs WHERE thread_id = 'thread-1'").get()).toEqual({
      count: 0
    });
    expect(
      verifyDb.prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id = 'run-1'").get()
    ).toEqual({ count: 0 });
    verifyDb.close();
  });

  it("creates thread_sessions table during migration", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();

    const rawDb = new Database(path.join(baseDir, "workspace.db"));
    const tableInfo = rawDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("thread_sessions") as
      | { name: string }
      | undefined;
    rawDb.close();
    expect(tableInfo).toBeDefined();
  });

  it("persists thread sessions across reopen", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread());

    store.upsertThreadSession(makeThreadSession());

    const db2 = openDatabase(baseDir);
    const reopenedStore = new WorkspaceStore(db2);
    reopenedStore.migrate();

    expect(reopenedStore.getThreadSession("thread-1")).toEqual(makeThreadSession());
    expect(reopenedStore.listThreadSessions()).toEqual([makeThreadSession()]);
    expect(reopenedStore.getSnapshot().threadSessions).toEqual([makeThreadSession()]);
  });

  it("rejects thread sessions whose provider does not match the owning thread agent", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread({ agent: "codex" }));

    expect(() =>
      store.upsertThreadSession(makeThreadSession({ provider: "claude" }))
    ).toThrow(/must match thread agent/i);
  });

  it("removes orphaned thread sessions during migration", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread());
    store.upsertThreadSession(makeThreadSession());
    store.deleteThread("thread-1");

    const dbPath = path.join(baseDir, "workspace.db");
    const rawDb = new Database(dbPath);
    rawDb.exec("PRAGMA foreign_keys = OFF");
    rawDb.prepare(
      `INSERT INTO thread_sessions (
         thread_id, provider, resume_id, initial_prompt, title_captured_at, launch_mode,
         status, last_activity_at, metadata_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "ghost-thread",
      "codex",
      "ghost-resume",
      "stale prompt",
      "2026-04-07T10:00:05.000Z",
      "fresh",
      "resumable",
      "2026-04-07T10:01:00.000Z",
      null,
      "2026-04-07T10:00:00.000Z",
      "2026-04-07T10:01:00.000Z"
    );
    rawDb.close();

    const db2 = openDatabase(baseDir);
    const reopenedStore = new WorkspaceStore(db2);
    reopenedStore.migrate();

    expect(reopenedStore.getThreadSession("ghost-thread")).toBeNull();
    expect(reopenedStore.getSnapshot().threadSessions).toEqual([]);
  });

  it("removes thread sessions when the owning thread is deleted", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread());
    store.upsertThreadSession(makeThreadSession());

    const rawDb = new Database(path.join(baseDir, "workspace.db"));
    insertRunWithEvent(rawDb, "run-1", "thread-1");
    rawDb.close();

    store.deleteThread("thread-1");

    expect(store.getThreadSession("thread-1")).toBeNull();
    expect(store.listThreadSessions()).toEqual([]);
    const verifyDb = new Database(path.join(baseDir, "workspace.db"));
    expect(verifyDb.prepare("SELECT COUNT(*) AS count FROM runs WHERE thread_id = ?").get("thread-1")).toEqual({
      count: 0
    });
    expect(verifyDb.prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id = ?").get("run-1")).toEqual({
      count: 0
    });
    verifyDb.close();
  });

  it("persists GitHub PR token and repo on the project row (token never in snapshot)", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    store.upsertProject(makeProject());
    store.setProjectGitHubPr("project-1", "ghp_secret", "me", "my-repo");
    const p = store.getSnapshot().projects[0];
    expect(p?.githubPrTokenConfigured).toBe(true);
    expect(p?.githubPrOwner).toBe("me");
    expect(p?.githubPrRepo).toBe("my-repo");

    const db2 = openDatabase(baseDir);
    const reopened = new WorkspaceStore(db2);
    reopened.migrate();
    const p2 = reopened.getSnapshot().projects[0];
    expect(p2?.githubPrTokenConfigured).toBe(true);
    expect(p2?.githubPrOwner).toBe("me");
    expect(p2?.githubPrRepo).toBe("my-repo");
  });

  it("upsertProject does not clear stored GitHub PAT", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    store.upsertProject(makeProject());
    store.setProjectGitHubPr("project-1", "ghp_keep", "o", "r");
    store.upsertProject(makeProject({ name: "renamed", githubPrOwner: "o", githubPrRepo: "r" }));
    const p = store.getSnapshot().projects[0];
    expect(p?.name).toBe("renamed");
    expect(p?.githubPrTokenConfigured).toBe(true);
    expect(p?.githubPrOwner).toBe("o");
    expect(p?.githubPrRepo).toBe("r");
  });

  it("captureResumeId updates an existing session resumeId", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread());
    store.upsertThreadSession(makeThreadSession({ resumeId: null }));

    const result = store.captureResumeId("thread-1", "new-resume-id");
    expect(result).toBe(true);
    expect(store.getThreadSession("thread-1")?.resumeId).toBe("new-resume-id");
    expect(store.getThread("thread-1")?.resumeId).toBe("new-resume-id");
  });

  it("captureResumeId returns false when thread session does not exist", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread());

    const result = store.captureResumeId("thread-1", "some-resume-id");
    expect(result).toBe(false);
  });

  it("repairIntegrity backfills threads.resume_id from thread_sessions when thread row was cleared", () => {
    const baseDir = makeTempDir();
    const store = new WorkspaceStore(openDatabase(baseDir));
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread({ resumeId: null }));
    store.upsertThreadSession(makeThreadSession({ resumeId: "backfill-resume", threadId: "thread-1" }));

    const raw = new Database(path.join(baseDir, "workspace.db"));
    raw.prepare("UPDATE threads SET resume_id = NULL WHERE id = ?").run("thread-1");
    raw.close();

    const reopened = new WorkspaceStore(openDatabase(baseDir));
    reopened.migrate();
    expect(reopened.getThread("thread-1")?.resumeId).toBe("backfill-resume");
  });

  it("deleteThread clears active thread from app_state", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    seedBasicWorkspace(store);
    store.upsertThread(makeThread({ id: "t1" }));
    store.setActiveState("project-1", "/tmp/instrument", "t1");

    expect(store.getSnapshot().activeThreadId).toBe("t1");

    store.deleteThread("t1");

    expect(store.getSnapshot().activeThreadId).toBeNull();
  });

  it("getSnapshot returns correct active state after setActiveState", () => {
    const baseDir = makeTempDir();
    const db = openDatabase(baseDir);
    const store = new WorkspaceStore(db);
    store.migrate();
    store.upsertProject(makeProject({ id: "project-1" }));
    store.upsertThread(makeThread({ id: "thread-1", projectId: "project-1", worktreePath: "/tmp/instrument" }));

    store.setActiveState("project-1", "/tmp/instrument", "thread-1");

    const snapshot = store.getSnapshot();
    expect(snapshot.activeProjectId).toBe("project-1");
    expect(snapshot.activeWorktreePath).toBe("/tmp/instrument");
    expect(snapshot.activeThreadId).toBe("thread-1");
  });
});
