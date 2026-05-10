import type { ThreadAgent } from "@shared/domain";
import type { TerminalActivitySensitivity } from "@/terminal/activitySensitivity";

export const SETTINGS_AGENT_ROWS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

export const SETTINGS_TERMINAL_SENSITIVITY_OPTIONS: {
  value: TerminalActivitySensitivity;
  label: string;
  hint: string;
}[] = [
  { value: "low", label: "Low", hint: "Any visible output counts as activity." },
  { value: "medium", label: "Medium", hint: "Requires short text, ignores tiny blips." },
  { value: "high", label: "High", hint: "Only substantial output counts as activity." }
];
