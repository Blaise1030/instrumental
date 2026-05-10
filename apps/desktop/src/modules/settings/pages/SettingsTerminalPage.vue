<script setup lang="ts">
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { SETTINGS_TERMINAL_SENSITIVITY_OPTIONS } from "@/modules/settings/settingsConstants";
import { useSettingsLayoutContext } from "@/modules/settings/settingsLayoutContext";
import type { TerminalActivitySensitivity } from "@/terminal/activitySensitivity";

const { terminalNotificationsEnabled, terminalActivitySensitivity } = useSettingsLayoutContext();
</script>

<template>
  <div
    id="workspace-settings-panel-terminal"
    role="tabpanel"
    tabindex="0"
    aria-label="Terminal settings"
  >
    <div class="divide-y divide-border/70">
      <div class="pb-6">
        <p class="text-sm leading-relaxed text-muted-foreground">
          When a thread finishes, needs approval, or fails, entries appear in the in-app notification center and the app
          may show a system notification when your OS allows it—sound and banner behavior follow system notification
          settings. Threads that may need your attention stay highlighted until you open them.
        </p>
      </div>
      <div class="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-foreground">Desktop notifications</p>
          <p class="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Show banners and play sounds when Instrument needs your attention while in the background.
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2.5">
          <Checkbox id="settings-terminal-notifications" v-model="terminalNotificationsEnabled" />
          <label class="cursor-pointer text-sm text-foreground select-none" for="settings-terminal-notifications">
            Enable
          </label>
        </div>
      </div>
      <div class="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-foreground">Activity sensitivity</p>
          <p class="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Controls when terminal output is treated as meaningful activity for attention-related behavior.
          </p>
        </div>
        <div class="w-full min-w-48 max-w-xs shrink-0 sm:w-60">
          <Select
            id="settings-terminal-sensitivity"
            :model-value="terminalActivitySensitivity"
            @update:model-value="(v) => (terminalActivitySensitivity = v as TerminalActivitySensitivity)"
          >
            <SelectTrigger class="h-9 w-full bg-background text-sm">
              <SelectValue placeholder="Choose sensitivity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="opt in SETTINGS_TERMINAL_SENSITIVITY_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >
                <span class="flex flex-col">
                  <span>{{ opt.label }}</span>
                  <span class="text-xs text-muted-foreground">{{ opt.hint }}</span>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  </div>
</template>
