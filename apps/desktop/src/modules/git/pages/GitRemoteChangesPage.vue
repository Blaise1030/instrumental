<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ExternalLink,
  File,
  Filter,
  GitBranch,
  List,
  MessageSquare,
  RefreshCw,
  Settings2,
} from "lucide-vue-next";
import { DiffView, DiffModeEnum } from "@git-diff-view/vue";
import "@git-diff-view/vue/styles/diff-view.css";
import { Button } from "@/components/ui/button";
import { CursorLoading } from "@/components/ui/cursor-loading";
import { Badge } from "@/components/ui/badge/index";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useGitHubPrStore,
  type GitHubPrComment,
  type ParsedFileDiff,
} from "@/modules/git/stores/githubPrStore";
import GitHubTokenSetup from "@/modules/git/components/GitHubTokenSetup.vue";
import Label from "@/components/ui/label/Label.vue";

defineProps<{ cwd: string; contextLabel?: string | null }>();

const route = useRoute();
const router = useRouter();
const store = useGitHubPrStore();

const showSetup = ref(false);

watch(
  () => route.params.projectId,
  (pid) => {
    if (typeof pid !== "string" || !pid) return;
    store.setActiveProjectContext(pid);
    store.resetRemotePrStateForProjectChange();
    showSetup.value = !store.isConfigured;
    if (store.isConfigured) void store.fetchPrs();
  },
  { immediate: true },
);

function parseRoutePrId(): number | null {
  const raw = route.params.prId;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s === undefined || s === null || typeof s !== "string") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function workspaceThreadParams(): {
  projectId: string;
  branch: string;
  threadId: string;
} {
  return {
    projectId: route.params.projectId as string,
    branch: route.params.branch as string,
    threadId: route.params.threadId as string,
  };
}

function navigateToPr(prNumber: number): void {
  void router.push({
    name: "gitPullRequest",
    params: { ...workspaceThreadParams(), prId: String(prNumber) },
  });
}

const fileFilter = ref("");
const fileListPopoverOpen = ref(false);

watch(
  () => store.isConfigured,
  (v) => {
    if (v) showSetup.value = false;
  },
);

watch(
  () => route.name,
  (name) => {
    if (name === "gitPullRequests") {
      store.clearPr();
    }
  },
  { immediate: true },
);

watch(
  () =>
    [
      route.name,
      route.params.prId,
      route.params.projectId,
      store.prs.length,
      store.isConfigured,
    ] as const,
  async () => {
    if (!store.isConfigured) return;
    if (route.name !== "gitPullRequest") return;
    const prId = parseRoutePrId();
    if (prId === null) return;
    if (store.loading) return;
    if (store.prs.length === 0) {
      await store.fetchPrs();
    }
    if (!store.prs.some((p) => p.number === prId)) return;
    await store.selectPr(prId);
  },
  { immediate: true },
);

