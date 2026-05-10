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
  RefreshCw,
  Search,
} from "lucide-vue-next";
import type { FileSummary } from "@shared/ipc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { FileTree, type FileTreeBatchOperation, type FileTreeDropResult, type FileTreeRenameEvent } from "@pierre/trees";
import { Button } from "@/components/ui/button";
import { CursorLoading } from "@/components/ui/cursor-loading";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { useAppContext } from "@/app-context/useAppContext";

const props = defineProps<{
  worktreeId?: string | null;
  worktreePath?: string | null;
  activeThreadId?: string | null;
  showThreadSidebarExpand?: boolean;
}>();

const { activeWorktree, activeThreadId: routeThreadId } = useActiveWorkspace();
const appContext = useAppContext();
const fileService = computed(() => appContext.value?.fileService);

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
const queryClient = useQueryClient();
const router = useRouter();
const route = useRoute();

const selectedPath = computed(() =>
  normalizeExplorerFilenameParam(route.params.filename),
);

const searchInput = ref<InstanceType<typeof SidebarInput> | null>(null);
const query = ref("");
const SEARCH_INPUT_DEBOUNCE_MS = 280;
const debouncedQuery = ref("");
const contentMatchPaths = ref<string[]>([]);
const contentSearchError = ref<string | null>(null);
const isContentSearching = ref(false);
let contentSearchSeq = 0;
const error = ref<string | null>(null);

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

// ─── Tanstack Query: file listing ────────────────────────────────────────────

const filesQuery = useQuery({
  queryKey: computed(() => ["explorer", "files", wtPath.value]),
  queryFn: async () => {
    const svc = fileService.value;
    const cwd = wtPath.value;
    if (!svc || !cwd) return [] as FileSummary[];
    return svc.listFiles(cwd);
  },
  enabled: computed(() => !!wtPath.value && !!fileService.value),
});

const allFiles = computed<FileSummary[]>(() => filesQuery.data.value ?? []);
const isSearching = computed(() => filesQuery.isFetching.value);

// ─── Content search ───────────────────────────────────────────────────────────

