<script setup lang="ts">
import { watchDebounced } from "@vueuse/core";
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  reactive,
  ref,
  watch,
} from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import {
  FilePlus,
  FolderPlus,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-vue-next";
import type { FileSummary } from "@shared/ipc";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge/index";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import FileTreeNode, {
  type FileTreeNodeData,
} from "@/components/FileTreeNode.vue";
import type MonacoEditor from "@/components/MonacoEditor.vue";
import type { QueueableEditorSelection } from "@/components/MonacoEditor.vue";
import ContextQueueSelectionPopup from "@/components/contextQueue/ContextQueueSelectionPopup.vue";
import { buildPasteText } from "@/contextQueue/formatters";
import { formatFolderListingFromFiles } from "@/contextQueue/folderListing";
import {
  injectContextToAgentKey,
  threadContextQueueKey,
} from "@/contextQueue/injectionKeys";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/lib/contextQueueAnchor";
import { resolveSelectionFilePath } from "@/lib/selectionFilePath";
import { useToast } from "@/composables/useToast";
import { Input } from "@/components/ui/input";
import PillTabs, { type PillTabItem } from "@/components/ui/pill-tabs";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { monacoLanguageIdFromPath } from "@/lib/monacoLanguage";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  fileSearchEditorPageKey,
  type FileSearchEditorPageViewModel,
} from "@/modules/explorer/fileSearchEditorPageContext";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";

const props = defineProps<{
  /** Overrides workspace store (e.g. unit tests mount with `worktreePath`). */
  worktreeId?: string | null;
  worktreePath?: string | null;
  activeThreadId?: string | null;
  showThreadSidebarExpand?: boolean;
}>();

const { activeWorktree, activeThreadId: routeThreadId } = useActiveWorkspace();

const wtPath = computed(
  () => props.worktreePath ?? activeWorktree.value?.path ?? null,
);
const wtId = computed(
  () => props.worktreeId ?? activeWorktree.value?.id ?? null,
);
const threadIdForQueue = computed(
  () => props.activeThreadId ?? routeThreadId.value ?? null,
);
const SIDEBAR_COLLAPSED_KEY = "instrument.fileSearchSidebarCollapsed";
const sidebarCollapsed = defineModel<boolean | undefined>("sidebarCollapsed");
/** Maps file explorer visibility to ui/sidebar open state (collapsed = hidden). */
const explorerSidebarOpen = computed({
  get: () => !sidebarCollapsed.value,
  set: (v: boolean) => {
    sidebarCollapsed.value = !v;
  },
});
const emit = defineEmits<{
  expandThreadSidebar: [];
}>();

const threadQueue = inject(threadContextQueueKey, undefined);
const injectContextToAgent = inject(injectContextToAgentKey, undefined);
const toast = useToast();

function basenameFromPath(absPath: string): string {
  const parts = absPath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? absPath;
}

/** Small emoji hint for file kind (shown in the file tab badge). */
function fileEmojiForPath(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  const map: Record<string, string> = {
    ts: "📘",
    tsx: "⚛️",
    vue: "💚",
    js: "📜",
    jsx: "⚛️",
    md: "📝",
    markdown: "📝",
    json: "📋",
    css: "🎨",
    scss: "🎨",
    sass: "🎨",
    less: "🎨",
    html: "🌐",
    htm: "🌐",
    py: "🐍",
    rs: "🦀",
    go: "🐹",
    java: "☕",
    kt: "🟣",
    swift: "🐦",
    rb: "💎",
    php: "🐘",
    sh: "⌨️",
    bash: "⌨️",
    zsh: "⌨️",
    yml: "⚙️",
    yaml: "⚙️",
    toml: "⚙️",
    sql: "🗃️",
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    webp: "🖼️",
    gif: "🖼️",
    svg: "🖼️",
    avif: "🖼️",
    bmp: "🖼️",
    ico: "🖼️",
  };
  return map[ext] ?? "📄";
}

/** Lowercase extension without dot (e.g. `docs/a.PNG` → `png`). */
function fileExtensionLower(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot + 1) : "";
}

/** Shown as image preview first; Source loads UTF-8 text (binary will look garbled). */
const IMAGE_PREVIEW_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "svg",
  "avif",
]);

/** Saving UTF-8 edits would corrupt these; block Save when dirty in Source mode. */
const RASTER_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "avif",
]);

const searchInput = ref<InstanceType<typeof SidebarInput> | null>(null);
const query = ref("");
/** Milliseconds after typing stops before path filter / text search runs. */
const SEARCH_INPUT_DEBOUNCE_MS = 280;
/** Debounced mirror of `query` for filtering and content IPC (input updates immediately). */
const debouncedQuery = ref("");
const allFiles = ref<FileSummary[]>([]);
/** Relative paths whose file contents matched the last content search. */
const contentMatchPaths = ref<string[]>([]);
const contentSearchError = ref<string | null>(null);
const isContentSearching = ref(false);
let contentSearchSeq = 0;
const expandedFolders = ref<Set<string>>(new Set());
const selectedPath = ref<string | null>(null);
const MAX_OPEN_FILE_TABS = 5;

type OpenFileTab = {
  path: string;
  loadedContent: string;
  draftContent: string;
  imageFileViewMode: "preview" | "text";
  imagePreviewSrc: string | null;
  textLoaded: boolean;
};

const openTabs = ref<OpenFileTab[]>([]);
const isSearching = ref(false);
const isLoadingFile = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);

const LINE_NUMBERS_VISIBLE_KEY = "instrument.fileSearchLineNumbersVisible";
const SEARCH_MODE_KEY = "instrument.fileSearchSearchMode";
const SELECTED_PATH_KEY_PREFIX = "instrument.fileSearchSelectedPath:";

function readLocalStorageFlag(key: string, fallback = false): boolean {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function readSavedSelectedPath(cwd: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(`${SELECTED_PATH_KEY_PREFIX}${cwd}`);
  } catch {
    return null;
  }
}

function readSavedOpenFilePaths(cwd: string): string[] {
  const saved = readSavedSelectedPath(cwd);
  return saved ? [saved] : [];
}

