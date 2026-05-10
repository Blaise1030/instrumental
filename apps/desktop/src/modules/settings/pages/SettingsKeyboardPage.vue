<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { formatBindingDisplay } from "@/keybindings/registry";
import { useSettingsLayoutContext } from "@/modules/settings/settingsLayoutContext";

const {
  keyboardBindingsRows,
  recordingKeybindingId,
  recordError,
  startRecording,
  keybindings
} = useSettingsLayoutContext();
</script>

<template>
  <div
    id="workspace-settings-panel-keyboard"
    role="tabpanel"
    tabindex="0"
    aria-label="Keyboard settings"
  >
    <p class="text-sm leading-relaxed text-muted-foreground">
      With the workspace focused, most navigation shortcuts are skipped when you are typing in the integrated terminal,
      search, agent fields, or the editor—click a shortcut cell to record a new chord, or Reset row to restore one
      binding.
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
                    recordingKeybindingId === row.id ? 'ring-2 ring-ring ring-offset-2 ring-offset-card' : ''
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
</template>
