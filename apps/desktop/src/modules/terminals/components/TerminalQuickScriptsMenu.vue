<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Play, Plus, Settings2, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import Label from "@/components/ui/label/Label.vue";
import { Textarea } from "@/components/ui/textarea";
import type { TerminalQuickScript } from "@/modules/terminals/hooks/useTerminalQuickScripts";
import { useTerminalQuickScripts } from "@/modules/terminals/hooks/useTerminalQuickScripts";

const props = defineProps<{
  runCommand: (command: string) => void;
}>();

const { scripts, setScripts } = useTerminalQuickScripts();

const manageOpen = ref(false);
const draft = ref<TerminalQuickScript[]>([]);

function emptyRow(): TerminalQuickScript {
  return { id: crypto.randomUUID(), name: "", command: "" };
}

watch(manageOpen, (open) => {
  if (open) {
    draft.value =
      scripts.value.length > 0 ? scripts.value.map((s) => ({ ...s })) : [emptyRow()];
  }
});

const runnableScripts = computed(() =>
  scripts.value.filter((s) => s.command.trim().length > 0)
);

function saveManage(): void {
  const cleaned = draft.value
    .filter((s) => s.name.trim() || s.command.trim())
    .map((s) => ({
      id: s.id?.trim() || crypto.randomUUID(),
      name: (s.name.trim() || "Untitled").slice(0, 120),
      command: s.command
    }));
  setScripts(cleaned);
  manageOpen.value = false;
}

function addRow(): void {
  draft.value.push(emptyRow());
}

function removeRow(id: string): void {
  draft.value = draft.value.filter((s) => s.id !== id);
}

function runScript(command: string): void {
  props.runCommand(command);
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        class="shrink-0"
        aria-label="Run saved terminal command"
        title="Run saved command"
      >
        <Play class="size-3" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="max-h-72 min-w-48 overflow-y-auto">
      <template v-if="runnableScripts.length > 0">
        <DropdownMenuItem
          v-for="s in runnableScripts"
          :key="s.id"
          class="text-xs"
          @select="runScript(s.command)"
        >
          {{ s.name }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </template>
      <DropdownMenuItem v-else class="text-xs text-muted-foreground" disabled>
        No saved commands
      </DropdownMenuItem>
      <DropdownMenuItem class="text-xs" @select="manageOpen = true">
        <Settings2 class="mr-2 size-3.5 shrink-0 opacity-70" aria-hidden="true" />
        Manage commands…
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <Dialog :open="manageOpen" @update:open="(v) => (manageOpen = v)">
    <DialogContent
      class="flex max-h-[min(85vh,calc(100dvh-2rem))] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      aria-labelledby="terminal-scripts-dialog-title"
    >
      <DialogHeader class="shrink-0 border-b border-border px-4 py-3 text-left">
        <DialogTitle id="terminal-scripts-dialog-title" class="text-base">
          Terminal quick commands
        </DialogTitle>
        <DialogDescription class="text-left text-sm text-muted-foreground">
          Each line of a command is sent to the active terminal as if you typed it and pressed Enter. Names appear in
          the run menu.
        </DialogDescription>
      </DialogHeader>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
        <div
          v-for="row in draft"
          :key="row.id"
          class="space-y-2 rounded-md border border-border/80 bg-muted/20 p-3"
        >
          <div class="flex items-end justify-between gap-2">
            <div class="min-w-0 flex-1 space-y-1.5">
              <Label :for="`tq-name-${row.id}`" class="text-xs">Name</Label>
              <Input
                :id="`tq-name-${row.id}`"
                v-model="row.name"
                class="h-8 text-xs"
                placeholder="e.g. Tests"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              class="shrink-0 text-muted-foreground hover:text-destructive"
              :aria-label="`Remove ${row.name || 'command'}`"
              @click="removeRow(row.id)"
            >
              <Trash2 class="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          <div class="space-y-1.5">
            <Label :for="`tq-cmd-${row.id}`" class="text-xs">Command</Label>
            <Textarea
              :id="`tq-cmd-${row.id}`"
              v-model="row.command"
              class="min-h-18 resize-y font-mono text-[12px] leading-snug"
              placeholder="pnpm test"
              spellcheck="false"
            />
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" class="w-full gap-1 text-xs" @click="addRow">
          <Plus class="size-3.5" aria-hidden="true" />
          Add command
        </Button>
      </div>

      <DialogFooter class="shrink-0 gap-2 border-t border-border px-4 py-3 sm:justify-end">
        <Button type="button" variant="outline" size="sm" @click="manageOpen = false"> Cancel </Button>
        <Button type="button" size="sm" @click="saveManage"> Save </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