function writeSavedSelectedPath(
  cwd: string,
  relativePath: string | null,
): void {
  try {
    if (typeof localStorage === "undefined") return;
    const key = `${SELECTED_PATH_KEY_PREFIX}${cwd}`;
    if (relativePath) localStorage.setItem(key, relativePath);
    else localStorage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

async function loadPersistedEditorState(
  worktreeId: string | null | undefined,
  cwd: string | null,
): Promise<{ selectedFilePath: string | null; openFilePaths: string[] }> {
  const api = getApi();
  if (worktreeId && api?.getWorktreeEditorState) {
    const persisted = await api.getWorktreeEditorState(worktreeId);
    if (persisted) {
      return {
        selectedFilePath:
          persisted.selectedFilePath ?? persisted.openFilePaths[0] ?? null,
        openFilePaths: persisted.openFilePaths,
      };
    }
  }
  const openFilePaths = cwd ? readSavedOpenFilePaths(cwd) : [];
  return {
    selectedFilePath: openFilePaths[0] ?? null,
    openFilePaths,
  };
}

async function persistEditorState(
  relativePath: string | null,
  openFilePaths: string[],
): Promise<void> {
  const api = getApi();
  const worktreeId = wtId.value ?? null;
  const cwd = wtPath.value;
  if (worktreeId && api?.setWorktreeEditorState) {
    await api.setWorktreeEditorState({
      worktreeId,
      selectedFilePath: relativePath,
      openFilePaths,
    });
  }
  if (cwd) writeSavedSelectedPath(cwd, relativePath);
}

/** `path` = match relative paths only (fast). `contents` = also run full-text search over files. */
function readSearchMode(): "path" | "contents" {
  try {
    if (typeof localStorage === "undefined") return "path";
    const v = localStorage.getItem(SEARCH_MODE_KEY);
    return v === "contents" ? "contents" : "path";
  } catch {
    return "path";
  }
}

const showLineNumbers = ref(
  readLocalStorageFlag(LINE_NUMBERS_VISIBLE_KEY, true),
);
const searchMode = ref<"path" | "contents">(readSearchMode());

onMounted(() => {
  if (sidebarCollapsed.value === undefined) {
    sidebarCollapsed.value = readLocalStorageFlag(SIDEBAR_COLLAPSED_KEY);
  }
});

watch(sidebarCollapsed, (collapsed) => {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});

watch(showLineNumbers, (visible) => {
  try {
    localStorage.setItem(LINE_NUMBERS_VISIBLE_KEY, visible ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});

watch(searchMode, (mode) => {
  try {
    localStorage.setItem(SEARCH_MODE_KEY, mode);
  } catch {
    /* ignore quota / private mode */
  }
  if (mode === "path") {
    contentSearchSeq += 1;
    contentMatchPaths.value = [];
    contentSearchError.value = null;
    isContentSearching.value = false;
  }
});

let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;
let fileSummariesSeq = 0;
let openFileSeq = 0;

/** `null` when closed; distinguishes new file vs new folder in a single shadcn `Dialog`. */
const newEntryDialogKind = ref<"file" | "folder" | null>(null);
const newEntryPathDraft = ref("");
const newEntryPathInputRef = ref<InstanceType<typeof Input> | null>(null);
const newEntryDialogFieldError = ref<string | null>(null);

type ConfirmActionState = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  resolve: (confirmed: boolean) => void;
};

const confirmAction = ref<ConfirmActionState | null>(null);

const newEntryPathInputId = computed(() =>
  newEntryDialogKind.value === "folder"
    ? "new-folder-path-input"
    : "new-file-path-input",
);

const hasWorkspace = computed(() => Boolean(wtPath.value));
const activeTab = computed(
  () => openTabs.value.find((tab) => tab.path === selectedPath.value) ?? null,
);
const loadedContent = computed({
  get: () => activeTab.value?.loadedContent ?? "",
  set: (value: string) => {
    if (activeTab.value) activeTab.value.loadedContent = value;
  },
});
const draftContent = computed({
  get: () => activeTab.value?.draftContent ?? "",
  set: (value: string) => {
    if (activeTab.value) activeTab.value.draftContent = value;
  },
});
const dirty = computed(
  () => activeTab.value !== null && draftContent.value !== loadedContent.value,
);

const isImagePreviewFile = computed(() => {
  const p = selectedPath.value;
  return Boolean(p && IMAGE_PREVIEW_EXTENSIONS.has(fileExtensionLower(p)));
});

const isRasterImageFile = computed(() => {
  const p = selectedPath.value;
  return Boolean(p && RASTER_IMAGE_EXTENSIONS.has(fileExtensionLower(p)));
});

/** Raster images edited as text cannot be saved safely as UTF-8. */
const rasterImageSaveBlocked = computed(
  () => isRasterImageFile.value && dirty.value,
);

const imageFileViewMode = computed<"preview" | "text">({
  get: () => activeTab.value?.imageFileViewMode ?? "preview",
  set: (value) => {
    if (activeTab.value) activeTab.value.imageFileViewMode = value;
  },
});

const imageViewTabs = computed<PillTabItem[]>(() => [
  { value: "preview", label: "Preview" },
  { value: "text", label: "Source" },
]);

/** `data:` URL for `<img src>` when the open file is an image in the worktree. */
const imagePreviewSrc = computed<string | null>({
  get: () => activeTab.value?.imagePreviewSrc ?? null,
  set: (value) => {
    if (activeTab.value) activeTab.value.imagePreviewSrc = value;
  },
});

/** Dropped OS file (e.g. screencapture in temp) — not a worktree-relative selection. */
const externalDropPreview = ref<{ src: string; title: string } | null>(null);

const monacoEditorRef = ref<InstanceType<typeof MonacoEditor> | null>(null);

const fileEditorQueueVisible = ref(false);
const fileEditorQueueAnchor = ref<Rect | null>(null);
const pendingFileEditorSelection = ref<{
  text: string;
  lineStart: number;
  lineEnd: number;
} | null>(null);
const pendingFileEditorGoToPath = ref<string | null>(null);
let pendingFileEditorGoToSeq = 0;

function dismissFileEditorQueuePopup(): void {
  fileEditorQueueVisible.value = false;
  fileEditorQueueAnchor.value = null;
  pendingFileEditorSelection.value = null;
  pendingFileEditorGoToPath.value = null;
}

function makeOpenFileTab(path: string): OpenFileTab {
  return {
    path,
    loadedContent: "",
    draftContent: "",
    imageFileViewMode: "preview",
    imagePreviewSrc: null,
    textLoaded: false,
  };
}

function findTab(path: string): OpenFileTab | undefined {
  return openTabs.value.find((tab) => tab.path === path);
}

function openTabPaths(): string[] {
  return openTabs.value.map((tab) => tab.path);
}

function onEditorQueueableSelection(
  payload: QueueableEditorSelection | null,
): void {
  const path = selectedPath.value;
  if (!payload || !path) {
    dismissFileEditorQueuePopup();
    return;
  }
  pendingFileEditorSelection.value = {
    text: payload.selectedText,
    lineStart: payload.lineStart,
    lineEnd: payload.lineEnd,
  };
  fileEditorQueueAnchor.value = payload.anchor;
  fileEditorQueueVisible.value = true;
  void updatePendingFileEditorGoToPath(payload.selectedText);
}

async function updatePendingFileEditorGoToPath(
  selectedText: string,
): Promise<void> {
  const seq = ++pendingFileEditorGoToSeq;
  pendingFileEditorGoToPath.value = null;
  const resolved = await resolveSelectionFilePath(
    getApi(),
    wtPath.value,
    selectedText,
  );
  if (seq !== pendingFileEditorGoToSeq) return;
  if (pendingFileEditorSelection.value?.text !== selectedText) return;
  pendingFileEditorGoToPath.value = resolved;
}

async function openSelectedFilePath(): Promise<void> {
  const path = pendingFileEditorGoToPath.value;
  if (!path) {
    dismissFileEditorQueuePopup();
    return;
  }
  await handleSelectFile(path);
  dismissFileEditorQueuePopup();
}

function confirmFileEditorQueue(): void {
  const tid = threadIdForQueue.value;
  const path = selectedPath.value;
  const p = pendingFileEditorSelection.value;
  if (!tid || !threadQueue || !path || !p) {
    toast.error(
      "Cannot queue",
      "Select a thread, open a file, and highlight text first.",
    );
    dismissFileEditorQueuePopup();
    return;
  }
  const capture: QueueCapture = {
    source: "file",
    filePath: path,
    selectedText: p.text,
    lineStart: p.lineStart,
    lineEnd: p.lineEnd,
  };
  threadQueue.addItem(tid, {
    id: crypto.randomUUID(),
    source: "file",
    pasteText: buildPasteText(capture),
    meta: { filePath: path },
  });
  dismissFileEditorQueuePopup();
}

async function injectFileEditorSelectionToAgent(): Promise<void> {
  const tid = threadIdForQueue.value;
  const path = selectedPath.value;
  const p = pendingFileEditorSelection.value;
  if (!tid || !path || !p) {
    toast.error(
      "Cannot send",
      "Select a thread, open a file, and highlight text first.",
    );
    dismissFileEditorQueuePopup();
    return;
  }
  if (!injectContextToAgent) {
    toast.error("Unavailable", "Sending to the agent is not available here.");
    dismissFileEditorQueuePopup();
    return;
  }
  const capture: QueueCapture = {
    source: "file",
    filePath: path,
    selectedText: p.text,
    lineStart: p.lineStart,
    lineEnd: p.lineEnd,
  };
  const item: QueueItem = {
    id: crypto.randomUUID(),
    source: "file",
    pasteText: buildPasteText(capture),
    meta: { filePath: path },
  };
  const ok = await injectContextToAgent([item], { sessionId: tid });
  if (ok) {
    dismissFileEditorQueuePopup();
  }
}

const findInFileShortcutHint = computed(() =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
    ? "⌘F"
    : "Ctrl+F",
);

const canFindInFile = computed(
  () =>
    Boolean(selectedPath.value) &&
    !isLoadingFile.value &&
    !(isImagePreviewFile.value && imageFileViewMode.value === "preview"),
);

/** Show "Add to Chat" on text selection whenever the source editor is open (thread optional until send). */
const queueSelectionHintsEnabled = computed(
  () =>
    Boolean(selectedPath.value) &&
    !isLoadingFile.value &&
    !(isImagePreviewFile.value && imageFileViewMode.value === "preview"),
);

function openFindInFile(): void {
  monacoEditorRef.value?.openFind();
}

/** Extension → Monaco language id (shared map with diff editor). */
const editorLanguage = computed(() => {
  const path = selectedPath.value;
  if (!path) return undefined;
  return monacoLanguageIdFromPath(path);
});

function compareTreeNodes(a: FileTreeNodeData, b: FileTreeNodeData): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function buildFileTree(files: FileSummary[]): FileTreeNodeData[] {
  const roots: FileTreeNodeData[] = [];
  const folderMap = new Map<
    string,
    Extract<FileTreeNodeData, { kind: "folder" }>
  >();

  for (const file of files) {
    const segments = file.relativePath.split("/").filter(Boolean);
    let currentChildren = roots;
    let currentPath = "";

    for (const [index, segment] of segments.entries()) {
      const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;

      if (isLeaf) {
        if (file.kind === "directory") {
          let folder = folderMap.get(nextPath);
          if (!folder) {
            folder = {
              kind: "folder",
              name: segment,
              path: nextPath,
              children: [],
            };
            folderMap.set(nextPath, folder);
            currentChildren.push(folder);
          }
        } else {
          currentChildren.push({
            kind: "file",
            name: segment,
            path: nextPath,
          });
        }
        continue;
      }

      let folder = folderMap.get(nextPath);
      if (!folder) {
        folder = {
          kind: "folder",
          name: segment,
          path: nextPath,
          children: [],
        };
        folderMap.set(nextPath, folder);
        currentChildren.push(folder);
      }

      currentChildren = folder.children;
      currentPath = nextPath;
    }
  }

  function sortNodes(nodes: FileTreeNodeData[]): FileTreeNodeData[] {
    nodes.sort(compareTreeNodes);
    for (const node of nodes) {
      if (node.kind === "folder") {
        sortNodes(node.children);
      }
    }
    return nodes;
  }

  return sortNodes(roots);
}

function collectFilePathsFromTree(nodes: FileTreeNodeData[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === "file") out.push(node.path);
    else out.push(...collectFilePathsFromTree(node.children));
  }
  return out;
}

function ancestorFolderPathsForFile(relativePath: string): string[] {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length <= 1) return [];
  const out: string[] = [];
  let acc = "";
  for (let i = 0; i < segments.length - 1; i++) {
    acc = acc ? `${acc}/${segments[i]}` : segments[i]!;
    out.push(acc);
  }
  return out;
}

function ancestorFoldersForAllVisibleFiles(
  nodes: FileTreeNodeData[],
): string[] {
  const folders = new Set<string>();
  for (const filePath of collectFilePathsFromTree(nodes)) {
    for (const a of ancestorFolderPathsForFile(filePath)) {
      folders.add(a);
    }
  }
  return [...folders];
}

function defaultExpandedFolders(files: FileSummary[]): Set<string> {
  const next = new Set<string>();
  for (const file of files) {
    const firstSegment = file.relativePath.split("/").filter(Boolean)[0];
    if (firstSegment) next.add(firstSegment);
  }
  return next;
}

const contentPathsForFilter = computed(() =>
  searchMode.value === "contents" ? contentMatchPaths.value : [],
);

/**
 * Filter `allFiles` to rows visible for the current query — O(n) in the number of summaries.
 * (Previous implementation scanned all files again for every directory row, which was O(n²).)
 */
const summariesForTree = computed(() => {
  const files = allFiles.value;
  const q = debouncedQuery.value.trim();
  if (!q) return files;

  const qLower = q.toLowerCase();
  const contentSet = new Set(contentPathsForFilter.value);

  const matchingFilePaths: string[] = [];
  for (const f of files) {
    if (f.kind !== "file") continue;
    const rp = f.relativePath;
    if (rp.toLowerCase().includes(qLower) || contentSet.has(rp)) {
      matchingFilePaths.push(rp);
    }
  }

  const folderWithMatchingDescendant = new Set<string>();
  for (const filePath of matchingFilePaths) {
    const segments = filePath.split("/").filter(Boolean);
    let acc = "";
    for (let i = 0; i < segments.length - 1; i++) {
      acc = acc ? `${acc}/${segments[i]!}` : segments[i]!;
      folderWithMatchingDescendant.add(acc);
    }
  }

  return files.filter((f) => {
    const rp = f.relativePath;
    if (rp.toLowerCase().includes(qLower)) return true;
    if (f.kind === "file") {
      return contentSet.has(rp);
    }
    if (contentSet.has(rp)) return true;
    return folderWithMatchingDescendant.has(rp);
  });
});

const fileTree = computed(() => buildFileTree(summariesForTree.value));

const visibleTree = computed(() => fileTree.value);

const searchPlaceholder = computed(() =>
  searchMode.value === "contents"
    ? "Search files by name or contents…"
    : "Search files by name…",
);

const searchModeTabs = computed<PillTabItem[]>(() => [
  { value: "path", label: "Files" },
  { value: "contents", label: "Contents" },
]);

function onSearchModeRequest(next: string): void {
  if (next !== "path" && next !== "contents") return;
  if (searchMode.value === next) return;
  searchMode.value = next;
}

watchDebounced(
  () => query.value,
  (v) => {
    debouncedQuery.value = v;
  },
  { debounce: SEARCH_INPUT_DEBOUNCE_MS, flush: "post" },
);

/** Empty or whitespace-only query clears the debounced filter immediately (no extra delay). */
watch(query, (v) => {
  error.value = null;
  if (!v.trim()) {
    debouncedQuery.value = "";
  }
});

/** Avoid stale debounced text when the workspace root changes. */
watch(
  () => wtPath.value,
  () => {
    debouncedQuery.value = query.value;
  },
);

function expandFoldersForVisibleMatches(): void {
  const nextExpanded = new Set(expandedFolders.value);
  for (const f of ancestorFoldersForAllVisibleFiles(visibleTree.value)) {
    nextExpanded.add(f);
  }
  expandedFolders.value = nextExpanded;
}

/** On first non-empty debounced query, expand folders that lead to visible files. */
watch(debouncedQuery, (next, prev) => {
  if ((prev ?? "").trim().length > 0 || next.trim().length === 0) return;
  expandFoldersForVisibleMatches();
});

/** When full-text results arrive, expand folders along matching files. */
watch(
  contentMatchPaths,
  () => {
    if (searchMode.value !== "contents") return;
    if (!debouncedQuery.value.trim()) return;
    expandFoldersForVisibleMatches();
  },
  { flush: "post" },
);

watch(
  [
    () => debouncedQuery.value,
    () => wtPath.value,
    () => searchMode.value,
  ],
  async () => {
    if (!wtPath.value) {
      contentMatchPaths.value = [];
      contentSearchError.value = null;
      isContentSearching.value = false;
      contentSearchSeq += 1;
      return;
    }

    const q = debouncedQuery.value.trim();
    if (!q) {
      contentMatchPaths.value = [];
      contentSearchError.value = null;
      isContentSearching.value = false;
      contentSearchSeq += 1;
      return;
    }

    if (searchMode.value !== "contents") {
      contentMatchPaths.value = [];
      contentSearchError.value = null;
      isContentSearching.value = false;
      return;
    }

    const api = getApi();
    const cwd = wtPath.value;
    const seq = ++contentSearchSeq;
    contentSearchError.value = null;
    contentMatchPaths.value = [];
    isContentSearching.value = true;

    if (!api?.searchFileContents) {
      contentMatchPaths.value = [];
      contentSearchError.value =
        "Full-text search is not available in this build.";
      if (seq === contentSearchSeq) {
        isContentSearching.value = false;
      }
      return;
    }

    try {
      const paths = await api.searchFileContents(cwd, q);
      if (seq !== contentSearchSeq || wtPath.value !== cwd) return;
      contentMatchPaths.value = paths;
    } catch (searchErr) {
      if (seq !== contentSearchSeq || wtPath.value !== cwd) return;
      contentMatchPaths.value = [];
      contentSearchError.value =
        searchErr instanceof Error
          ? searchErr.message
          : "Could not search file contents.";
    } finally {
      if (seq === contentSearchSeq) {
        isContentSearching.value = false;
      }
    }
  },
  { flush: "post" },
);

function getApi() {
  return window.workspaceApi ?? null;
}

async function onQueueTreeItemForAgent(payload: {
  kind: "file" | "folder";
  path: string;
}): Promise<void> {
  const tid = threadIdForQueue.value;
  if (!tid || !threadQueue) {
    toast.error("No active thread", "Select a thread before queuing context.");
    return;
  }
  const cwd = wtPath.value;
  if (!cwd) return;
  const api = getApi();
  if (!api?.listFiles) return;
  const files = await api.listFiles(cwd);
  if (payload.kind === "folder") {
    const listing = formatFolderListingFromFiles(payload.path, files);
    const capture: QueueCapture = {
      source: "folder",
      folderPath: payload.path,
      listingText: listing,
    };
    threadQueue.addItem(tid, {
      id: crypto.randomUUID(),
      source: "folder",
      pasteText: buildPasteText(capture),
      meta: { folderPath: payload.path },
    });
    return;
  }
  let body = "";
  try {
    if (api.readFile) {
      body = await api.readFile(cwd, payload.path);
      if (body.length > 8000) body = `${body.slice(0, 8000)}\n… (truncated)`;
    }
  } catch {
    body = "(could not read file)";
  }
  const capture: QueueCapture = {
    source: "file",
    filePath: payload.path,
    selectedText: body || "(empty file)",
    lineStart: undefined,
    lineEnd: undefined,
  };
  threadQueue.addItem(tid, {
    id: crypto.randomUUID(),
    source: "file",
    pasteText: buildPasteText(capture),
    meta: { filePath: payload.path },
  });
}

function normalizeNewFilePathInput(raw: string): string {
  return raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function computeNewFileDefaultValue(folderPathPrefix?: string): string {
  if (folderPathPrefix !== undefined) {
    const p = normalizeNewFilePathInput(folderPathPrefix);
    return p ? `${p.replace(/\/+$/, "")}/` : "src/";
  }
  const folderHint = selectedPath.value?.includes("/")
    ? selectedPath.value.replace(/\/[^/]+$/, "")
    : selectedPath.value
      ? ""
      : "src";
  return folderHint === ""
    ? "new-file.txt"
    : folderHint
      ? `${folderHint}/`
      : "src/";
}

function closeNewEntryDialog(): void {
  newEntryDialogKind.value = null;
  newEntryDialogFieldError.value = null;
}

function computeNewFolderDefaultValue(folderPathPrefix?: string): string {
  if (folderPathPrefix !== undefined) {
    const p = normalizeNewFilePathInput(folderPathPrefix);
    return p ? `${p.replace(/\/+$/, "")}/new-folder` : "new-folder";
  }
  const folderHint = selectedPath.value?.includes("/")
    ? selectedPath.value.replace(/\/[^/]+$/, "")
    : selectedPath.value
      ? ""
      : "src";
  return folderHint === "" ? "new-folder" : `${folderHint}/new-folder`;
}

function focusSelectNewEntryPathInput(): void {
  const c = newEntryPathInputRef.value as unknown as {
    $el?: unknown;
  } | null;
  const el = c?.$el;
  if (el instanceof HTMLInputElement) {
    el.focus();
    el.select();
  }
}

async function openNewFileDialog(folderPathPrefix?: string): Promise<void> {
  const api = getApi();
  const cwd = wtPath.value;
  if (!api || !cwd) return;

  newEntryPathDraft.value = computeNewFileDefaultValue(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined,
  );
  newEntryDialogFieldError.value = null;
  newEntryDialogKind.value = "file";
  await nextTick();
  focusSelectNewEntryPathInput();
}

async function openNewFolderDialog(folderPathPrefix?: string): Promise<void> {
  const api = getApi();
  const cwd = wtPath.value;
  if (!api?.createFolder || !cwd) return;

  newEntryPathDraft.value = computeNewFolderDefaultValue(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined,
  );
  newEntryDialogFieldError.value = null;
  newEntryDialogKind.value = "folder";
  await nextTick();
  focusSelectNewEntryPathInput();
}

async function submitNewEntry(): Promise<void> {
  const kind = newEntryDialogKind.value;
  const api = getApi();
  const cwd = wtPath.value;
  if (!kind || !api || !cwd) return;

  if (kind === "file") {
    const normalized = normalizeNewFilePathInput(newEntryPathDraft.value);
    if (!normalized || normalized.endsWith("/")) {
      newEntryDialogFieldError.value = "Enter a file path (not a folder).";
      return;
    }

    newEntryDialogFieldError.value = null;
    error.value = null;

    try {
      await api.createFile(cwd, normalized);
      closeNewEntryDialog();
      await loadFileSummaries();
      expandAncestorFolders(normalized);
      if (!(await confirmDiscardIfDirty())) return;
      await openFile(normalized);
    } catch (createError) {
      error.value =
        createError instanceof Error
          ? createError.message
          : "Could not create the file.";
    }
    return;
  }

  if (!api.createFolder) return;

  const normalized = normalizeNewFilePathInput(newEntryPathDraft.value).replace(
    /\/+$/,
    "",
  );
  if (!normalized) {
    newEntryDialogFieldError.value = "Enter a folder path.";
    return;
  }

  newEntryDialogFieldError.value = null;
  error.value = null;

  try {
    await api.createFolder(cwd, normalized);
    closeNewEntryDialog();
    await loadFileSummaries();
    expandAncestorFolders(normalized);
  } catch (createError) {
    error.value =
      createError instanceof Error
        ? createError.message
        : "Could not create the folder.";
  }
}

function expandAncestorFolders(relativePath: string): void {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length <= 1) return;

  const next = new Set(expandedFolders.value);
  let acc = "";
  for (let i = 0; i < segments.length - 1; i++) {
    acc = acc ? `${acc}/${segments[i]}` : segments[i]!;
    next.add(acc);
  }
  expandedFolders.value = next;
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    if (confirmAction.value) {
      settleConfirmation(false);
      return;
    }
    if (newEntryDialogKind.value) {
      closeNewEntryDialog();
      return;
    }
  }
}

