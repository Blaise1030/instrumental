import type { InjectionKey, ComputedRef, Ref } from "vue";
import type { FileSummary } from "@shared/ipc";

export type ExplorerConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
};

/**
 * Explorer sidebar shell API provided by ExplorerLayout for FilePage / useExplorerFilePage.
 */
export interface ExplorerShell {
  wtPath: ComputedRef<string | null>;
  wtId: ComputedRef<string | null>;
  allFiles: Ref<FileSummary[]>;
  sidebarCollapsed: Ref<boolean | undefined>;
  expandSidebar: () => Promise<void>;
  /** Focus the file search field (sidebar may expand first). */
  focusSearchInput: () => Promise<void>;
  /** Shared AlertDialog host — editor discard prompts use the same dialog as the shell. */
  requestConfirmation: (options: ExplorerConfirmOptions) => Promise<boolean>;
  /** Incremented after each worktree transition once file summaries have loaded. */
  worktreeEpoch: Ref<number>;
  /** Refresh file list from disk without blocking UI spinner where possible. */
  reloadFileSummaries: () => Promise<void>;
}

export const explorerShellKey: InjectionKey<ExplorerShell> = Symbol("explorerShell");
