<script setup lang="ts">
import { THREAD_AGENT_BOOTSTRAP_COMMAND } from "@shared/threadAgentBootstrap";
import { THREAD_AGENT_SKILL_ROOT_DEFAULT } from "@shared/threadAgentSkillRoots";
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from "vue";
import { useRoute, useRouter, RouterView } from "vue-router";
import { Bot, ChevronLeft, Keyboard, Settings2, SquareTerminal, type LucideIcon } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { usePreferredThreadAgent } from "@/modules/agent/hooks/usePreferredThreadAgent";
import { useAgentPageComposerVisible } from "@/modules/agent/hooks/useAgentPageComposerVisible";
import { useTerminalSoundSettings } from "@/modules/agent/hooks/useTerminalSoundSettings";
import { useAgentBootstrapCommands } from "@/modules/agent/hooks/useAgentBootstrapCommands";
import { useAgentSkillRoots } from "@/modules/agent/hooks/useAgentSkillRoots";
import type { ThreadAgent } from "@shared/domain";
import { DEFAULT_TERMINAL_ACTIVITY_SENSITIVITY } from "@/terminal/activitySensitivity";
import {
  conflictingBindingId,
  findDefinitionIn,
  KEYBINDING_DEFINITIONS,
  mergeKeybindingOverrides,
  physicalShortcutFromKeyboardEvent,
  type KeybindingDefinition,
  type KeybindingId
} from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from "@/components/ui/sidebar";
import { settingsLayoutContextKey } from "@/modules/settings/settingsLayoutContext";
import { useIsFullscreen } from "@/hooks/useIsFullscreen";
import { takeSettingsExitFullPath } from "@/modules/settings/settingsExitRoute";
import {
  loadStoredWorkspaceRoute,
  storedRouteTargetsProject,
  storedRouteToLocation
} from "@/router/workspaceRouteMemory";

const SETTINGS_ROUTE_NAMES = new Set<string>(["settingsAgents", "settingsTerminal", "settingsKeyboard"]);

const route = useRoute();
const router = useRouter();
const { isFullscreen } = useIsFullscreen();

const agentCmd = useAgentBootstrapCommands();
const agentRoots = useAgentSkillRoots();

const draft = ref<Record<ThreadAgent, string>>({ ...agentCmd.commands.value });
const draftSkillRoots = ref<Record<ThreadAgent, string>>({ ...agentRoots.skillRoots.value });
const panelRef = ref<HTMLElement | null>(null);

const { preferredAgent, setPreferredAgent, syncFromStorage } = usePreferredThreadAgent();

const settingsNavItems: {
  routeName: "settingsAgents" | "settingsTerminal" | "settingsKeyboard";
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { routeName: "settingsAgents", label: "Agents", description: "CLI bootstrap lines and skill directories", icon: Bot },
  {
    routeName: "settingsTerminal",
    label: "Terminal",
    description: "Desktop notifications",
    icon: SquareTerminal
  },
  { routeName: "settingsKeyboard", label: "Keyboard", description: "Workspace keyboard shortcuts", icon: Keyboard }
];

const sectionKicker = computed(() => {
  switch (route.name) {
    case "settingsAgents":
      return "Agents";
    case "settingsTerminal":
      return "Terminal";
    case "settingsKeyboard":
      return "Keyboard";
    default:
      return "Settings";
  }
});

const activeSettingsNavItem = computed(() =>
  settingsNavItems.find((item) => item.routeName === route.name)
);

const settingsPanelAgentsId = "workspace-settings-panel-agents";
const settingsPanelTerminalId = "workspace-settings-panel-terminal";
const settingsPanelKeyboardId = "workspace-settings-panel-keyboard";

const KEYBIND_CATEGORY_ORDER: KeybindingDefinition["category"][] = [
  "Navigation",
  "Threads",
  "Git diff",
  "Files",
  "General"
];

const keybindings = useKeybindingsStore();

const definitionOrderIndex = new Map(
  KEYBINDING_DEFINITIONS.map((def, index) => [def.id, index] as const)
);

const categoryOrderIndex = new Map(
  KEYBIND_CATEGORY_ORDER.map((category, index) => [category, index] as const)
);

