import type { TrackerAdapter, TrackerIssue, SymphonyConfig } from '../types.js';

const LINEAR_API = 'https://api.linear.app/graphql';

const ISSUES_QUERY = `
  query EligibleIssues($slug: String!, $states: [String!]!) {
    issues(
      filter: {
        project: { slugId: { eq: $slug } }
        state: { name: { in: $states } }
      }
      first: 50
    ) {
      nodes {
        id
        identifier
        title
        description
        state { name }
        labels { nodes { name } }
        url
      }
    }
  }
`;

const TRANSITION_MUTATION = `
  mutation TransitionIssue($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) {
      success
    }
  }
`;

export class LinearAdapter implements TrackerAdapter {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async fetchEligibleIssues(
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<TrackerIssue[]> {
    const res = await this.fetchFn(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query: ISSUES_QUERY,
        variables: {
          slug: config.tracker.project_slug,
          states: config.tracker.active_states,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linear API error ${res.status}: ${text}`);
    }

    const json = await res.json() as { data: { issues: { nodes: LinearIssueNode[] } } };
    return json.data.issues.nodes.map(nodeToIssue);
  }

  async transitionIssue(
    issueId: string,
    _state: string,
    _config: SymphonyConfig,
    apiKey: string,
  ): Promise<void> {
    // Linear requires the state ID not name; for now log and skip.
    // Full implementation requires a separate query to resolve state name → ID.
    console.warn(`[symphony:linear] transitionIssue not fully implemented for issueId=${issueId}`);
    void apiKey;
    void TRANSITION_MUTATION;
  }
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: { name: string };
  labels: { nodes: Array<{ name: string }> };
  url: string;
}

function nodeToIssue(node: LinearIssueNode): TrackerIssue {
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description,
    state: node.state.name,
    labels: node.labels.nodes.map((l) => l.name),
    url: node.url,
  };
}
