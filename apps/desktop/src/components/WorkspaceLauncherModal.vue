<script setup lang="ts">
import { Search } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import { RouterLink, useRoute, type RouteLocationRaw } from "vue-router";
import { CursorLoading } from "@/components/ui/cursor-loading";
import WorkspaceLauncherModalRow from "@/components/WorkspaceLauncherModalRow.vue";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  parseLauncherQuery,
  searchLauncherCommands,
  searchLauncherRows,
  searchLauncherWorkspaceSwitch,
  type LauncherCommandId,
  type LauncherRow,
  type LauncherSectionId
} from "@/utils/workspaceLauncherSearch";
import { findDefinitionIn, formatShortcut } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { FileSummary } from "@shared/ipc";
import { encodeBranch } from "@/router/branchParam";

const open = defineModel<boolean>({ default: false });

const emit = defineEmits<{
  pickThread: [threadId: string];
  pickFile: [payload: { relativePath: string; worktreeId: string | null }];
  pickCommand: [id: LauncherCommandId];
  pickProject: [projectId: string];
  pickWorktree: [worktreeId: string];
}>();

const workspace = useWorkspaceStore();
const active = useActiveWorkspace();
const keybindings = useKeybindingsStore();
const route = useRoute();

const query = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const selectedIndex = ref(0);
const loading = ref(false);
const loadError = ref<string | null>(null);

const branchFiles = ref<{ relativePath: string }[]>([]);

function getApi(): WorkspaceApi | null {
  return typeof window !== "undefined" && window.workspaceApi ? window.workspaceApi : null;
}

const parsed = computed(() => parseLauncherQuery(query.value));

const launcherToggleShortcutLabel = computed(() => {
  const def = findDefinitionIn(keybindings.effectiveDefinitions, "workspaceLauncher");
  return def ? formatShortcut(def.shortcut) : "⌘K";
});

/** Commands match on visible tokens without `@` toggle noise (all non-default modes use stripped query). */
const commandSearchText = computed(() =>
  parsed.value.mode === "default" ? query.value : parsed.value.query
);

const commandShortcutHints = computed(() => ({
  "open-settings": keybindings.shortcutLabelForId("openSettings")
}));

const rows = computed<LauncherRow[]>(() => {
  const cmds = searchLauncherCommands(commandSearchText.value, commandShortcutHints.value);
  const switchRows = searchLauncherWorkspaceSwitch(
    parsed.value,
    commandSearchText.value,
    workspace.projects,
    active.activeProjectId.value,
    workspace.threads,
    active.activeWorktreePath.value
  );
  const rest = searchLauncherRows(
    parsed.value,
    active.activeThreads.value,
    branchFiles.value,
    []
  );
  return [...cmds, ...switchRows, ...rest];
});

/** Cap rendered rows; panel scrolls with overflow-y-auto (no virtual list). */
const MAX_LAUNCHER_ROWS = 80;

const visibleRows = computed(() => rows.value.slice(0, MAX_LAUNCHER_ROWS));

const SECTION_LABELS: Record<LauncherSectionId, string> = {
  commands: "Actions",
  workspace: "Projects",
  worktrees: "Worktrees",
  agents: "Recent Threads",
  files: "Files"
};


type LauncherFlatItem =
  | { kind: "divider" }
  | { kind: "header"; section: LauncherSectionId; isFirst: boolean }
  | { kind: "row"; row: LauncherRow; rowIndex: number };

const flatLauncherItems = computed<LauncherFlatItem[]>(() => {
  const r = visibleRows.value;
  const out: LauncherFlatItem[] = [];
  for (let i = 0; i < r.length; i++) {
    const row = r[i]!;
    if (i > 0 && row.section !== r[i - 1]!.section) {
      out.push({ kind: "divider" });
    }
    if (i === 0 || row.section !== r[i - 1]!.section) {
      out.push({ kind: "header", section: row.section, isFirst: i === 0 });
    }
    out.push({ kind: "row", row, rowIndex: i });
  }
  return out;
});

const resultsListRef = ref<HTMLElement | null>(null);

function launcherFlatItemKey(item: LauncherFlatItem, idx: number): string {
  if (item.kind === "divider") return `divider-${idx}`;
  if (item.kind === "header") return `header-${item.section}-${idx}`;
  const r = item.row;
  if (r.kind === "thread") return `row-thread-${r.id}`;
  if (r.kind === "command") return `row-cmd-${r.id}`;
  if (r.kind === "project") return `row-proj-${r.projectId}`;
  if (r.kind === "worktree") return `row-wt-${r.worktreeId}`;
  return `row-file-${r.relativePath}`;
}

