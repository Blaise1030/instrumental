import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useWorktrees } from "./useWorktrees";
import type { ThreadManagementService } from "@/modules/agent/services/threadManagementService";

const { mockGitService, appContextRef } = vi.hoisted(() => {
  const { ref: vueRef } = require("vue") as typeof import("vue");
  const mockGitService = {
    listWorktrees: vi.fn().mockResolvedValue([{ path: "/repo", branch: "main" }]),
    listBranchesExcludingWorktrees: vi.fn().mockResolvedValue(["main", "feat/x"]),
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    checkoutBranch: vi.fn().mockResolvedValue(undefined)
  };
  const appContextRef = vueRef({
    mode: "desktop" as const,
    threadManagementService: {} as unknown as ThreadManagementService,
    gitService: mockGitService
  });
  return { mockGitService, appContextRef };
});

vi.mock("@/app-context/useAppContext", () => ({
  useAppContext: () => appContextRef
}));

describe("useWorktrees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns worktrees for a given cwd", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const TestComponent = defineComponent({
      setup() {
        const cwd = ref("/repo");
        const { data } = useWorktrees(cwd);
        return { data };
      },
      template: "<div>{{ data }}</div>"
    });

    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] }
    });

    await vi.waitFor(() => {
      expect(mockGitService.listWorktrees).toHaveBeenCalledWith("/repo");
    });
  });
});
