import { ref } from "vue";
import { buildPasteText } from "@/contextQueue/formatters";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/utils/contextQueueAnchor";

export type DomSelectionQueueOpts = {
  source: "diff" | "file";
  getFilePath?: () => string | null;
  getLineNumbers?: () => { start: number; end: number } | null;
};

/**
 * Extract clean diff text from the selection, reading per-<tr> content cells so
 * line-number gutter text is excluded and +/- operators are included.
 * Returns null when the selection isn't inside a diff table.
 */
function extractDiffContentText(sel: Selection): string | null {
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);

  const anchor = sel.anchorNode;
  const el = anchor instanceof Element ? anchor : anchor?.parentElement;
  const table = el?.closest("table");
  if (!table) return null;
  if (!table.querySelector(".diff-line-num, .diff-line-content")) return null;

  const rows = Array.from(table.querySelectorAll("tr"));
  const lines: string[] = [];

  for (const row of rows) {
    try {
      const rowRange = document.createRange();
      rowRange.selectNodeContents(row);
      if (
        range.compareBoundaryPoints(Range.START_TO_END, rowRange) < 0 ||
        range.compareBoundaryPoints(Range.END_TO_START, rowRange) > 0
      ) {
        continue;
      }
    } catch {
      continue;
    }

    const contentCell =
      row.querySelector(".diff-line-content") ??
      row.querySelector(".diff-line-new-content") ??
      row.querySelector(".diff-line-old-content");
    if (!contentCell) continue;

    const operatorEl = contentCell.querySelector("[data-operator]");
    const op = operatorEl?.getAttribute("data-operator");
    const sign = op === "+" ? "+" : op === "-" ? "-" : " ";

    const clone = contentCell.cloneNode(true) as Element;
    clone.querySelectorAll("[data-operator]").forEach((n) => n.remove());
    const code = clone.textContent ?? "";

    lines.push(sign + code);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

export function useDomSelectionQueue(opts: DomSelectionQueueOpts) {
  const visible = ref(false);
  const anchor = ref<Rect | null>(null);
  const pendingText = ref("");

  function onMouseUp(): void {
    const sel = window.getSelection();
    const rawText = sel?.toString().trim() ?? "";
    if (!rawText || !sel?.rangeCount) {
      visible.value = false;
      pendingText.value = "";
      return;
    }
    const rangeRect = sel.getRangeAt(0).getBoundingClientRect();

    const diffText = opts.source === "diff" ? extractDiffContentText(sel) : null;
    pendingText.value = diffText ?? rawText;
    anchor.value = { left: rangeRect.left, top: rangeRect.top, width: rangeRect.width, height: rangeRect.height };
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
    const lines = opts.getLineNumbers?.();
    const capture: QueueCapture =
      opts.source === "diff"
        ? { source: "diff", filePath, selectedText: pendingText.value, ...(lines ? { lineStart: lines.start, lineEnd: lines.end } : {}) }
        : { source: "file", filePath, selectedText: pendingText.value, ...(lines ? { lineStart: lines.start, lineEnd: lines.end } : {}) };
    return {
      id: crypto.randomUUID(),
      source: opts.source,
      pasteText: buildPasteText(capture),
      meta: filePath ? { filePath } : {},
    };
  }

  return { visible, anchor, onMouseUp, dismiss, buildItem };
}
