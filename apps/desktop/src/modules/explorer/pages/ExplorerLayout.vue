<script setup lang="ts">
import { watchDebounced } from "@vueuse/core";
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  ref,
  watch,
} from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import {
  FilePlus,
  FolderPlus,
  PanelLeftOpen,
  RefreshCw,
  Search,
} from "lucide-vue-next";
import type { FileSummary } from "@shared/ipc";
import { Button } from "@/components/ui/button";
import { CursorLoading } from "@/components/ui/cursor-loading";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import FileTreeNode, {
  type FileTreeNodeData,
} from "@/modules/explorer/components/FileTreeNode.vue";
import { buildPasteText } from "@/contextQueue/formatters";
import { formatFolderListingFromFiles } from "@/contextQueue/folderListing";
import { threadContextQueueKey } from "@/contextQueue/injectionKeys";
import type { QueueCapture } from "@/contextQueue/types";
import { useToast } from "@/hooks/useToast";
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
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarInput,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  explorerShellKey,
  type ExplorerShell,
} from "@/modules/explorer/services/explorerShellContext";
import { normalizeExplorerFilenameParam } from "@/modules/explorer/explorerRoute";
import { getExplorerEditorBridge } from "@/modules/explorer/services/explorerEditorBridge";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

const props = defineProps<{
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
const toast = useToast();

const router = useRouter();
const route = useRoute();

const selectedPath = computed(() =>
  normalizeExplorerFilenameParam(route.params.filename),
);

const searchInput = ref<InstanceType<typeof SidebarInput> | null>(null);
const query = ref("");
const SEARCH_INPUT_DEBOUNCE_MS = 280;
const debouncedQuery = ref("");
const allFiles = ref<FileSummary[]>([]);
const contentMatchPaths = ref<string[]>([]);
const contentSearchError = ref<string | null>(null);
const isContentSearching = ref(false);
let contentSearchSeq = 0;
const expandedFolders = ref<Set<string>>(new Set());
const error = ref<string | null>(null);
const isSearching = ref(false);

const SEARCH_MODE_KEY = "instrument.fileSearchSearchMode";

function readSearchMode(): "path" | "contents" {
  try {
    if (typeof localStorage === "undefined") return "path";
    const v = localStorage.getItem(SEARCH_MODE_KEY);
    return v === "contents" ? "contents" : "path";
  } catch {
    return "path";
  }
}

const searchMode = ref<"path" | "contents">(readSearchMode());

onMounted(() => {
  if (sidebarCollapsed.value === undefined) {
    try {
      sidebarCollapsed.value =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      sidebarCollapsed.value = false;
    }
  }
});

watch(sidebarCollapsed, (collapsed) => {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
});

watch(searchMode, (mode) => {
  try {
    localStorage.setItem(SEARCH_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  if (mode === "path") {
    contentSearchSeq += 1;
    contentMatchPaths.value = [];
    contentSearchError.value = null;
    isContentSearching.value = false;
  }
});

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

const routeSelectedFile = computed(() =>
  normalizeExplorerFilenameParam(route.params.filename),
);

const worktreeEpoch = ref(1);

let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;
let fileSummariesSeq = 0;

watchDebounced(
  () => query.value,
  (v) => {
    debouncedQuery.value = v;
  },
  { debounce: SEARCH_INPUT_DEBOUNCE_MS, flush: "post" },
);

watch(query, (v) => {
  error.value = null;
  if (!v.trim()) {
    debouncedQuery.value = "";
  }
});

watch(
  () => wtPath.value,
  () => {
    debouncedQuery.value = query.value;
  },
);

function getApi() {
  return window.workspaceApi ?? null;
}

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
  const sel = routeSelectedFile.value;
  const folderHint = sel?.includes("/")
    ? sel.replace(/\/[^/]+$/, "")
    : sel
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
  const sel = routeSelectedFile.value;
  const folderHint = sel?.includes("/")
    ? sel.replace(/\/[^/]+$/, "")
    : sel
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

function explorerNavParams(): {
  projectId: string;
  branch: string;
  threadId: string;
} | null {
  const projectId = route.params.projectId as string | undefined;
  const branch = route.params.branch as string | undefined;
  const threadId = route.params.threadId as string | undefined;
  if (!projectId || !branch || !threadId) return null;
  return { projectId, branch, threadId };
}

function navigateToExplorerFile(relativePath: string): void {
  const p = explorerNavParams();
  if (!p) return;
  void router.push({
    name: "fileDetail",
    params: {
      projectId: p.projectId,
      branch: p.branch,
      threadId: p.threadId,
      filename: relativePath,
    },
  });
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
      const bridge = getExplorerEditorBridge();
      if (bridge && !(await bridge.confirmDiscardIfDirty())) return;
      navigateToExplorerFile(normalized);
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

  const bridge = getExplorerEditorBridge();
  const loseEdits =
    bridge?.isOpenFileDirtyUnderFolder(relativePath) ?? false;
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
    bridge?.pruneTabsUnderFolder(relativePath);
    await loadFileSummaries();
    const openRel = normalizeExplorerFilenameParam(route.params.filename);
    const p = explorerNavParams();
    if (openRel && pathIsUnderOrEqualFolder(relativePath, openRel) && p) {
      void router.replace({
        name: "filesPanel",
        params: {
          projectId: p.projectId,
          branch: p.branch,
          threadId: p.threadId,
        },
      });
    }
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

  const openRel = normalizeExplorerFilenameParam(route.params.filename);
  const isOpen = openRel === relativePath;
  const loseEdits =
    isOpen && (getExplorerEditorBridge()?.isActiveFileDirty() ?? false);
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
    getExplorerEditorBridge()?.closeTabForDeletedFile(relativePath);
    await loadFileSummaries();
  } catch (deleteError) {
    error.value =
      deleteError instanceof Error
        ? deleteError.message
        : "Could not delete the file.";
  }
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

function handleToggleFolder(path: string): void {
  const next = new Set(expandedFolders.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  expandedFolders.value = next;
}

function handleSelectFile(relativePath: string): void {
  navigateToExplorerFile(relativePath);
}

function invalidateSidebarForWorktreeChange(): void {
  fileSummariesSeq += 1;
  contentSearchSeq += 1;
  isSearching.value = false;
  isContentSearching.value = false;
}

watch(
  () => [wtId.value ?? null, wtPath.value] as const,
  async ([nextWtId, nextPath], previousValue) => {
    const [previousWtId, previousPath] = previousValue ?? [null, null];
    if (nextWtId === previousWtId && nextPath === previousPath) return;

    invalidateSidebarForWorktreeChange();
    query.value = "";
    debouncedQuery.value = "";
    allFiles.value = [];
    contentMatchPaths.value = [];
    contentSearchError.value = null;
    expandedFolders.value = new Set();
    error.value = null;
    closeNewEntryDialog();

    if (!nextPath) {
      worktreeEpoch.value += 1;
      return;
    }

    await loadFileSummaries();
    worktreeEpoch.value += 1;
    void focusSearchInput();
  },
  { immediate: true },
);

async function focusSearchInput(): Promise<void> {
  await nextTick();
  searchInput.value?.focus();
}

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

async function confirmContextSwitch(
  nextWorktreePath: string | null,
): Promise<boolean> {
  if (nextWorktreePath === wtPath.value) return true;
  const bridge = getExplorerEditorBridge();
  if (!bridge) return true;
  return bridge.confirmDiscardIfDirty();
}

const shell: ExplorerShell = {
  wtPath,
  wtId,
  allFiles,
  sidebarCollapsed,
  expandSidebar,
  focusSearchInput,
  requestConfirmation,
  worktreeEpoch,
  reloadFileSummaries: () => loadFileSummaries(true),
};

provide(explorerShellKey, shell);

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
  refreshFileExplorer: (): void => {
    void loadFileSummaries();
  },
  confirmContextSwitch,
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
      class="border-e"
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
                class="min-h-0 flex-1 overflow-auto px-2 py-2"
              >
                <p
                  v-if="!hasWorkspace"
                  class="px-2 text-xs text-muted-foreground"
                >
                  Open a workspace to search and edit files.
                </p>
                <div
                  v-else-if="isSearching"
                  class="min-h-24 px-2 py-1"
                >
                  <CursorLoading class="min-h-24 w-full" />
                </div>
                <p v-else-if="error" class="px-2 text-xs text-destructive">
                  {{ error }}
                </p>
                <p
                  v-else-if="debouncedQuery.trim() && contentSearchError"
                  class="px-2 text-xs text-destructive"
                >
                  {{ contentSearchError }}
                </p>
                <div
                  v-else-if="
                    debouncedQuery.trim() &&
                    isContentSearching &&
                    visibleTree.length === 0
                  "
                  class="min-h-24 px-2 py-1"
                >
                  <CursorLoading class="min-h-24 w-full" />
                </div>
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
    <SidebarInset class="flex-1 w-full">
      <RouterView
        v-slot="{ Component }"
      >
        <component
          :is="Component"
          :show-thread-sidebar-expand="showThreadSidebarExpand"
          @expand-thread-sidebar="emit('expandThreadSidebar')"
        />
      </RouterView>
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

    </template>
    <div
      v-else
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      No active worktree.
    </div>
  </div>
</template>
