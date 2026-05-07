# SourceControlPanel Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 1041-line `SourceControlPanel.vue` into 3 composables, 3 sub-components, and a thin orchestrator (~150 lines) with no behaviour changes.

**Architecture:** Extract shared types first, then composables (`useScmEntries` → pure data, `useScmSelection` → checkbox/selection state, `useScmDiffLoader` → async diff loading), then sub-components (`ScmPanelHeader`, `ScmFileList`, `ScmCommitFooter`), and finally rewrite `SourceControlPanel.vue` as a thin orchestrator.

**Component boundary note:** `ScmPanelHeader` owns the `SidebarHeader` region (change count + actions dropdown). `ScmCommitFooter` owns the entire `SidebarFooter` (branch/fetch/push bar + commit textarea + commit button). This maps cleanly to DOM sections and differs slightly from the spec which grouped fetch/push into the header.

**Tech Stack:** Vue 3, TypeScript, `@tanstack/vue-query`, `lucide-vue-next`, `@/components/ui/*`.

---

## File Map

**Create:**
- `apps/desktop/src/modules/git/types/scm.ts` — shared types
- `apps/desktop/src/modules/git/hooks/useScmEntries.ts` — pure data transforms + computed lists
- `apps/desktop/src/modules/git/hooks/useScmSelection.ts` — selection + checkbox state
- `apps/desktop/src/modules/git/hooks/useScmDiffLoader.ts` — async diff loading with LRU cache
- `apps/desktop/src/modules/git/components/ScmPanelHeader.vue` — SidebarHeader: change count + actions dropdown
- `apps/desktop/src/modules/git/components/ScmFileList.vue` — SidebarContent: collapsible file list
- `apps/desktop/src/modules/git/components/ScmCommitFooter.vue` — SidebarFooter: branch/fetch/push + commit

**Modify:**
- `apps/desktop/src/modules/git/components/SourceControlPanel.vue` — rewrite as thin orchestrator

---

### Task 1: Shared types

**Files:**
- Create: `apps/desktop/src/modules/git/types/scm.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/desktop/src/modules/git/types/scm.ts
export type SectionId = "staged" | "unstaged" | "untracked";
export type PanelSectionId = "staged" | "changes";
export type EntryScope = "staged" | "unstaged";

export type ListEntry = {
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

export type ScmSectionRow = {
  id: PanelSectionId;
  label: string;
  entries: ListEntry[];
  showSeparatorAbove: boolean;
  showSectionCheckbox: boolean;
};
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm --filter desktop tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/git/types/scm.ts
git commit -m "feat(git): add shared SCM types"
```

---

### Task 2: Extract `useScmEntries` composable

**Files:**
- Create: `apps/desktop/src/modules/git/hooks/useScmEntries.ts`

- [ ] **Step 1: Create the composable**

