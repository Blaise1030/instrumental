import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readWorkflowConfig, renderPromptTemplate } from '../workflowReader.js';
import type { TrackerIssue } from '../types.js';

const SAMPLE_WORKFLOW = `---
tracker:
  kind: linear
  project_slug: my-team/my-proj
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Cancelled

polling:
  interval_ms: 60000

agent:
  max_concurrent_agents: 3
  on_complete: open_pr

kanban:
  columns:
    - label: "Todo"
      state: "Todo"
    - label: "In Progress"
      state: "In Progress"
    - label: "Done"
      state: "Done"
---

You are working on {{ issue.identifier }}: {{ issue.title }}

{% if attempt %}
Retry attempt #{{ attempt }}.
{% endif %}

Description:
{{ issue.description }}
`;

const SAMPLE_ISSUE: TrackerIssue = {
  id: 'abc-123',
  identifier: 'PROJ-42',
  title: 'Fix login timeout',
  description: 'Users are logged out after 5 minutes.',
  state: 'In Progress',
  labels: ['bug', 'auth'],
  url: 'https://linear.app/my-team/issue/PROJ-42',
};

let tmpDir: string;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true }); });

describe('readWorkflowConfig', () => {
  it('returns null when WORKFLOW.md is absent', () => {
    expect(readWorkflowConfig(tmpDir)).toBeNull();
  });

  it('returns null when front matter is missing', () => {
    fs.writeFileSync(path.join(tmpDir, 'WORKFLOW.md'), 'no front matter here');
    expect(readWorkflowConfig(tmpDir)).toBeNull();
  });

  it('parses valid WORKFLOW.md front matter', () => {
    fs.writeFileSync(path.join(tmpDir, 'WORKFLOW.md'), SAMPLE_WORKFLOW);
    const cfg = readWorkflowConfig(tmpDir);
    expect(cfg).not.toBeNull();
    expect(cfg!.tracker.kind).toBe('linear');
    expect(cfg!.tracker.project_slug).toBe('my-team/my-proj');
    expect(cfg!.tracker.active_states).toEqual(['Todo', 'In Progress']);
    expect(cfg!.agent.max_concurrent_agents).toBe(3);
    expect(cfg!.agent.on_complete).toBe('open_pr');
    expect(cfg!.kanban.columns).toHaveLength(3);
  });
});

describe('renderPromptTemplate', () => {
  it('substitutes issue variables', () => {
    const result = renderPromptTemplate(SAMPLE_WORKFLOW, SAMPLE_ISSUE, 0);
    expect(result).toContain('PROJ-42');
    expect(result).toContain('Fix login timeout');
    expect(result).toContain('Users are logged out after 5 minutes.');
  });

  it('omits the attempt block when attempt is 0', () => {
    const result = renderPromptTemplate(SAMPLE_WORKFLOW, SAMPLE_ISSUE, 0);
    expect(result).not.toContain('Retry attempt');
  });

  it('includes the attempt block when attempt > 0', () => {
    const result = renderPromptTemplate(SAMPLE_WORKFLOW, SAMPLE_ISSUE, 2);
    expect(result).toContain('Retry attempt #2');
  });
});
