import { onBeforeUnmount } from "vue";
import {
  eventMatchesBinding,
  findDefinitionIn,
  KEYBINDING_DEFINITIONS,
  mergeKeybindingOverrides,
  shouldDeferToggleTerminalPanelShortcut,
  type KeybindingId
} from "@/keybindings/registry";
import { router } from "@/router";
import { resolveThreadScopedWorkspaceParams } from "@/router/workspaceNavParams";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import { useWorkspaceShellUiStore } from "@/stores/workspaceShellUiStore";

const SETTINGS_ROUTE_NAMES = new Set<string>(["settingsAgents", "settingsTerminal", "settingsKeyboard"]);

/**
 * Workspace-wide shortcuts registered from `App.vue` (always mounted with Pinia + Router).
 */
export function useRegisterGlobalKeybindings(): void {
  const keybindings = useKeybindingsStore();
  const shellUi = useWorkspaceShellUiStore();

  function onGlobalWorkspaceKeydown(ev: KeyboardEvent): void {
    const defs = mergeKeybindingOverrides(KEYBINDING_DEFINITIONS, keybindings.overrides);

    const launcherDef = findDefinitionIn(defs, "workspaceLauncher");
    if (launcherDef && eventMatchesBinding(ev, launcherDef)) {
      ev.preventDefault();
      shellUi.toggleWorkspaceLauncher();
      return;
    }

    const route = router.currentRoute.value;
    if (SETTINGS_ROUTE_NAMES.has(String(route.name ?? ""))) return;
    if (shellUi.workspaceLauncherOpen) return;

    const toggleDef = findDefinitionIn(defs, "toggleTerminalPanel");
    if (toggleDef && eventMatchesBinding(ev, toggleDef)) {
      if (shouldDeferToggleTerminalPanelShortcut(ev)) return;
      ev.preventDefault();
      shellUi.requestTerminalDockToggle();
      return;
    }

    const addTermDef = findDefinitionIn(defs, "addTerminal");
    if (addTermDef && eventMatchesBinding(ev, addTermDef)) {
      if (shouldDeferToggleTerminalPanelShortcut(ev)) return;
      ev.preventDefault();
      shellUi.requestTerminalNewTab();
      return;
    }

    const p = resolveThreadScopedWorkspaceParams(route);
    if (!p) return;

    const tryPanel = (id: KeybindingId, routeName: string): boolean => {
      const def = findDefinitionIn(defs, id);
      if (!def || !eventMatchesBinding(ev, def)) return false;
      ev.preventDefault();
      void router.push({ name: routeName, params: p });
      return true;
    };

    if (tryPanel("focusAgentTab", "agent")) return;
    if (tryPanel("focusGitPanel", "gitPanel")) return;
    if (tryPanel("focusPreviewPanel", "previewPanel")) return;
    if (tryPanel("focusFilesPanel", "filesPanel")) return;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onGlobalWorkspaceKeydown, { capture: true });
  }

  onBeforeUnmount(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onGlobalWorkspaceKeydown, { capture: true });
    }
  });
}