```typescript
// apps/desktop/src/modules/git/hooks/useScmEntries.ts
import { computed } from "vue";
import type { RepoChangeKind, RepoStatusEntry } from "@shared/ipc";
import type { useScm } from "@/modules/git/hooks/useScm";
import type { EntryScope, ListEntry, ScmSectionRow, SectionId } from "@/modules/git/types/scm";

export const SCM_PATH_DIR_MAX_CHARS = 44;
const SCM_LIST_DIR_MAX_CHARS = 36;

export function splitRepoPath(path: string): { dir: string; base: string } {
  const norm = path.replace(/\\/g, "/").trim();
  if (!norm) return { dir: "", base: "" };
  const i = norm.lastIndexOf("/");
  if (i < 0) return { dir: "", base: norm };
  return { dir: norm.slice(0, i), base: norm.slice(i + 1) };
}

export function shortenDirPrefix(dir: string, maxLen: number): string {
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

function kindLetter(k: RepoChangeKind | null): string {
  if (!k) return "";
  switch (k) {
    case "modified": return "M";
    case "added":
    case "untracked": return "A";
    case "deleted": return "D";
    case "renamed": return "R";
    case "copied": return "C";
    case "unmerged": return "U";
    default: return "?";
  }
}

function statusLabelForStaged(entry: RepoStatusEntry): string {
  return kindLetter(entry.stagedKind);
}

function statusLabelForChanges(entry: RepoStatusEntry): string {
  if (entry.isUntracked) return "A";
  const u = entry.unstagedKind;
  if (!u) return "";
  if (entry.stagedKind) return `↓${kindLetter(entry.stagedKind)}, ${kindLetter(u)}`;
  return kindLetter(u);
}

export function statusColumnClass(entry: ListEntry): string {
  const base =
    "max-w-[min(8rem,28vw)] shrink-0 truncate text-end align-middle text-[10px] tabular-nums leading-none";
  if (entry.sectionId === "untracked" || entry.statusLabel === "A") {
    return `${base} text-emerald-800 dark:text-emerald-400`;
  }
  return `${base} text-muted-foreground`;
}

function buildEntries(repoStatus: RepoStatusEntry[], section: SectionId): ListEntry[] {
  if (section === "staged") {
    return repoStatus
      .filter((e) => e.stagedKind && !e.isUntracked)
      .map((e) => {
        const { dir, base } = splitRepoPath(e.path);
        return {
          id: `staged:${e.path}`,
          path: e.path,
          scope: "staged" as EntryScope,
          sectionId: "staged" as SectionId,
          statusLabel: statusLabelForStaged(e),
          muted: e.originalPath ?? undefined,
          pathBase: base,
          pathDir: dir || null,
          pathDirShort: dir ? shortenDirPrefix(dir, SCM_LIST_DIR_MAX_CHARS) : null,
        };
      });
  }
  if (section === "unstaged") {
    return repoStatus
      .filter((e) => e.unstagedKind && !e.isUntracked)
      .map((e) => {
        const { dir, base } = splitRepoPath(e.path);
        return {
          id: `unstaged:${e.path}`,
          path: e.path,
          scope: "unstaged" as EntryScope,
          sectionId: "unstaged" as SectionId,
          statusLabel: statusLabelForChanges(e),
          muted: e.originalPath ?? undefined,
          pathBase: base,
          pathDir: dir || null,
          pathDirShort: dir ? shortenDirPrefix(dir, SCM_LIST_DIR_MAX_CHARS) : null,
        };
      });
  }
  return repoStatus
    .filter((e) => e.isUntracked)
    .map((e) => {
      const { dir, base } = splitRepoPath(e.path);
      return {
        id: `untracked:${e.path}`,
        path: e.path,
        scope: "unstaged" as EntryScope,
        sectionId: "untracked" as SectionId,
        statusLabel: statusLabelForChanges(e),
        pathBase: base,
        pathDir: dir || null,
        pathDirShort: dir ? shortenDirPrefix(dir, SCM_LIST_DIR_MAX_CHARS) : null,
      };
    });
}

export function useScmEntries(scm: ReturnType<typeof useScm>) {
  const stagedEntries = computed(() => buildEntries(scm.repoStatus.value, "staged"));
  const unstagedEntries = computed(() => buildEntries(scm.repoStatus.value, "unstaged"));
  const untrackedEntries = computed(() => buildEntries(scm.repoStatus.value, "untracked"));

  const allEntries = computed(() => [
    ...stagedEntries.value,
    ...unstagedEntries.value,
    ...untrackedEntries.value,
  ]);

  const hasStagedChanges = computed(() =>
    scm.repoStatus.value.some((e) => Boolean(e.stagedKind) && !e.isUntracked)
  );

  const totalChanges = computed(
    () =>
      stagedEntries.value.length +
      unstagedEntries.value.length +
      untrackedEntries.value.length
  );

  const scmSections = computed((): ScmSectionRow[] => {
    const rows: ScmSectionRow[] = [];
    const staged = stagedEntries.value;
    const changeEntries = [...unstagedEntries.value, ...untrackedEntries.value];
    if (staged.length > 0) {
      rows.push({ id: "staged", label: "Staged Changes", entries: staged, showSeparatorAbove: false, showSectionCheckbox: true });
    }
    if (changeEntries.length > 0) {
      rows.push({ id: "changes", label: "Changes", entries: changeEntries, showSeparatorAbove: staged.length > 0, showSectionCheckbox: true });
    }
    return rows;
  });

  return {
    stagedEntries,
    unstagedEntries,
    untrackedEntries,
    allEntries,
    hasStagedChanges,
    totalChanges,
    scmSections,
    splitRepoPath,
    shortenDirPrefix,
    statusColumnClass,
    SCM_PATH_DIR_MAX_CHARS,
  };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm --filter desktop tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/git/hooks/useScmEntries.ts
git commit -m "feat(git): extract useScmEntries composable"
```

---

### Task 3: Extract `useScmSelection` composable

