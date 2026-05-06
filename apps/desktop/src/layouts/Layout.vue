<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppContext } from "@/app-context/useAppContext";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
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
import { ChevronRight, PlusIcon, ChevronLeft } from "lucide-vue-next";
import type { Project, Thread } from "@/shared/domain";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRoute, useRouter } from "vue-router";
import { encodeBranch } from "@/router/branchParam";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import { Button } from "@/components/ui/button";
import Switch from "@/components/ui/Switch.vue";
import Label from "@/components/ui/label/Label.vue";
import BranchSelector from "@/components/BranchSelector.vue";
import SidebarTrigger from "@/components/ui/sidebar/SidebarTrigger.vue";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Terminal, Settings } from "lucide-vue-next";
import ThemeToggle from "@/components/ThemeToggle.vue";
import BranchPicker from "@/components/BranchPicker.vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const appContext = useAppContext();
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
  { value: "agent", label: "Agent" },
  { value: "gitPanel", label: "Git" },
  { value: "previewPanel", label: "Browser" },
  { value: "filesPanel", label: "Files" },
] as const;

const activeTab = computed<string>(() => {
  const name = route.name as string;
  if (name === "gitPanel") return "gitPanel";
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
})

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
    const res = (await window.workspaceApi?.getSnapshot()) as {
      projects: Project[];
    };
    const currentProject = res.projects?.find((p) => p.id === projectId.value);
    const path = currentProject?.repoPath!! ?? "";
    const worktrees = await appContext.value.gitService.listWorktrees(path);
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

    return worktrees.map(({ path, branch }) => ({
      path,
      branch,
      threads: (threadsMap[branch] ?? [])?.map((thread) => ({
        ...thread,
        threadPath: `/${projectId.value}/${encodeBranch(thread.createdBranch ?? "")}/thread/${thread.id}`,
      })),
    }));
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
  return Boolean(appContext.value.gitService && window.workspaceApi?.createWorktreeGroup);
});

async function onCreateWorktreeGroup(branch: string, baseBranch: string | null): Promise<void> {
  const api = window.workspaceApi;
  const pid = projectId.value;
  if (!api?.createWorktreeGroup || !pid) return;
  await api.createWorktreeGroup({ projectId: pid, branch, baseBranch });
  addWorktreePopoverOpen.value = false;
  void queryClient.invalidateQueries({ queryKey: ["worktrees"] });
}
</script>

