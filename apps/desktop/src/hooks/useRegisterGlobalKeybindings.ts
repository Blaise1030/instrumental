import { onBeforeUnmount } from "vue";
import {
  eventMatchesBinding,
  findDefinitionIn,
  KEYBINDING_DEFINITIONS,
  mergeKeybindingOverrides
} from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import { useWorkspaceShellUiStore } from "@/stores/workspaceShellUiStore";

/**
 * Workspace-wide shortcuts that must fire even when `Layout.vue` is not mounted (e.g. settings).
 */
export function useRegisterGlobalKeybindings(): void {
  const keybindings = useKeybindingsStore();
  const shellUi = useWorkspaceShellUiStore();

  function onWorkspaceLauncherKeydown(ev: KeyboardEvent): void {
    const defs = mergeKeybindingOverrides(KEYBINDING_DEFINITIONS, keybindings.overrides);
    const def = findDefinitionIn(defs, "workspaceLauncher");
    if (!def || !eventMatchesBinding(ev, def)) return;
    ev.preventDefault();
    shellUi.toggleWorkspaceLauncher();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onWorkspaceLauncherKeydown, { capture: true });
  }

  onBeforeUnmount(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onWorkspaceLauncherKeydown, { capture: true });
    }
  });
}
