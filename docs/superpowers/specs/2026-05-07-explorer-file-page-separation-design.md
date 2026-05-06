# Explorer / FilePage Separation Design

**Date:** 2026-05-07  
**Status:** Approved

## Goal

Remove all file-editor logic from `ExplorerLayout.vue` so that component is responsible only for the sidebar (search, file tree, add-file/folder dialogs, confirm dialog). `FilePage.vue` owns its own file-editor state by calling `useExplorerFilePage()` directly. No `provide`/`inject` coupling between the two.

## Component Responsibilities

| Component | Owns |
|---|---|
| `ExplorerLayout.vue` | Sidebar: search input, file tree, add-file/folder dialogs, confirm dialog, worktree loading |
| `FilePage.vue` | File editor panel: tabs strip, toolbar, Monaco editor, image preview, drag-drop, context queue popup, discard dialog |
| `useExplorerFilePage.ts` | All file-editor logic (extracted from ExplorerLayout) |

## Dependency Sources — No Provide/Inject

`useExplorerFilePage` is self-contained:

| Dependency | Source |
|---|---|
| `wtPath`, `wtId` | `useActiveWorkspace()` called inside the composable |
| `allFiles` (rename/delete detection) | Composable loads its own file list via IPC |
| Discard confirmation | `FilePage` owns its own `<AlertDialog>` |
| Sidebar collapsed state | Small shared composable/store; both ExplorerLayout and FilePage read+write independently |

## Data Flow

```
ExplorerLayout
  └─ sidebar only — no provide() calls

FilePage
  ├─ const page = useExplorerFilePage()
  │     ├─ useActiveWorkspace()  →  wtPath, wtId
  │     └─ IPC                  →  allFiles
  └─ template binds to page.selectedPath, page.saveFile, page.openTabs, etc.
```

## Files Changed

### Deleted
- `src/modules/explorer/fileSearchEditorPageContext.ts` — injection key + VM interface
- `src/modules/explorer/explorerShellContext.ts` — shell bridge (no longer needed)

### Renamed
- `src/modules/explorer/useExplorerFilePage.raw.txt` → `src/modules/explorer/useExplorerFilePage.ts`

### Modified — `ExplorerLayout.vue`
Remove all file-editor logic:
- `openTabs`, `selectedPath`, `isLoadingFile`, `error`
- `isImagePreviewFile`, `isRasterImageFile`, `imageFileViewMode`, `imagePreviewSrc`
- `externalDropPreview`, `monacoEditorRef`
- `fileEditorQueueVisible`, `fileEditorQueueAnchor`, `pendingFileEditorGoToPath`
- All file actions: `openFile`, `closeTab`, `saveFile`, `deleteFile`, `handleSelectFile`
- `loadImageFileAsText`, `onImageViewModeRequest`, `onImageDropFromOs`
- Context queue handlers
- Route sync: `syncExplorerRouteFromSelection`
- `persistEditorState`, `restoreEditorState`
- `IMAGE_PREVIEW_EXTENSIONS`, `RASTER_IMAGE_EXTENSIONS`, `fileEmojiForPath`, `fileExtensionLower`
- `dirty`, `isSaving`, `rasterImageSaveBlocked`
- `provide(fileSearchEditorPageKey, ...)`
- Import of `fileSearchEditorPageContext`

Keep in `ExplorerLayout.vue`:
- `query`, `debouncedQuery`, `allFiles`, `contentMatchPaths`, `isSearching`, `isContentSearching`
- `searchMode`, `searchModeTabs`, `expandedFolders`
- `searchInput` ref, `loadFileSummaries`, `onSearchModeRequest`
- `handleAddFile`, `handleAddFolder`, `newEntryDialogKind`, `newEntryPathDraft`
- `collapseSidebar`, sidebar collapsed state (shared composable)
- `confirmAction`, `requestConfirmation`, `settleConfirmation`
- `worktreeEpoch`
- `wtPath`, `wtId` (still needed for sidebar IPC calls)

### Modified — `FilePage.vue`
- Remove `inject(fileSearchEditorPageKey)`
- Add `const page = useExplorerFilePage()`
- Add own `<AlertDialog>` for discard confirmations
- Template binds unchanged (still uses `page.xxx`)

### Modified — `useExplorerFilePage.ts`
- Calls `useActiveWorkspace()` internally for `wtPath`/`wtId`
- Loads its own `allFiles` via IPC
- Returns a reactive `page` object matching current template bindings

## What Does NOT Change
- `explorerRoute.ts` — routing unchanged
- `explorerEditorBridge.ts` — unchanged
- Template bindings in `FilePage.vue` — `page.xxx` pattern preserved
- `ExplorerLayout` sidebar template — unchanged
