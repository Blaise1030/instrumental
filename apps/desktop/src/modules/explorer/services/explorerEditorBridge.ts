/**
 * Thin callbacks so ExplorerLayout (sidebar / IPC delete-create) can coordinate
 * with file editor state owned by FilePage without provide/inject across the gap.
 */
export type ExplorerEditorBridge = {
  confirmDiscardIfDirty: () => Promise<boolean>;
  /** Whether the active tab has unsaved edits. */
  isActiveFileDirty: () => boolean;
  /** Active editor selection path (primary tab), or null. */
  selectedFilePath: () => string | null;
  /** Whether deleting this folder would lose unsaved edits to an open file inside it. */
  isOpenFileDirtyUnderFolder: (folderRelPath: string) => boolean;
  /** After folder delete API succeeds — drop tabs and sync route. */
  pruneTabsUnderFolder: (folderRelPath: string) => void;
  /** After file delete API succeeds — close tab and sync route. */
  closeTabForDeletedFile: (fileRelPath: string) => void;
};

let bridge: ExplorerEditorBridge | null = null;

export function registerExplorerEditorBridge(next: ExplorerEditorBridge | null): void {
  bridge = next;
}

export function getExplorerEditorBridge(): ExplorerEditorBridge | null {
  return bridge;
}
