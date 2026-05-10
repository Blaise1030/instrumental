import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarkdownEditor from "../MarkdownEditor.vue";

let capturedOnUpdate: ((args: { editor: typeof mockTiptapEditor }) => void) | null =
  null;
let capturedOnSelectionUpdate:
  | ((args: { editor: typeof mockTiptapEditor }) => void)
  | null = null;
let capturedHandleKeyDown:
  | ((view: unknown, event: KeyboardEvent) => boolean)
  | null = null;

const mockTiptapEditor = {
  getMarkdown: vi.fn(() => "# hello"),
  state: {
    selection: { from: 0, to: 0 },
    doc: {
      textBetween: vi.fn(() => "selected text"),
    },
  },
  commands: {
    setContent: vi.fn(),
  },
  view: {
    coordsAtPos: vi.fn(() => ({
      left: 10,
      top: 20,
      right: 30,
      bottom: 40,
    })),
  },
  destroy: vi.fn(),
};

vi.mock("@tiptap/vue-3", () => ({
  useEditor: vi.fn(
    (
      opts: {
        onUpdate?: (args: { editor: typeof mockTiptapEditor }) => void;
        onSelectionUpdate?: (args: {
          editor: typeof mockTiptapEditor;
        }) => void;
        editorProps?: {
          handleKeyDown?: (view: unknown, event: KeyboardEvent) => boolean;
        };
      },
    ) => {
      capturedOnUpdate = opts.onUpdate ?? null;
      capturedOnSelectionUpdate = opts.onSelectionUpdate ?? null;
      capturedHandleKeyDown = opts.editorProps?.handleKeyDown ?? null;
      return { value: mockTiptapEditor };
    },
  ),
  EditorContent: {
    name: "EditorContent",
    props: ["editor"],
    template: '<div data-testid="editor-content"></div>',
  },
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/markdown", () => ({
  Markdown: { name: "Markdown" },
}));

describe("MarkdownEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnUpdate = null;
    capturedOnSelectionUpdate = null;
    capturedHandleKeyDown = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a host div with data-testid=markdown-editor", () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "# hello" } });
    expect(wrapper.find('[data-testid="markdown-editor"]').exists()).toBe(true);
  });

  it("emits update:modelValue when Tiptap onUpdate fires", async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "# hello" } });
    mockTiptapEditor.getMarkdown.mockReturnValue("# world");
    capturedOnUpdate?.({ editor: mockTiptapEditor });
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["# world"]);
  });

  it("calls setContent when modelValue prop changes externally", async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "# hello" } });
    mockTiptapEditor.getMarkdown.mockReturnValue("# hello");
    await wrapper.setProps({ modelValue: "# world" });
    expect(mockTiptapEditor.commands.setContent).toHaveBeenCalledWith("# world", {
      emitUpdate: false,
      contentType: "markdown",
    });
  });

  it("does not call setContent when modelValue matches current editor content", async () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "# hello" } });
    mockTiptapEditor.getMarkdown.mockReturnValue("# hello");
    await wrapper.setProps({ modelValue: "# hello" });
    expect(mockTiptapEditor.commands.setContent).not.toHaveBeenCalled();
  });

  it("emits save when Cmd+S is pressed via editorProps handleKeyDown", () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "" } });
    const event = new KeyboardEvent("keydown", { key: "s", metaKey: true });
    const handled = capturedHandleKeyDown?.({}, event);
    expect(handled).toBe(true);
    expect(wrapper.emitted("save")).toEqual([[]]);
  });

  it("emits save when Ctrl+S is pressed via editorProps handleKeyDown", () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "" } });
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true });
    capturedHandleKeyDown?.({}, event);
    expect(wrapper.emitted("save")).toEqual([[]]);
  });

  it("exposes openFind as a no-op", () => {
    const wrapper = mount(MarkdownEditor, { props: { modelValue: "" } });
    expect(() => (wrapper.vm as { openFind: () => void }).openFind()).not.toThrow();
  });

  it("emits queueable-text-selection null when queueSelectionHints is false", async () => {
    const wrapper = mount(MarkdownEditor, {
      props: { modelValue: "hello", queueSelectionHints: false },
    });
    mockTiptapEditor.state.selection = { from: 0, to: 5 };
    capturedOnSelectionUpdate?.({ editor: mockTiptapEditor });
    await flushPromises();
    expect(wrapper.emitted("queueable-text-selection")?.[0]).toEqual([null]);
  });
});
