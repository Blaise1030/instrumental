import type { Router } from "vue-router";
import { useRoute, useRouter } from "vue-router";
import { decodeBranch, encodeBranch } from "@/router/branchParam";
import {
  loadStoredWorkspaceRoute,
  storedRouteToLocation,
  storedRouteTargetsProject,
  routeParamFirst,
} from "@/router/workspaceRouteMemory";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useAppContext } from "@/app-context/useAppContext";
import type { WorkspaceService } from "@/app-context/workspaceService";

type WorkspaceStore = ReturnType<typeof useWorkspaceStore>;

async function tryRestoreStoredRoute(
  router: Router,
  workspaceService: WorkspaceService,
  workspace: WorkspaceStore,
  targetProjectId: string,
): Promise<boolean> {
  const stored = loadStoredWorkspaceRoute(targetProjectId);
  if (!stored || !storedRouteTargetsProject(stored, targetProjectId)) return false;

  const branchEnc = routeParamFirst(stored.params.branch);
  if (!branchEnc) return false;

  let decoded: string;
  try {
    decoded = decodeBranch(branchEnc);
  } catch {
    return false;
  }

  const worktree = workspace.worktrees.find(
    (w) => w.projectId === targetProjectId && w.branch === decoded,
  );
  if (!worktree) return false;

  if (stored.name === "threadNew") {
    await workspaceService.setActive({
      projectId: targetProjectId,
      worktreeId: worktree.id,
      threadId: null,
    });
    await router.push(storedRouteToLocation(stored));
    return true;
  }

  const threadIdStr = routeParamFirst(stored.params.threadId);
  if (!threadIdStr) return false;

  const thread = workspace.threads.find(
    (t) => t.id === threadIdStr && t.worktreeId === worktree.id,
  );
  if (!thread) return false;

  await workspaceService.setActive({
    projectId: targetProjectId,
    worktreeId: worktree.id,
    threadId: thread.id,
  });

  await router.push(storedRouteToLocation(stored));
  return true;
}

export function useNavigateToProject(): {
  navigateToProject: (targetProjectId: string) => Promise<boolean>;
} {
  const router = useRouter();
  const route = useRoute();
  const workspace = useWorkspaceStore();
  const appContext = useAppContext();

  async function navigateToProject(targetProjectId: string): Promise<boolean> {
    if ((route.params.projectId as string | undefined) === targetProjectId) {
      return false;
    }

    const workspaceService = appContext.value?.workspaceService;
    if (!workspaceService) return false;

    let snapshot = await workspaceService.getSnapshot();
    workspace.hydrate(snapshot);

    const synced = await workspaceService.syncWorktrees(targetProjectId);
    if (synced) {
      workspace.hydrate(synced);
    }

    snapshot = await workspaceService.getSnapshot();
    workspace.hydrate(snapshot);

    const project = workspace.projects.find((p) => p.id === targetProjectId);
    if (!project) return false;

    if (await tryRestoreStoredRoute(router, workspaceService, workspace, targetProjectId)) {
      snapshot = await workspaceService.getSnapshot();
      workspace.hydrate(snapshot);
      return true;
    }

    const worktree =
      workspace.worktrees.find(
        (w) => w.projectId === targetProjectId && w.id === project.lastActiveWorktreeId,
      ) ?? workspace.worktrees.find((w) => w.projectId === targetProjectId && w.isDefault);
    if (!worktree) return false;

    const lastThreadId = worktree.lastActiveThreadId;
    const thread =
      (lastThreadId && workspace.threads.find((t) => t.id === lastThreadId)) ||
      workspace.threads.find((t) => t.worktreeId === worktree.id);

    await workspaceService.setActive({
      projectId: targetProjectId,
      worktreeId: worktree.id,
      threadId: thread?.id ?? null,
    });

    snapshot = await workspaceService.getSnapshot();
    workspace.hydrate(snapshot);

    const eb = encodeBranch(worktree.branch);
    if (thread) {
      await router.push({
        name: "agent",
        params: { projectId: targetProjectId, branch: eb, threadId: thread.id },
      });
    } else {
      await router.push({
        name: "threadNew",
        params: { projectId: targetProjectId, branch: eb },
      });
    }
    return true;
  }

  return { navigateToProject };
}
