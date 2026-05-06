import { describe, expect, it } from "vitest";
import { threadAgentResumeCommand, threadAgentResumeCommandLine } from "../threadAgentBootstrap";

const sampleId = "3f8b9ee0-ae66-4e51-af69-ed99b7e15841";

describe("threadAgentResumeCommandLine", () => {
  it("appends resume flags to a custom bootstrap command", () => {
    expect(threadAgentResumeCommandLine("/opt/bin/claude", "claude", sampleId)).toBe(
      `/opt/bin/claude --resume ${sampleId}`
    );
    expect(threadAgentResumeCommandLine("cursor-agent", "cursor", sampleId)).toBe(
      `cursor-agent --resume=${sampleId}`
    );
    expect(threadAgentResumeCommandLine("codex", "codex", sampleId)).toBe(`codex resume ${sampleId}`);
  });
});

describe("threadAgentResumeCommand", () => {
  it("uses provider-specific resume spelling", () => {
    expect(threadAgentResumeCommand("gemini", sampleId)).toBe(`gemini --resume ${sampleId}`);
    expect(threadAgentResumeCommand("claude", sampleId)).toBe(`claude --resume ${sampleId}`);
    expect(threadAgentResumeCommand("codex", sampleId)).toBe(`codex resume ${sampleId}`);
    expect(threadAgentResumeCommand("cursor", sampleId)).toBe(`cursor agent --resume=${sampleId}`);
  });
});