<template>
  <div style="--header-height: 44px" class="max-h-screen overflow-hidden relative">
    <SidebarProvider class="flex flex-col">
      <nav class="h-(--header-height) bg-sidebar sticky top-0 left-0 z-10 flex min-w-0 items-center gap-1 border-b">
        <div class="flex shrink-0 items-center justify-end gap-1 ps-20">
          <SidebarTrigger class="border" />
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
          <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            <Button v-for="value in projectTabs ?? []" :key="value.id" type="button" class="shrink-0"
              :variant="value.id === projectId ? 'outline' : 'ghost'"
              :class="value.id === projectId ? 'bg-background' : ''"
              :aria-current="value.id === projectId ? 'page' : undefined" @click="navigateToProject(value.id)">
              {{ value.name }}
            </Button>
            <Button type="button" variant="outline" size="icon-sm" class="shrink-0" aria-label="Add project"
              title="Add project" data-testid="header-add-project" :disabled="!canAddProject"
              @click="void pickAndAddProject()">
              <PlusIcon />
            </Button>
          </div>

        </div>
        <div class="flex shrink-0 items-center gap-1 pe-2 ps-1">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Raise feedback"
            title="Raise an issue on GitHub" data-testid="workspace-feedback-button" class="text-sm"
            @click="openFeedbackIssue">
            <span aria-hidden="true">💬</span>
          </Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Settings" @click="openSettings">
            <Settings :stroke-width="1.9" />
          </Button>
          <ThemeToggle variant="outline" size="icon-sm" />
        </div>
      </nav>
      <div className="flex flex-1">
        <Sidebar class="top-(--header-height) h-[calc(100dvh-var(--header-height))]">
          <SidebarContent class="gap-0 flex flex-col">
            <template v-for="(value, index) in threadsGroup ?? []" :key="value.branch">
            <SidebarGroup class="gap-0 flex flex-col"
              :class="index === 0 ? 'px-1' : ''">
              <Collapsible default-open class="group/collapsible p-0">
                <SidebarGroupLabel as-child class="px-0">
                  <div v-if="index === 0" class="flex gap-0.5">
                    <CollapsibleTrigger
                      class="group/label bg-transparent aria-expanded:bg-transparent flex [&[data-state=open]>svg]:rotate-90"
                      as-child>
                      <Button size="icon-sm" variant="ghost" class="bg-transparent">
                        <ChevronRight
                          class="transition-transform size-4 group-data-[state=open]/collapsible:rotate-90" />
                      </Button>
                    </CollapsibleTrigger>
                    <div class="flex-1">
                      <BranchSelector v-if="projectPath" :cwd="projectPath" @branch-changed="
                        void queryClient.invalidateQueries({
                          queryKey: ['worktrees'],
                        })
                        " />
                    </div>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="New thread on this branch"
                      title="New thread" @click.stop="goNewThread(value.branch)">
                      <PlusIcon />
                    </Button>
                  </div>
                  <CollapsibleTrigger v-else
                    class="group/label w-full flex items-center [&[data-state=open]>svg]:rotate-90">
                    <ChevronRight class="transition-transform group-data-[state=open]/collapsible:rotate-90 mr-1" />
                    <span class="flex-1 text-start text-foreground">{{
                      value?.branch
                      }}</span>
                    <Button type="button" size="icon-sm" variant="ghost" class="ms-auto"
                      aria-label="New thread on this branch" title="New thread" @click.stop="goNewThread(value.branch)">
                      <PlusIcon />
                    </Button>
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <div class="gap-2 py-1 flex flex-col px-1.5">
                    <div class="flex gap-1" v-if="index === 0">
                      <Switch v-model="filterMode" />
                      <Label class="text-muted-foreground">
                        Threads from this branch only
                      </Label>
                    </div>
                    <div v-if="value.threads.some((t) => t.id === activeThreadId)" class="pb-1 flex flex-wrap gap-0.5">
                      <Button v-for="tab in panelTabs" :key="tab.value" size="sm"
                        :variant="activeTab === tab.value ? 'outline' : 'ghost'"
                        :class="activeTab === tab.value ? 'bg-background' : ''" @click="onTabChange(tab.value)">
                        {{ tab.label }}
                      </Button>
                    </div>
                  </div>

                  <SidebarGroupContent>
                    <SidebarMenu :class="index === 0 ? 'px-1' : ''">
                      <SidebarMenuItem :key="thread?.id" v-for="thread in showMoreToggleState[value?.branch]
                        ? filterByBranch(value?.threads, value?.branch)
                        : filterByBranch(
                          value?.threads,
                          value?.branch,
                        )?.splice(0, 10)">
                        <SidebarMenuButton :title="thread?.title" size="sm" as-child
                          class="whitespace-nowrap group-item" :is-active="route.path.startsWith(thread.threadPath)">
                          <RouterLink :to="thread?.threadPath">
                            <AgentIcon :agent="thread?.agent" />
                            <span class="truncate">
                              {{ thread?.title }}
                            </span>
                          </RouterLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <Button v-if="
                        filterByBranch(value?.threads, value?.branch).length >
                        10
                      " size="xs" variant="link" class="w-fit underline" @click="
                          showMoreToggleState[value?.branch] = !Boolean(
                            showMoreToggleState[value?.branch],
                          )
                          ">
                        Show
                        {{
                          showMoreToggleState[value?.branch] ? "less" : "all"
                        }}
                        ({{
                          filterByBranch(value?.threads, value?.branch)?.splice(
                            10,
                          )?.length
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
          <SidebarFooter class="flex flex-row items-center justify-end">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button type="button" variant="outline" size="icon-sm" class="shrink-0"
                  data-testid="thread-sidebar-footer-terminal" @click="openTerminalPanel">
                  <Terminal class="size-3" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"> Show terminal </TooltipContent>
            </Tooltip>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset class="h-[calc(100dvh-var(--header-height))]">
          <RouterView />
        </SidebarInset>
      </div>
    </SidebarProvider>
  </div>
</template>
