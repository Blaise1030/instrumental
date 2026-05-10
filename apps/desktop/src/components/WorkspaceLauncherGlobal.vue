<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import WorkspaceLauncherModal from "@/components/WorkspaceLauncherModal.vue";
import { useNavigateToProject } from "@/hooks/useNavigateToProject";
import { rememberRouteBeforeSettings } from "@/modules/settings/settingsExitRoute";
import { encodeBranch } from "@/router/branchParam";
import type { LauncherCommandId } from "@/utils/workspaceLauncherSearch";
import { useAddProjectFromDirectoryPick } from "@/hooks/useAddProjectFromDirectoryPick";
import { useWorkspaceShellUiStore } from "@/stores/workspaceShellUiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

const shellUi = useWorkspaceShellUiStore();
const { workspaceLauncherOpen } = storeToRefs(shellUi);
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const workspace = useWorkspaceStore();
const { activeThreadId } = useActiveWorkspace();
const { navigateToProject: navigateToProjectCore } = useNavigateToProject();

const { pickAndAddProject } = useAddProjectFromDirectoryPick({
  navigateToProject: (id) => navigateToProjectCore(id)
});

const projectId = computed(() => route.params.projectId as string);
const branchId = computed(() => route.params.branch as string);

async function navigateToProject(targetProjectId: string): Promise<void> {
  const changed = await navigateToProjectCore(targetProjectId);
  if (!changed) return;
  void queryClient.invalidateQueries({ queryKey: ["worktrees"] });
  void queryClient.invalidateQueries({ queryKey: ["projectPath"] });
  void queryClient.invalidateQueries({ queryKey: ["projectTabs"] });
}

function openSettings(): void {
  const pid = projectId.value;
  const branch = branchId.value;
  if (!pid || !branch) return;
  rememberRouteBeforeSettings(route);
  void router.push({
    name: "settingsAgents",
    params: { projectId: pid, branch }
  });
}

function onLauncherPickThread(threadId: string): void {
  const pid = projectId.value;
  const branch = branchId.value;
  if (!pid || !branch || !threadId) return;
  void router.push({
    name: "agent",
    params: { projectId: pid, branch, threadId }
  });
}

function onLauncherPickFile(payload: { relativePath: string; worktreeId: string | null }): void {
  const pid = projectId.value;
  const branch = branchId.value;
  const tid = activeThreadId.value;
  if (!pid || !branch || !tid || !payload.relativePath) return;
  void router.push({
    name: "fileDetail",
    params: { projectId: pid, branch, threadId: tid, filename: payload.relativePath }
  });
}

async function onLauncherPickProject(targetProjectId: string): Promise<void> {
  await navigateToProject(targetProjectId);
}

function onLauncherPickWorktree(worktreeId: string): void {
  const pid = projectId.value;
  if (!pid || !worktreeId) return;
  const matched = workspace.threads.find(
    (t) => t.projectId === pid && t.worktreePath === worktreeId
  );
  if (!matched?.createdBranch) return;
  void router.push({
    name: "agent",
    params: {
      projectId: pid,
      branch: encodeBranch(matched.createdBranch),
      threadId: matched.id
    }
  });
}

function onLauncherPickCommand(id: LauncherCommandId): void {
  if (id === "new-thread") {
    const pid = projectId.value;
    const branch = branchId.value;
    if (!pid || !branch) return;
    void router.push({
      name: "threadNew",
      params: { projectId: pid, branch }
    });
    return;
  }
  if (id === "add-project") {
    void pickAndAddProject();
    return;
  }
  if (id === "open-settings") openSettings();
}

let unlistenOpenWorkspaceSettings: (() => void) | undefined;

onMounted(() => {
  unlistenOpenWorkspaceSettings = window.workspaceApi?.onOpenWorkspaceSettings?.(() => {
    openSettings();
  });
});

onBeforeUnmount(() => {
  unlistenOpenWorkspaceSettings?.();
});
</script>

<template>
  <WorkspaceLauncherModal
    v-model="workspaceLauncherOpen"
    @pick-thread="onLauncherPickThread"
    @pick-file="onLauncherPickFile"
    @pick-project="(id) => void onLauncherPickProject(id)"
    @pick-worktree="onLauncherPickWorktree"
    @pick-command="onLauncherPickCommand"
  />
</template>
