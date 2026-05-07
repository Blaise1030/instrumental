import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { NotificationStore } from "../stores/NotificationStore";
import type { AppDatabase } from "../db";

function makeNotification(overrides = {}) {
  return {
    id: "n-1", threadId: "t-1", projectId: "p-1",
    kind: "done" as const, threadTitle: "My thread",
    projectName: "My project", read: 0,
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("NotificationStore", () => {
  let db: AppDatabase;
  let store: NotificationStore;

  beforeEach(() => {
    db = createTestDb();
    store = new NotificationStore(db);
    store.initialize();
  });

  it("upserts and lists notifications newest first", () => {
    store.upsert(makeNotification({ id: "n-1", createdAt: "2024-01-01T00:00:00Z" }));
    store.upsert(makeNotification({ id: "n-2", createdAt: "2024-01-02T00:00:00Z" }));
    const list = store.list(20);
    expect(list[0].id).toBe("n-2");
    expect(list[1].id).toBe("n-1");
  });

  it("markRead sets read flag", () => {
    store.upsert(makeNotification());
    store.markRead("n-1");
    expect(store.list(20)[0].read).toBe(1);
  });

  it("markAllRead sets all read flags", () => {
    store.upsert(makeNotification({ id: "n-1" }));
    store.upsert(makeNotification({ id: "n-2" }));
    store.markAllRead();
    expect(store.list(20).every((n) => n.read === 1)).toBe(true);
  });
});
