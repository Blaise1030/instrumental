# Explorer / FilePage Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `provide`/`inject` coupling between `ExplorerLayout` and `FilePage` so each component owns exactly its concern — sidebar vs. file editor — with no shared injection keys.

**Architecture:** `useExplorerFilePage` becomes fully self-contained by calling `useActiveWorkspace()` directly and coordinating with `ExplorerLayout` only via two lightweight module-level bridges: the existing `explorerEditorBridge` (ExplorerLayout → FilePage direction) and a new `explorerSidebarBridge` (FilePage → ExplorerLayout direction). `FilePage` calls the composable directly with no shell parameter and renders its own discard-confirmation `<AlertDialog>`.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest + Vue Test Utils, Pinia.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `src/modules/explorer/explorerSidebarBridge.ts` | Module-level sidebar collapsed state + sidebar action callbacks |
| **Modify** | `src/modules/explorer/useExplorerFilePage.ts` | Remove `shell` param; source deps directly; internal confirm dialog |
| **Modify** | `src/modules/explorer/FilePage.vue` | Remove inject; call composable directly; add AlertDialog |
| **Modify** | `src/modules/explorer/ExplorerLayout.vue` | Remove provide; sync collapsed state; register sidebar bridge |
| **Modify** | `src/modules/explorer/explorerEditorBridge.ts` | Add `openFile` method so ExplorerLayout can expose it |
| **Delete** | `src/modules/explorer/explorerShellContext.ts` | No longer needed |
| **Modify** | `src/modules/explorer/fileSearchEditorPageContext.ts` | Remove `fileSearchEditorPageKey`; keep `FileSearchEditorPageViewModel` type |
| **Modify** | `src/components/__tests__/FileSearchEditor.test.ts` | Remove shell mock; setup workspace store instead of props |

---

## Task 1: Create `explorerSidebarBridge.ts`

**Files:**
- Create: `src/modules/explorer/explorerSidebarBridge.ts`

- [ ] **Step 1: Create the file**

```ts
// src/modules/explorer/explorerSidebarBridge.ts
import { ref, type Ref } from "vue";

/**
 * Module-level ref so both ExplorerLayout and useExplorerFilePage read/write
 * sidebar collapsed state without provide/inject.
 */
export const sidebarCollapsedState: Ref<boolean | undefined> = ref(undefined);

type SidebarActions = {
  expandSidebar: () => Promise<void>;
  focusSearchInput: () => Promise<void>;
};

let _sidebarActions: SidebarActions | null = null;

export function registerSidebarActions(actions: SidebarActions | null): void {
  _sidebarActions = actions;
}

export function expandSidebarViaLayout(): Promise<void> {
  return _sidebarActions?.expandSidebar() ?? Promise.resolve();
}

export function focusSearchInputViaLayout(): Promise<void> {
  return _sidebarActions?.focusSearchInput() ?? Promise.resolve();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -20
```
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/explorer/explorerSidebarBridge.ts
git commit -m "feat(desktop): add explorerSidebarBridge module-level singleton"
```

---

## Task 2: Add `openFile` to `ExplorerEditorBridge`

The current `explorerEditorBridge.ts` only handles ExplorerLayout → FilePage direction. ExplorerLayout's `defineExpose` calls `openWorkspaceFile: handleSelectFile` — after the refactor `handleSelectFile` lives in the composable, so the bridge needs an `openFile` entry.

**Files:**
- Modify: `src/modules/explorer/explorerEditorBridge.ts`

- [ ] **Step 1: Add `openFile` to the bridge type and registration**

Replace the entire file content with:

```ts
// src/modules/explorer/explorerEditorBridge.ts

/**
 * Callbacks so ExplorerLayout (sidebar / IPC delete-create) can coordinate
 * with file editor state owned by FilePage without provide/inject.
 */
export type ExplorerEditorBridge = {
  confirmDiscardIfDirty: () => Promise<boolean>;
  isActiveFileDirty: () => boolean;
  /** Active editor selection path (primary tab), or null. */
  selectedFilePath: () => string | null;
  /** Whether deleting this folder would lose unsaved edits to an open file inside it. */
  isOpenFileDirtyUnderFolder: (folderRelPath: string) => boolean;
  /** After folder delete API succeeds — drop tabs and sync route. */
  pruneTabsUnderFolder: (folderRelPath: string) => void;
  /** After file delete API succeeds — close tab and sync route. */
  closeTabForDeletedFile: (fileRelPath: string) => void;
  /** Open a file in the editor (used by ExplorerLayout's openWorkspaceFile expose). */
  openFile: (relativePath: string) => Promise<void>;
};

