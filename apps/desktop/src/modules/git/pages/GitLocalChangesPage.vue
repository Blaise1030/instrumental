<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ContextQueueSelectionPopup from "@/modules/agent/components/contextQueue/ContextQueueSelectionPopup.vue";
import { useDomSelectionQueue } from "@/modules/contextQueue/useDomSelectionQueue";
import { extractDiffLineNumbers } from "@/modules/contextQueue/extractDiffLineNumbers";
import { injectContextToAgentKey } from "@/contextQueue/injectionKeys";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Trash2
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { CursorLoading } from "@/components/ui/cursor-loading";
import ScmBranchCombobox from "@/components/ScmBranchCombobox.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import GitDiffView from "@/modules/git/components/GitDiffView.vue";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useToast } from "@/hooks/useToast";
import { useScm } from "@/modules/git/hooks/useScm";
import { LruMap } from "@/modules/git/utils/lruMap";
import { fileEmojiForPath } from "@/utils/fileEmojiForPath";
import type {
  FileDiffScope,
  FileMergeSidesResult,
  RepoChangeKind,
  RepoStatusEntry,
} from "@shared/ipc";

/** Temporary product toggle: hide only local-LLM commit suggestion control. */
const SHOW_SUGGEST_COMMIT_BUTTON = false;

const DIFF_MERGE_CACHE_MAX = 24;

const { activeWorktree } = useActiveWorkspace();
const toast = useToast();
const queryClient = useQueryClient();

const cwd = computed(() => activeWorktree.value?.path ?? "");
const scm = useScm(cwd);

/** Template must use these — nested mutation refs are not auto-unwrapped on `scm.fetch.isPending`. */
const scmFetchPending = computed(() => scm.fetch.isPending.value);
const scmPushPending = computed(() => scm.push.isPending.value);
const scmCommitPending = computed(() => scm.commit.isPending.value);

const selectedScmPath = ref<string | null>(null);
const selectedScmScope = ref<"staged" | "unstaged" | null>(null);
const commitMessage = ref("");

const selectedMergeResult = ref<FileMergeSidesResult | null>(null);
const selectedDiffLoading = ref(false);
const diffCache = new LruMap<string, FileMergeSidesResult>(DIFF_MERGE_CACHE_MAX);

let selectedDiffSeq = 0;

function cacheKey(worktreePath: string, path: string, scope: FileDiffScope): string {
  return `${worktreePath}\0${scope}\0${path}`;
}

function mergeSidesEqual(a: FileMergeSidesResult | null, b: FileMergeSidesResult): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === "ok" && b.kind === "ok") return a.original === b.original && a.modified === b.modified;
  if (a.kind === "error" && b.kind === "error") return a.message === b.message;
  return a.kind === "binary";
}

async function loadSelectedMerge(): Promise<void> {
  const api = window.workspaceApi ?? null;
  const path = selectedScmPath.value;
  const scope = selectedScmScope.value;
  if (!api || !activeWorktree.value || !path || !scope) {
    selectedMergeResult.value = null;
    selectedDiffLoading.value = false;
    return;
  }
  const seq = ++selectedDiffSeq;
  const worktreePath = activeWorktree.value.path;
  const key = cacheKey(worktreePath, path, scope);
  const cached = diffCache.get(key);
  if (cached != null) {
    if (!mergeSidesEqual(selectedMergeResult.value, cached)) selectedMergeResult.value = cached;
    selectedDiffLoading.value = false;
    return;
  }
  if (!api.fileMergeSides) {
    selectedMergeResult.value = { kind: "error", message: "Update the desktop app to show merge diff in source control." };
    selectedDiffLoading.value = false;
    return;
  }
  const hasExisting = selectedMergeResult.value !== null;
  if (!hasExisting) selectedDiffLoading.value = true;
  try {
    const result = await api.fileMergeSides(worktreePath, path, scope);
    if (seq !== selectedDiffSeq || activeWorktree.value?.path !== worktreePath) return;
    diffCache.set(key, result);
    if (!mergeSidesEqual(selectedMergeResult.value, result)) selectedMergeResult.value = result;
  } catch (error) {
    if (seq !== selectedDiffSeq || activeWorktree.value?.path !== worktreePath) return;
    selectedMergeResult.value = { kind: "error", message: error instanceof Error ? error.message : "Could not load diff." };
  } finally {
    if (seq === selectedDiffSeq) selectedDiffLoading.value = false;
  }
}

