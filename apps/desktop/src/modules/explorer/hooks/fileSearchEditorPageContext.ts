import type { PillTabItem } from "@/components/ui/pill-tabs";
import type MonacoEditor from "@/components/MonacoEditor.vue";
import type { QueueableEditorSelection } from "@/components/MonacoEditor.vue";
import type { Rect } from "@/utils/contextQueueAnchor";

/**
 * Open tab model for the file editor header (tabs strip).
 */
export type ExplorerOpenFileTab = {
  path: string;
  loadedContent: string;
  draftContent: string;
  imageFileViewMode: "preview" | "text";
  imagePreviewSrc: string | null;
  textLoaded: boolean;
};

/**
 * File editor view-model returned by useExplorerFilePage (tabs, toolbar, Monaco body).
 */
export interface FileSearchEditorPageViewModel {
  selectedPath: string | null;
  error: string | null;
  isLoadingFile: boolean;
  isImagePreviewFile: boolean;
  imageFileViewMode: "preview" | "text";
  imageViewTabs: PillTabItem[];
  onImageViewModeRequest: (next: string) => Promise<void>;
  imagePreviewSrc: string | null;
  draftContent: string;
  editorLanguage: string | undefined;
  /** `.md` worktree-relative paths use MarkdownEditor / Monaco markdown toggle. */
  isMarkdownFile: boolean;
  showLineNumbers: boolean;
  queueSelectionHintsEnabled: boolean;
  monacoEditorRef: InstanceType<typeof MonacoEditor> | null;
  onEditorQueueableSelection: (
    payload: QueueableEditorSelection | null,
  ) => void;
  handleSave: () => Promise<void>;
  externalDropPreview: { src: string; title: string } | null;
  clearExternalDropPreview: () => void;
  /** Header / toolbar */
  openTabs: ExplorerOpenFileTab[];
  selectTab: (path: string) => Promise<void>;
  handleCloseSpecificTab: (path: string) => Promise<void>;
  basenameFromPath: (absPath: string) => string;
  fileEmojiForPath: (relativePath: string) => string;
  toggleLineNumbers: () => void;
  openFindInFile: () => void;
  handleRefreshFile: () => Promise<void>;
  handleRevert: () => void;
  handleDeleteFile: () => Promise<void>;
  canFindInFile: boolean;
  findInFileShortcutHint: string;
  rasterImageSaveBlocked: boolean;
  dirty: boolean;
  isSaving: boolean;
  sidebarCollapsed: boolean | undefined;
  expandSidebar: () => Promise<void>;
  /** Drag-and-drop (non-worktree images) */
  onImageDropFromOs: (e: DragEvent) => Promise<void>;
  /** Selection queue popup (Monaco → agent) */
  fileEditorQueueVisible: boolean;
  fileEditorQueueAnchor: Rect | null;
  pendingFileEditorGoToPath: string | null;
  confirmFileEditorQueue: () => void;
  openSelectedFilePath: () => Promise<void>;
  injectFileEditorSelectionToAgent: () => Promise<void>;
  dismissFileEditorQueuePopup: () => void;
}
