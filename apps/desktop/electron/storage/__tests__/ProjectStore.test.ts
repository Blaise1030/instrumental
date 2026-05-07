import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { ProjectStore } from "../stores/ProjectStore";
import type { AppDatabase } from "../db";

function makeProject(overrides: Partial<Parameters<ProjectStore["upsert"]>[0]> = {}) {
  return {
    id: "proj-1",
    name: "My Project",
    repoPath: "/home/user/repo",
    status: "idle" as const,
    lastActiveWorktreeId: null,
    tabOrder: 0,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjectStore", () => {
  let db: AppDatabase;
  let store: ProjectStore;

  beforeEach(() => {
    db = createTestDb();
    store = new ProjectStore(db);
    store.initialize();
  });

  it("upserts and lists a project", () => {
    store.upsert(makeProject());
    const all = store.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("proj-1");
    expect(all[0].repoPath).toBe("/home/user/repo");
  });

  it("updates project on conflict", () => {
    store.upsert(makeProject());
    store.upsert(makeProject({ name: "Renamed" }));
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].name).toBe("Renamed");
  });

  it("nextTabOrder returns 0 for empty store", () => {
    expect(store.nextTabOrder()).toBe(0);
  });

  it("nextTabOrder returns min-1 when projects exist", () => {
    store.upsert(makeProject({ tabOrder: 5 }));
    expect(store.nextTabOrder()).toBe(4);
  });

  it("reorder assigns sequential tab_order", () => {
    store.upsert(makeProject({ id: "p1", tabOrder: 0 }));
    store.upsert(makeProject({ id: "p2", tabOrder: 1 }));
    store.reorder(["p2", "p1"]);
    const all = store.list();
    const p2 = all.find((p) => p.id === "p2")!;
    const p1 = all.find((p) => p.id === "p1")!;
    expect(p2.tabOrder).toBe(0);
    expect(p1.tabOrder).toBe(1);
  });
});
