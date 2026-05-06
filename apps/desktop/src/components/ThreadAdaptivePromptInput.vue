<script setup lang="ts">
import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { ArrowUp, ChevronDown, Globe, Plus } from "lucide-vue-next";
import type { Ref } from "vue";
import { onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  createThreadCreatePromptExtensions,
  ThreadFileBadge,
  ThreadImageBadge,
  ThreadQueueContextTag
} from "@/lib/threadCreateEditorExtensions";
import { collectDocAttachmentPaths } from "@/lib/threadCreatePromptSerialize";
import { isImageFile, pathFromFile, type LocalFileAttachment } from "@/lib/localFileAttachment";
import { THREAD_PROMPT_BLOCK_SEP, promptDocFlatText } from "@/lib/threadCreateTipTap";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    worktreePath?: string | null;
    placeholder?: string;
    testIdPrefix?: string;
    showDoneButton?: boolean;
    contextTagLabel?: string | null;
    showQueueRemove?: boolean;
    queueRemoveAriaLabel?: string;
    composerLabel?: string;
  }>(),
  {
    worktreePath: null,
    placeholder: "",
    testIdPrefix: "thread-adaptive-prompt",
    showDoneButton: false,
    contextTagLabel: null,
    showQueueRemove: false,
    queueRemoveAriaLabel: "Remove this queue entry",
    composerLabel: "Composer"
  }
);

const emit = defineEmits<{
  queueRemove: [];
  submit: [];
  selectModel: [];
}>();

const prompt = defineModel<string>("prompt", { default: "" });
const attachments = defineModel<LocalFileAttachment[]>("attachments", { default: () => [] });
const skillPaths = defineModel<string[]>("skillPaths", { default: () => [] });

const fileInputRef = ref<HTMLInputElement | null>(null);
const isMultiLine = ref(false);

const tiptapProseMirrorClass =
  "tiptap min-h-0 max-h-[12rem] overflow-y-auto px-2 py-1 text-[13px] leading-snug text-foreground outline-none focus:outline-none [&_p]:my-0.5 [&_p:first-child]:mb-0";

const tiptapEditor: Ref<Editor | null | undefined> = useEditor({  
  extensions: [
    StarterKit.configure({ heading: false, codeBlock: false }),
    Placeholder.configure({
      placeholder:
        props.placeholder ||
        "Optional note for the agent — use @ for files, / for skills, paperclip for attachments"
    }),
    ThreadQueueContextTag,
    ThreadImageBadge,
    ThreadFileBadge,
    createThreadCreatePromptExtensions({ getWorktreePath: () => props.worktreePath })
  ],
  content: "<p></p>",
  editorProps: {
    attributes: {
      class: tiptapProseMirrorClass,
      role: "textbox",
      "aria-multiline": "true",
      "aria-placeholder": props.placeholder || "Optional note for the agent"
    },
    handleKeyDown(_view, event) {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        const ed = tiptapEditor.value;
        if (ed) applyEditorToModels(ed);
        emit("submit");
        return true;
      }
      return false;
    },
    handleDOMEvents: {
      drop(view, event) {
        const dt = event.dataTransfer;
        if (!dt?.files?.length) return false;
        const target = event.target as HTMLElement | null;
        if (!target?.closest?.(".ProseMirror")) return false;
        event.preventDefault();
        event.stopPropagation();
        const editor = tiptapEditor.value;
        if (!editor) return true;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (coords == null) return true;
        let insertPos = coords.pos;
        const doc = editor.state.doc;
        const seen = new Set<string>();
        for (const file of Array.from(dt.files)) {
          const path = pathFromFile(file);
          if (seen.has(path) || docHasAttachmentPath(doc, path)) continue;
          seen.add(path);
          const type = isImageFile(file) ? "threadImageBadge" : "threadFileBadge";
          editor.chain().insertContentAt(insertPos, { type, attrs: { path, name: file.name } }).run();
          insertPos += 1;
        }
        return true;
      }
    }
  }
});

// ── Adaptive layout (document structure only — no ResizeObserver / DOM wrap heuristics) ──

let detachDocLayoutListener: (() => void) | null = null;

