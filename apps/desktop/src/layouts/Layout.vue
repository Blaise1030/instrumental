<script setup lang="ts">
import { computed, ref } from "vue";
import { useIsFullscreen } from "@/composables/useIsFullscreen";
import { useAppContext } from "@/app-context/useAppContext";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import { useThreadPtyRunStatus } from "@/composables/useThreadPtyRunStatus";
import { useAddProjectFromDirectoryPick } from "@/composables/useAddProjectFromDirectoryPick";
import { useNavigateToProject } from "@/composables/useNavigateToProject";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ButtonGroup } from "@/components/ui/button-group";
import { ChevronRight, PlusIcon, ChevronLeft, Trash2 } from "lucide-vue-next";
import type { Project, Thread } from "@/shared/domain";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRoute, useRouter } from "vue-router";
import { encodeBranch } from "@/router/branchParam";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import { Button } from "@/components/ui/button";
import Switch from "@/components/ui/Switch.vue";
import Label from "@/components/ui/label/Label.vue";
import BranchSelector from "@/modules/git/components/BranchSelector.vue";
import SidebarTrigger from "@/components/ui/sidebar/SidebarTrigger.vue";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Terminal, Settings } from "lucide-vue-next";
import ThemeToggle from "@/components/ThemeToggle.vue";
import NotificationPopover from "@/modules/notification/components/NotificationPopover.vue";
import BranchPicker from "@/modules/git/components/BranchPicker.vue";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { WorkspaceSnapshot } from "@shared/ipc";
import { useToast } from "@/composables/useToast";

const appContext = useAppContext();
const { isFullscreen } = useIsFullscreen();
const toast = useToast();
const queryClient = useQueryClient();
const route = useRoute();
const router = useRouter();
const filterMode = ref(false);
const projectId = computed(() => route.params.projectId as string);

const { activeThreadId } = useActiveWorkspace();
const { navigateToProject: navigateToProjectCore } = useNavigateToProject();

async function navigateToProject(targetProjectId: string): Promise<void> {
  const changed = await navigateToProjectCore(targetProjectId);
  if (!changed) return;
  void queryClient.invalidateQueries({ queryKey: ["worktrees"] });
  void queryClient.invalidateQueries({ queryKey: ["projectPath"] });
  void queryClient.invalidateQueries({ queryKey: ["projectTabs"] });
}

const { pickAndAddProject } = useAddProjectFromDirectoryPick({
  navigateToProject,
});

const canAddProject = computed(() => {
  if (typeof window === "undefined") return false;
  return Boolean(
    appContext.value.gitService && window.workspaceApi?.pickRepoDirectory,
  );
});

const panelTabs = [
  { value: "agent", label: "🤖 Agent" },
  { value: "gitPanel", label: "🌳 Git" },
  { value: "previewPanel", label: "🌐 Browser" },
  { value: "filesPanel", label: "📁 Files" },
] as const;

const activeTab = computed<string>(() => {
  const name = route.name as string;
  if (
    name === "gitPanel" ||
    name === "gitPullRequests" ||
    name === "gitPullRequest"
  )
    return "gitPanel";
  if (name === "previewPanel") return "previewPanel";
  if (name === "filesPanel" || name === "fileDetail") return "filesPanel";
  return "agent";
});

function onTabChange(value: string): void {
  const tid = activeThreadId.value;
  if (!tid) return;
  void router.push({
    name: value,
    params: {
      projectId: projectId.value,
      branch: branchId.value,
      threadId: tid,
    },
  });
}

function onNavigateBack() {
  router.back();
}

function onNavigateForward() {
  router.forward();
}

function goNewThread(branch: string): void {
  const pid = projectId.value;
  if (!pid || !branch) return;
  void router.push({
    name: "threadNew",
    params: { projectId: pid, branch: encodeBranch(branch) },
  });
}

const branchId = computed(() => route.params.branch as string);
const showMoreToggleState = ref<{ [k: string]: boolean }>({});

const { data: projectTabs } = useQuery({
  queryKey: ["projectTabs", appContext],
  enabled: !!appContext.value.gitService,
  queryFn: async () => {
    const res = (await window.workspaceApi?.getSnapshot()) as {
      projects: Project[];
    };
    return res.projects;
  },
});

const { data: projectPath } = useQuery({
  queryKey: ["projectPath", appContext],
  enabled: !!appContext.value.gitService,
  queryFn: async () => {
    const res = (await window.workspaceApi?.getSnapshot()) as {
      projects: Project[];
    };
    const currentProject = res.projects?.find((p) => p.id === projectId.value);
    return currentProject?.repoPath!! ?? "";
  },
});

