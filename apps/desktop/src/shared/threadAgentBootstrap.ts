import type { ThreadAgent } from "./domain";

/**
 * Command injected into a new thread’s PTY once (plus Enter), after `ptyCreate`.
 * Matches the Electron run adapters where applicable; edit for your PATH and CLI versions.
 *
 * @see electron/adapters/claudeCodeCliAdapter.ts (`claude`)
 * @see electron/adapters/codexCliAdapter.ts (`codex`)
 * @see electron/adapters/cursorCliAdapter.ts (`cursor`)
 * @see electron/adapters/geminiCliAdapter.ts (`gemini`)
 */
export const THREAD_AGENT_BOOTSTRAP_COMMAND: Record<ThreadAgent, string> = {
  claude: "claude",
  codex: "codex",
  /** Google Gemini CLI — https://github.com/google-gemini/gemini-cli */
  gemini: "gemini",
  /**
   * Cursor CLI / agent entrypoint varies by install (`cursor`, `cursor-agent`, etc.).
   */
  cursor: "cursor agent"
};

/**
 * Resume line built from the user’s configured bootstrap command (settings / localStorage)
 * plus provider-specific resume spelling — same flags as {@link threadAgentResumeCommand}.
 */
export function threadAgentResumeCommandLine(
  baseCommand: string,
  agent: ThreadAgent,
  resumeId: string
): string {
  const base = baseCommand.trim();
  switch (agent) {
    case "claude":
      return `${base} --resume ${resumeId}`;
    case "cursor":
      return `${base} --resume=${resumeId}`;
    /** Codex CLI uses `resume` as a subcommand, not `--resume`. */
    case "codex":
      return `${base} resume ${resumeId}`;
    case "gemini":
      return `${base} --resume ${resumeId}`;
  }
}

/**
 * Shell command to resume a previously interrupted agent session by its stored resume ID.
 * The command is typed into the PTY shell (plus Enter) when re-opening a resumable thread.
 * Uses app default entrypoints; prefer {@link threadAgentResumeCommandLine} when applying settings.
 */
export function threadAgentResumeCommand(agent: ThreadAgent, resumeId: string): string {
  return threadAgentResumeCommandLine(THREAD_AGENT_BOOTSTRAP_COMMAND[agent], agent, resumeId);
}
