export interface KanbanColumn {
  label: string;
  state: string;
}

export interface SymphonyConfig {
  tracker: {
    kind: 'linear' | 'github';
    project_slug: string;
    active_states: string[];
    terminal_states: string[];
  };
  polling: { interval_ms: number };
  workspace?: { root?: string };
  hooks?: { after_create?: string; before_remove?: string };
  agent: {
    max_concurrent_agents: number;
    max_turns?: number;
    on_complete: 'open_pr' | 'commit' | 'mark_done';
  };
  codex: {
    command: 'claude' | 'codex' | 'gemini' | 'cursor';
    approval_policy?: string;
  };
  kanban: { columns: KanbanColumn[] };
}

export interface TrackerIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  labels: string[];
  url: string;
}

export interface SymphonyTask {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  issueState: string;
  threadId: string | null;
  runStatus: 'idle' | 'running' | 'done' | 'failed' | 'needsReview' | null;
  startedAt: number | null;
  prUrl: string | null;
  errorHint: string | null;
}

export interface TrackerAdapter {
  fetchEligibleIssues(
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<TrackerIssue[]>;
  transitionIssue(
    issueId: string,
    state: string,
    config: SymphonyConfig,
    apiKey: string,
  ): Promise<void>;
}