const { data: threadsGroup } = useQuery({
  queryKey: ["worktrees", appContext],
  enabled: !!appContext.value.gitService,
  queryFn: async () => {
    const res = (await window.workspaceApi?.getSnapshot()) as WorkspaceSnapshot;
    const currentProject = res.projects?.find((p) => p.id === projectId.value);
    const repoRoot = currentProject?.repoPath ?? "";
    const persisted = res.worktrees.filter(
      (w) => w.projectId === projectId.value,
    );
    const listed = await appContext.value.gitService.listWorktrees(repoRoot);
    const threads = await appContext.value.threadManagementService.loadThreads(
      projectId.value,
    );
    const threadsMap = threads.reduce(
      (p, c) => {
        let newP = { ...p };
        if (newP[c.createdBranch ?? ""]) newP[c.createdBranch ?? ""].push(c);
        else newP = { ...newP, [c.createdBranch ?? ""]: [c] };
        return newP;
      },
      {} as Record<string, Thread[]>,
    );

    return listed.map(({ path: wtPath, branch }) => {
      const row =
        persisted.find((w) => w.path === wtPath) ??
        persisted.find((w) => w.branch === branch);
      return {
        path: wtPath,
        branch,
        worktreeId: row?.id ?? null,
        isDefault: row?.isDefault ?? false,
        threads: (threadsMap[branch] ?? [])?.map((thread) => ({
          ...thread,
          threadPath: `/${projectId.value}/${encodeBranch(thread.createdBranch ?? "")}/thread/${thread.id}`,
        })),
      };
    });
  },
});

const filterByBranch = (
  threads: (Thread & { threadPath: string })[],
  branch: string,
): (Thread & { threadPath: string })[] => {
  if (filterMode.value) {
    return threads.filter((thread) => thread.createdBranch === branch);
  }
  return threads;
};

const allSidebarThreads = computed(() =>
  (threadsGroup.value ?? []).flatMap((g) => g.threads)
);

const { runStatusByThreadId, idleAttentionByThreadId, clearIdleAttention } = useThreadPtyRunStatus(
  allSidebarThreads,
  { activeThreadId, notificationsEnabled: ref(true), workspaceService: computed(() => appContext.value?.workspaceService) }
);

function threadIconClass(threadId: string): string {
  switch (runStatusByThreadId.value[threadId] ?? null) {
    case "running": return "animate-pulse text-green-600 dark:text-green-400";
    case "needsReview": return "animate-pulse text-orange-500";
    case "done": return "text-green-500";
    case "failed": return "text-red-500";
    default: return "";
  }
}

function openFeedbackIssue(): void {
  window.open("https://github.com/instrument-ai/instrument/issues", "_blank");
}

function openSettings(): void {
  router.push({ name: "settings" });
}

function openTerminalPanel(): void {
  router.push({ name: "terminal" });
}

const addWorktreePopoverOpen = ref(false);

const canCreateWorktree = computed(() => {
  if (typeof window === "undefined") return false;
  return Boolean(
    appContext.value.gitService && window.workspaceApi?.createWorktreeGroup,
  );
});

const canDeleteWorktree = computed(() => {
  if (typeof window === "undefined") return false;
  return Boolean(window.workspaceApi?.deleteWorktreeGroup);
});

async function onDeleteWorktreeGroup(
  worktreeId: string,
  branch: string,
  isDefault: boolean,
): Promise<void> {
  if (!worktreeId || isDefault || !canDeleteWorktree.value) return;
  const ok = window.confirm(
    `Remove linked worktree for “${branch}”? Threads in this group are removed. This cannot be undone.`,
  );
  if (!ok) return;
  const api = window.workspaceApi;
  if (!api?.deleteWorktreeGroup) return;
  try {
    await api.deleteWorktreeGroup({ worktreeId });
    void queryClient.invalidateQueries({ queryKey: ["worktrees"] });
  } catch (e) {
    toast.error(
      "Could not remove worktree",
      e instanceof Error ? e.message : "Unknown error",
    );
  }
}

async function onCreateWorktreeGroup(
  branch: string,
  baseBranch: string | null,
): Promise<void> {
  const api = window.workspaceApi;
  const pid = projectId.value;
  if (!api?.createWorktreeGroup || !pid) return;
  await api.createWorktreeGroup({ projectId: pid, branch, baseBranch });
  addWorktreePopoverOpen.value = false;
  void queryClient.invalidateQueries({ queryKey: ["worktrees"] });
}
</script>

