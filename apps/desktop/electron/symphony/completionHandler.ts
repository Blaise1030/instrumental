import type { SymphonyConfig, TrackerIssue, TrackerAdapter } from './types.js';
import type { DiffService } from '../services/diffService.js';

export interface CompletionContext {
  threadId: string;
  worktreePath: string;
  issue: TrackerIssue;
  config: SymphonyConfig;
  apiKey: string;
  adapter: TrackerAdapter;
  diffService: DiffService;
  githubToken?: string;
}

export class CompletionHandler {
  async handle(ctx: CompletionContext): Promise<{ prUrl: string | null; error: string | null }> {
    const action = ctx.config.agent.on_complete;
    try {
      if (action === 'open_pr') return await this.openPr(ctx);
      if (action === 'commit') return await this.commit(ctx);
      if (action === 'mark_done') return await this.markDone(ctx);
      return { prUrl: null, error: `Unknown on_complete action: ${action}` };
    } catch (err) {
      return { prUrl: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async openPr(ctx: CompletionContext): Promise<{ prUrl: string | null; error: null }> {
    await ctx.diffService.gitPush(ctx.worktreePath);

    if (!ctx.githubToken || ctx.config.tracker.kind !== 'github') {
      return { prUrl: null, error: null };
    }

    const [owner, repo] = ctx.config.tracker.project_slug.split('/');
    const branch = (await ctx.diffService.readAbbrevRefHead(ctx.worktreePath)) ?? 'main';

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: ctx.issue.title,
        head: branch,
        base: 'main',
        body: `Closes ${ctx.issue.url}\n\nAutomated by Symphony.`,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub PR creation failed ${res.status}: ${text}`);
    }

    const pr = (await res.json()) as { html_url: string };
    return { prUrl: pr.html_url, error: null };
  }

  private async commit(ctx: CompletionContext): Promise<{ prUrl: null; error: null }> {
    await ctx.diffService.stageAll(ctx.worktreePath);
    await ctx.diffService.commitStaged(
      ctx.worktreePath,
      `feat: ${ctx.issue.identifier} ${ctx.issue.title} (Symphony)`,
    );
    return { prUrl: null, error: null };
  }

  private async markDone(ctx: CompletionContext): Promise<{ prUrl: null; error: null }> {
    const doneState = ctx.config.tracker.terminal_states[0] ?? 'Done';
    await ctx.adapter.transitionIssue(ctx.issue.id, doneState, ctx.config, ctx.apiKey);
    return { prUrl: null, error: null };
  }
}
