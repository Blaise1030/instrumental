import { createMemoryHistory, createRouter } from "vue-router";
import { welcomeRoutes } from "@/modules/welcome/welcomeRoute";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { persistWorkspaceRouteFromNavigation } from "./workspaceRouteMemory";
import { workspaceRoute } from "./workspaceRoute";

export const router = createRouter({
  history: createMemoryHistory(),
  routes: [welcomeRoutes, workspaceRoute],
});

router.beforeEach((to) => {
  const workspace = useWorkspaceStore();

  // const projectId = to.params.projectId as string | undefined;
  // if (!projectId) return true;  
  // const project = workspace.projects.find((p) => p.id === projectId);
  // if (!project) return { name: "welcome" };  

  return true;
});

router.afterEach((to) => {
  persistWorkspaceRouteFromNavigation(to);
});
