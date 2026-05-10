import GitPage from "@/modules/git/pages/GitPage.vue";
import RemotePrPanel from "@/modules/git/components/RemotePrPanel.vue";
import SourceControlPanel from "@/modules/git/components/SourceControlPanel.vue";

export const gitRoutes = {
  path: "git",
  component: GitPage,
  children: [
    {
      path: "",
      name: "gitPanel",
      component: SourceControlPanel,
      meta: { gitTab: "local" },
    },
    {
      path: "pull-requests",
      name: "gitPullRequests",
      component: RemotePrPanel,
      meta: { gitTab: "prs" },
    },
    {
      path: "pull-requests/:prId",
      name: "gitPullRequest",
      component: RemotePrPanel,
      meta: { gitTab: "prs" },
    },
  ],
};
