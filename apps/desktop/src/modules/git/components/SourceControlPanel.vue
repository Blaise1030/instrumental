<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  FileText,
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
import MonacoDiffEditor from "@/components/MonacoDiffEditor.vue";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import { useToast } from "@/composables/useToast";
import { useScm } from "@/modules/git/hooks/useScm";
import { LruMap } from "@/lib/lruMap";
import type { FileDiffScope, FileMergeSidesResult } from "@shared/ipc";

const SCM_DIFF_LAYOUT_KEY = "instrument.scmDiffLayout";
type ScmDiffLayout = "split" | "unified";
/** Temporary product toggle: hide only local-LLM commit suggestion control. */
const SHOW_SUGGEST_COMMIT_BUTTON = false;

function readScmDiffLayout(): ScmDiffLayout {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SCM_DIFF_LAYOUT_KEY) === "unified"
      ? "unified"
      : "split";
  } catch {
    return "split";
  }
}

const scmDiffLayout = ref<ScmDiffLayout>(readScmDiffLayout());

watch(scmDiffLayout, (v) => {
  try {
    localStorage.setItem(SCM_DIFF_LAYOUT_KEY, v);
  } catch {
    /* ignore quota / private mode */
  }
});

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

const mergeResultOk = computed(() =>
  selectedMergeResult.value?.kind === "ok" ? selectedMergeResult.value : null
);

type SectionId = "staged" | "unstaged" | "untracked";
type EntryScope = "staged" | "unstaged";
type FlatItem =
  | { kind: "section"; id: SectionId; label: string; count: number; majorDividerAbove?: boolean }
  | {
      kind: "entry";
      id: string;
      path: string;
      scope: EntryScope;
      badge: string;
      muted?: string;
      sectionId: SectionId;
    };

const props = withDefaults(
  defineProps<{
    projectId?: string | null;
    /** Allow in-panel branch checkout; off when the project uses linked worktrees (sidebar layout). */
    allowScmBranchSwitcher?: boolean;
    /** Active worktree label shown in the panel chrome. */
    contextLabel?: string | null;
    /** When true, show local LLM “Suggest” control (parent gates on IPC + staged changes). */
    suggestCommitAvailable?: boolean;
    /** Tooltip / `title` when suggest is disabled (e.g. WebGPU unavailable). */
    suggestCommitDisabledReason?: string | null;
    suggestCommitBusy?: boolean;
    /** `null` = WebGPU not probed yet; `false` = suggest disabled with explanation. */
    suggestCommitGpuOk?: boolean | null;
    suggestCommitTruncated?: boolean;
    showThreadSidebarExpand?: boolean;
    /** Thread id for context-queue capture in the diff viewer. */
    activeThreadId?: string | null;
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
    activeThreadId: null
  }
);

const emit = defineEmits<{
  suggestCommit: [];
  openFileInEditor: [path: string];
  expandThreadSidebar: [];
}>();

/** Max characters for the directory prefix before we collapse with `…/` (filename stays full). */
const SCM_PATH_DIR_MAX_CHARS = 44;

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

/** Fixed row heights for virtualized sidebar (must match template layout). */
const SECTION_ROW_PX = 22;
const ENTRY_ROW_PX = 32;
/** Extra top padding + border lane after staged block, before working tree. */
const SECTION_MAJOR_GAP_PX = 10;
const sidebarScrollRef = ref<HTMLElement | null>(null);
const sidebarViewportHeight = ref(320);
const sidebarScrollTop = ref(0);
let sidebarResizeObserver: ResizeObserver | null = null;

