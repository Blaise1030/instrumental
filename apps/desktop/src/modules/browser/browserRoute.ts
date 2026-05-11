import BrowserPage from "./pages/BrowserPage.vue";

export const browserRoutes = {
  path: "preview",
  name: "previewPanel",
  component: BrowserPage,
};

/** Branch-level browser route — accessible without a threadId (e.g. from the new-thread page). */
export const browserRoutesBranch = {
  path: "preview",
  name: "previewPanelBranch",
  component: BrowserPage,
};
