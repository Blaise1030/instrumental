<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { useSymphonyTasks } from "../hooks/useSymphonyTasks";
import { useSymphonyConfig } from "../hooks/useSymphonyConfig";
import KanbanBoard from "../components/KanbanBoard.vue";
import TaskSheet from "../components/TaskSheet.vue";
import SymphonyEmptyState from "../components/SymphonyEmptyState.vue";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Label from "@/components/ui/label/Label.vue";
import PillTabs from "@/components/ui/PillTabs.vue";
import { Settings2 } from "lucide-vue-next";
import { CursorLoading } from "@/components/ui/cursor-loading";

const route = useRoute();
const router = useRouter();

const projectId = computed(() => route.params.projectId as string);
const branch = computed(() => route.params.branch as string);
const taskId = computed(() => route.params.taskId as string | undefined);
const taskTab = computed(() => (route.params.tab as string | undefined) ?? "agent");

const symphonyAvailable = computed(() => typeof window !== "undefined" && Boolean(window.symphonyApi));
const { snapshot, isLoading, secondsUntilRefetch } = useSymphonyTasks(projectId);
const { config, saveConfig } = useSymphonyConfig(projectId);

const selectedTask = computed(() =>
  taskId.value ? (snapshot.value?.tasks.find((t) => t.issueId === taskId.value) ?? null) : null,
);
const sheetOpen = computed(() => Boolean(taskId.value));

const templateDialogOpen = ref(false);
const settingsOpen = ref(false);
const settingsTab = ref<"apikey" | "workflow">("apikey");
const draftApiKey = ref("");
const draftTrackerKind = ref<"linear" | "github">("linear");

const settingsTabs = [
  { value: "apikey", label: "API Key" },
  { value: "workflow", label: "Workflow" },
] as const;

const workflowTabActive = computed(
  () => settingsOpen.value && settingsTab.value === "workflow" && Boolean(projectId.value && window.symphonyApi),
);
const { data: workflowContent, isLoading: workflowLoading } = useQuery({
  queryKey: ["symphony", "workflowRaw", projectId],
  queryFn: () => window.symphonyApi!.getWorkflowRaw({ projectId: projectId.value }),
  enabled: workflowTabActive,
  staleTime: 30_000,
});

function openSettings(): void {
  draftApiKey.value = "";
  draftTrackerKind.value = config.value?.trackerKind ?? "linear";
  settingsTab.value = "apikey";
  settingsOpen.value = true;
}

