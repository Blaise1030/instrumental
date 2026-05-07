# SourceControlPanel Decomposition Design

**Date:** 2026-05-07  
**Goal:** Improve maintainability by splitting the 1041-line `SourceControlPanel.vue` into focused composables and sub-components. No behaviour changes.

---

## Problem

`SourceControlPanel.vue` mixes five distinct responsibilities in one file:
1. Diff loading with LRU cache and sequence tracking
2. File list data transforms and path helpers
3. Multi-select / checkbox selection state
4. Template: sidebar file list, commit footer, header, diff pane

This makes the file hard to navigate, reason about, and test independently.

---

## Approach

Full decomposition: extract 3 composables + 3 sub-components. `SourceControlPanel.vue` becomes a thin orchestrator (~150 lines).

---

## Composables

### `useScmEntries(scm: ReturnType<typeof useScm>)`

Pure data layer — no side effects.

**Owns:**
- Path helpers: `splitRepoPath`, `shortenDirPrefix`, `kindLetter`, `statusLabelForStaged`, `statusLabelForChanges`, `colorClassForEntry`
- Computed lists: `stagedEntries`, `unstagedEntries`, `untrackedEntries`, `allEntries`, `scmSections`, `totalChanges`, `hasStagedChanges`

**Returns:** all computed lists + helper functions needed by the template.

**Location:** `apps/desktop/src/modules/git/hooks/useScmEntries.ts`

---

### `useScmSelection(allEntries: ComputedRef<ListEntry[]>)`

Selection and multi-select state.

**Owns:**
- `selectedScmPath`, `selectedScmScope` refs
- Checkbox state: `checkedPaths` map
- Keyboard navigation handler
- Computed: `selectedEntry`, `checkedStagedPaths`, `checkedWorktreePaths`, `canStageFromSelection`, `canUnstageFromSelection`, `canDiscardFromSelection`

**Returns:** selection state refs + setters + keyboard handler.

**Location:** `apps/desktop/src/modules/git/hooks/useScmSelection.ts`

---

### `useScmDiffLoader(cwd, selectedScmPath, selectedScmScope, repoStatus)`

Async diff pane logic.

**Owns:**
- `selectedMergeResult`, `selectedDiffLoading` refs
- LRU `diffCache` (max 24 entries), `selectedDiffSeq` counter
- `loadSelectedMerge` async function
- Watcher on `repoStatus` that invalidates selection when the currently selected file disappears

**Dependency flow:** receives `selectedScmPath` and `selectedScmScope` as refs from `useScmSelection` — does not own them.

**Returns:** `{ selectedMergeResult, selectedDiffLoading }`.

**Location:** `apps/desktop/src/modules/git/hooks/useScmDiffLoader.ts`

---

## Sub-components

### `ScmPanelHeader.vue`

Top bar of the panel.

**Props:** `branch`, `contextLabel`, `fetchPending`, `pushPending`, `allowBranchSwitcher`, `projectId`  
**Emits:** `fetch`, `push`  
**Owns:** fetch/push buttons with pending states, actions dropdown, `ScmBranchCombobox`, sidebar expand/collapse toggle.

**Location:** `apps/desktop/src/modules/git/components/ScmPanelHeader.vue`

---

### `ScmFileList.vue`

Sidebar file rows — the collapsible staged / changes sections.

**Props:** `sections` (`ScmSectionRow[]`), `selectedPath`, `selectedScope`, `checkedPaths`  
**Emits:** `select`, `check`, `stage-all`, `unstage-all`, `discard-all`, `stage-selection`, `unstage-selection`, `discard-selection`  
**Owns:** collapsible section headers, checkbox rows, per-section context action buttons, file emoji, path rendering.

**Location:** `apps/desktop/src/modules/git/components/ScmFileList.vue`

---

### `ScmCommitFooter.vue`

Commit message area and action buttons.

**Props:** `modelValue` (commit message string), `commitPending`, `hasStagedChanges`, `suggestCommitAvailable`, `suggestCommitBusy`, `suggestCommitDisabledReason`  
**Emits:** `update:modelValue`, `commit`, `suggest`  
**Owns:** commit message textarea, commit button, suggest button (feature-flagged by `SHOW_SUGGEST_COMMIT_BUTTON`).

**Location:** `apps/desktop/src/modules/git/components/ScmCommitFooter.vue`

---

## Orchestrator: `SourceControlPanel.vue` (~150 lines)

After decomposition this file:
- Calls `useScm(cwd)`, `useScmEntries(scm)`, `useScmSelection(allEntries)`, `useScmDiffLoader(...)`
- Handles window focus → `refreshScmQuery` (mount/unmount lifecycle)
- Wires `ScmPanelHeader`, `ScmFileList`, `ScmCommitFooter`, `GitDiffView` with props and emits
- Passes SCM mutation handlers (`scm.stagePaths`, `scm.commit`, etc.) down as callbacks

---

## Data Flow

```
useScm(cwd)
  └─> useScmEntries(scm)        → allEntries, scmSections, hasStagedChanges
        └─> useScmSelection(allEntries) → selectedScmPath, selectedScmScope, checkedPaths
              └─> useScmDiffLoader(cwd, selectedScmPath, selectedScmScope, repoStatus)
                    → selectedMergeResult, selectedDiffLoading

SourceControlPanel (orchestrator)
  ├─ <ScmPanelHeader>   ← branch, fetchPending, pushPending  →  emits: fetch, push
  ├─ <ScmFileList>      ← sections, selectedPath, checkedPaths  →  emits: select, check, stage-all…
  ├─ <GitDiffView>      ← mergeResult, loading
  └─ <ScmCommitFooter>  ← v-model:commitMessage, hasStagedChanges  →  emits: commit, suggest
```

---

## Types

`ListEntry`, `SectionId`, `PanelSectionId`, `EntryScope`, `ScmSectionRow` move to a shared types file:  
`apps/desktop/src/modules/git/types/scm.ts`

---

## Out of Scope

- No behaviour changes
- No changes to `useScm.ts`, `GitDiffView.vue`, or any tests beyond import path updates
- `SHOW_SUGGEST_COMMIT_BUTTON` feature flag stays as-is inside `ScmCommitFooter`