let bridge: ExplorerEditorBridge | null = null;

export function registerExplorerEditorBridge(next: ExplorerEditorBridge | null): void {
  bridge = next;
}

export function getExplorerEditorBridge(): ExplorerEditorBridge | null {
  return bridge;
}
```

- [ ] **Step 2: Check existing usages compile**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -30
```
Expected: TypeScript will complain that the bridge registered in `useExplorerFilePage.ts` is missing `openFile`. That error is intentional — it gets fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/explorer/explorerEditorBridge.ts
git commit -m "feat(desktop): add openFile method to ExplorerEditorBridge"
```

---

## Task 3: Update `useExplorerFilePage.ts` — remove shell, self-contained

**Files:**
- Modify: `src/modules/explorer/useExplorerFilePage.ts`

This is the main task. We make the following substitutions throughout the file:

| Was | Becomes |
|-----|---------|
| `shell.wtPath` | `wtPath` (from `useActiveWorkspace()`) |
| `shell.wtId` | `wtId` (from `useActiveWorkspace()`) |
| `shell.worktreeEpoch` | removed — watch `[wtId, wtPath]` directly |
| `shell.allFiles` | removed — just attempt to open saved paths; non-existent files fail gracefully |
| `shell.requestConfirmation(opts)` | `requestConfirmation(opts)` — internal implementation |
| `shell.sidebarCollapsed` | `sidebarCollapsedState` from `explorerSidebarBridge` |
| `shell.expandSidebar()` | `expandSidebarViaLayout()` from `explorerSidebarBridge` |
| `shell.focusSearchInput()` | `focusSearchInputViaLayout()` from `explorerSidebarBridge` |

- [ ] **Step 1: Update imports at the top of `useExplorerFilePage.ts`**

Remove:
```ts
import type { ExplorerShell } from "@/modules/explorer/explorerShellContext";
import type { FileSearchEditorPageViewModel } from "@/modules/explorer/fileSearchEditorPageContext";
```

Add:
```ts
import {
  sidebarCollapsedState,
  expandSidebarViaLayout,
  focusSearchInputViaLayout,
} from "@/modules/explorer/explorerSidebarBridge";
import type { FileSearchEditorPageViewModel } from "@/modules/explorer/fileSearchEditorPageContext";
```

Also add `type Ref` to the vue import if not already present.

- [ ] **Step 2: Change the function signature**

Replace:
```ts
export function useExplorerFilePage(
  shell: ExplorerShell,
): FileSearchEditorPageViewModel {
  const wtPath = shell.wtPath;
  const wtId = shell.wtId;
  const { activeThreadId: routeThreadId } = useActiveWorkspace();
```

With:
```ts
export function useExplorerFilePage(): FileSearchEditorPageViewModel {
  const { activeWorktree, activeThreadId: routeThreadId } = useActiveWorkspace();
  const wtPath = computed(() => activeWorktree.value?.path ?? null);
  const wtId = computed(() => activeWorktree.value?.id ?? null);
```

- [ ] **Step 3: Add internal confirm dialog state**

After the `const toast = useToast();` line, add:

```ts
type ConfirmDialogOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
};

type ConfirmDialogState = ConfirmDialogOptions & {
  resolve: (result: boolean) => void;
};

const confirmDialogState = ref<ConfirmDialogState | null>(null);

function requestConfirmation(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmDialogState.value = { ...options, resolve };
  });
}

