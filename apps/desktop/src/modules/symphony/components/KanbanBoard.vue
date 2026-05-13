<script setup lang="ts">
import type { KanbanColumn, SymphonyTask } from "@/shared/symphony";
import KanbanCard from "./KanbanCard.vue";

const props = defineProps<{
  columns: KanbanColumn[];
  tasks: SymphonyTask[];
}>();

const emit = defineEmits<{ "select-task": [task: SymphonyTask] }>();

function tasksForColumn(column: KanbanColumn): SymphonyTask[] {
  const states = column.activeStates ?? [column.state];
  return props.tasks.filter((t) => states.includes(t.issueState));
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
      <div class="flex flex-col gap-2 flex-1">
        <KanbanCard
          v-for="task in tasksForColumn(col)"
          :key="task.issueId"
          :task="task"
          @click="emit('select-task', task)"
        />
        <div
          v-if="tasksForColumn(col).length === 0"
          class="flex flex-1 items-center justify-center rounded-lg border border-dashed py-8"
        >
          <p class="text-xs text-muted-foreground">No issues</p>
        </div>
      </div>
    </div>
  </div>
</template>
