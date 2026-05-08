import { randomUUID } from "node:crypto";
import type { Project, Thread, ThreadAgent } from "../../src/shared/domain.js";
import { isValidPersistedResumeId } from "../../src/shared/resumeSessionId.js";
import type {
  CreateThreadInput,
  GitHubPrSettings,
  WorkspaceSnapshot,
} from "../../src/shared/ipc.js";
import { WorkspaceStore } from "../storage/WorkspaceStore.js";

export interface GitAdapter {
  worktreeList(repoPath: string): Promise<Array<{ path: string; branch: string }>>;
  branchList(repoPath: string): Promise<string[]>;
  pathExists(fsPath: string): Promise<boolean>;
}

const DEFAULT_THREAD_TITLES: Record<Thread["agent"], string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};
const MAX_DERIVED_TITLE_LENGTH = 68;

// Preserve the raw first prompt, collapse whitespace, and truncate once.
export function deriveThreadTitleFromPrompt(input: string): string | null {
  const firstLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;

  const normalized = firstLine
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  if (normalized.length <= MAX_DERIVED_TITLE_LENGTH) return normalized;

  const truncated = normalized.slice(0, MAX_DERIVED_TITLE_LENGTH - 3).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  const safe = lastSpace >= 24 ? truncated.slice(0, lastSpace) : truncated;
  return `${safe}...`;
}

function hasDefaultGeneratedTitle(thread: Thread): boolean {
  const base = DEFAULT_THREAD_TITLES[thread.agent];
  return thread.title === base || thread.title.startsWith(`${base} · `);
}

/** Inline composer creates threads with this title until submit (see WorkspaceLayout `createThread`). */
const INLINE_COMPOSER_PLACEHOLDER_TITLE = "New thread";

function threadTitleEligibleForPromptDerivedRename(thread: Thread): boolean {
  return (
    hasDefaultGeneratedTitle(thread) ||
    thread.title.trim() === INLINE_COMPOSER_PLACEHOLDER_TITLE
  );
}

export class WorkspaceService {
  constructor(
    private store: WorkspaceStore,
    private git?: GitAdapter
  ) {}

  getSnapshot(): WorkspaceSnapshot {
    return this.store.getSnapshot();
  }

  getGitHubPrSettings(): GitHubPrSettings {
    return this.store.getGitHubPrSettings();
  }

  setGitHubPrSettings(payload: GitHubPrSettings): void {
    this.store.setGitHubPrSettings(payload);
  }