async function confirmDiscardForTab(path: string): Promise<boolean> {
  const tab = findTab(path);
  if (!tab || tab.draftContent === tab.loadedContent) return true;
  return requestConfirmation({
    title: "Discard unsaved changes?",
    description: `Unsaved changes in ${basenameFromPath(path)} will be lost.`,
    confirmLabel: "Discard changes",
    variant: "destructive",
  });
}

async function ensureTabCapacity(nextPath: string): Promise<boolean> {
  if (findTab(nextPath) || openTabs.value.length < MAX_OPEN_FILE_TABS)
    return true;
  const evicted = openTabs.value[0];
  if (!evicted) return true;
  if (!(await confirmDiscardForTab(evicted.path))) return false;
  openTabs.value = openTabs.value.slice(1);
  if (selectedPath.value === evicted.path) {
    selectedPath.value =
      openTabs.value[openTabs.value.length - 1]?.path ?? null;
  }
  return true;
}

async function selectTab(path: string): Promise<void> {
  if (selectedPath.value === path) return;
  selectedPath.value = path;
  const tab = findTab(path);
  if (tab && !tab.textLoaded) {
    await openFile(path, true);
    return;
  }
  void syncExplorerRouteFromSelection();
}

function closeTabWithoutConfirmation(path: string): void {
  const currentIndex = openTabs.value.findIndex((tab) => tab.path === path);
  if (currentIndex < 0) return;
  const nextTabs = openTabs.value.filter((tab) => tab.path !== path);
  const wasSelected = selectedPath.value === path;
  openTabs.value = nextTabs;
  if (wasSelected) {
    const fallback =
      nextTabs[currentIndex] ?? nextTabs[currentIndex - 1] ?? null;
    selectedPath.value = fallback?.path ?? null;
  }
  if (!selectedPath.value) {
    externalDropPreview.value = null;
  }
  void syncExplorerRouteFromSelection();
}

