# Context Queue — All Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the "Add to Chat" context queue popup into FilesExplorer (file editor), Terminal, Agent, Local PR diff/commit, and Remote PR diff/comments.

**Architecture:** (1) Provide `injectContextToAgentKey` once in `Layout.vue` so all child routes can call PTY write. (2) Two new composables in `src/modules/contextQueue/` — `useTerminalSelectionQueue` for xterm surfaces and `useDomSelectionQueue` for HTML surfaces — each expose `{ visible, anchor, onMouseUp, buildItem, dismiss }`. (3) Each surface renders `ContextQueueSelectionPopup`, injects the key, builds a `QueueItem`, and calls `injectContextToAgent`.

**Tech Stack:** Vue 3 Composition API, Vitest, xterm.js (`Terminal`), `ContextQueueSelectionPopup`, `buildPasteText`, `clampPopupRect`, `injectContextToAgentKey` / `openWorkspaceFileKey` (Vue injection keys)

---

## File Map

| File | Action |
|------|--------|
| `src/layouts/Layout.vue` | Modify — add `provide(injectContextToAgentKey, ...)` + `provide(openWorkspaceFileKey, ...)` |
| `src/modules/contextQueue/useTerminalSelectionQueue.ts` | Create |
| `src/modules/contextQueue/__tests__/useTerminalSelectionQueue.test.ts` | Create |
| `src/modules/contextQueue/useDomSelectionQueue.ts` | Create |
| `src/modules/contextQueue/__tests__/useDomSelectionQueue.test.ts` | Create |
| `src/modules/agent/components/TerminalPane.vue` | Modify — add `agentTab` prop + popup |
| `src/modules/agent/components/AgentPane.vue` | Modify — pass `:agent-tab="true"` |
| `src/modules/git/pages/GitLocalChangesPage.vue` | Modify — diff queue + commit textarea queue |
| `src/modules/git/pages/GitRemoteChangesPage.vue` | Modify — PR diff queue |

---

## Task 1: `useTerminalSelectionQueue` composable

**Files:**
- Create: `src/modules/contextQueue/useTerminalSelectionQueue.ts`
- Create: `src/modules/contextQueue/__tests__/useTerminalSelectionQueue.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/modules/contextQueue/__tests__/useTerminalSelectionQueue.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { useTerminalSelectionQueue } from "../useTerminalSelectionQueue";

function makeTerminal(selection = "") {
  return { getSelection: vi.fn().mockReturnValue(selection) } as any;
}

describe("useTerminalSelectionQueue", () => {
  it("shows popup with non-empty selection on mouseup", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => makeTerminal("hello world") });
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 100, clientY: 200 }));
    expect(q.visible.value).toBe(true);
    expect(q.anchor.value).toEqual({ left: 100, top: 200, width: 0, height: 0 });
  });

  it("hides popup when selection is empty on mouseup", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => makeTerminal("") });
    q.visible.value = true;
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 0, clientY: 0 }));
    expect(q.visible.value).toBe(false);
  });

  it("hides popup when terminal is null", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => null });
    q.onMouseUp(new MouseEvent("mouseup"));
    expect(q.visible.value).toBe(false);
  });

  it("dismiss clears visible and anchor", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => makeTerminal("x") });
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 5, clientY: 5 }));
    q.dismiss();
    expect(q.visible.value).toBe(false);
    expect(q.anchor.value).toBeNull();
  });

  it("buildItem returns QueueItem with source terminal and correct pasteText", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => makeTerminal("some text") });
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 0, clientY: 0 }));
    const item = q.buildItem();
    expect(item.source).toBe("terminal");
    expect(item.pasteText).toContain("some text");
    expect(item.pasteText).toContain("[terminal]");
    expect(typeof item.id).toBe("string");
  });

  it("buildItem uses [Agent Tab] prefix when agentTab is true", () => {
    const q = useTerminalSelectionQueue({
      getTerminal: () => makeTerminal("output"),
      agentTab: true,
    });
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 0, clientY: 0 }));
    const item = q.buildItem();
    expect(item.pasteText).toContain("[Agent Tab]");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/desktop && npx vitest run src/modules/contextQueue/__tests__/useTerminalSelectionQueue.test.ts
```

