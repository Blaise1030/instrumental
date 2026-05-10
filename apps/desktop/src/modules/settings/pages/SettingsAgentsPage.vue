<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { SETTINGS_AGENT_ROWS } from "@/modules/settings/settingsConstants";
import { useSettingsLayoutContext } from "@/modules/settings/settingsLayoutContext";

const {
  draft,
  draftSkillRoots,
  preferredAgent,
  setPreferredAgent
} = useSettingsLayoutContext();
</script>

<template>
  <div
    id="workspace-settings-panel-agents"
    role="tabpanel"
    tabindex="0"
    aria-label="Agents settings"
  >
    <p class="text-sm leading-relaxed text-muted-foreground">
      When you start a thread, Instrument types the command below into that thread’s terminal and sends Enter for you.
      Use the same executable name you would run in a normal shell (it must be on your
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
        v-for="row in SETTINGS_AGENT_ROWS"
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
        <label class="mt-0.5 block text-xs font-medium text-muted-foreground" :for="`agent-skill-root-${row.agent}`"
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
            <SelectItem v-for="row in SETTINGS_AGENT_ROWS" :key="row.agent" :value="row.agent">
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
</template>
