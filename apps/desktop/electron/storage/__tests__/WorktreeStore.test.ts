import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { ProjectStore } from "../stores/ProjectStore";
import { WorktreeStore } from "../stores/WorktreeStore";
import type { AppDatabase } from "../db";

function makeWorktree(overrides = {}) {
  return {
    id: "wt-1",
    projectId: "proj-1",
    name: "main",
    branch: "main",
    path: "/repo",
    isActive: false,
    isDefault: true,
    baseBranch: null,
    lastActiveThreadId: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProject() {
  return {
    id: "proj-1", name: "P", repoPath: "/r", status: "idle" as const,
    lastActiveWorktreeId: null, tabOrder: 0,
    createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
  };
}

describe("WorktreeStore", () => {
  let db: AppDatabase;
  let store: WorktreeStore;

  beforeEach(() => {
    db = createTestDb();
    new ProjectStore(db).initialize();
    store = new WorktreeStore(db);
    store.initialize();
    new ProjectStore(db).upsert(makeProject());
  });

  it("upserts and lists a worktree", () => {
    store.upsert(makeWorktree());
    const all = store.listByProject("proj-1");
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("wt-1");
    expect(all[0].isDefault).toBe(true);
    expect(all[0].isActive).toBe(false);
  });

  it("getEditorState returns null for unknown worktree", () => {
    store.upsert(makeWorktree());
    expect(store.getEditorState("wt-1")).toBeNull();
  });

  it("setEditorState and getEditorState roundtrip", () => {
    store.upsert(makeWorktree());
    store.setEditorState("wt-1", "/file.ts", ["/file.ts", "/other.ts"]);
    const state = store.getEditorState("wt-1");
    expect(state?.selectedFilePath).toBe("/file.ts");
    expect(state?.openFilePaths).toContain("/file.ts");
    expect(state?.openFilePaths).toContain("/other.ts");
  });
});