watch(
  scm.repoStatus,
  (status) => {
    const hasCurrentSelection =
      selectedScmPath.value &&
      selectedScmScope.value &&
      status.some((entry) => {
        if (entry.path !== selectedScmPath.value) return false;
        return selectedScmScope.value === "staged"
          ? Boolean(entry.stagedKind)
          : Boolean(entry.unstagedKind || entry.isUntracked);
      });
    if (!hasCurrentSelection) {
      const firstStaged = status.find((e) => e.stagedKind);
      if (firstStaged) {
        selectedScmPath.value = firstStaged.path;
        selectedScmScope.value = "staged";
      } else {
        const firstUnstaged = status.find((e) => e.unstagedKind || e.isUntracked);
        selectedScmPath.value = firstUnstaged?.path ?? null;
        selectedScmScope.value = firstUnstaged ? "unstaged" : null;
      }
    }
    const worktreePath = activeWorktree.value?.path;
    if (worktreePath && selectedScmPath.value && selectedScmScope.value) {
      diffCache.delete(cacheKey(worktreePath, selectedScmPath.value, selectedScmScope.value));
    }
    void loadSelectedMerge();
  },
  { flush: "post" }
);

function refreshScmQuery(): void {
  void queryClient.invalidateQueries({ queryKey: ["git", "scm", cwd.value] });
}

/** Refetch SCM when the window regains focus (e.g. after terminal / external editor changes). */
function onWindowFocus(): void {
  if (!cwd.value) return;
  refreshScmQuery();
}

type SectionId = "staged" | "unstaged" | "untracked";
type PanelSectionId = "staged" | "changes";
type EntryScope = "staged" | "unstaged";

type ListEntry = {
  id: string;
  path: string;
  scope: EntryScope;
  statusLabel: string;
  muted?: string;
  sectionId: SectionId;
  pathBase: string;
  pathDir: string | null;
  pathDirShort: string | null;
};

function kindLetter(k: RepoChangeKind | null): string {
  if (!k) return "";
  switch (k) {
    case "modified":
      return "M";
    case "added":
    case "untracked":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "unmerged":
      return "U";
    default:
      return "?";
  }
}

function statusLabelForStaged(entry: RepoStatusEntry): string {
  return kindLetter(entry.stagedKind);
}

/** Working-tree row: index vs worktree when both differ (reference-style `↓M, M`). */
function statusLabelForChanges(entry: RepoStatusEntry): string {
  if (entry.isUntracked) return "A";
  const u = entry.unstagedKind;
  if (!u) return "";
  if (entry.stagedKind) {
    return `↓${kindLetter(entry.stagedKind)}, ${kindLetter(u)}`;
  }
  return kindLetter(u);
}

function statusColumnClass(entry: ListEntry): string {
  const base =
    "max-w-[min(8rem,28vw)] shrink-0 truncate text-end align-middle text-[10px] tabular-nums leading-none";
  if (entry.sectionId === "untracked" || entry.statusLabel === "A") {
    return `${base} text-emerald-800 dark:text-emerald-400`;
  }
  return `${base} text-muted-foreground`;
}

const props = withDefaults(
  defineProps<{
    projectId?: string | null;
    /** Allow in-panel branch checkout; off when the project uses linked worktrees (sidebar layout). */
    allowScmBranchSwitcher?: boolean;
    /** Active worktree label shown in the panel chrome. */
    contextLabel?: string | null;
    /** Passed by GitModuleLayout; SCM resolves cwd from active worktree. */
    cwd?: string;
    /** When true, show local LLM “Suggest” control (parent gates on IPC + staged changes). */
    suggestCommitAvailable?: boolean;
    /** Tooltip / `title` when suggest is disabled (e.g. WebGPU unavailable). */
    suggestCommitDisabledReason?: string | null;
    suggestCommitBusy?: boolean;
    /** `null` = WebGPU not probed yet; `false` = suggest disabled with explanation. */
    suggestCommitGpuOk?: boolean | null;
    suggestCommitTruncated?: boolean;
    showThreadSidebarExpand?: boolean;
  }>(),
  {
    projectId: null,
    allowScmBranchSwitcher: false,
    contextLabel: null,
    suggestCommitAvailable: false,
    suggestCommitDisabledReason: null,
    suggestCommitBusy: false,
    suggestCommitGpuOk: null,
    suggestCommitTruncated: false,
    showThreadSidebarExpand: false,
  }
);

const emit = defineEmits<{
  suggestCommit: [];
  openFileInEditor: [path: string];
  expandThreadSidebar: [];
}>();