async function scrollSelectedRowIntoView(): Promise<void> {
  await nextTick();
  resultsListRef.value
    ?.querySelector<HTMLElement>("[data-launcher-selected=\"true\"]")
    ?.scrollIntoView({ block: "nearest" });
}

function launcherRowRoute(row: LauncherRow): RouteLocationRaw | null {
  const projectId = route.params.projectId as string | undefined;
  const branch = route.params.branch as string | undefined;
  if (!projectId || !branch) return null;

  if (row.kind === "command") {
    if (row.id === "new-thread") {
      return { name: "threadNew", params: { projectId, branch } };
    }
    if (row.id === "open-settings") {
      return { name: "settingsAgents", params: { projectId, branch } };
    }
    return null;
  }
  if (row.kind === "thread") {
    return { name: "agent", params: { projectId, branch, threadId: row.id } };
  }
  if (row.kind === "file") {
    const threadId = active.activeThreadId.value;
    if (!threadId || !row.relativePath) return null;
    return {
      name: "fileDetail",
      params: { projectId, branch, threadId, filename: row.relativePath }
    };
  }
  if (row.kind === "worktree") {
    const matched = workspace.threads.find(
      (t) => t.projectId === projectId && t.worktreePath === row.worktreeId
    );
    if (!matched?.createdBranch) return null;
    return {
      name: "agent",
      params: {
        projectId,
        branch: encodeBranch(matched.createdBranch),
        threadId: matched.id
      }
    };
  }
  return null;
}

const emptyHint = computed(() => {
  if (loadError.value) return loadError.value;
  if (parsed.value.mode === "worktree") {
    if (!query.value.startsWith("@wt")) return "";
    if (!parsed.value.query.trim()) {
      return branchFiles.value.length === 0
        ? "No files available in this worktree."
        : "Type to search files in this worktree.";
    }
  }
  if (parsed.value.mode === "files") {
    if (!parsed.value.query.trim()) {
      return branchFiles.value.length === 0
        ? "No files available in this worktree."
        : "Files in this worktree — type to filter by path.";
    }
  }
  if (!query.value.trim()) {
    return "Search commands, projects, threads, and files in this workspace.";
  }
  return "No results.";
});

async function loadIndexes(): Promise<void> {
  const api = getApi();
  const activeWt = active.activeWorktree.value;
  loadError.value = null;
  branchFiles.value = [];

  if (!api || !activeWt) {
    return;
  }

  loading.value = true;
  try {
    const listed = await api.listFiles(activeWt.path);
    branchFiles.value = listed.map((f: FileSummary) => ({ relativePath: f.relativePath }));
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : "Could not load files.";
  } finally {
    loading.value = false;
  }
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  query.value = "";
  selectedIndex.value = 0;
  await loadIndexes();
  await nextTick();
  inputRef.value?.focus();
  await scrollSelectedRowIntoView();
});

watch(
  () => ({ q: query.value, len: visibleRows.value.length }),
  (cur, prev) => {
    if (!prev) return;
    if (cur.q !== prev.q) {
      const oldLen = prev.len;
      const newLen = cur.len;
      const idx = selectedIndex.value;
      const wasAtEnd = oldLen > 0 && idx === oldLen - 1;
      if (wasAtEnd) {
        selectedIndex.value = 0;
      } else if (idx >= newLen) {
        selectedIndex.value = Math.max(0, newLen - 1);
      }
    } else if (cur.len !== prev.len) {
      if (selectedIndex.value >= cur.len) {
        selectedIndex.value = Math.max(0, cur.len - 1);
      }
    }
  }
);

watch(selectedIndex, () => {
  void scrollSelectedRowIntoView();
});

function close(): void {
  open.value = false;
}

function activateRow(row: LauncherRow): void {
  if (row.kind === "command") {
    emit("pickCommand", row.id);
  } else if (row.kind === "project") {
    emit("pickProject", row.projectId);
  } else if (row.kind === "worktree") {
    emit("pickWorktree", row.worktreeId);
  } else if (row.kind === "thread") {
    emit("pickThread", row.id);
  } else {
    emit("pickFile", { relativePath: row.relativePath, worktreeId: row.worktreeId });
  }
  close();
}

function onInputKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    close();
    return;
  }

  const list = visibleRows.value;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    if (list.length === 0) return;
    selectedIndex.value = (selectedIndex.value + 1) % list.length;
    return;
  }
  if (ev.key === "ArrowUp") {
    ev.preventDefault();
    if (list.length === 0) return;
    selectedIndex.value = (selectedIndex.value - 1 + list.length) % list.length;
    return;
  }
  if (ev.key === "Enter") {
    ev.preventDefault();
    const row = list[selectedIndex.value];
    if (row) activateRow(row);
  }
}

