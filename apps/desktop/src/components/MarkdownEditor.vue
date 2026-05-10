<script setup lang="ts">
import { watch } from "vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import type { QueueableEditorSelection } from "@/components/MonacoEditor.vue";

const props = defineProps<{
  modelValue: string;
  ariaLabel?: string;
  queueSelectionHints?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "queueable-text-selection": [selection: QueueableEditorSelection | null];
  save: [];
}>();

const editor = useEditor({
  content: props.modelValue,
  contentType: "markdown",
  extensions: [StarterKit, Markdown],
  onUpdate({ editor: ed }) {
    emit("update:modelValue", ed.getMarkdown());
  },
  onSelectionUpdate({ editor: ed }) {
    if (!props.queueSelectionHints) {
      emit("queueable-text-selection", null);
      return;
    }
    const { from, to } = ed.state.selection;
    if (from === to) {
      emit("queueable-text-selection", null);
      return;
    }
    const selectedText = ed.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) {
      emit("queueable-text-selection", null);
      return;
    }
    const textBeforeFrom = ed.state.doc.textBetween(0, from, "\n");
    const textBeforeTo = ed.state.doc.textBetween(0, to, "\n");
    const lineStart = Math.max(1, textBeforeFrom.split("\n").length);
    const lineEnd = Math.max(1, textBeforeTo.split("\n").length);
    const coords = ed.view.coordsAtPos(from);
    emit("queueable-text-selection", {
      selectedText,
      lineStart,
      lineEnd,
      anchor: {
        left: coords.left,
        top: coords.top,
        width: Math.max(2, coords.right - coords.left),
        height: coords.bottom - coords.top,
      },
    });
  },
  editorProps: {
    handleKeyDown(_view, event) {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        emit("save");
        return true;
      }
      return false;
    },
  },
});

watch(
  () => props.modelValue,
  (next) => {
    const ed = editor.value;
    if (!ed) return;
    const current = ed.getMarkdown();
    if (next !== current) {
      ed.commands.setContent(next, {
        emitUpdate: false,
        contentType: "markdown",
      });
    }
  },
);

watch(
  () => props.queueSelectionHints,
  (enabled) => {
    if (!enabled) emit("queueable-text-selection", null);
  },
);

function openFind(): void {}

defineExpose({ openFind });
</script>

<template>
  <div
    data-testid="markdown-editor"
    class="flex min-h-0 w-full flex-1 flex-col overflow-auto"
    :aria-label="ariaLabel"
  >
    <EditorContent
      class="tiptap markdown-file-editor w-full flex-1 px-4 py-3 text-sm leading-relaxed text-foreground outline-none focus-within:outline-none [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none"
      :editor="editor"
    />
  </div>
</template>
