import fs from "node:fs";
import { simpleGit } from "simple-git";
import type { GitAdapter } from "./workspaceService.js";

/** Validates that a branch name cannot be interpreted as a git flag. */
export function isValidBranchName(name: string): boolean {
  return /^[a-zA-Z0-9._\-\/]+$/.test(name) && !name.startsWith("-");
}

export function createGitAdapter(): GitAdapter {
  return {
    async worktreeList(repoPath) {
      const git = simpleGit(repoPath);
      const raw = await git.raw(["worktree", "list", "--porcelain"]);
      const entries: Array<{ path: string; branch: string }> = [];
      let currentPath = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("worktree ")) {
          currentPath = line.slice("worktree ".length);
        } else if (line.startsWith("branch refs/heads/")) {
          entries.push({ path: currentPath, branch: line.slice("branch refs/heads/".length) });
        }
      }
      return entries;
    },

    async branchList(repoPath) {
      const git = simpleGit(repoPath);
      const result = await git.branchLocal();
      return result.all;
    },

    async pathExists(fsPath) {
      return fs.existsSync(fsPath);
    }
  };
}
