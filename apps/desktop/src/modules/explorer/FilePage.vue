<script setup lang="ts">
import { inject } from "vue";
import { PanelLeftClose, PanelLeftOpen, RefreshCw, Trash2, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { CursorLoading } from "@/components/ui/cursor-loading";
import { badgeVariants } from "@/components/ui/badge/index";
import { cn } from "@/lib/utils";
import MonacoEditor from "@/components/MonacoEditor.vue";
import PillTabs from "@/components/ui/pill-tabs";
import ContextQueueSelectionPopup from "@/components/contextQueue/ContextQueueSelectionPopup.vue";
import {
  explorerShellKey,
} from "@/modules/explorer/explorerShellContext";
import { useExplorerFilePage } from "@/modules/explorer/useExplorerFilePage";

defineProps<{
  showThreadSidebarExpand?: boolean;
}>();

const emit = defineEmits<{
  expandThreadSidebar: [];
}>();

const shell = inject(explorerShellKey);
if (!shell) {
  throw new Error("FilePage requires ExplorerLayout shell (explorerShellKey).");
}
const page = useExplorerFilePage(shell);

function setMonacoRef(el: unknown): void {
  page.monacoEditorRef = (el as InstanceType<typeof MonacoEditor> | null) ?? null;
}
</script>

<template>
  <div
      class="relative flex min-h-0 min-w-0 flex-1 flex-col"
      @dragover.prevent
      @drop="page.onImageDropFromOs"
    >
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
            <template v-if="page.selectedPath">
              <span class="sr-only" data-testid="file-editor-active-path">{{
                page.selectedPath
              }}</span>
              <div
                v-for="tab in page.openTabs"
                :key="tab.path"
                :class="
                  cn(
                    badgeVariants({
                      variant:
                        page.selectedPath === tab.path ? 'secondary' : 'outline',
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
                  @click="void page.selectTab(tab.path)"
                >
                  <span
                    class="shrink-0 text-[13px] leading-none"
                    aria-hidden="true"
                    >{{ page.fileEmojiForPath(tab.path) }}</span
                  >
                  <span class="flex min-w-0 flex-col">
                    <span class="truncate text-xs font-normal">{{
                      page.basenameFromPath(tab.path)
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
                    page.selectedPath === tab.path
                      ? 'file-editor-tab-close'
                      : undefined
                  "
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  class="size-6 shrink-0 rounded-full text-muted-foreground hover:/80 hover:text-foreground"
                  :aria-label="`Close ${page.basenameFromPath(tab.path)}`"
                  @click="void page.handleCloseSpecificTab(tab.path)"
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
              !page.selectedPath ||
              (page.isImagePreviewFile && page.imageFileViewMode === 'preview')
            "
            :aria-pressed="page.showLineNumbers"
            :title="
              page.showLineNumbers ? 'Hide line numbers' : 'Show line numbers'
            "
            @click="page.toggleLineNumbers"
          >
            Lines
          </Button>
          <Button
            data-testid="find-in-file"
            variant="outline"
            size="xs"
            :disabled="!page.canFindInFile"
            :title="`Find in file (${page.findInFileShortcutHint})`"
            @click="page.openFindInFile"
          >
            Find
          </Button>
          <Button
            data-testid="refresh-file"
            variant="outline"
            size="icon-xs"
            :disabled="!page.selectedPath || page.isLoadingFile"
            title="Reload file from disk"
            @click="page.handleRefreshFile"
          >
            <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Reload file from disk</span>
          </Button>
          <Button
            data-testid="revert-file"
            variant="outline"
            size="xs"
            :disabled="!page.selectedPath || !page.dirty"
            @click="page.handleRevert"
          >
            Revert
          </Button>
          <Button
            data-testid="save-file"
            variant="default"
            size="xs"
            :disabled="
              !page.selectedPath ||
              !page.dirty ||
              page.isSaving ||
              page.rasterImageSaveBlocked
            "
            @click="page.handleSave"
          >
            Save
          </Button>
          <Button
            data-testid="delete-file"
            variant="outline"
            size="icon-xs"
            class="text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="!page.selectedPath"
            :title="'Delete file'"
            @click="page.handleDeleteFile"
          >
            <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Delete file</span>
          </Button>
          <Button
            v-if="page.sidebarCollapsed"
            data-testid="file-search-sidebar-expand"
            variant="outline"
            size="icon-xs"
            title="Show file explorer"
            aria-label="Show file explorer"
            :aria-expanded="false"
            aria-controls="file-search-sidebar"
            @click="page.expandSidebar()"
          >
            <PanelLeftClose class="h-3.5 w-3.5" aria-hidden="true" />
            <span class="sr-only">Show file explorer</span>
          </Button>
        </div>
      </header>

      <div
        id="file-editor-body"
        data-testid="file-editor-body"
        class="relative flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div
          v-if="page.isImagePreviewFile && page.selectedPath"
          class="absolute top-2 right-3 z-20 rounded-lg border border-border/60 /95 p-0.5 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:/80"
        >
          <PillTabs
            :model-value="page.imageFileViewMode"
            class="min-w-0 shrink-0"
            aria-label="Image view"
            :tabs="page.imageViewTabs"
            @update:model-value="page.onImageViewModeRequest"
          />
        </div>
        <p
          v-if="page.error && page.selectedPath"
          class="mb-2 px-4 pt-2 text-xs text-destructive"
        >
          {{ page.error }}
        </p>
        <div
          v-else-if="!page.selectedPath"
          data-testid="file-editor-empty-state"
          class="flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-3 rounded-md px-4 py-8 text-center"
          role="status"
          aria-live="polite"
        >
          <span class="select-none text-4xl leading-none" aria-hidden="true"
            >📄</span
          >
          <p class="max-w-xs text-xs text-muted-foreground">
            Pick a file from the search results to view or edit it.
          </p>
        </div>
        <div
          v-else-if="page.isLoadingFile"
          class="flex min-h-[18rem] flex-1 flex-col px-0 pt-0"
        >
          <CursorLoading class="min-h-[18rem] flex-1" />
        </div>
        <div
          v-else-if="
            page.isImagePreviewFile &&
            page.imageFileViewMode === 'preview' &&
            page.imagePreviewSrc
          "
          data-testid="image-file-preview"
          class="flex min-h-[18rem] flex-1 flex-col items-center justify-center overflow-auto rounded-md px-4 py-6"
        >
          <img
            :src="page.imagePreviewSrc ?? ''"
            :alt="`Preview of ${page.selectedPath}`"
            class="max-h-[min(70vh,48rem)] max-w-full rounded-md border border-border/60 object-contain shadow-sm"
            draggable="false"
          />
        </div>
        <div
          v-else-if="
            page.isImagePreviewFile &&
            page.imageFileViewMode === 'preview' &&
            !page.imagePreviewSrc
          "
          data-testid="image-file-preview-unavailable"
          class="flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-2 rounded-md px-4 py-6 text-center text-xs font-normal text-muted-foreground"
          role="status"
        >
          <p class="max-w-sm">
            Could not build a preview (missing binary, Git LFS pointer not
            smudged, wrong file type, or over 32 MB).
          </p>
          <p>
            Use <span class="font-normal text-foreground">Source</span> to
            inspect the file, or run
            <span class="font-mono">git lfs pull</span> if this is an LFS asset.
          </p>
          <p class="text-[11px] text-muted-foreground/90">
            For screenshots in macOS TemporaryItems: drag the file onto this
            pane (temp folder is allowed), or copy the image into the repo.
          </p>
        </div>
        <MonacoEditor
          v-else
          :ref="setMonacoRef"
          v-model="page.draftContent"
          :language="page.editorLanguage"
          :show-line-numbers="page.showLineNumbers"
          :queue-selection-hints="page.queueSelectionHintsEnabled"
          :aria-label="
            page.selectedPath
              ? `Source code, ${page.editorLanguage ?? 'plain text'}, ${page.selectedPath}`
              : undefined
          "
          @queueable-text-selection="page.onEditorQueueableSelection"
          @save="page.handleSave"
        />
      </div>

      <div
        v-if="page.externalDropPreview"
        data-testid="external-image-drop-preview"
        class="shrink-0 border-t border-border px-4 py-3"
      >
        <div class="flex items-start justify-between gap-2">
          <p class="min-w-0 text-[11px] leading-snug text-muted-foreground">
            <span class="font-normal text-foreground">Dropped image</span>
            (not in the file tree). Save a copy under the worktree to open it in
            the editor.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="shrink-0"
            aria-label="Dismiss dropped image preview"
            @click="page.clearExternalDropPreview"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
        <p
          class="mt-1 truncate font-mono text-[10px] text-muted-foreground"
          :title="page.externalDropPreview.title"
        >
          {{ page.externalDropPreview.title }}
        </p>
        <img
          :src="page.externalDropPreview.src"
          alt=""
          class="mt-2 max-h-72 max-w-full rounded-md border border-border/60 object-contain shadow-sm"
          draggable="false"
        />
      </div>

      <ContextQueueSelectionPopup
        :visible="page.fileEditorQueueVisible"
        :anchor="page.fileEditorQueueAnchor"
        :go-to-file-path="page.pendingFileEditorGoToPath"
        @queue="page.confirmFileEditorQueue"
        @go-to-file="page.openSelectedFilePath"
        @send-to-agent="page.injectFileEditorSelectionToAgent"
        @dismiss="page.dismissFileEditorQueuePopup"
      />
    </div>
</template>
