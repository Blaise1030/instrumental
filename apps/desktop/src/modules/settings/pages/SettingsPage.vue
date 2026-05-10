<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { THREAD_AGENT_BOOTSTRAP_COMMAND } from "@shared/threadAgentBootstrap";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bot, ChevronLeft, Keyboard, SquareTerminal, type LucideIcon } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { THREAD_AGENT_SKILL_ROOT_DEFAULT } from "@shared/threadAgentSkillRoots";
import { usePreferredThreadAgent } from "@/modules/agent/hooks/usePreferredThreadAgent";
import { useTerminalSoundSettings } from "@/modules/agent/hooks/useTerminalSoundSettings";
import { useAgentBootstrapCommands } from "@/modules/agent/hooks/useAgentBootstrapCommands";
import { useAgentSkillRoots } from "@/modules/agent/hooks/useAgentSkillRoots";
import { DEFAULT_TERMINAL_ACTIVITY_SENSITIVITY } from "@/terminal/activitySensitivity";
import {
  conflictingBindingId,
  findDefinitionIn,
  formatBindingDisplay,
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

const route = useRoute();
const router = useRouter();

const agentCmd = useAgentBootstrapCommands();
const agentRoots = useAgentSkillRoots();

const draft = ref<Record<ThreadAgent, string>>({ ...agentCmd.commands.value });
const draftSkillRoots = ref<Record<ThreadAgent, string>>({ ...agentRoots.skillRoots.value });
const panelRef = ref<HTMLElement | null>(null);

const { preferredAgent, setPreferredAgent, syncFromStorage } = usePreferredThreadAgent();

type SettingsSection = "agents" | "terminal" | "keyboard";
const activeSection = ref<SettingsSection>("agents");

const settingsNavItems: {
  id: SettingsSection;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { id: "agents", label: "Agents", description: "CLI bootstrap lines and skill directories", icon: Bot },
  { id: "terminal", label: "Terminal", description: "Desktop notifications", icon: SquareTerminal },
  { id: "keyboard", label: "Keyboard", description: "Workspace keyboard shortcuts", icon: Keyboard }
];

const sectionKicker = computed(() => {
  switch (activeSection.value) {
    case "agents":
      return "Agents";
    case "terminal":
      return "Terminal";
    case "keyboard":
      return "Keyboard";
    default:
      return "Settings";
  }
});

const settingsPanelAgentsId = "workspace-settings-panel-agents";
const settingsPanelTerminalId = "workspace-settings-panel-terminal";
const settingsPanelKeyboardId = "workspace-settings-panel-keyboard";

const AGENT_ROWS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

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
  activeSection.value = "agents";
  stopRecording();
}

watch(
  () => route.name,
  async (name) => {
    if (name !== "workspaceSettings") {
      removeEscapeListener?.();
      removeEscapeListener = null;
      stopRecording();
      return;
    }
    hydrateFromStores();
    bindEscapeHandler();
    await nextTick();
    panelRef.value?.focus();
  },
  { immediate: true }
);

watch(activeSection, () => {
  stopRecording();
});

onBeforeUnmount(() => {
  removeEscapeListener?.();
  stopRecording();
});

function goBack(): void {
  void router.back();
}

function resetDraftToDefaults(): void {
  draft.value = { ...THREAD_AGENT_BOOTSTRAP_COMMAND };
  draftSkillRoots.value = { ...THREAD_AGENT_SKILL_ROOT_DEFAULT };
}

function restoreDefaultsForActiveSection(): void {
  if (activeSection.value === "agents") resetDraftToDefaults();
  else if (activeSection.value === "keyboard") keybindings.resetAll();
  else restoreTerminalDefaults();
}

function save(): void {
  agentCmd.applySaved({ ...draft.value });
  agentRoots.applySaved({ ...draftSkillRoots.value });
  goBack();
}
</script>