Expected: `Cannot find module '../useTerminalSelectionQueue'`

- [ ] **Step 3: Create the composable**

Create `src/modules/contextQueue/useTerminalSelectionQueue.ts`:

```ts
import { ref } from "vue";
import type { Terminal } from "xterm";
import { buildPasteText } from "@/contextQueue/formatters";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/utils/contextQueueAnchor";

export type TerminalSelectionQueueOpts = {
  getTerminal: () => Terminal | null;
  agentTab?: boolean;
  sessionLabel?: string;
};

export function useTerminalSelectionQueue(opts: TerminalSelectionQueueOpts) {
  const visible = ref(false);
  const anchor = ref<Rect | null>(null);
  const pendingText = ref("");

  function onMouseUp(e: MouseEvent): void {
    const text = opts.getTerminal()?.getSelection() ?? "";
    if (!text.trim()) {
      visible.value = false;
      return;
    }
    pendingText.value = text;
    anchor.value = { left: e.clientX, top: e.clientY, width: 0, height: 0 };
    visible.value = true;
  }

  function dismiss(): void {
    visible.value = false;
    anchor.value = null;
  }

  function buildItem(): QueueItem {
    const capture: QueueCapture = {
      source: "terminal",
      selectedText: pendingText.value,
      agentTab: opts.agentTab,
      sessionLabel: opts.sessionLabel,
    };
    return {
      id: crypto.randomUUID(),
      source: "terminal",
      pasteText: buildPasteText(capture),
      meta: {},
    };
  }

  return { visible, anchor, onMouseUp, dismiss, buildItem };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run src/modules/contextQueue/__tests__/useTerminalSelectionQueue.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/contextQueue/useTerminalSelectionQueue.ts \
        apps/desktop/src/modules/contextQueue/__tests__/useTerminalSelectionQueue.test.ts
git commit -m "feat: add useTerminalSelectionQueue composable"
```

---

## Task 2: `useDomSelectionQueue` composable

**Files:**
- Create: `src/modules/contextQueue/useDomSelectionQueue.ts`
- Create: `src/modules/contextQueue/__tests__/useDomSelectionQueue.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/modules/contextQueue/__tests__/useDomSelectionQueue.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDomSelectionQueue } from "../useDomSelectionQueue";

function mockSelection(text: string, rect = { left: 50, top: 80, width: 120, height: 20 }) {
  const mockRange = { getBoundingClientRect: () => rect };
  const mockSel = {
    toString: () => text,
    rangeCount: text ? 1 : 0,
    getRangeAt: () => mockRange,
  };
  vi.spyOn(window, "getSelection").mockReturnValue(mockSel as any);
  return mockSel;
}

afterEach(() => vi.restoreAllMocks());

describe("useDomSelectionQueue", () => {
  it("shows popup with selected text on mouseup", () => {
    mockSelection("hello diff");
    const q = useDomSelectionQueue({ source: "diff" });
    q.onMouseUp();
    expect(q.visible.value).toBe(true);
    expect(q.anchor.value).toEqual({ left: 50, top: 80, width: 120, height: 20 });
  });

  it("hides popup when selection is empty", () => {
    mockSelection("");
    const q = useDomSelectionQueue({ source: "diff" });
    q.visible.value = true;
    q.onMouseUp();
    expect(q.visible.value).toBe(false);
  });

  it("hides popup when getSelection returns null", () => {
    vi.spyOn(window, "getSelection").mockReturnValue(null);
    const q = useDomSelectionQueue({ source: "diff" });
    q.onMouseUp();
    expect(q.visible.value).toBe(false);
  });

  it("dismiss clears visible and anchor", () => {
    mockSelection("text");
    const q = useDomSelectionQueue({ source: "diff" });
    q.onMouseUp();
    q.dismiss();
    expect(q.visible.value).toBe(false);
    expect(q.anchor.value).toBeNull();
  });

  it("buildItem returns QueueItem with correct source and pasteText", () => {
    mockSelection("diff snippet");
    const q = useDomSelectionQueue({ source: "diff", getFilePath: () => "src/foo.ts" });
    q.onMouseUp();
    const item = q.buildItem();
    expect(item.source).toBe("diff");
    expect(item.pasteText).toContain("[diff]");
    expect(item.pasteText).toContain("diff snippet");
    expect(item.pasteText).toContain("src/foo.ts");
  });

  it("buildItem uses file source when specified", () => {
    mockSelection("some code");
    const q = useDomSelectionQueue({ source: "file", getFilePath: () => "README.md" });
    q.onMouseUp();
    const item = q.buildItem();
    expect(item.source).toBe("file");
    expect(item.pasteText).toContain("[file]");
  });

  it("buildItem uses empty filePath when getFilePath not provided", () => {
    mockSelection("text");
    const q = useDomSelectionQueue({ source: "diff" });
    q.onMouseUp();
    const item = q.buildItem();
    expect(item.pasteText).toContain("[diff]");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/desktop && npx vitest run src/modules/contextQueue/__tests__/useDomSelectionQueue.test.ts
```