**Files:**
- Create: `apps/desktop/src/modules/git/hooks/useScmSelection.ts`

- [ ] **Step 1: Create the composable**

```typescript
// apps/desktop/src/modules/git/hooks/useScmSelection.ts
import { computed, nextTick, ref, watch } from "vue";
import type { ComputedRef } from "vue";
import type { EntryScope, ListEntry, PanelSectionId } from "@/modules/git/types/scm";

export function useScmSelection(allEntries: ComputedRef<ListEntry[]>) {
  const selectedScmPath = ref<string | null>(null);
  const selectedScmScope = ref<EntryScope | null>(null);
  const checkedEntryIds = ref<string[]>([]);

  const selectedEntry = computed((): ListEntry | null => {
    if (!selectedScmPath.value || !selectedScmScope.value) return null;
    return (
      allEntries.value.find(
        (item) => item.path === selectedScmPath.value && item.scope === selectedScmScope.value
      ) ?? null
    );
  });

  const checkedStagedPaths = computed(() => {
    const ids = new Set(checkedEntryIds.value);
    return allEntries.value
      .filter((item) => ids.has(item.id) && item.sectionId === "staged")
      .map((item) => item.path);
  });

  const checkedWorktreePaths = computed(() => {
    const ids = new Set(checkedEntryIds.value);
    return allEntries.value
      .filter((item) => ids.has(item.id) && (item.sectionId === "unstaged" || item.sectionId === "untracked"))
      .map((item) => item.path);
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

  // Prune stale checked ids when entries disappear.
  watch(
    allEntries,
    (items) => {
      const valid = new Set(items.map((i) => i.id));
      const next = checkedEntryIds.value.filter((id) => valid.has(id));
      if (next.length !== checkedEntryIds.value.length) checkedEntryIds.value = next;
    },
    { flush: "post" }
  );

  // Auto-select first entry on initial load when nothing is selected.
  watch(
    allEntries,
    async (items) => {
      if (items.length === 0) return;
      if (selectedEntry.value) return;
      const firstEntry = items[0];
      if (!firstEntry) return;
      await nextTick();
      if (selectedEntry.value) return;
      selectEntry(firstEntry.path, firstEntry.scope);
    },
    { immediate: true, flush: "post" }
  );

  function selectEntry(path: string, scope: EntryScope): void {
    selectedScmPath.value = path;
    selectedScmScope.value = scope;
  }

  function isEntryChecked(id: string): boolean {
    return checkedEntryIds.value.includes(id);
  }

  function setEntryChecked(id: string, checked: boolean): void {
    const next = new Set(checkedEntryIds.value);
    if (checked) next.add(id);
    else next.delete(id);
    checkedEntryIds.value = [...next];
  }

  function entryIdsForPanelSection(panelId: PanelSectionId): string[] {
    if (panelId === "staged") {
      return allEntries.value.filter((e) => e.sectionId === "staged").map((e) => e.id);
    }
    return allEntries.value
      .filter((e) => e.sectionId === "unstaged" || e.sectionId === "untracked")
      .map((e) => e.id);
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

  return {
    selectedScmPath,
    selectedScmScope,
    selectedEntry,
    checkedEntryIds,
    checkedStagedPaths,
    checkedWorktreePaths,
    canStageFromSelection,
    canUnstageFromSelection,
    canDiscardFromSelection,
    selectEntry,
    isEntryChecked,
    setEntryChecked,
    toggleSectionSelectAll,
    sectionCheckboxModel,
  };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm --filter desktop tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/git/hooks/useScmSelection.ts
git commit -m "feat(git): extract useScmSelection composable"
```

---

### Task 4: Extract `useScmDiffLoader` composable

**Files:**
- Create: `apps/desktop/src/modules/git/hooks/useScmDiffLoader.ts`

**Important:** This composable owns the `repoStatus` watcher that also updates the selection refs when the currently selected file disappears. It receives `selectedScmPath` and `selectedScmScope` as writable `Ref`s from `useScmSelection` and may write to them.

- [ ] **Step 1: Create the composable**

