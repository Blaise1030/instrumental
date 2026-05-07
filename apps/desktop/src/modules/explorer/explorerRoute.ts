/** Normalize Vue Router `:filename(.*)` param to a single relative path string. */
export function normalizeExplorerFilenameParam(
  raw: string | string[] | undefined,
): string | null {
  if (raw == null) return null;
  const s = Array.isArray(raw) ? raw.join("/") : raw;
  return s.length > 0 ? s : null;
}