const keyboardBindingsRows = computed(() =>
  [...keybindings.effectiveDefinitions].sort((a, b) => {
    const ca = categoryOrderIndex.get(a.category) ?? 99;
    const cb = categoryOrderIndex.get(b.category) ?? 99;
    if (ca !== cb) return ca - cb;
    return (definitionOrderIndex.get(a.id) ?? 0) - (definitionOrderIndex.get(b.id) ?? 0);
  })
);

const recordingKeybindingId = ref<KeybindingId | null>(null);
const recordError = ref<string | null>(null);
let removeRecordListener: (() => void) | null = null;

function stopRecording(): void {
  removeRecordListener?.();
  removeRecordListener = null;
  recordingKeybindingId.value = null;
  recordError.value = null;
}

function startRecording(id: KeybindingId): void {
  stopRecording();
  recordingKeybindingId.value = id;
  recordError.value = null;

  const handler = (e: KeyboardEvent): void => {
    if (recordingKeybindingId.value !== id) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      stopRecording();
      return;
    }
    const shortcut = physicalShortcutFromKeyboardEvent(e);
    if (!shortcut) return;
    const mergedOverrides = { ...keybindings.overrides, [id]: { shortcut } };
    const tentative = mergeKeybindingOverrides(KEYBINDING_DEFINITIONS, mergedOverrides);
    const conflict = conflictingBindingId(tentative, id, shortcut);
    if (conflict) {
      const label = findDefinitionIn(tentative, conflict)?.label ?? conflict;
      recordError.value = `Already used by “${label}”.`;
      return;
    }
    keybindings.setOverride(id, shortcut);
    stopRecording();
  };

  window.addEventListener("keydown", handler, true);
  removeRecordListener = () => {
    window.removeEventListener("keydown", handler, true);
    removeRecordListener = null;
  };
}

const { agentPageComposerVisible } = useAgentPageComposerVisible();
const { terminalNotificationsEnabled, terminalActivitySensitivity } = useTerminalSoundSettings();

function restoreTerminalDefaults(): void {
  terminalNotificationsEnabled.value = true;
  terminalActivitySensitivity.value = DEFAULT_TERMINAL_ACTIVITY_SENSITIVITY;
}

let removeEscapeListener: (() => void) | null = null;

function bindEscapeHandler(): void {
  removeEscapeListener?.();
  const handler = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      if (recordingKeybindingId.value) {
        e.preventDefault();
        e.stopPropagation();
        stopRecording();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      goBack();
    }
  };
  document.addEventListener("keydown", handler, true);
  removeEscapeListener = () => document.removeEventListener("keydown", handler, true);
}

function hydrateFromStores(): void {
  draft.value = { ...agentCmd.commands.value };
  draftSkillRoots.value = { ...agentRoots.skillRoots.value };
  syncFromStorage();
  stopRecording();
}

let lastRouteWasSettings = false;

watch(
  () => route.name,
  async (name) => {
    const inSettings = typeof name === "string" && SETTINGS_ROUTE_NAMES.has(name);
    if (!inSettings) {
      removeEscapeListener?.();
      removeEscapeListener = null;
      stopRecording();
      lastRouteWasSettings = false;
      return;
    }
    if (!lastRouteWasSettings) {
      hydrateFromStores();
      lastRouteWasSettings = true;
    } else {
      stopRecording();
    }
    bindEscapeHandler();
    await nextTick();
    panelRef.value?.focus();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  removeEscapeListener?.();
  stopRecording();
});

function goBack(): void {
  const remembered = takeSettingsExitFullPath();
  if (remembered) {
    void router.push(remembered);
    return;
  }
  const pid = route.params.projectId as string | undefined;
  const branch = route.params.branch as string | undefined;
  if (!pid || !branch) {
    void router.push({ name: "welcome" });
    return;
  }
  const stored = loadStoredWorkspaceRoute(pid);
  if (stored && storedRouteTargetsProject(stored, pid)) {
    void router.push(storedRouteToLocation(stored));
    return;
  }
  void router.push({ name: "threadNew", params: { projectId: pid, branch } });
}

function resetDraftToDefaults(): void {
  draft.value = { ...THREAD_AGENT_BOOTSTRAP_COMMAND };
  draftSkillRoots.value = { ...THREAD_AGENT_SKILL_ROOT_DEFAULT };
}

