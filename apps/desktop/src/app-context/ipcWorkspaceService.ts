import type { AddProjectInput, WorkspaceSnapshot } from "@shared/ipc";
import type { WorkspaceService } from "./workspaceService";

type WorkspaceApiSubset = {
  getSnapshot: () => Promise<unknown>;
  addProject: (payload: AddProjectInput) => Promise<unknown>;
  setActive?: (payload: {
    projectId: string | null;
    worktreePath: string | null;
    threadId: string | null;
  }) => Promise<void>;
  pickRepoDirectory?: () => Promise<string | null>;
  createWorktreeGroup?: (payload: {
    projectId: string;
    branch: string;
    baseBranch: string | null;
  }) => Promise<unknown>;
  deleteWorktreeGroup?: (payload: { worktreeId: string }) => Promise<void>;
  onThreadRunStateChanged?: (callback: (threadId: string, state: string) => void) => () => void;
};

function readApi(): WorkspaceApiSubset | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as typeof globalThis & { workspaceApi?: WorkspaceApiSubset }).workspaceApi;
}

export class IpcWorkspaceService implements WorkspaceService {
  async getSnapshot(): Promise<WorkspaceSnapshot> {
    const api = readApi();
    if (!api) throw new Error("workspaceApi not available");
    return api.getSnapshot() as Promise<WorkspaceSnapshot>;
  }

  async setActive(payload: {
    projectId: string | null;
    worktreePath: string | null;
    threadId: string | null;
  }): Promise<void> {
    const api = readApi();
    if (!api?.setActive) return;
    return api.setActive(payload);
  }

  async pickRepoDirectory(): Promise<string | null> {
    const api = readApi();
    if (!api?.pickRepoDirectory) return null;
    return api.pickRepoDirectory();
  }

  async addProject(payload: AddProjectInput): Promise<WorkspaceSnapshot> {
    const api = readApi();
    if (!api) throw new Error("workspaceApi not available");
    return api.addProject(payload) as Promise<WorkspaceSnapshot>;
  }

  canCreateWorktreeGroup(): boolean {
    return Boolean(readApi()?.createWorktreeGroup);
  }

  canDeleteWorktreeGroup(): boolean {
    return Boolean(readApi()?.deleteWorktreeGroup);
  }

  onThreadRunStateChanged(callback: (threadId: string, state: string) => void): (() => void) | null {
    const api = readApi();
    if (!api?.onThreadRunStateChanged) return null;
    return api.onThreadRunStateChanged(callback);
  }
}
