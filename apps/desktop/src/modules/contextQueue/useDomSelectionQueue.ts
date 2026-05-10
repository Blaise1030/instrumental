import { ref } from "vue";
import { buildPasteText } from "@/contextQueue/formatters";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/utils/contextQueueAnchor";

export type DomSelectionQueueOpts = {
  source: "diff" | "file";
  getFilePath?: () => string | null;
};

export function useDomSelectionQueue(opts: DomSelectionQueueOpts) {
  const visible = ref(false);
  const anchor = ref<Rect | null>(null);
  const pendingText = ref("");

  function onMouseUp(): void {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!text || !sel?.rangeCount) {
      visible.value = false;
      pendingText.value = "";
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    pendingText.value = text;
    anchor.value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    visible.value = true;
  }

  function dismiss(): void {
    visible.value = false;
    anchor.value = null;
    pendingText.value = "";
  }

  function buildItem(): QueueItem {
    if (!pendingText.value) {
      throw new Error("buildItem called with no pending selection");
    }
    const filePath = opts.getFilePath?.() ?? "";
    const capture: QueueCapture =
      opts.source === "diff"
        ? { source: "diff", filePath, selectedText: pendingText.value }
        : { source: "file", filePath, selectedText: pendingText.value };
    return {
      id: crypto.randomUUID(),
      source: opts.source,
      pasteText: buildPasteText(capture),
      meta: filePath ? { filePath } : {},
    };
  }

  return { visible, anchor, onMouseUp, dismiss, buildItem };
}
