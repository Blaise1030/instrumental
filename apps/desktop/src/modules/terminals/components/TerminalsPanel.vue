<script setup lang="ts">
import { computed, watch } from "vue";
import { ChevronDown, Plus } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import PillTabs, { type PillTabItem } from "@/components/ui/PillTabs.vue";
import TerminalPane from "@/modules/agent/components/TerminalPane.vue";
import { useTerminalTabs } from "@/modules/terminals/hooks/useTerminalTabs";

const props = defineProps<{
  worktreeId: string;
  cwd: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const worktreeIdRef = computed(() => props.worktreeId || null);
const { tabs, activeTab, createTab, deleteTab, setActiveTab } = useTerminalTabs(worktreeIdRef);

// Auto-create first tab when none exist for this worktree
watch(
  [tabs, worktreeIdRef],
  ([currentTabs, wid]) => {
    if (wid && currentTabs && currentTabs.length === 0) {
      void createTab();
    }
  },
  { immediate: true },
);

const pillTabItems = computed<PillTabItem[]>(() =>
  (tabs.value ?? []).map((t) => ({
    value: t.id,
    label: t.label,
    closable: true,
  })),
);

const activeTabId = computed({
  get: () => activeTab.value?.id ?? "",
  set: (id: string) => {
    if (id) void setActiveTab(id);
  },
});

async function onCloseTab(id: string): Promise<void> {
  await deleteTab(id);
  const remaining = (tabs.value ?? []).filter((t) => t.id !== id);
  if (remaining.length === 0) emit("close");
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      class="flex h-8 shrink-0 items-center gap-1 px-1"
    >
      <div class="min-w-0 flex-1">
        <PillTabs
          v-model="activeTabId"
          size="xs"
          aria-label="Terminal tabs"
          :tabs="pillTabItems"
          @tab-close="onCloseTab"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="New terminal"
        @click="void createTab()"
      >
        <Plus class="size-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Collapse terminal panel"
        title="Collapse terminal panel"
        @click="emit('close')"
      >
        <ChevronDown class="size-3.5" stroke-width="2" aria-hidden="true" />
      </Button>
    </div>
    <div class="relative min-h-0 flex-1 overflow-hidden bg-muted">
      <template v-if="(tabs ?? []).length > 0">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          v-show="tab.id === activeTab?.id"
          class="absolute inset-0"
        >
          <TerminalPane
            :session-id="tab.sessionId"
            :worktree-id="worktreeId"
            :cwd="cwd"
            :aria-label="tab.label"
          />
        </div>
      </template>
      <div
        v-else
        class="flex h-full items-center justify-center text-xs text-muted-foreground"
      >
        Starting terminal…
      </div>
    </div>
  </div>
</template>
