import type { AppDatabase } from "../storage/db.js";
import { sql } from "drizzle-orm";

type SafeStorageApi = typeof import("electron").safeStorage;

function getSafeStorage(): SafeStorageApi | null {
  try {
    return require("electron").safeStorage as SafeStorageApi;
  } catch {
    return null;
  }
}

/**
 * Encrypt a GitHub PAT for SQLite storage using the OS keychain (Electron `safeStorage`).
 * Falls back to storing plaintext only when encryption is unavailable (e.g. some CI / tests).
 */
export function encryptGitHubTokenForPersistence(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (!trimmed) return "";
  const ss = getSafeStorage();
  if (!ss?.isEncryptionAvailable()) return trimmed;
  return ss.encryptString(trimmed).toString("base64");
}

/** Decrypt a value written by {@link encryptGitHubTokenForPersistence}, or return legacy plaintext. */
export function decryptGitHubTokenFromPersistence(stored: string): string {
  const s = stored.trim();
  if (!s) return "";
  const ss = getSafeStorage();
  if (!ss?.isEncryptionAvailable()) return s;
  try {
    return ss.decryptString(Buffer.from(s, "base64"));
  } catch {
    return s;
  }
}

interface TokenRow {
  id: string;
  github_pr_token: string;
}

/**
 * Re-encrypt rows that still hold a legacy plaintext PAT so on-disk storage is not readable at rest.
 */
export function migrateGithubPrTokensToEncrypted(db: AppDatabase): void {
  const ss = getSafeStorage();
  if (!ss?.isEncryptionAvailable()) return;

  const rows = db.all<TokenRow>(sql`
    SELECT id, github_pr_token FROM projects WHERE trim(github_pr_token) != ''
  `);
  for (const row of rows) {
    const raw = row.github_pr_token;
    if (!raw.trim()) continue;
    try {
      ss.decryptString(Buffer.from(raw, "base64"));
      /* already ciphertext */
    } catch {
      const enc = encryptGitHubTokenForPersistence(raw);
      if (enc !== raw) {
        db.run(sql`UPDATE projects SET github_pr_token = ${enc} WHERE id = ${row.id}`);
      }
    }
  }
}
