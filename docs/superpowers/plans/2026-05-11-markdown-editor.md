# Markdown Editor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Monaco with a Tiptap WYSIWYG editor for `.md` files, with a pill-tab toggle (Rich Text default / Source) in `FilePage.vue`.

**Architecture:** `MarkdownEditor.vue` wraps Tiptap with the same prop/emit interface as `MonacoEditor.vue`. `FilePage.vue` renders either component based on file extension and the user's tab selection. `useExplorerFilePage.ts` gains a single `isMarkdownFile` computed.

**Tech Stack:** `@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/extension-markdown` (new), `@vue/test-utils`, `vitest`

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/desktop/src/components/MarkdownEditor.vue` |
| Create | `apps/desktop/src/components/__tests__/MarkdownEditor.test.ts` |
| Modify | `apps/desktop/src/modules/explorer/hooks/useExplorerFilePage.ts` |
| Modify | `apps/desktop/src/modules/explorer/pages/FilePage.vue` |
| Modify | `apps/desktop/src/modules/explorer/components/__tests__/FileSearchEditor.test.ts` |

---

## Task 1: Install @tiptap/extension-markdown

**Files:** `apps/desktop/package.json` (updated by package manager)

- [ ] **Step 1: Install the package**

```bash
cd apps/desktop && pnpm add @tiptap/extension-markdown
```

Expected: package appears in `apps/desktop/package.json` dependencies.

- [ ] **Step 2: Verify it resolves**

```bash
cd apps/desktop && pnpm tsc --noEmit 2>&1 | head -5
```

Expected: No "Cannot find module '@tiptap/extension-markdown'" errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore: add @tiptap/extension-markdown"
```

---

## Task 2: Add `isMarkdownFile` computed to useExplorerFilePage

**Files:**
- Modify: `apps/desktop/src/modules/explorer/hooks/useExplorerFilePage.ts`

- [ ] **Step 1: Open the file and locate the return value**

Open `apps/desktop/src/modules/explorer/hooks/useExplorerFilePage.ts`. Find the `const` block where `selectedPath` is defined (search for `selectedPath`), then find the `return {` statement at the end of the composable.

- [ ] **Step 2: Add the computed after `editorLanguage`**

Find the `editorLanguage` computed (search for `editorLanguage`). Add immediately after it:

```ts
const isMarkdownFile = computed(
  () => selectedPath.value?.toLowerCase().endsWith(".md") ?? false,
);
```

- [ ] **Step 3: Expose it in the return object**

Find the return statement. Add `isMarkdownFile` alongside the other exposed values:

```ts
return {
  // ... existing fields ...
  isMarkdownFile,
};
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/modules/explorer/hooks/useExplorerFilePage.ts
git commit -m "feat: expose isMarkdownFile from useExplorerFilePage"
```

---

## Task 3: Create MarkdownEditor.vue

**Files:**
- Create: `apps/desktop/src/components/MarkdownEditor.vue`

- [ ] **Step 1: Create the file**

Create `apps/desktop/src/components/MarkdownEditor.vue` with the following content:

```vue
<script setup lang="ts">
import { watch } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Markdown from "@tiptap/extension-markdown";
import type { QueueableEditorSelection } from "@/components/MonacoEditor.vue";

const props = defineProps<{
  modelValue: string;
  ariaLabel?: string;
  queueSelectionHints?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "queueable-text-selection": [selection: QueueableEditorSelection | null];
  save: [];
}>();

const editor = useEditor({
  content: props.modelValue,
  extensions: [StarterKit, Markdown.configure({ html: false })],
  onUpdate({ editor }) {
    emit("update:modelValue", editor.storage.markdown.getMarkdown());
  },
  onSelectionUpdate({ editor }) {
    if (!props.queueSelectionHints) {
      emit("queueable-text-selection", null);
      return;
    }
    const { from, to } = editor.state.selection;
    if (from === to) {
      emit("queueable-text-selection", null);
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) {
      emit("queueable-text-selection", null);
      return;
    }
    const domSel = window.getSelection();
    if (!domSel || domSel.rangeCount === 0) {
      emit("queueable-text-selection", null);
      return;
    }
    const rect = domSel.getRangeAt(0).getBoundingClientRect();
    const src = props.modelValue;
    const lineStart = src.slice(0, from).split("\n").length;
    const lineEnd = src.slice(0, to).split("\n").length;
    emit("queueable-text-selection", {
      selectedText,
      lineStart,
      lineEnd,
      anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  },
  editorProps: {
    handleKeyDown(_view, event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        emit("save");
        return true;
      }
      return false;
    },
  },
});

watch(
  () => props.modelValue,
  (next) => {
    const current = editor.value?.storage.markdown.getMarkdown();
    if (next !== current) {
      editor.value?.commands.setContent(next, false);
    }
  },
);

watch(
  () => props.queueSelectionHints,
  (enabled) => {
    if (!enabled) emit("queueable-text-selection", null);
  },
);

function openFind(): void {}

defineExpose({ openFind });
</script>

<template>
  <div
    data-testid="markdown-editor"
    class="flex min-h-0 w-full flex-1 flex-col overflow-auto"
    :aria-label="ariaLabel"
  >
    <EditorContent
      class="w-full flex-1 px-4 py-3 prose prose-sm max-w-none dark:prose-invert focus-within:outline-none"
      :editor="editor"
    />
  </div>
</template>
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep -i markdown
```

Expected: No errors mentioning `MarkdownEditor`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/MarkdownEditor.vue
git commit -m "feat: add MarkdownEditor Tiptap WYSIWYG component"
```

---

## Task 4: Write MarkdownEditor tests

**Files:**
- Create: `apps/desktop/src/components/__tests__/MarkdownEditor.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/desktop/src/components/__tests__/MarkdownEditor.test.ts`:

```ts
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarkdownEditor from "../MarkdownEditor.vue";

// ── Tiptap mock ──────────────────────────────────────────────────────────────
let capturedOnUpdate: ((args: { editor: typeof mockTiptapEditor }) => void) | null = null;
let capturedOnSelectionUpdate: ((args: { editor: typeof mockTiptapEditor }) => void) | null = null;
let capturedHandleKeyDown: ((view: unknown, event: KeyboardEvent) => boolean) | null = null;

const mockTiptapEditor = {
  storage: {
    markdown: {
      getMarkdown: vi.fn(() => "# hello"),
    },
  },
  state: {
    selection: { from: 0, to: 0 },
    doc: {
      textBetween: vi.fn(() => "selected text"),
    },
  },
  commands: {
    setContent: vi.fn(),
  },
  destroy: vi.fn(),
};

vi.mock("@tiptap/vue-3", () => ({
  useEditor: vi.fn((opts: {
    onUpdate?: (args: { editor: typeof mockTiptapEditor }) => void;
    onSelectionUpdate?: (args: { editor: typeof mockTiptapEditor }) => void;
    editorProps?: { handleKeyDown?: (view: unknown, event: KeyboardEvent) => boolean };
  }) => {
    capturedOnUpdate = opts.onUpdate ?? null;
    capturedOnSelectionUpdate = opts.onSelectionUpdate ?? null;
    capturedHandleKeyDown = opts.editorProps?.handleKeyDown ?? null;
    return { value: mockTiptapEditor };
  }),
  EditorContent: {
    name: "EditorContent",
    props: ["editor"],
    template: '<div data-testid="editor-content"></div>',
  },
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-markdown", () => ({
  default: { configure: vi.fn(() => ({})) },
}));
// ─────────────────────────────────────────────────────────────────────────────