<template>
  <SidebarProvider
    class="flex h-svh min-h-0 min-w-0 w-full flex-col bg-muted/45 text-card-foreground dark:bg-muted/15"
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
        class="h-full min-h-0 shrink-0 border-r border-sidebar-border bg-sidebar"
        :style="{ '--sidebar-width': '15.5rem' }"
        aria-label="Settings categories"
      >
        <SidebarHeader>          
        </SidebarHeader>
        <SidebarContent class="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
          <SidebarGroup>
            <SidebarGroupLabel
            >
              Preferences
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu role="tablist" class="gap-0.5">
                <SidebarMenuItem v-for="item in settingsNavItems" :key="item.id">
                  <SidebarMenuButton
                    type="button"
                    role="tab"
                    :title="item.description"
                    :is-active="activeSection === item.id"
                    :aria-selected="activeSection === item.id"
                    :tabindex="activeSection === item.id ? 0 : -1"
                    :aria-controls="
                      item.id === 'agents'
                        ? settingsPanelAgentsId
                        : item.id === 'terminal'
                          ? settingsPanelTerminalId
                          : settingsPanelKeyboardId
                    "
                    @click="activeSection = item.id"
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
          <Button
            type="button"
            variant="ghost"    
            size="lg"        
            class="w-full justify-start"
            @click="goBack"
          >
            <ChevronLeft class="size-4 shrink-0" aria-hidden="true" />
            Back
          </Button>
        </SidebarFooter>
      </Sidebar>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <header class="flex shrink-0 items-center justify-between gap-4 px-8 pt-8 pb-3">          
          <Button type="button" variant="outline" size="sm" class="shrink-0" @click="restoreDefaultsForActiveSection">
            Restore defaults
          </Button>
        </header>

        <div class="flex min-h-0 flex-1 flex-col px-8 pb-8">
          <div
            class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card text-card-foreground shadow-sm dark:border-border"
          >
            <p
              class="shrink-0 border-b border-border/60 px-6 py-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
            >
              {{ sectionKicker }}
            </p>
            <div
              class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5"
              data-testid="workspace-settings-scroll-body"
            >
      <div
        v-show="activeSection === 'agents'"
        :id="settingsPanelAgentsId"
        role="tabpanel"
        tabindex="0"
        aria-label="Agents settings"
      >
        <p class="text-sm leading-relaxed text-muted-foreground">
          When you start a thread, Instrument types the command below into that thread’s terminal and sends Enter for
          you. Use the same executable name you would run in a normal shell (it must be on your
          <span class="whitespace-nowrap font-mono text-[13px] text-foreground/90">PATH</span>).
        </p>
        <p class="mt-3 text-[11px] leading-snug text-muted-foreground">
          Each <span class="font-medium text-foreground/90">Skills directory</span> is searched for packages with
          <span class="font-mono">SKILL.md</span> when you use <span class="font-mono">/</span> in the thread prompt. Use
          <span class="font-mono">~</span> or an absolute path.
        </p>

        <div
          class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
          role="group"
          aria-label="Per-agent terminal command and skills directory"
        >
          <div
            v-for="row in AGENT_ROWS"
            :key="row.agent"
            class="flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-muted/25 p-3"
          >
            <label class="flex items-center gap-2 text-sm font-medium text-foreground" :for="`agent-cmd-${row.agent}`">
              <AgentIcon :agent="row.agent" :size="18" class="shrink-0 opacity-90" />
              {{ row.label }}
            </label>
            <input
              :id="`agent-cmd-${row.agent}`"
              v-model="draft[row.agent]"
              type="text"
              class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              autocomplete="off"
              spellcheck="false"
            />
            <label
              class="mt-0.5 block text-xs font-medium text-muted-foreground"
              :for="`agent-skill-root-${row.agent}`"
              >Skills directory</label
            >
            <input
              :id="`agent-skill-root-${row.agent}`"
              v-model="draftSkillRoots[row.agent]"
              type="text"
              class="w-full min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-[13px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </div>

        <div
          class="mt-8 flex flex-col gap-3 border-t border-border/70 pt-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foreground">Default agent for new threads</p>
            <p class="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              Pre-selected in the add-thread overlay. You can still pick another agent before starting.
            </p>
          </div>
          <div class="w-full min-w-48 max-w-xs shrink-0 sm:w-56">
            <Select
              id="preferred-thread-agent"
              :model-value="preferredAgent"
              @update:model-value="(v) => setPreferredAgent(v as ThreadAgent)"
            >
              <SelectTrigger class="h-9 w-full bg-background text-sm">
                <SelectValue placeholder="Choose agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="row in AGENT_ROWS" :key="row.agent" :value="row.agent">
                  <span class="flex items-center gap-2">
                    <AgentIcon :agent="row.agent" :size="16" class="shrink-0" />
                    {{ row.label }}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div
        v-show="activeSection === 'terminal'"
        :id="settingsPanelTerminalId"
        role="tabpanel"
        tabindex="0"
        aria-label="Terminal settings"
      >
        <div class="flex flex-col gap-6">
          <p class="text-sm leading-relaxed text-muted-foreground">
            When a thread finishes, needs approval, or fails, entries appear in the in-app notification center and the app
            may show a system notification when your OS allows it—sound and banner behavior follow system notification
            settings. Threads that may need your attention stay highlighted until you open them.
          </p>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-foreground">Desktop notifications</p>
              <p class="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                Show banners and play sounds when Instrument needs your attention while in the background.
              </p>
            </div>
            <div class="flex shrink-0 justify-end sm:justify-start">
              <Switch
                id="settings-terminal-notifications"
                v-model="terminalNotificationsEnabled"
                aria-label="Desktop notifications"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        v-show="activeSection === 'keyboard'"
        :id="settingsPanelKeyboardId"
        role="tabpanel"
        tabindex="0"
        aria-label="Keyboard settings"
      >
        <p class="text-sm leading-relaxed text-muted-foreground">
          With the workspace focused, most navigation shortcuts are skipped when you are typing in the integrated
          terminal, search, agent fields, or the editor—click a shortcut cell to record a new chord, or Reset row to
          restore one binding.
        </p>
        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[20rem] border-collapse text-left text-sm">
            <thead>
              <tr class="border-b border-border text-muted-foreground">
                <th class="py-1.5 pr-3 font-medium">Action</th>
                <th class="py-1.5 font-medium">Shortcut</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in keyboardBindingsRows" :key="row.id" class="border-b border-border/60 align-top">
                <td class="py-2 pr-3 text-foreground">{{ row.label }}</td>
                <td class="py-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="max-w-full rounded border border-transparent bg-muted/50 px-1.5 py-0.5 text-left font-mono text-xs text-foreground transition-colors hover:bg-muted"
                      :class="
                        recordingKeybindingId === row.id
                          ? 'ring-2 ring-ring ring-offset-2 ring-offset-card'
                          : ''
                      "
                      @click="startRecording(row.id)"
                    >
                      {{ formatBindingDisplay(row) }}
                      <span
                        v-if="recordingKeybindingId === row.id"
                        class="ml-2 inline-block font-sans text-[11px] font-normal text-muted-foreground"
                      >
                        Press new shortcut… Esc cancels
                      </span>
                    </button>
                    <Button
                      v-if="keybindings.overrides[row.id]"
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="h-7 px-2 text-xs"
                      @click="keybindings.clearOverride(row.id)"
                    >
                      Reset row
                    </Button>
                  </div>
                  <p v-if="recordingKeybindingId === row.id && recordError" class="mt-1 max-w-sm text-xs text-destructive">
                    {{ recordError }}
                  </p>
                  <p v-if="row.notes" class="mt-1 max-w-sm text-xs text-muted-foreground">
                    {{ row.notes }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
            </div>
            <footer class="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-card px-6 py-4">
              <Button type="button" variant="outline" size="sm" @click="goBack">Cancel</Button>
              <Button type="button" size="sm" @click="save">Save</Button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  </SidebarProvider>
</template>