function sectionEntries(section: SectionId): FlatItem[] {
  if (section === "staged") {
    return scm.repoStatus.value
      .filter((entry) => entry.stagedKind && !entry.isUntracked)
      .map((entry) => ({
        kind: "entry" as const,
        id: `staged:${entry.path}`,
        path: entry.path,
        scope: "staged" as const,
        sectionId: "staged" as const,
        badge: entry.stagedKind === "renamed" ? "R" : entry.stagedKind?.slice(0, 1).toUpperCase() ?? "M",
        muted: entry.originalPath ?? undefined
      }));
  }
  if (section === "unstaged") {
    return scm.repoStatus.value
      .filter((entry) => entry.unstagedKind && !entry.isUntracked)
      .map((entry) => ({
        kind: "entry" as const,
        id: `unstaged:${entry.path}`,
        path: entry.path,
        scope: "unstaged" as const,
        sectionId: "unstaged" as const,
        badge:
          entry.unstagedKind === "renamed" ? "R" : entry.unstagedKind?.slice(0, 1).toUpperCase() ?? "M",
        muted: entry.originalPath ?? undefined
      }));
  }
  return scm.repoStatus.value
    .filter((entry) => entry.isUntracked)
    .map((entry) => ({
      kind: "entry" as const,
      id: `untracked:${entry.path}`,
      path: entry.path,
      scope: "unstaged" as const,
      sectionId: "untracked" as const,
      badge: "U"
    }));
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
const collapsedSections = ref<Set<SectionId>>(new Set());

function toggleSection(id: SectionId): void {
  const next = new Set(collapsedSections.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedSections.value = next;
}

const flatItems = computed<FlatItem[]>(() => {
  const out: FlatItem[] = [];
  const sections: [SectionId, string, FlatItem[]][] = [
    ["staged", "Staged", stagedEntries.value],
    ["unstaged", "Unstaged", unstagedEntries.value],
    ["untracked", "Untracked", untrackedEntries.value]
  ];
  let placedStagedBlock = false;
  let needMajorDividerBeforeNextSection = false;
  for (const [id, label, entries] of sections) {
    if (entries.length === 0) continue;
    const collapsed = collapsedSections.value.has(id);
    if (id === "staged") {
      out.push({ kind: "section", id, label, count: entries.length });
      if (!collapsed) out.push(...entries);
      placedStagedBlock = true;
      needMajorDividerBeforeNextSection = true;
      continue;
    }
    const majorDividerAbove = needMajorDividerBeforeNextSection && placedStagedBlock;
    needMajorDividerBeforeNextSection = false;
    out.push({ kind: "section", id, label, count: entries.length, majorDividerAbove });
    if (!collapsed) out.push(...entries);
  }
  return out;
});

const totalChanges = computed(
  () => stagedEntries.value.length + unstagedEntries.value.length + untrackedEntries.value.length
);

const selectedEntry = computed(() => {
  if (!selectedScmPath.value || !selectedScmScope.value) return null;
  const found = flatItems.value.find(
    (item) =>
      item.kind === "entry" &&
      item.path === selectedScmPath.value &&
      item.scope === selectedScmScope.value
  );
  return found?.kind === "entry" ? found : null;
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

function toggleEntryChecked(id: string): void {
  const cur = checkedEntryIds.value;
  checkedEntryIds.value = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
}

const checkedStagedPaths = computed(() => {
  const ids = new Set(checkedEntryIds.value);
  const paths: string[] = [];
  for (const item of flatItems.value) {
    if (item.kind !== "entry" || !ids.has(item.id) || item.sectionId !== "staged") continue;
    paths.push(item.path);
  }
  return paths;
});

const checkedWorktreePaths = computed(() => {
  const ids = new Set(checkedEntryIds.value);
  const paths: string[] = [];
  for (const item of flatItems.value) {
    if (item.kind !== "entry" || !ids.has(item.id)) continue;
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
  () => flatItems.value,
  (items) => {
    const valid = new Set(
      items.filter((i): i is Extract<FlatItem, { kind: "entry" }> => i.kind === "entry").map((i) => i.id)
    );
    const next = checkedEntryIds.value.filter((id) => valid.has(id));
    if (next.length !== checkedEntryIds.value.length) checkedEntryIds.value = next;
  },
  { flush: "post" }
);

function entryIdsForSection(sectionId: SectionId): string[] {
  if (sectionId === "staged") return stagedEntries.value.map((e) => e.id);
  if (sectionId === "unstaged") return unstagedEntries.value.map((e) => e.id);
  return untrackedEntries.value.map((e) => e.id);
}

function sectionSelectAllState(sectionId: SectionId): { checked: boolean; indeterminate: boolean } {
  const ids = entryIdsForSection(sectionId);
  if (ids.length === 0) return { checked: false, indeterminate: false };
  const selected = new Set(checkedEntryIds.value);
  const n = ids.filter((id) => selected.has(id)).length;
  if (n === 0) return { checked: false, indeterminate: false };
  if (n === ids.length) return { checked: true, indeterminate: false };
  return { checked: false, indeterminate: true };
}

function toggleSectionSelectAll(sectionId: SectionId): void {
  const ids = entryIdsForSection(sectionId);
  if (ids.length === 0) return;
  const { checked } = sectionSelectAllState(sectionId);
  const next = new Set(checkedEntryIds.value);
  if (checked) {
    for (const id of ids) next.delete(id);
  } else {
    for (const id of ids) next.add(id);
  }
  checkedEntryIds.value = [...next];
}

/** Section-header “select all” inputs (virtualized); sync `indeterminate` after selection changes. */
const sectionSelectAllInputs = new Map<SectionId, HTMLInputElement>();

/**
 * Stable ref callbacks per section — inline `(el) => bind(...)` creates a new function every render and
 * makes Vue unbind/rebind refs each patch, which can throw `Cannot set properties of null (setting '__vnode')`.
 */
const sectionSelectAllInputBinders = new Map<SectionId, (el: unknown) => void>();

function getSectionSelectAllInputRef(sectionId: SectionId): (el: unknown) => void {
  let binder = sectionSelectAllInputBinders.get(sectionId);
  if (!binder) {
    binder = (el: unknown) => bindSectionSelectAllInput(sectionId, el);
    sectionSelectAllInputBinders.set(sectionId, binder);
  }
  return binder;
}

function bindSectionSelectAllInput(sectionId: SectionId, el: unknown): void {
  const input = el instanceof HTMLInputElement ? el : null;
  if (input) {
    sectionSelectAllInputs.set(sectionId, input);
    void nextTick(() => {
      const cur = sectionSelectAllInputs.get(sectionId);
      if (!cur?.isConnected) return;
      const st = sectionSelectAllState(sectionId);
      cur.checked = st.checked;
      cur.indeterminate = st.indeterminate;
    });
  } else {
    sectionSelectAllInputs.delete(sectionId);
  }
}

function syncAllSectionSelectAllInputs(): void {
  for (const [sectionId, el] of [...sectionSelectAllInputs.entries()]) {
    if (!el.isConnected) {
      sectionSelectAllInputs.delete(sectionId);
      continue;
    }
    const st = sectionSelectAllState(sectionId);
    el.checked = st.checked;
    el.indeterminate = st.indeterminate;
  }
}

watch(
  () => [checkedEntryIds.value.join("\0"), stagedEntries.value.length, unstagedEntries.value.length, untrackedEntries.value.length] as const,
  () => {
    void nextTick(() => syncAllSectionSelectAllInputs());
  }
);

const sidebarMetrics = computed(() => {
  let offset = 0;
  return flatItems.value.map((item) => {
    const height =
      item.kind === "section"
        ? SECTION_ROW_PX + (item.majorDividerAbove ? SECTION_MAJOR_GAP_PX : 0)
        : ENTRY_ROW_PX;
    const metric = { item, top: offset, height };
    offset += height;
    return metric;
  });
});

const sidebarContentHeight = computed(() => {
  const last = sidebarMetrics.value[sidebarMetrics.value.length - 1];
  return last ? last.top + last.height : 0;
});

const visibleSidebarItems = computed(() => {
  const scrollTop = sidebarScrollTop.value;
  const viewBottom = scrollTop + sidebarViewportHeight.value;
  return sidebarMetrics.value.filter((metric) => {
    const itemBottom = metric.top + metric.height;
    return itemBottom >= scrollTop - 240 && metric.top <= viewBottom + 240;
  });
});

const emptyMessage = computed(() => {
  if (totalChanges.value === 0) return "✨ Working tree is clean.";
  if (!selectedEntry.value) return "Select a changed file to inspect it.";
  return null;
});

function onSidebarScroll(): void {
  sidebarScrollTop.value = sidebarScrollRef.value?.scrollTop ?? 0;
}

function sectionHeaderClasses(item: Extract<FlatItem, { kind: "section" }>): string {
  const base =
    "absolute inset-x-0 flex flex-col border-b bg-background/95 backdrop-blur";
  const staged =
    "border-amber-500/25 bg-amber-500/10 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-50/95";
  const unstaged =
    "border-sky-500/20 bg-sky-500/[0.07] text-sky-950/90 dark:border-sky-500/15 dark:bg-sky-500/10 dark:text-sky-50/90";
  const untracked =
    "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/12 dark:text-emerald-50/90";
  if (item.id === "staged") return `${base} ${staged}`;
  if (item.id === "unstaged") return `${base} ${unstaged}`;
  return `${base} ${untracked}`;
}

function entryRowClasses(sectionId: SectionId): string {
  if (sectionId === "staged") {
    return "border-b border-amber-500/15 bg-amber-500/[0.05] hover:bg-amber-500/12 dark:border-amber-500/10";
  }
  if (sectionId === "unstaged") {
    return "border-b border-sky-500/10 bg-sky-500/[0.04] hover:bg-sky-500/10 dark:border-sky-500/10 dark:bg-sky-500/[0.06]";
  }
  return "border-b border-emerald-500/15 bg-emerald-500/[0.05] hover:bg-emerald-500/12 dark:border-emerald-500/10";
}

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
  () => flatItems.value,
  async (items) => {
    if (items.length === 0) return;
    if (selectedEntry.value) return;
    const firstEntry = items.find((item) => item.kind === "entry");
    if (!firstEntry || firstEntry.kind !== "entry") return;
    await nextTick();
    // Parent may apply selection in the same flush as repoStatus; avoid duplicate emits.
    if (selectedEntry.value) return;
    selectEntry(firstEntry.path, firstEntry.scope);
  },
  { immediate: true, flush: "post" }
);

onMounted(() => {
  if (sidebarScrollRef.value) {
    sidebarViewportHeight.value = sidebarScrollRef.value.clientHeight;
    if (typeof ResizeObserver !== "undefined") {
      sidebarResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        sidebarViewportHeight.value = entry.contentRect.height;
      });
      sidebarResizeObserver.observe(sidebarScrollRef.value);
    }
  }
});

onBeforeUnmount(() => {
  sidebarResizeObserver?.disconnect();
  sidebarResizeObserver = null;
});
</script>

<template>
  <SidebarProvider
    class="flex h-full border-t min-h-0 w-full flex-1 flex-row overflow-hidden bg-background text-[11px] text-foreground"
    :keyboard-shortcut="false"
    :persist-cookie="false"
  >
    <SidebarInset class="min-h-0 min-w-0 flex-1 overflow-hidden">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header class="flex h-9 min-w-0 items-center gap-2 overflow-x-auto border-b border-border px-2 whitespace-nowrap">
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
        <div
          class="min-w-0 flex-1 font-mono text-[10px] leading-tight"
          :title="scmPathHeader.full || undefined"
        >
          <template v-if="scmPathHeader.full">
            <p class="flex min-w-0 items-baseline justify-start gap-0">
              <span
                v-if="scmPathHeader.hasDir"
                class="min-w-0 shrink truncate text-muted-foreground"
              >{{ scmPathHeader.dirLine }}/</span>
              <span class="shrink-0 font-medium text-foreground">{{ scmPathHeader.base }}</span>
            </p>
          </template>
          <p v-else class="text-muted-foreground">No file selected</p>
          <p class="sr-only">
            File path: {{ scmPathHeader.full || "none" }}.
            {{
              selectedEntry?.scope === "staged"
                ? "Staged changes."
                : selectedEntry?.scope === "unstaged"
                  ? "Working tree changes."
                  : "Diff."
            }}
          </p>
        </div>
        <div
          v-if="selectedEntry && selectedMergeResult?.kind === 'ok'"
          class="flex shrink-0 items-center gap-px rounded-md border border-border p-px"
          role="group"
          aria-label="Diff layout"
        >
          <Button
            type="button"
            size="xs"
            :variant="scmDiffLayout === 'split' ? 'default' : 'ghost'"
            class="h-6 rounded-sm px-2 text-[10px]"
            title="Two columns: original on the left, working copy on the right"
            :aria-pressed="scmDiffLayout === 'split'"
            @click="scmDiffLayout = 'split'"
          >
            Split
          </Button>
          <Button
            type="button"
            size="xs"
            :variant="scmDiffLayout === 'unified' ? 'default' : 'ghost'"
            class="h-6 rounded-sm px-2 text-[10px]"
            title="Single column: removed lines appear above the current file"
            :aria-pressed="scmDiffLayout === 'unified'"
            @click="scmDiffLayout = 'unified'"
          >
            Unified
          </Button>
        </div>
        <Button
          v-if="selectedEntry"
          type="button"
          size="xs"
          variant="outline"
          class="h-6 shrink-0 gap-1 px-2 text-[10px]"
          title="Open this file in the Files tab (current worktree)"
          aria-label="Go to file in editor"
          @click="emit('openFileInEditor', selectedEntry.path)"
        >
          <FileText class="h-3 w-3 shrink-0" aria-hidden="true" />
          Go to file
        </Button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div v-if="selectedDiffLoading" class="flex min-h-0 flex-1 flex-col">
          <CursorLoading class="min-h-0 flex-1" />
        </div>
        <div
          v-else-if="emptyMessage"
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          role="status"
          aria-live="polite"
        >
          <span class="select-none text-4xl leading-none" aria-hidden="true">✨</span>
          <p class="max-w-xs text-xs text-muted-foreground">{{ emptyMessage.replace('✨ ', '') }}</p>
        </div>
        <div
          v-else-if="selectedMergeResult?.kind === 'error'"
          class="flex h-full items-center justify-center px-4 text-center text-[11px] text-destructive"
          role="alert"
        >
          {{ selectedMergeResult?.kind === 'error' ? selectedMergeResult.message : '' }}
        </div>
        <div
          v-else-if="selectedMergeResult?.kind === 'binary'"
          class="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground"
          role="status"
        >
          Binary file — side-by-side text diff is not shown.
        </div>
        <div v-else-if="selectedMergeResult?.kind === 'ok'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <p
            class="shrink-0 border-b border-border bg-muted/15 px-2 py-1 font-mono text-[10px] leading-tight text-muted-foreground"
          >
            <template v-if="scmDiffLayout === 'split'">
              <span class="font-medium text-foreground">{{ mergeResultOk?.originalLabel }}</span>
              · left —
              <span class="font-medium text-foreground">{{ mergeResultOk?.modifiedLabel }}</span>
              · right
            </template>
            <template v-else>
              Unified —
              <span class="font-medium text-foreground">{{ mergeResultOk?.originalLabel }}</span>
              vs
              <span class="font-medium text-foreground">{{ mergeResultOk?.modifiedLabel }}</span>
            </template>
          </p>
          <MonacoDiffEditor
            class="min-h-0 flex-1"
            :layout="scmDiffLayout"
            :original="mergeResultOk?.original ?? ''"
            :modified="mergeResultOk?.modified ?? ''"
            :file-path="selectedEntry?.path ?? ''"
            :worktree-path="activeWorktree?.path ?? null"
            :active-thread-id="props.activeThreadId"
          />
        </div>
      </div>
    </div>
    </SidebarInset>

    <Sidebar
      side="right"
      collapsible="none"
      class="h-full min-h-0 w-[270px] shrink-0 border-s border-sidebar-border"
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

      <SidebarContent class="min-h-0 flex-1 overflow-hidden px-0 py-0">
      <div
        ref="sidebarScrollRef"
        class="min-h-0 flex-1 overflow-y-auto"
        @scroll="onSidebarScroll"
      >
        <div :style="{ height: `${sidebarContentHeight}px`, position: 'relative' }">
          <template v-for="metric in visibleSidebarItems" :key="metric.item.kind === 'section' ? metric.item.id : metric.item.id">
            <div
              v-if="metric.item.kind === 'section'"
              :class="sectionHeaderClasses(metric.item)"
              :style="{ top: `${metric.top}px`, height: `${metric.height}px` }"
            >
              <div
                v-if="metric.item.majorDividerAbove"
                class="shrink-0 border-t-2 border-amber-500/50 dark:border-amber-400/40"
              />
              <div
                v-if="metric.item.majorDividerAbove"
                class="shrink-0 bg-gradient-to-b from-muted/60 to-transparent dark:from-muted/40"
                :style="{ height: `${SECTION_MAJOR_GAP_PX - 2}px` }"
              />
              <div
                class="flex flex-1 cursor-pointer items-center justify-between gap-1 px-2 text-[9px] font-semibold tracking-[0.12em] uppercase"
                @click="toggleSection(metric.item.id)"
              >
                <span class="flex min-w-0 shrink items-center gap-1">
                  <ChevronDown
                    class="h-3 w-3 shrink-0 transition-transform duration-150"
                    :class="collapsedSections.has(metric.item.id) ? '-rotate-90' : ''"
                  />
                  <p>
                    {{ metric.item.label }}    
                  </p>                  
                </span>
                <div class="flex shrink-0 items-center gap-1.5">
                  <span class="tabular-nums opacity-90">{{ metric.item.count }}</span>
                  <label
                    v-if="metric.item.id === 'staged' || metric.item.id === 'unstaged'"
                    class="flex cursor-pointer items-center border-l border-border/40 pl-1.5"
                    @click.stop
                  >
                    <input
                      :ref="getSectionSelectAllInputRef(metric.item.id)"
                      type="checkbox"
                      class="size-3.5 rounded border-border accent-primary"
                      :aria-label="
                        metric.item.id === 'staged'
                          ? 'Select all staged files'
                          : 'Select all unstaged files'
                      "
                      @change="toggleSectionSelectAll(metric.item.id)"
                      @click.stop
                    />
                  </label>
                </div>
              </div>
            </div>
            <div
              v-else
              class="absolute inset-x-0 flex items-center"
              :class="[
                selectedScmPath === metric.item.path && selectedScmScope === metric.item.scope
                  ? 'z-[1] border-b border-primary/25 bg-primary/18 text-foreground ring-1 ring-inset ring-primary/30 dark:bg-primary/22'
                  : entryRowClasses(metric.item.sectionId)
              ]"
              :style="{ top: `${metric.top}px`, height: `${metric.height}px` }"
            >
              <Button
                type="button"
                variant="ghost"
                size="xs"
                class="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left transition-colors"
                :class="
                  selectedScmPath === metric.item.path && selectedScmScope === metric.item.scope
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                "
                @click="selectEntry(metric.item.path, metric.item.scope)"
              >
                <span
                  class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border bg-background font-mono text-[8px] font-semibold leading-none"
                >
                  {{ metric.item.badge }}
                </span>
                <span
                  class="min-w-0 flex-1 overflow-hidden font-mono text-[10px] leading-tight"
                  :title="metric.item.path"
                >
                  <span class="block truncate font-semibold">{{ splitRepoPath(metric.item.path).base }}</span>
                  <span v-if="splitRepoPath(metric.item.path).dir" class="block truncate text-muted-foreground/70">{{ splitRepoPath(metric.item.path).dir }}</span>
                </span>
              </Button>
              <label
                class="flex self-stretch shrink-0 cursor-pointer items-center border-l border-border/40 bg-background/30 px-1.5 dark:bg-background/15"
                @click.stop
              >
                <input
                  type="checkbox"
                  class="size-3.5 rounded border-border accent-primary"
                  :checked="isEntryChecked(metric.item.id)"
                  :aria-label="`Select ${metric.item.path} for bulk actions`"
                  @change="toggleEntryChecked(metric.item.id)"
                  @click.stop
                />
              </label>
            </div>
          </template>
        </div>
      </div>
      </SidebarContent>

      <SidebarFooter class="shrink-0 gap-0 border-t border-sidebar-border bg-sidebar p-0">
        <div class="flex items-center justify-between gap-2 border-b border-sidebar-border px-2 py-1">
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
              class="h-6 shrink-0 gap-1 px-2 text-[10px]"
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
              class="h-6 shrink-0 gap-1 px-2 text-[10px]"
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

        <div class="relative border-b border-sidebar-border bg-sidebar">
          <textarea
            v-model="commitMessage"
            rows="4"
            placeholder="Enter commit message"
            aria-label="Commit message draft"
            class="w-full resize-none rounded-none border-0 bg-sidebar py-1.5 pl-2 pr-7 font-mono text-[10px] leading-snug text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none"
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
        <div class="flex items-center justify-between bg-sidebar px-2 py-1.5">
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
            size="xs"
            variant="default"
            class="h-7 shrink-0 px-3 text-[10px]"
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
</template>

<style scoped>
/* @reference "../styles/globals.css"; */
</style>