describe("MarkdownEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnUpdate = null;
    capturedOnSelectionUpdate = null;
    capturedHandleKeyDown = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a host div with data-testid=markdown-editor", () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "# hello" } });
    expect(wrapper.find('[data-testid="markdown-editor"]').exists()).toBe(true);
  });

  it("emits update:modelValue when Tiptap onUpdate fires", async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "# hello" } });
    mockTiptapEditor.storage.markdown.getMarkdown.mockReturnValue("# world");
    capturedOnUpdate?.({ editor: mockTiptapEditor });
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["# world"]);
  });

  it("calls setContent when modelValue prop changes externally", async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "# hello" } });
    mockTiptapEditor.storage.markdown.getMarkdown.mockReturnValue("# hello");
    await wrapper.setProps({ modelValue: "# world" });
    expect(mockTiptapEditor.commands.setContent).toHaveBeenCalledWith("# world", false);
  });

  it("does not call setContent when modelValue matches current editor content", async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "# hello" } });
    mockTiptapEditor.storage.markdown.getMarkdown.mockReturnValue("# hello");
    await wrapper.setProps({ modelValue: "# hello" });
    expect(mockTiptapEditor.commands.setContent).not.toHaveBeenCalled();
  });

  it("emits save when Cmd+S is pressed via editorProps handleKeyDown", () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "" } });
    const event = new KeyboardEvent("keydown", { key: "s", metaKey: true });
    const handled = capturedHandleKeyDown?.({}, event);
    expect(handled).toBe(true);
    expect(wrapper.emitted("save")).toEqual([[]]);
  });

  it("emits save when Ctrl+S is pressed via editorProps handleKeyDown", () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "" } });
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true });
    capturedHandleKeyDown?.({}, event);
    expect(wrapper.emitted("save")).toEqual([[]]);
  });

  it("exposes openFind as a no-op", () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "" } });
    expect(() => (wrapper.vm as { openFind: () => void }).openFind()).not.toThrow();
  });

  it("emits queueable-text-selection null when queueSelectionHints is false", async () => {
    const wrapper = mount(MarkdownEditor, {
      props: { modelValue: "hello", queueSelectionHints: false },
    });
    mockTiptapEditor.state.selection = { from: 0, to: 5 };
    capturedOnSelectionUpdate?.({ editor: mockTiptapEditor });
    await flushPromises();
    expect(wrapper.emitted("queueable-text-selection")?.[0]).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd apps/desktop && pnpm test -- MarkdownEditor --reporter=verbose
```

Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/__tests__/MarkdownEditor.test.ts
git commit -m "test: add MarkdownEditor unit tests"
```

---

## Task 5: Update FilePage.vue — conditional rendering with PillTabs

**Files:**
- Modify: `apps/desktop/src/modules/explorer/pages/FilePage.vue`

- [ ] **Step 1: Add imports**

Open `apps/desktop/src/modules/explorer/pages/FilePage.vue`. Find the import block at the top of `<script setup>`. Add:

```ts
import { ref, watch } from "vue";
import MarkdownEditor from "@/components/MarkdownEditor.vue";
```

`PillTabs` is already imported — confirm it is; if not, add:
```ts
import PillTabs from "@/components/ui/pill-tabs";
```

- [ ] **Step 2: Add markdown tab state after the `page` declaration**

Find `const page = useExplorerFilePage(shell)`. Directly after it, add:

```ts
const markdownViewMode = ref<"rich-text" | "source">("rich-text");
const markdownViewTabs = [
  { value: "rich-text", label: "Rich Text" },
  { value: "source", label: "Source" },
] as const;

watch(
  () => page.selectedPath,
  () => { markdownViewMode.value = "rich-text"; },
);
```

- [ ] **Step 3: Replace the final `<MonacoEditor v-else ...>` block**

Find the template block that currently reads (near the bottom of `<template>`):

```html
<MonacoEditor
  v-else
  :ref="setMonacoRef"
  v-model="page.draftContent"
  ...
/>
```

Replace it with:

```html
<template v-else-if="page.isMarkdownFile">
  <div class="absolute top-2 right-3 z-20 rounded-lg border border-border/60 /95 p-0.5 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:/80">
    <PillTabs
      :model-value="markdownViewMode"
      class="min-w-0 shrink-0"
      aria-label="Markdown view"
      :tabs="markdownViewTabs"
      @update:model-value="markdownViewMode = $event as 'rich-text' | 'source'"
    />
  </div>
  <MarkdownEditor
    v-if="markdownViewMode === 'rich-text'"
    v-model="page.draftContent"
    :queue-selection-hints="page.queueSelectionHintsEnabled"
    :aria-label="page.selectedPath ? `Markdown editor, ${page.selectedPath}` : undefined"
    @save="page.saveFile()"
    @queueable-text-selection="page.onFileEditorQueueableSelection"
  />
  <MonacoEditor
    v-else
    :ref="setMonacoRef"
    v-model="page.draftContent"
    language="markdown"
    :show-line-numbers="page.showLineNumbers"
    :queue-selection-hints="page.queueSelectionHintsEnabled"
    :aria-label="page.selectedPath ? `Source code, markdown` : undefined"
    @save="page.saveFile()"
    @queueable-text-selection="page.onFileEditorQueueableSelection"
  />
</template>
<MonacoEditor
  v-else
  :ref="setMonacoRef"
  v-model="page.draftContent"
  :language="page.editorLanguage"
  :show-line-numbers="page.showLineNumbers"
  :queue-selection-hints="page.queueSelectionHintsEnabled"
  :aria-label="
    page.selectedPath
      ? `Source code, ${page.editorLanguage ?? 'plaintext'}`
      : undefined
  "
  @save="page.saveFile()"
  @queueable-text-selection="page.onFileEditorQueueableSelection"
/>
```

> **Note:** Check the existing MonacoEditor block for the exact `@save` and `@queueable-text-selection` handler names — use whatever names are already there.

- [ ] **Step 4: Typecheck**

```bash
cd apps/desktop && pnpm typecheck 2>&1 | grep -i "filepage\|markdowneditor\|markdown"
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/explorer/pages/FilePage.vue
git commit -m "feat: show Tiptap MarkdownEditor for .md files with source toggle"
```

---

## Task 6: Update integration tests to mock MarkdownEditor

**Files:**
- Modify: `apps/desktop/src/modules/explorer/components/__tests__/FileSearchEditor.test.ts`

- [ ] **Step 1: Add MarkdownEditor mock**

Open `apps/desktop/src/modules/explorer/components/__tests__/FileSearchEditor.test.ts`. Find the `vi.mock("@/components/MonacoEditor.vue", ...)` block. Directly after it, add:

```ts
vi.mock("@/components/MarkdownEditor.vue", () => ({
  default: defineComponent({
    name: "MarkdownEditor",
    props: {
      modelValue: { type: String, default: "" },
      ariaLabel: String,
      queueSelectionHints: { type: Boolean, default: false },
    },
    emits: ["update:modelValue", "save", "queueable-text-selection"],
    setup(props, { expose }) {
      expose({ openFind: (): void => {} });
      return () =>
        h("textarea", {
          "data-testid": "markdown-editor",
          value: props.modelValue,
          onInput: (e: Event) => {
            /* readonly stub */
          },
        });
    },
  }),
}));
```

- [ ] **Step 2: Run the full integration test suite**

```bash
cd apps/desktop && pnpm test -- FileSearchEditor --reporter=verbose
```

Expected: All existing tests pass. No new failures.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/explorer/components/__tests__/FileSearchEditor.test.ts
git commit -m "test: mock MarkdownEditor in FileSearchEditor integration tests"
```

---

## Task 7: Run full test suite and typecheck

- [ ] **Step 1: Run all tests**

```bash
cd apps/desktop && pnpm test run
```

Expected: All tests pass.

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop && pnpm typecheck
```

Expected: No errors.

- [ ] **Step 3: Final commit if any fixups were needed**

If any fixes were made in steps 1–2, commit them:

```bash
git add -p
git commit -m "fix: address typecheck and test issues in markdown editor integration"
```