function restoreDefaultsForActiveSection(): void {
  switch (route.name) {
    case "settingsAgents":
      resetDraftToDefaults();
      agentPageComposerVisible.value = true;
      break;
    case "settingsKeyboard":
      keybindings.resetAll();
      break;
    case "settingsTerminal":
      restoreTerminalDefaults();
      break;
    default:
      break;
  }
}

function save(): void {
  agentCmd.applySaved({ ...draft.value });
  agentRoots.applySaved({ ...draftSkillRoots.value });
  goBack();
}

function navToSettingsSection(routeName: (typeof settingsNavItems)[number]["routeName"]): void {
  void router.push({
    name: routeName,
    params: { projectId: route.params.projectId, branch: route.params.branch }
  });
}

provide(settingsLayoutContextKey, {
  draft,
  draftSkillRoots,
  preferredAgent,
  setPreferredAgent,
  agentPageComposerVisible,
  terminalNotificationsEnabled,
  keyboardBindingsRows,
  recordingKeybindingId,
  recordError,
  startRecording,
  keybindings
});
</script>

<template>
  <SidebarProvider
    class="flex h-svh min-h-0 min-w-0 w-full flex-col bg-sidebar text-card-foreground"
    :keyboard-shortcut="false"
    :persist-cookie="false"
    :default-open="true"
  >
    <div
      ref="panelRef"
      tabindex="-1"
      class="flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden outline-none"
      aria-labelledby="workspace-settings-page-title"
    >
      <Sidebar
        collapsible="none"
        layout="nested"
        side="left"
        class="h-full min-h-0 shrink-0 bg-sidebar"
        :style="{ '--sidebar-width': '15.5rem' }"
        aria-label="Settings categories"
      >
        <SidebarHeader class="pt-2.5 pe-0 flex gap-1 font-bold text-sm" :class="!isFullscreen ? 'ps-22' : 'ps-4'">
          <div class="flex items-center gap-2">
            <Settings2 class="size-4 shrink-0" aria-hidden="true" />
            <span class="truncate">Settings</span>
          </div>          
        </SidebarHeader>
        <SidebarContent class="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
          <SidebarGroup>            
            <SidebarGroupContent>
              <SidebarMenu role="tablist" class="gap-0.5">
                <SidebarMenuItem v-for="item in settingsNavItems" :key="item.routeName">
                  <SidebarMenuButton
                    type="button"
                    role="tab"
                    :title="item.description"
                    :is-active="route.name === item.routeName"
                    :aria-selected="route.name === item.routeName"
                    :tabindex="route.name === item.routeName ? 0 : -1"
                    :aria-controls="
                      item.routeName === 'settingsAgents'
                        ? settingsPanelAgentsId
                        : item.routeName === 'settingsTerminal'
                          ? settingsPanelTerminalId
                          : settingsPanelKeyboardId
                    "
                    @click="navToSettingsSection(item.routeName)"
                  >
                    <component
                      :is="item.icon"
                      class="size-[18px] shrink-0 opacity-90"
                      :stroke-width="1.75"
                      aria-hidden="true"
                    />
                    <span class="truncate text-sm font-medium">{{ item.label }}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <Button type="button" variant="ghost" size="lg" class="w-full justify-start" @click="goBack">
            <ChevronLeft class="size-4 shrink-0" aria-hidden="true" />
            Back
          </Button>
        </SidebarFooter>
      </Sidebar>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col p-1">
        <div
          class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm"
        >
          <header class="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-2">
            <h1
              id="workspace-settings-page-title"
              class="flex min-w-0 items-center gap-2 text-sm font-bold tracking-tight text-foreground"
            >
              <component
                v-if="activeSettingsNavItem"
                :is="activeSettingsNavItem.icon"
                class="size-[18px] shrink-0 opacity-90"
                :stroke-width="1.75"
                aria-hidden="true"
              />
              <span class="truncate">{{ sectionKicker }}</span>
            </h1>
            <div class="flex shrink-0 gap-2">
              <Button type="button" variant="outline" class="shrink-0" @click="restoreDefaultsForActiveSection">
                Restore defaults
              </Button>
              <Button type="button" @click="save">Save</Button>
            </div>
          </header>
          <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <RouterView />
          </div>
        </div>
      </div>
    </div>
  </SidebarProvider>
</template>
