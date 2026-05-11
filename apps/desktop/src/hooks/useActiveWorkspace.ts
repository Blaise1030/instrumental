import { computed } from "vue";
import { useRoute } from "vue-router";
import { decodeBranch } from "@/router/branchParam";
import {
  type WorkspaceContextBadge,
  type WorkspaceThreadContext,
  type WorktreeSummary,
  worktreeBranchNameContextLabel
} from "@/stores/workspaceStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Thread } from "@shared/domain";

function compareThreadSort(a: Thread, b: Thread): number {
  const byCreated = b.createdAt.localeCompare(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

function threadsForPath(threads: Thread[], worktreePath: string): Thread[] {
  return threads.filter((t) => t.worktreePath === worktreePath).sort(compareThreadSort);
}

function makeWorktreeSummary(
  path: string,
  branch: string | null,
  isDefault: boolean,
  projectId: string
): WorktreeSummary {
  return { path, id: path, branch: branch ?? "main", isDefault, projectId };
}

export function useActiveWorkspace() {
  const route = useRoute();
  const workspace = useWorkspaceStore();

  const activeProjectId = computed<string | null>(() => {
    const id = route.params.projectId;
    return typeof id === "string" && id.length > 0 ? id : null;
  });

  const activeProject = computed(() =>
    workspace.projects.find((p) => p.id === activeProjectId.value)
  );

  const activeBranch = computed<string | null>(() => {
    const b = route.params.branch;
    return typeof b === "string" && b.length > 0 ? decodeBranch(b) : null;
  });

  const activeWorktree = computed<WorktreeSummary | undefined>(() => {
    const pid = activeProjectId.value;
    const branch = activeBranch.value;
    if (!pid || !branch) return undefined;
    const thread = workspace.threads.find(
      (t) => t.projectId === pid && t.createdBranch === branch
    );
    if (thread) {
      const isDefault = thread.worktreePath === activeProject.value?.repoPath;
      return makeWorktreeSummary(thread.worktreePath, branch, isDefault, pid);
    }
    // No thread — use the registered worktree path for this branch (populated by listWorktrees)
    const registeredPath = workspace.worktreePathByBranch[`${pid}:${branch}`];
    if (registeredPath) {
      const isDefault = registeredPath === activeProject.value?.repoPath;
      return makeWorktreeSummary(registeredPath, branch, isDefault, pid);
    }
    // Last resort: project root
    const repoPath = activeProject.value?.repoPath;
    if (repoPath) return makeWorktreeSummary(repoPath, branch, true, pid);
    return undefined;
  });

  /** The worktree path for the currently active worktree context. */
  const activeWorktreePath = computed<string | null>(() => activeWorktree.value?.path ?? null);

  /** Alias for backward compatibility — equals activeWorktreePath. */
  const activeWorktreeId = activeWorktreePath;

  const activeThreadId = computed<string | null>(() => {
    const id = route.params.threadId;
    return typeof id === "string" && id.length > 0 ? id : null;
  });

  const activeThread = computed(() =>
    workspace.threads.find((t) => t.id === activeThreadId.value)
  );

  const activeThreads = computed<Thread[]>(() => {
    const path = activeWorktree.value?.path;
    if (!path) return [];
    return threadsForPath(workspace.threads, path);
  });

  const activeProjectThreads = computed<Thread[]>(() => {
    const pid = activeProjectId.value;
    if (!pid) return [];
    const repoPath = activeProject.value?.repoPath ?? "";
    return workspace.threads
      .filter((t) => t.projectId === pid)
      .sort((a, b) => {
        const aDefault = a.worktreePath === repoPath ? 0 : 1;
        const bDefault = b.worktreePath === repoPath ? 0 : 1;
        if (aDefault !== bDefault) return aDefault - bDefault;
        const byPath = a.worktreePath.localeCompare(b.worktreePath);
        if (byPath !== 0) return byPath;
        return compareThreadSort(a, b);
      });
  });

  const defaultWorktree = computed<WorktreeSummary | undefined>(() => {
    const pid = activeProjectId.value;
    const project = activeProject.value;
    if (!pid || !project) return undefined;
    const thread = workspace.threads.find(
      (t) => t.projectId === pid && t.worktreePath === project.repoPath
    );
    return makeWorktreeSummary(
      project.repoPath,
      thread?.createdBranch ?? null,
      true,
      pid
    );
  });

  const threadGroups = computed<WorktreeSummary[]>(() => {
    const pid = activeProjectId.value;
    if (!pid) return [];
    const repoPath = activeProject.value?.repoPath ?? "";
    const seen = new Set<string>();
    const result: WorktreeSummary[] = [];
    for (const t of workspace.threads) {
      if (t.projectId !== pid || t.worktreePath === repoPath) continue;
      if (seen.has(t.worktreePath)) continue;
      seen.add(t.worktreePath);
      result.push(makeWorktreeSummary(t.worktreePath, t.createdBranch, false, pid));
    }
    return result;
  });

  const threadContexts = computed<WorkspaceThreadContext[]>(() => {
    const pid = activeProjectId.value;
    if (!pid) return [];
    const repoPath = activeProject.value?.repoPath ?? "";
    const projectThreads = workspace.threads.filter((t) => t.projectId === pid);

    const groups = new Map<string, Thread[]>();
    for (const t of projectThreads) {
      const arr = groups.get(t.worktreePath) ?? [];
      arr.push(t);
      groups.set(t.worktreePath, arr);
    }

    const contexts: WorkspaceThreadContext[] = [];
    const defaultThreads = groups.get(repoPath);
    if (defaultThreads) {
      contexts.push({
        worktreePath: repoPath,
        displayLabel: worktreeBranchNameContextLabel(defaultThreads[0]?.createdBranch),
        isDefault: true,
        threads: defaultThreads.sort(compareThreadSort)
      });
    }
    for (const [path, threads] of groups) {
      if (path === repoPath) continue;
      contexts.push({
        worktreePath: path,
        displayLabel: worktreeBranchNameContextLabel(threads[0]?.createdBranch),
        isDefault: false,
        threads: threads.sort(compareThreadSort)
      });
    }
    return contexts;
  });

  const activeContextBadge = computed((): WorkspaceContextBadge | null => {
    const wt = activeWorktree.value;
    const pid = activeProjectId.value;
    if (!wt || !pid || wt.projectId !== pid) return null;
    return {
      worktreePath: wt.path,
      displayLabel: worktreeBranchNameContextLabel(wt.branch),
      isDefault: wt.isDefault,
      threadCount: threadsForPath(workspace.threads, wt.path).length
    };
  });

  const hasActiveWorkspace = computed<boolean>(() =>
    Boolean(activeProjectId.value && activeWorktree.value?.path)
  );

  return {
    activeProjectId,
    activeProject,
    activeBranch,
    activeWorktree,
    activeWorktreePath,
    activeWorktreeId,
    activeThreadId,
    activeThread,
    activeThreads,
    activeProjectThreads,
    defaultWorktree,
    threadGroups,
    threadContexts,
    activeContextBadge,
    hasActiveWorkspace
  };
}
