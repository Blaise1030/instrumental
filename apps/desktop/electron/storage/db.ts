import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export function openDatabase(baseDir: string, filename = "workspace.db") {
  fs.mkdirSync(baseDir, { recursive: true });
  const dbPath = path.join(baseDir, filename);
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof openDatabase>;
