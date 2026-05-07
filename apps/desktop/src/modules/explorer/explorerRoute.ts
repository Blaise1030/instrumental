import ExplorerLayout from "./pages/ExplorerLayout.vue";
import FilePage from "./pages/FilePage.vue";

/** Files subtree under `/:projectId/:branch/thread/:threadId`. */
export const explorerRoutes = {
  path: "files",
  component: ExplorerLayout,
  children: [
    { path: "", name: "filesPanel", component: FilePage },
    { path: ":filename(.*)", name: "fileDetail", component: FilePage },
  ],
};

/** Normalize Vue Router `:filename(.*)` param to a single relative path string. */
export function normalizeExplorerFilenameParam(
  raw: string | string[] | undefined,
): string | null {
  if (raw == null) return null;
  const s = Array.isArray(raw) ? raw.join("/") : raw;
  return s.length > 0 ? s : null;
}
