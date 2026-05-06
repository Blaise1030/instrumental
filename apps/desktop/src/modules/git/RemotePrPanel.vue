<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  File,
  Filter,
  Loader2,
  MessageSquare,
  RefreshCw,
  Settings2,
} from "lucide-vue-next";
import { DiffView, DiffModeEnum } from "@git-diff-view/vue";
import "@git-diff-view/vue/styles/diff-view.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge/index";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useGitHubPrStore, type GitHubPrComment } from "@/stores/githubPrStore";
import GitHubTokenSetup from "./GitHubTokenSetup.vue";

const props = defineProps<{ cwd: string }>();

const store = useGitHubPrStore();
const showSetup = ref(!store.isConfigured);
const fileFilter = ref("");

watch(
  () => store.isConfigured,
  (v) => { if (v) showSetup.value = false; }
);

onMounted(() => {
  if (store.isConfigured && store.prs.length === 0) void store.fetchPrs();
});

function onSaved(): void {
  showSetup.value = false;
  void store.fetchPrs();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function openInBrowser(url: string): void {
  window.open(url, "_blank");
}

// ── Diff ──────────────────────────────────────────────────────────────────

const isDark = computed(() => document.documentElement.classList.contains("dark"));
const diffViewMode = computed(() => DiffModeEnum.Unified);

const diffData = computed(() => {
  const file = store.selectedFileDiff;
  if (!file) return null;
  return {
    oldFile: { fileName: file.oldFileName === "/dev/null" ? null : file.oldFileName },
    newFile: { fileName: file.newFileName === "/dev/null" ? null : file.newFileName },
    hunks: [file.rawSection],
  };
});

const commentsByLine = computed<Record<string, GitHubPrComment[]>>(() => {
  const map: Record<string, GitHubPrComment[]> = {};
  for (const c of store.commentsForSelectedFile) {
    const key = String(c.line ?? c.original_line ?? 0);
    if (!map[key]) map[key] = [];
    map[key]!.push(c);
  }
  return map;
});

const extendData = computed(() => {
  const newFile: Record<string, { data: GitHubPrComment[] }> = {};
  for (const [lineStr, comments] of Object.entries(commentsByLine.value)) {
    newFile[lineStr] = { data: comments };
  }
  return { newFile };
});

const expandedLines = ref<Set<string>>(new Set());

function toggleComments(lineNumber: number): void {
  const key = String(lineNumber);
  const next = new Set(expandedLines.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedLines.value = next;
}

function isExpanded(lineNumber: number): boolean {
  return expandedLines.value.has(String(lineNumber));
}

watch([() => store.selectedPrNumber, () => store.selectedFileName], () => {
  expandedLines.value = new Set();
});

// ── File tree grouping ────────────────────────────────────────────────────

function splitDisplayName(name: string): { dir: string; base: string } {
  const i = name.lastIndexOf("/");
  if (i < 0) return { dir: "", base: name };
  return { dir: name.slice(0, i), base: name.slice(i + 1) };
}

type FileGroup = { dir: string; files: typeof store.parsedFiles };

const filteredFiles = computed(() =>
  store.parsedFiles.filter((f) =>
    fileFilter.value
      ? f.displayName.toLowerCase().includes(fileFilter.value.toLowerCase())
      : true
  )
);

const fileGroups = computed<FileGroup[]>(() => {
  const map = new Map<string, FileGroup>();
  for (const file of filteredFiles.value) {
    const { dir } = splitDisplayName(file.displayName);
    const key = dir || "(root)";
    if (!map.has(key)) map.set(key, { dir: key, files: [] });
    map.get(key)!.files.push(file);
  }
  return Array.from(map.values());
});

const openGroups = ref<Set<string>>(new Set());

watch(
  () => store.selectedPrNumber,
  () => {
    openGroups.value = new Set(fileGroups.value.map((g) => g.dir));
    fileFilter.value = "";
  }
);

watch(fileGroups, (groups) => {
  for (const g of groups) {
    if (!openGroups.value.has(g.dir)) openGroups.value = new Set([...openGroups.value, g.dir]);
  }
});

function toggleGroup(dir: string): void {
  const next = new Set(openGroups.value);
  if (next.has(dir)) next.delete(dir);
  else next.add(dir);
  openGroups.value = next;
}

// Additions/deletions colour bar (max 5 blocks like GitHub)
function additionBlocks(additions: number, deletions: number): number {
  const total = additions + deletions;
  if (total === 0) return 0;
  return Math.round((additions / total) * 5);
}
</script>

<template>
  <section class="flex h-full min-h-0 bg-background text-foreground">
    <GitHubTokenSetup v-if="showSetup" :cwd="cwd" @saved="onSaved" />

    <template v-else>
      <!-- ── Left: PR list ─────────────────────────────────────── -->
      <aside class="flex h-full min-h-0 w-[260px] shrink-0 flex-col border-r border-border">
        <div class="flex h-9 items-center justify-between gap-1 border-b border-border px-2">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Pull Requests
          </span>
          <div class="flex items-center gap-0.5">
            <TooltipProvider :delay-duration="500">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-6 w-6"
                    :disabled="store.loading"
                    @click="void store.fetchPrs()"
                  >
                    <Loader2 v-if="store.loading" class="h-3.5 w-3.5 animate-spin" />
                    <RefreshCw v-else class="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-6 w-6"
                    @click="showSetup = true"
                  >
                    <Settings2 class="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <ScrollArea class="min-h-0 flex-1">
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
            <p class="text-xs text-muted-foreground">No open pull requests.</p>
          </div>

          <button
            v-for="pr in store.prs"
            :key="pr.number"
            type="button"
            class="flex w-full flex-col gap-1 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
            :class="store.selectedPrNumber === pr.number ? 'bg-accent' : ''"
            @click="void store.selectPr(pr.number)"
          >
            <div class="flex items-start gap-1.5">
              <span class="shrink-0 font-mono text-[10px] text-muted-foreground">#{{ pr.number }}</span>
              <span class="min-w-0 flex-1 text-xs font-medium leading-tight text-foreground line-clamp-2">
                {{ pr.title }}
              </span>
            </div>
            <div class="flex items-center gap-1.5 pl-[22px]">
              <Badge v-if="pr.draft" variant="secondary" class="h-4 px-1 text-[9px]">Draft</Badge>
              <span class="truncate text-[10px] text-muted-foreground">
                {{ pr.user.login }} · {{ formatDate(pr.updated_at) }}
              </span>
              <span
                v-if="pr.review_comments > 0"
                class="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
              >
                <MessageSquare class="h-2.5 w-2.5" />
                {{ pr.review_comments }}
              </span>
            </div>
          </button>
        </ScrollArea>
      </aside>

      <!-- ── Right: diff area ──────────────────────────────────── -->
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
          class="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 class="h-4 w-4 animate-spin" />
          Loading diff…
        </div>

        <template v-else-if="store.selectedPr">
          <!-- PR header -->
          <div class="flex h-10 min-w-0 shrink-0 items-center gap-2 border-b border-border px-3">
            <Badge
              :variant="store.selectedPr.draft ? 'secondary' : 'default'"
              class="shrink-0 text-[10px]"
            >
              {{ store.selectedPr.draft ? "Draft" : "Open" }}
            </Badge>
            <span class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {{ store.selectedPr.title }}
            </span>
            <span class="shrink-0 font-mono text-xs text-muted-foreground">
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
                <TooltipContent side="bottom">View on GitHub</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <!-- File tree + diff -->
          <div class="flex min-h-0 flex-1 overflow-hidden">
            <!-- File tree -->
            <div class="flex h-full w-[220px] shrink-0 flex-col border-r border-border">
              <!-- Filter -->
              <div class="border-b border-border px-2 py-1.5">
                <div class="relative">
                  <Filter class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    v-model="fileFilter"
                    placeholder="Filter files…"
                    class="h-6 pl-6 text-[11px]"
                  />
                </div>
              </div>

              <ScrollArea class="min-h-0 flex-1">
                <!-- File count -->
                <div class="flex items-center gap-1 px-2 py-1.5 text-[10px] text-muted-foreground">
                  <span class="font-semibold">{{ filteredFiles.length }}</span>
                  <span>{{ filteredFiles.length === 1 ? "file" : "files" }} changed</span>
                </div>
                <Separator />

                <!-- Grouped file tree -->
                <div v-for="group in fileGroups" :key="group.dir">
                  <Collapsible
                    :open="openGroups.has(group.dir)"
                    @update:open="toggleGroup(group.dir)"
                  >
                    <CollapsibleTrigger
                      class="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-medium text-foreground hover:bg-accent"
                    >
                      <ChevronDown
                        v-if="openGroups.has(group.dir)"
                        class="h-3 w-3 shrink-0 text-muted-foreground"
                      />
                      <ChevronRight
                        v-else
                        class="h-3 w-3 shrink-0 text-muted-foreground"
                      />
                      <span class="truncate font-mono text-[10px]">{{ group.dir }}</span>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <button
                        v-for="file in group.files"
                        :key="file.displayName"
                        type="button"
                        class="flex w-full items-center gap-1.5 py-1 pl-6 pr-2 text-left transition-colors hover:bg-accent"
                        :class="store.selectedFileName === file.displayName ? 'bg-accent' : ''"
                        @click="store.selectedFileName = file.displayName"
                      >
                        <File class="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground">
                          {{ splitDisplayName(file.displayName).base }}
                        </span>
                        <!-- GitHub-style colour bar -->
                        <div class="flex shrink-0 gap-px">
                          <span
                            v-for="n in 5"
                            :key="n"
                            class="h-2 w-1.5 rounded-sm"
                            :class="
                              n <= additionBlocks(file.additions, file.deletions)
                                ? 'bg-emerald-500'
                                : 'bg-destructive'
                            "
                          />
                        </div>
                      </button>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </ScrollArea>
            </div>

            <!-- Diff view -->
            <div class="min-h-0 min-w-0 flex-1 overflow-auto">
              <div
                v-if="!store.selectedFileDiff"
                class="flex h-full items-center justify-center text-xs text-muted-foreground"
              >
                Select a file to view its diff.
              </div>

              <template v-else-if="diffData">
                <!-- GitHub-style file header bar -->
                <div class="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-1.5 backdrop-blur-sm">
                  <File class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span class="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {{ store.selectedFileDiff?.displayName }}
                  </span>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                      +{{ store.selectedFileDiff?.additions }}
                    </span>
                    <span class="font-mono text-[10px] text-destructive">
                      -{{ store.selectedFileDiff?.deletions }}
                    </span>
                  </div>
                </div>

                <DiffView
                  :data="diffData"
                  :extend-data="extendData"
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
                        @click="toggleComments(lineNumber); onUpdate()"
                      >
                        <MessageSquare class="h-3 w-3 shrink-0" />
                        {{ data.length }} comment{{ data.length === 1 ? "" : "s" }}
                      </Button>
                      <div v-if="isExpanded(lineNumber)" class="divide-y divide-border/60 border-t border-border/60">
                        <div
                          v-for="comment in data"
                          :key="comment.id"
                          class="flex gap-2 px-3 py-2"
                        >
                          <Avatar class="h-5 w-5 shrink-0">
                            <AvatarImage :src="comment.user.avatar_url" :alt="comment.user.login" />
                            <AvatarFallback class="text-[8px]">
                              {{ comment.user.login.slice(0, 2).toUpperCase() }}
                            </AvatarFallback>
                          </Avatar>
                          <div class="min-w-0 flex-1">
                            <div class="mb-0.5 flex items-center gap-1.5">
                              <span class="text-[10px] font-semibold text-foreground">{{ comment.user.login }}</span>
                              <span class="text-[9px] text-muted-foreground">{{ formatDate(comment.created_at) }}</span>
                            </div>
                            <p class="whitespace-pre-wrap text-[11px] leading-snug text-foreground">{{ comment.body }}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </DiffView>
              </template>
            </div>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
@reference "../../styles/globals.css";

:deep(.diff-view-wrapper) {
  font-size: 11px;
  min-width: 0;
}
</style>
