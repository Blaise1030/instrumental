import SettingsLayout from "@/modules/settings/layouts/SettingsLayout.vue";
import SettingsAgentsPage from "@/modules/settings/pages/SettingsAgentsPage.vue";
import SettingsKeyboardPage from "@/modules/settings/pages/SettingsKeyboardPage.vue";
import SettingsTerminalPage from "@/modules/settings/pages/SettingsTerminalPage.vue";

/**
 * Workspace settings as a **standalone** route (no `Layout.vue` shell).
 * Register **before** `/:projectId/:branch` in `router/index.ts` so `/…/settings` resolves here.
 */
export const workspaceSettingsRoute = {
  path: "/:projectId/:branch/settings",
  component: SettingsLayout,
  children: [
    { path: "", name: "settingsAgents", component: SettingsAgentsPage },
    { path: "terminal", name: "settingsTerminal", component: SettingsTerminalPage },
    { path: "keyboard", name: "settingsKeyboard", component: SettingsKeyboardPage }
  ]
} as const;
