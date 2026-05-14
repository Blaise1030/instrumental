import type { Project, Thread, ThreadSession, ThreadAgent } from "./domain";

export type { AppNotification, AppNotificationKind } from "./domain";

export interface MarkNotificationReadInput {
  id: string;
}

export { IPC_CHANNELS } from "../../electron/ipcChannels.js";

export interface TerminalTab {
  id: string;
  worktreeId: string;
  sessionId: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface WorkspaceSnapshot {
  projects: Project[];
  threads: Thread[];
  threadSessions: ThreadSession[];
  activeProjectId: string | null;
  activeWorktreePath: string | null;
  activeThreadId: string | null;
}

export interface CreateThreadInput {
  projectId: string;
  worktreePath: string;
  title: string;
  agent: ThreadAgent;
  metadataJson?: string | null;
}

export interface AddProjectInput {
  name: string;
  repoPath: string;
  defaultBranch?: string;
}

/** Legacy add-worktree payload used by older renderer flows. */
export interface AddWorktreeInput {
  projectId: string;
  branch: string;
  baseBranch: string | null;
}

/** Create a linked worktree group for a project branch. */
export interface CreateWorktreeGroupInput {
  projectId: string;
  branch: string;
  baseBranch: string | null;
}

export interface RemoveProjectInput {
  projectId: string;
}

export interface ReorderProjectsInput {
  /** Full project tab order, left to right. */
  orderedProjectIds: string[];
}

/** One row from `git worktree list --porcelain` (checked-out branch name). */
export interface GitWorktreeListEntry {
  path: string;
  branch: string;
}

export interface DeleteThreadInput {
  threadId: string;
}

export interface RenameThreadInput {
  threadId: string;
  title: string;
}

export interface UpdateThreadInput {
  threadId: string;
  title?: string;
  agent?: ThreadAgent;
}

export interface FileReadInput {
  cwd: string;
  relativePath: string;
}

export interface FileAbsolutePathInput {
  absolutePath: string;
}

/** Resolve a Markdown image `href` relative to `markdownRelativePath` inside `cwd`. */
export interface FileResolveMarkdownImageUrlInput extends FileReadInput {
  /** Raw `href` from `![](...)` (may be relative, URL, or data URI). */
  href: string;
}

export interface FileSummary {
  relativePath: string;
  size: number;
  modifiedAt: number;
  /** When `"directory"`, this path is an empty folder (or folder-only path) so the tree can show it. */
  kind?: "file" | "directory";
}

export interface FileWriteInput extends FileReadInput {
  content: string;
}

export type RepoChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "unmerged"
  | "untracked";

export interface RepoStatusEntry {
  path: string;
  originalPath: string | null;
  stagedKind: RepoChangeKind | null;
  unstagedKind: RepoChangeKind | null;
  isUntracked: boolean;
  /** From `git diff --cached --numstat`; null when absent or binary (`-`). */
  stagedLinesAdded: number | null;
  stagedLinesRemoved: number | null;
  /** From `git diff --numstat`; null when absent or binary (`-`). */
  unstagedLinesAdded: number | null;
  unstagedLinesRemoved: number | null;
}

/** Full source-control snapshot for the Git Diff sidebar (Electron). */
export interface RepoScmSnapshot {
  entries: RepoStatusEntry[];
  /** Current branch or `HEAD` when detached. */
  branch: string;
  /** Short folder label (worktree directory basename) for `short / branch` display. */
  shortLabel: string;
  lastCommitSubject: string | null;
}

/** Bounded `git diff --cached` text for local LLM commit suggestions. */
export interface StagedUnifiedDiffResult {
  unifiedDiff: string;
  /** True when output was shortened by `truncateUnifiedDiff`. */
  truncated: boolean;
}

export type FileDiffScope = "staged" | "unstaged" | "combined";

/** Two full texts for CodeMirror `MergeView` (per-file source control). */
export type FileMergeSidesResult =
  | {
      kind: "ok";
      original: string;
      modified: string;
      /** Short label for the left pane (e.g. `HEAD`, `Staged`). */
      originalLabel: string;
      /** Short label for the right pane (e.g. `Staged`, `Working tree`). */
      modifiedLabel: string;
    }
  | { kind: "binary" }
  | { kind: "error"; message: string };

/** When a newer GitHub release exists than the running packaged build. */
export interface AppUpdateAvailability {
  currentVersion: string;
  latestVersion: string;
  /** Full tag from GitHub (often `v1.2.3`). */
  latestTag: string;
  /** Release page with notes and download assets. */
  releasePageUrl: string;
  /** Compare range for commit-level changes since the running version. */
  compareUrl: string;
}

/** Persist GitHub PAT + `owner/repo` for pull requests for one workspace project. */
export interface SetProjectGitHubPrInput {
  projectId: string;
  /** New PAT, or empty to clear unless {@link retainTokenIfEmpty} is true. */
  token: string;
  owner: string;
  repo: string;
  /**
   * When true and `token` is empty, keep the existing stored token and only update owner/repo.
   * Used when the UI does not re-display the secret after save.
   */
  retainTokenIfEmpty?: boolean;
}

/** Main process lists open PRs using the stored PAT for this project (renderer never sees the token). */
export interface GitHubPrByProjectInput {
  projectId: string;
}

/** Fetch PR unified diff via main (Bearer from stored credentials). */
export interface GitHubPrDiffByProjectInput {
  projectId: string;
  prNumber: number;
}

/** Fetch PR review comments via main. */
export interface GitHubPrCommentsByProjectInput {
  projectId: string;
  prNumber: number;
}

/** Result of checking whether a preview URL responds (main process; no CORS). */
export type PreviewProbeResult =
  | { ok: true; status: number }
  | { ok: false; code: "invalid" | "network"; message: string };

/** Pixel bounds for positioning the native preview `BrowserView`. */
export type PreviewBounds = { x: number; y: number; width: number; height: number };

/** Result of a main-process preview navigation (`BrowserView` load / reload). */
export type PreviewNativeLoadResult =
  | { ok: true }
  | { ok: false; errorCode: number; errorDescription: string };

/** Result of toggling embedded Chrome DevTools for the preview `BrowserView`. */
export type PreviewDevToolsToggleResult =
  | { ok: true; open: boolean }
  | { ok: false; reason: "no-preview" | "no-bounds" | "no-window" };

/** Main process → renderer: preview native layer load lifecycle (badges / status). */
export type PreviewLoadStatePayload =
  | { kind: "loading"; url: string }
  | { kind: "loaded"; url: string; statusCode: number }
  | { kind: "httpError"; url: string; statusCode: number; statusLine?: string }
  | {
      kind: "failed";
      url: string;
      /** Chromium net error code (e.g. connection refused). */
      errorCode: number;
      errorDescription: string;
    };

/** Preview `WebContents.enableDeviceEmulation` preset (Chromium device mode). */
export type PreviewDeviceEmulationPreset = "clear" | "mobile" | "tablet" | "desktop";

/** Main → renderer: navigation state pushed after any BrowserView navigation. */
export interface PreviewNavigationState {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface SymphonyGetTasksInput {
  projectId: string;
}

export type { SymphonySetConfigInput, SymphonyStoredConfig, SymphonyTasksSnapshot } from "./symphony.js";
