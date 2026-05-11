import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinearAdapter } from '../linear.js';
import type { SymphonyConfig } from '../../types.js';

const CONFIG: SymphonyConfig = {
  tracker: {
    kind: 'linear',
    project_slug: 'my-team/my-proj',
    active_states: ['Todo', 'In Progress'],
    terminal_states: ['Done', 'Cancelled'],
  },
  polling: { interval_ms: 60000 },
  agent: { max_concurrent_agents: 3, on_complete: 'open_pr' },
  codex: { command: 'claude' },
  kanban: { columns: [] },
};

const MOCK_RESPONSE = {
  data: {
    issues: {
      nodes: [
        {
          id: 'lin-1',
          identifier: 'PROJ-42',
          title: 'Fix login timeout',
          description: 'Description here',
          state: { name: 'Todo' },
          labels: { nodes: [{ name: 'bug' }] },
          url: 'https://linear.app/issue/PROJ-42',
        },
      ],
    },
  },
};

describe('LinearAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let adapter: LinearAdapter;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_RESPONSE),
    });
    adapter = new LinearAdapter(fetchMock as unknown as typeof fetch);
  });

  it('fetches eligible issues matching active_states', async () => {
    const issues = await adapter.fetchEligibleIssues(CONFIG, 'my-api-key');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(issues).toHaveLength(1);
    expect(issues[0].identifier).toBe('PROJ-42');
    expect(issues[0].state).toBe('Todo');
    expect(issues[0].labels).toEqual(['bug']);
  });

  it('sends Authorization header with api key', async () => {
    await adapter.fetchEligibleIssues(CONFIG, 'secret-key');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('secret-key');
  });

  it('throws on non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') });
    await expect(adapter.fetchEligibleIssues(CONFIG, 'bad-key')).rejects.toThrow('Linear API error 401');
  });
});