```typescript
// apps/desktop/src/modules/git/hooks/useScmDiffLoader.ts
import { ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import type { FileDiffScope, FileMergeSidesResult, RepoStatusEntry } from "@shared/ipc";
import { LruMap } from "@/lib/lruMap";
import type { EntryScope } from "@/modules/git/types/scm";

const DIFF_MERGE_CACHE_MAX = 24;

export function useScmDiffLoader(
  cwd: ComputedRef<string>,
  selectedScmPath: Ref<string | null>,
  selectedScmScope: Ref<EntryScope | null>,
  repoStatus: ComputedRef<RepoStatusEntry[]>
) {
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
    if (!api || !cwd.value || !path || !scope) {
      selectedMergeResult.value = null;
      selectedDiffLoading.value = false;
      return;
    }
    const seq = ++selectedDiffSeq;
    const worktreePath = cwd.value;
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
      if (seq !== selectedDiffSeq || cwd.value !== worktreePath) return;
      diffCache.set(key, result);
      if (!mergeSidesEqual(selectedMergeResult.value, result)) selectedMergeResult.value = result;
    } catch (error) {
      if (seq !== selectedDiffSeq || cwd.value !== worktreePath) return;
      selectedMergeResult.value = {
        kind: "error",
        message: error instanceof Error ? error.message : "Could not load diff.",
      };
    } finally {
      if (seq === selectedDiffSeq) selectedDiffLoading.value = false;
    }
  }

  watch(
    repoStatus,
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
      const worktreePath = cwd.value;
      if (worktreePath && selectedScmPath.value && selectedScmScope.value) {
        diffCache.delete(cacheKey(worktreePath, selectedScmPath.value, selectedScmScope.value));
      }
      void loadSelectedMerge();
    },
    { flush: "post" }
  );

  return { selectedMergeResult, selectedDiffLoading, loadSelectedMerge };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm --filter desktop tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/git/hooks/useScmDiffLoader.ts
git commit -m "feat(git): extract useScmDiffLoader composable"
```

---

### Task 5: Extract `ScmPanelHeader` sub-component

Owns the `SidebarHeader` region: change count badge + Actions dropdown (stage/unstage/discard selected + stage/unstage/discard all).

**Files:**
- Create: `apps/desktop/src/modules/git/components/ScmPanelHeader.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- apps/desktop/src/modules/git/components/ScmPanelHeader.vue -->
<script setup lang="ts">
import {
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ref } from "vue";

defineProps<{
  totalChanges: number;
  canStageFromSelection: boolean;
  canUnstageFromSelection: boolean;
  canDiscardFromSelection: boolean;
}>();

const emit = defineEmits<{
  stageSelected: [];
  unstageSelected: [];
  discardSelected: [];
  stageAll: [];
  unstageAll: [];
  discardAll: [];
}>();

const actionsOpen = ref(false);
</script>

<template>
  <div class="flex w-full items-center justify-between gap-1.5">
    <div class="flex min-w-0 items-center gap-1.5">
      <p class="text-[10px] font-medium leading-none text-sidebar-foreground">
        {{ totalChanges.toLocaleString() }} changes
      </p>
    </div>
    <DropdownMenu v-model:open="actionsOpen">
      <DropdownMenuTrigger as-child>
        <Button size="xs" variant="secondary" class="h-6 gap-1 px-2 text-[10px]">
          Actions
          <ChevronDown class="h-3 w-3" :class="actionsOpen ? 'rotate-180' : ''" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-[180px]">
        <DropdownMenuItem :disabled="!canStageFromSelection" class="text-xs" @select="emit('stageSelected')">
          <Plus class="h-3 w-3 shrink-0" />
          Stage Selected
        </DropdownMenuItem>
        <DropdownMenuItem :disabled="!canUnstageFromSelection" class="text-xs" @select="emit('unstageSelected')">
          <Minus class="h-3 w-3 shrink-0" />
          Unstage Selected
        </DropdownMenuItem>
        <DropdownMenuItem :disabled="!canDiscardFromSelection" variant="destructive" class="text-xs" @select="emit('discardSelected')">
          <RotateCcw class="h-3 w-3 shrink-0" />
          Discard Selected
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem class="text-xs" @select="emit('stageAll')">
          <ChevronsUp class="h-3 w-3 shrink-0" />
          Stage All
        </DropdownMenuItem>
        <DropdownMenuItem class="text-xs" @select="emit('unstageAll')">
          <ChevronsDown class="h-3 w-3 shrink-0" />
          Unstage All
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" class="text-xs" @select="emit('discardAll')">
          <Trash2 class="h-3 w-3 shrink-0" />
          Discard All
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm --filter desktop tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/git/components/ScmPanelHeader.vue
git commit -m "feat(git): add ScmPanelHeader sub-component"
```

