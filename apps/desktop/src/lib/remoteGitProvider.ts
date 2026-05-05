export interface RemotePullRequest {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  user: { login: string; avatar_url: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  created_at: string;
  updated_at: string;
  comments: number;
  review_comments: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface RemotePrComment {
  id: number;
  path: string;
  line: number | null;
  original_line: number | null;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
  diff_hunk: string;
  side: "LEFT" | "RIGHT";
}

export interface RemoteGitProvider {
  readonly name: "github" | "gitlab";
  listPullRequests(owner: string, repo: string): Promise<RemotePullRequest[]>;
  getPullRequestDiff(owner: string, repo: string, number: number): Promise<string>;
  getPullRequestComments(owner: string, repo: string, number: number): Promise<RemotePrComment[]>;
}
