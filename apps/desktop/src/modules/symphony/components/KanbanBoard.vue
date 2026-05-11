<script setup lang="ts">
import type { KanbanColumn, SymphonyTask } from "@/shared/symphony";
import KanbanCard from "./KanbanCard.vue";

const props = defineProps<{
  columns: KanbanColumn[];
  tasks: SymphonyTask[];
}>();

const emit = defineEmits<{ "select-task": [task: SymphonyTask] }>();

function tasksForColumn(column: KanbanColumn): SymphonyTask[] {
  return props.tasks.filter((t) => t.issueState === column.state);
}
</script>

<template>
  <div class="flex gap-4 p-4 overflow-x-auto h-full">
    <div
      v-for="col in columns"
      :key="col.state"
      class="flex flex-col gap-2 min-w-[220px] w-[220px]"
    >
      <div class="flex items-center justify-between px-1">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {{ col.label }}
        </h3>
        <span class="text-xs text-muted-foreground">{{ tasksForColumn(col).length }}</span>
      </div>
      <div class="flex flex-col gap-2">
        <KanbanCard
          v-for="task in tasksForColumn(col)"
          :key="task.issueId"
          :task="task"
          @click="emit('select-task', task)"
        />
      </div>
    </div>
  </div>
</template>
