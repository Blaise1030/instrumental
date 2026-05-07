<script setup lang="ts">
import { DiffView, DiffModeEnum } from "@git-diff-view/vue";
import "@git-diff-view/vue/styles/diff-view.css";
import { createTwoFilesPatch } from "diff";
import { computed, ref, watch } from "vue";
import { FileText } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { CursorLoading } from "@/components/ui/cursor-loading";
import PillTabs, { type PillTabItem } from "@/components/ui/pill-tabs";
import type { FileMergeSidesResult } from "@shared/ipc";

const SCM_DIFF_LAYOUT_KEY = "instrument.scmDiffLayout";
type ScmDiffLayout = "split" | "unified";

function readScmDiffLayout(): ScmDiffLayout {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SCM_DIFF_LAYOUT_KEY) === "unified"
      ? "unified"
      : "split";
  } catch {
    return "split";
  }
}

const layout = ref<ScmDiffLayout>(readScmDiffLayout());

const diffLayoutTabs: PillTabItem[] = [
  {
    value: "split",
    label: "Split",
    shortcutHint: "Two columns: original on the left, working copy on the right",
  },
  {
    value: "unified",
    label: "Unified",
    shortcutHint: "Single column: removed lines appear above the current file",
  },
];

const layoutPillModel = computed({
  get: (): string => layout.value,
  set: (v: string) => {
    if (v === "split" || v === "unified") layout.value = v;
  },
});

watch(layout, (v) => {
  try {
    localStorage.setItem(SCM_DIFF_LAYOUT_KEY, v);
  } catch {
    /* ignore quota / private mode */
  }
});

type GitDiffPathHeader = {
  full: string;
  base: string;
  dirLine: string;
  hasDir: boolean;
};

const props = defineProps<{
  pathHeader: GitDiffPathHeader;
  /** Repo-relative path of the file being diffed (empty when none). */
  filePath: string;
  fileScope: "staged" | "unstaged" | null;
  loading: boolean;
  emptyMessage: string | null;
  mergeResult: FileMergeSidesResult | null;
}>();

const emit = defineEmits<{
  openFileInEditor: [path: string];
}>();

const mergeResultOk = computed(() =>
  props.mergeResult?.kind === "ok" ? props.mergeResult : null
);

const scopeDescription = computed(() => {
  if (props.fileScope === "staged") return "Staged changes.";
  if (props.fileScope === "unstaged") return "Working tree changes.";
  return "Diff.";
});

const diffViewMode = computed(() =>
  layout.value === "unified" ? DiffModeEnum.Unified : DiffModeEnum.Split
);

const isDark = computed(
  () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
);

const diffData = computed(() => {
  const ok = mergeResultOk.value;
  const name = props.filePath || "file";
  if (!ok) {
    return {
      oldFile: { fileName: name, content: "" },
      newFile: { fileName: name, content: "" },
      hunks: [] as string[],
    };
  }
  const oldContent = ok.original ?? "";
  const newContent = ok.modified ?? "";
  /** `DiffView` only renders visible lines when `hunks` contain a parseable unified diff; empty hunks leaves every line collapsed with no expand UI. */
  const patch = createTwoFilesPatch(name, name, oldContent, newContent, "", "", { context: 3 });
  return {
    oldFile: { fileName: name, content: oldContent },
    newFile: { fileName: name, content: newContent },
    hunks: [patch],
  };
});

const diffViewKey = computed(() => {
  const ok = mergeResultOk.value;
  if (!ok || !props.filePath) return "empty";
  return `${props.filePath}:${ok.original.length}:${ok.modified.length}:${layout.value}`;
});

const extendDataFallback = { oldFile: {}, newFile: {} } as const;
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <header class="flex h-9 min-w-0 items-center gap-2 overflow-x-auto border-b border-border px-2 whitespace-nowrap">
      <slot name="header-leading" />
      <div
        class="min-w-0 flex-1 font-mono text-[10px] leading-tight"
        :title="pathHeader.full || undefined"
      >
        <template v-if="pathHeader.full">
          <p class="flex min-w-0 items-baseline justify-start gap-0">
            <span
              v-if="pathHeader.hasDir"
              class="min-w-0 shrink truncate text-muted-foreground"
            >{{ pathHeader.dirLine }}/</span>
            <span class="shrink-0 font-medium text-foreground">{{ pathHeader.base }}</span>
          </p>
        </template>
        <p v-else class="text-muted-foreground">No file selected</p>
        <p class="sr-only">
          File path: {{ pathHeader.full || "none" }}.
          {{ scopeDescription }}
        </p>
      </div>
      <PillTabs
        v-if="filePath && mergeResult?.kind === 'ok'"
        v-model="layoutPillModel"
        variant="segmented"
        size="xs"
        class="shrink-0"
        :tabs="diffLayoutTabs"
        aria-label="Diff layout"
      />
      <Button
        v-if="filePath"
        type="button"
        size="xs"
        variant="outline"
        class="h-6 shrink-0 gap-1 px-2 text-[10px]"
        title="Open this file in the Files tab (current worktree)"
        aria-label="Go to file in editor"
        @click="emit('openFileInEditor', filePath)"
      >
        <FileText class="h-3 w-3 shrink-0" aria-hidden="true" />
        Go to file
      </Button>
    </header>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div v-if="loading" class="flex min-h-0 flex-1 flex-col">
        <CursorLoading class="min-h-0 flex-1" />
      </div>
      <div
        v-else-if="emptyMessage"
        class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
        role="status"
        aria-live="polite"
      >
        <span class="select-none text-4xl leading-none" aria-hidden="true">✨</span>
        <p class="max-w-xs text-xs text-muted-foreground">{{ emptyMessage.replace("✨ ", "") }}</p>
      </div>
      <div
        v-else-if="mergeResult?.kind === 'error'"
        class="flex h-full items-center justify-center px-4 text-center text-[11px] text-destructive"
        role="alert"
      >
        {{ mergeResult.message }}
      </div>
      <div
        v-else-if="mergeResult?.kind === 'binary'"
        class="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground"
        role="status"
      >
        Binary file — side-by-side text diff is not shown.
      </div>
      <div v-else-if="mergeResult?.kind === 'ok'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <p
          class="shrink-0 border-b border-border px-2 py-1 font-mono text-[10px] leading-tight text-muted-foreground"
        >
          <template v-if="layout === 'split'">
            <span class="font-medium text-foreground">{{ mergeResultOk?.originalLabel }}</span>
            · left —
            <span class="font-medium text-foreground">{{ mergeResultOk?.modifiedLabel }}</span>
            · right
          </template>
          <template v-else>
            Unified —
            <span class="font-medium text-foreground">{{ mergeResultOk?.originalLabel }}</span>
            vs
            <span class="font-medium text-foreground">{{ mergeResultOk?.modifiedLabel }}</span>
          </template>
        </p>
        <div class="scm-git-diff-view-body flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          <DiffView
            :key="diffViewKey"
            :data="diffData"
            :extend-data="extendDataFallback"
            :diff-view-mode="diffViewMode"
            :diff-view-theme="isDark ? 'dark' : 'light'"
            :diff-view-highlight="true"
            :diff-view-wrap="true"
            :diff-view-font-size="11"
            class="min-h-0 min-w-0 flex-1"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.scm-git-diff-view-body .diff-tailwindcss-wrapper) {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
:deep(.diff-view-wrapper) {
  font-size: 11px;
  min-width: 0;
  min-height: 0;
  flex: 1 1 0;
  max-height: none;
}
</style>