function launcherRowTestId(row: LauncherRow): string {
  if (row.kind === "thread") return `launcher-thread-${row.id}`;
  if (row.kind === "command") return `launcher-command-${row.id}`;
  if (row.kind === "project") return `launcher-project-${row.projectId}`;
  if (row.kind === "worktree") return `launcher-worktree-${row.worktreeId}`;
  return `launcher-file-${row.relativePath}`;
}

</script>

<template>
  <Dialog :open="open" @update:open="(next) => (open = next)">
    <DialogContent
      aria-label="Workspace search"
      :show-close-button="false"
      class="workspace-launcher-panel top-[15vh] z-[60] w-full max-w-lg translate-y-0 gap-0 p-0 text-popover-foreground ring-0 sm:max-w-lg"
    >
      <DialogHeader class="sr-only">
        <DialogTitle>Workspace search</DialogTitle>
      </DialogHeader>
      <div class="relative z-[301] flex w-full max-w-lg flex-col overflow-hidden rounded-lg">
        <div class="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search commands, projects, threads, and files…"
            autocomplete="off"
            spellcheck="false"
            data-testid="workspace-launcher-input"
            @keydown="onInputKeydown"
          />
        </div>
        <div
          ref="resultsListRef"
          class="h-[min(50vh,320px)] min-h-0 w-full shrink-0 overflow-y-auto px-2 py-1"
          role="listbox"
          aria-label="Search results"
        >
          <template v-if="rows.length > 0">
            <template v-for="(item, flatIdx) in flatLauncherItems" :key="launcherFlatItemKey(item, flatIdx)">
              <div
                v-if="item.kind === 'header'"
                class="px-3 pb-1"
                :class="item.isFirst ? 'pt-1' : 'pt-0.5'"
                role="group"
                :aria-label="SECTION_LABELS[item.section]"
              >
                <div class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {{ SECTION_LABELS[item.section] }}
                </div>
              </div>
              <div
                v-else-if="item.kind === 'divider'"
                class="h-2 shrink-0"
                aria-hidden="true"
              />
              <template v-else-if="item.kind === 'row'">
                <RouterLink
                  v-if="launcherRowRoute(item.row)"
                  :to="launcherRowRoute(item.row)!"
                  :data-testid="launcherRowTestId(item.row)"
                  :data-launcher-selected="item.rowIndex === selectedIndex ? 'true' : undefined"
                  role="option"
                  :aria-selected="item.rowIndex === selectedIndex"
                  class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm no-underline transition-colors"
                  :class="
                    item.rowIndex === selectedIndex
                      ? 'bg-muted/70 text-foreground'
                      : 'text-foreground hover:bg-muted/70'
                  "
                  @click="close"
                >
                  <WorkspaceLauncherModalRow :row="item.row" />
                </RouterLink>
                <button
                  v-else
                  type="button"
                  :data-testid="launcherRowTestId(item.row)"
                  :data-launcher-selected="item.rowIndex === selectedIndex ? 'true' : undefined"
                  role="option"
                  :aria-selected="item.rowIndex === selectedIndex"
                  class="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                  :class="
                    item.rowIndex === selectedIndex
                      ? 'bg-muted/70 text-foreground'
                      : 'hover:bg-muted/70'
                  "
                  @click="activateRow(item.row)"
                >
                  <WorkspaceLauncherModalRow :row="item.row" />
                </button>
              </template>
            </template>
          </template>
          <div
            v-if="loading"
            class="flex min-h-[8rem] flex-col"
            data-testid="workspace-launcher-loading"
          >
            <CursorLoading class="min-h-[8rem] w-full" />
          </div>
          <div
            v-else-if="rows.length === 0"
            class="py-8 text-center text-sm text-muted-foreground"
            data-testid="workspace-launcher-empty"
          >
            {{ emptyHint }}
          </div>
        </div>
        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-[11px] text-muted-foreground"
        >
          <span class="inline-flex items-center gap-1">
            <kbd class="rounded border border-border bg-muted/60 px-1 font-mono text-[10px]">↑</kbd>
            <kbd class="rounded border border-border bg-muted/60 px-1 font-mono text-[10px]">↓</kbd>
            Navigate
          </span>
          <span><kbd class="rounded border border-border bg-muted/60 px-1 font-mono text-[10px]">Enter</kbd> Select</span>
          <span><kbd class="rounded border border-border bg-muted/60 px-1 font-mono text-[10px]">Esc</kbd> Close</span>
          <span class="ms-auto text-[10px] leading-tight">
            <span class="font-mono">@</span>
            files ·
            <span class="font-mono">@wt</span>
            worktree ·
            <span class="font-mono">{{ launcherToggleShortcutLabel }}</span>
          </span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
