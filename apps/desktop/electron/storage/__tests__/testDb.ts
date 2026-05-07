import { vi } from "vitest";

vi.mock("better-sqlite3", async () => {
  const module = await import("./betterSqlite3Compat");
  return { default: module.default };
});

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../schema";
import type { AppDatabase } from "../db";

export function createTestDb(): AppDatabase {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  return drizzle(sqlite, { schema }) as AppDatabase;
}
