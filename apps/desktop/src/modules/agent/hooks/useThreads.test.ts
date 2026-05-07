import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useThreads } from "./useThreads";
import type { GitService } from "@/modules/git/services/gitService";
import type { ThreadManagementService } from "@/modules/agent/services/threadManagementService";

const { mockThreadManagementService, appContextRef } = vi.hoisted(() => {
  const { ref: vueRef } = require("vue") as typeof import("vue");
  const mockThreadManagementService = {
    loadThreads: vi.fn().mockResolvedValue([
      { id: "t-1", projectId: "proj-1", title: "Thread 1" },
    ]),
    createThread: vi.fn().mockResolvedValue({ id: "t-2", projectId: "proj-1", title: "" }),
    removeThread: vi.fn().mockResolvedValue(undefined),
    updateThreadName: vi.fn().mockResolvedValue(undefined),
    getThread: vi.fn().mockResolvedValue(null),
    updateThread: vi.fn().mockResolvedValue(undefined),
  };
  const appContextRef = vueRef({
    mode: "desktop" as const,
    threadManagementService: mockThreadManagementService as unknown as ThreadManagementService,
    gitService: {} as unknown as GitService,
  });
  return { mockThreadManagementService, appContextRef };
});

vi.mock("@/app-context/useAppContext", () => ({
  useAppContext: () => appContextRef,
}));

describe("useThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads threads for a project", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const TestComponent = defineComponent({
      setup() {
        const projectId = ref("proj-1");
        const { data } = useThreads(projectId);
        return { data };
      },
      template: "<div />",
    });

    mount(TestComponent, {
      global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    });

    await vi.waitFor(() => {
      expect(mockThreadManagementService.loadThreads).toHaveBeenCalledWith("proj-1");
    });
  });
});
