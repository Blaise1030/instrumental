import { describe, expect, it, beforeEach } from "vitest";
import {
  STORAGE_AGENT_PAGE_COMPOSER_VISIBLE,
  resetAgentPageComposerVisibleForTests,
  useAgentPageComposerVisible
} from "../useAgentPageComposerVisible";

describe("useAgentPageComposerVisible", () => {
  beforeEach(() => {
    localStorage.clear();
    resetAgentPageComposerVisibleForTests();
  });

  it("defaults composer visible", () => {
    const { agentPageComposerVisible } = useAgentPageComposerVisible();
    expect(agentPageComposerVisible.value).toBe(true);
  });

  it("persists toggle", () => {
    const { agentPageComposerVisible } = useAgentPageComposerVisible();
    agentPageComposerVisible.value = false;
    expect(localStorage.getItem(STORAGE_AGENT_PAGE_COMPOSER_VISIBLE)).toBe("0");
  });

  it("reads stored value after reset", () => {
    localStorage.setItem(STORAGE_AGENT_PAGE_COMPOSER_VISIBLE, "0");
    resetAgentPageComposerVisibleForTests();
    const { agentPageComposerVisible } = useAgentPageComposerVisible();
    expect(agentPageComposerVisible.value).toBe(false);
  });
});