/** Max characters for the directory prefix before we collapse with `…/` (filename stays full). */
const SCM_PATH_DIR_MAX_CHARS = 44;
/** Truncated directory line in the file list (reference UI). */
const SCM_LIST_DIR_MAX_CHARS = 36;

function splitRepoPath(path: string): { dir: string; base: string } {
  const norm = path.replace(/\\/g, "/").trim();
  if (!norm) return { dir: "", base: "" };
  const i = norm.lastIndexOf("/");
  if (i < 0) return { dir: "", base: norm };
  return { dir: norm.slice(0, i), base: norm.slice(i + 1) };
}

/** Keep folders nearest the file; prepend `…/` for omitted parents (leading truncation). */
function shortenDirPrefix(dir: string, maxLen: number): string {
  if (dir.length <= maxLen) return dir;
  const parts = dir.split("/").filter(Boolean);
  const picked: string[] = [];
  let used = 2;
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i]!;
    const next = used + seg.length + (picked.length > 0 ? 1 : 0);
    if (next > maxLen) break;
    picked.unshift(seg);
    used = next;
  }
  if (picked.length === 0) {
    const tail = dir.slice(Math.max(0, dir.length - (maxLen - 1)));
    return `…${tail}`;
  }
  return `…/${picked.join("/")}`;
}

function sectionEntries(section: SectionId): ListEntry[] {
  if (section === "staged") {
    return scm.repoStatus.value
      .filter((entry) => entry.stagedKind && !entry.isUntracked)
      .map((entry) => {
        const { dir, base } = splitRepoPath(entry.path);
        const dirShort = dir ? shortenDirPrefix(dir, SCM_LIST_DIR_MAX_CHARS) : null;
        return {
          id: `staged:${entry.path}`,
          path: entry.path,
          scope: "staged" as const,
          sectionId: "staged" as const,
          statusLabel: statusLabelForStaged(entry),
          muted: entry.originalPath ?? undefined,
          pathBase: base,
          pathDir: dir || null,
          pathDirShort: dirShort,
        };
      });
  }
  if (section === "unstaged") {
    return scm.repoStatus.value
      .filter((entry) => entry.unstagedKind && !entry.isUntracked)
      .map((entry) => {
        const { dir, base } = splitRepoPath(entry.path);
        const dirShort = dir ? shortenDirPrefix(dir, SCM_LIST_DIR_MAX_CHARS) : null;
        return {
          id: `unstaged:${entry.path}`,
          path: entry.path,
          scope: "unstaged" as const,
          sectionId: "unstaged" as const,
          statusLabel: statusLabelForChanges(entry),
          muted: entry.originalPath ?? undefined,
          pathBase: base,
          pathDir: dir || null,
          pathDirShort: dirShort,
        };
      });
  }
  return scm.repoStatus.value
    .filter((entry) => entry.isUntracked)
    .map((entry) => {
      const { dir, base } = splitRepoPath(entry.path);
      const dirShort = dir ? shortenDirPrefix(dir, SCM_LIST_DIR_MAX_CHARS) : null;
      return {
        id: `untracked:${entry.path}`,
        path: entry.path,
        scope: "unstaged" as const,
        sectionId: "untracked" as const,
        statusLabel: statusLabelForChanges(entry),
        pathBase: base,
        pathDir: dir || null,
        pathDirShort: dirShort,
      };
    });
}

const stagedEntries = computed(() => sectionEntries("staged"));
const unstagedEntries = computed(() => sectionEntries("unstaged"));
const untrackedEntries = computed(() => sectionEntries("untracked"));

const hasStagedChanges = computed(() =>
  scm.repoStatus.value.some((e) => Boolean(e.stagedKind) && !e.isUntracked)
);

const canCommit = computed(
  () =>
    !scmCommitPending.value &&
    hasStagedChanges.value &&
    Boolean(commitMessage.value.trim())
);

const suggestCommitDisabled = computed(() => {
  if (!props.suggestCommitAvailable) return true;
  if (props.suggestCommitGpuOk === false) return true;
  if (!hasStagedChanges.value) return true;
  return false;
});

const suggestCommitTitle = computed(() => {
  if (!props.suggestCommitAvailable) return undefined;
  if (props.suggestCommitGpuOk === false) {
    return props.suggestCommitDisabledReason ?? "WebGPU is not available. Commit suggestions require WebGPU.";
  }
  if (!hasStagedChanges.value) {
    return "Stage changes to generate a commit message.";
  }
  return "Suggest commit message from staged changes";
});