Expected: `Cannot find module '../useDomSelectionQueue'`

- [ ] **Step 3: Create the composable**

Create `src/modules/contextQueue/useDomSelectionQueue.ts`:

```ts
import { ref } from "vue";
import { buildPasteText } from "@/contextQueue/formatters";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/utils/contextQueueAnchor";

export type DomSelectionQueueOpts = {
  source: "diff" | "file";
  getFilePath?: () => string | null;
};

export function useDomSelectionQueue(opts: DomSelectionQueueOpts) {
  const visible = ref(false);
  const anchor = ref<Rect | null>(null);
  const pendingText = ref("");

  function onMouseUp(): void {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!text || !sel?.rangeCount) {
      visible.value = false;
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    pendingText.value = text;
    anchor.value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    visible.value = true;
  }

  function dismiss(): void {
    visible.value = false;
    anchor.value = null;
  }

  function buildItem(): QueueItem {
    const filePath = opts.getFilePath?.() ?? "";
    const capture: QueueCapture =
      opts.source === "diff"
        ? { source: "diff", filePath, selectedText: pendingText.value }
        : { source: "file", filePath, selectedText: pendingText.value };
    return {
      id: crypto.randomUUID(),
      source: opts.source,
      pasteText: buildPasteText(capture),
      meta: filePath ? { filePath } : {},
    };
  }

  return { visible, anchor, onMouseUp, dismiss, buildItem };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run src/modules/contextQueue/__tests__/useDomSelectionQueue.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/contextQueue/useDomSelectionQueue.ts \
        apps/desktop/src/modules/contextQueue/__tests__/useDomSelectionQueue.test.ts
git commit -m "feat: add useDomSelectionQueue composable"
```

---

## Task 3: Provider — `Layout.vue`

**Files:**
- Modify: `src/layouts/Layout.vue`

- [ ] **Step 1: Add imports to `Layout.vue`**

Find the existing import line:
```ts
import { computed, nextTick, ref, watch } from "vue";
```

Replace with:
```ts
import { computed, nextTick, provide, ref, watch } from "vue";
```

Then add these imports after the existing import block (after all other import statements):
```ts
import { injectContextToAgentKey, openWorkspaceFileKey } from "@/contextQueue/injectionKeys";
import { injectContextQueue } from "@/contextQueue/injectContextQueue";
import type { QueueItem } from "@/contextQueue/types";
```

- [ ] **Step 2: Add the `provide()` calls**

Find this line in the `<script setup>` section (around line 88):
```ts
const { activeThreadId, activeWorktreeId } = useActiveWorkspace();
```

Add directly after it:
```ts
provide(injectContextToAgentKey, async (items: QueueItem[], opts?: { sessionId?: string }) => {
  const sid = opts?.sessionId ?? activeThreadId.value;
  if (!sid || !window.workspaceApi) return false;
  await injectContextQueue({
    sessionId: sid,
    items,
    ptyWrite: (id, data) => window.workspaceApi!.ptyWrite(id, data),
    delayMs: 50,
  });
  return true;
});

provide(openWorkspaceFileKey, async (path: string) => {
  await router.push({ name: "fileDetail", params: { ...route.params, filename: path } });
});
```

- [ ] **Step 3: Verify FilesExplorer works**

