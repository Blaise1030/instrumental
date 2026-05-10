import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * UI state shared between the root shell (`App.vue`) and `Layout.vue` so workspace launcher
 * and launcher commands work outside the main workspace layout (e.g. standalone settings routes).
 */
export const useWorkspaceShellUiStore = defineStore("workspaceShellUi", () => {
  const workspaceLauncherOpen = ref(false);
  const sidebarOpen = ref(true);

  function toggleWorkspaceLauncher(): void {
    workspaceLauncherOpen.value = !workspaceLauncherOpen.value;
  }

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value;
  }

  return {
    workspaceLauncherOpen,
    sidebarOpen,
    toggleWorkspaceLauncher,
    toggleSidebar
  };
});
