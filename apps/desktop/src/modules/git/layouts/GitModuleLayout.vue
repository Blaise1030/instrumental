<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PillTabs, { type PillTabItem } from "@/components/ui/pill-tabs";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

const { activeWorktree } = useActiveWorkspace();
const route = useRoute();
const router = useRouter();

const gitScopeTabs = computed<PillTabItem[]>(() => {
  const projectId = route.params.projectId;
  const branch = route.params.branch;
  const threadId = route.params.threadId;
  if (typeof projectId !== "string" || typeof branch !== "string" || typeof threadId !== "string") {
    return [
      { value: "local", label: "Local" },
      { value: "remote", label: "Remote PRs" }
    ];
  }
  const params = { projectId, branch, threadId };
  return [
    { value: "local", label: "Local", to: { name: "gitPanel", params } },
    { value: "remote", label: "Remote PRs", to: { name: "gitPullRequests", params } }
  ];
});

const gitScopeTab = computed(() => {
  const name = route.name as string;
  if (name === "gitPullRequests" || name === "gitPullRequest") return "remote";
  return "local";
});

function onGitScopeTab(value: string): void {
  const projectId = route.params.projectId;
  const branch = route.params.branch;
  const threadId = route.params.threadId;
  if (typeof projectId !== "string" || typeof branch !== "string" || typeof threadId !== "string") {
    return;
  }
  if (value === "remote") {
    void router.push({ name: "gitPullRequests", params: { projectId, branch, threadId } });
    return;
  }
  void router.push({ name: "gitPanel", params: { projectId, branch, threadId } });
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <header
      v-if="activeWorktree"
      class="flex py-1 w-full items-center justify-start border-border px-2"
    >
      <PillTabs
        :model-value="gitScopeTab"
        variant="default"
        size="xs"
        class="w-full shadow-none"
        :tabs="gitScopeTabs"
        aria-label="Git view"
        @update:model-value="onGitScopeTab"
      />
    </header>
    <router-view
      v-if="activeWorktree"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
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
</template>
