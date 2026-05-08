import type { AddProjectInput, WorkspaceSnapshot } from "@shared/ipc";

export interface WorkspaceService {
  getSnapshot(): Promise<WorkspaceSnapshot>;
  syncWorktrees(projectId: string): Promise<WorkspaceSnapshot | null>;
  setActive(payload: {
    projectId: string | null;
    worktreeId: string | null;
    threadId: string | null;
  }): Promise<void>;
  pickRepoDirectory(): Promise<string | null>;
  addProject(payload: AddProjectInput): Promise<WorkspaceSnapshot>;
  /** Subscribe to thread run-state changes. Returns a disposer, or null if unavailable in this mode. */
  onThreadRunStateChanged(callback: (threadId: string, state: string) => void): (() => void) | null;
}
