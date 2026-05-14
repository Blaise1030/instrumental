import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Project, Thread, ThreadAgent } from "../../src/shared/domain.js";
import { isValidPersistedResumeId } from "../../src/shared/resumeSessionId.js";
import type {
  CreateWorktreeGroupInput,
  CreateThreadInput,
  WorkspaceSnapshot,
} from "../../src/shared/ipc.js";
import { WorkspaceStore } from "../storage/WorkspaceStore.js";

export interface GitAdapter {
  worktreeList(repoPath: string): Promise<Array<{ path: string; branch: string }>>;
  branchList(repoPath: string): Promise<string[]>;
  worktreeAdd(
    repoPath: string,
    worktreePath: string,
    branch: string,
    baseBranch: string | null
  ): Promise<void>;
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
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

  setProjectGitHubPr(
    projectId: string,
    token: string,
    owner: string,
    repo: string,
    retainTokenIfEmpty = false
  ): void {
    this.store.setProjectGitHubPr(projectId, token, owner, repo, retainTokenIfEmpty);
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
      updatedAt: now,
      githubPrTokenConfigured: false,
      githubPrOwner: "",
      githubPrRepo: "",
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
      metadataJson: input.metadataJson ?? null,
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

  async createWorktreeGroup(input: CreateWorktreeGroupInput): Promise<{ path: string; branch: string }> {
    if (!this.git) throw new Error("Git adapter required for worktree operations");
    const branch = input.branch.trim();
    if (!branch) throw new Error("branch is required");
    const snapshot = this.store.getSnapshot();
    const project = snapshot.projects.find((p) => p.id === input.projectId);
    if (!project) throw new Error(`Project ${input.projectId} not found`);

    const sanitized = branch.replace(/[\\/]/g, "-");
    const worktreePath = path.join(project.repoPath, ".worktrees", sanitized);
    await this.git.worktreeAdd(project.repoPath, worktreePath, branch, input.baseBranch);
    return { path: worktreePath, branch };
  }

  async deleteWorktreeGroup(worktreePath: string): Promise<void> {
    if (!this.git) throw new Error("Git adapter required for worktree operations");
    const target = worktreePath.trim();
    if (!target) throw new Error("worktree path is required");

    const snapshot = this.store.getSnapshot();
    let matchedProject = snapshot.projects.find((p) => p.repoPath === target) ?? null;
    if (!matchedProject) {
      for (const project of snapshot.projects) {
        const listed = await this.git.worktreeList(project.repoPath);
        if (listed.some((entry) => entry.path === target)) {
          matchedProject = project;
          break;
        }
      }
    }
    if (!matchedProject) throw new Error(`Could not resolve parent repo for worktree: ${target}`);
    if (matchedProject.repoPath === target) {
      throw new Error("Cannot delete the default repository worktree");
    }

    await this.git.removeWorktree(matchedProject.repoPath, target);

    for (const thread of snapshot.threads.filter((t) => t.worktreePath === target)) {
      this.store.deleteThread(thread.id);
    }
    if (this.store.getSnapshot().activeWorktreePath === target) {
      this.store.setActiveState(matchedProject.id, null, null);
    }
  }

  private githubAuthHeaders(token: string, accept: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "instrument-app",
    };
  }

  async githubListOpenPullRequests(projectId: string): Promise<unknown> {
    const { token, owner, repo } = this.store.requireGitHubPrAuth(projectId);
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=30`;
    const res = await fetch(url, {
      headers: this.githubAuthHeaders(token, "application/vnd.github+json"),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GitHub API error ${res.status}${detail ? `: ${detail.slice(0, 400)}` : ""}`);
    }
    return res.json();
  }

  async githubFetchPrDiff(projectId: string, prNumber: number): Promise<string> {
    const { token, owner, repo } = this.store.requireGitHubPrAuth(projectId);
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`;
    const acceptDiff = "application/vnd.github+json,application/vnd.github.diff";
    const res = await fetch(url, {
      headers: this.githubAuthHeaders(token, acceptDiff),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GitHub API error ${res.status}${detail ? `: ${detail.slice(0, 400)}` : ""}`);
    }
    return res.text();
  }

  async githubFetchPrComments(projectId: string, prNumber: number): Promise<unknown> {
    const { token, owner, repo } = this.store.requireGitHubPrAuth(projectId);
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/comments?per_page=100`;
    const res = await fetch(url, {
      headers: this.githubAuthHeaders(token, "application/vnd.github+json"),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GitHub API error ${res.status}${detail ? `: ${detail.slice(0, 400)}` : ""}`);
    }
    return res.json();
  }
}
