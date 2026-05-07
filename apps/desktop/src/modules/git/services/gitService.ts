import type { GitWorktreeListEntry, RepoScmSnapshot } from "@shared/ipc";

/** Git operations abstracted from Electron IPC (see `ipcGitService.ts`). */
export interface GitService {
  listWorktrees(cwd: string): Promise<GitWorktreeListEntry[]>;
  listBranchesExcludingWorktrees(cwd: string): Promise<string[]>;
  getCurrentBranch(cwd: string): Promise<string>;
  checkoutBranch(cwd: string, branch: string): Promise<void>;

  /** Full repo status snapshot. Returns `null` when `cwd` is not inside a git repository. */
  getStatus(cwd: string): Promise<RepoScmSnapshot | null>;

  stagePaths(cwd: string, paths: string[]): Promise<void>;
  stageAll(cwd: string): Promise<void>;
  unstagePaths(cwd: string, paths: string[]): Promise<void>;
  unstageAll(cwd: string): Promise<void>;
  discardPaths(cwd: string, paths: string[]): Promise<void>;
  discardAll(cwd: string): Promise<void>;
  commit(cwd: string, message: string): Promise<void>;
  fetch(cwd: string): Promise<void>;
  push(cwd: string): Promise<void>;
}
