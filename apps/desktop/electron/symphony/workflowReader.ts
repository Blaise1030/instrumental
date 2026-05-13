import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { SymphonyConfig, TrackerIssue, KanbanColumn } from './types.js';

export function readWorkflowConfig(repoPath: string): SymphonyConfig | null {
  const filePath = path.join(repoPath, 'WORKFLOW.md');
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  try {
    const raw = yaml.load(match[1]) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return null;

    // Symphony nested format: `symphony: { tracker, project, columns, ... }`
    if (raw.symphony && typeof raw.symphony === 'object') {
      return parseSymphonyFormat(raw.symphony as Record<string, unknown>);
    }

    // Flat format: `tracker: { kind, project_slug, active_states, ... }`
    return parseFlatFormat(raw);
  } catch {
    return null;
  }
}

function parseFlatFormat(raw: Record<string, unknown>): SymphonyConfig | null {
  const tracker = raw.tracker as Record<string, unknown> | undefined;
  const kind = tracker?.kind as string | undefined;
  if (kind !== 'linear' && kind !== 'github') return null;

  const activeStates = Array.isArray(tracker?.active_states)
    ? (tracker.active_states as string[])
    : [];
  const terminalStates = Array.isArray(tracker?.terminal_states)
    ? (tracker.terminal_states as string[])
    : [];

  // Build kanban columns — use explicit kanban.columns if present, otherwise
  // derive one column per active state.
  let kanbanColumns: KanbanColumn[];
  const rawKanban = raw.kanban as Record<string, unknown> | undefined;
  if (Array.isArray(rawKanban?.columns) && rawKanban.columns.length > 0) {
    kanbanColumns = (rawKanban.columns as Array<Record<string, unknown>>).map((c) => ({
      label: String(c.label ?? c.name ?? c.state ?? ''),
      state: String(c.state ?? ''),
      activeStates: Array.isArray(c.activeStates) ? (c.activeStates as string[]) : undefined,
    })).filter((c) => c.state !== '');
  } else {
    kanbanColumns = activeStates.map((s) => ({ label: s, state: s }));
  }

  if (kanbanColumns.length === 0) return null;

  const agent = raw.agent as Record<string, unknown> | undefined;
  const polling = raw.polling as Record<string, unknown> | undefined;
  const codex = raw.codex as Record<string, unknown> | undefined;

  return {
    tracker: {
      kind,
      project_slug: String(tracker?.project_slug ?? ''),
      active_states: activeStates,
      terminal_states: terminalStates,
    },
    polling: { interval_ms: Number(polling?.interval_ms ?? 60_000) },
    workspace: raw.workspace as SymphonyConfig['workspace'],
    hooks: raw.hooks as SymphonyConfig['hooks'],
    agent: {
      max_concurrent_agents: Number(agent?.max_concurrent_agents ?? 1),
      max_turns: agent?.max_turns !== undefined ? Number(agent.max_turns) : undefined,
      on_complete: (agent?.on_complete as SymphonyConfig['agent']['on_complete']) ?? 'commit',
    },
    codex: {
      command: (codex?.command as SymphonyConfig['codex']['command']) ?? 'claude',
      approval_policy: codex?.approval_policy as string | undefined,
    },
    kanban: { columns: kanbanColumns },
  };
}

function parseSymphonyFormat(s: Record<string, unknown>): SymphonyConfig | null {
  const trackerKind = s.tracker as string | undefined;
  if (trackerKind !== 'linear' && trackerKind !== 'github') return null;

  const rawCols = Array.isArray(s.columns) ? s.columns : [];
  if (rawCols.length === 0) return null;

  const kanbanColumns: KanbanColumn[] = rawCols.map((col: Record<string, unknown>) => {
    const activeStates = Array.isArray(col.active_states)
      ? (col.active_states as string[])
      : [];
    return {
      label: String(col.name ?? col.id ?? ''),
      state: activeStates[0] ?? '',
      activeStates,
    };
  }).filter((c) => c.state !== '');

  const allActiveStates = kanbanColumns.flatMap((c) => c.activeStates ?? [c.state]);

  return {
    tracker: {
      kind: trackerKind,
      project_slug: String(s.project ?? ''),
      active_states: allActiveStates,
      terminal_states: [],
    },
    polling: { interval_ms: 60_000 },
    agent: {
      max_concurrent_agents: 1,
      on_complete: 'commit',
    },
    codex: { command: 'claude' },
    kanban: { columns: kanbanColumns },
  };
}

export function readWorkflowRaw(repoPath: string): string | null {
  const filePath = path.join(repoPath, 'WORKFLOW.md');
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function renderPromptTemplate(
  workflowContent: string,
  issue: TrackerIssue,
  attempt: number,
): string {
  const bodyMatch = workflowContent.match(/^---[\s\S]*?---\r?\n([\s\S]*)$/);
  if (!bodyMatch) return workflowContent;
  let body = bodyMatch[1];

  // Resolve {% if attempt %}...{% endif %} blocks
  if (attempt > 0) {
    body = body.replace(/\{%-?\s*if attempt\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g, '$1');
  } else {
    body = body.replace(/\{%-?\s*if attempt\s*-?%\}[\s\S]*?\{%-?\s*endif\s*-?%\}/g, '');
  }

  // Substitute {{ variables }}
  body = body
    .replace(/\{\{\s*issue\.identifier\s*\}\}/g, issue.identifier)
    .replace(/\{\{\s*issue\.title\s*\}\}/g, issue.title)
    .replace(/\{\{\s*issue\.description\s*\}\}/g, issue.description ?? 'No description provided.')
    .replace(/\{\{\s*issue\.state\s*\}\}/g, issue.state)
    .replace(/\{\{\s*issue\.labels\s*\}\}/g, issue.labels.join(', '))
    .replace(/\{\{\s*issue\.url\s*\}\}/g, issue.url)
    .replace(/\{\{\s*attempt\s*\}\}/g, String(attempt));

  return body.trim();
}