function settleConfirmation(confirmed: boolean): void {
  const pending = confirmDialogState.value;
  if (!pending) return;
  confirmDialogState.value = null;
  pending.resolve(confirmed);
}
```

- [ ] **Step 4: Replace `shell.requestConfirmation` calls**

There are two call sites. Replace each `shell.requestConfirmation(` with `requestConfirmation(`.

Search for: `shell.requestConfirmation`
Replace each with: `requestConfirmation`

- [ ] **Step 5: Replace sidebar state references**

Replace `shell.sidebarCollapsed` with `sidebarCollapsedState` (the module-level ref from explorerSidebarBridge).

Replace `shell.expandSidebar()` with `expandSidebarViaLayout()`.

Replace `shell.focusSearchInput()` with `focusSearchInputViaLayout()`.

- [ ] **Step 6: Replace the worktree-change watch**

Find the watch that starts with:
```ts
watch(
  () => [
    shell.worktreeEpoch.value,
    wtId.value ?? null,
    wtPath.value,
  ] as const,
  async ([epoch, nextWorktreeId, nextPath], previousValue) => {
    const [prevEpoch, previousWorktreeId, previousPath] = previousValue ?? [0, null, null];
    if (
      epoch === prevEpoch &&
      nextWorktreeId === previousWorktreeId &&
      nextPath === previousPath
    ) return;
    if (epoch === 0) return;
    if (!nextWorktreeId || !nextPath) return;
```

Replace with:
```ts
watch(
  () => [wtId.value ?? null, wtPath.value] as const,
  async ([nextWorktreeId, nextPath], previousValue) => {
    const [previousWorktreeId, previousPath] = previousValue ?? [null, null];
    if (nextWorktreeId === previousWorktreeId && nextPath === previousPath) return;
    if (!nextWorktreeId || !nextPath) return;
```

- [ ] **Step 7: Remove the `shell.allFiles` filter**

In the same watch callback, find:
```ts
const existingSavedPaths = savedState.openFilePaths
  .filter((path, index, arr) => arr.indexOf(path) === index)
  .filter((path) =>
    shell.allFiles.value.some(
      (f) => f.relativePath === path && (f.kind === undefined || f.kind === "file"),
    ),
  )
  .slice(-MAX_OPEN_FILE_TABS);
```

Replace with:
```ts
const existingSavedPaths = savedState.openFilePaths
  .filter((path, index, arr) => arr.indexOf(path) === index)
  .slice(-MAX_OPEN_FILE_TABS);
```

(Non-existent files will simply fail to load and show an error — already handled.)

- [ ] **Step 8: Add `openFile` to the editor bridge registration**

In `onMounted`, find the bridge object:
```ts
const b: ExplorerEditorBridge = {
  confirmDiscardIfDirty,
  isActiveFileDirty: () => dirty.value,
  selectedFilePath: () => selectedPath.value,
  isOpenFileDirtyUnderFolder: ...
  pruneTabsUnderFolder: ...
  closeTabForDeletedFile: ...
};
```

Add `openFile` to it:
```ts
const b: ExplorerEditorBridge = {
  confirmDiscardIfDirty,
  isActiveFileDirty: () => dirty.value,
  selectedFilePath: () => selectedPath.value,
  isOpenFileDirtyUnderFolder: (folderRel: string) => {
    const sel = selectedPath.value;
    return Boolean(sel && pathIsUnderOrEqualFolder(folderRel, sel) && dirty.value);
  },
  pruneTabsUnderFolder: (folderPath: string) => {
    removeTabsMatching((tab) => pathIsUnderOrEqualFolder(folderPath, tab.path));
  },
  closeTabForDeletedFile: (fileRelPath: string) => {
    closeTabWithoutConfirmation(fileRelPath);
  },
  openFile: (relativePath: string) => handleSelectFile(relativePath),
};
```

- [ ] **Step 9: Add `confirmDialogState` and `settleConfirmation` to the returned `page` reactive object**

Find the `const page = reactive({` block. Add:
```ts
confirmDialogState,
settleConfirmation,
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors from `useExplorerFilePage.ts`.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/modules/explorer/useExplorerFilePage.ts
git commit -m "feat(desktop): make useExplorerFilePage self-contained, remove shell parameter"
```

---

## Task 4: Update `FilePage.vue` — remove inject, add AlertDialog

**Files:**
- Modify: `src/modules/explorer/FilePage.vue`

- [ ] **Step 1: Update the script block**

Replace:
```ts
import { inject } from "vue";
...
import {
  explorerShellKey,
} from "@/modules/explorer/explorerShellContext";
import { useExplorerFilePage } from "@/modules/explorer/useExplorerFilePage";
...
const shell = inject(explorerShellKey);
if (!shell) {
  throw new Error("FilePage requires ExplorerLayout shell (explorerShellKey).");
}
const page = useExplorerFilePage(shell);
```

With:
```ts
import { useExplorerFilePage } from "@/modules/explorer/useExplorerFilePage";
...
const page = useExplorerFilePage();
```

Remove the `inject` import if it is no longer used elsewhere in the file.

- [ ] **Step 2: Add AlertDialog imports to the script block**

Add to imports:
```ts
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
```

(`Button` may already be imported — skip if so.)

- [ ] **Step 3: Add the AlertDialog to the template**

At the very end of the template, before the closing `</template>`, add:

```vue
<AlertDialog :open="page.confirmDialogState !== null">
  <AlertDialogContent data-testid="file-page-confirm-dialog">
    <AlertDialogHeader>
      <AlertDialogTitle>{{ page.confirmDialogState?.title }}</AlertDialogTitle>
      <AlertDialogDescription>{{ page.confirmDialogState?.description }}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel as-child>
        <Button
          type="button"
          variant="outline"
          data-testid="file-page-confirm-cancel"
          @click="page.settleConfirmation(false)"
        >
          Cancel
        </Button>
      </AlertDialogCancel>
      <AlertDialogAction as-child>
        <Button
          type="button"
          :variant="page.confirmDialogState?.variant === 'destructive' ? 'destructive' : 'default'"
          data-testid="file-page-confirm-action"
          @click="page.settleConfirmation(true)"
        >
          {{ page.confirmDialogState?.confirmLabel ?? "Continue" }}
        </Button>
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors from `FilePage.vue`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/explorer/FilePage.vue
git commit -m "feat(desktop): FilePage calls useExplorerFilePage directly, owns discard dialog"
```

---

## Task 5: Update `ExplorerLayout.vue` — remove provide, register sidebar bridge

**Files:**
- Modify: `src/modules/explorer/ExplorerLayout.vue`

- [ ] **Step 1: Remove shell construction and provide**

Find and delete this block entirely:
```ts
const shell: ExplorerShell = {
  wtPath,
  wtId,
  allFiles,
  sidebarCollapsed,
  expandSidebar,
  focusSearchInput,
  requestConfirmation,
  worktreeEpoch,
  reloadFileSummaries: () => loadFileSummaries(true),
};

provide(explorerShellKey, shell);
```

- [ ] **Step 2: Remove unused imports**

Remove from the import list:
```ts
import {
  explorerShellKey,
  type ExplorerShell,
} from "@/modules/explorer/explorerShellContext";
```

Remove `provide` from the vue import (if it is no longer used elsewhere).

- [ ] **Step 3: Add sidebar bridge imports and registration**

Add import:
```ts
import {
  sidebarCollapsedState,
  registerSidebarActions,
} from "@/modules/explorer/explorerSidebarBridge";
```

Add a watch to sync the `defineModel` ref with the module-level state (add after `sidebarCollapsed` is defined):
```ts
watch(sidebarCollapsed, (v) => { sidebarCollapsedState.value = v; }, { immediate: true });
watch(sidebarCollapsedState, (v) => { sidebarCollapsed.value = v; });
```

In `onMounted`, add the sidebar registration (at the top of the onMounted block):
```ts
registerSidebarActions({ expandSidebar, focusSearchInput });
```

In `onUnmounted`, add:
```ts
registerSidebarActions(null);
```

- [ ] **Step 4: Update `openWorkspaceFile` in `defineExpose`**

Replace:
```ts
openWorkspaceFile: handleSelectFile,
```
With:
```ts
openWorkspaceFile: (relativePath: string) =>
  getExplorerEditorBridge()?.openFile(relativePath) ?? Promise.resolve(),
```

Ensure `getExplorerEditorBridge` is imported from `explorerEditorBridge`.

- [ ] **Step 5: Verify TypeScript compiles clean**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/modules/explorer/ExplorerLayout.vue
git commit -m "feat(desktop): ExplorerLayout removes provide, registers sidebar bridge"
```

---

## Task 6: Clean up context files

**Files:**
- Delete: `src/modules/explorer/explorerShellContext.ts`
- Modify: `src/modules/explorer/fileSearchEditorPageContext.ts`

- [ ] **Step 1: Remove `explorerShellContext.ts`**

```bash
rm apps/desktop/src/modules/explorer/explorerShellContext.ts
```

- [ ] **Step 2: Remove `fileSearchEditorPageKey` from `fileSearchEditorPageContext.ts`**

In `fileSearchEditorPageContext.ts`, remove:
```ts
import type { InjectionKey } from "vue";
```
and
```ts
export const fileSearchEditorPageKey: InjectionKey<FileSearchEditorPageViewModel> =
  Symbol("fileSearchEditorPage");
```

Keep the `FileSearchEditorPageViewModel` interface and `ExplorerOpenFileTab` type — they are still used as return types.

- [ ] **Step 3: Verify TypeScript compiles clean**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A apps/desktop/src/modules/explorer/
git commit -m "chore(desktop): delete explorerShellContext, strip injection key from fileSearchEditorPageContext"
```

---

## Task 7: Update `FileSearchEditor.test.ts`

The tests currently mount `ExplorerLayout` (which provided the shell). After the refactor, `useExplorerFilePage` reads from the Pinia workspace store via `useActiveWorkspace()`, so tests must populate the store instead of passing `worktreePath`/`worktreeId` props.

**Files:**
- Modify: `src/components/__tests__/FileSearchEditor.test.ts`

- [ ] **Step 1: Identify every `worktreePath` / `worktreeId` prop usage in tests**

```bash
grep -n "worktreePath\|worktreeId" apps/desktop/src/components/__tests__/FileSearchEditor.test.ts
```
Note the line numbers.

- [ ] **Step 2: Add a workspace store helper at the top of the test file**

Find the `beforeEach` that calls `createPinia, setActivePinia`. Add a helper function after it:

```ts
import { useWorkspaceStore } from "@/stores/workspaceStore"; // adjust import to match actual store path

function setActiveWorktree(worktreeId: string, worktreePath: string): void {
  const store = useWorkspaceStore();
  // Set the minimal store state required for useActiveWorkspace to return wtPath/wtId.
  // Look at useActiveWorkspace to know which store fields to set.
  store.$patch({
    activeWorktreeId: worktreeId,
    worktrees: [{ id: worktreeId, path: worktreePath, isDefault: true, projectId: "proj-1" }],
    activeProjectId: "proj-1",
  });
}
```

Adjust the `$patch` shape to match the actual store structure (check `src/stores/workspaceStore.ts` or equivalent).

- [ ] **Step 3: Replace prop-based setup with store-based setup**

For every test or `beforeEach` that previously did:
```ts
mount(ExplorerLayout, {
  props: { worktreePath: "/some/path", worktreeId: "wt-1" }
})
```

Change to:
```ts
setActiveWorktree("wt-1", "/some/path");
mount(ExplorerLayout, {});
```

- [ ] **Step 4: Remove any `provide` of `explorerShellKey` or `fileSearchEditorPageKey` in tests**

Search for:
```bash
grep -n "explorerShellKey\|fileSearchEditorPageKey" apps/desktop/src/components/__tests__/FileSearchEditor.test.ts
```

Delete any provide/inject setup for these keys — they no longer exist.

- [ ] **Step 5: Run the test suite**

```bash
cd apps/desktop && npx vitest run src/components/__tests__/FileSearchEditor.test.ts 2>&1 | tail -40
```
Expected: all tests pass or produce test failures (not TypeScript/import errors).

Fix any test failures one at a time. Common causes after this refactor:
- Test expects error "FilePage requires ExplorerLayout shell" — delete that test or update to verify no error.
- `page` properties accessed via wrong key — check that `page.confirmDialogState` is used instead of `page.confirmAction`.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/__tests__/FileSearchEditor.test.ts
git commit -m "test(desktop): update FileSearchEditor tests for shell-free architecture"
```

---

## Task 8: Final smoke test

- [ ] **Step 1: Full TypeScript check**

```bash
cd apps/desktop && npx tsc --noEmit 2>&1
```
Expected: zero errors.

- [ ] **Step 2: Full test suite**

```bash
cd apps/desktop && npx vitest run 2>&1 | tail -30
```
Expected: all tests pass.

- [ ] **Step 3: Verify no remaining references to deleted symbols**

```bash
grep -r "explorerShellKey\|fileSearchEditorPageKey\|ExplorerShell\b" apps/desktop/src --include="*.ts" --include="*.vue" -l
```
Expected: no output (no files reference these symbols).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(desktop): complete ExplorerLayout/FilePage separation — no provide/inject"
```
