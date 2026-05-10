# Context Queue — All Surfaces Design

**Date:** 2026-05-10  
**Status:** Approved

## Problem

`injectContextToAgentKey` is never provided anywhere in the app. Every surface that injects it (`FilePage`, `MonacoDiffEditor`, `useExplorerFilePage`) gets `undefined`, so "Add to Chat" silently toasts an error. Additionally, Terminal and git diff surfaces have no selection detection or popup at all.

## Goal

Make "Add to Chat" work on five surfaces:
1. **FilesExplorer** — Monaco file editor (popup already rendered; needs provider)
2. **Terminal** — `TerminalsPanel` xterm terminal
3. **Agent** — `AgentPane` xterm terminal
4. **Local PR** — `GitLocalChangesPage` diff area + commit message textarea
5. **Remote PR** — `GitRemoteChangesPage` PR diff area + comment bodies

---

## Architecture

### 1. Provider — `Layout.vue`

`Layout.vue` already holds `activeThreadId` and `window.workspaceApi`. Add two `provide()` calls:

```ts
provide(injectContextToAgentKey, async (items, opts) => {
  const sid = opts?.sessionId ?? activeThreadId.value
  if (!sid || !window.workspaceApi) return false
  await injectContextQueue({
    sessionId: sid, items,
    ptyWrite: (id, data) => window.workspaceApi!.ptyWrite(id, data),
    delayMs: 50,
  })
  return true
})

provide(openWorkspaceFileKey, async (path) => {
  await router.push({ name: "fileDetail", params: { ...route.params, filename: path } })
})
```

This single change fixes **FilesExplorer** and **MonacoDiffEditor** with no further edits.

### 2. `src/modules/contextQueue/useTerminalSelectionQueue.ts` (new)

Composable for xterm.js terminals.

**Inputs:**
- `getTerminal(): Terminal | null` — xterm instance
- `getContainerEl(): HTMLElement | null` — container for mouseup listener
- `agentTab?: boolean` — true when inside AgentPane
- `sessionLabel?: string` — label for the capture
- `onSendToAgent(capture, anchor): void`

**Behaviour:**
- On `mouseup` on the container: call `terminal.getSelection()`. If non-empty, set `visible = true` and position `anchor` at `{ left: e.clientX, top: e.clientY, width: 0, height: 0 }`.
- `dismiss()` clears visible + anchor.
- `sendToAgent()` builds `QueueCapture { source: "terminal", selectedText, agentTab, sessionLabel }` and calls `onSendToAgent`.

**Integration:**
- `TerminalPane.vue`: add `agentTab?: boolean` prop; use `useTerminalSelectionQueue` inside; render `<ContextQueueSelectionPopup>` (teleport to body).
- `AgentPane.vue`: pass `:agent-tab="true"` to `<TerminalPane>`.
- `TerminalsPanel.vue`: no changes needed — `TerminalPane` handles it internally.

### 3. `src/modules/contextQueue/useDomSelectionQueue.ts` (new)

Composable for any HTML surface (git diffs, textareas, comment bodies).

**Inputs:**
- `getContainerEl(): HTMLElement | null`
- `getFilePath?(): string | null`
- `source: "diff" | "file"`
- `onSendToAgent(capture, anchor): void`

**Behaviour:**
- On `mouseup`: call `window.getSelection()`. If non-empty and `rangeCount > 0`, use `Range.getBoundingClientRect()` for anchor, set `visible = true`.
- `dismiss()` clears visible + anchor.
- `sendToAgent()` builds `QueueCapture { source, filePath, selectedText }` and calls `onSendToAgent`.

**Integration:**

`GitLocalChangesPage.vue`:
- Wrap `GitDiffView` in a `<div @mouseup="diffQueue.onMouseUp">`.
- Add `@mouseup="commitQueue.onMouseUp"` to the commit message `<textarea>` (source `"file"`, no filePath).
- Render two `<ContextQueueSelectionPopup>` instances (one per queue instance).
- Inject `injectContextToAgentKey`; call it in each `onSendToAgent`.

`GitRemoteChangesPage.vue`:
- Wrap the PR diff `<ScrollArea>` contents in a `<div @mouseup="diffQueue.onMouseUp">`.
- Add `@mouseup` to the comment body elements.
- Single shared `<ContextQueueSelectionPopup>`.
- Inject `injectContextToAgentKey`; call it in `onSendToAgent`.

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/layouts/Layout.vue` | Add `provide(injectContextToAgentKey, ...)` + `provide(openWorkspaceFileKey, ...)` |
| `src/modules/contextQueue/useTerminalSelectionQueue.ts` | New composable |
| `src/modules/contextQueue/useDomSelectionQueue.ts` | New composable |
| `src/modules/agent/components/TerminalPane.vue` | Add `agentTab` prop, use `useTerminalSelectionQueue`, render popup |
| `src/modules/agent/components/AgentPane.vue` | Pass `:agent-tab="true"` to TerminalPane |
| `src/modules/git/pages/GitLocalChangesPage.vue` | Two `useDomSelectionQueue` instances + popups |
| `src/modules/git/pages/GitRemoteChangesPage.vue` | One `useDomSelectionQueue` instance + popup |

No new IPC keys, no new stores, no route changes.

---

## Constraints

- New composables live inside `src/modules/contextQueue/` — a shared cross-module home for contextQueue logic.
- `ContextQueueSelectionPopup` is already shared in `src/modules/agent/components/contextQueue/` — no promotion needed.
- `CONTEXT_QUEUE_SELECTION_QUEUE_ENABLED = false` stays false; only "Add to Chat" (sendToAgent) is exposed.
- `buildPasteText` from `src/contextQueue/formatters.ts` is used in both composables to build `pasteText` for `QueueItem`.