const commitExpanded = ref(false);
const actionsOpen = ref(false);
const collapsedSections = ref<Set<PanelSectionId>>(new Set());

function setSectionOpen(id: PanelSectionId, open: boolean): void {
  const next = new Set(collapsedSections.value);
  if (open) next.delete(id);
  else next.add(id);
  collapsedSections.value = next;
}

function onSectionCollapsibleOpen(id: PanelSectionId, open: boolean): void {
  setSectionOpen(id, open);
}

const allEntries = computed(() => [
  ...stagedEntries.value,
  ...unstagedEntries.value,
  ...untrackedEntries.value
]);

type ScmSectionRow = {
  id: PanelSectionId;
  label: string;
  entries: ListEntry[];
  showSeparatorAbove: boolean;
  showSectionCheckbox: boolean;
};

const scmSections = computed((): ScmSectionRow[] => {
  const rows: ScmSectionRow[] = [];
  const staged = stagedEntries.value;
  const unstaged = unstagedEntries.value;
  const untracked = untrackedEntries.value;
  const changeEntries = [...unstaged, ...untracked];

  if (staged.length > 0) {
    rows.push({
      id: "staged",
      label: "Staged Changes",
      entries: staged,
      showSeparatorAbove: false,
      showSectionCheckbox: true,
    });
  }
  if (changeEntries.length > 0) {
    rows.push({
      id: "changes",
      label: "Changes",
      entries: changeEntries,
      showSeparatorAbove: staged.length > 0,
      showSectionCheckbox: true,
    });
  }
  return rows;
});

const totalChanges = computed(
  () => stagedEntries.value.length + unstagedEntries.value.length + untrackedEntries.value.length
);

const selectedEntry = computed((): ListEntry | null => {
  if (!selectedScmPath.value || !selectedScmScope.value) return null;
  return (
    allEntries.value.find(
      (item) => item.path === selectedScmPath.value && item.scope === selectedScmScope.value
    ) ?? null
  );
});

/** Branch chrome for combobox (Vue Query SCM meta). */
const scmBranchLine = computed(() => scm.scmMeta.value.shortLabel);
const scmCurrentBranch = computed(() => scm.scmMeta.value.branch);

/** Path line: full basename + shortened parent path; `title` carries the full relative path. */
const scmPathHeader = computed(() => {
  const path = selectedEntry.value?.path ?? "";
  if (!path) return { full: "", base: "", dirLine: "", hasDir: false };
  const { dir, base } = splitRepoPath(path);
  const dirLine = dir ? shortenDirPrefix(dir, SCM_PATH_DIR_MAX_CHARS) : "";
  return { full: path, base, dirLine, hasDir: Boolean(dir) };
});

/** Entry row ids (`staged:path`, `untracked:path`, …) selected for bulk actions. */
const checkedEntryIds = ref<string[]>([]);

function isEntryChecked(id: string): boolean {
  return checkedEntryIds.value.includes(id);
}

const checkedStagedPaths = computed(() => {
  const ids = new Set(checkedEntryIds.value);
  const paths: string[] = [];
  for (const item of allEntries.value) {
    if (!ids.has(item.id) || item.sectionId !== "staged") continue;
    paths.push(item.path);
  }
  return paths;
});

const checkedWorktreePaths = computed(() => {
  const ids = new Set(checkedEntryIds.value);
  const paths: string[] = [];
  for (const item of allEntries.value) {
    if (!ids.has(item.id)) continue;
    if (item.sectionId === "unstaged" || item.sectionId === "untracked") paths.push(item.path);
  }
  return paths;
});

const canStageFromSelection = computed(
  () =>
    checkedWorktreePaths.value.length > 0 ||
    (selectedEntry.value != null && selectedEntry.value.scope === "unstaged")
);

const canUnstageFromSelection = computed(
  () =>
    checkedStagedPaths.value.length > 0 ||
    (selectedEntry.value != null && selectedEntry.value.scope === "staged")
);

const canDiscardFromSelection = computed(
  () =>
    checkedWorktreePaths.value.length > 0 ||
    (selectedEntry.value != null && selectedEntry.value.scope === "unstaged")
);

watch(
  () => allEntries.value,
  (items) => {
    const valid = new Set(items.map((i) => i.id));
    const next = checkedEntryIds.value.filter((id) => valid.has(id));
    if (next.length !== checkedEntryIds.value.length) checkedEntryIds.value = next;
  },
  { flush: "post" }
);

