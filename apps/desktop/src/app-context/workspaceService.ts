import type { AddProjectInput, WorkspaceSnapshot } from "@shared/ipc";

export interface WorkspaceService {
  getSnapshot(): Promise<WorkspaceSnapshot>;
  setActive(payload: {
    projectId: string | null;
    worktreePath: string | null;
    threadId: string | null;
  }): Promise<void>;
  pickRepoDirectory(): Promise<string | null>;
  addProject(payload: AddProjectInput): Promise<WorkspaceSnapshot>;
  canCreateWorktreeGroup(): boolean;
  canDeleteWorktreeGroup(): boolean;
  /** Subscribe to thread run-state changes. Returns a disposer, or null if unavailable in this mode. */
  onThreadRunStateChanged(callback: (threadId: string, state: string) => void): (() => void) | null;
}