---

### Task 6: Extract `ScmFileList` sub-component

Owns the `SidebarContent` region: collapsible sections with checkbox rows and file rows.

**Files:**
- Create: `apps/desktop/src/modules/git/components/ScmFileList.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- apps/desktop/src/modules/git/components/ScmFileList.vue -->
<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { fileEmojiForPath } from "@/lib/fileEmojiForPath";
import { statusColumnClass } from "@/modules/git/hooks/useScmEntries";
import type { EntryScope, PanelSectionId, ScmSectionRow } from "@/modules/git/types/scm";
import { computed } from "vue";

const props = defineProps<{
  sections: ScmSectionRow[];
  selectedPath: string | null;
  selectedScope: EntryScope | null;
  checkedEntryIds: string[];
  collapsedSections: Set<PanelSectionId>;
}>();

const emit = defineEmits<{
  select: [path: string, scope: EntryScope];
  setEntryChecked: [id: string, checked: boolean];
  toggleSectionSelectAll: [panelId: PanelSectionId];
  setSectionOpen: [panelId: PanelSectionId, open: boolean];
}>();

function isEntryChecked(id: string): boolean {
  return props.checkedEntryIds.includes(id);
}

function sectionCheckboxModel(panelId: PanelSectionId): boolean | "indeterminate" {
  const sectionRow = props.sections.find((s) => s.id === panelId);
  if (!sectionRow || sectionRow.entries.length === 0) return false;
  const ids = sectionRow.entries.map((e) => e.id);
  const checked = new Set(props.checkedEntryIds);
  const n = ids.filter((id) => checked.has(id)).length;
  if (n === 0) return false;
  if (n === ids.length) return true;
  return "indeterminate";
}
</script>

<template>
  <template v-if="sections.length === 0">
    <div class="px-3 py-6 text-center text-xs text-muted-foreground">
      ✨ Working tree is clean.
    </div>
  </template>
  <template v-else>
    <template v-for="section in sections" :key="section.id">
      <SidebarSeparator v-if="section.showSeparatorAbove" />
      <Collapsible
        :open="!collapsedSections.has(section.id)"
        @update:open="(open) => emit('setSectionOpen', section.id, open)"
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
              :aria-label="section.id === 'staged' ? 'Select all staged files' : 'Select all files in Changes'"
              @update:model-value="() => emit('toggleSectionSelectAll', section.id)"
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
                    :is-active="selectedPath === entry.path && selectedScope === entry.scope"
                    @click.stop="emit('select', entry.path, entry.scope)"
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
                        @update:model-value="(v) => emit('setEntryChecked', entry.id, v === true)"
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
</template>
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm --filter desktop tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/git/components/ScmFileList.vue
git commit -m "feat(git): add ScmFileList sub-component"
```

---

### Task 7: Extract `ScmCommitFooter` sub-component

Owns the entire `SidebarFooter`: branch/fetch/push bar + commit textarea + commit/suggest buttons.

**Files:**
- Create: `apps/desktop/src/modules/git/components/ScmCommitFooter.vue`

- [ ] **Step 1: Create the component**

