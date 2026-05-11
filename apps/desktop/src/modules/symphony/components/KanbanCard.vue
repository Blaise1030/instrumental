<script setup lang="ts">
import { computed } from "vue";
import type { SymphonyTask } from "@/shared/symphony";

const props = defineProps<{ task: SymphonyTask }>();
const emit = defineEmits<{ click: [task: SymphonyTask] }>();

const statusClass = computed(() => {
  switch (props.task.runStatus) {
    case "running":
      return "text-green-500 dark:text-green-400";
    case "failed":
      return "text-red-500";
    case "needsReview":
      return "text-orange-500";
    case "done":
      return "text-green-500";
    default:
      return "text-muted-foreground";
  }
});

const elapsedLabel = computed(() => {
  if (!props.task.startedAt || props.task.runStatus !== "running") return null;
  const ms = Date.now() - props.task.startedAt;
  const mins = Math.floor(ms / 60_000);
  return `${mins}m`;
});
</script>

<template>
  <div
    class="cursor-pointer rounded-md border bg-card p-3 shadow-sm hover:shadow-md transition-shadow space-y-1.5"
    @click="emit('click', task)"
  >
    <div class="flex items-center justify-between">
      <span class="text-xs font-mono text-muted-foreground">{{ task.issueIdentifier }}</span>
      <span v-if="task.runStatus === 'running'" class="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
    </div>
    <p class="text-sm font-medium leading-tight line-clamp-2">{{ task.issueTitle }}</p>
    <div class="flex items-center gap-2 text-xs" :class="statusClass">
      <span v-if="elapsedLabel">● {{ elapsedLabel }}</span>
      <a
        v-else-if="task.prUrl"
        :href="task.prUrl"
        target="_blank"
        rel="noopener"
        class="underline"
        @click.stop
      >View PR ↗</a>
      <button
        v-else-if="task.runStatus === 'failed'"
        class="underline"
        @click.stop="emit('click', task)"
      >Retry</button>
    </div>
    <p v-if="task.errorHint && task.runStatus === 'failed'" class="text-xs text-destructive truncate">
      {{ task.errorHint }}
    </p>
  </div>
</template>
