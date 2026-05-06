/** Dedupe trim non-empty strings (paths, skill ids) for `[Attached *]` blocks. */
export function dedupePromptPaths(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const v = value.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Final CLI/bootstrap string: user note with skills and file paths appended inline.
 */
export function buildThreadCreatePromptWithAttachmentBlocks(
  text: string,
  skillPaths: string[],
  filePaths: string[]
): string {
  const parts: string[] = [];
  const note = text.trim();
  if (note) parts.push(note);

  const nextSkills = dedupePromptPaths(skillPaths);
  const nextFiles = dedupePromptPaths(filePaths);

  if (nextSkills.length > 0) {
    parts.push(`[Attached skills]\n${nextSkills.join("\n")}`);
  }
  for (const p of nextFiles) {
    parts.push(p);
  }

  return parts.join("\n").trim();
}