```vue
<!-- apps/desktop/src/modules/git/components/ScmCommitFooter.vue -->
<script setup lang="ts">
import { ArrowDownToLine, ArrowUpFromLine, Maximize2, Minimize2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { CursorLoading } from "@/components/ui/cursor-loading";
import ScmBranchCombobox from "@/components/ScmBranchCombobox.vue";
import { computed, ref } from "vue";

/** Temporary product toggle: hide only local-LLM commit suggestion control. */
const SHOW_SUGGEST_COMMIT_BUTTON = false;

const props = withDefaults(
  defineProps<{
    branchLine: string;
    currentBranch: string;
    projectId: string;
    cwd: string;
    allowBranchSwitcher: boolean;
    fetchPending: boolean;
    pushPending: boolean;
    modelValue: string;
    commitPending: boolean;
    hasStagedChanges: boolean;
    suggestCommitAvailable?: boolean;
    suggestCommitBusy?: boolean;
    suggestCommitDisabledReason?: string | null;
    suggestCommitGpuOk?: boolean | null;
    suggestCommitTruncated?: boolean;
  }>(),
  {
    suggestCommitAvailable: false,
    suggestCommitBusy: false,
    suggestCommitDisabledReason: null,
    suggestCommitGpuOk: null,
    suggestCommitTruncated: false,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  commit: [];
  suggest: [];
  fetch: [];
  push: [];
  branchChanged: [];
}>();

const commitExpanded = ref(false);

const canCommit = computed(
  () => !props.commitPending && props.hasStagedChanges && Boolean(props.modelValue.trim())
);

const suggestCommitDisabled = computed(() => {
  if (!props.suggestCommitAvailable) return true;
  if (props.suggestCommitGpuOk === false) return true;
  if (!props.hasStagedChanges) return true;
  return false;
});

const suggestCommitTitle = computed(() => {
  if (!props.suggestCommitAvailable) return undefined;
  if (props.suggestCommitGpuOk === false) {
    return props.suggestCommitDisabledReason ?? "WebGPU is not available. Commit suggestions require WebGPU.";
  }
  if (!props.hasStagedChanges) return "Stage changes to generate a commit message.";
  return "Suggest commit message from staged changes";
});
</script>

<template>
  <div class="flex items-center justify-between gap-2 border-b border-sidebar-border px-2 py-1">
    <ScmBranchCombobox
      :branch-line="branchLine"
      :current-branch="currentBranch"
      :project-id="projectId"
      :cwd="cwd"
      :switcher-enabled="allowBranchSwitcher"
      @branch-changed="emit('branchChanged')"
    />
    <div class="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        size="xs"
        variant="outline"
        class="h-6 shrink-0 gap-1 px-2 text-[10px]"
        :disabled="fetchPending || pushPending"
        aria-label="Fetch from remote"
        @click="emit('fetch')"
      >
        <CursorLoading
          v-if="fetchPending"
          class="inline-block h-2.5 w-2.5 min-h-0 shrink-0 overflow-hidden"
          aria-hidden="true"
        />
        <ArrowDownToLine v-else class="h-2.5 w-2.5 shrink-0 opacity-80" :stroke-width="2" aria-hidden="true" />
        Fetch
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        class="h-6 shrink-0 gap-1 px-2 text-[10px]"
        :disabled="pushPending || fetchPending"
        aria-label="Push current branch to remote"
        title="Push current branch (upstream must be set)"
        @click="emit('push')"
      >
        <CursorLoading
          v-if="pushPending"
          class="inline-block h-2.5 w-2.5 min-h-0 shrink-0 overflow-hidden"
          aria-hidden="true"
        />
        <ArrowUpFromLine v-else class="h-2.5 w-2.5 shrink-0 opacity-80" :stroke-width="2" aria-hidden="true" />
        Push
      </Button>
    </div>
  </div>

  <div class="relative border-b border-sidebar-border">
    <textarea
      :value="modelValue"
      rows="4"
      placeholder="Enter commit message"
      aria-label="Commit message draft"
      class="w-full resize-none rounded-none border-0 bg-transparent py-1.5 pl-2 pr-7 font-mono text-[10px] leading-snug text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none"
      :class="commitExpanded ? 'min-h-[11rem]' : 'min-h-[4.5rem]'"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
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
        @click="emit('suggest')"
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
      @click="emit('commit')"
    >
      <CursorLoading
        v-if="commitPending"
        class="mr-1 inline-block h-3 w-3 min-h-0 shrink-0 overflow-hidden"
        aria-hidden="true"
      />
      Commit
    </Button>
  </div>
</template>
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm --filter desktop tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/git/components/ScmCommitFooter.vue
git commit -m "feat(git): add ScmCommitFooter sub-component"
```

---

### Task 8: Rewrite `SourceControlPanel.vue` as thin orchestrator

Replace the entire file with the orchestrator that wires composables and sub-components together.

**Files:**
- Modify: `apps/desktop/src/modules/git/components/SourceControlPanel.vue`

- [ ] **Step 1: Replace the file**

