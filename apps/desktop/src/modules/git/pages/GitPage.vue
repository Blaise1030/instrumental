<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PillTabs from "@/components/ui/PillTabs.vue";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import type { PillTabItem } from "@/components/ui/PillTabs.vue";

const route = useRoute();
const router = useRouter();
const { activeWorktree } = useActiveWorkspace();

const tabs: PillTabItem[] = [
  { value: "local", label: "Local" },
  { value: "prs", label: "Pull Requests" },
];

const TAB_ROUTES: Record<string, string> = { prs: "gitPullRequests", local: "gitPanel" };

const activeTab = computed({
  get: () => (route.meta.gitTab as string) ?? "local",
  set: (v: string) => {
    const projectId = route.params.projectId as string;
    const branch = route.params.branch as string;
    const threadId = route.params.threadId as string;
    void router.push({ name: TAB_ROUTES[v] ?? "gitPanel", params: { projectId, branch, threadId } });
  },
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <PillTabs v-model="activeTab" class="py-1" :tabs="tabs" aria-label="Git view" />
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <router-view
        v-if="activeWorktree"
        v-slot="{ Component }"
      >
        <component
          :is="Component"
          :context-label="activeWorktree.branch"
          :cwd="activeWorktree.path"
        />
      </router-view>
      <div
        v-else
        class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        No active worktree.
      </div>
    </div>
  </div>
</template>
