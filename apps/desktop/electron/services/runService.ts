import { randomUUID } from "node:crypto";
import { ClaudeCodeCliAdapter } from "../adapters/claudeCodeCliAdapter.js";
import { CodexCliAdapter } from "../adapters/codexCliAdapter.js";
import { CursorCliAdapter } from "../adapters/cursorCliAdapter.js";
import { GeminiCliAdapter } from "../adapters/geminiCliAdapter.js";
import type { AgentAdapter, AgentKind } from "../adapters/types.js";
import { PtyManager } from "../runtime/ptyManager.js";

type OutputListener = (runId: string, chunk: string) => void;
type RunStatus = "running" | "done" | "failed";

export class RunService {
  private pty = new PtyManager();
  private runs = new Map<string, RunStatus>();
  private codex = new CodexCliAdapter();
  private claude = new ClaudeCodeCliAdapter();
  private cursor = new CursorCliAdapter();
  private gemini = new GeminiCliAdapter();

  private adapterFor(agent: AgentKind): AgentAdapter {
    switch (agent) {
      case "codex":
        return this.codex;
      case "claude":
        return this.claude;
      case "cursor":
        return this.cursor;
      case "gemini":
        return this.gemini;
      default: {
        const _exhaustive: never = agent;
        return _exhaustive;
      }
    }
  }

  start(agent: AgentKind, cwd: string, prompt: string, onOutput: OutputListener): string {
    const runId = randomUUID();
    const adapter = this.adapterFor(agent);
    const command = adapter.command({ cwd, prompt, threadId: runId });

    const session = this.pty.start(runId, command.file, command.args, cwd, (chunk) => {
      onOutput(runId, chunk);
    });
    this.runs.set(runId, "running");
    session.process.onExit(({ exitCode }) => {
      this.runs.set(runId, exitCode === 0 ? "done" : "failed");
    });
    return runId;
  }

  getRunStatus(runId: string): RunStatus | null {
    return this.runs.get(runId) ?? null;
  }

  sendInput(runId: string, input: string): void {
    this.pty.write(runId, `${input}\r`);
  }

  interrupt(runId: string): void {
    this.pty.interrupt(runId);
  }

  stop(runId: string): void {
    this.pty.stop(runId);
  }
}