/** True when the doc has structural newlines: multiple top-level blocks, a hard break, or file badges. */
function updateIsMultiLineFromDoc(): void {
  const ed = tiptapEditor.value;
  if (!ed?.view || ed.isDestroyed) {
    isMultiLine.value = false;
    return;
  }
  const doc = ed.state.doc;

  if (doc.childCount > 1) {
    isMultiLine.value = true;
    return;
  }

  let hasHardBreak = false;
  let hasAttachmentBadge = false;
  doc.descendants((node) => {
    if (node.type.name === "hardBreak") hasHardBreak = true;
    if (node.type.name === "threadFileBadge" || node.type.name === "threadImageBadge") {
      hasAttachmentBadge = true;
    }
  });

  isMultiLine.value = hasHardBreak || hasAttachmentBadge;
}

function attachDocLayoutListener(): void {
  detachDocLayoutListener?.();
  detachDocLayoutListener = null;

  const ed = tiptapEditor.value;
  if (!ed || ed.isDestroyed) return;

  const onTx = (): void => {
    updateIsMultiLineFromDoc();
  };
  ed.on("transaction", onTx);
  detachDocLayoutListener = () => {
    ed.off("transaction", onTx);
  };
  updateIsMultiLineFromDoc();
}

watch(
  () => tiptapEditor.value,
  (ed) => {
    detachDocLayoutListener?.();
    detachDocLayoutListener = null;
    if (!ed || ed.isDestroyed) {
      isMultiLine.value = false;
      return;
    }
    attachDocLayoutListener();
  },
  { flush: "post", immediate: true }
);

// ── Model ↔ editor sync ───────────────────────────────────────────────────

function applyEditorToModels(editor: Editor): void {
  prompt.value = promptDocFlatText(editor.state.doc);
  const { filePaths, skillPaths: inlineSkillPaths } = collectDocAttachmentPaths(editor.state.doc);
  const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
  const existing = attachments.value.filter((a) => filePaths.includes(a.path));
  const newPaths = filePaths.filter((p) => !existing.some((a) => a.path === p));
  attachments.value = [
    ...existing,
    ...newPaths.map((p) => ({ id: crypto.randomUUID(), path: p, name: baseName(p), isImage: false }))
  ];
  skillPaths.value = inlineSkillPaths;
}

function flatTextToDocJson(text: string, contextTag: string | null) {
  const tag = contextTag?.trim() || null;
  const lines = text.split(THREAD_PROMPT_BLOCK_SEP);
  const content: Record<string, unknown>[] = [];
  if (tag) {
    content.push({ type: "paragraph", content: [{ type: "threadQueueContextTag", attrs: { label: tag } }] });
  }
  for (const line of lines) {
    content.push({ type: "paragraph", content: line.length > 0 ? [{ type: "text", text: line }] : [] });
  }
  return { type: "doc", content };
}

function firstContextTagLabelInDoc(doc: Parameters<typeof promptDocFlatText>[0]): string | null {
  let found: string | null = null;
  doc.descendants((node) => {
    if (node.type.name === "threadQueueContextTag") {
      found = String(node.attrs.label ?? "");
      return false;
    }
  });
  return found;
}

function findFirstQueueContextTagDocPos(doc: Parameters<typeof promptDocFlatText>[0]): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === "threadQueueContextTag") { found = pos; return false; }
  });
  return found;
}

watch(
  () => [prompt.value, tiptapEditor.value, props.contextTagLabel] as const,
  () => {
    const editor = tiptapEditor.value;
    if (!editor) return;
    const desired = prompt.value ?? "";
    const desiredTag = props.contextTagLabel?.trim() ?? "";
    const current = promptDocFlatText(editor.state.doc);
    const currentTag = firstContextTagLabelInDoc(editor.state.doc) ?? "";
    if (current === desired && currentTag === desiredTag) return;

    if (current === desired && currentTag !== desiredTag) {
      const tagPos = findFirstQueueContextTagDocPos(editor.state.doc);
      if (tagPos !== null) {
        const tr = editor.state.tr.setNodeMarkup(tagPos, undefined, { label: desiredTag });
        editor.view.dispatch(tr);
        return;
      }
    }

    editor.commands.setContent(flatTextToDocJson(desired, desiredTag || null), false);
  },
  { flush: "post", immediate: true }
);

onBeforeUnmount(() => {
  detachDocLayoutListener?.();
  detachDocLayoutListener = null;
  const ed = tiptapEditor.value;
  if (ed && !ed.isDestroyed) applyEditorToModels(ed);
});

// ── File handling ─────────────────────────────────────────────────────────

