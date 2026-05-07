import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/MonacoDiffEditor.vue", () => ({
  default: { name: "MonacoDiffEditorStub", template: "<div />" }
}));

const { appContextRef } = vi.hoisted(() => {
  const { ref: vueRef } = require("vue") as typeof import("vue");
  const mockGitService = {
    listWorktrees: vi.fn().mockResolvedValue([]),
    listBranchesExcludingWorktrees: vi.fn().mockResolvedValue([]),
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    checkoutBranch: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue(null),
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
    threadManagementService: {},
    gitService: mockGitService,
  });
  return { appContextRef };
});

vi.mock("@/app-context/useAppContext", () => ({
  useAppContext: () => appContextRef,
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("@/composables/useActiveWorkspace", () => {
  const { computed } = require("vue") as typeof import("vue");
  return {
    useActiveWorkspace: () => ({
      activeWorktree: computed(() => undefined),
    }),
  };
});

import SourceControlPanel from "@/modules/git/components/SourceControlPanel.vue";

const baseProps = {};

/** Shallow mount stubs children; forward slots so SCM chrome (header button, etc.) stays testable. */
const scmSidebarStubs = {
  SidebarProvider: { template: "<div><slot /></div>" },
  SidebarInset: { template: "<div><slot /></div>" },
  Sidebar: { template: "<aside><slot /></aside>" },
  SidebarHeader: { template: "<header><slot /></header>" },
  SidebarContent: { template: "<div><slot /></div>" },
  SidebarFooter: { template: "<footer><slot /></footer>" },
};

function mountPanel(props: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(SourceControlPanel, {
    shallow: true,
    props: { ...baseProps, ...props },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: scmSidebarStubs,
    },
  });
}

describe("SourceControlPanel local LLM controls", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("does not render Suggest when feature flag is off", () => {
    const wrapper = mountPanel({
      suggestCommitAvailable: false,
    });
    expect(wrapper.find('[data-testid="scm-suggest-commit"]').exists()).toBe(false);
  });

  it("still does not render Suggest even when available and WebGPU is ok", () => {
    const wrapper = mountPanel({
      suggestCommitAvailable: true,
      suggestCommitGpuOk: true,
    });
    expect(wrapper.find('[data-testid="scm-suggest-commit"]').exists()).toBe(false);
  });

  it("renders thread sidebar expand control when requested", () => {
    const wrapper = mountPanel({
      showThreadSidebarExpand: true,
    });
    expect(wrapper.find('[data-testid="scm-thread-sidebar-expand"]').exists()).toBe(true);
  });

  it("emits expandThreadSidebar from the header control", async () => {
    const wrapper = mountPanel({
      showThreadSidebarExpand: true,
    });
    await wrapper.get('[data-testid="scm-thread-sidebar-expand"]').trigger("click");
    expect(wrapper.emitted("expandThreadSidebar")).toEqual([[]]);
  });
});