function onSaved(): void {
  showSetup.value = false;
  void store.fetchPrs();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function openInBrowser(url: string): void {
  window.open(url, "_blank");
}

// ── Diff ──────────────────────────────────────────────────────────────────

const isDark = computed(() =>
  document.documentElement.classList.contains("dark"),
);
const diffViewMode = computed(() => DiffModeEnum.Unified);

function diffDataForFile(file: ParsedFileDiff) {
  return {
    oldFile: {
      fileName: file.oldFileName === "/dev/null" ? null : file.oldFileName,
    },
    newFile: {
      fileName: file.newFileName === "/dev/null" ? null : file.newFileName,
    },
    hunks: [file.rawSection],
  };
}

/** Stable per-path extend slots for DiffView (new object identity each render breaks multi-file stacks). */
const extendDataByDisplayName = computed(() => {
  const byPath = new Map<string, GitHubPrComment[]>();
  for (const c of store.prComments) {
    const list = byPath.get(c.path) ?? [];
    list.push(c);
    byPath.set(c.path, list);
  }
  const out: Record<
    string,
    { newFile: Record<string, { data: GitHubPrComment[] }> }
  > = {};
  for (const [path, comments] of byPath) {
    const lineMap: Record<string, GitHubPrComment[]> = {};
    for (const c of comments) {
      const key = String(c.line ?? c.original_line ?? 0);
      if (!lineMap[key]) lineMap[key] = [];
      lineMap[key]!.push(c);
    }
    const newFile: Record<string, { data: GitHubPrComment[] }> = {};
    for (const [lineStr, arr] of Object.entries(lineMap)) {
      newFile[lineStr] = { data: arr };
    }
    out[path] = { newFile };
  }
  return out;
});

const expandedLines = ref<Set<string>>(new Set());

function commentRowKey(filePath: string, lineNumber: number): string {
  return `${filePath}\0${lineNumber}`;
}

function toggleComments(filePath: string, lineNumber: number): void {
  const key = commentRowKey(filePath, lineNumber);
  const next = new Set(expandedLines.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedLines.value = next;
}

function isExpanded(filePath: string, lineNumber: number): boolean {
  return expandedLines.value.has(commentRowKey(filePath, lineNumber));
}

watch(
  () => store.selectedPrNumber,
  () => {
    expandedLines.value = new Set();
    fileFilter.value = "";
    fileListPopoverOpen.value = false;
  },
);

function fileAnchorId(displayName: string): string {
  return `pr-file-${encodeURIComponent(displayName).replace(/%/g, "-")}`;
}

function scrollToFile(displayName: string): void {
  document.getElementById(fileAnchorId(displayName))?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function selectFileFromPicker(displayName: string): void {
  store.selectedFileName = displayName;
  fileListPopoverOpen.value = false;
  void nextTick(() => scrollToFile(displayName));
}

const filteredFiles = computed(() =>
  store.parsedFiles.filter((f) =>
    fileFilter.value
      ? f.displayName.toLowerCase().includes(fileFilter.value.toLowerCase())
      : true,
  ),
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
  <section class="flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
    <GitHubTokenSetup
      v-if="showSetup"
      :key="String(route.params.projectId ?? '')"
      :cwd="cwd"
      :project-id="route.params.projectId as string"
      @saved="onSaved"
    />

    <template v-else>      
      <SidebarProvider
        class="flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden border-t"
      >
          <Sidebar collapsible="none" class="h-full min-h-0 border-e">
            <SidebarHeader
              class="flex flex-col gap-1"
            >
              <div class="flex flex-row items-center justify-end gap-0.5">
                <Label class="me-auto text-xs text-muted-foreground">
                  Pull Requests
                </Label>
                <TooltipProvider :delay-duration="500">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        :disabled="store.loading"
                        @click="void store.fetchPrs()"
                      >
                        <CursorLoading
                          v-if="store.loading"
                          class="inline-block size-4 min-h-0 shrink-0 overflow-hidden"
                        />
                        <RefreshCw v-else />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Refresh</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        @click="showSetup = true"
                      >
                        <Settings2 />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Settings</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>              
            </SidebarHeader>

            <SidebarContent class="min-h-0 px-1 py-1">
              <div
                v-if="store.error && !store.prs.length"
                class="px-3 py-4 text-xs text-destructive"
              >
                {{ store.error }}
              </div>
              <div
                v-else-if="!store.loading && store.prs.length === 0"
                class="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center"
              >
                <p class="text-xs text-muted-foreground">
                  No open pull requests.
                </p>
              </div>
              <SidebarMenu v-else>
                <SidebarMenuItem v-for="pr in store.prs" :key="pr.number">
                  <SidebarMenuButton
                    size="sm"
                    class="h-auto min-h-auto flex-col items-stretch gap-1 whitespace-normal"
                    :is-active="store.selectedPrNumber === pr.number"
                    @click="navigateToPr(pr.number)"
                  >
                    <div class="flex items-start gap-1.5">
                      <span
                        class="shrink-0 font-mono text-[10px] text-muted-foreground"
                        >#{{ pr.number }}</span
                      >
                      <span
                        class="min-w-0 flex-1 text-start text-xs font-medium leading-tight text-sidebar-foreground line-clamp-2"
                      >
                        {{ pr.title }}
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5 ps-[22px]">
                      <Badge
                        v-if="pr.draft"
                        variant="secondary"
                        class="h-4 px-1 text-[9px]"
                        >Draft</Badge
                      >
                      <span class="truncate text-[10px] text-muted-foreground">
                        {{ pr.user.login }} · {{ formatDate(pr.updated_at) }}
                      </span>
                      <span
                        v-if="pr.review_comments > 0"
                        class="ms-auto flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
                      >
                        <MessageSquare class="h-2.5 w-2.5" />
                        {{ pr.review_comments }}
                      </span>
                    </div>
                    <div
                      class="flex flex-wrap items-center gap-1 ps-[22px] pt-0.5"
                      :title="`${pr.head.ref} merges into ${pr.base.ref}`"
                    >
                      <Badge
                        variant="outline"
                        class="h-auto text-start min-w-0 justify-start truncate max-w-[40%] font-mono text-[9px] font-normal leading-tight"
                        :title="pr.head.ref"
                      >
                        {{ pr.head.ref }}
                      </Badge>
                      <span class="text-[9px] text-muted-foreground/80" aria-hidden="true">→</span>
                      <Badge
                        variant="outline"
                        class="h-auto text-start justify-start truncate max-w-[40%] font-mono text-[9px] font-normal leading-tight"
                        :title="pr.base.ref"
                      >
                        {{ pr.base.ref }}
                      </Badge>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>

          <SidebarInset class="min-h-0 min-w-0 flex-1 overflow-hidden">
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              <!-- No PR selected -->
              <div
                v-if="!store.selectedPrNumber"
                class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
              >
                <p class="text-xs">Select a pull request to view its diff.</p>
              </div>

              <!-- Loading diff -->
              <div
                v-else-if="store.diffLoading"
                class="flex min-h-0 flex-1 flex-col"
              >
                <CursorLoading class="min-h-0 flex-1" />
              </div>

              <template v-else-if="store.selectedPr">
                <!-- PR header -->
                <div
                  class="flex min-w-0 shrink-0 flex-col gap-1 border-b border-border px-3 py-1.5"
                >
                  <div
                    class="flex min-h-8 min-w-0 items-center gap-2"
                    :title="`${store.selectedPr.head.ref} → ${store.selectedPr.base.ref}`"
                  >
                    <Badge
                      :variant="store.selectedPr.draft ? 'secondary' : 'default'"
                      class="shrink-0 text-[10px]"
                    >
                      {{ store.selectedPr.draft ? "Draft" : "Open" }}
                    </Badge>
                    <span
                      class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
                    >
                      {{ store.selectedPr.title }}
                    </span>
                    <span
                      class="shrink-0 font-mono text-xs text-muted-foreground"
                    >
                      #{{ store.selectedPr.number }}
                    </span>
                    <TooltipProvider :delay-duration="500">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Button
                            size="icon"
                            variant="ghost"
                            class="h-7 w-7 shrink-0"
                            @click="openInBrowser(store.selectedPr!.html_url)"
                          >
                            <ExternalLink class="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom"
                          >View on GitHub</TooltipContent
                        >
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div
                    class="flex min-w-0 items-center gap-1.5 ps-0.5"
                    role="group"
                    :aria-label="`${store.selectedPr.head.ref} into ${store.selectedPr.base.ref}`"
                  >
                    <GitBranch
                      class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div
                      class="flex min-w-0 flex-1 flex-wrap items-center gap-1"
                    >
                      <Badge
                        variant="outline"
                        class="h-auto justify-start truncate px-1.5 py-0 font-mono text-[10px] font-normal leading-tight"
                        :title="store.selectedPr.head.ref"
                      >
                        {{ store.selectedPr.head.ref }}
                      </Badge>
                      <span class="text-[10px] text-muted-foreground/80">→</span>
                      <Badge
                        variant="secondary"
                        class="h-auto justify-start truncate px-1.5 py-0 font-mono text-[10px] font-normal leading-tight"
                        :title="store.selectedPr.base.ref"
                      >
                        {{ store.selectedPr.base.ref }}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div
                  class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                >
                  <!-- Sticky filter toolbar (stays under PR header while scrolling diffs) -->
                  <div
                    class="sticky top-0 z-20 shrink-0 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur-md supports-backdrop-filter:bg-background/80"
                  >
                    <div class="flex items-center gap-1.5">
                      <div class="relative min-w-0 flex-1">
                        <Filter
                          class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                          v-model="fileFilter"
                          placeholder="Filter files…"
                          class="h-6 pl-6 text-[11px]"
                        />
                      </div>
                      <Popover v-model:open="fileListPopoverOpen">
                        <PopoverTrigger as-child>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            class="h-6 w-6 shrink-0"
                            :aria-expanded="fileListPopoverOpen"
                            title="Browse changed files"
                            aria-label="Browse changed files"
                          >
                            <List class="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          side="bottom"
                          :side-offset="6"
                          class="w-[min(22rem,calc(100vw-2rem))] overflow-hidden gap-0 p-0"
                        >
                          <div
                            v-if="filteredFiles.length > 0"
                            class="border-b border-border px-3 py-2"
                          >
                            <p
                              class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              Changed files
                            </p>
                            <p class="mt-0.5 text-[10px] text-muted-foreground">
                              <span class="font-semibold text-foreground">{{
                                filteredFiles.length
                              }}</span>
                              {{
                                filteredFiles.length === 1 ? "file" : "files"
                              }}
                              — click to jump
                            </p>
                          </div>
                          <ScrollArea
                            v-if="filteredFiles.length > 0"
                            class="max-h-[min(22rem,50dvh)]"
                          >
                            <div class="flex flex-col py-1">
                              <button
                                v-for="file in filteredFiles"
                                :key="file.displayName"
                                type="button"
                                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-accent"
                                :class="
                                  store.selectedFileName === file.displayName
                                    ? 'bg-accent'
                                    : ''
                                "
                                @click="selectFileFromPicker(file.displayName)"
                              >
                                <File
                                  class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                />
                                <span
                                  class="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground"
                                >
                                  {{ file.displayName }}
                                </span>
                                <span
                                  class="flex shrink-0 gap-1.5 font-mono text-[9px] tabular-nums"
                                >
                                  <span
                                    class="text-emerald-600 dark:text-emerald-400"
                                    >+{{ file.additions }}</span
                                  >
                                  <span class="text-destructive"
                                    >-{{ file.deletions }}</span
                                  >
                                </span>
                              </button>
                            </div>
                          </ScrollArea>
                          <div
                            v-else
                            class="px-3 py-6 text-center text-[11px] leading-snug text-muted-foreground"
                          >
                            {{
                              fileFilter.trim()
                                ? "No files match this filter."
                                : "No file changes in this pull request."
                            }}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <ScrollArea class="h-full min-h-0 flex-1 overflow-hidden">
                    <div
                      v-if="filteredFiles.length === 0"
                      class="flex min-h-48 items-center justify-center px-3 py-8 text-xs text-muted-foreground"
                    >
                      {{
                        fileFilter.trim()
                          ? "No files match this filter."
                          : "No file changes in this pull request."
                      }}
                    </div>

                    <template
                      v-for="file in filteredFiles"
                      :key="file.displayName"
                    >
                      <article
                        :id="fileAnchorId(file.displayName)"
                        class="scroll-mt-24 border-b border-border last:border-b-0"
                      >
                        <div
                          class="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-1.5 backdrop-blur-sm"
                        >
                          <File
                            class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          />
                          <span
                            class="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
                          >
                            {{ file.displayName }}
                          </span>
                          <div class="flex shrink-0 items-center gap-2">
                            <span
                              class="font-mono text-[10px] text-emerald-600 dark:text-emerald-400"
                            >
                              +{{ file.additions }}
                            </span>
                            <span
                              class="font-mono text-[10px] text-destructive"
                            >
                              -{{ file.deletions }}
                            </span>
                          </div>
                        </div>

                        <DiffView
                          :key="file.displayName"
                          :data="diffDataForFile(file)"
                          :extend-data="
                            extendDataByDisplayName[file.displayName] ?? {
                              newFile: {},
                            }
                          "
                          :diff-view-mode="diffViewMode"
                          :diff-view-theme="isDark ? 'dark' : 'light'"
                          :diff-view-highlight="true"
                          :diff-view-wrap="true"
                          :diff-view-font-size="11"
                          class="min-w-0"
                        >
                          <template #extend="{ lineNumber, data, onUpdate }">
                            <div
                              v-if="data && data.length > 0"
                              class="border-t border-border/60 bg-muted/30"
                            >
                              <Button
                                variant="ghost"
                                class="h-auto w-full justify-start gap-1.5 rounded-none px-3 py-1 text-[10px] font-medium text-muted-foreground"
                                @click="
                                  toggleComments(file.displayName, lineNumber);
                                  onUpdate();
                                "
                              >
                                <MessageSquare class="h-3 w-3 shrink-0" />
                                {{ data.length }} comment{{
                                  data.length === 1 ? "" : "s"
                                }}
                              </Button>
                              <div
                                v-if="isExpanded(file.displayName, lineNumber)"
                                class="divide-y divide-border/60 border-t border-border/60"
                              >
                                <div
                                  v-for="comment in data"
                                  :key="comment.id"
                                  class="flex gap-2 px-3 py-2"
                                >
                                  <Avatar class="h-5 w-5 shrink-0">
                                    <AvatarImage
                                      :src="comment.user.avatar_url"
                                      :alt="comment.user.login"
                                    />
                                    <AvatarFallback class="text-[8px]">
                                      {{
                                        comment.user.login
                                          .slice(0, 2)
                                          .toUpperCase()
                                      }}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div class="min-w-0 flex-1">
                                    <div
                                      class="mb-0.5 flex items-center gap-1.5"
                                    >
                                      <span
                                        class="text-[10px] font-semibold text-foreground"
                                        >{{ comment.user.login }}</span
                                      >
                                      <span
                                        class="text-[9px] text-muted-foreground"
                                        >{{
                                          formatDate(comment.created_at)
                                        }}</span
                                      >
                                    </div>
                                    <p
                                      class="whitespace-pre-wrap text-[11px] leading-snug text-foreground"
                                    >
                                      {{ comment.body }}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </template>
                        </DiffView>
                      </article>
                    </template>
                  </ScrollArea>
                </div>
              </template>
            </div>
          </SidebarInset>        
      </SidebarProvider>
    </template>
  </section>
  </div>
</template>

<style scoped>
/* @reference "../../styles/globals.css"; */

:deep(.diff-view-wrapper) {
  font-size: 11px;
  min-width: 0;
  height: auto;
  max-height: none;
}
</style>
