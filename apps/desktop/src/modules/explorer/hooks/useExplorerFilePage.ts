import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type ComputedRef,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import type MonacoEditor from "@/components/MonacoEditor.vue";
import type { QueueableEditorSelection } from "@/components/MonacoEditor.vue";
import { buildPasteText } from "@/contextQueue/formatters";
import {
  injectContextToAgentKey,
  threadContextQueueKey,
} from "@/contextQueue/injectionKeys";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/utils/contextQueueAnchor";
import { resolveSelectionFilePath } from "@/utils/selectionFilePath";
import { fileEmojiForPath } from "@/utils/fileEmojiForPath";
import { useToast } from "@/hooks/useToast";
import { type PillTabItem } from "@/components/ui/pill-tabs";
import { monacoLanguageIdFromPath } from "@/utils/monacoLanguage";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import type { ExplorerShell } from "@/modules/explorer/services/explorerShellContext";
import { normalizeExplorerFilenameParam } from "@/modules/explorer/explorerRoute";
import {
  registerExplorerEditorBridge,
  type ExplorerEditorBridge,
} from "@/modules/explorer/services/explorerEditorBridge";
import type { FileSearchEditorPageViewModel } from "@/modules/explorer/hooks/fileSearchEditorPageContext";

export function useExplorerFilePage(
  shell: ExplorerShell,
): FileSearchEditorPageViewModel {
  const wtPath = shell.wtPath;
  const wtId = shell.wtId;
  const { activeThreadId: routeThreadId } = useActiveWorkspace();
  const threadIdForQueue = computed(
    () => routeThreadId.value ?? null,
  ) as ComputedRef<string | null>;
  const threadQueue = inject(threadContextQueueKey, undefined);
  const injectContextToAgent = inject(injectContextToAgentKey, undefined);
  const toast = useToast();
  const router = useRouter();
  const route = useRoute();

  function getApi() {
    return window.workspaceApi ?? null;
  }

function basenameFromPath(absPath: string): string {
  const parts = absPath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? absPath;
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
const isLoadingFile = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);
const LINE_NUMBERS_VISIBLE_KEY = "instrument.fileSearchLineNumbersVisible";
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
const showLineNumbers = ref(
  readLocalStorageFlag(LINE_NUMBERS_VISIBLE_KEY, true),
);
watch(showLineNumbers, (visible) => {
  try {
    localStorage.setItem(LINE_NUMBERS_VISIBLE_KEY, visible ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
});
let fileSummariesSeq = 0;
let openFileSeq = 0;
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

const isMarkdownFile = computed(
  () => selectedPath.value?.toLowerCase().endsWith(".md") ?? false,
);
async function confirmDiscardForTab(path: string): Promise<boolean> {
  const tab = findTab(path);
  if (!tab || tab.draftContent === tab.loadedContent) return true;
  return shell.requestConfirmation({
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
async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!dirty.value) return true;
  return shell.requestConfirmation({
    title: "Discard unsaved changes?",
    description: "Your current edits will be lost if you continue.",
    confirmLabel: "Discard changes",
    variant: "destructive",
  });
}
function invalidateEditorRequests(): void {
  openFileSeq += 1;
  isLoadingFile.value = false;
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
function pathIsUnderOrEqualFolder(
  parentRel: string,
  childRel: string,
): boolean {
  const p = parentRel.replace(/\/+$/, "");
  const c = childRel.replace(/\/+$/, "");
  return c === p || c.startsWith(`${p}/`);
}
async function deleteFileAtPath(relativePath: string): Promise<void> {
  const api = getApi();
  const cwd = wtPath.value;
  if (!api || !cwd) return;

  const isSelected = selectedPath.value === relativePath;
  const loseEdits = isSelected && dirty.value;
  if (
    !(await shell.requestConfirmation({
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
    await shell.reloadFileSummaries();
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

async function confirmContextSwitch(
  nextWorktreePath: string | null,
): Promise<boolean> {
  if (nextWorktreePath === wtPath.value) return true;
  return confirmDiscardIfDirty();
}
async function syncExplorerRouteFromSelection(options?: {
  replace?: boolean;
}): Promise<void> {
  const name = route.name;
  const isBranch = name === "filesPanelBranch" || name === "fileDetailBranch";
  const isThread = name === "filesPanel" || name === "fileDetail";
  if (!isThread && !isBranch) return;

  const projectId = route.params.projectId as string | undefined;
  const branch = route.params.branch as string | undefined;
  if (!projectId || !branch) return;
  const threadId = route.params.threadId as string | undefined;
  if (isThread && !threadId) return;

  const path = selectedPath.value;
  const doReplace = options?.replace ?? false;
  const panelName = isBranch ? "filesPanelBranch" : "filesPanel";
  const detailName = isBranch ? "fileDetailBranch" : "fileDetail";
  const baseParams = threadId ? { projectId, branch, threadId } : { projectId, branch };

  if (!path) {
    if (route.name !== panelName) {
      const nav = { name: panelName as string, params: baseParams };
      if (doReplace) await router.replace(nav);
      else await router.push(nav);
    }
    return;
  }

  if (route.name === detailName && normalizeExplorerFilenameParam(route.params.filename) === path) {
    return;
  }

  const nav = { name: detailName as string, params: { ...baseParams, filename: path } };
  if (doReplace) await router.replace(nav);
  else await router.push(nav);
}

watch(
  () =>
    [
      route.name,
      normalizeExplorerFilenameParam(route.params.filename),
    ] as const,
  async ([name, pathFromRoute]) => {
    if ((name !== "fileDetail" && name !== "fileDetailBranch") || pathFromRoute == null) return;
    if (selectedPath.value === pathFromRoute) return;
    await handleSelectFile(pathFromRoute);
  },
);

const page = reactive({
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
  isMarkdownFile,
  showLineNumbers,
  queueSelectionHintsEnabled,
  monacoEditorRef,
  onEditorQueueableSelection,
  handleSave,
  externalDropPreview,
  clearExternalDropPreview,
  openTabs,
  selectTab,
  handleCloseSpecificTab,
  basenameFromPath,
  fileEmojiForPath,
  toggleLineNumbers,
  openFindInFile,
  handleRefreshFile,
  handleRevert,
  handleDeleteFile,
  canFindInFile,
  findInFileShortcutHint,
  rasterImageSaveBlocked,
  dirty,
  isSaving,
  sidebarCollapsed: shell.sidebarCollapsed,
  expandSidebar: shell.expandSidebar,
  collapseSidebar: shell.collapseSidebar,
  onImageDropFromOs,
  fileEditorQueueVisible,
  fileEditorQueueAnchor,
  pendingFileEditorGoToPath,
  confirmFileEditorQueue,
  openSelectedFilePath,
  injectFileEditorSelectionToAgent,
  dismissFileEditorQueuePopup,
});

watch([selectedPath, () => openTabPaths()], ([path, openPaths]) => {
  externalDropPreview.value = null;
  void persistEditorState(path, openPaths);
});

watch(
  () =>
    [
      shell.worktreeEpoch.value,
      wtId.value ?? null,
      wtPath.value,
    ] as const,
  async ([epoch, nextWorktreeId, nextPath], previousValue) => {
    const [prevEpoch, previousWorktreeId, previousPath] = previousValue ?? [
      0,
      null,
      null,
    ];
    if (
      epoch === prevEpoch &&
      nextWorktreeId === previousWorktreeId &&
      nextPath === previousPath
    ) {
      return;
    }
    if (epoch === 0) return;
    if (!nextWorktreeId || !nextPath) return;
    const savedState = await loadPersistedEditorState(nextWorktreeId, nextPath);
    invalidateEditorRequests();
    externalDropPreview.value = null;
    isSaving.value = false;
    error.value = null;
    openTabs.value = [];
    selectedPath.value = null;
    const existingSavedPaths = savedState.openFilePaths
      .filter((path, index, arr) => arr.indexOf(path) === index)
      .filter((path) =>
        shell.allFiles.value.some(
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
    void shell.focusSearchInput();
  },
  { immediate: true },
);
  onMounted(() => {
    const b: ExplorerEditorBridge = {
      confirmDiscardIfDirty,
      isActiveFileDirty: () => dirty.value,
      selectedFilePath: () => selectedPath.value,
      isOpenFileDirtyUnderFolder: (folderRel: string) => {
        const sel = selectedPath.value;
        return Boolean(
          sel && pathIsUnderOrEqualFolder(folderRel, sel) && dirty.value,
        );
      },
      pruneTabsUnderFolder: (folderPath: string) => {
        removeTabsMatching((tab) =>
          pathIsUnderOrEqualFolder(folderPath, tab.path),
        );
      },
      closeTabForDeletedFile: (fileRelPath: string) => {
        closeTabWithoutConfirmation(fileRelPath);
      },
    };
    registerExplorerEditorBridge(b);
  });

  onUnmounted(() => {
    registerExplorerEditorBridge(null);
  });

  return page;
}