```vue
<!-- apps/desktop/src/modules/git/components/SourceControlPanel.vue -->
<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { PanelLeftOpen } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import GitDiffView from "@/modules/git/components/GitDiffView.vue";
import ScmPanelHeader from "@/modules/git/components/ScmPanelHeader.vue";
import ScmFileList from "@/modules/git/components/ScmFileList.vue";
import ScmCommitFooter from "@/modules/git/components/ScmCommitFooter.vue";
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
import { useScmEntries } from "@/modules/git/hooks/useScmEntries";
import { useScmSelection } from "@/modules/git/hooks/useScmSelection";
import { useScmDiffLoader } from "@/modules/git/hooks/useScmDiffLoader";
import { shortenDirPrefix, splitRepoPath, SCM_PATH_DIR_MAX_CHARS } from "@/modules/git/hooks/useScmEntries";
import type { PanelSectionId } from "@/modules/git/types/scm";

const props = withDefaults(
  defineProps<{
    projectId?: string | null;
    allowScmBranchSwitcher?: boolean;
    contextLabel?: string | null;
    suggestCommitAvailable?: boolean;
    suggestCommitDisabledReason?: string | null;
    suggestCommitBusy?: boolean;
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

const { activeWorktree } = useActiveWorkspace();
const toast = useToast();
const queryClient = useQueryClient();

const cwd = computed(() => activeWorktree.value?.path ?? "");
const scm = useScm(cwd);
const { allEntries, scmSections, totalChanges, hasStagedChanges } = useScmEntries(scm);
const selection = useScmSelection(allEntries);
const diff = useScmDiffLoader(cwd, selection.selectedScmPath, selection.selectedScmScope, scm.repoStatus);

const commitMessage = ref("");
const collapsedSections = ref<Set<PanelSectionId>>(new Set());

const scmFetchPending = computed(() => scm.fetch.isPending.value);
const scmPushPending = computed(() => scm.push.isPending.value);
const scmCommitPending = computed(() => scm.commit.isPending.value);
const scmBranchLine = computed(() => scm.scmMeta.value.shortLabel);
const scmCurrentBranch = computed(() => scm.scmMeta.value.branch);

const scmPathHeader = computed(() => {
  const path = selection.selectedEntry.value?.path ?? "";
  if (!path) return { full: "", base: "", dirLine: "", hasDir: false };
  const { dir, base } = splitRepoPath(path);
  const dirLine = dir ? shortenDirPrefix(dir, SCM_PATH_DIR_MAX_CHARS) : "";
  return { full: path, base, dirLine, hasDir: Boolean(dir) };
});

const emptyMessage = computed(() => {
  if (totalChanges.value === 0) return "✨ Working tree is clean.";
  if (!selection.selectedEntry.value) return "Select a changed file to inspect it.";
  return null;
});

function refreshScmQuery(): void {
  void queryClient.invalidateQueries({ queryKey: ["git", "scm", cwd.value] });
}

function onWindowFocus(): void {
  if (!cwd.value) return;
  refreshScmQuery();
}

onMounted(() => window.addEventListener("focus", onWindowFocus));
onBeforeUnmount(() => window.removeEventListener("focus", onWindowFocus));

async function actionStageSelected(): Promise<void> {
  const bulk = selection.checkedWorktreePaths.value;
  try {
    if (bulk.length > 0) { await scm.stagePaths.mutateAsync(bulk); return; }
    if (!selection.selectedEntry.value || selection.selectedEntry.value.scope !== "unstaged") return;
    await scm.stagePaths.mutateAsync([selection.selectedEntry.value.path]);
  } catch (e) {
    toast.error("Stage failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}

async function actionUnstageSelected(): Promise<void> {
  const bulk = selection.checkedStagedPaths.value;
  try {
    if (bulk.length > 0) { await scm.unstagePaths.mutateAsync(bulk); return; }
    if (!selection.selectedEntry.value || selection.selectedEntry.value.scope !== "staged") return;
    await scm.unstagePaths.mutateAsync([selection.selectedEntry.value.path]);
  } catch (e) {
    toast.error("Unstage failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}

async function actionDiscardSelected(): Promise<void> {
  const bulk = selection.checkedWorktreePaths.value;
  const run = async (paths: string[]): Promise<void> => {
    const label = paths.length === 1 ? paths[0]! : `${paths.length} files`;
    if (!window.confirm(`Discard changes to ${label}?`)) return;
    try {
      await scm.discardPaths.mutateAsync(paths);
    } catch (e) {
      toast.error("Discard failed", e instanceof Error ? e.message : "Something went wrong.");
    }
  };
  if (bulk.length > 0) { await run(bulk); return; }
  if (!selection.selectedEntry.value || selection.selectedEntry.value.scope !== "unstaged") return;
  await run([selection.selectedEntry.value.path]);
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
    onError: (e) => toast.error("Stage all failed", e instanceof Error ? e.message : "Something went wrong."),
  });
}

function handleUnstageAll(): void {
  scm.unstageAll.mutate(undefined, {
    onError: (e) => toast.error("Unstage all failed", e instanceof Error ? e.message : "Something went wrong."),
  });
}

function handleDiscardAll(): void {
  if (!window.confirm("Discard all working tree changes?")) return;
  scm.discardAll.mutate(undefined, {
    onError: (e) => toast.error("Discard all failed", e instanceof Error ? e.message : "Something went wrong."),
  });
}

function handleSelectEntry(path: string, scope: "staged" | "unstaged"): void {
  selection.selectEntry(path, scope);
  void diff.loadSelectedMerge();
}

function handleSectionOpen(panelId: PanelSectionId, open: boolean): void {
  const next = new Set(collapsedSections.value);
  if (open) next.delete(panelId);
  else next.add(panelId);
  collapsedSections.value = next;
}
</script>

<template>
  <SidebarProvider
    class="flex h-full border-t min-h-0 w-full flex-1 flex-row overflow-hidden text-[11px] text-foreground"
    :keyboard-shortcut="false"
    :persist-cookie="false"
  >
    <SidebarInset class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <GitDiffView
        :path-header="scmPathHeader"
        :file-path="selection.selectedEntry.value?.path ?? ''"
        :file-scope="selection.selectedEntry.value?.scope ?? null"
        :loading="diff.selectedDiffLoading.value"
        :empty-message="emptyMessage"
        :merge-result="diff.selectedMergeResult.value"
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
        <ScmPanelHeader
          :total-changes="totalChanges"
          :can-stage-from-selection="selection.canStageFromSelection.value"
          :can-unstage-from-selection="selection.canUnstageFromSelection.value"
          :can-discard-from-selection="selection.canDiscardFromSelection.value"
          @stage-selected="actionStageSelected"
          @unstage-selected="actionUnstageSelected"
          @discard-selected="actionDiscardSelected"
          @stage-all="handleStageAll"
          @unstage-all="handleUnstageAll"
          @discard-all="handleDiscardAll"
        />
      </SidebarHeader>

      <SidebarContent>
        <ScmFileList
          :sections="scmSections"
          :selected-path="selection.selectedScmPath.value"
          :selected-scope="selection.selectedScmScope.value"
          :checked-entry-ids="selection.checkedEntryIds.value"
          :collapsed-sections="collapsedSections"
          @select="handleSelectEntry"
          @set-entry-checked="selection.setEntryChecked"
          @toggle-section-select-all="selection.toggleSectionSelectAll"
          @set-section-open="handleSectionOpen"
        />
      </SidebarContent>

      <SidebarFooter class="shrink-0 gap-0 border-t border-sidebar-border p-0">
        <ScmCommitFooter
          v-model="commitMessage"
          :branch-line="scmBranchLine"
          :current-branch="scmCurrentBranch"
          :project-id="props.projectId ?? ''"
          :cwd="activeWorktree?.path ?? ''"
          :allow-branch-switcher="props.allowScmBranchSwitcher"
          :fetch-pending="scmFetchPending"
          :push-pending="scmPushPending"
          :commit-pending="scmCommitPending"
          :has-staged-changes="hasStagedChanges"
          :suggest-commit-available="props.suggestCommitAvailable"
          :suggest-commit-busy="props.suggestCommitBusy"
          :suggest-commit-disabled-reason="props.suggestCommitDisabledReason"
          :suggest-commit-gpu-ok="props.suggestCommitGpuOk"
          :suggest-commit-truncated="props.suggestCommitTruncated"
          @commit="handleCommit"
          @suggest="emit('suggestCommit')"
          @fetch="handleFetch"
          @push="handlePush"
          @branch-changed="refreshScmQuery"
        />
      </SidebarFooter>
    </Sidebar>
  </SidebarProvider>
</template>

<style scoped>
/* @reference "../styles/globals.css"; */
</style>
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm --filter desktop tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run existing tests**

Run: `pnpm --filter desktop test run`
Expected: all tests pass, including `SourceControlPanel.localLlm.test.ts`

- [ ] **Step 4: Verify line count reduction**

Run: `wc -l apps/desktop/src/modules/git/components/SourceControlPanel.vue`
Expected: under 200 lines

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/git/components/SourceControlPanel.vue
git commit -m "refactor(git): decompose SourceControlPanel into composables and sub-components"
```
