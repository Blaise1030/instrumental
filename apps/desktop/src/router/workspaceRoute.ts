import Layout from "@/layouts/Layout.vue";
import { agentRoutes } from "@/modules/agent/agentRoute";
import { browserRoutes, browserRoutesBranch } from "@/modules/browser/browserRoute";
import { explorerRoutes, explorerRoutesBranch } from "@/modules/explorer/explorerRoute";
import { gitRoutes, gitRoutesBranch } from "@/modules/git/gitRoute";

const [agentThreadNewRoute, agentThreadParamShell] = agentRoutes;

/**
 * Workspace shell for `/:projectId/:branch`.
 * Git, preview, and file explorer routes are nested under `thread/:threadId` (not siblings of
 * `thread/new`) so URLs stay `.../thread/<id>/git` etc. — see `agentRoute`.
 * Settings live outside this shell — see `workspaceSettingsRoute` in `router/index.ts`.
 */
export const workspaceRoute = {
  path: "/:projectId/:branch",
  name: "workspace",
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
};
