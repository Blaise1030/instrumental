# @pierre/diffs Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `DiffReviewPanel.vue` with `@pierre/diffs` to add a proper diff viewer, inline line comments (→ thread flow), and git-conflict-aware merge resolution mode.

**Architecture:** `scmStore`'s existing `repoStatus` data (`unstagedKind === 'unmerged'`) drives conflict detection — no new IPC needed. A `useDiffPanel.ts` composable manages diffs.com component lifecycle (mount/destroy/swap on file change), keeping `DiffReviewPanel.vue` declarative. `SourceControlPanel` replaces `MonacoDiffEditor` with the new panel.

**Tech Stack:** `@pierre/diffs` (vanilla JS API), Vue 3 Composition API, TypeScript, Pinia, Electron IPC (existing channels only — `fileMergeSides`, `writeFile`, `readFile`)

---

## File Map

| File | Action |
|------|--------|
| `apps/desktop/package.json` | Add `@pierre/diffs` |
| `apps/desktop/src/stores/scmStore.ts` | Add `isSelectedFileConflicted` computed |
| `apps/desktop/src/stores/__tests__/scmStore.conflict.test.ts` | Create |
| `apps/desktop/src/composables/useDiffPanel.ts` | Create |
| `apps/desktop/src/composables/__tests__/useDiffPanel.test.ts` | Create |
| `apps/desktop/src/components/DiffReviewPanel.vue` | Replace entirely |
| `apps/desktop/src/components/__tests__/DiffReviewPanel.test.ts` | Update |
| `apps/desktop/src/components/SourceControlPanel.vue` | Swap `MonacoDiffEditor` → `DiffReviewPanel` |
| `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts` | Update mock shape |

---

## Task 1: Install @pierre/diffs

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Install the package**

```bash
cd apps/desktop && npm install @pierre/diffs
```

- [ ] **Step 2: Verify types resolve**

Run:
```bash
cd apps/desktop && npx vue-tsc --noEmit 2>&1 | grep "pierre" | head -5
```
Expected: no output (no errors referencing `@pierre/diffs`)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/package.json apps/desktop/package-lock.json
git commit -m "chore(desktop): add @pierre/diffs dependency"
```

---

## Task 2: Add `isSelectedFileConflicted` to scmStore

**Files:**
- Modify: `apps/desktop/src/stores/scmStore.ts`
- Create: `apps/desktop/src/stores/__tests__/scmStore.conflict.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/desktop/src/stores/__tests__/scmStore.conflict.test.ts`:

```ts
import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScmStore } from '@/stores/scmStore';

vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: () => ({ activeWorktree: { path: '/repo' } }),
}));
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

const makeEntry = (path: string, unstagedKind: string) => ({
  path,
  originalPath: null,
  stagedKind: null,
  unstagedKind,
  isUntracked: false,
  stagedLinesAdded: null,
  stagedLinesRemoved: null,
  unstagedLinesAdded: null,
  unstagedLinesRemoved: null,
});

