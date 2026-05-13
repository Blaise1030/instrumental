import type { TrackerAdapter, TrackerIssue, IssueStateSnapshot, SymphonyConfig } from '../types.js';

const LINEAR_API = 'https://api.linear.app/graphql';
const PAGE_SIZE = 50;
const TIMEOUT_MS = 15_000;

const ISSUES_QUERY = `
  query EligibleIssues($slug: String!, $states: [String!]!, $first: Int!, $after: String) {
    issues(
      first: $first
      after: $after
      filter: {
        project: { slugId: { eq: $slug } }
        state: { name: { in: $states } }
      }
      orderBy: createdAt
    ) {
      nodes {
        id
        identifier
        title
        description
        branchName
        url
        state { name }
        labels { nodes { name } }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`.trim();

const ISSUE_STATES_QUERY = `
  query IssueStatesByIds($issueIds: [ID!]!) {
    issues(filter: { id: { in: $issueIds } }) {
      nodes {
        id
        identifier
        state { name }
      }
    }
  }
`.trim();

const TRANSITION_MUTATION = `
  mutation TransitionIssue($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
    }
  }
`;

export class LinearAdapter implements TrackerAdapter {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async fetchEligibleIssues(config: SymphonyConfig, apiKey: string): Promise<TrackerIssue[]> {
    const issues: TrackerIssue[] = [];
    let after: string | undefined;

    do {
      const res = await this.post<IssuesResponse>(ISSUES_QUERY, {
        slug: config.tracker.project_slug,
        states: config.tracker.active_states,
        first: PAGE_SIZE,
        after: after ?? null,
      }, apiKey);

      const nodes = res.data?.issues?.nodes ?? [];
      issues.push(...nodes.map(nodeToIssue));

      const pageInfo = res.data?.issues?.pageInfo;
      after = pageInfo?.hasNextPage && typeof pageInfo.endCursor === 'string'
        ? pageInfo.endCursor
        : undefined;
    } while (after !== undefined);

    return issues;
  }

  async fetchIssueStatesByIds(issueIds: string[], apiKey: string): Promise<IssueStateSnapshot[]> {
    if (issueIds.length === 0) return [];

    const res = await this.post<IssueStatesResponse>(ISSUE_STATES_QUERY, { issueIds }, apiKey);
    const nodes = res.data?.issues?.nodes ?? [];
    return nodes.map((n) => ({
      id: requireString(n.id, 'id'),
      identifier: requireString(n.identifier, 'identifier'),
      state: requireString(n.state?.name, 'state.name'),
    }));
  }

  async transitionIssue(issueId: string, _state: string, _config: SymphonyConfig, apiKey: string): Promise<void> {
    // Linear requires state ID not name; needs a separate resolve query.
    console.warn(`[symphony:linear] transitionIssue not fully implemented for issueId=${issueId}`);
    void apiKey;
    void TRANSITION_MUTATION;
  }

  private async post<T>(query: string, variables: Record<string, unknown>, apiKey: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await this.fetchFn(LINEAR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Linear API error ${res.status}: ${text}`);
      }

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }
}

interface LinearIssueNode {
  id?: unknown;
  identifier?: unknown;
  title?: unknown;
  description?: unknown;
  branchName?: unknown;
  url?: unknown;
  state?: { name?: unknown } | null;
  labels?: { nodes?: Array<{ name?: unknown }> } | null;
}

interface IssuesResponse {
  data?: {
    issues?: {
      nodes?: LinearIssueNode[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: unknown };
    };
  };
}

interface IssueStatesResponse {
  data?: {
    issues?: {
      nodes?: Array<{ id?: unknown; identifier?: unknown; state?: { name?: unknown } | null }>;
    };
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  throw new Error(`Linear: missing required field "${field}"`);
}

function nodeToIssue(node: LinearIssueNode): TrackerIssue {
  return {
    id: requireString(node.id, 'id'),
    identifier: requireString(node.identifier, 'identifier'),
    title: requireString(node.title, 'title'),
    description: typeof node.description === 'string' ? node.description : null,
    state: requireString(node.state?.name, 'state.name'),
    labels: (node.labels?.nodes ?? []).map((l) => (typeof l.name === 'string' ? l.name : '')).filter(Boolean),
    url: typeof node.url === 'string' ? node.url : '',
    branchName: typeof node.branchName === 'string' ? node.branchName : null,
  };
}