function saveSettings(): void {
  saveConfig({
    projectId: projectId.value,
    trackerKind: draftTrackerKind.value,
    apiKey: draftApiKey.value,
    projectSlug: "",
  });
  settingsOpen.value = false;
}

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
    name: "symphonyTaskTab",
    params: { projectId: projectId.value, branch: branch.value, taskId: task.issueId, tab: "agent" },
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
  <div class="relative flex w-full flex-col h-full overflow-hidden">

    <!-- Coming soon -->
    <div class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p class="text-2xl">🎵</p>
      <p class="text-sm font-medium">Symphony is coming soon</p>
      <p class="max-w-xs text-xs text-muted-foreground">
        Autonomous issue tracking and AI-driven kanban workflows are on the way.
      </p>
    </div>

    <template v-if="false">
    <!-- Floating controls top-right -->
    <div v-if="symphonyAvailable" class="absolute top-2 right-3 z-10 flex items-center gap-1.5">
      <span
        v-if="secondsUntilRefetch !== null"
        class="text-xs tabular-nums text-muted-foreground"
        title="Next poll in"
      >{{ secondsUntilRefetch }}s</span>
      <Button type="button" variant="ghost" size="icon-sm" title="Symphony settings" @click="openSettings">
        <Settings2 class="size-3.5" />
      </Button>
    </div>

    <!-- Coming soon — symphonyApi not available in this build -->
    <div v-if="!symphonyAvailable" class="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <p class="text-2xl">🎵</p>
      <p class="text-sm font-medium">Symphony is coming soon</p>
      <p class="max-w-xs text-xs text-muted-foreground">
        Autonomous issue tracking and AI-driven kanban workflows are on the way.
      </p>
    </div>

    <div v-else-if="isLoading" class="flex items-center justify-center h-full">
      <CursorLoading />
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
      :project-id="projectId"
      :branch="branch"
      :task-id="taskId ?? ''"
      :active-tab="taskTab"
      @close="onCloseSheet"
    />

    <!-- Template sheet -->
    <Sheet v-model:open="templateDialogOpen">
      <SheetContent side="right" floating class="md:max-w-2xl w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>WORKFLOW.md template</SheetTitle>
          <SheetDescription>
            Copy this into <code class="font-mono bg-muted px-1 rounded">WORKFLOW.md</code> at your repo root, then click "Open in editor" to customise it.
          </SheetDescription>
        </SheetHeader>
        <div class="px-4">
          <pre class="overflow-auto rounded-md bg-muted p-4 text-xs font-mono whitespace-pre leading-relaxed flex-1">{{ WORKFLOW_TEMPLATE }}</pre>
        </div>
      </SheetContent>
    </Sheet>

    <!-- Settings sheet -->
    <Sheet v-model:open="settingsOpen">
      <SheetContent side="right" floating class="flex w-full max-w-sm flex-col gap-0 overflow-hidden p-0">
        <SheetHeader class="shrink-0 border-b px-4 py-3 text-left">
          <SheetTitle class="text-base">Symphony settings</SheetTitle>
          <SheetDescription class="text-sm text-muted-foreground">
            API keys are stored locally and never committed to the repo.
          </SheetDescription>
          <PillTabs
            :model-value="settingsTab"
            :tabs="settingsTabs"
            size="sm"
            class="mt-1"
            @update:model-value="settingsTab = $event as 'apikey' | 'workflow'"
          />
        </SheetHeader>

        <!-- API Key tab -->
        <div v-if="settingsTab === 'apikey'" class="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div class="space-y-1.5">
            <Label class="text-xs">Tracker</Label>
            <PillTabs
              :model-value="draftTrackerKind"
              :tabs="[{ value: 'linear', label: 'Linear' }, { value: 'github', label: 'GitHub' }]"
              size="sm"
              variant="segmented"
              @update:model-value="draftTrackerKind = $event as 'linear' | 'github'"
            />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs">
              {{ draftTrackerKind === 'linear' ? 'Linear API key' : 'GitHub personal access token' }}
            </Label>
            <Input
              v-model="draftApiKey"
              type="password"
              class="h-8 font-mono text-xs"
              :placeholder="draftTrackerKind === 'linear' ? 'lin_api_…' : 'ghp_…'"
              autocomplete="off"
              spellcheck="false"
            />
            <p v-if="config?.hasApiKey" class="text-xs text-muted-foreground">
              A key is already saved. Enter a new one to replace it.
            </p>
          </div>
        </div>

        <!-- Workflow tab -->
        <div v-else class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 py-4">
          <p class="text-xs text-muted-foreground">
            Contents of <code class="font-mono bg-muted px-1 rounded">WORKFLOW.md</code> at the repo root.
          </p>
          <Textarea
            v-if="!workflowLoading && workflowContent != null"
            :model-value="workflowContent ?? ''"
            class="min-h-0 flex-1 resize-none font-mono text-[11px] leading-snug"
            spellcheck="false"
            readonly
          />
          <div v-else class="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            <CursorLoading v-if="workflowLoading" />
            <span v-else>No WORKFLOW.md found at repo root.</span>
          </div>
          <Button type="button" variant="outline" size="sm" class="w-full" @click="onOpenEditor">
            Open in editor
          </Button>
        </div>

        <SheetFooter v-if="settingsTab === 'apikey'" class="shrink-0 flex-row gap-2 border-t px-4 py-3 sm:justify-end">
          <Button type="button" variant="outline" size="sm" @click="settingsOpen = false">Cancel</Button>
          <Button type="button" size="sm" :disabled="!draftApiKey.trim()" @click="saveSettings">Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    </template><!-- end v-if="false" -->
  </div>
</template>
