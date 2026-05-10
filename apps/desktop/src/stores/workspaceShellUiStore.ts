import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * UI state shared between the root shell (`App.vue`) and `Layout.vue` so workspace launcher
 * and launcher commands work outside the main workspace layout (e.g. standalone settings routes).
 */
export const useWorkspaceShellUiStore = defineStore("workspaceShellUi", () => {
  const workspaceLauncherOpen = ref(false);
  const sidebarOpen = ref(true);
  /** Incremented so `Layout.vue` can react outside nested routes / lifecycle quirks. */
  const terminalDockTogglePulse = ref(0);
  const terminalNewTabPulse = ref(0);

  function toggleWorkspaceLauncher(): void {
    workspaceLauncherOpen.value = !workspaceLauncherOpen.value;
  }

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value;
  }

  function requestTerminalDockToggle(): void {
    terminalDockTogglePulse.value += 1;
  }

  function requestTerminalNewTab(): void {
    terminalNewTabPulse.value += 1;
  }

  return {
    workspaceLauncherOpen,
    sidebarOpen,
    terminalDockTogglePulse,
    terminalNewTabPulse,
    toggleWorkspaceLauncher,
    toggleSidebar,
    requestTerminalDockToggle,
    requestTerminalNewTab
  };
});
