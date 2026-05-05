import type { RemoteGitProvider, RemotePullRequest, RemotePrComment } from "../remoteGitProvider.js";

interface GitLabMr {
  iid: number;
  title: string;
  web_url: string;
  state: string;
  draft: boolean;
  author: { username: string; avatar_url: string };
  source_branch: string;
  sha: string;
  target_branch: string;
  created_at: string;
  updated_at: string;
  user_notes_count: number;
  changes_count: string;
}

interface GitLabNote {
  id: number;
  body: string;
  author: { username: string; avatar_url: string };
  created_at: string;
  position?: {
    new_path?: string;
    old_path?: string;
    new_line?: number;
    old_line?: number;
    line_range?: { start?: { type: string } };
  };
}

function mapMr(mr: GitLabMr): RemotePullRequest {
  return {
    number: mr.iid,
    title: mr.title,
    html_url: mr.web_url,
    state: mr.state === "opened" ? "open" : "closed",
    draft: mr.draft,
    user: { login: mr.author.username, avatar_url: mr.author.avatar_url },
    head: { ref: mr.source_branch, sha: mr.sha },
    base: { ref: mr.target_branch },
    created_at: mr.created_at,
    updated_at: mr.updated_at,
    comments: mr.user_notes_count,
    review_comments: 0,
    additions: 0,
    deletions: 0,
    changed_files: parseInt(mr.changes_count ?? "0", 10) || 0,
  };
}

function mapNote(note: GitLabNote): RemotePrComment {
  const pos = note.position;
  const isRight = pos?.line_range?.start?.type === "new" || pos?.new_line != null;
  return {
    id: note.id,
    path: pos?.new_path ?? pos?.old_path ?? "",
    line: pos?.new_line ?? pos?.old_line ?? null,
    original_line: pos?.old_line ?? null,
    body: note.body,
    user: { login: note.author.username, avatar_url: note.author.avatar_url },
    created_at: note.created_at,
    diff_hunk: "",
    side: isRight ? "RIGHT" : "LEFT",
  };
}

export class GitLabProvider implements RemoteGitProvider {
  readonly name = "gitlab" as const;

  // baseUrl allows self-hosted GitLab instances
  constructor(private token: string, private baseUrl = "https://gitlab.com") {}

  private headers(): Record<string, string> {
    return { "PRIVATE-TOKEN": this.token };
  }

  private projectId(owner: string, repo: string): string {
    return encodeURIComponent(`${owner}/${repo}`);
  }

  async listPullRequests(owner: string, repo: string): Promise<RemotePullRequest[]> {
    const res = await fetch(
      `${this.baseUrl}/api/v4/projects/${this.projectId(owner, repo)}/merge_requests?state=opened&per_page=30`,
      { headers: this.headers() }
    );
    if (!res.ok) throw new Error(`GitLab API error ${res.status}: ${await res.text()}`);
    const mrs = await res.json() as GitLabMr[];
    return mrs.map(mapMr);
  }

  async getPullRequestDiff(owner: string, repo: string, number: number): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/api/v4/projects/${this.projectId(owner, repo)}/merge_requests/${number}/diffs`,
      { headers: this.headers() }
    );
    if (!res.ok) throw new Error(`GitLab API error ${res.status}`);
    const diffs = await res.json() as Array<{ diff: string; new_path: string; old_path: string; new_file: boolean; deleted_file: boolean }>;
    return diffs
      .map((d) => {
        const header = `diff --git a/${d.old_path} b/${d.new_path}\n--- a/${d.old_path}\n+++ b/${d.new_path}`;
        return `${header}\n${d.diff}`;
      })
      .join("\n");
  }

  async getPullRequestComments(owner: string, repo: string, number: number): Promise<RemotePrComment[]> {
    const res = await fetch(
      `${this.baseUrl}/api/v4/projects/${this.projectId(owner, repo)}/merge_requests/${number}/notes?per_page=100`,
      { headers: this.headers() }
    );
    if (!res.ok) throw new Error(`GitLab API error ${res.status}`);
    const notes = await res.json() as GitLabNote[];
    return notes.filter((n) => n.position).map(mapNote);
  }
}