<template>
  <div
    style="--header-height: 44px"
    class="max-h-screen overflow-hidden relative"
  >
    <SidebarProvider class="flex flex-col">
      <nav
        class="h-(--header-height) bg-sidebar sticky top-0 left-0 z-10 flex min-w-0 items-center gap-1 border-b"
      >
        <div
          class="flex shrink-0 items-center justify-end gap-1 ps-2"
          :class="{ 'ps-20': !isFullscreen }"
        >
          <SidebarTrigger class="border" />
          <ButtonGroup>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Back"
              @click="onNavigateBack"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Forward"
              @click="onNavigateForward"
            >
              <ChevronRight />
            </Button>
          </ButtonGroup>
        </div>
        <div class="flex min-w-0 flex-1 items-center gap-1">
          <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">            
            <Button
              v-for="value in projectTabs ?? []"
              :key="value.id"
              type="button"
              class="shrink-0"
              :variant="value.id === projectId ? 'outline' : 'ghost'"
              :class="value.id === projectId ? 'bg-background' : ''"
              :aria-current="value.id === projectId ? 'page' : undefined"
              @click="navigateToProject(value.id)"
            >
            <span
              class="inline-flex shrink-0 items-center justify-center ps-0.5 text-[15px] leading-none select-none"
              role="img"
              aria-label="Workspace"
              >📁</span>
              {{ value.name }}
            </Button>
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
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Raise feedback"
            title="Raise an issue on GitHub"
            data-testid="workspace-feedback-button"
            class="text-sm"
            @click="openFeedbackIssue"
          >
            <span aria-hidden="true">💬</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Settings"
            @click="openSettings"
          >
            <Settings :stroke-width="1.9" />
          </Button>
          <ThemeToggle variant="outline" size="icon-sm" />
        </div>
      </nav>
      <div class="flex min-h-0 flex-1">
        <Sidebar
          class="top-(--header-height) h-[calc(100dvh-var(--header-height))]"
        >
          <SidebarContent class="gap-0 flex flex-col">
            <template
              v-for="(value, index) in threadsGroup ?? []"
              :key="value.branch"
            >
              <SidebarGroup
                class="gap-0 flex flex-col"
                :class="index === 0 ? 'px-1' : ''"
              >
                <Collapsible default-open class="group/collapsible p-0">
                  <SidebarGroupLabel as-child class="px-0">
                    <div
                      v-if="index === 0"
                      class="group/wt-hdr flex min-w-0 gap-0.5"
                    >
                      <CollapsibleTrigger
                        class="group/label shrink-0 bg-transparent aria-expanded:bg-transparent flex [&[data-state=open]>svg]:rotate-90"
                        as-child
                      >
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          class="bg-transparent"
                        >
                          <ChevronRight
                            class="transition-transform size-4 group-data-[state=open]/collapsible:rotate-90"
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <div class="min-w-0 flex-1">
                        <BranchSelector
                          v-if="projectPath"
                          :cwd="projectPath"
                          @branch-changed="
                            void queryClient.invalidateQueries({
                              queryKey: ['worktrees'],
                            })
                          "
                        />
                      </div>
                      <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="New thread on this branch"
                          title="New thread"
                          data-testid="layout-worktree-new-thread"
                          @click.stop="goNewThread(value.branch)"
                        >
                          <PlusIcon />
                      </Button>
                    </div>
                    <div
                      v-else
                      class="group/wt-hdr flex min-w-0 w-full items-stretch gap-0.5"
                    >
                      <CollapsibleTrigger
                        class="group/label flex min-w-0 flex-1 items-center bg-transparent [&[data-state=open]>svg]:rotate-90"
                      >
                        <ChevronRight
                          class="mr-1 size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90"
                        />
                        <span
                          class="min-w-0 flex-1 truncate text-start text-foreground"
                          >{{ value.branch }}</span
                        >
                      </CollapsibleTrigger>
                      <div
                        class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/wt-hdr:opacity-100 group-focus-within/wt-hdr:opacity-100"
                      >
                        <Button
                          v-if="
                            value.worktreeId &&
                            !value.isDefault &&
                            canDeleteWorktree
                          "
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove linked worktree"
                          title="Remove linked worktree"
                          data-testid="layout-worktree-delete"
                          @click.stop="
                            onDeleteWorktreeGroup(
                              value.worktreeId!,
                              value.branch,
                              value.isDefault,
                            )
                          "
                        >
                          <Trash2 />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="New thread on this branch"
                          title="New thread"
                          data-testid="layout-worktree-new-thread"
                          @click.stop="goNewThread(value.branch)"
                        >
                          <PlusIcon />
                        </Button>
                      </div>
                    </div>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <div class="gap-2 py-1 flex flex-col px-1.5">
                      <div class="flex gap-1" v-if="index === 0">
                        <Switch v-model="filterMode" />
                        <Label class="text-muted-foreground">
                          Threads from this branch only
                        </Label>
                      </div>
                      <div
                        v-if="
                          value.threads.some((t) => t.id === activeThreadId)
                        "
                        class="pb-1 flex flex-wrap gap-0.5"
                      >
                        <Button
                          v-for="tab in panelTabs"
                          :key="tab.value"
                          size="sm"
                          :variant="
                            activeTab === tab.value ? 'outline' : 'ghost'
                          "
                          :class="
                            activeTab === tab.value ? 'bg-background' : ''
                          "
                          @click="onTabChange(tab.value)"
                        >
                          {{ tab.label }}
                        </Button>
                      </div>
                    </div>

                    <SidebarGroupContent>
                      <SidebarMenu :class="index === 0 ? 'px-1' : ''">
                        <SidebarMenuItem
                          :key="thread?.id"
                          v-for="thread in showMoreToggleState[value?.branch]
                            ? filterByBranch(value?.threads, value?.branch)
                            : filterByBranch(
                                value?.threads,
                                value?.branch,
                              )?.splice(0, 10)"
                        >
                          <SidebarMenuButton
                            :title="thread?.title"
                            size="sm"
                            as-child
                            class="whitespace-nowrap group-item"
                            :class="idleAttentionByThreadId[thread.id] ? 'bg-blue-500/12 ring-1 ring-blue-500/45 dark:bg-blue-400/14 dark:ring-blue-400/50' : ''"
                            :is-active="
                              route.path.startsWith(thread.threadPath)
                            "
                            @click="clearIdleAttention(thread.id)"
                          >
                            <RouterLink :to="thread?.threadPath">
                              <AgentIcon :agent="thread?.agent" :class="threadIconClass(thread.id)" />
                              <span class="truncate">
                                {{ thread?.title }}
                              </span>
                            </RouterLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        <Button
                          v-if="
                            filterByBranch(value?.threads, value?.branch)
                              .length > 10
                          "
                          size="xs"
                          variant="link"
                          class="w-fit underline"
                          @click="
                            showMoreToggleState[value?.branch] = !Boolean(
                              showMoreToggleState[value?.branch],
                            )
                          "
                        >
                          Show
                          {{
                            showMoreToggleState[value?.branch] ? "less" : "all"
                          }}
                          ({{
                            filterByBranch(
                              value?.threads,
                              value?.branch,
                            )?.splice(10)?.length
                          }})
                        </Button>
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarGroup>
              <div
                v-if="index === 0"
                class="flex items-center gap-1 px-1 pb-1 pt-0"
              >
                <div class="h-px flex-1 bg-border/80" />
                <Popover v-model:open="addWorktreePopoverOpen">
                  <PopoverTrigger as-child>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      class="shrink-0 rounded-md"
                      aria-label="Add worktree"
                      title="Add a linked worktree"
                      :disabled="!canCreateWorktree || !projectId"
                      data-testid="layout-add-worktree-trigger"
                    >
                      <PlusIcon class="h-4 w-4 shrink-0" />
                      <span class="whitespace-nowrap">Add worktree</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="bottom"
                    class="max-w-[240px] p-2"
                    data-testid="layout-add-worktree-popover"
                  >
                    <BranchPicker
                      v-if="projectId"
                      variant="popover"
                      :project-id="projectId"
                      :cwd="projectPath ?? ''"
                      @create="onCreateWorktreeGroup"
                      @cancel="addWorktreePopoverOpen = false"
                    />
                  </PopoverContent>
                </Popover>
                <div class="h-px flex-1 bg-border/80" />
              </div>
            </template>
          </SidebarContent>
          <SidebarFooter class="flex flex-row items-center justify-end gap-1">
            <NotificationPopover />
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  class="shrink-0"
                  data-testid="thread-sidebar-footer-terminal"
                  @click="openTerminalPanel"
                >
                  <Terminal class="size-3" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"> Show terminal </TooltipContent>
            </Tooltip>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset class="h-[calc(100dvh-var(--header-height))] min-h-0">
          <RouterView />
        </SidebarInset>
      </div>
    </SidebarProvider>
  </div>
</template>
