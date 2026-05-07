import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useScm } from "./useScm";
import type { ThreadManagementService } from "@/modules/agent/services/threadManagementService";
import type { RepoScmSnapshot } from "@shared/ipc";

const { mockGitService, appContextRef, mockSnapshot } = vi.hoisted(() => {
  const { ref: vueRef } = require("vue") as typeof import("vue");
  const snapshot: RepoScmSnapshot = {
    entries: [
      { path: "src/foo.ts", originalPath: null, stagedKind: "modified", unstagedKind: null, isUntracked: false },
    ],
    branch: "main",
    shortLabel: "main",
    lastCommitSubject: "initial commit",
  };
  const mockGitService = {
    listWorktrees: vi.fn().mockResolvedValue([]),
    listBranchesExcludingWorktrees: vi.fn().mockResolvedValue([]),
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    checkoutBranch: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue(snapshot),
    stagePaths: vi.fn().mockResolvedValue(undefined),
    stageAll: vi.fn().mockResolvedValue(undefined),
    unstagePaths: vi.fn().mockResolvedValue(undefined),
    unstageAll: vi.fn().mockResolvedValue(undefined),
    discardPaths: vi.fn().mockResolvedValue(undefined),
    discardAll: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
  };
  const appContextRef = vueRef({
    mode: "desktop" as const,
    threadManagementService: {} as unknown as ThreadManagementService,
    gitService: mockGitService,
  });
  return { mockGitService, appContextRef, mockSnapshot: snapshot };
});

vi.mock("@/app-context/useAppContext", () => ({
  useAppContext: () => appContextRef,
}));

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("useScm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches repo status for a given cwd", async () => {
    const queryClient = makeQueryClient();
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        const scm = useScm(cwd);
        return { scm };
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await vi.waitFor(() => {
      expect(mockGitService.getStatus).toHaveBeenCalledWith("/repo");
    });
  });

  it("exposes repoStatus entries from snapshot", async () => {
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return { scm: capturedScm };
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await vi.waitFor(() => {
      expect(capturedScm!.repoStatus.value).toEqual(mockSnapshot.entries);
    });
  });

  it("exposes hasGitRepository as true when snapshot returned", async () => {
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return {};
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await vi.waitFor(() => {
      expect(capturedScm!.hasGitRepository.value).toBe(true);
    });
  });

  it("exposes hasGitRepository as false when getStatus returns null", async () => {
    mockGitService.getStatus.mockResolvedValueOnce(null);
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return {};
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await vi.waitFor(() => {
      expect(capturedScm!.hasGitRepository.value).toBe(false);
    });
  });

  it("stagePaths mutation calls gitService.stagePaths", async () => {
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return {};
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await capturedScm!.stagePaths.mutateAsync(["src/foo.ts"]);
    expect(mockGitService.stagePaths).toHaveBeenCalledWith("/repo", ["src/foo.ts"]);
  });

  it("commit mutation calls gitService.commit", async () => {
    const queryClient = makeQueryClient();
    let capturedScm: ReturnType<typeof useScm> | undefined;
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        capturedScm = useScm(cwd);
        return {};
      },
      template: "<div />",
    });
    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });
    await capturedScm!.commit.mutateAsync("feat: add something");
    expect(mockGitService.commit).toHaveBeenCalledWith("/repo", "feat: add something");
  });
});
