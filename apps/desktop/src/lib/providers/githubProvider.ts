import type { RemoteGitProvider, RemotePullRequest, RemotePrComment } from "../remoteGitProvider.js";

export class GitHubProvider implements RemoteGitProvider {
  readonly name = "github" as const;

  constructor(private token: string) {}

  private headers(acceptOverride?: string): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: acceptOverride ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async listPullRequests(owner: string, repo: string): Promise<RemotePullRequest[]> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=30`,
      { headers: this.headers() }
    );
    if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<RemotePullRequest[]>;
  }

  async getPullRequestDiff(owner: string, repo: string, number: number): Promise<string> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
      { headers: this.headers("application/vnd.github.diff") }
    );
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
    return res.text();
  }

  async getPullRequestComments(owner: string, repo: string, number: number): Promise<RemotePrComment[]> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`,
      { headers: this.headers() }
    );
    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
    return res.json() as Promise<RemotePrComment[]>;
  }
}