function removeTabsMatching(predicate: (tab: OpenFileTab) => boolean): void {
  const removedSelected = selectedPath.value
    ? openTabs.value.some(
        (tab) => tab.path === selectedPath.value && predicate(tab),
      )
    : false;
  openTabs.value = openTabs.value.filter((tab) => !predicate(tab));
  if (removedSelected) {
    selectedPath.value =
      openTabs.value[openTabs.value.length - 1]?.path ?? null;
  }
  if (!selectedPath.value) {
    externalDropPreview.value = null;
  }
  void syncExplorerRouteFromSelection();
}

function clearSelection(): void {
  selectedPath.value = null;
  openTabs.value = [];
  externalDropPreview.value = null;
  void syncExplorerRouteFromSelection();
}

function clearExternalDropPreview(): void {
  externalDropPreview.value = null;
}

async function onImageDropFromOs(e: DragEvent): Promise<void> {
  e.preventDefault();
  const df = e.dataTransfer;
  if (!df?.files?.length) return;
  const file = df.files[0];
  if (!file) return;
  const api = getApi();
  const readUrl = api?.readImageDataUrlFromAbsolutePath;
  const getPath =
    api &&
    "getPathForFile" in api &&
    typeof api.getPathForFile === "function"
      ? api.getPathForFile
      : undefined;
  if (!readUrl || !getPath) return;
  try {
    const abs = getPath(file);
    const imageish =
      Boolean(file.type && file.type.startsWith("image/")) ||
      /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif)$/i.test(abs);
    if (!imageish) return;
    const url = await readUrl(abs);
    if (url) externalDropPreview.value = { src: url, title: abs };
  } catch {
    /* ignore invalid drops */
  }
}