function docHasAttachmentPath(doc: Parameters<typeof promptDocFlatText>[0], path: string): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name === "threadFileBadge" || node.type.name === "threadImageBadge") {
      if (String(node.attrs.path ?? "") === path) found = true;
    }
  });
  return found;
}

function addFilesFromListTipTap(files: FileList | File[]): void {
  const editor = tiptapEditor.value;
  if (!editor) return;
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    if (docHasAttachmentPath(editor.state.doc, path)) continue;
    const type = isImageFile(file) ? "threadImageBadge" : "threadFileBadge";
    editor.chain().focus().insertContent({ type, attrs: { path, name: file.name } }).run();
  }
}

function onFileInputChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  addFilesFromListTipTap(input.files);
  input.value = "";
}

function isFileDrag(dt: DataTransfer | null): boolean {
  return !!dt?.types.includes("Files");
}

function onDragOver(e: DragEvent): void {
  if (isFileDrag(e.dataTransfer)) e.preventDefault();
}

function onDrop(e: DragEvent): void {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  e.stopPropagation();
  const dt = e.dataTransfer;
  if (dt?.files?.length) addFilesFromListTipTap(dt.files);
}

function onSend(): void {
  const ed = tiptapEditor.value;
  if (ed) applyEditorToModels(ed);
  emit("submit");
}

defineExpose({
  flushToModels: () => { const ed = tiptapEditor.value; if (ed) applyEditorToModels(ed); },
  openFilePicker: () => fileInputRef.value?.click(),
  focus: () => tiptapEditor.value?.commands.focus()
});
</script>

<template>
  <div @dragover="onDragOver" @drop="onDrop" class="py-2">
    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      multiple
      accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.vue,.py,.rs,.go,.toml,.yaml,.yml,.c,.cpp,.h,.java,.kt,.swift,.rb,.php,.sh,.zsh,.bash,.env"
      aria-label="Attach files or images"
      :data-testid="`${testIdPrefix}-file-input`"
      @change="onFileInputChange"
    />

    <!-- ── Single-line pill ────────────────────────────────────────── -->
    <div
      v-if="!isMultiLine"
      :class="
        cn(
          'flex items-center gap-1 rounded-full border border-input bg-background p-1 shadow-xs',
          'focus-within:shadow-md'
        )
      "
      :data-testid="`${testIdPrefix}-container`"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        class="h-8 w-8 shrink-0 rounded-full border-0 bg-muted/60 shadow-none hover:bg-muted"
        title="Attach files or images"
        aria-label="Attach files or images"
        :data-testid="`${testIdPrefix}-add-file`"
        @click="fileInputRef?.click()"
      >
        <Plus class="size-4" stroke-width="2" />
      </Button>

      <div class="min-w-0 flex-1 cursor-text" @click="tiptapEditor?.commands.focus()">
        <EditorContent :editor="tiptapEditor" />
      </div>      

      <Button
        type="button"
        size="icon"
        class="h-8 w-8 shrink-0 rounded-full bg-foreground text-background shadow-none hover:bg-foreground/90"
        :data-testid="`${testIdPrefix}-send`"
        aria-label="Send message"
        @click="onSend"
      >
        <ArrowUp class="size-4" stroke-width="2.5" />
      </Button>
    </div>

    <!-- ── Multi-line expanded — text anchored bottom, grows up ───── -->
    <div
      v-else
      :data-testid="`${testIdPrefix}-container`"
      :class="
        cn(
          'flex flex-col rounded-xl border border-input bg-background shadow-xs',
          'focus-within:shadow-md'
        )
      "      
    >            
      <div class="cursor-text" @click="tiptapEditor?.commands.focus()">
        <EditorContent :editor="tiptapEditor" />
      </div>      
      <div class="flex w-full items-center gap-2 px-2 py-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          class="h-8 w-8 shrink-0 rounded-full border-0 bg-muted/60 shadow-none hover:bg-muted"
          title="Attach files or images"
          aria-label="Attach files or images"
          :data-testid="`${testIdPrefix}-add-file-toolbar`"
          @click="fileInputRef?.click()"
        >
          <Plus class="size-3.5" stroke-width="2" />
        </Button>

        <div class="ms-auto flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            class="h-8 w-8 shrink-0 rounded-full bg-foreground text-background shadow-none hover:bg-foreground/90"
            :data-testid="`${testIdPrefix}-send`"
            aria-label="Send message"
            @click="onSend"
          >
            <ArrowUp class="size-4" stroke-width="2.5" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
