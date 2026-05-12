export interface KanbanColumn {
  label: string;
  state: string;
}

export type SymphonyRunStatus =
  | 'idle'
  | 'running'
  | 'done'
  | 'failed'
  | 'needsReview'
  | null;

export interface SymphonyTask {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  issueUrl: string;
  issueState: string;
  threadId: string | null;
  runStatus: SymphonyRunStatus;
  startedAt: number | null;
  prUrl: string | null;
  errorHint: string | null;
}

export interface SymphonyTasksSnapshot {
  tasks: SymphonyTask[];
  columns: KanbanColumn[];
  trackerError: string | null;
  enabled: boolean;
}

export interface SymphonySetConfigInput {
  projectId: string;
  trackerKind: 'linear' | 'github';
  apiKey: string;
  projectSlug: string;
}

export interface SymphonyStoredConfig {
  projectId: string;
  trackerKind: 'linear' | 'github';
  hasApiKey: boolean;
  projectSlug: string;
}
