<script setup lang="ts">
import { computed } from "vue";
import type { SymphonyTask } from "@/shared/symphony";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import TerminalPane from "@/modules/agent/components/TerminalPane.vue";
import PillTabs from "@/components/ui/PillTabs.vue";

const props = defineProps<{
  task: SymphonyTask | null;
  open: boolean;
  projectId: string;
  branch: string;
  taskId: string;
  activeTab: string;
}>();

const emit = defineEmits<{ close: [] }>();

const { activeWorktree } = useActiveWorkspace();

const hasDiff = computed(
  () => props.task?.runStatus === "done" || props.task?.runStatus === "needsReview",
);

const statusLabel = computed(() => {
  switch (props.task?.runStatus) {
    case "running":
      return "● Running";
    case "done":
      return "✓ Done";
    case "failed":
      return "✗ Failed";
    case "needsReview":
      return "⚠ Needs Review";
    default:
      return "";
  }
});

const statusClass = computed(() => {
  switch (props.task?.runStatus) {
    case "running":
      return "text-green-500";
    case "done":
      return "text-green-500";
    case "failed":
      return "text-red-500";
    case "needsReview":
      return "text-orange-500";
    default:
      return "text-muted-foreground";
  }
});

const tabs = computed(() => [
  {
    value: "agent",
    label: "Agent",
    to: { name: "symphonyTaskTab", params: { projectId: props.projectId, branch: props.branch, taskId: props.taskId, tab: "agent" } },
  },
  {
    value: "changes",
    label: "Changes",
    to: { name: "symphonyTaskTab", params: { projectId: props.projectId, branch: props.branch, taskId: props.taskId, tab: "changes" } },
  },
  {
    value: "files",
    label: "Files",
    to: { name: "symphonyTaskTab", params: { projectId: props.projectId, branch: props.branch, taskId: props.taskId, tab: "files" } },
  },
  {
    value: "browser",
    label: "Browser",
    to: { name: "symphonyTaskTab", params: { projectId: props.projectId, branch: props.branch, taskId: props.taskId, tab: "browser" } },
  },
]);
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-200 ease-out"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-150 ease-in"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <div
      v-if="open && task"
      class="absolute right-0 top-0 h-full w-[420px] border-l bg-background shadow-xl flex flex-col z-20"
    >
      <div class="flex items-start justify-between px-4 py-3 border-b">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs text-muted-foreground">{{ task.issueIdentifier }}</span>
            <span class="text-xs" :class="statusClass">{{ statusLabel }}</span>
          </div>
          <p class="text-sm font-medium truncate mt-0.5">{{ task.issueTitle }}</p>
          <a
            v-if="task.issueUrl"
            :href="task.issueUrl"
            target="_blank"
            rel="noopener"
            class="text-xs text-muted-foreground underline"
          >{{ task.issueUrl }}</a>
        </div>
        <button
          class="ml-2 text-muted-foreground hover:text-foreground p-1 rounded"
          @click="emit('close')"
        >✕</button>
      </div>

      <div class="border-b px-3 py-2">
        <PillTabs :model-value="activeTab" :tabs="tabs" size="sm" />
      </div>

      <div class="flex-1 overflow-hidden">
        <TerminalPane
          v-if="activeTab === 'agent' && task.threadId && activeWorktree"
          class="h-full"
          :session-id="task.threadId"
          :worktree-id="activeWorktree.id"
          :cwd="activeWorktree.path"
          aria-label="Symphony task agent"
          :agent-tab="true"
        />
        <div
          v-else-if="activeTab === 'changes'"
          class="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground"
        >
          {{ hasDiff ? 'Open the Git panel for full diff review.' : 'No changes yet.' }}
        </div>
        <div
          v-else-if="activeTab === 'files'"
          class="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground"
        >
          File explorer coming soon.
        </div>
        <div
          v-else-if="activeTab === 'browser'"
          class="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground"
        >
          Browser coming soon.
        </div>
        <div v-else class="flex items-center justify-center h-full text-sm text-muted-foreground">
          No output yet.
        </div>
      </div>
    </div>
  </Transition>
</template>
