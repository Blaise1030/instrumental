import { createMemoryHistory, createRouter } from "vue-router";
import { welcomeRoutes } from "@/modules/welcome/welcomeRoute";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { decodeBranch, encodeBranch } from "./branchParam";
import { persistWorkspaceRouteFromNavigation } from "./workspaceRouteMemory";
import { workspaceRoute } from "./workspaceRoute";

export const router = createRouter({
  history: createMemoryHistory(),
  routes: [welcomeRoutes, workspaceRoute],
});

router.beforeEach((to) => {
  const projectId = to.params.projectId as string | undefined;
  const branch = to.params.branch as string | undefined;
  const threadId = to.params.threadId as string | undefined;

  if (!projectId) return true;

  const workspace = useWorkspaceStore();

  const project = workspace.projects.find((p) => p.id === projectId);
  if (!project) return { name: "welcome" };

  if (branch) {
    const decodedBranch = decodeBranch(branch);
    const worktree = workspace.worktrees.find(
      (w) => w.projectId === projectId && w.branch === decodedBranch,
    );
    if (!worktree) {
      const primary = workspace.worktrees.find((w) => w.projectId === projectId && w.isDefault);
      if (!primary) return { name: "welcome" };
      const eb = encodeBranch(primary.branch);
      const fallbackThread = workspace.threads.find((t) => t.worktreeId === primary.id);
      if (fallbackThread) {
        return {
          name: "agent",
          params: { projectId, branch: eb, threadId: fallbackThread.id },
        };
      }
      return { name: "threadNew", params: { projectId, branch: eb } };
    }

    if (threadId) {
      const thread = workspace.threads.find((t) => t.id === threadId);
      if (!thread) {
        const fallback = workspace.threads.find((t) => t.worktreeId === worktree.id);
        if (fallback) {
          return { name: "agent", params: { projectId, branch, threadId: fallback.id } };
        }
        return { name: "threadNew", params: { projectId, branch } };
      }
    }
  }

  return true;
});

router.afterEach((to) => {
  persistWorkspaceRouteFromNavigation(to);
});
