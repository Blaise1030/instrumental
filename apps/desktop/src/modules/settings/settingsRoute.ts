import SettingsPage from "@/modules/settings/pages/SettingsPage.vue";

/** Workspace-level settings (`/:projectId/:branch/settings`). */
export const settingsRoute = {
  path: "settings",
  name: "workspaceSettings",
  component: SettingsPage,
} as const;
