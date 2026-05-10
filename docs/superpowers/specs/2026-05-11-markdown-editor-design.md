# Markdown Editor Integration — Design Spec

**Date:** 2026-05-11  
**Status:** Approved

## Overview

Replace Monaco editor with a Tiptap-based WYSIWYG rich text editor for `.md` files in the file explorer. All other file types continue to use Monaco unchanged. A `PillTabs` toggle lets the user switch between **Rich Text** (default) and **Source** (Monaco) views.

## Scope

- New component: `MarkdownEditor.vue`
- Modified: `FilePage.vue`, `useExplorerFilePage.ts`
- No changes to `MonacoEditor.vue`, `MonacoDiffEditor.vue`, `monacoApi.ts`, or any Monaco utilities

## Architecture

```
FilePage.vue
  ├── isMarkdownFile? (from useExplorerFilePage)
  │     ├── true  → PillTabs (Rich Text | Source)
  │     │              ├── Rich Text tab (default) → MarkdownEditor.vue
  │     │              └── Source tab              → MonacoEditor.vue
  │     └── false → MonacoEditor.vue (unchanged)
  └── ContextQueueSelectionPopup (unchanged)
```

The `modelValue` remains a raw markdown string in both views. Tiptap parses markdown on mount and serializes back to markdown on every content change.

## Components

### `MarkdownEditor.vue` (new)

Location: `apps/desktop/src/components/MarkdownEditor.vue`

**Props** (mirrors `MonacoEditor` interface):
```ts
{
  modelValue: string          // raw markdown
  ariaLabel?: string
  queueSelectionHints?: boolean
}
```

**Emits** (mirrors `MonacoEditor` interface):
```ts
"update:modelValue": [value: string]
"queueable-text-selection": [selection: QueueableEditorSelection | null]
"save": []
```

**Exposes:**
```ts
openFind(): void  // no-op — browser find unreliable in contenteditable
```

**Libraries:**
- `@tiptap/vue-3` — Vue 3 integration
- `@tiptap/starter-kit` — base extensions (bold, italic, headings, lists, code blocks, etc.)
- `@tiptap/extension-markdown` — markdown ↔ ProseMirror serialization

**Behaviour:**
- On mount: initialize Tiptap with `content: props.modelValue` parsed as markdown
- On content change: serialize doc to markdown string, emit `update:modelValue`
- Cmd+S / Ctrl+S: wired via `KeyboardShortcutExtension` → emits `save`
- `queueable-text-selection`: uses `window.getSelection()` + `Range.getBoundingClientRect()` for anchor coords; line numbers approximated from character offset within the markdown string

### `FilePage.vue` (modified)

- Import `MarkdownEditor.vue`
- Add local `const markdownViewMode = ref<'rich-text' | 'source'>('rich-text')`
- Watch `page.selectedPath` → reset `markdownViewMode` to `'rich-text'` on change
- When `page.isMarkdownFile`:
  - Render `PillTabs` with tabs `[{ value: 'rich-text', label: 'Rich Text' }, { value: 'source', label: 'Source' }]`
  - `markdownViewMode === 'rich-text'` → render `MarkdownEditor`
  - `markdownViewMode === 'source'` → render `MonacoEditor` (existing binding unchanged)
- When not `page.isMarkdownFile`: render `MonacoEditor` as today (no change)

### `useExplorerFilePage.ts` (modified)

Add one computed:
```ts
const isMarkdownFile = computed(() =>
  selectedPath.value?.toLowerCase().endsWith('.md') ?? false
)
```

Expose `isMarkdownFile` from the hook return value.

## Data Flow

```
File opened (.md)
  → draftContent (raw markdown string)
  → MarkdownEditor receives modelValue
  → Tiptap parses markdown → ProseMirror doc (internal)
  → User edits in WYSIWYG
  → Tiptap serializes doc → markdown string
  → emits update:modelValue → draftContent updated
  → Save (Cmd+S) → file written to disk (existing save logic unchanged)

User switches to Source tab
  → MonacoEditor receives same draftContent string
  → User edits raw markdown
  → emits update:modelValue → draftContent updated
  → Switch back to Rich Text → MarkdownEditor re-parses updated markdown
```

## Selection / Context Queue

`queueable-text-selection` in `MarkdownEditor`:
1. Listen to Tiptap `selectionUpdate` transaction
2. Call `window.getSelection()` to get the DOM selection
3. If selection is non-empty: call `Range.getBoundingClientRect()` for anchor coordinates
4. Emit `QueueableEditorSelection` with `selectedText`, approximated `lineStart`/`lineEnd` (character offset → newline count in `modelValue`), and `anchor` rect

This is less pixel-precise than Monaco's `getScrolledVisiblePosition` but sufficient for popup positioning.

## Tab Reset Behaviour

- Opening a new `.md` file resets `markdownViewMode` to `'rich-text'`
- Switching between a `.md` and a non-`.md` file resets the mode
- Tab state is local to `FilePage` (not persisted)

## Out of Scope

- Markdown toolbar (bold/italic buttons) — not requested
- Persisting the last-used tab mode per file
- Supporting other rich text formats (RST, AsciiDoc)
- Changing the diff editor (`MonacoDiffEditor.vue`)
