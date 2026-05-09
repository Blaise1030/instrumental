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
    const branchExists = workspace.threads.some(
      (t) => t.projectId === projectId && t.createdBranch === decodedBranch,
    );
    if (!branchExists) {
      // Redirect to the most recently updated thread in this project
      const fallback = workspace.threads
        .filter((t) => t.projectId === projectId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (fallback?.createdBranch) {
        const eb = encodeBranch(fallback.createdBranch);
        return { name: "agent", params: { projectId, branch: eb, threadId: fallback.id } };
      }
      return { name: "welcome" };
    }

    if (threadId) {
      const thread = workspace.threads.find((t) => t.id === threadId);
      if (!thread) {
        const fallback = workspace.threads.find(
          (t) => t.projectId === projectId && t.createdBranch === decodedBranch,
        );
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
