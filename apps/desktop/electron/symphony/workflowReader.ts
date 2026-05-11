import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { SymphonyConfig, TrackerIssue } from './types.js';

export function readWorkflowConfig(repoPath: string): SymphonyConfig | null {
  const filePath = path.join(repoPath, 'WORKFLOW.md');
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  try {
    const config = yaml.load(match[1]) as SymphonyConfig;
    if (!config?.tracker?.kind || !config?.agent?.on_complete) return null;
    return config;
  } catch {
    return null;
  }
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

  if (attempt > 0) {
    body = body.replace(/\{%-?\s*if attempt\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g, '$1');
  } else {
    body = body.replace(/\{%-?\s*if attempt\s*-?%\}[\s\S]*?\{%-?\s*endif\s*-?%\}/g, '');
  }

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
