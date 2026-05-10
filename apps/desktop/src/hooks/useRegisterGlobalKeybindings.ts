import { onBeforeUnmount, onMounted } from "vue";
import { eventMatchesBinding, findDefinitionIn } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import { useWorkspaceShellUiStore } from "@/stores/workspaceShellUiStore";

/**
 * Workspace-wide shortcuts that must fire even when `Layout.vue` is not mounted (e.g. settings).
 */
export function useRegisterGlobalKeybindings(): void {
  const keybindings = useKeybindingsStore();
  const shellUi = useWorkspaceShellUiStore();

  function onWorkspaceLauncherKeydown(ev: KeyboardEvent): void {
    const def = findDefinitionIn(keybindings.effectiveDefinitions, "workspaceLauncher");
    if (!def || !eventMatchesBinding(ev, def)) return;
    ev.preventDefault();
    shellUi.toggleWorkspaceLauncher();
  }

  onMounted(() => {
    window.addEventListener("keydown", onWorkspaceLauncherKeydown, { capture: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onWorkspaceLauncherKeydown, { capture: true });
  });
}
