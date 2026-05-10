export function extractDiffLineNumbers(): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;

  function lineNumFromNode(node: Node): number | null {
    const el = node instanceof Element ? node : node.parentElement;
    const row = el?.closest("tr");
    if (!row) return null;
    const numEl = row.querySelector(".diff-line-new-num, .diff-line-old-num, .diff-line-num");
    if (!numEl) return null;
    const n = parseInt(numEl.textContent ?? "", 10);
    return isNaN(n) ? null : n;
  }

  const range = sel.getRangeAt(0);
  const start = lineNumFromNode(range.startContainer);
  const end = lineNumFromNode(range.endContainer);
  if (start === null && end === null) return null;
  const s = start ?? end!;
  const e = end ?? start!;
  return { start: Math.min(s, e), end: Math.max(s, e) };
}