async function refreshImagePreviewUrl(): Promise<void> {
  const path = selectedPath.value;
  const cwd = wtPath.value;
  const api = getApi();
  if (!path || !cwd || !api?.resolveMarkdownImageUrl) {
    imagePreviewSrc.value = null;
    return;
  }
  const name = basenameFromPath(path);
  imagePreviewSrc.value =
    (await api.resolveMarkdownImageUrl(cwd, path, name)) ?? null;
}

async function loadImageFileAsText(): Promise<void> {
  const path = selectedPath.value;
  const cwd = wtPath.value;
  const api = getApi();
  const tab = path ? findTab(path) : undefined;
  if (!path || !cwd || !api || !tab) return;

  isLoadingFile.value = true;
  error.value = null;
  try {
    const content = await api.readFile(cwd, path);
    tab.loadedContent = content;
    tab.draftContent = content;
    tab.textLoaded = true;
  } catch (readError) {
    error.value =
      readError instanceof Error
        ? readError.message
        : "Could not read the image file as text.";
  } finally {
    isLoadingFile.value = false;
  }
}

async function onImageViewModeRequest(next: string): Promise<void> {
  if (next !== "preview" && next !== "text") return;
  if (next === imageFileViewMode.value) return;

  if (next === "preview") {
    if (imageFileViewMode.value === "text" && dirty.value) {
      if (!(await confirmDiscardIfDirty())) return;
    }
    imageFileViewMode.value = "preview";
    loadedContent.value = "";
    draftContent.value = "";
    if (activeTab.value) activeTab.value.textLoaded = false;
    await refreshImagePreviewUrl();
    return;
  }

  imageFileViewMode.value = "text";
  await loadImageFileAsText();
}

async function handleCloseFileTab(): Promise<void> {
  if (!selectedPath.value) return;
  if (!(await confirmDiscardForTab(selectedPath.value))) return;
  closeTabWithoutConfirmation(selectedPath.value);
}

async function handleCloseSpecificTab(path: string): Promise<void> {
  if (!(await confirmDiscardForTab(path))) return;
  closeTabWithoutConfirmation(path);
}

function invalidatePendingFileRequests(): void {
  fileSummariesSeq += 1;
  openFileSeq += 1;
  contentSearchSeq += 1;
  isSearching.value = false;
  isLoadingFile.value = false;
  isContentSearching.value = false;
}

function resetState(): void {
  query.value = "";
  debouncedQuery.value = "";
  allFiles.value = [];
  contentMatchPaths.value = [];
  contentSearchError.value = null;
  isContentSearching.value = false;
  contentSearchSeq += 1;
  expandedFolders.value = new Set();
  error.value = null;
  isSearching.value = false;
  isLoadingFile.value = false;
  isSaving.value = false;
  closeNewEntryDialog();
  clearSelection();
}

async function focusSearchInput(): Promise<void> {
  await nextTick();
  searchInput.value?.focus();
}

/** Ensures the search field exists (expands sidebar if needed) then focuses it. */
async function focusSearchAfterReveal(): Promise<void> {
  if (sidebarCollapsed.value) {
    sidebarCollapsed.value = false;
    await nextTick();
  }
  await focusSearchInput();
}

function collapseSidebar(): void {
  sidebarCollapsed.value = true;
}

async function expandSidebar(): Promise<void> {
  sidebarCollapsed.value = false;
  await focusSearchInput();
}

function requestConfirmation(
  options: Omit<ConfirmActionState, "resolve">,
): Promise<boolean> {
  return new Promise((resolve) => {
    confirmAction.value = { ...options, resolve };
  });
}

function settleConfirmation(confirmed: boolean): void {
  const pending = confirmAction.value;
  if (!pending) return;
  confirmAction.value = null;
  pending.resolve(confirmed);
}

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!dirty.value) return true;
  return requestConfirmation({
    title: "Discard unsaved changes?",
    description: "Your current edits will be lost if you continue.",
    confirmLabel: "Discard changes",
    variant: "destructive",
  });
}

async function loadFileSummaries(silent = false): Promise<void> {
  const api = getApi();
  const cwd = wtPath.value;
  if (!api || !cwd) {
    allFiles.value = [];
    isSearching.value = false;
    return;
  }

  const seq = ++fileSummariesSeq;
  if (!silent) isSearching.value = true;
  error.value = null;

  try {
    const files = await api.listFiles(cwd);
    if (seq !== fileSummariesSeq || wtPath.value !== cwd) return;
    allFiles.value = files;
    if (expandedFolders.value.size === 0) {
      expandedFolders.value = defaultExpandedFolders(files);
    }
  } catch (searchError) {
    if (seq !== fileSummariesSeq || wtPath.value !== cwd) return;
    allFiles.value = [];
    expandedFolders.value = new Set();
    error.value =
      searchError instanceof Error
        ? searchError.message
        : "Could not load files.";
  } finally {
    if (seq === fileSummariesSeq) {
      isSearching.value = false;
    }
  }
}

async function openFile(
  relativePath: string,
  forceReload = false,
): Promise<void> {
  const api = getApi();
  const cwd = wtPath.value;
  if (!api || !cwd) return;
  if (!(await ensureTabCapacity(relativePath))) return;

  let tab = findTab(relativePath);
  if (!tab) {
    openTabs.value = [...openTabs.value, makeOpenFileTab(relativePath)];
    tab = findTab(relativePath);
  }
  if (!tab) return;
  selectedPath.value = relativePath;
  if (tab.textLoaded && !forceReload) return;

  const seq = ++openFileSeq;
  isLoadingFile.value = true;
  error.value = null;

  try {
    tab.imagePreviewSrc = null;
    const ext = fileExtensionLower(relativePath);
    if (IMAGE_PREVIEW_EXTENSIONS.has(ext)) {
      tab.imageFileViewMode = "preview";
      tab.loadedContent = "";
      tab.draftContent = "";
      tab.textLoaded = false;
      await refreshImagePreviewUrl();
      if (seq !== openFileSeq || wtPath.value !== cwd) return;
      return;
    }

    const content = await api.readFile(cwd, relativePath);
    if (seq !== openFileSeq || wtPath.value !== cwd) return;
    tab.loadedContent = content;
    tab.draftContent = content;
    tab.textLoaded = true;
    tab.imageFileViewMode = "preview";
  } catch (readError) {
    if (seq !== openFileSeq || wtPath.value !== cwd) return;
    error.value =
      readError instanceof Error
        ? readError.message
        : "Could not open the selected file.";
  } finally {
    if (seq === openFileSeq) {
      isLoadingFile.value = false;
    }
    void syncExplorerRouteFromSelection();
  }
}

