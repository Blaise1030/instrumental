import LayoutShell from "@/layouts/LayoutShell.vue";
import Layout from "@/layouts/Layout.vue";
import { agentRoutes } from "@/modules/agent/agentRoute";
import { browserRoutes, browserRoutesBranch } from "@/modules/browser/browserRoute";
import { explorerRoutes, explorerRoutesBranch } from "@/modules/explorer/explorerRoute";
import { gitRoutes, gitRoutesBranch } from "@/modules/git/gitRoute";
import { symphonyRoute } from "@/modules/symphony/symphonyRoute";

const [agentThreadNewRoute, agentThreadParamShell] = agentRoutes;

/**
 * LayoutShell provides the top nav bar (project tabs, view toggle, settings) and a RouterView.
 *
 * Symphony routes render directly inside LayoutShell (no sidebar).
 *
 * All other workspace routes render inside the pathless Layout child, which adds the
 * thread/worktree sidebar and the workspace panel area.
 */
export const workspaceRoute = {
  path: "/:projectId/:branch",
  name: "workspace",
  component: LayoutShell,
  children: [
    // Symphony: full-width inside shell, no sidebar
    symphonyRoute,

    // Workspace: sidebar + panels
    {
      path: "",
      component: Layout,
      children: [
        agentThreadNewRoute,
        gitRoutesBranch,
        browserRoutesBranch,
        explorerRoutesBranch,
        {
          path: agentThreadParamShell.path,
          children: [
            ...(agentThreadParamShell.children ?? []),
            gitRoutes,
            browserRoutes,
            explorerRoutes,
          ],
        },
      ],
    },
  ],
};
