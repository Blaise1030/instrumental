import GitModuleLayout from "@/modules/git/layouts/GitModuleLayout.vue";
import GitLocalChangesPage from "@/modules/git/pages/GitLocalChangesPage.vue";
import GitRemoteChangesPage from "@/modules/git/pages/GitRemoteChangesPage.vue";

export const gitRoutes = {
  path: "git",
  component: GitModuleLayout,
  children: [
    {
      path: "",
      name: "gitPanel",
      component: GitLocalChangesPage,
    },
    {
      path: "pull-requests",
      name: "gitPullRequests",
      component: GitRemoteChangesPage,
    },
    {
      path: "pull-requests/:prId",
      name: "gitPullRequest",
      component: GitRemoteChangesPage,
    },
  ],
};
