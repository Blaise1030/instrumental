import { afterEach, describe, expect, it, vi } from "vitest";
import { useDomSelectionQueue } from "../useDomSelectionQueue";

function mockSelection(text: string, rect = { left: 50, top: 80, width: 120, height: 20 }) {
  const mockRange = { getBoundingClientRect: () => rect };
  const mockSel = {
    toString: () => text,
    rangeCount: text ? 1 : 0,
    getRangeAt: () => mockRange,
  };
  vi.spyOn(window, "getSelection").mockReturnValue(mockSel as any);
  return mockSel;
}

afterEach(() => vi.restoreAllMocks());

describe("useDomSelectionQueue", () => {
  it("shows popup with selected text on mouseup", () => {
    mockSelection("hello diff");
    const q = useDomSelectionQueue({ source: "diff" });
    q.onMouseUp();
    expect(q.visible.value).toBe(true);
    expect(q.anchor.value).toEqual({ left: 50, top: 80, width: 120, height: 20 });
  });

  it("hides popup when selection is empty", () => {
    mockSelection("");
    const q = useDomSelectionQueue({ source: "diff" });
    q.visible.value = true;
    q.onMouseUp();
    expect(q.visible.value).toBe(false);
  });

  it("hides popup when getSelection returns null", () => {
    vi.spyOn(window, "getSelection").mockReturnValue(null);
    const q = useDomSelectionQueue({ source: "diff" });
    q.onMouseUp();
    expect(q.visible.value).toBe(false);
  });

  it("dismiss clears visible and anchor", () => {
    mockSelection("text");
    const q = useDomSelectionQueue({ source: "diff" });
    q.onMouseUp();
    q.dismiss();
    expect(q.visible.value).toBe(false);
    expect(q.anchor.value).toBeNull();
  });

  it("buildItem returns QueueItem with correct source and pasteText", () => {
    mockSelection("diff snippet");
    const q = useDomSelectionQueue({ source: "diff", getFilePath: () => "src/foo.ts" });
    q.onMouseUp();
    const item = q.buildItem();
    expect(item.source).toBe("diff");
    expect(item.pasteText).toContain("src/foo.ts");
  });

  it("buildItem uses file source when specified", () => {
    mockSelection("some code");
    const q = useDomSelectionQueue({ source: "file", getFilePath: () => "README.md" });
    q.onMouseUp();
    const item = q.buildItem();
    expect(item.source).toBe("file");
    expect(item.pasteText).toContain("README.md");
  });

  it("buildItem uses empty filePath when getFilePath not provided", () => {
    mockSelection("text");
    const q = useDomSelectionQueue({ source: "diff" });
    q.onMouseUp();
    const item = q.buildItem();
    expect(item.pasteText).toBe("");
  });

  it("buildItem throws when called before any selection", () => {
    const q = useDomSelectionQueue({ source: "diff" });
    expect(() => q.buildItem()).toThrow("buildItem called with no pending selection");
  });

  it("buildItem calls getLineNumbers and includes lineStart/lineEnd in pasteText when provided", () => {
    mockSelection("diff snippet with lines");
    const getLineNumbers = vi.fn(() => ({ start: 10, end: 20 }));
    const q = useDomSelectionQueue({
      source: "diff",
      getFilePath: () => "src/bar.ts",
      getLineNumbers,
    });
    q.onMouseUp();
    const item = q.buildItem();
    expect(getLineNumbers).toHaveBeenCalledOnce();
    expect(item.pasteText).toBe("src/bar.ts:10:20");
  });

  it("buildItem omits line numbers when getLineNumbers returns null", () => {
    mockSelection("snippet");
    const getLineNumbers = vi.fn(() => null);
    const q = useDomSelectionQueue({
      source: "diff",
      getFilePath: () => "src/baz.ts",
      getLineNumbers,
    });
    q.onMouseUp();
    const item = q.buildItem();
    expect(getLineNumbers).toHaveBeenCalledOnce();
    expect(item.pasteText).toBe("src/baz.ts");
  });
});