function entryIdsForPanelSection(panelId: PanelSectionId): string[] {
  if (panelId === "staged") return stagedEntries.value.map((e) => e.id);
  return [...unstagedEntries.value, ...untrackedEntries.value].map((e) => e.id);
}

function sectionSelectAllState(panelId: PanelSectionId): { checked: boolean; indeterminate: boolean } {
  const ids = entryIdsForPanelSection(panelId);
  if (ids.length === 0) return { checked: false, indeterminate: false };
  const selected = new Set(checkedEntryIds.value);
  const n = ids.filter((id) => selected.has(id)).length;
  if (n === 0) return { checked: false, indeterminate: false };
  if (n === ids.length) return { checked: true, indeterminate: false };
  return { checked: false, indeterminate: true };
}

function toggleSectionSelectAll(panelId: PanelSectionId): void {
  const ids = entryIdsForPanelSection(panelId);
  if (ids.length === 0) return;
  const { checked } = sectionSelectAllState(panelId);
  const next = new Set(checkedEntryIds.value);
  if (checked) {
    for (const id of ids) next.delete(id);
  } else {
    for (const id of ids) next.add(id);
  }
  checkedEntryIds.value = [...next];
}

function sectionCheckboxModel(panelId: PanelSectionId): boolean | "indeterminate" {
  const st = sectionSelectAllState(panelId);
  if (st.indeterminate) return "indeterminate";
  return st.checked;
}