async function handleSelectFile(relativePath: string): Promise<void> {
  if (selectedPath.value === relativePath) return;
  if (findTab(relativePath)) {
    await selectTab(relativePath);
    return;
  }
  await openFile(relativePath);
}

async function handleAddFile(folderPathPrefix?: string): Promise<void> {
  const folderPrefix =
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined;
  await openNewFileDialog(folderPrefix);
}

async function handleAddFolder(folderPathPrefix?: string): Promise<void> {
  const folderPrefix =
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined;
  await openNewFolderDialog(folderPrefix);
}

function pathIsUnderOrEqualFolder(
  parentRel: string,
  childRel: string,
): boolean {
  const p = parentRel.replace(/\/+$/, "");
  const c = childRel.replace(/\/+$/, "");
  return c === p || c.startsWith(`${p}/`);
}

async function deleteFolderAtPath(relativePath: string): Promise<void> {
  const api = getApi();
  const cwd = wtPath.value;
  if (!api?.deleteFolder || !cwd) return;

  const sel = selectedPath.value;
  const loseEdits =
    sel && pathIsUnderOrEqualFolder(relativePath, sel) && dirty.value;
  if (
    !(await requestConfirmation({
      title: `Delete folder ${relativePath} and its contents?`,
      description: loseEdits
        ? "Unsaved changes to the open file inside this folder will be lost."
        : "This permanently removes the folder and everything inside it.",
      confirmLabel: "Delete folder",
      variant: "destructive",
    }))
  ) {
    return;
  }

  error.value = null;

  try {
    await api.deleteFolder(cwd, relativePath);
    removeTabsMatching((tab) =>
      pathIsUnderOrEqualFolder(relativePath, tab.path),
    );
    await loadFileSummaries();
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error
        ? deleteError.message
        : "Could not delete the folder.";
  }
}

async function deleteFileAtPath(relativePath: string): Promise<void> {
  const api = getApi();
  const cwd = wtPath.value;
  if (!api || !cwd) return;

  const isSelected = selectedPath.value === relativePath;
  const loseEdits = isSelected && dirty.value;
  if (
    !(await requestConfirmation({
      title: `Delete ${relativePath}?`,
      description: loseEdits
        ? "Unsaved changes in this file will be lost."
        : "This permanently removes the file from the worktree.",
      confirmLabel: "Delete file",
      variant: "destructive",
    }))
  ) {
    return;
  }

  error.value = null;

  try {
    await api.deleteFile(cwd, relativePath);
    closeTabWithoutConfirmation(relativePath);
    await loadFileSummaries();
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error
        ? deleteError.message
        : "Could not delete the file.";
  }
}

async function handleDeleteFile(): Promise<void> {
  const relativePath = selectedPath.value;
  if (!relativePath) return;
  await deleteFileAtPath(relativePath);
}

async function onCtxAddFile(folderPath?: string): Promise<void> {
  await handleAddFile(folderPath);
}

async function onCtxAddFolder(folderPath?: string): Promise<void> {
  await handleAddFolder(folderPath);
}

async function onCtxDeleteFolder(folderPath: string): Promise<void> {
  await deleteFolderAtPath(folderPath);
}

async function onCtxDeleteFile(filePath: string): Promise<void> {
  await deleteFileAtPath(filePath);
}

async function handleSave(): Promise<void> {
  const api = getApi();
  const cwd = wtPath.value;
  const relativePath = selectedPath.value;
  if (!api || !cwd || !relativePath) return;

  if (isRasterImageFile.value && dirty.value) {
    error.value =
      "Raster images cannot be saved from Source view; that would corrupt the file. Revert or switch back to Preview.";
    return;
  }

  isSaving.value = true;
  error.value = null;

  try {
    await api.writeFile(cwd, relativePath, draftContent.value);
    loadedContent.value = draftContent.value;
  } catch (writeError) {
    error.value =
      writeError instanceof Error
        ? writeError.message
        : "Could not save the selected file.";
  } finally {
    isSaving.value = false;
  }
}

function handleRevert(): void {
  draftContent.value = loadedContent.value;
  error.value = null;
}

async function handleRefreshFile(): Promise<void> {
  const path = selectedPath.value;
  if (!path) return;
  if (dirty.value && !(await confirmDiscardIfDirty())) return;
  await openFile(path);
}

function toggleLineNumbers(): void {
  showLineNumbers.value = !showLineNumbers.value;
}