Start the dev server and open a worktree in the Files tab. Select text in the Monaco editor. Confirm the "Add to Chat" popup appears and clicking it does not toast an error.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/layouts/Layout.vue
git commit -m "feat: provide injectContextToAgentKey and openWorkspaceFileKey in Layout"
```

---

## Task 4: `TerminalPane.vue` — terminal selection popup

**Files:**
- Modify: `src/modules/agent/components/TerminalPane.vue`

- [ ] **Step 1: Add imports**

At the top of the `<script setup>` block, after the existing imports, add:

```ts
import { inject } from "vue";
import ContextQueueSelectionPopup from "@/modules/agent/components/contextQueue/ContextQueueSelectionPopup.vue";
import { useTerminalSelectionQueue } from "@/modules/contextQueue/useTerminalSelectionQueue";
import { injectContextToAgentKey } from "@/contextQueue/injectionKeys";
```

Change:
```ts
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
```
To:
```ts
import { inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
```

- [ ] **Step 2: Add `agentTab` prop**

Find the existing props definition:
```ts
const props = withDefaults(
  defineProps<{
    sessionId: string;
    worktreeId: string;
    cwd: string;
    pendingAgentBootstrap?: PendingAgentBootstrap | null;
    ariaLabel?: string;
  }>(),
  {
    pendingAgentBootstrap: null,
    ariaLabel: "Terminal"
  }
);
```

Replace with:
```ts
const props = withDefaults(
  defineProps<{
    sessionId: string;
    worktreeId: string;
    cwd: string;
    pendingAgentBootstrap?: PendingAgentBootstrap | null;
    ariaLabel?: string;
    /** Pass true when this pane is inside AgentPane; changes the paste label to [Agent Tab]. */
    agentTab?: boolean;
  }>(),
  {
    pendingAgentBootstrap: null,
    ariaLabel: "Terminal",
    agentTab: false,
  }
);
```

- [ ] **Step 3: Wire up the composable and inject**

After the existing `const containerRef = ref<HTMLElement | null>(null);` line, add:

```ts
const injectContextToAgent = inject(injectContextToAgentKey, undefined);

const termQueue = useTerminalSelectionQueue({
  getTerminal: () => terminal,
  agentTab: props.agentTab,
});

async function onQueueSendToAgent(): Promise<void> {
  if (!injectContextToAgent) return;
  await injectContextToAgent([termQueue.buildItem()]);
  termQueue.dismiss();
}
```

- [ ] **Step 4: Add `@mouseup` to the section element in the template**

Find:
```html
<section
  data-instrument-terminal
  class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background px-3 pt-1 pb-0 text-xs text-card-foreground"
  role="document"
  :aria-label="ariaLabel"
>
```

Replace with:
```html
<section
  data-instrument-terminal
  class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background px-3 pt-1 pb-0 text-xs text-card-foreground"
  role="document"
  :aria-label="ariaLabel"
  @mouseup="termQueue.onMouseUp"
>
```

- [ ] **Step 5: Render the popup in the template**

Find the closing `</section>` tag of the terminal template and add the popup just before it:

```html
    <ContextQueueSelectionPopup
      :visible="termQueue.visible.value"
      :anchor="termQueue.anchor.value"
      @send-to-agent="onQueueSendToAgent"
      @dismiss="termQueue.dismiss"
    />
  </section>
```

- [ ] **Step 6: Verify in dev — Agent terminal**

Open a thread's Agent tab. Select text in the terminal. Confirm the "Add to Chat" popup appears and sends the selection.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/modules/agent/components/TerminalPane.vue
git commit -m "feat: add context queue selection popup to TerminalPane"
```

---

## Task 5: `AgentPane.vue` — mark terminal as agent tab

**Files:**
- Modify: `src/modules/agent/components/AgentPane.vue`

- [ ] **Step 1: Pass `:agent-tab="true"` to `<TerminalPane>`**

Find:
```html
<TerminalPane
  :session-id="threadId"
  :worktree-id="worktreeId"
  :cwd="cwd"
  aria-label="Agent"
  :pending-agent-bootstrap="pendingAgentBootstrap"
  @bootstrap-consumed="emit('bootstrapConsumed')"
/>
```

Replace with:
```html
<TerminalPane
  :session-id="threadId"
  :worktree-id="worktreeId"
  :cwd="cwd"
  aria-label="Agent"
  :agent-tab="true"
  :pending-agent-bootstrap="pendingAgentBootstrap"
  @bootstrap-consumed="emit('bootstrapConsumed')"
/>
```

- [ ] **Step 2: Verify paste label**

Open a thread's Agent tab, select terminal text, click "Add to Chat". In the agent's input, confirm the pasted text starts with `[Agent Tab]` (not `[terminal]`).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/agent/components/AgentPane.vue
git commit -m "feat: mark AgentPane terminal as agentTab for context queue"
```

---

## Task 6: `GitLocalChangesPage.vue` — diff + commit message

**Files:**
- Modify: `src/modules/git/pages/GitLocalChangesPage.vue`

- [ ] **Step 1: Add imports**

In the `<script setup>` block, after the existing imports, add:

```ts
import { inject, ref } from "vue";
import ContextQueueSelectionPopup from "@/modules/agent/components/contextQueue/ContextQueueSelectionPopup.vue";
import { useDomSelectionQueue } from "@/modules/contextQueue/useDomSelectionQueue";
import { injectContextToAgentKey } from "@/contextQueue/injectionKeys";
```

Note: check if `ref` is already imported — if so, just add the other three imports.

- [ ] **Step 2: Set up the two queue instances**

After the existing `const` declarations in `<script setup>`, add:

```ts
const injectContextToAgent = inject(injectContextToAgentKey, undefined);
const diffContainerRef = ref<HTMLElement | null>(null);
const commitTextareaRef = ref<HTMLElement | null>(null);

const diffQueue = useDomSelectionQueue({
  source: "diff",
  getFilePath: () => selectedEntry.value?.path ?? null,
});

const commitQueue = useDomSelectionQueue({
  source: "file",
  getFilePath: () => null,
});

async function onDiffSendToAgent(): Promise<void> {
  if (!injectContextToAgent) return;
  await injectContextToAgent([diffQueue.buildItem()]);
  diffQueue.dismiss();
}

async function onCommitSendToAgent(): Promise<void> {
  if (!injectContextToAgent) return;
  await injectContextToAgent([commitQueue.buildItem()]);
  commitQueue.dismiss();
}
```

- [ ] **Step 3: Wrap `GitDiffView` with a mouseup div**

Find (around line 723–749):
```html
<SidebarInset class="min-h-0 min-w-0 flex-1 overflow-hidden">
<GitDiffView
```

Replace the `<SidebarInset>` opening with:
```html
<SidebarInset class="min-h-0 min-w-0 flex-1 overflow-hidden">
<div ref="diffContainerRef" class="flex min-h-0 flex-1 flex-col overflow-hidden" @mouseup="diffQueue.onMouseUp">
<GitDiffView
```

And close the wrapper div before `</SidebarInset>`:
```html
</GitDiffView>
</div>
</SidebarInset>
```

- [ ] **Step 4: Add mouseup to the commit textarea**

Find the commit message `<textarea>` (around line 969):
```html
<textarea
  v-model="commitMessage"
```

Add the ref and mouseup handler:
```html
<textarea
  ref="commitTextareaRef"
  v-model="commitMessage"
  @mouseup="commitQueue.onMouseUp"
```

- [ ] **Step 5: Render the two popups**

At the end of the root `<div class="flex min-h-0 flex-1 flex-col">` template (just before the closing `</div>`), add:

```html
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
```

- [ ] **Step 6: Verify in dev**

Open the Git → Local tab. Select text in the diff. Confirm the popup appears and "Add to Chat" works. Then select text in the commit message textarea, confirm the same.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/modules/git/pages/GitLocalChangesPage.vue
git commit -m "feat: add context queue to local PR diff and commit textarea"
```

---

## Task 7: `GitRemoteChangesPage.vue` — PR diff + comments

**Files:**
- Modify: `src/modules/git/pages/GitRemoteChangesPage.vue`

- [ ] **Step 1: Add imports**

In the `<script setup>` block, after the existing imports, add:

```ts
import { inject } from "vue";
import ContextQueueSelectionPopup from "@/modules/agent/components/contextQueue/ContextQueueSelectionPopup.vue";
import { useDomSelectionQueue } from "@/modules/contextQueue/useDomSelectionQueue";
import { injectContextToAgentKey } from "@/contextQueue/injectionKeys";
```

- [ ] **Step 2: Set up the queue instance**

After the existing `const` declarations in `<script setup>`, add:

```ts
const injectContextToAgent = inject(injectContextToAgentKey, undefined);

const prDiffContainerRef = ref<HTMLElement | null>(null);

const prDiffQueue = useDomSelectionQueue({
  source: "diff",
  getFilePath: () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    return el?.closest("[data-file-path]")?.getAttribute("data-file-path") ?? null;
  },
});

async function onPrDiffSendToAgent(): Promise<void> {
  if (!injectContextToAgent) return;
  await injectContextToAgent([prDiffQueue.buildItem()]);
  prDiffQueue.dismiss();
}
```

Note: `ref` is likely already imported — add it to the import if not present.

- [ ] **Step 3: Add `data-file-path` to each file article**

In the template, find the `<article>` element that wraps each file's diff (it has `:id="fileAnchorId(file.displayName)"`):

```html
<article
  :id="fileAnchorId(file.displayName)"
  class="scroll-mt-24 border-b border-border last:border-b-0"
>
```

Add the `data-file-path` attribute:

```html
<article
  :id="fileAnchorId(file.displayName)"
  :data-file-path="file.displayName"
  class="scroll-mt-24 border-b border-border last:border-b-0"
>
```

- [ ] **Step 4: Wrap the PR diff scroll area**

Find the `<ScrollArea>` that contains the per-file diffs (around line 546). Wrap its contents — or add `ref` + `@mouseup` to an enclosing div. Look for the outer `<div class="flex min-h-0 min-w-0 flex-1 flex-col">` that contains the file list (around line 398) and add the ref and handler:

```html
<div
  ref="prDiffContainerRef"
  class="flex min-h-0 min-w-0 flex-1 flex-col"
  @mouseup="prDiffQueue.onMouseUp"
>
```

- [ ] **Step 5: Render the popup**

At the end of the root template element (just before the closing root `</div>`), add:

```html
<ContextQueueSelectionPopup
  :visible="prDiffQueue.visible.value"
  :anchor="prDiffQueue.anchor.value"
  @send-to-agent="onPrDiffSendToAgent"
  @dismiss="prDiffQueue.dismiss"
/>
```

- [ ] **Step 6: Verify in dev**

Open the Git → Remote PRs tab. Select a PR with file diffs. Select text in a diff hunk. Confirm the "Add to Chat" popup appears. Click it and confirm the text with the correct file path lands in the agent input.

Also select text in a PR comment body and confirm the same popup works.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/modules/git/pages/GitRemoteChangesPage.vue
git commit -m "feat: add context queue to remote PR diff and comments"
```

---

## Self-Review

**Spec coverage:**
- ✅ FilesExplorer (file editor): Task 3 (provider fix)
- ✅ Terminal (TerminalsPanel): Task 4 (TerminalPane used by TerminalsPanel)
- ✅ Agent: Task 4 + Task 5 (`agentTab: true`)
- ✅ Local PR diff: Task 6 (diffQueue)
- ✅ Local PR commit textarea: Task 6 (commitQueue)
- ✅ Remote PR diff: Task 7 (prDiffQueue + data-file-path)
- ✅ Remote PR comments: Task 7 (same mouseup container covers comment text)
- ✅ Both composables in `src/modules/contextQueue/`

**Type consistency:**
- `termQueue.buildItem()` → returns `QueueItem` ✅
- `diffQueue.buildItem()` → returns `QueueItem` ✅
- `injectContextToAgent([item])` → matches `InjectContextToAgentFn` signature ✅
- `termQueue.visible.value` / `termQueue.anchor.value` — `.value` because they are `Ref<T>` ✅
- `TerminalSelectionQueueOpts.agentTab` → `boolean | undefined` — passed as `props.agentTab` which is `boolean` (defaulted to `false`) ✅
