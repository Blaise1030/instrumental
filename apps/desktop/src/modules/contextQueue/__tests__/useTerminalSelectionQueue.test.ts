import { describe, expect, it, vi } from "vitest";
import { useTerminalSelectionQueue } from "../useTerminalSelectionQueue";

function makeTerminal(selection = "") {
  return { getSelection: vi.fn().mockReturnValue(selection) } as any;
}

describe("useTerminalSelectionQueue", () => {
  it("shows popup with non-empty selection on mouseup", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => makeTerminal("hello world") });
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 100, clientY: 200 }));
    expect(q.visible.value).toBe(true);
    expect(q.anchor.value).toEqual({ left: 100, top: 200, width: 0, height: 0 });
  });

  it("hides popup when selection is empty on mouseup", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => makeTerminal("") });
    q.visible.value = true;
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 0, clientY: 0 }));
    expect(q.visible.value).toBe(false);
  });

  it("hides popup when terminal is null", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => null });
    q.onMouseUp(new MouseEvent("mouseup"));
    expect(q.visible.value).toBe(false);
  });

  it("dismiss clears visible and anchor", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => makeTerminal("x") });
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 5, clientY: 5 }));
    q.dismiss();
    expect(q.visible.value).toBe(false);
    expect(q.anchor.value).toBeNull();
  });

  it("buildItem returns QueueItem with source terminal and correct pasteText", () => {
    const q = useTerminalSelectionQueue({ getTerminal: () => makeTerminal("some text") });
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 0, clientY: 0 }));
    const item = q.buildItem();
    expect(item.source).toBe("terminal");
    expect(item.pasteText).toContain("some text");
    expect(item.pasteText).toContain("[terminal]");
    expect(typeof item.id).toBe("string");
  });

  it("buildItem uses [Agent Tab] prefix when agentTab is true", () => {
    const q = useTerminalSelectionQueue({
      getTerminal: () => makeTerminal("output"),
      agentTab: true,
    });
    q.onMouseUp(new MouseEvent("mouseup", { clientX: 0, clientY: 0 }));
    const item = q.buildItem();
    expect(item.pasteText).toContain("[Agent Tab]");
  });
});