watch(
  [
    () => debouncedQuery.value,
    () => wtPath.value,
    () => searchMode.value,
  ],
  async () => {
    const svc = fileService.value;
    if (!svc || !wtPath.value) {
      contentMatchPaths.value = [];
      contentSearchError.value = null;
      isContentSearching.value = false;
      contentSearchSeq += 1;
      return;
    }

    const q = debouncedQuery.value.trim();
    if (!q || searchMode.value !== "contents") {
      contentMatchPaths.value = [];
      contentSearchError.value = null;
      isContentSearching.value = false;
      contentSearchSeq += 1;
      return;
    }

    if (!svc.searchFileContents) {
      contentMatchPaths.value = [];
      contentSearchError.value = "Full-text search is not available in this build.";
      return;
    }

    const cwd = wtPath.value;
    const seq = ++contentSearchSeq;
    contentSearchError.value = null;
    contentMatchPaths.value = [];
    isContentSearching.value = true;

    try {
      const paths = await svc.searchFileContents(cwd, q);
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

// ─── Filtered file list for tree ─────────────────────────────────────────────

const contentPathsForFilter = computed(() =>
  searchMode.value === "contents" ? contentMatchPaths.value : [],
);

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

// ─── @pierre/trees integration ───────────────────────────────────────────────

const treeContainerRef = ref<HTMLDivElement | null>(null);
let fileTreeInstance: FileTree | null = null;
const treePaths = ref<string[]>([]);

// Context menu state — populated on right-click from trees' focused item
const ctxMenuPath = ref<string | null>(null);
const ctxMenuIsFolder = ref<boolean | null>(null);

function onTreeContextMenu(): void {
  const item = fileTreeInstance?.getFocusedItem() ?? null;
  const itemPath = item ? item.getPath() : null;
  if (itemPath) {
    ctxMenuPath.value = itemPath;
    ctxMenuIsFolder.value = item!.isDirectory();
  } else {
    ctxMenuPath.value = null;
    ctxMenuIsFolder.value = null;
  }
}

function mountFileTree(): void {
  if (!treeContainerRef.value || fileTreeInstance) return;

  const initialPaths = summariesForTree.value
    .filter((f) => f.kind !== "directory")
    .map((f) => f.relativePath);
  treePaths.value = initialPaths;

  fileTreeInstance = new FileTree({
    density: "compact",
    paths: initialPaths,
    renaming: {
      onRename: (event: FileTreeRenameEvent) => { void onPierreRename(event); },
      onError: (err: string) => toast.error("Rename failed", err),
    },
    dragAndDrop: {
      onDropComplete: (event: FileTreeDropResult) => { void onPierreDrop(event); },
      onDropError: (err: string) => toast.error("Move failed", err),
    },
    onSelectionChange: (paths) => {
      const p = paths[0];
      if (p && !fileTreeInstance?.getItem(p)?.isDirectory()) handleSelectFile(p);
    },
  });

  fileTreeInstance.render({ fileTreeContainer: treeContainerRef.value });

  const sel = selectedPath.value;
  if (sel) fileTreeInstance.focusPath(sel);
}

function getAncestorPaths(filePaths: string[]): string[] {
  const ancestors = new Set<string>();
  for (const p of filePaths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      ancestors.add(parts.slice(0, i).join("/"));
    }
  }
  return Array.from(ancestors);
}

watch(summariesForTree, (summaries) => {
  const newPaths = summaries.filter((f) => f.kind !== "directory").map((f) => f.relativePath);
  const isFiltered = !!debouncedQuery.value.trim();

  if (isFiltered) {
    // In search mode: reset with expansion (expansion loss is acceptable; we expand matches)
    fileTreeInstance?.resetPaths(newPaths, { initialExpandedPaths: getAncestorPaths(newPaths) });
  } else {
    // Normal mode: apply only the diff so folder expansion state is preserved
    const oldSet = new Set(treePaths.value);
    const newSet = new Set(newPaths);
    const ops: FileTreeBatchOperation[] = [];
    for (const p of newPaths) if (!oldSet.has(p)) ops.push({ type: "add", path: p });
    for (const p of treePaths.value) if (!newSet.has(p)) ops.push({ type: "remove", path: p });
    if (ops.length > 0) fileTreeInstance?.batch(ops);
  }

  treePaths.value = newPaths;
});

watch(selectedPath, (path) => {
  if (path && fileTreeInstance) {
    fileTreeInstance.focusPath(path);
  }
});

// ─── Pierre rename / drag-and-drop handlers ───────────────────────────────────

async function onPierreRename(event: FileTreeRenameEvent): Promise<void> {
  const svc = fileService.value;
  const cwd = wtPath.value;
  if (!svc?.renameEntry || !cwd) return;

  try {
    await svc.renameEntry(cwd, event.sourcePath, event.destinationPath);

    // Update treePaths to match what pierre already shows
    treePaths.value = treePaths.value.map((p) => {
      if (event.isFolder) {
        const prefix = event.sourcePath + "/";
        if (p.startsWith(prefix)) return event.destinationPath + "/" + p.slice(prefix.length);
      }
      return p === event.sourcePath ? event.destinationPath : p;
    });

    // Navigate to new path if the renamed/moved item was open
    if (!event.isFolder) {
      const openPath = normalizeExplorerFilenameParam(route.params.filename);
      if (openPath === event.sourcePath) navigateToExplorerFile(event.destinationPath);
    }

    void queryClient.invalidateQueries({ queryKey: ["explorer", "files", cwd] });
  } catch (err) {
    toast.error("Rename failed", err instanceof Error ? err.message : "Could not rename.");
  }
}

async function onPierreDrop(event: FileTreeDropResult): Promise<void> {
  const svc = fileService.value;
  const cwd = wtPath.value;
  if (!svc?.renameEntry || !cwd) return;

  const targetDir = event.target.directoryPath ?? "";
  const openPath = normalizeExplorerFilenameParam(route.params.filename);

  try {
    for (const draggedPath of event.draggedPaths) {
      const basename = draggedPath.split("/").pop() ?? draggedPath;
      const toPath = targetDir ? `${targetDir}/${basename}` : basename;
      if (toPath === draggedPath) continue;

      await svc.renameEntry(cwd, draggedPath, toPath);

      // Update treePaths for what pierre already moved
      treePaths.value = treePaths.value.map((p) => {
        const prefix = draggedPath + "/";
        if (p.startsWith(prefix)) return toPath + "/" + p.slice(prefix.length);
        return p === draggedPath ? toPath : p;
      });

      if (openPath === draggedPath) navigateToExplorerFile(toPath);
    }

    void queryClient.invalidateQueries({ queryKey: ["explorer", "files", cwd] });
  } catch (err) {
    toast.error("Move failed", err instanceof Error ? err.message : "Could not move files.");
  }
}

// ─── Agent queue ──────────────────────────────────────────────────────────────

async function onQueueTreeItemForAgent(payload: {
  kind: "file" | "folder";
  path: string;
}): Promise<void> {
  const tid = threadIdForQueue.value;
  if (!tid || !threadQueue) {
    toast.error("No active thread", "Select a thread before queuing context.");
    return;
  }
  const svc = fileService.value;
  const cwd = wtPath.value;
  if (!svc || !cwd) return;

  const files = await svc.listFiles(cwd);
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
    body = await svc.readFile(cwd, payload.path);
    if (body.length > 8000) body = `${body.slice(0, 8000)}\n… (truncated)`;
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

// ─── File / folder creation ───────────────────────────────────────────────────

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
  const c = newEntryPathInputRef.value as unknown as { $el?: unknown } | null;
  const el = c?.$el;
  if (el instanceof HTMLInputElement) {
    el.focus();
    el.select();
  }
}

async function openNewFileDialog(folderPathPrefix?: string): Promise<void> {
  const svc = fileService.value;
  const cwd = wtPath.value;
  if (!svc || !cwd) return;

  newEntryPathDraft.value = computeNewFileDefaultValue(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined,
  );
  newEntryDialogFieldError.value = null;
  newEntryDialogKind.value = "file";
  await nextTick();
  focusSelectNewEntryPathInput();
}

async function openNewFolderDialog(folderPathPrefix?: string): Promise<void> {
  const svc = fileService.value;
  const cwd = wtPath.value;
  if (!svc?.createFolder || !cwd) return;

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
  const svc = fileService.value;
  const cwd = wtPath.value;
  if (!kind || !svc || !cwd) return;

  if (kind === "file") {
    const normalized = normalizeNewFilePathInput(newEntryPathDraft.value);
    if (!normalized || normalized.endsWith("/")) {
      newEntryDialogFieldError.value = "Enter a file path (not a folder).";
      return;
    }

    newEntryDialogFieldError.value = null;
    error.value = null;

    try {
      await svc.createFile(cwd, normalized);
      closeNewEntryDialog();
      // Optimistic tree update: add the new file without resetting expansion
      fileTreeInstance?.add(normalized);
      treePaths.value = [...treePaths.value, normalized];
      void queryClient.invalidateQueries({ queryKey: ["explorer", "files", cwd] });
      const bridge = getExplorerEditorBridge();
      if (bridge && !(await bridge.confirmDiscardIfDirty())) return;
      navigateToExplorerFile(normalized);
    } catch (createError) {
      newEntryDialogFieldError.value =
        createError instanceof Error ? createError.message : "Could not create the file.";
    }
    return;
  }

  if (!svc.createFolder) return;

  const normalized = normalizeNewFilePathInput(newEntryPathDraft.value).replace(
    /\/+$/,
    "",
  );
  if (!normalized) {
    newEntryDialogFieldError.value = "Enter a folder path.";
    return;
  }

  newEntryDialogFieldError.value = null;

  try {
    await svc.createFolder(cwd, normalized);
    closeNewEntryDialog();
    void queryClient.invalidateQueries({ queryKey: ["explorer", "files", cwd] });
  } catch (createError) {
    newEntryDialogFieldError.value =
      createError instanceof Error ? createError.message : "Could not create the folder.";
  }
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
  await openNewFileDialog(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined,
  );
}

async function handleAddFolder(folderPathPrefix?: string): Promise<void> {
  await openNewFolderDialog(
    typeof folderPathPrefix === "string" ? folderPathPrefix : undefined,
  );
}

function pathIsUnderOrEqualFolder(parentRel: string, childRel: string): boolean {
  const p = parentRel.replace(/\/+$/, "");
  const c = childRel.replace(/\/+$/, "");
  return c === p || c.startsWith(`${p}/`);
}

const deleteFolderMutation = useMutation({
  mutationFn: async (relativePath: string) => {
    const svc = fileService.value;
    const cwd = wtPath.value;
    if (!svc?.deleteFolder || !cwd) throw new Error("No workspace");
    await svc.deleteFolder(cwd, relativePath);
    return { relativePath, cwd };
  },
  onSuccess: ({ relativePath, cwd }) => {
    const bridge = getExplorerEditorBridge();
    bridge?.pruneTabsUnderFolder(relativePath);
    const removedPaths = treePaths.value.filter((p) => pathIsUnderOrEqualFolder(relativePath, p));
    if (removedPaths.length > 0) {
      fileTreeInstance?.batch(removedPaths.map((p) => ({ type: "remove" as const, path: p })));
      treePaths.value = treePaths.value.filter((p) => !pathIsUnderOrEqualFolder(relativePath, p));
    }
    void queryClient.invalidateQueries({ queryKey: ["explorer", "files", cwd] });
    const openRel = normalizeExplorerFilenameParam(route.params.filename);
    const p = explorerNavParams();
    if (openRel && pathIsUnderOrEqualFolder(relativePath, openRel) && p) {
      void router.replace({
        name: "filesPanel",
        params: { projectId: p.projectId, branch: p.branch, threadId: p.threadId },
      });
    }
  },
  onError: (err) => {
    toast.error("Delete failed", err instanceof Error ? err.message : "Could not delete the folder.");
  },
});

const deleteFileMutation = useMutation({
  mutationFn: async (relativePath: string) => {
    const svc = fileService.value;
    const cwd = wtPath.value;
    if (!svc || !cwd) throw new Error("No workspace");
    await svc.deleteFile(cwd, relativePath);
    return { relativePath, cwd };
  },
  onSuccess: ({ relativePath, cwd }) => {
    getExplorerEditorBridge()?.closeTabForDeletedFile(relativePath);
    fileTreeInstance?.remove(relativePath);
    treePaths.value = treePaths.value.filter((p) => p !== relativePath);
    void queryClient.invalidateQueries({ queryKey: ["explorer", "files", cwd] });
  },
  onError: (err) => {
    toast.error("Delete failed", err instanceof Error ? err.message : "Could not delete the file.");
  },
});

async function deleteFolderAtPath(relativePath: string): Promise<void> {
  if (!relativePath) return;
  const svc = fileService.value;
  const cwd = wtPath.value;
  if (!svc?.deleteFolder || !cwd) return;

  const bridge = getExplorerEditorBridge();
  const loseEdits = bridge?.isOpenFileDirtyUnderFolder(relativePath) ?? false;
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

  deleteFolderMutation.mutate(relativePath);
}

async function deleteFileAtPath(relativePath: string): Promise<void> {
  if (!relativePath) return;
  const svc = fileService.value;
  const cwd = wtPath.value;
  if (!svc || !cwd) return;

  const openRel = normalizeExplorerFilenameParam(route.params.filename);
  const isOpen = openRel === relativePath;
  const loseEdits = isOpen && (getExplorerEditorBridge()?.isActiveFileDirty() ?? false);
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

  deleteFileMutation.mutate(relativePath);
}

function startRenamingItem(path: string | null): void {
  if (path) fileTreeInstance?.startRenaming(path);
}

// ─── Selection & navigation ───────────────────────────────────────────────────

function handleSelectFile(relativePath: string): void {
  navigateToExplorerFile(relativePath);
}

// ─── Worktree change ──────────────────────────────────────────────────────────

watch(
  () => [wtId.value ?? null, wtPath.value] as const,
  async ([nextWtId, nextPath], previousValue) => {
    const [previousWtId, previousPath] = previousValue ?? [null, null];
    if (nextWtId === previousWtId && nextPath === previousPath) return;

    contentSearchSeq += 1;
    query.value = "";
    debouncedQuery.value = "";
    contentMatchPaths.value = [];
    contentSearchError.value = null;
    error.value = null;
    closeNewEntryDialog();

    if (!nextPath) {
      treePaths.value = [];
      worktreeEpoch.value += 1;
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["explorer", "files", nextPath] });
    worktreeEpoch.value += 1;
    void focusSearchInput();
  },
  { immediate: true },
);

// ─── Sidebar controls ─────────────────────────────────────────────────────────

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

// ─── Confirmation dialog ──────────────────────────────────────────────────────

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

// ─── Shell context ────────────────────────────────────────────────────────────

const shell: ExplorerShell = {
  wtPath,
  wtId,
  allFiles: allFiles as unknown as import("vue").Ref<FileSummary[]>,
  sidebarCollapsed,
  expandSidebar,
  collapseSidebar,
  focusSearchInput,
  requestConfirmation,
  worktreeEpoch,
  reloadFileSummaries: async () => {
    if (wtPath.value) {
      await queryClient.invalidateQueries({ queryKey: ["explorer", "files", wtPath.value] });
    }
  },
};

provide(explorerShellKey, shell);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

let disposeWorkspaceChanged: (() => void) | null = null;
let disposeWorkingTreeFilesChanged: (() => void) | null = null;

onMounted(() => {
  void focusSearchInput();

  const svc = fileService.value;
  if (svc?.onWorkspaceChanged) {
    disposeWorkspaceChanged = svc.onWorkspaceChanged(() => {
      if (wtPath.value) {
        void queryClient.invalidateQueries({ queryKey: ["explorer", "files", wtPath.value] });
      }
    });
  }
  if (svc?.onWorkingTreeFilesChanged) {
    disposeWorkingTreeFilesChanged = svc.onWorkingTreeFilesChanged(() => {
      if (wtPath.value) {
        void queryClient.invalidateQueries({ queryKey: ["explorer", "files", wtPath.value] });
      }
    });
  }

  document.addEventListener("keydown", onGlobalKeydown);
  mountFileTree();
});

onUnmounted(() => {
  disposeWorkspaceChanged?.();
  disposeWorkspaceChanged = null;
  disposeWorkingTreeFilesChanged?.();
  disposeWorkingTreeFilesChanged = null;
  document.removeEventListener("keydown", onGlobalKeydown);
  fileTreeInstance?.cleanUp();
  fileTreeInstance = null;
  treePaths.value = [];
});

defineExpose({
  focusSearch: (): void => {
    void focusSearchAfterReveal();
  },
  expandSidebar,
  refreshFileExplorer: (): void => {
    if (wtPath.value) {
      void queryClient.invalidateQueries({ queryKey: ["explorer", "files", wtPath.value] });
    }
  },
  confirmContextSwitch,
  openWorkspaceFile: handleSelectFile,
});
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden w-full">
    <template v-if="wtPath">
      <SidebarProvider
        class="flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden"
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
          <SidebarHeader data-testid="file-search-header" class="shrink-0 gap-1">
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
                  @click="() => wtPath && queryClient.invalidateQueries({ queryKey: ['explorer', 'files', wtPath] })"
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
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent class="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <ContextMenu>
              <ContextMenuTrigger as-child>
                <div
                  data-testid="file-tree-scroll"
                  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-2 py-2"
                  @contextmenu="onTreeContextMenu"
                >
                  <p
                    v-if="!hasWorkspace"
                    class="px-2 text-xs text-muted-foreground"
                  >
                    Open a workspace to search and edit files.
                  </p>
                  <div
                    v-else-if="isSearching && allFiles.length === 0"
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
                      summariesForTree.length === 0
                    "
                    class="min-h-24 px-2 py-1"
                  >
                    <CursorLoading class="min-h-24 w-full" />
                  </div>
                  <p
                    v-else-if="summariesForTree.length === 0"
                    class="px-2 text-xs text-muted-foreground"
                  >
                    No matching files.
                  </p>
                  <!-- trees mounts into this container -->
                  <div
                    ref="treeContainerRef"
                    class="w-full trees-shadcn p-0"
                    :class="{ hidden: summariesForTree.length === 0 || isSearching && allFiles.length === 0 || !!error }"
                  />
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent
                data-testid="file-tree-context-menu"
                class="min-w-44"
              >
                <template v-if="ctxMenuPath !== null">
                  <!-- Folder context menu -->
                  <template v-if="ctxMenuIsFolder">
                    <ContextMenuItem
                      data-testid="ctx-rename-folder"
                      class="text-xs"
                      @select="startRenamingItem(ctxMenuPath)"
                    >
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem
                      data-testid="ctx-add-file"
                      class="text-xs"
                      @select="handleAddFile(ctxMenuPath!)"
                    >
                      Add file…
                    </ContextMenuItem>
                    <ContextMenuItem
                      data-testid="ctx-add-folder"
                      class="text-xs"
                      @select="handleAddFolder(ctxMenuPath!)"
                    >
                      Add folder…
                    </ContextMenuItem>
                    <ContextMenuItem
                      data-testid="ctx-delete-folder"
                      variant="destructive"
                      class="text-xs"
                      @select="deleteFolderAtPath(ctxMenuPath!)"
                    >
                      Delete folder
                    </ContextMenuItem>
                    <ContextMenuItem
                      data-testid="ctx-queue-folder"
                      class="text-xs"
                      @select="onQueueTreeItemForAgent({ kind: 'folder', path: ctxMenuPath! })"
                    >
                      Queue folder for agent
                    </ContextMenuItem>
                  </template>
                  <!-- File context menu -->
                  <template v-else>
                    <ContextMenuItem
                      data-testid="ctx-rename-file"
                      class="text-xs"
                      @select="startRenamingItem(ctxMenuPath)"
                    >
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem
                      data-testid="ctx-delete-file"
                      variant="destructive"
                      class="text-xs"
                      @select="deleteFileAtPath(ctxMenuPath!)"
                    >
                      Delete file
                    </ContextMenuItem>
                    <ContextMenuItem
                      data-testid="ctx-queue-file"
                      class="text-xs"
                      @select="onQueueTreeItemForAgent({ kind: 'file', path: ctxMenuPath! })"
                    >
                      Queue file for agent
                    </ContextMenuItem>
                  </template>
                </template>
                <!-- Root-level right-click -->
                <template v-else>
                  <ContextMenuItem
                    data-testid="ctx-add-file"
                    @select="handleAddFile()"
                  >
                    Add file…
                  </ContextMenuItem>
                  <ContextMenuItem
                    data-testid="ctx-add-folder"
                    @select="handleAddFolder()"
                  >
                    Add folder…
                  </ContextMenuItem>
                </template>
              </ContextMenuContent>
            </ContextMenu>
          </SidebarContent>
        </Sidebar>
        <SidebarInset class="min-h-0 min-w-0 flex-1 overflow-hidden">
          <RouterView v-slot="{ Component }">
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

<style>
.trees-shadcn {
  --trees-padding-inline-override: 0px;
  --trees-bg-override: var(--background);
  --trees-fg-override: var(--sidebar-foreground);
  --trees-fg-muted-override: var(--muted-foreground);
  --trees-bg-muted-override: var(--muted);
  --trees-border-color-override: var(--border);
  --trees-selected-bg-override: var(--accent);
  --trees-selected-fg-override: var(--accent-foreground);
  --trees-search-bg-override: var(--input);
  --trees-search-fg-override: var(--sidebar-foreground);
  --trees-focus-ring-color-override: var(--ring);
  --trees-scrollbar-thumb-override: var(--border);
  --trees-border-radius-override: var(--radius-sm);
}
</style>
