import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/** Block separator for flat prompt text (must match parsing in @ / slash menus). */
export const THREAD_PROMPT_BLOCK_SEP = "\n";

function inlineNodeText(node: PMNode): string {
  if (node.isText) return node.text ?? "";
  if (node.type.name === "threadFileBadge" || node.type.name === "threadImageBadge") {
    return String(node.attrs.path ?? "");
  }
  if (node.type.name === "threadMention" && String(node.attrs.itemKind ?? "") === "file") {
    return String(node.attrs.id ?? "");
  }
  return "";
}

/** Serialize the doc to flat text, inlining file/image badge paths at their position. */
export function promptDocFlatText(doc: PMNode): string {
  const blocks: string[] = [];
  doc.forEach((block) => {
    const parts: string[] = [];
    block.forEach((inline) => parts.push(inlineNodeText(inline)));
    blocks.push(parts.join(""));
  });
  return blocks.join(THREAD_PROMPT_BLOCK_SEP);
}

export function promptFlatOffsetAtDocPos(doc: PMNode, pos: number): number {
  return doc.textBetween(0, pos, THREAD_PROMPT_BLOCK_SEP, (node) => inlineNodeText(node)).length;
}

/**
 * Map a flat-text offset to a document position (smallest pos whose prefix length ≥ offset).
 */
export function docPosAtFlatOffset(doc: PMNode, offset: number): number {
  const maxPos = doc.content.size;
  if (offset <= 0) return 0;
  const fullLen = promptDocFlatText(doc).length;
  if (offset >= fullLen) return maxPos;
  let lo = 0;
  let hi = maxPos;
  while (hi > lo + 1) {
    const mid = Math.floor((lo + hi) / 2);
    const len = doc.textBetween(0, mid, THREAD_PROMPT_BLOCK_SEP, (node) => inlineNodeText(node)).length;
    if (len < offset) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function replaceFlatRange(editor: Editor, from: number, to: number, insert: string): void {
  const doc = editor.state.doc;
  const fromPos = docPosAtFlatOffset(doc, from);
  const toPos = docPosAtFlatOffset(doc, to);
  editor.chain().focus().deleteRange({ from: fromPos, to: toPos }).insertContentAt(fromPos, insert).run();
}