function handleToggleFolder(path: string): void {
  const next = new Set(expandedFolders.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  expandedFolders.value = next;
}

async function confirmContextSwitch(
  nextWorktreePath: string | null,
): Promise<boolean> {
  if (nextWorktreePath === wtPath.value) return true;
  return confirmDiscardIfDirty();
}

const router = useRouter();
const route = useRoute();

function normalizeExplorerFilenameParam(
  raw: string | string[] | undefined,
): string | null {
  if (raw == null) return null;
  const s = Array.isArray(raw) ? raw.join("/") : raw;
  return s.length > 0 ? s : null;
}

async function syncExplorerRouteFromSelection(options?: {
  replace?: boolean;
}): Promise<void> {
  const name = route.name;
  if (name !== "filesPanel" && name !== "fileDetail") return;
  const threadId = route.params.threadId as string | undefined;
  const projectId = route.params.projectId as string | undefined;
  const branch = route.params.branch as string | undefined;
  if (!threadId || !projectId || !branch) return;

  const path = selectedPath.value;
  const replace = options?.replace ?? false;

  if (!path) {
    if (route.name !== "filesPanel") {
      const nav = {
        name: "filesPanel" as const,
        params: { projectId, branch, threadId },
      };
      if (replace) await router.replace(nav);
      else await router.push(nav);
    }
    return;
  }

  if (
    route.name === "fileDetail" &&
    normalizeExplorerFilenameParam(route.params.filename) === path
  ) {
    return;
  }

  const nav = {
    name: "fileDetail" as const,
    params: { projectId, branch, threadId, filename: path },
  };
  if (replace) await router.replace(nav);
  else await router.push(nav);
}

watch(
  () =>
    [
      route.name,
      normalizeExplorerFilenameParam(route.params.filename),
    ] as const,
  async ([name, pathFromRoute]) => {
    if (name !== "fileDetail" || pathFromRoute == null) return;
    if (selectedPath.value === pathFromRoute) return;
    await handleSelectFile(pathFromRoute);
  },
);

const fileEditorPage = reactive({
  selectedPath,
  error,
  isLoadingFile,
  isImagePreviewFile,
  imageFileViewMode,
  imageViewTabs,
  onImageViewModeRequest,
  imagePreviewSrc,
  draftContent,
  editorLanguage,
  showLineNumbers,
  queueSelectionHintsEnabled,
  monacoEditorRef,
  onEditorQueueableSelection,
  handleSave,
  externalDropPreview,
  clearExternalDropPreview,
});

provide(fileSearchEditorPageKey, fileEditorPage as FileSearchEditorPageViewModel);

watch([selectedPath, () => openTabPaths()], ([path, openPaths]) => {
  externalDropPreview.value = null;
  void persistEditorState(path, openPaths);
});

watch(
  () => [wtId.value ?? null, wtPath.value] as const,
  async ([nextWorktreeId, nextPath], previousValue) => {
    const [previousWorktreeId, previousPath] = previousValue ?? [null, null];
    if (nextWorktreeId === previousWorktreeId && nextPath === previousPath)
      return;
    // Read before resetState() — clearSelection sets selectedPath=null which would wipe the key.
    const savedState = await loadPersistedEditorState(nextWorktreeId, nextPath);
    invalidatePendingFileRequests();
    resetState();
    await loadFileSummaries();
    const existingSavedPaths = savedState.openFilePaths
      .filter((path, index, arr) => arr.indexOf(path) === index)
      .filter((path) =>
        allFiles.value.some(
          (f) =>
            f.relativePath === path &&
            (f.kind === undefined || f.kind === "file"),
        ),
      )
      .slice(-MAX_OPEN_FILE_TABS);
    openTabs.value = existingSavedPaths.map((path) => makeOpenFileTab(path));
    const selectedSavedPath =
      savedState.selectedFilePath &&
      existingSavedPaths.includes(savedState.selectedFilePath)
        ? savedState.selectedFilePath
        : (existingSavedPaths[existingSavedPaths.length - 1] ?? null);
    selectedPath.value = selectedSavedPath;
    if (selectedSavedPath && nextPath) {
      await openFile(selectedSavedPath);
    }
    void syncExplorerRouteFromSelection({ replace: true });
    void focusSearchInput();
  },
  { immediate: true },
);

onMounted(() => {
  void focusSearchInput();
  const api = getApi();
  if (api?.onWorkspaceChanged) {
    disposeWorkspaceChanged = api.onWorkspaceChanged(() => {
      void loadFileSummaries(true);
    });
  }
  if (api?.onWorkingTreeFilesChanged) {
    disposeWorkingTreeFilesChanged = api.onWorkingTreeFilesChanged(() => {
      void loadFileSummaries(true);
    });
  }
  document.addEventListener("keydown", onGlobalKeydown);
});

onUnmounted(() => {
  disposeWorkspaceChanged?.();
  disposeWorkspaceChanged = null;
  disposeWorkingTreeFilesChanged?.();
  disposeWorkingTreeFilesChanged = null;
  document.removeEventListener("keydown", onGlobalKeydown);
});

defineExpose({
  focusSearch: (): void => {
    void focusSearchAfterReveal();
  },
  expandSidebar,
  /** Same as the sidebar refresh control: reload the file list from disk. */
  refreshFileExplorer: (): void => {
    void loadFileSummaries();
  },
  /** Ask before leaving the current worktree context when there are unsaved edits. */
  confirmContextSwitch,
  /** Open a worktree-relative path in the editor (same as picking the file in the tree). */
  openWorkspaceFile: handleSelectFile,
});
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-row w-full">
    <template v-if="wtPath">
      <SidebarProvider
      class="flex-1 w-full"
    v-model:open="explorerSidebarOpen"
    sidebar-scope="fileExplorer"
    :persist-cookie="false"    
    :keyboard-shortcut="false"
  >
    <Sidebar
      id="file-search-sidebar"
      sidebar-scope="fileExplorer"
      layout="nested"
    >
      <SidebarHeader data-testid="file-search-header" class="gap-1">
        <div class="relative min-w-0">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <SidebarInput
            id="file-search"
            ref="searchInput"
            v-model="query"
            data-testid="file-search-input"
            type="search"
            autocomplete="off"
            :placeholder="searchPlaceholder"
            class="ps-8 bg-background"
            :disabled="!hasWorkspace"
          />
        </div>
        <div
          class="flex min-w-0 items-center gap-1 overflow-x-auto"
          role="group"
          aria-label="Search scope and file explorer actions"
        >
          <PillTabs
            data-testid="file-search-scope"
            :model-value="searchMode"
            size="xs"
            aria-label="Search scope"
            :tabs="searchModeTabs"
            @update:model-value="onSearchModeRequest"
          />
          <div
            class="ms-auto flex items-center gap-1"
            role="toolbar"
            aria-label="File explorer actions"
          >
            <Button
              data-testid="refresh-file-explorer"
              variant="outline"
              size="icon-sm"
              :disabled="!hasWorkspace || isSearching"
              title="Refresh file explorer"
              @click="loadFileSummaries"
            >
              <RefreshCw aria-hidden="true" />
              <span class="sr-only">Refresh file explorer</span>
            </Button>
            <Button
              data-testid="add-file"
              variant="outline"
              size="icon-sm"
              :disabled="!hasWorkspace"
              title="Add file"
              @click="handleAddFile()"
            >
              <FilePlus aria-hidden="true" />
              <span class="sr-only">Add file</span>
            </Button>
            <Button
              data-testid="add-folder"
              variant="outline"
              size="icon-sm"
              :disabled="!hasWorkspace"
              title="Add folder"
              @click="handleAddFolder()"
            >
              <FolderPlus aria-hidden="true" />
              <span class="sr-only">Add folder</span>
            </Button>
            <Button
              data-testid="file-search-sidebar-collapse"
              variant="outline"
              size="icon-sm"
              title="Hide file explorer"
              @click="collapseSidebar()"
            >
              <PanelLeftOpen aria-hidden="true" />
              <span class="sr-only">Hide file explorer</span>
            </Button>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>        
          <ContextMenu>
            <ContextMenuTrigger as-child>
              <div
                data-testid="file-tree-scroll"
                class="min-h-0 flex-1 overflow-auto"
              >
                <p
                  v-if="!hasWorkspace"
                  class="px-2 text-xs text-muted-foreground"
                >
                  Open a workspace to search and edit files.
                </p>
                <p
                  v-else-if="isSearching"
                  class="px-2 text-xs text-muted-foreground"
                >
                  Loading files…
                </p>
                <p v-else-if="error" class="px-2 text-xs text-destructive">
                  {{ error }}
                </p>
                <p
                  v-else-if="debouncedQuery.trim() && contentSearchError"
                  class="px-2 text-xs text-destructive"
                >
                  {{ contentSearchError }}
                </p>
                <p
                  v-else-if="
                    debouncedQuery.trim() &&
                    isContentSearching &&
                    visibleTree.length === 0
                  "
                  class="px-2 text-xs text-muted-foreground"
                >
                  Searching file contents…
                </p>
                <p
                  v-else-if="visibleTree.length === 0"
                  class="px-2 text-xs text-muted-foreground"
                >
                  No matching files.
                </p>
                <ul v-else class="space-y-0.5 text-xs">
                  <FileTreeNode
                    v-for="node in visibleTree"
                    :key="node.path"
                    :node="node"
                    :selected-path="selectedPath"
                    :expanded-folders="expandedFolders"
                    @toggle-folder="handleToggleFolder"
                    @select-file="handleSelectFile"
                    @add-file="onCtxAddFile"
                    @add-folder="onCtxAddFolder"
                    @delete-folder="onCtxDeleteFolder"
                    @delete-file="onCtxDeleteFile"
                    @queue-for-agent="onQueueTreeItemForAgent"
                  />
                </ul>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent
              data-testid="file-tree-context-menu"
              class="min-w-44"
            >
              <ContextMenuItem
                data-testid="ctx-add-file"
                @select="onCtxAddFile()"
              >
                Add file…
              </ContextMenuItem>
              <ContextMenuItem
                data-testid="ctx-add-folder"
                @select="onCtxAddFolder()"
              >
                Add folder…
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>        
      </SidebarContent>
    </Sidebar>
    <SidebarInset class="flex-1 w-full" @dragover.prevent @drop="onImageDropFromOs">
      <header
        data-testid="file-editor-header"
        class="flex min-h-9 min-w-0 items-stretch border-b py-0 pl-3"
      >
        <Button
          v-if="showThreadSidebarExpand"
          data-testid="file-editor-thread-sidebar-expand"
          variant="outline"
          size="icon-sm"
          class="my-auto ml-20 shrink-0 self-center"
          title="Show thread sidebar"
          aria-label="Show thread sidebar"
          @click="emit('expandThreadSidebar')"
        >
          <PanelLeftOpen class="h-4 w-4" aria-hidden="true" />
          <span class="sr-only">Show thread sidebar</span>
        </Button>
        <div
          class="min-h-9 min-w-0 flex-1 overflow-x-auto overflow-y-hidden border-e py-1 [-webkit-overflow-scrolling:touch]"
        >
          <div class="flex w-max min-w-0 items-center gap-1 pe-2">
            <template v-if="selectedPath">
              <span class="sr-only" data-testid="file-editor-active-path">{{
                selectedPath
              }}</span>
              <div
                v-for="tab in openTabs"
                :key="tab.path"
                :class="
                  cn(
                    badgeVariants({
                      variant:
                        selectedPath === tab.path ? 'secondary' : 'outline',
                    }),
                    'inline-flex h-6 max-w-[16rem] min-w-0 cursor-pointer! shrink-0 items-center gap-0.5 rounded-sm border-0 text-sm font-normal shadow-none',
                  )
                "
                :title="tab.path"
                :data-testid="`file-editor-tab-${tab.path}`"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  @click="void selectTab(tab.path)"
                >
                  <span
                    class="shrink-0 text-[13px] leading-none"
                    aria-hidden="true"
                    >{{ fileEmojiForPath(tab.path) }}</span
                  >
                  <span class="flex min-w-0 flex-col">
                    <span class="truncate text-xs font-normal">{{
                      basenameFromPath(tab.path)
                    }}</span>
                  </span>
                  <span
                    v-if="tab.draftContent !== tab.loadedContent"
                    class="sr-only"
                    >Unsaved changes</span
                  >
                  <span
                    v-if="tab.draftContent !== tab.loadedContent"
                    class="shrink-0 rounded-full size-1.5 bg-amber-600"
                    aria-hidden="true"
                    title="Unsaved changes"
                  />
                </button>
                <Button
                  :data-testid="
                    selectedPath === tab.path
                      ? 'file-editor-tab-close'
                      : undefined
                  "
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  class="size-6 shrink-0 rounded-full text-muted-foreground hover:/80 hover:text-foreground"
                  :aria-label="`Close ${basenameFromPath(tab.path)}`"
                  @click="void handleCloseSpecificTab(tab.path)"
                >
                  <X class="size-3" aria-hidden="true" />
                  <span class="sr-only">Close file tab</span>
                </Button>
              </div>
            </template>
            <p v-else class="shrink-0 text-xs text-muted-foreground">No file</p>
          </div>
        </div>
        <div
          role="toolbar"
          aria-label="File actions"
          class="flex shrink-0 items-center gap-1 border-l border-border bg-background px-3 py-1"
        >
          <Button
            data-testid="toggle-line-numbers"
            variant="outline"
            size="xs"
            :disabled="
              !selectedPath ||
              (isImagePreviewFile && imageFileViewMode === 'preview')
            "
            :aria-pressed="showLineNumbers"
            :title="showLineNumbers ? 'Hide line numbers' : 'Show line numbers'"
            @click="toggleLineNumbers"
          >
            Lines
          </Button>
          <Button
            data-testid="find-in-file"
            variant="outline"
            size="xs"
            :disabled="!canFindInFile"
            :title="`Find in file (${findInFileShortcutHint})`"
            @click="openFindInFile"
          >
            Find
          </Button>
          <Button
            data-testid="refresh-file"
            variant="outline"
            size="icon-xs"
            :disabled="!selectedPath || isLoadingFile"
            title="Reload file from disk"
            @click="handleRefreshFile"
          >
            <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Reload file from disk</span>
          </Button>
          <Button
            data-testid="revert-file"
            variant="outline"
            size="xs"
            :disabled="!selectedPath || !dirty"
            @click="handleRevert"
          >
            Revert
          </Button>
          <Button
            data-testid="save-file"
            variant="default"
            size="xs"
            :disabled="
              !selectedPath || !dirty || isSaving || rasterImageSaveBlocked
            "
            @click="handleSave"
          >
            Save
          </Button>
          <Button
            data-testid="delete-file"
            variant="outline"
            size="icon-xs"
            class="text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="!selectedPath"
            :title="'Delete file'"
            @click="handleDeleteFile"
          >
            <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Delete file</span>
          </Button>
          <Button
            v-if="sidebarCollapsed"
            data-testid="file-search-sidebar-expand"
            variant="outline"
            size="icon-xs"
            title="Show file explorer"
            aria-label="Show file explorer"
            :aria-expanded="false"
            aria-controls="file-search-sidebar"
            @click="expandSidebar()"
          >
            <PanelLeftClose class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Show file explorer</span>
          </Button>
        </div>
      </header>

      <RouterView />
    </SidebarInset>
  </SidebarProvider>

  <Dialog
    :open="newEntryDialogKind !== null"
    @update:open="(open) => (!open ? closeNewEntryDialog() : undefined)"
  >
    <DialogContent
      :data-testid="
        newEntryDialogKind === 'folder'
          ? 'new-folder-dialog'
          : 'new-file-dialog'
      "
      class="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle
          :id="
            newEntryDialogKind === 'folder'
              ? 'new-folder-dialog-title'
              : 'new-file-dialog-title'
          "
        >
          {{ newEntryDialogKind === "folder" ? "New folder" : "New file" }}
        </DialogTitle>
        <DialogDescription v-if="newEntryDialogKind === 'file'" class="text-xs">
          Path relative to the workspace (use
          <span class="font-mono">/</span> for folders).
        </DialogDescription>
        <DialogDescription
          v-else-if="newEntryDialogKind === 'folder'"
          class="text-xs"
        >
          Path relative to the workspace (nested folders are created as needed).
        </DialogDescription>
      </DialogHeader>
      <form class="space-y-3" @submit.prevent="submitNewEntry">
        <div>
          <label :for="newEntryPathInputId" class="sr-only">
            {{ newEntryDialogKind === "folder" ? "Folder path" : "File path" }}
          </label>
          <Input
            :id="newEntryPathInputId"
            ref="newEntryPathInputRef"
            v-model="newEntryPathDraft"
            :data-testid="
              newEntryDialogKind === 'folder'
                ? 'new-folder-path-input'
                : 'new-file-path-input'
            "
            type="text"
            autocomplete="off"
            spellcheck="false"
            class="h-9 w-full rounded-md px-2.5 text-xs focus-visible:ring-2"
            :placeholder="
              newEntryDialogKind === 'folder'
                ? 'e.g. src/components/MyFolder'
                : 'e.g. src/components/MyFile.ts'
            "
          />
          <p
            v-if="newEntryDialogFieldError"
            :data-testid="
              newEntryDialogKind === 'folder'
                ? 'new-folder-dialog-error'
                : 'new-file-dialog-error'
            "
            class="mt-1.5 text-xs text-destructive"
          >
            {{ newEntryDialogFieldError }}
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            :data-testid="
              newEntryDialogKind === 'folder'
                ? 'new-folder-cancel'
                : 'new-file-cancel'
            "
            variant="outline"
            @click="closeNewEntryDialog"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            :data-testid="
              newEntryDialogKind === 'folder'
                ? 'new-folder-confirm'
                : 'new-file-confirm'
            "
            variant="default"
          >
            Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <AlertDialog :open="confirmAction !== null">
    <AlertDialogContent data-testid="confirm-action-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ confirmAction?.title }}</AlertDialogTitle>
        <AlertDialogDescription>{{
          confirmAction?.description
        }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel as-child>
          <Button
            type="button"
            variant="outline"
            data-testid="confirm-action-cancel"
            @click="settleConfirmation(false)"
          >
            Cancel
          </Button>
        </AlertDialogCancel>
        <AlertDialogAction as-child>
          <Button
            type="button"
            :variant="
              confirmAction?.variant === 'destructive'
                ? 'destructive'
                : 'default'
            "
            data-testid="confirm-action-confirm"
            @click="settleConfirmation(true)"
          >
            {{ confirmAction?.confirmLabel ?? "Continue" }}
          </Button>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <ContextQueueSelectionPopup
    :visible="fileEditorQueueVisible"
    :anchor="fileEditorQueueAnchor"
    :go-to-file-path="pendingFileEditorGoToPath"
    @queue="confirmFileEditorQueue"
    @go-to-file="openSelectedFilePath"
    @send-to-agent="injectFileEditorSelectionToAgent"
    @dismiss="dismissFileEditorQueuePopup"
  />
    </template>
    <div
      v-else
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      No active worktree.
    </div>
  </div>
</template>