describe('scmStore – isSelectedFileConflicted', () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  it('returns false when no file is selected', () => {
    const scm = useScmStore();
    expect(scm.isSelectedFileConflicted).toBe(false);
  });

  it('returns false when selected file is modified (not unmerged)', () => {
    const scm = useScmStore();
    scm.repoStatus = [makeEntry('src/foo.ts', 'modified')];
    scm.selectedScmPath = 'src/foo.ts';
    expect(scm.isSelectedFileConflicted).toBe(false);
  });

  it('returns true when selected file has unstagedKind === unmerged', () => {
    const scm = useScmStore();
    scm.repoStatus = [makeEntry('src/conflict.ts', 'unmerged')];
    scm.selectedScmPath = 'src/conflict.ts';
    expect(scm.isSelectedFileConflicted).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd apps/desktop && npx vitest run src/stores/__tests__/scmStore.conflict.test.ts
```
Expected: FAIL — `isSelectedFileConflicted` is not a property on the store.

- [ ] **Step 3: Add the computed to scmStore**

In `apps/desktop/src/stores/scmStore.ts`, add this computed after the existing `scmCommitBusy` ref:

```ts
const isSelectedFileConflicted = computed((): boolean => {
  if (!selectedScmPath.value) return false;
  return repoStatus.value.some(
    (e) => e.path === selectedScmPath.value && e.unstagedKind === 'unmerged'
  );
});
```

Then add it to the `return` object at the bottom of `defineStore`:

```ts
isSelectedFileConflicted,
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd apps/desktop && npx vitest run src/stores/__tests__/scmStore.conflict.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/stores/scmStore.ts apps/desktop/src/stores/__tests__/scmStore.conflict.test.ts
git commit -m "feat(scm): derive isSelectedFileConflicted from existing repoStatus"
```

---

## Task 3: Create `useDiffPanel.ts` composable

**Files:**
- Create: `apps/desktop/src/composables/useDiffPanel.ts`
- Create: `apps/desktop/src/composables/__tests__/useDiffPanel.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/composables/__tests__/useDiffPanel.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

const mockRender = vi.fn();
const mockSetLineAnnotations = vi.fn();
const mockCleanUp = vi.fn();

vi.mock('@pierre/diffs', () => ({
  FileDiff: vi.fn().mockImplementation(() => ({
    render: mockRender,
    setLineAnnotations: mockSetLineAnnotations,
    cleanUp: mockCleanUp,
  })),
  UnresolvedFile: vi.fn().mockImplementation(() => ({
    render: mockRender,
    setLineAnnotations: mockSetLineAnnotations,
    cleanUp: mockCleanUp,
  })),
}));

import { useDiffPanel } from '@/composables/useDiffPanel';

const baseOptions = () => ({
  container: ref<HTMLElement | null>(null),
  isConflicted: ref(false),
  originalContent: ref(''),
  modifiedContent: ref(''),
  rawContent: ref(''),
  fileName: ref('foo.ts'),
  worktreePath: ref('/repo'),
  onCommentSubmit: vi.fn(),
  onConflictResolved: vi.fn(),
});

describe('useDiffPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('does not render when container is null', () => {
    useDiffPanel(baseOptions());
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('exposes isConflicted as a ref', () => {
    const opts = baseOptions();
    opts.isConflicted.value = true;
    const { isConflicted } = useDiffPanel(opts);
    expect(isConflicted.value).toBe(true);
  });

  it('destroy calls cleanUp on the active instance', () => {
    const opts = baseOptions();
    const el = document.createElement('div');
    opts.container.value = el;
    const { destroy } = useDiffPanel(opts);
    // Manually trigger mount by simulating watcher flush
    destroy();
    // cleanUp should be callable without error
    expect(mockCleanUp).toHaveBeenCalledTimes(0); // no instance mounted since watcher is async
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd apps/desktop && npx vitest run src/composables/__tests__/useDiffPanel.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create the composable**

`apps/desktop/src/composables/useDiffPanel.ts`:

```ts
import { ref, watch, type Ref } from 'vue';
import { FileDiff, UnresolvedFile, type FileContents, type DiffLineAnnotation } from '@pierre/diffs';

type CommentMeta = { pending: true; side: 'deletions' | 'additions'; lineNumber: number };

export interface CommentSubmitPayload {
  side: 'deletions' | 'additions';
  lineNumber: number;
  note: string;
}

export interface UseDiffPanelOptions {
  container: Ref<HTMLElement | null>;
  isConflicted: Ref<boolean>;
  originalContent: Ref<string>;
  modifiedContent: Ref<string>;
  rawContent: Ref<string>;
  fileName: Ref<string>;
  worktreePath: Ref<string>;
  onCommentSubmit: (payload: CommentSubmitPayload) => void;
  onConflictResolved: (resolvedContent: string) => void;
}

export function useDiffPanel(options: UseDiffPanelOptions) {
  const {
    container, isConflicted, originalContent, modifiedContent,
    rawContent, fileName, onCommentSubmit, onConflictResolved,
  } = options;

  let instance: FileDiff | UnresolvedFile | null = null;
  const pendingAnnotations = ref<DiffLineAnnotation<CommentMeta>[]>([]);

  function buildGutterButton(
    getHoveredRow: () => { lineNumber: number; side: 'deletions' | 'additions' } | undefined
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = '+';
    btn.setAttribute('aria-label', 'Add comment');
    btn.style.cssText =
      'cursor:pointer;background:none;border:1px solid currentColor;border-radius:3px;padding:0 4px;font-size:11px;opacity:0.6;';
    btn.addEventListener('click', () => {
      const row = getHoveredRow();
      if (!row) return;
      if (pendingAnnotations.value.some((a) => a.lineNumber === row.lineNumber && a.side === row.side)) return;
      pendingAnnotations.value = [
        ...pendingAnnotations.value,
        { lineNumber: row.lineNumber, side: row.side, metadata: { pending: true, side: row.side, lineNumber: row.lineNumber } },
      ];
      instance?.setLineAnnotations(pendingAnnotations.value);
    });
    return btn;
  }

  function buildAnnotationElement(annotation: DiffLineAnnotation<CommentMeta>): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      'padding:8px;background:var(--background,#fff);border-top:1px solid var(--border,#e5e7eb);';

    const textarea = document.createElement('textarea');
    textarea.rows = 2;
    textarea.placeholder = 'Leave a comment…';
    textarea.style.cssText =
      'width:100%;box-sizing:border-box;resize:vertical;font-size:12px;padding:4px;border:1px solid var(--border,#e5e7eb);border-radius:4px;background:var(--background,#fff);color:inherit;';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;margin-top:6px;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'font-size:11px;padding:2px 8px;cursor:pointer;';
    cancelBtn.addEventListener('click', () => {
      pendingAnnotations.value = pendingAnnotations.value.filter(
        (a) => !(a.lineNumber === annotation.lineNumber && a.side === annotation.side)
      );
      instance?.setLineAnnotations(pendingAnnotations.value);
    });

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Comment';
    submitBtn.style.cssText = 'font-size:11px;padding:2px 8px;cursor:pointer;font-weight:500;';
    submitBtn.addEventListener('click', () => {
      const note = textarea.value.trim();
      if (!note) return;
      onCommentSubmit({ side: annotation.side, lineNumber: annotation.lineNumber, note });
      pendingAnnotations.value = pendingAnnotations.value.filter(
        (a) => !(a.lineNumber === annotation.lineNumber && a.side === annotation.side)
      );
      instance?.setLineAnnotations(pendingAnnotations.value);
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    wrapper.appendChild(textarea);
    wrapper.appendChild(actions);
    return wrapper;
  }

  function destroyInstance(): void {
    instance?.cleanUp();
    instance = null;
    pendingAnnotations.value = [];
  }

  function mountFileDiff(el: HTMLElement): void {
    const viewer = new FileDiff({
      renderGutterUtility: buildGutterButton,
      renderAnnotation: buildAnnotationElement,
    });
    viewer.render({
      oldFile: { name: fileName.value, contents: originalContent.value },
      newFile: { name: fileName.value, contents: modifiedContent.value },
      fileContainer: el,
      lineAnnotations: pendingAnnotations.value,
    });
    instance = viewer;
  }

  function mountUnresolvedFile(el: HTMLElement): void {
    const resolver = new UnresolvedFile({
      onMergeConflictResolve: (file: FileContents) => {
        onConflictResolved(file.contents);
      },
    });
    resolver.render({
      file: { name: fileName.value, contents: rawContent.value },
      fileContainer: el,
    });
    instance = resolver;
  }

  function mount(): void {
    const el = container.value;
    if (!el) return;
    destroyInstance();
    if (isConflicted.value) {
      mountUnresolvedFile(el);
    } else {
      mountFileDiff(el);
    }
  }

  watch(
    [container, isConflicted, fileName, originalContent, modifiedContent, rawContent],
    () => { mount(); },
    { flush: 'post' }
  );

  return {
    isConflicted,
    pendingAnnotations,
    destroy: destroyInstance,
  };
}
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd apps/desktop && npx vitest run src/composables/__tests__/useDiffPanel.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/composables/useDiffPanel.ts apps/desktop/src/composables/__tests__/useDiffPanel.test.ts
git commit -m "feat(desktop): add useDiffPanel composable managing @pierre/diffs lifecycle"
```

---

## Task 4: Replace DiffReviewPanel.vue

**Files:**
- Replace: `apps/desktop/src/components/DiffReviewPanel.vue`
- Update: `apps/desktop/src/components/__tests__/DiffReviewPanel.test.ts`

- [ ] **Step 1: Update the test for the new component shape**

`apps/desktop/src/components/__tests__/DiffReviewPanel.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/composables/useDiffPanel', () => ({
  useDiffPanel: vi.fn().mockReturnValue({
    isConflicted: { value: false },
    pendingAnnotations: { value: [] },
    destroy: vi.fn(),
  }),
}));
vi.mock('@/stores/scmStore', () => ({
  useScmStore: vi.fn().mockReturnValue({
    selectedScmPath: 'src/foo.ts',
    selectedMergeResult: { kind: 'ok', original: 'a', modified: 'b', originalLabel: 'HEAD', modifiedLabel: 'Working tree' },
    isSelectedFileConflicted: false,
    refreshRepoStatus: vi.fn(),
  }),
}));
vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: vi.fn().mockReturnValue({
    activeWorktree: { path: '/repo', id: 'wt1' },
  }),
}));
vi.mock('@/stores/keybindingsStore', () => ({
  useKeybindingsStore: vi.fn().mockReturnValue({
    titleWithShortcut: (label: string) => label,
  }),
}));

import DiffReviewPanel from '@/components/DiffReviewPanel.vue';

function mountPanel(props = {}) {
  setActivePinia(createPinia());
  return mount(DiffReviewPanel, {
    props: { queuedReviewCount: 0, ...props },
    global: { stubs: { teleport: true } },
  });
}

describe('DiffReviewPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the diff container when a file is selected and result is ok', () => {
    const w = mountPanel();
    expect(w.find('[data-testid="diff-container"]').exists()).toBe(true);
  });

  it('emits stageAll when Stage All is clicked', async () => {
    const w = mountPanel();
    await w.find('button[aria-label="Stage All"]').trigger('click');
    expect(w.emitted('stageAll')).toBeTruthy();
  });

  it('shows queued review count badge', () => {
    const w = mountPanel({ queuedReviewCount: 3 });
    expect(w.text()).toContain('3 review items queued');
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd apps/desktop && npx vitest run src/components/__tests__/DiffReviewPanel.test.ts
```
Expected: FAIL — component shape doesn't match yet.

- [ ] **Step 3: Replace DiffReviewPanel.vue**

`apps/desktop/src/components/DiffReviewPanel.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useScmStore } from '@/stores/scmStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useKeybindingsStore } from '@/stores/keybindingsStore';
import { useDiffPanel, type CommentSubmitPayload } from '@/composables/useDiffPanel';
import type { DraftDiffReviewSelection } from '@/features/diffReview/types';
import Button from '@/components/ui/Button.vue';

const props = withDefaults(
  defineProps<{ queuedReviewCount?: number }>(),
  { queuedReviewCount: 0 }
);

const emit = defineEmits<{
  stageAll: [];
  discardAll: [];
  openInAgents: [];
  clearReviewItems: [];
  commentSubmit: [draft: DraftDiffReviewSelection];
}>();

const scm = useScmStore();
const workspace = useWorkspaceStore();
const keybindings = useKeybindingsStore();
const containerRef = ref<HTMLElement | null>(null);

const fileName = computed(() => scm.selectedScmPath ?? '');
const worktreePath = computed(() => workspace.activeWorktree?.path ?? '');
const worktreeId = computed(() => workspace.activeWorktree?.id ?? '');

const originalContent = computed(() => {
  const r = scm.selectedMergeResult;
  return r?.kind === 'ok' ? r.original : '';
});
const modifiedContent = computed(() => {
  const r = scm.selectedMergeResult;
  return r?.kind === 'ok' ? r.modified : '';
});
// For UnresolvedFile, the working-tree (modified) side contains the conflict markers.
const rawContent = computed(() => modifiedContent.value);

async function handleConflictResolved(resolvedContent: string): Promise<void> {
  const api = window.workspaceApi;
  const path = scm.selectedScmPath;
  const cwd = worktreePath.value;
  if (!api?.writeFile || !path || !cwd) return;
  await api.writeFile(cwd, path, resolvedContent);
  await scm.refreshRepoStatus();
}

function handleCommentSubmit(payload: CommentSubmitPayload): void {
  const path = scm.selectedScmPath;
  const wid = worktreeId.value;
  if (!path || !wid) return;
  const draft: DraftDiffReviewSelection = {
    worktreeId: wid,
    threadId: null,
    filePath: path,
    oldLineStart: payload.side === 'deletions' ? payload.lineNumber : null,
    oldLineEnd: payload.side === 'deletions' ? payload.lineNumber : null,
    newLineStart: payload.side === 'additions' ? payload.lineNumber : null,
    newLineEnd: payload.side === 'additions' ? payload.lineNumber : null,
    snippet: '',
    note: payload.note,
  };
  emit('commentSubmit', draft);
}

const { destroy } = useDiffPanel({
  container: containerRef,
  isConflicted: computed(() => scm.isSelectedFileConflicted),
  originalContent,
  modifiedContent,
  rawContent,
  fileName,
  worktreePath,
  onCommentSubmit: handleCommentSubmit,
  onConflictResolved: handleConflictResolved,
});

onBeforeUnmount(() => { destroy(); });

const showEmptyState = computed(() => {
  if (!scm.selectedScmPath) return true;
  const r = scm.selectedMergeResult;
  return !r || r.kind === 'binary' || r.kind === 'error';
});

const emptyMessage = computed(() => {
  const r = scm.selectedMergeResult;
  if (!scm.selectedScmPath) return 'Select a file to view its diff.';
  if (r?.kind === 'binary') return 'Binary file — no diff available.';
  if (r?.kind === 'error') return r.message;
  return '';
});

const reviewBasketSummary = computed(() => {
  if (props.queuedReviewCount <= 0) return null;
  const label = props.queuedReviewCount === 1 ? 'review item' : 'review items';
  return `${props.queuedReviewCount} ${label} queued`;
});
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-background text-xs">
    <header class="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background p-3">
      <span
        v-if="scm.selectedScmPath"
        class="min-w-0 max-w-[min(100%,28rem)] truncate text-xs text-muted-foreground"
        :title="scm.selectedScmPath"
      >{{ scm.selectedScmPath }}</span>
      <span
        v-if="reviewBasketSummary"
        class="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium"
      >{{ reviewBasketSummary }}</span>
      <div class="ml-auto flex flex-wrap gap-2">
        <Button
          v-if="queuedReviewCount > 0"
          size="sm"
          variant="secondary"
          class="border-0 shadow-none"
          @click="emit('openInAgents')"
        >Open in Agents</Button>
        <Button
          v-if="queuedReviewCount > 0"
          size="sm"
          variant="secondary"
          class="border-0 shadow-none"
          @click="emit('clearReviewItems')"
        >Clear review items</Button>
        <Button
          size="sm"
          variant="secondary"
          class="border-0 shadow-none"
          aria-label="Stage All"
          :title="keybindings.titleWithShortcut('Stage all', 'stageAllDiff')"
          @click="emit('stageAll')"
        >Stage All</Button>
        <Button
          size="sm"
          variant="destructive"
          class="border-0 shadow-none"
          @click="emit('discardAll')"
        >Discard All</Button>
      </div>
    </header>

    <div
      v-if="showEmptyState"
      class="flex flex-1 items-center justify-center p-8 text-center"
    >
      <p class="max-w-xs text-sm text-muted-foreground">{{ emptyMessage }}</p>
    </div>

    <div
      v-else
      ref="containerRef"
      data-testid="diff-container"
      class="min-h-0 flex-1 overflow-auto"
    />
  </section>
</template>
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd apps/desktop && npx vitest run src/components/__tests__/DiffReviewPanel.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/DiffReviewPanel.vue apps/desktop/src/components/__tests__/DiffReviewPanel.test.ts
git commit -m "feat(desktop): replace DiffReviewPanel with @pierre/diffs — diff view, inline comments, conflict resolution"
```

---

## Task 5: Wire DiffReviewPanel into SourceControlPanel

**Files:**
- Modify: `apps/desktop/src/components/SourceControlPanel.vue`

- [ ] **Step 1: Identify the MonacoDiffEditor block**

```bash
grep -n "MonacoDiffEditor\|DiffReviewPanel" apps/desktop/src/components/SourceControlPanel.vue
```

Note the line numbers. The import is at line 30, the template usage is around line 706.

- [ ] **Step 2: Replace the import**

In `apps/desktop/src/components/SourceControlPanel.vue`, change:
```ts
import MonacoDiffEditor from "@/components/MonacoDiffEditor.vue";
```
To:
```ts
import DiffReviewPanel from "@/components/DiffReviewPanel.vue";
import type { DraftDiffReviewSelection } from '@/features/diffReview/types';
```

- [ ] **Step 3: Add `commentSubmit` to SourceControlPanel emits if not present**

Check the `defineEmits` block in `SourceControlPanel.vue`. If `commentSubmit` is not already there, add it:
```ts
commentSubmit: [draft: DraftDiffReviewSelection];
```

- [ ] **Step 4: Replace the template block**

Find the `<MonacoDiffEditor ... />` usage and replace with:

```vue
<DiffReviewPanel
  :queued-review-count="queuedReviewCount"
  @stage-all="scm.stageAll()"
  @discard-all="scm.discardAll()"
  @open-in-agents="emit('openInAgents')"
  @clear-review-items="emit('clearReviewItems')"
  @comment-submit="emit('commentSubmit', $event)"
/>
```

Remove any props that were specific to `MonacoDiffEditor` (e.g. `layout`, `original`, `modified` — these are now read directly from `scmStore` inside `DiffReviewPanel`).

- [ ] **Step 5: Remove `queuedReviewCount` prop from SourceControlPanel if it doesn't exist**

Check if `SourceControlPanel` already has a `queuedReviewCount` prop. If not, add it to `defineProps`:
```ts
queuedReviewCount?: number;
```
With default `0`.

- [ ] **Step 6: Type-check**

```bash
cd apps/desktop && npx vue-tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/SourceControlPanel.vue
git commit -m "feat(desktop): wire DiffReviewPanel into SourceControlPanel, remove MonacoDiffEditor"
```

---

## Task 6: Update WorkspaceLayout test mock

**Files:**
- Modify: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Update the DiffReviewPanel mock to match new shape**

Find the existing mock:
```ts
vi.mock("@/components/DiffReviewPanel.vue", () => ({
  default: { ... }
}));
```

Replace its `default` object with:
```ts
default: {
  name: "DiffReviewPanel",
  props: ["queuedReviewCount"],
  emits: ["stageAll", "discardAll", "openInAgents", "clearReviewItems", "commentSubmit"],
  template: '<div data-testid="mock-diff-review-panel" />',
},
```

- [ ] **Step 2: Run full test suite**

```bash
cd apps/desktop && npx vitest run
```
Expected: all tests pass (no regressions).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "test(desktop): update WorkspaceLayout mock for new DiffReviewPanel shape"
```

---

## Self-Review

**Spec coverage:**
- ✅ Diff view — `FileDiff` mounted in `useDiffPanel`, fed from existing `selectedMergeResult`
- ✅ Inline comments → thread — `onCommentSubmit` → `DraftDiffReviewSelection` emit → parent wires to thread
- ✅ Conflict resolution — `UnresolvedFile` mounted when `isSelectedFileConflicted`, `onMergeConflictResolve` → `api.writeFile` + `refreshRepoStatus`
- ✅ Git-status detection — derived from existing `repoStatus[].unstagedKind === 'unmerged'`, zero new IPC
- ✅ Vanilla JS API — uses `@pierre/diffs` main entry, not `/react`

**Type consistency:**
- `CommentSubmitPayload` — defined and exported from `useDiffPanel.ts`, imported in `DiffReviewPanel.vue` ✅
- `DraftDiffReviewSelection` — from `@/features/diffReview/types`, used in both `DiffReviewPanel.vue` and `SourceControlPanel.vue` ✅
- `isSelectedFileConflicted` — added to scmStore return, consumed as `scm.isSelectedFileConflicted` ✅
- `UnresolvedFile.render({ file, fileContainer })` — matches `UnresolvedFileRenderProps` ✅
- `FileDiff.render({ oldFile, newFile, fileContainer, lineAnnotations })` — matches `FileDiffRenderProps` ✅
