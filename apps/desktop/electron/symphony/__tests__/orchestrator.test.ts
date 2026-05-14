import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SymphonyOrchestrator } from '../orchestrator.js';
import type { SymphonyConfig, TrackerIssue } from '../types.js';
import type { SymphonyConfigStore } from '../../storage/stores/SymphonyConfigStore.js';
import type { WorkspaceService } from '../../services/workspaceService.js';
import type { RunService } from '../../services/runService.js';
import type { CompletionHandler } from '../completionHandler.js';
import type { DiffService } from '../../services/diffService.js';

const WORKFLOW_CONFIG: SymphonyConfig = {
  tracker: { kind: 'linear', project_slug: 'my/proj', active_states: ['Todo'], terminal_states: ['Done'] },
  polling: { interval_ms: 60000 },
  agent: { max_concurrent_agents: 2, on_complete: 'commit' },
  codex: { command: 'claude' },
  kanban: { columns: [{ label: 'Todo', state: 'Todo' }] },
};

const MOCK_ISSUE: TrackerIssue = {
  id: 'iss-1', identifier: 'PROJ-1', title: 'My issue', description: null,
  state: 'Todo', labels: [], url: 'https://linear.app/issue/PROJ-1',
};

function makeOrchestrator() {
  const configStore = {
    get: vi.fn().mockReturnValue({ projectId: 'p1', trackerKind: 'linear', apiKey: 'key', projectSlug: 'my/proj' }),
  } as unknown as SymphonyConfigStore;

  const workspaceService = {
    getSnapshot: vi.fn().mockReturnValue({
      activeProjectId: 'p1',
      activeWorktreePath: '/repo',
      projects: [{ id: 'p1', repoPath: '/repo' }],
    }),
    createThread: vi.fn().mockReturnValue({ id: 'thread-1', worktreePath: '/repo', agent: 'claude' }),
  } as unknown as WorkspaceService;

  const runService = {
    start: vi.fn().mockReturnValue('run-1'),
    getRunStatus: vi.fn().mockReturnValue('done'),
    interrupt: vi.fn(),
  } as unknown as RunService;

  const completionHandler = {
    handle: vi.fn().mockResolvedValue({ prUrl: null, error: null }),
  } as unknown as CompletionHandler;

  const diffService = {} as unknown as DiffService;

  const adapter = {
    fetchEligibleIssues: vi.fn().mockResolvedValue([MOCK_ISSUE]),
    transitionIssue: vi.fn().mockResolvedValue(undefined),
  };

  const readWorkflow = vi.fn().mockReturnValue(WORKFLOW_CONFIG);
  const readWorkflowRaw = vi.fn().mockReturnValue('---\n...\n---\nPrompt {{ issue.title }}');

  const onStateChange = vi.fn();

  const orchestrator = new SymphonyOrchestrator({
    configStore,
    workspaceService,
    runService,
    completionHandler,
    diffService,
    readWorkflowConfig: readWorkflow,
    readWorkflowRaw,
    makeAdapter: () => adapter,
    onStateChange,
  });

  return { orchestrator, workspaceService, runService, adapter, completionHandler, onStateChange };
}

describe('SymphonyOrchestrator', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('dispatches a new thread for an eligible issue', async () => {
    const { orchestrator, workspaceService, runService } = makeOrchestrator();
    await orchestrator.tick();
    expect(workspaceService.createThread).toHaveBeenCalledOnce();
    expect(runService.start).toHaveBeenCalledOnce();
  });

  it('does not dispatch the same issue twice', async () => {
    const { orchestrator, workspaceService } = makeOrchestrator();
    await orchestrator.tick();
    await orchestrator.tick();
    expect(workspaceService.createThread).toHaveBeenCalledOnce();
  });

  it('calls completionHandler when run is done', async () => {
    const { orchestrator, completionHandler } = makeOrchestrator();
    await orchestrator.tick();
    await orchestrator.tick();
    expect(completionHandler.handle).toHaveBeenCalledOnce();
  });

  it('emits state change after dispatch', async () => {
    const { orchestrator, onStateChange } = makeOrchestrator();
    await orchestrator.tick();
    expect(onStateChange).toHaveBeenCalled();
  });

  it('does not dispatch when max_concurrent_agents reached', async () => {
    const { orchestrator, workspaceService, runService, adapter } = makeOrchestrator();
    adapter.fetchEligibleIssues.mockResolvedValue([
      MOCK_ISSUE,
      { ...MOCK_ISSUE, id: 'iss-2', identifier: 'PROJ-2' },
      { ...MOCK_ISSUE, id: 'iss-3', identifier: 'PROJ-3' },
    ]);
    runService.getRunStatus.mockReturnValue('running');
    await orchestrator.tick();
    expect(workspaceService.createThread).toHaveBeenCalledTimes(2);
  });
});
