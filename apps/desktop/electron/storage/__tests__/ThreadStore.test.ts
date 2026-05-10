import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { ProjectStore } from "../stores/ProjectStore";
import { ThreadStore } from "../stores/ThreadStore";
import type { AppDatabase } from "../db";
import type { Thread, ThreadSession } from "../../../src/shared/domain";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t-1", projectId: "proj-1", worktreePath: "/r",
    title: "My thread", agent: "claude",
    createdBranch: "main", resumeId: null,
    createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<ThreadSession> = {}): ThreadSession {
  return {
    threadId: "t-1", provider: "claude", resumeId: null,
    initialPrompt: null, titleCapturedAt: null,
    launchMode: "fresh", status: "idle",
    lastActivityAt: "2024-01-01T00:00:00Z",
    metadataJson: null, createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ThreadStore", () => {
  let db: AppDatabase;
  let store: ThreadStore;

  beforeEach(() => {
    db = createTestDb();
    const ps = new ProjectStore(db); ps.initialize();
    ps.upsert({
      id: "proj-1",
      name: "P",
      repoPath: "/r",
      status: "idle",
      tabOrder: 0,
    githubPrTokenConfigured: false,
      githubPrOwner: "",
      githubPrRepo: "",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z"
    });
    store = new ThreadStore(db);
    store.initialize();
  });

  it("upserts and gets a thread", () => {
    store.upsertThread(makeThread());
    const t = store.getThread("t-1");
    expect(t?.id).toBe("t-1");
    expect(t?.resumeId).toBeNull();
  });

  it("persists resumeId on thread", () => {
    store.upsertThread(makeThread({ resumeId: "abc-123" }));
    expect(store.getThread("t-1")?.resumeId).toBe("abc-123");
  });

  it("upserts and lists session", () => {
    store.upsertThread(makeThread());
    store.upsertSession(makeSession({ resumeId: "sess-id" }));
    const s = store.getSession("t-1");
    expect(s?.resumeId).toBe("sess-id");
    expect(store.listSessions()).toHaveLength(1);
  });

  it("deleteThread removes thread and cascades to session", () => {
    store.upsertThread(makeThread());
    store.upsertSession(makeSession());
    store.deleteThread("t-1");
    expect(store.getThread("t-1")).toBeNull();
    expect(store.getSession("t-1")).toBeNull();
  });

  it("rename updates title", () => {
    store.upsertThread(makeThread());
    store.rename("t-1", "New Title");
    expect(store.getThread("t-1")?.title).toBe("New Title");
  });

  it("worktreePath stored and retrieved", () => {
    store.upsertThread(makeThread({ worktreePath: "/home/user/myrepo" }));
    expect(store.getThread("t-1")?.worktreePath).toBe("/home/user/myrepo");
  });

  it("listByWorktreePath filters correctly", () => {
    store.upsertThread(makeThread({ id: "t-1", worktreePath: "/path/a" }));
    store.upsertThread(makeThread({ id: "t-2", worktreePath: "/path/b" }));
    expect(store.listByWorktreePath("/path/a")).toHaveLength(1);
    expect(store.listByWorktreePath("/path/b")[0].id).toBe("t-2");
  });
});
