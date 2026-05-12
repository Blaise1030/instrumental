<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSymphonyTasks } from "../hooks/useSymphonyTasks";
import KanbanBoard from "../components/KanbanBoard.vue";
import TaskSheet from "../components/TaskSheet.vue";
import SymphonyEmptyState from "../components/SymphonyEmptyState.vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const route = useRoute();
const router = useRouter();

const projectId = computed(() => route.params.projectId as string);
const branch = computed(() => route.params.branch as string);
const taskId = computed(() => route.params.taskId as string | undefined);

const { snapshot, isLoading } = useSymphonyTasks(projectId);

const selectedTask = computed(() =>
  taskId.value ? (snapshot.value?.tasks.find((t) => t.issueId === taskId.value) ?? null) : null,
);
const sheetOpen = computed(() => Boolean(taskId.value));

const templateDialogOpen = ref(false);

const WORKFLOW_TEMPLATE = `---
symphony:
  enabled: true
  tracker: linear        # or: github
  project: MY-PROJECT   # Linear project key or GitHub owner/repo
  columns:
    - id: todo
      name: "To Do"
      active_states: [Todo]
    - id: in-progress
      name: "In Progress"
      active_states: [InProgress]
    - id: done
      name: "Done"
      active_states: [Done, Cancelled]
  prompt: |
    You are a senior software engineer. Implement the following issue:

    Title: {{title}}

    {{description}}

    Attempt: {{attempt}} of {{maxAttempts}}
---
`.trim();

function onSelectTask(task: { issueId: string }): void {
  void router.push({
    name: "symphonyTask",
    params: { projectId: projectId.value, branch: branch.value, taskId: task.issueId },
  });
}

function onCloseSheet(): void {
  void router.push({
    name: "symphony",
    params: { projectId: projectId.value, branch: branch.value },
  });
}

function onViewTemplate(): void {
  templateDialogOpen.value = true;
}

function onOpenEditor(): void {
  void router.push({
    name: "fileDetail",
    params: { projectId: projectId.value, branch: branch.value, filename: "WORKFLOW.md" },
  });
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
        @view-template="onViewTemplate"
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

    <Dialog v-model:open="templateDialogOpen">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>WORKFLOW.md template</DialogTitle>
        </DialogHeader>
        <p class="text-xs text-muted-foreground mb-2">
          Copy this into <code class="font-mono bg-muted px-1 rounded">WORKFLOW.md</code> at your repo root, then click "Open in editor" to customise it.
        </p>
        <pre class="overflow-auto rounded-md bg-muted p-4 text-xs font-mono whitespace-pre leading-relaxed max-h-96">{{ WORKFLOW_TEMPLATE }}</pre>
      </DialogContent>
    </Dialog>
  </div>
</template>
