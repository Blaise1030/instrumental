import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./testDb";
import { SettingsStore } from "../stores/SettingsStore";
import type { AppDatabase } from "../db";

describe("SettingsStore", () => {
  let db: AppDatabase;
  let store: SettingsStore;

  beforeEach(() => {
    db = createTestDb();
    store = new SettingsStore(db);
    store.initialize();
  });

  it("returns null active state after init", () => {
    const state = store.getActiveState();
    expect(state.activeProjectId).toBeNull();
    expect(state.activeWorktreePath).toBeNull();
    expect(state.activeThreadId).toBeNull();
  });

  it("sets and gets active state", () => {
    store.setRawActiveState("p-1", "/path/to/wt", "t-1");
    const state = store.getActiveState();
    expect(state.activeProjectId).toBe("p-1");
    expect(state.activeWorktreePath).toBe("/path/to/wt");
    expect(state.activeThreadId).toBe("t-1");
  });
});
