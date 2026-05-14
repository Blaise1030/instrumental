import type { TrackerAdapter, TrackerIssue, IssueStateSnapshot, SymphonyConfig } from '../types.js';

const GH_API = 'https://api.github.com';

export class GitHubAdapter implements TrackerAdapter {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async fetchEligibleIssues(
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<TrackerIssue[]> {
    const [owner, repo] = config.tracker.project_slug.split('/');
    if (!owner || !repo) throw new Error(`Invalid GitHub project_slug: ${config.tracker.project_slug}`);

    const params = new URLSearchParams({ state: 'open', per_page: '50' });
    const url = `${GH_API}/repos/${owner}/${repo}/issues?${params}`;

    const res = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }

    const issues = await res.json() as GHIssue[];
    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => {
        const labelNames = issue.labels.map((l) => l.name);
        const matchedState = config.tracker.active_states.find((s) =>
          labelNames.includes(s),
        );
        if (!matchedState) return null;
        return {
          id: String(issue.number),
          identifier: `#${issue.number}`,
          title: issue.title,
          description: issue.body ?? null,
          state: matchedState,
          labels: labelNames,
          url: issue.html_url,
          branchName: null as string | null,
        };
      })
      .filter((i): i is TrackerIssue => i !== null);
  }

  async fetchIssueStatesByIds(_issueIds: string[], _apiKey: string): Promise<IssueStateSnapshot[]> {
    // GitHub has no lightweight state-check endpoint; caller must use fetchEligibleIssues.
    return [];
  }

  async transitionIssue(
    issueId: string,
    state: string,
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<void> {
    if (config.tracker.terminal_states.includes(state)) {
      const [owner, repo] = config.tracker.project_slug.split('/');
      const url = `${GH_API}/repos/${owner}/${repo}/issues/${issueId}`;
      await this.fetchFn(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ state: 'closed' }),
      });
    }
  }
}

interface GHIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  pull_request?: unknown;
  labels: Array<{ name: string }>;
}
