<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SETTINGS_AGENT_ROWS } from "@/modules/settings/settingsConstants";
import { useSettingsLayoutContext } from "@/modules/settings/settingsLayoutContext";

const {
  draft,
  draftSkillRoots,
  preferredAgent,
  setPreferredAgent,
  agentPageComposerVisible
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

    <Accordion
      type="single"
      collapsible
      class="mt-3 rounded-lg border border-border/70 bg-muted/25"
      role="group"
      aria-label="Per-agent terminal command and skills directory"
    >
      <AccordionItem v-for="row in SETTINGS_AGENT_ROWS" :key="row.agent" :value="row.agent" class="border-border/60">
        <AccordionTrigger class="px-3 py-2.5 text-sm hover:no-underline">
          <span class="flex min-w-0 items-center gap-2 font-medium text-foreground">
            <AgentIcon :agent="row.agent" :size="18" class="shrink-0 opacity-90" />
            {{ row.label }}
          </span>
        </AccordionTrigger>
        <AccordionContent class="px-3 pt-0">
          <div class="flex min-w-0 flex-col gap-2 border-t border-border/50 pb-1 pt-3">
            <input
              :id="`agent-cmd-${row.agent}`"
              v-model="draft[row.agent]"
              type="text"
              class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              autocomplete="off"
              spellcheck="false"
              :aria-label="`${row.label} bootstrap command`"
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
        </AccordionContent>
      </AccordionItem>
    </Accordion>

    <ItemGroup class="mt-4">
      <Item variant="outline" size="default" class="items-start">
        <ItemContent class="min-w-0">
          <ItemTitle class="text-sm font-medium text-foreground">Default agent for new threads</ItemTitle>
          <ItemDescription class="mt-1 max-w-xl text-xs leading-relaxed line-clamp-none">
            Pre-selected in the add-thread overlay. You can still pick another agent before starting.
          </ItemDescription>
        </ItemContent>
        <ItemActions class="w-full min-w-48 max-w-xs shrink-0 sm:w-56">
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
        </ItemActions>
      </Item>

      <Item variant="outline" size="default" class="items-start sm:items-center">
        <ItemContent class="min-w-0">
          <ItemTitle class="text-sm font-medium text-foreground">Agent page composer</ItemTitle>
          <ItemDescription class="mt-1 max-w-xl text-xs leading-relaxed line-clamp-none">
            Show the rich prompt field below the terminal on agent threads (attachments, @ files, / skills). Turn off if you
            prefer typing only in the terminal.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            id="settings-agent-page-composer"
            v-model="agentPageComposerVisible"
            aria-label="Show agent page composer"
          />
        </ItemActions>
      </Item>
    </ItemGroup>
  </div>
</template>
