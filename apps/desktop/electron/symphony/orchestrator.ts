import type { SymphonyConfig, SymphonyTask, TrackerIssue, TrackerAdapter } from './types.js';
import type { SymphonyConfigStore } from '../storage/stores/SymphonyConfigStore.js';
import type { WorkspaceService } from '../services/workspaceService.js';
import type { RunService } from '../services/runService.js';
import type { CompletionHandler } from './completionHandler.js';
import type { DiffService } from '../services/diffService.js';
import { renderPromptTemplate } from './workflowReader.js';

interface ActiveRun {
  threadId: string;
  runId: string;
  worktreePath: string;
  issue: TrackerIssue;
  startedAt: number;
  prUrl: string | null;
  errorHint: string | null;
}

export interface OrchestratorDeps {
  configStore: SymphonyConfigStore;
  workspaceService: WorkspaceService;
  runService: RunService;
  completionHandler: CompletionHandler;
  diffService: DiffService;
  readWorkflowConfig: (repoPath: string) => SymphonyConfig | null;
  readWorkflowRaw: (repoPath: string) => string | null;
  makeAdapter: (kind: 'linear' | 'github') => TrackerAdapter;
  onStateChange: () => void;
}

export class SymphonyOrchestrator {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly deps: OrchestratorDeps) {}

  start(): void {
    this.stopped = false;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async tick(): Promise<void> {
    let pollIntervalMs = 60_000;
    try {
      const snapshot = this.deps.workspaceService.getSnapshot();
      if (!snapshot.activeProjectId || !snapshot.activeWorktreePath) return;

      const storeCfg = this.deps.configStore.get(snapshot.activeProjectId);
      if (!storeCfg) return;

      const repoPath = snapshot.projects.find((p: { id: string }) => p.id === snapshot.activeProjectId)?.repoPath;
      if (!repoPath) return;

      const workflowConfig = this.deps.readWorkflowConfig(repoPath);
      if (!workflowConfig) return;

      pollIntervalMs = workflowConfig.polling?.interval_ms ?? 60_000;

      const workflowRaw = this.deps.readWorkflowRaw(repoPath) ?? '';
      const adapter = this.deps.makeAdapter(storeCfg.trackerKind);

      await this.reconcile(workflowConfig, storeCfg.apiKey, adapter, repoPath, snapshot.activeProjectId);
      await this.dispatch(workflowConfig, storeCfg.apiKey, adapter, workflowRaw, snapshot);

      this.deps.onStateChange();
    } catch (err) {
      console.error('[symphony] tick error:', err);
    } finally {
      if (!this.stopped) {
        this.scheduleNextTick(pollIntervalMs);
      }
    }
  }

  getTasks(projectId: string, workflowConfig: SymphonyConfig | null): SymphonyTask[] {
    return Array.from(this.activeRuns.values())
      .filter((r) => {
        const snapshot = this.deps.workspaceService.getSnapshot();
        return snapshot.projects.some((p: { id: string; repoPath: string }) =>
          this.activeRuns.has(r.issue.id),
        );
      })
      .map((r) => {
        const status = this.deps.runService.getRunStatus(r.runId);
        return {
          issueId: r.issue.id,
          issueIdentifier: r.issue.identifier,
          issueTitle: r.issue.title,
          issueUrl: r.issue.url,
          issueState: r.issue.state,
          threadId: r.threadId,
          runStatus: status ?? 'idle',
          startedAt: r.startedAt,
          prUrl: r.prUrl,
          errorHint: r.errorHint,
        };
      });
  }

  private runningCount(): number {
    return Array.from(this.activeRuns.values()).filter((r) => {
      const status = this.deps.runService.getRunStatus(r.runId);
      return status === 'running';
    }).length;
  }

  private async dispatch(
    config: SymphonyConfig,
    apiKey: string,
    adapter: TrackerAdapter,
    workflowRaw: string,
    snapshot: ReturnType<WorkspaceService['getSnapshot']>,
  ): Promise<void> {
    const issues = await adapter.fetchEligibleIssues(config, apiKey);

    for (const issue of issues) {
      if (this.activeRuns.has(issue.id)) continue;
      if (this.runningCount() >= config.agent.max_concurrent_agents) break;

      const thread = this.deps.workspaceService.createThread({
        projectId: snapshot.activeProjectId!,
        worktreePath: snapshot.activeWorktreePath!,
        title: `${issue.identifier}: ${issue.title}`,
        agent: config.codex.command,
        metadataJson: JSON.stringify({ source: 'symphony', issueId: issue.id, identifier: issue.identifier, issueUrl: issue.url }),
      });

      const attempt = 0;
      const prompt = renderPromptTemplate(workflowRaw, issue, attempt);
      const runId = this.deps.runService.start(
        config.codex.command,
        snapshot.activeWorktreePath!,
        prompt,
        () => {},
      );

      this.activeRuns.set(issue.id, {
        threadId: thread.id,
        runId,
        worktreePath: snapshot.activeWorktreePath!,
        issue,
        startedAt: Date.now(),
        prUrl: null,
        errorHint: null,
      });
    }
  }

  private async reconcile(
    config: SymphonyConfig,
    apiKey: string,
    adapter: TrackerAdapter,
    repoPath: string,
    projectId: string,
  ): Promise<void> {
    for (const [issueId, run] of this.activeRuns) {
      const status = this.deps.runService.getRunStatus(run.runId);

      if (status === 'done' || status === 'failed') {
        if (status === 'done') {
          const result = await this.deps.completionHandler.handle({
            threadId: run.threadId,
            worktreePath: run.worktreePath,
            issue: run.issue,
            config,
            apiKey,
            adapter,
            diffService: this.deps.diffService,
          });
          run.prUrl = result.prUrl;
          run.errorHint = result.error;
        } else {
          run.errorHint = 'Run failed';
        }
      }

      if (status === null) {
        this.activeRuns.delete(issueId);
      }
    }
  }

  private scheduleNextTick(intervalMs: number): void {
    this.pollTimer = setTimeout(() => void this.tick(), intervalMs);
  }
}
