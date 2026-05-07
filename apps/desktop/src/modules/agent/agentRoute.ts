import AgentPage from "@/modules/agent/pages/AgentPage.vue";
import CreateNewThread from "@/modules/agent/pages/CreateNewThread.vue";

/**
 * Agent-only route records under workspace (`/:projectId/:branch`).
 * `router/index.ts` merges `thread/:threadId` children with git, preview, and explorer routes.
 */
export const agentRoutes = [
  {
    path: "thread/new",
    name: "threadNew",
    component: CreateNewThread,
  },
  {
    path: "thread/:threadId",
    children: [
      {
        path: "",
        redirect: { name: "agent" },
      },
      {
        path: "agent",
        name: "agent",
        component: AgentPage,
      },
    ],
  },
] as const;
