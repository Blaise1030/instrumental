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

  // Find a thread whose branch matches the stored route context
  const thread = workspace.threads.find(
    (t) => t.projectId === targetProjectId && t.createdBranch === decoded,
  );
  if (!thread) return false;

  if (stored.name === "threadNew") {
    await workspaceService.setActive({
      projectId: targetProjectId,
      worktreePath: thread.worktreePath,
      threadId: null,
    });
    await router.push(storedRouteToLocation(stored));
    return true;
  }

  const threadIdStr = routeParamFirst(stored.params.threadId);
  if (!threadIdStr) return false;

  const target = workspace.threads.find(
    (t) => t.id === threadIdStr && t.worktreePath === thread.worktreePath,
  );
  if (!target) return false;

  await workspaceService.setActive({
    projectId: targetProjectId,
    worktreePath: target.worktreePath,
    threadId: target.id,
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

    const snapshot = await workspaceService.getSnapshot();
    workspace.hydrate(snapshot);

    const project = workspace.projects.find((p) => p.id === targetProjectId);
    if (!project) return false;

    if (await tryRestoreStoredRoute(router, workspaceService, workspace, targetProjectId)) {
      const fresh = await workspaceService.getSnapshot();
      workspace.hydrate(fresh);
      return true;
    }

    // Pick the most recently updated thread for this project
    const thread = workspace.threads
      .filter((t) => t.projectId === targetProjectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;

    if (thread?.createdBranch) {
      await workspaceService.setActive({
        projectId: targetProjectId,
        worktreePath: thread.worktreePath,
        threadId: thread.id,
      });
      const fresh = await workspaceService.getSnapshot();
      workspace.hydrate(fresh);
      await router.push({
        name: "agent",
        params: {
          projectId: targetProjectId,
          branch: encodeBranch(thread.createdBranch),
          threadId: thread.id,
        },
      });
    } else {
      // No threads yet — just update active project
      await workspaceService.setActive({
        projectId: targetProjectId,
        worktreePath: null,
        threadId: null,
      });
      const fresh = await workspaceService.getSnapshot();
      workspace.hydrate(fresh);
    }

    return true;
  }

  return { navigateToProject };
}
