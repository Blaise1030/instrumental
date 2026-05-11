<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSymphonyTasks } from "../hooks/useSymphonyTasks";
import KanbanBoard from "../components/KanbanBoard.vue";
import TaskSheet from "../components/TaskSheet.vue";
import SymphonyEmptyState from "../components/SymphonyEmptyState.vue";
import type { SymphonyTask } from "@/shared/symphony";

const route = useRoute();
const router = useRouter();
const projectId = computed(() => route.params.projectId as string);

const { snapshot, isLoading } = useSymphonyTasks(projectId);

const selectedTask = ref<SymphonyTask | null>(null);
const sheetOpen = ref(false);

function onSelectTask(task: SymphonyTask): void {
  selectedTask.value = task;
  sheetOpen.value = true;
}

function onCloseSheet(): void {
  sheetOpen.value = false;
  selectedTask.value = null;
}

function onOpenEditor(): void {
  void router.push({ name: "fileDetail", params: { ...route.params, filename: "WORKFLOW.md" } });
}
</script>

<template>
  <div class="relative flex flex-col h-full overflow-hidden">
    <div v-if="isLoading" class="flex items-center justify-center h-full text-sm text-muted-foreground">
      Loading…
    </div>

    <template v-else-if="snapshot">
      <div
        v-if="snapshot.trackerError"
        class="px-4 py-2 bg-destructive/10 text-destructive text-xs border-b"
      >
        Tracker unreachable — retrying in 60s. {{ snapshot.trackerError }}
      </div>

      <SymphonyEmptyState
        v-if="!snapshot.enabled || snapshot.columns.length === 0"
        @view-template="() => {}"
        @open-editor="onOpenEditor"
      />

      <KanbanBoard
        v-else
        :columns="snapshot.columns"
        :tasks="snapshot.tasks"
        @select-task="onSelectTask"
      />
    </template>

    <TaskSheet
      :task="selectedTask"
      :open="sheetOpen"
      @close="onCloseSheet"
    />
  </div>
</template>
