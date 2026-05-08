import { defineComponent, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import type { AppNotification } from "@/shared/domain";
import type { NotificationService } from "../../services/notificationService";
import { useNotifications } from "../useNotifications";

const makeNotification = (id: string, read = false): AppNotification => ({
  id,
  threadId: `thread-${id}`,
  projectId: "p1",
  kind: "done",
  threadTitle: `Thread ${id}`,
  projectName: "Project 1",
  read,
  createdAt: new Date().toISOString(),
});

describe("useNotifications", () => {
  let changeCallback: (() => void) | null = null;
  let mockService: NotificationService;
  let storedNotifications: AppNotification[];

  beforeEach(() => {
    changeCallback = null;
    storedNotifications = [makeNotification("a"), makeNotification("b", true)];
    mockService = {
      list: vi.fn(() => Promise.resolve([...storedNotifications])),
      markRead: vi.fn(() => Promise.resolve()),
      markAllRead: vi.fn(() => Promise.resolve()),
      onDidChange: vi.fn((cb: () => void) => {
        changeCallback = cb;
        return () => {
          changeCallback = null;
        };
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountHarness() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const bag = {} as {
      unreadCount: ReturnType<typeof useNotifications>["unreadCount"];
      notifications: ReturnType<typeof useNotifications>["notifications"];
      markRead: ReturnType<typeof useNotifications>["markRead"];
      markAllRead: ReturnType<typeof useNotifications>["markAllRead"];
    };

    const Test = defineComponent({
      setup() {
        const r = useNotifications();
        bag.unreadCount = r.unreadCount;
        bag.notifications = r.notifications;
        bag.markRead = r.markRead;
        bag.markAllRead = r.markAllRead;
        return {};
      },
      template: "<div />",
    });

    mount(Test, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient }]],
        provide: {
          appContext: ref({
            mode: "desktop" as const,
            notificationService: mockService,
            gitService: {} as never,
            threadManagementService: {} as never,
            workspaceService: {} as never,
          }),
        },
      },
    });

    return bag;
  }

  it("fetches notifications on mount", async () => {
    mountHarness();
    await flushPromises();
    expect(mockService.list).toHaveBeenCalledTimes(1);
  });

  it("computes unreadCount from unread notifications", async () => {
    const { unreadCount } = mountHarness();
    await flushPromises();
    expect(unreadCount.value).toBe(1); // only "a" is unread
  });

  it("registers onDidChange listener on mount", async () => {
    mountHarness();
    await flushPromises();
    expect(mockService.onDidChange).toHaveBeenCalledTimes(1);
    expect(changeCallback).not.toBeNull();
  });

  it("re-fetches when onDidChange fires", async () => {
    mountHarness();
    await flushPromises();
    expect(mockService.list).toHaveBeenCalledTimes(1);

    changeCallback!();
    await flushPromises();
    expect(mockService.list).toHaveBeenCalledTimes(2);
  });

  it("markRead calls service with the id", async () => {
    const { markRead } = mountHarness();
    await flushPromises();
    await markRead("a");
    expect(mockService.markRead).toHaveBeenCalledWith("a");
  });

  it("markAllRead calls service", async () => {
    const { markAllRead } = mountHarness();
    await flushPromises();
    await markAllRead();
    expect(mockService.markAllRead).toHaveBeenCalledTimes(1);
  });
});