function setEntryChecked(id: string, checked: boolean): void {
  const next = new Set(checkedEntryIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  checkedEntryIds.value = [...next];
}

const emptyMessage = computed(() => {
  if (totalChanges.value === 0) return "✨ Working tree is clean.";
  if (!selectedEntry.value) return "Select a changed file to inspect it.";
  return null;
});

function selectEntry(path: string, scope: EntryScope): void {
  selectedScmPath.value = path;
  selectedScmScope.value = scope;
  void loadSelectedMerge();
}

async function actionStageSelected(): Promise<void> {
  const bulk = checkedWorktreePaths.value;
  try {
    if (bulk.length > 0) {
      await scm.stagePaths.mutateAsync(bulk);
      return;
    }
    if (!selectedEntry.value || selectedEntry.value.scope !== "unstaged") return;
    await scm.stagePaths.mutateAsync([selectedEntry.value.path]);
  } catch (e) {
    toast.error("Stage failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}

async function actionUnstageSelected(): Promise<void> {
  const bulk = checkedStagedPaths.value;
  try {
    if (bulk.length > 0) {
      await scm.unstagePaths.mutateAsync(bulk);
      return;
    }
    if (!selectedEntry.value || selectedEntry.value.scope !== "staged") return;
    await scm.unstagePaths.mutateAsync([selectedEntry.value.path]);
  } catch (e) {
    toast.error("Unstage failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}

async function actionDiscardSelected(): Promise<void> {
  const bulk = checkedWorktreePaths.value;
  const run = async (paths: string[]): Promise<void> => {
    const label = paths.length === 1 ? paths[0]! : `${paths.length} files`;
    const confirmed = window.confirm(`Discard changes to ${label}?`);
    if (!confirmed) return;
    try {
      await scm.discardPaths.mutateAsync(paths);
    } catch (e) {
      toast.error("Discard failed", e instanceof Error ? e.message : "Something went wrong.");
    }
  };
  if (bulk.length > 0) {
    await run(bulk);
    return;
  }
  if (!selectedEntry.value || selectedEntry.value.scope !== "unstaged") return;
  await run([selectedEntry.value.path]);
}

async function handleCommit(): Promise<void> {
  const message = commitMessage.value.trim();
  if (!message) return;
  try {
    await scm.commit.mutateAsync(message);
    commitMessage.value = "";
  } catch (e) {
    toast.error("Commit failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}

async function handleFetch(): Promise<void> {
  try {
    await scm.fetch.mutateAsync();
  } catch (e) {
    toast.error("Fetch failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}

async function handlePush(): Promise<void> {
  try {
    await scm.push.mutateAsync();
    toast.success("Push succeeded", `Branch \`${scm.scmMeta.value.branch}\` was pushed to the remote.`);
  } catch (e) {
    toast.error("Push failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}

function handleStageAll(): void {
  scm.stageAll.mutate(undefined, {
    onError: (e) =>
      toast.error("Stage all failed", e instanceof Error ? e.message : "Something went wrong."),
  });
}

function handleUnstageAll(): void {
  scm.unstageAll.mutate(undefined, {
    onError: (e) =>
      toast.error("Unstage all failed", e instanceof Error ? e.message : "Something went wrong."),
  });
}

function handleDiscardAll(): void {
  const confirmed = window.confirm("Discard all working tree changes?");
  if (!confirmed) return;
  scm.discardAll.mutate(undefined, {
    onError: (e) =>
      toast.error("Discard all failed", e instanceof Error ? e.message : "Something went wrong."),
  });
}

watch(
  () => allEntries.value,
  async (items) => {
    if (items.length === 0) return;
    if (selectedEntry.value) return;
    const firstEntry = items[0];
    if (!firstEntry) return;
    await nextTick();
    // Parent may apply selection in the same flush as repoStatus; avoid duplicate emits.
    if (selectedEntry.value) return;
    selectEntry(firstEntry.path, firstEntry.scope);
  },
  { immediate: true, flush: "post" }
);

onMounted(() => {
  window.addEventListener("focus", onWindowFocus);
});

onBeforeUnmount(() => {
  window.removeEventListener("focus", onWindowFocus);
});

const injectContextToAgent = inject(injectContextToAgentKey, undefined);
const diffContainerRef = ref<HTMLElement | null>(null);
const commitTextareaRef = ref<HTMLElement | null>(null);

const diffQueue = useDomSelectionQueue({
  source: "diff",
  getFilePath: () => selectedEntry.value?.path ?? null,
  getLineNumbers: extractDiffLineNumbers,
});

const commitQueue = useDomSelectionQueue({
  source: "file",
  getFilePath: () => null,
});

async function onDiffSendToAgent(): Promise<void> {
  if (!injectContextToAgent) return;
  let item;
  try { item = diffQueue.buildItem(); } catch { return; }
  await injectContextToAgent([item]);
  diffQueue.dismiss();
}

async function onCommitSendToAgent(): Promise<void> {
  if (!injectContextToAgent) return;
  let item;
  try { item = commitQueue.buildItem(); } catch { return; }
  await injectContextToAgent([item]);
  commitQueue.dismiss();
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
  <SidebarProvider
    class="flex h-full border-t min-h-0 w-full flex-1 flex-row overflow-hidden text-[11px] text-foreground"
    :keyboard-shortcut="false"
    :persist-cookie="false"
  >
    <SidebarInset class="min-h-0 min-w-0 flex-1 overflow-hidden">
    <div ref="diffContainerRef" class="flex min-h-0 flex-1 flex-col overflow-hidden" @mouseup="diffQueue.onMouseUp">
    <GitDiffView
      :path-header="scmPathHeader"
      :file-path="selectedEntry?.path ?? ''"
      :file-scope="selectedEntry?.scope ?? null"
      :loading="selectedDiffLoading"
      :empty-message="emptyMessage"
      :merge-result="selectedMergeResult"
      @open-file-in-editor="emit('openFileInEditor', $event)"
    >
      <template #header-leading>
        <Button
          v-if="showThreadSidebarExpand"
          data-testid="scm-thread-sidebar-expand"
          variant="outline"
          size="icon-sm"
          class="ml-20 shrink-0"
          title="Show thread sidebar"
          aria-label="Show thread sidebar"
          @click="emit('expandThreadSidebar')"
        >
          <PanelLeftOpen class="h-4 w-4" aria-hidden="true" />
          <span class="sr-only">Show thread sidebar</span>
        </Button>
      </template>
    </GitDiffView>
    </div>
    </SidebarInset>

    <Sidebar
      side="right"
      collapsible="none"
      class="h-full min-h-0 w-[280px] shrink-0 border-l border-border/50 dark:border-sidebar-border"
    >
      <SidebarHeader
        class="flex h-9 flex-row items-center border-b border-sidebar-border px-2 py-0"
        aria-label="Source control"
      >
        <div class="flex w-full items-center justify-between gap-1.5">
          <div class="flex min-w-0 items-center gap-1.5">
            <p class="text-[10px] font-medium leading-none text-sidebar-foreground">
              {{ totalChanges.toLocaleString() }} changes
            </p>            
          </div>
          <!-- Actions dropdown -->
          <DropdownMenu v-model:open="actionsOpen">
            <DropdownMenuTrigger as-child>
              <Button
                size="xs"
                variant="secondary"
                class="h-6 gap-1 px-2 text-[10px]"
              >
                Actions
                <ChevronDown class="h-3 w-3" :class="actionsOpen ? 'rotate-180' : ''" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="min-w-[180px]">
              <DropdownMenuItem
                :disabled="!canStageFromSelection"
                class="text-xs"
                @select="actionStageSelected"
              >
                <Plus class="h-3 w-3 shrink-0" />
                Stage Selected
              </DropdownMenuItem>
              <DropdownMenuItem
                :disabled="!canUnstageFromSelection"
                class="text-xs"
                @select="actionUnstageSelected"
              >
                <Minus class="h-3 w-3 shrink-0" />
                Unstage Selected
              </DropdownMenuItem>
              <DropdownMenuItem
                :disabled="!canDiscardFromSelection"
                variant="destructive"
                class="text-xs"
                @select="actionDiscardSelected"
              >
                <RotateCcw class="h-3 w-3 shrink-0" />
                Discard Selected
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-xs" @select="handleStageAll">
                <ChevronsUp class="h-3 w-3 shrink-0" />
                Stage All
              </DropdownMenuItem>
              <DropdownMenuItem class="text-xs" @select="handleUnstageAll">
                <ChevronsDown class="h-3 w-3 shrink-0" />
                Unstage All
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" class="text-xs" @select="handleDiscardAll">
                <Trash2 class="h-3 w-3 shrink-0" />
                Discard All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <template v-if="totalChanges === 0">
          <div class="px-3 py-6 text-center text-xs text-muted-foreground">
            ✨ Working tree is clean.
          </div>
        </template>
        <template v-else>
          <template v-for="section in scmSections" :key="section.id">
            <SidebarSeparator v-if="section.showSeparatorAbove" />
            <Collapsible
              :open="!collapsedSections.has(section.id)"
              @update:open="(open) => onSectionCollapsibleOpen(section.id, open)"
            >
              <SidebarGroup class="px-1 py-0.5">
                <div class="flex items-center gap-2 pe-1 ps-1">
                  <CollapsibleTrigger as-child class="min-w-0 flex-1">
                    <SidebarMenuButton size="sm" class="gap-1.5">
                      <ChevronDown
                        class="size-3 shrink-0 transition-transform duration-150"
                        :class="collapsedSections.has(section.id) ? '-rotate-90' : ''"
                      />
                      <span class="truncate text-[11px] font-medium text-sidebar-foreground">{{
                        section.label
                      }}</span>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <span
                    class="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-border px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground"
                  >{{ section.entries.length }}</span>
                  <Checkbox
                    v-if="section.showSectionCheckbox"
                    :model-value="sectionCheckboxModel(section.id)"
                    :aria-label="
                      section.id === 'staged'
                        ? 'Select all staged files'
                        : 'Select all files in Changes'
                    "
                    @update:model-value="() => toggleSectionSelectAll(section.id)"
                    @click.stop
                  />
                </div>
                <CollapsibleContent>
                  <SidebarGroupContent class="px-0">
                    <SidebarMenu>
                      <SidebarMenuItem v-for="entry in section.entries" :key="entry.id">
                        <SidebarMenuButton
                          class="min-w-0 cursor-pointer gap-2"
                          :title="entry.path"
                          @click.stop="selectEntry(entry.path, entry.scope)"
                          :is-active="
                            selectedScmPath === entry.path && selectedScmScope === entry.scope
                          "
                        >
                          <span
                            class="inline-flex size-3.5 shrink-0 items-center justify-center text-[12px] leading-none"
                            aria-hidden="true"
                          >{{ fileEmojiForPath(entry.path) }}</span>
                          <div class="grid min-w-0 flex-1 gap-0 leading-tight">
                            <span class="truncate text-[11px] font-medium text-foreground">{{
                              entry.pathBase
                            }}</span>
                            <span
                              v-if="entry.pathDirShort"
                              class="truncate text-[10px] text-muted-foreground"
                            >{{ entry.pathDirShort }}</span>
                          </div>
                          <span :class="statusColumnClass(entry)">{{ entry.statusLabel }}</span>
                        </SidebarMenuButton>
                        <SidebarMenuAction :show-on-hover="false" as-child>
                          <div @click.stop>
                            <Checkbox
                              :model-value="isEntryChecked(entry.id)"
                              :aria-label="`Select ${entry.path} for bulk actions`"
                              @update:model-value="
                                (v) => setEntryChecked(entry.id, v === true)
                              "
                            />
                          </div>
                        </SidebarMenuAction>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          </template>
        </template>
      </SidebarContent>

      <SidebarFooter class="shrink-0 gap-0 border-t bg-sidebar border-sidebar-border p-0">
        <div class="flex items-center justify-between gap-2 px-2 py-1">
          <ScmBranchCombobox
            :branch-line="scmBranchLine"
            :current-branch="scmCurrentBranch"
            :project-id="props.projectId ?? ''"
            :cwd="activeWorktree?.path ?? ''"
            :switcher-enabled="props.allowScmBranchSwitcher"
            @branch-changed="refreshScmQuery"
          />
          <div class="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="xs"
              variant="outline"              
              :disabled="scmFetchPending || scmPushPending"
              aria-label="Fetch from remote"
              @click="handleFetch()"
            >
              <CursorLoading
                v-if="scmFetchPending"
                class="inline-block h-2.5 w-2.5 min-h-0 shrink-0 overflow-hidden"
                aria-hidden="true"
              />
              <ArrowDownToLine
                v-else
                class="h-2.5 w-2.5 shrink-0 opacity-80"
                :stroke-width="2"
                aria-hidden="true"
              />
              Fetch
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"              
              :disabled="scmPushPending || scmFetchPending"
              aria-label="Push current branch to remote"
              title="Push current branch (upstream must be set)"
              @click="handlePush()"
            >
              <CursorLoading
                v-if="scmPushPending"
                class="inline-block h-2.5 w-2.5 min-h-0 shrink-0 overflow-hidden"
                aria-hidden="true"
              />
              <ArrowUpFromLine
                v-else
                class="h-2.5 w-2.5 shrink-0 opacity-80"
                :stroke-width="2"
                aria-hidden="true"
              />
              Push
            </Button>
          </div>
        </div>

        <div class="relative">
          <textarea
            ref="commitTextareaRef"
            v-model="commitMessage"
            @mouseup="commitQueue.onMouseUp"
            rows="4"
            placeholder="Enter commit message"
            aria-label="Commit message draft"
            class="w-full resize-none rounded-none border-0 bg-transparent py-1.5 pl-2 pr-7 font-mono text-[10px] leading-snug text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none"
            :class="commitExpanded ? 'min-h-[11rem]' : 'min-h-[4.5rem]'"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="absolute top-1 right-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            :title="commitExpanded ? 'Shrink editor' : 'Expand editor'"
            :aria-label="commitExpanded ? 'Shrink commit message editor' : 'Expand commit message editor'"
            @click="commitExpanded = !commitExpanded"
          >
            <Minimize2 v-if="commitExpanded" class="h-3 w-3" aria-hidden="true" />
            <Maximize2 v-else class="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
        <div class="flex items-center justify-between px-2 py-1.5">
          <div class="flex items-center overflow-hidden">            
            <Button
              v-if="SHOW_SUGGEST_COMMIT_BUTTON && suggestCommitAvailable"
              data-testid="scm-suggest-commit"
              type="button"
              variant="outline"
              size="icon-sm"
              class="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              :disabled="suggestCommitDisabled || suggestCommitBusy"
              :title="suggestCommitTitle"
              aria-label="Suggest commit message from staged changes"
              @click="emit('suggestCommit')"
            >
              <CursorLoading
                v-if="suggestCommitBusy"
                class="inline-block h-3 w-3 min-h-0 shrink-0 overflow-hidden"
                aria-hidden="true"
              />
              <span v-else class="text-xs">✨</span>
            </Button>
            <p
              v-if="suggestCommitTruncated"
              class="truncate text-[9px] leading-tight text-muted-foreground"
            >
              Staged diff was truncated for speed.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="default"            
            :disabled="!canCommit"
            aria-label="Commit staged changes"
            @click="handleCommit()"
          >
            <CursorLoading
              v-if="scmCommitPending"
              class="mr-1 inline-block h-3 w-3 min-h-0 shrink-0 overflow-hidden"
              aria-hidden="true"
            />
            Commit
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  </SidebarProvider>
  <ContextQueueSelectionPopup
    :visible="diffQueue.visible.value"
    :anchor="diffQueue.anchor.value"
    @send-to-agent="onDiffSendToAgent"
    @dismiss="diffQueue.dismiss"
  />
  <ContextQueueSelectionPopup
    :visible="commitQueue.visible.value"
    :anchor="commitQueue.anchor.value"
    @send-to-agent="onCommitSendToAgent"
    @dismiss="commitQueue.dismiss"
  />
  </div>
</template>

<style scoped>
/* @reference "../styles/globals.css"; */
</style>
