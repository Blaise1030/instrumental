import { ref } from "vue";
import type { Terminal } from "xterm";
import { buildPasteText } from "@/contextQueue/formatters";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/utils/contextQueueAnchor";

export type TerminalSelectionQueueOpts = {
  getTerminal: () => Terminal | null;
  agentTab?: boolean;
  sessionLabel?: string;
};

export function useTerminalSelectionQueue(opts: TerminalSelectionQueueOpts) {
  const visible = ref(false);
  const anchor = ref<Rect | null>(null);
  const pendingText = ref("");

  function onMouseUp(e: MouseEvent): void {
    const text = opts.getTerminal()?.getSelection() ?? "";
    if (!text.trim()) {
      visible.value = false;
      return;
    }
    pendingText.value = text;
    anchor.value = { left: e.clientX, top: e.clientY, width: 0, height: 0 };
    visible.value = true;
  }

  function dismiss(): void {
    visible.value = false;
    anchor.value = null;
  }

  function buildItem(): QueueItem {
    const capture: QueueCapture = {
      source: "terminal",
      selectedText: pendingText.value,
      agentTab: opts.agentTab,
      sessionLabel: opts.sessionLabel,
    };
    return {
      id: crypto.randomUUID(),
      source: "terminal",
      pasteText: buildPasteText(capture),
      meta: {},
    };
  }

  return { visible, anchor, onMouseUp, dismiss, buildItem };
}
