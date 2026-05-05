<script setup lang="ts">
import { computed, ref } from "vue";
import SourceControlPanel from "@/components/SourceControlPanel.vue";
import RemotePrPanel from "./RemotePrPanel.vue";
import PillTabs from "@/components/ui/PillTabs.vue";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import type { PillTabItem } from "@/components/ui/PillTabs.vue";
import { useVocab } from "@/composables/useVocab";

const { activeWorktree } = useActiveWorkspace();
const { t } = useVocab();

const activeTab = ref("local");

const tabs = computed<PillTabItem[]>(() => [
  { value: "local", label: "Local" },
  { value: "prs", label: t("pull_requests") },
]);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex h-9 items-center border-b border-border px-2">
      <PillTabs v-model="activeTab" :tabs="tabs" aria-label="Git view" />
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <template v-if="activeWorktree">
        <SourceControlPanel
          v-if="activeTab === 'local'"
          :context-label="activeWorktree.branch"
        />
        <RemotePrPanel
          v-else
          :cwd="activeWorktree.path"
        />
      </template>
      <div
        v-else
        class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        No active {{ t('worktree').toLowerCase() }}.
      </div>
    </div>
  </div>
</template>
