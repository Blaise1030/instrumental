import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import {
  worktreeBranchNameContextLabel,
  type WorktreeContextLabelSource
} from "../workspaceStore";

describe("workspaceStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("worktreeBranchNameContextLabel joins branch and worktree name when they differ", () => {
    const wt: WorktreeContextLabelSource = {
      name: "Auth UI",
      branch: "feat/auth"
    };
    expect(worktreeBranchNameContextLabel(wt)).toBe("feat/auth · Auth UI");
  });
});
