import { defineStore } from "pinia";
import type { Project, Thread, ThreadSession } from "@shared/domain";

/** Minimal shape for `branch · name` labels (full worktree rows satisfy this). */
export type WorktreeContextLabelSource = {
  branch?: string | null;
  name?: string | null;
};

export interface WorktreeSummary {
  path: string;
  /** Equal to path — used as opaque key for TerminalPane and localStorage. */
  id: string;
  branch: string;
  isDefault: boolean;
  projectId: string;
}

export interface WorkspaceThreadContext {
  worktreePath: string;
  displayLabel: string;
  isDefault: boolean;
  threads: Thread[];
}

export interface WorkspaceContextBadge {
  worktreePath: string;
  displayLabel: string;
  isDefault: boolean;
  threadCount: number;
}

export function worktreeBranchNameContextLabel(
  worktreeOrBranch: WorktreeContextLabelSource | string | null | undefined
): string {
  if (worktreeOrBranch == null || worktreeOrBranch === "") return "Primary";
  if (typeof worktreeOrBranch === "string") {
    return worktreeOrBranch.trim() || "Primary";
  }
  const wt = worktreeOrBranch;
  const branch = wt.branch != null && typeof wt.branch === "string" ? wt.branch.trim() : "";
  const name = wt.name != null && typeof wt.name === "string" ? wt.name.trim() : "";
  if (branch && name && branch !== name) return `${branch} · ${name}`;
  return branch || name || "Primary";
}

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    projects: [] as Project[],
    threads: [] as Thread[],
    threadSessions: [] as ThreadSession[]
  }),
  getters: {
    /** Look up the persisted session record for a thread by its ID. */
    threadSessionFor: (state) => (threadId: string): ThreadSession | undefined =>
      state.threadSessions?.find((s) => s.threadId === threadId)
  },
  actions: {
    hydrate(snapshot: {
      projects: Project[];
      threads: Thread[];
      threadSessions: ThreadSession[];
      activeProjectId: string | null;
      activeWorktreePath: string | null;
      activeThreadId: string | null;
    }): {
      activeProjectId: string | null;
      activeWorktreePath: string | null;
      activeThreadId: string | null;
    } {
      this.projects = snapshot.projects ?? [];
      this.threads = snapshot.threads ?? [];
      this.threadSessions = snapshot.threadSessions ?? [];
      return {
        activeProjectId: snapshot.activeProjectId,
        activeWorktreePath: snapshot.activeWorktreePath,
        activeThreadId: snapshot.activeThreadId
      };
    },
    /** Immediate UI update; call refreshSnapshot after IPC so server state wins. */
    removeThreadLocal(threadId: string): void {
      this.threads = this.threads.filter((t) => t.id !== threadId);
    }
  }
});
