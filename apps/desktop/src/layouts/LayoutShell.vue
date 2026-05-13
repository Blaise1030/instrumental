<script setup lang="ts">
import { computed, provide } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { useIsFullscreen } from "@/hooks/useIsFullscreen";
import { useAppContext } from "@/app-context/useAppContext";
import { useAddProjectFromDirectoryPick } from "@/hooks/useAddProjectFromDirectoryPick";
import { useNavigateToProject } from "@/hooks/useNavigateToProject";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useToast } from "@/hooks/useToast";
import { useWorkspaceShellUiStore } from "@/stores/workspaceShellUiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useThreadPtyRunStatus } from "@/hooks/useThreadPtyRunStatus";
import { rememberRouteBeforeSettings } from "@/modules/settings/settingsExitRoute";
import { resolveThreadScopedWorkspaceParams } from "@/router/workspaceNavParams";
import { useSymphonyConfig } from "@/modules/symphony/hooks/useSymphonyConfig";
import { useSymphonyTasks } from "@/modules/symphony/hooks/useSymphonyTasks";
import { ButtonGroup } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import PillTabs from "@/components/ui/pill-tabs";
import {
  SidebarProvider,
} from "@/components/ui/sidebar";
import SidebarTrigger from "@/components/ui/sidebar/SidebarTrigger.vue";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import ThemeToggle from "@/components/ThemeToggle.vue";
import type { Project } from "@/shared/domain";
import { ChevronLeft, ChevronRight, PlusIcon, Settings } from "lucide-vue-next";
import {
  runStatusByThreadIdKey,
  idleAttentionByThreadIdKey,
  clearIdleAttentionKey,
} from "./layoutInjectionKeys";

const appContext = useAppContext();
const workspace = useWorkspaceStore();
const { isFullscreen } = useIsFullscreen();
const toast = useToast();
const queryClient = useQueryClient();
const route = useRoute();
const router = useRouter();
const shellUi = useWorkspaceShellUiStore();
const { sidebarOpen } = storeToRefs(shellUi);

const projectId = computed(() => route.params.projectId as string);
const branchId = computed(() => route.params.branch as string);

// Symphony view toggle
useSymphonyConfig(projectId);
useSymphonyTasks(projectId);
const symphonyEnabled = computed(
  () => Boolean(projectId.value && typeof window !== "undefined" && window.symphonyApi),
);
const isSymphonyRoute = computed(
  () => route.name === "symphony" || route.name === "symphonyTask",
);
const symphonyView = computed(() => (isSymphonyRoute.value ? "kanban" : "chat"));

const workspaceNavParams = computed(() => resolveThreadScopedWorkspaceParams(route));
const branchOnlyParams = computed(() => {
  const pid = route.params.projectId as string;
  const branch = route.params.branch as string;
  if (!pid || !branch) return null;
  return { projectId: pid, branch };
});

function onViewToggle(value: string): void {
  if (value === "kanban") {
    const bp = branchOnlyParams.value;
    if (bp) void router.push({ name: "symphony", params: bp });
  } else {
    const p = workspaceNavParams.value;
    if (p) void router.push({ name: "agent", params: p });
    else {
      const bp = branchOnlyParams.value;
      if (bp) void router.push({ name: "threadNew", params: bp });
    }
  }
}

// Thread run status — provided to child layouts (Layout.vue) via inject
const { activeThreadId } = useActiveWorkspace();
const allWorkspaceThreads = computed(() => workspace.threads);
const { runStatusByThreadId, idleAttentionByThreadId, clearIdleAttention } =
  useThreadPtyRunStatus(allWorkspaceThreads, {
    activeThreadId,
    workspaceService: computed(() => appContext.value?.workspaceService),
  });

provide(runStatusByThreadIdKey, runStatusByThreadId);
provide(idleAttentionByThreadIdKey, idleAttentionByThreadId);
provide(clearIdleAttentionKey, clearIdleAttention);

const projectIdsWithIdleAttention = computed(() => {
  const idle = idleAttentionByThreadId.value;
  const ids = new Set<string>();
  for (const t of workspace.threads) {
    if (idle[t.id]) ids.add(t.projectId);
  }
  return ids;
});

// Project tabs
const { data: projectTabs } = useQuery({
  queryKey: ["projectTabs", appContext],
  enabled: !!appContext.value.gitService,
  queryFn: async () => {
    const res = (await window.workspaceApi?.getSnapshot()) as { projects: Project[] };
    return res.projects;
  },
});

const { navigateToProject: navigateToProjectCore } = useNavigateToProject();

async function navigateToProject(targetProjectId: string): Promise<void> {
  const changed = await navigateToProjectCore(targetProjectId);
  if (!changed) return;
  void queryClient.invalidateQueries({ queryKey: ["worktrees"] });
  void queryClient.invalidateQueries({ queryKey: ["projectPath"] });
  void queryClient.invalidateQueries({ queryKey: ["projectTabs"] });
}

const canAddProject = computed(() => {
  if (typeof window === "undefined") return false;
  return Boolean(appContext.value.gitService && window.workspaceApi?.pickRepoDirectory);
});

const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });

async function requestDeleteProject(project: Project): Promise<void> {
  const ok = window.confirm(
    `Remove "${project.name}" from the workspace? This cannot be undone.`,
  );
  if (!ok) return;
  const api = window.workspaceApi;
  if (!api?.removeProject) {
    toast.error("Cannot remove project", "Remove project is not available in this build.");
    return;
  }
  const deletingCurrent = project.id === projectId.value;
  let nextActiveProjectId: string | null = null;
  try {
    await api.removeProject({ projectId: project.id });
    const ws = appContext.value.workspaceService;
    if (ws) {
      const fresh = await ws.getSnapshot();
      workspace.hydrate(fresh);
      nextActiveProjectId = fresh.activeProjectId;
    }
    void queryClient.invalidateQueries({ queryKey: ["projectTabs"] });
    void queryClient.invalidateQueries({ queryKey: ["projectPath"] });
    void queryClient.invalidateQueries({ queryKey: ["worktrees", appContext] });
    if (deletingCurrent) {
      if (nextActiveProjectId) {
        await navigateToProject(nextActiveProjectId);
      } else {
        void router.push({ name: "welcome" });
      }
    }
  } catch (e) {
    toast.error(
      "Could not remove project",
      e instanceof Error ? e.message : "Unknown error",
    );
  }
}

function openSettings(): void {
  const pid = projectId.value;
  const branch = branchId.value;
  if (!pid || !branch) return;
  rememberRouteBeforeSettings(route);
  void router.push({ name: "settingsAgents", params: { projectId: pid, branch } });
}

function openFeedbackIssue(): void {
  window.open("https://github.com/Blaise1030/workbench/issues/new", "_blank");
}

function onNavigateBack(): void {
  router.back();
}

function onNavigateForward(): void {
  router.forward();
}
</script>

<template>
  <div style="--header-height: 44px" class="max-h-screen overflow-hidden relative">
    <SidebarProvider v-model:open="sidebarOpen" class="flex flex-col">
      <nav class="h-(--header-height) bg-sidebar sticky top-0 left-0 z-10 flex min-w-0 items-center gap-1">
        <div
          class="flex shrink-0 items-center justify-end gap-1 ps-2"
          :class="{ 'ps-20': !isFullscreen }"
        >
          <SidebarTrigger v-if="!isSymphonyRoute" class="border" />
          <ButtonGroup>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Back" @click="onNavigateBack">
              <ChevronLeft />
            </Button>
            <Button type="button" variant="outline" size="icon-sm" aria-label="Forward" @click="onNavigateForward">
              <ChevronRight />
            </Button>
          </ButtonGroup>
        </div>

        <div class="flex min-w-0 flex-1 items-center gap-1">
          <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [-webkit-overflow-scrolling:touch]">
            <ContextMenu v-for="value in projectTabs ?? []" :key="value.id">
              <ContextMenuTrigger as-child>
                <Button
                  type="button"
                  :variant="value.id === projectId ? 'outline' : 'ghost'"
                  :class="[
                    value.id === projectId ? 'bg-background' : '',
                    projectIdsWithIdleAttention.has(value.id)
                      ? 'bg-blue-500/12 ring-1 ring-inset ring-blue-500/45 dark:bg-blue-400/14 dark:ring-blue-400/50'
                      : '',
                  ]"
                  :aria-current="value.id === projectId ? 'page' : undefined"
                  :title="projectIdsWithIdleAttention.has(value.id) ? 'A thread in this project needs attention' : undefined"
                  :data-testid="`header-project-tab-${value.id}`"
                  @click="navigateToProject(value.id)"
                >
                  📁 {{ value.name }}
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  variant="destructive"
                  class="text-xs"
                  :data-testid="`header-project-tab-delete-${value.id}`"
                  @select="void requestDeleteProject(value)"
                >
                  Delete "{{ value.name }}"…
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>

            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              class="shrink-0"
              aria-label="Add project"
              title="Add project"
              data-testid="header-add-project"
              :disabled="!canAddProject"
              @click="void pickAndAddProject()"
            >
              <PlusIcon />
            </Button>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1 pe-2 ps-1">
          <PillTabs
            v-if="Boolean(projectId)"
            :model-value="symphonyView"
            :tabs="[{ value: 'chat', label: 'Threads' }, { value: 'kanban', label: 'Symphony' }]"
            size="xs"
            class="mr-1"
            @update:model-value="onViewToggle($event)"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Raise feedback"
            title="Raise an issue on GitHub"
            data-testid="workspace-feedback-button"
            class="text-sm"
            @click="openFeedbackIssue"
          >
            <span aria-hidden="true">📝</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Settings"
            @click="openSettings"
          >
            <Settings :stroke-width="1.9" />
          </Button>
          <ThemeToggle variant="ghost" size="icon-sm" />
        </div>
      </nav>

      <div class="flex min-h-0 w-full flex-1 bg-sidebar">
        <template v-if="isSymphonyRoute">
          <div class="mx-1 h-[calc(100dvh-var(--header-height)-0.3rem)] min-h-0 flex-1 rounded-xl border shadow-sm overflow-hidden bg-background">
            <RouterView class="h-full min-h-0" />
          </div>
        </template>
        <RouterView v-else />
      </div>
    </SidebarProvider>
  </div>
</template>