  addProject(name: string, repoPath: string): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name,
      repoPath,
      status: "idle",
      tabOrder: this.store.nextProjectTabOrder(),
      createdAt: now,
      updatedAt: now
    };
    this.store.upsertProject(project);
    this.store.setActiveState(project.id, null, null);
    return project;
  }

  reorderProjects(orderedProjectIds: string[]): void {
    this.store.reorderProjects(orderedProjectIds);
  }

  removeProject(projectId: string): void {
    this.store.deleteProject(projectId);
  }

  /**
   * @param createdBranchOverride When set (including `null`), persisted as `createdBranch` instead of null
   *   (used by main process after reading `HEAD` from disk so it matches SCM state).
   */
  createThread(input: CreateThreadInput, createdBranchOverride?: string | null): Thread {
    const now = new Date().toISOString();
    const createdBranch = createdBranchOverride !== undefined ? createdBranchOverride : null;
    const thread: Thread = {
      id: randomUUID(),
      projectId: input.projectId,
      worktreePath: input.worktreePath,
      title: input.title,
      agent: input.agent,
      createdBranch,
      resumeId: null,
      createdAt: now,
      updatedAt: now
    };
    this.store.upsertThread(thread);
    this.store.setActiveState(input.projectId, input.worktreePath, thread.id);
    return thread;
  }

  deleteThread(threadId: string): void {
    this.store.deleteThread(threadId);
  }

  renameThread(threadId: string, title: string): void {
    this.store.renameThread(threadId, title);
  }

  updateThread(threadId: string, updates: { title?: string; agent?: ThreadAgent }): void {
    const thread = this.store.getThread(threadId);
    if (!thread) return;

    const now = new Date().toISOString();
    this.store.upsertThread({
      ...thread,
      title: updates.title ?? thread.title,
      agent: updates.agent ?? thread.agent,
      updatedAt: now
    });
  }

  captureInitialPrompt(threadId: string, input: string): { renamed: boolean; captured: boolean; initialPrompt: string | null } {
    const nextTitle = deriveThreadTitleFromPrompt(input);
    if (!nextTitle) return { renamed: false, captured: false, initialPrompt: null };

    const thread = this.store.getThread(threadId);
    if (!thread) return { renamed: false, captured: false, initialPrompt: null };

    const existingSession = this.store.getThreadSession(threadId);
    if (existingSession?.titleCapturedAt) {
      return {
        renamed: false,
        captured: false,
        initialPrompt: existingSession.initialPrompt
      };
    }

    if (!threadTitleEligibleForPromptDerivedRename(thread)) {
      return {
        renamed: false,
        captured: false,
        initialPrompt: null
      };
    }

    const now = new Date().toISOString();
    const initialPrompt = existingSession?.initialPrompt ?? input;
    this.store.upsertThreadSession({
      threadId,
      provider: thread.agent,
      resumeId: existingSession?.resumeId ?? null,
      initialPrompt,
      titleCapturedAt: existingSession?.titleCapturedAt ?? now,
      launchMode: existingSession?.launchMode ?? "fresh",
      status: existingSession?.status ?? "idle",
      lastActivityAt: existingSession?.lastActivityAt ?? now,
      metadataJson: existingSession?.metadataJson ?? null,
      createdAt: existingSession?.createdAt ?? now,
      updatedAt: now
    });

    if (thread.title === nextTitle) {
      return {
        renamed: false,
        captured: true,
        initialPrompt
      };
    }

    this.store.renameThread(threadId, nextTitle);
    return {
      renamed: true,
      captured: true,
      initialPrompt
    };
  }

  maybeRenameThreadFromPrompt(threadId: string, input: string): boolean {
    const result = this.captureInitialPrompt(threadId, input);
    return result.renamed || result.captured;
  }

  /**
   * Persists the detected provider resume/session id for a thread (e.g. from
   * `cursor agent --resume=<id>` or hook `SessionStart`). Skips invalid strings.
   * If a persistable id is already stored, does nothing (including when the new id differs).
   * If the stored id is missing or not persistable, replaces it with the new id.
   */
  captureResumeId(threadId: string, resumeId: string): boolean {
    const thread = this.store.getThread(threadId);
    if (!thread) return false;

    const trimmed = resumeId.trim();
    if (!isValidPersistedResumeId(trimmed)) return false;

    const existing = this.store.getThreadSession(threadId);
    const stored = existing?.resumeId?.trim() ?? "";
    const hasValidStored = stored !== "" && isValidPersistedResumeId(stored);
    if (hasValidStored) return false;

    const now = new Date().toISOString();
    this.store.upsertThreadSession({
      threadId,
      provider: thread.agent,
      resumeId: trimmed,
      initialPrompt: existing?.initialPrompt ?? null,
      titleCapturedAt: existing?.titleCapturedAt ?? null,
      launchMode: existing?.launchMode ?? "fresh",
      status: "resumable",
      lastActivityAt: existing?.lastActivityAt ?? now,
      metadataJson: existing?.metadataJson ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    return true;
  }

  setActive(projectId: string | null, worktreePath: string | null, threadId: string | null): void {
    this.store.setActiveState(projectId, worktreePath, threadId);
  }

  async listBranches(projectId: string): Promise<string[]> {
    if (!this.git) throw new Error("Git adapter required for worktree operations");

    const snapshot = this.store.getSnapshot();
    const project = snapshot.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    return this.git.branchList(project.repoPath);
  }

}
