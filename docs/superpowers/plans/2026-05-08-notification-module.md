# Notification Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `NotificationService` to `AppContext` and a bell-icon popup in the sidebar footer that shows thread completion notifications fetched via TanStack Query.

**Architecture:** Create a `NotificationService` interface + `IpcNotificationService` adapter (matching the `IpcGitService` pattern), wire it into `AppContext`, expose it through a `useNotifications` composable backed by TanStack Query, and render it in a `NotificationPopover` component inside `Layout.vue`'s `SidebarFooter`. The backend IPC layer (`notificationApi` on `window`) already exists.

**Tech Stack:** Vue 3 Composition API, TanStack Vue Query, Vitest + `@vue/test-utils`, lucide-vue-next icons, existing `ui/popover` + `ui/button` + `ui/badge` components.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/desktop/src/modules/notification/services/notificationService.ts` | Interface contract |
| Create | `apps/desktop/src/modules/notification/services/ipcNotificationService.ts` | Electron IPC adapter |
| Create | `apps/desktop/src/modules/notification/composables/useNotifications.ts` | TanStack Query + change listener |
| Create | `apps/desktop/src/modules/notification/composables/__tests__/useNotifications.test.ts` | Composable tests |
| Create | `apps/desktop/src/modules/notification/components/NotificationPopover.vue` | Bell icon + popover UI |
| Modify | `apps/desktop/src/app-context/type.ts` | Add `notificationService` field |
| Modify | `apps/desktop/src/app-context/AppContext.vue` | Instantiate `IpcNotificationService` |
| Modify | `apps/desktop/src/layouts/Layout.vue` | Add `NotificationPopover` to `SidebarFooter` |

---

## Task 1: NotificationService interface + IpcNotificationService adapter

**Files:**
- Create: `apps/desktop/src/modules/notification/services/notificationService.ts`
- Create: `apps/desktop/src/modules/notification/services/ipcNotificationService.ts`

- [ ] **Step 1: Create the NotificationService interface**

Create `apps/desktop/src/modules/notification/services/notificationService.ts`:

```ts
import type { AppNotification } from "@/shared/domain";

export interface NotificationService {
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  /** Registers a callback fired when notifications change. Returns an unsubscribe function. */
  onDidChange(cb: () => void): () => void;
}
```

- [ ] **Step 2: Create the IpcNotificationService implementation**

Create `apps/desktop/src/modules/notification/services/ipcNotificationService.ts`:

```ts
import type { AppNotification } from "@/shared/domain";
import type { NotificationService } from "./notificationService";

type NotificationApi = {
  getNotifications: () => Promise<AppNotification[]>;
  markRead: (payload: { id: string }) => Promise<void>;
  markAllRead: () => Promise<void>;
  onNotificationsChanged: (callback: () => void) => () => void;
};

function readNotificationApi(): NotificationApi | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as typeof globalThis & { notificationApi?: NotificationApi }).notificationApi;
}

export class IpcNotificationService implements NotificationService {
  constructor(private readonly api: NotificationApi | undefined = readNotificationApi()) {}

  private requireApi(): NotificationApi {
    if (!this.api) throw new Error("notificationApi is not available.");
    return this.api;
  }

  async list(): Promise<AppNotification[]> {
    return this.requireApi().getNotifications();
  }

  async markRead(id: string): Promise<void> {
    return this.requireApi().markRead({ id });
  }

  async markAllRead(): Promise<void> {
    return this.requireApi().markAllRead();
  }

  onDidChange(cb: () => void): () => void {
    return this.requireApi().onNotificationsChanged(cb);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/modules/notification/services/notificationService.ts \
        apps/desktop/src/modules/notification/services/ipcNotificationService.ts
git commit -m "feat(notification): add NotificationService interface and IpcNotificationService adapter"
```

---

## Task 2: Wire NotificationService into AppContext

**Files:**
- Modify: `apps/desktop/src/app-context/type.ts`
- Modify: `apps/desktop/src/app-context/AppContext.vue`

- [ ] **Step 1: Add `notificationService` to the AppContext type**

Open `apps/desktop/src/app-context/type.ts`. The current content:

```ts
import type { GitService } from "@/modules/git/services/gitService";
import type { ThreadManagementService } from "@/modules/agent/services/threadManagementService";
import type { WorkspaceService } from "./workspaceService";

export type AppMode = "desktop" | "mobile" | "cloud";

export type AppContext = {
  mode: AppMode;
  threadManagementService: ThreadManagementService;
  gitService: GitService;
  workspaceService: WorkspaceService;
};
```

Add the new field:

```ts
import type { GitService } from "@/modules/git/services/gitService";
import type { ThreadManagementService } from "@/modules/agent/services/threadManagementService";
import type { WorkspaceService } from "./workspaceService";
import type { NotificationService } from "@/modules/notification/services/notificationService";

export type AppMode = "desktop" | "mobile" | "cloud";

export type AppContext = {
  mode: AppMode;
  threadManagementService: ThreadManagementService;
  gitService: GitService;
  workspaceService: WorkspaceService;
  notificationService: NotificationService;
};
```

- [ ] **Step 2: Instantiate IpcNotificationService in AppContext.vue**

Open `apps/desktop/src/app-context/AppContext.vue`. Current content:

```vue
<template>
    <slot />
</template>

<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import type { AppContext, AppMode } from './type';
import { IpcGitService } from "@/modules/git/services/ipcGitService";
import { IpcThreadManagementService } from "@/modules/agent/services/ipcThreadManagementService";
import { IpcWorkspaceService } from "./ipcWorkspaceService";

const props = defineProps<{ mode: AppMode }>();
const services = ref<AppContext>();

onMounted(() => {
  if (props.mode === "desktop") {
    services.value = {
      mode: props.mode,
      threadManagementService: new IpcThreadManagementService(),
      gitService: new IpcGitService(),
      workspaceService: new IpcWorkspaceService(),
    };
  }
});

provide('appContext', services)
</script>
```

Add the import and instantiation:

```vue
<template>
    <slot />
</template>

<script setup lang="ts">
import { onMounted, provide, ref } from 'vue';
import type { AppContext, AppMode } from './type';
import { IpcGitService } from "@/modules/git/services/ipcGitService";
import { IpcThreadManagementService } from "@/modules/agent/services/ipcThreadManagementService";
import { IpcWorkspaceService } from "./ipcWorkspaceService";
import { IpcNotificationService } from "@/modules/notification/services/ipcNotificationService";

const props = defineProps<{ mode: AppMode }>();
const services = ref<AppContext>();

onMounted(() => {
  if (props.mode === "desktop") {
    services.value = {
      mode: props.mode,
      threadManagementService: new IpcThreadManagementService(),
      gitService: new IpcGitService(),
      workspaceService: new IpcWorkspaceService(),
      notificationService: new IpcNotificationService(),
    };
  }
});

provide('appContext', services)
</script>
```

- [ ] **Step 3: Run typecheck to verify no errors**

```bash
cd apps/desktop && npm run typecheck
```

Expected: no errors related to `AppContext` or `notificationService`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/app-context/type.ts \
        apps/desktop/src/app-context/AppContext.vue
git commit -m "feat(notification): wire NotificationService into AppContext"
```

---

## Task 3: useNotifications composable + tests

**Files:**
- Create: `apps/desktop/src/modules/notification/composables/useNotifications.ts`
- Create: `apps/desktop/src/modules/notification/composables/__tests__/useNotifications.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src/modules/notification/composables/__tests__/useNotifications.test.ts`:

```ts
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
        return () => { changeCallback = null; };
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/desktop && npm run test -- modules/notification
```

Expected: FAIL — `useNotifications` not found.

- [ ] **Step 3: Implement useNotifications**

Create `apps/desktop/src/modules/notification/composables/useNotifications.ts`:

```ts
import { computed, onMounted, onUnmounted } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useAppContext } from "@/app-context/useAppContext";

const QUERY_KEY = ["notifications"] as const;

export function useNotifications() {
  const appContext = useAppContext();
  const queryClient = useQueryClient();

  const notificationService = computed(() => appContext.value?.notificationService);

  const { data: notifications } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => notificationService.value!.list(),
    enabled: computed(() => !!notificationService.value),
  });

  const unreadCount = computed(
    () => notifications.value?.filter((n) => !n.read).length ?? 0,
  );

  let unsub: (() => void) | null = null;

  onMounted(() => {
    const service = notificationService.value;
    if (!service) return;
    unsub = service.onDidChange(() => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    });
  });

  onUnmounted(() => {
    unsub?.();
  });

  async function markRead(id: string): Promise<void> {
    await notificationService.value?.markRead(id);
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function markAllRead(): Promise<void> {
    await notificationService.value?.markAllRead();
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  return { notifications, unreadCount, markRead, markAllRead };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && npm run test -- modules/notification
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/notification/composables/useNotifications.ts \
        apps/desktop/src/modules/notification/composables/__tests__/useNotifications.test.ts
git commit -m "feat(notification): add useNotifications composable with TanStack Query"
```

---

## Task 4: NotificationPopover component + Layout.vue integration

**Files:**
- Create: `apps/desktop/src/modules/notification/components/NotificationPopover.vue`
- Modify: `apps/desktop/src/layouts/Layout.vue`

- [ ] **Step 1: Create NotificationPopover.vue**

Create `apps/desktop/src/modules/notification/components/NotificationPopover.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Bell, Check, Eye, X } from "lucide-vue-next";
import { useNotifications } from "../composables/useNotifications";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { encodeBranch } from "@/router/branchParam";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AppNotificationKind } from "@/shared/domain";

const router = useRouter();
const workspace = useWorkspaceStore();
const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
const open = ref(false);

const hasUnread = computed(() => unreadCount.value > 0);

const kindIcon: Record<AppNotificationKind, typeof Check> = {
  done: Check,
  needsReview: Eye,
  failed: X,
};

const kindClass: Record<AppNotificationKind, string> = {
  done: "text-green-500",
  needsReview: "text-yellow-500",
  failed: "text-red-500",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function handleClick(id: string, threadId: string, projectId: string): Promise<void> {
  open.value = false;
  await markRead(id);
  const thread = workspace.threads.find((t) => t.id === threadId);
  if (!thread) return;
  const wt = workspace.worktrees.find((w) => w.id === thread.worktreeId);
  if (!wt) return;
  void router.push({
    name: "agent",
    params: { projectId, branch: encodeBranch(wt.branch), threadId },
  });
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        class="relative shrink-0"
        aria-label="Notifications"
        data-testid="notification-popover-trigger"
      >
        <Bell class="size-3" aria-hidden="true" />
        <span
          v-if="hasUnread"
          class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-medium text-primary-foreground"
          aria-label="`${unreadCount} unread notifications`"
        >
          {{ unreadCount > 9 ? "9+" : unreadCount }}
        </span>
      </Button>
    </PopoverTrigger>

    <PopoverContent
      side="top"
      align="end"
      class="w-80 p-0"
      data-testid="notification-popover-content"
    >
      <div class="flex items-center justify-between border-b px-3 py-2">
        <span class="text-sm font-medium">Notifications</span>
        <button
          v-if="hasUnread"
          class="text-xs text-muted-foreground hover:text-foreground"
          @click="markAllRead"
        >
          Mark all read
        </button>
      </div>

      <div class="max-h-80 overflow-y-auto">
        <template v-if="notifications?.length">
          <button
            v-for="n in notifications"
            :key="n.id"
            class="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
            :class="{ 'bg-accent/50': !n.read }"
            @click="handleClick(n.id, n.threadId, n.projectId)"
          >
            <component
              :is="kindIcon[n.kind]"
              class="mt-0.5 size-4 shrink-0"
              :class="kindClass[n.kind]"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ n.threadTitle }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ n.projectName }}</p>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ relativeTime(n.createdAt) }}
            </span>
          </button>
        </template>

        <p v-else class="px-3 py-6 text-center text-sm text-muted-foreground">
          No notifications
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
```

- [ ] **Step 2: Add NotificationPopover to Layout.vue SidebarFooter**

In `apps/desktop/src/layouts/Layout.vue`, add the import at the top of the `<script setup>` block after the existing imports:

```ts
import NotificationPopover from "@/modules/notification/components/NotificationPopover.vue";
```

Find the `<SidebarFooter>` section (around line 632):

```html
<SidebarFooter class="flex flex-row items-center justify-end">
  <Tooltip>
    <TooltipTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        class="shrink-0"
        data-testid="thread-sidebar-footer-terminal"
        @click="openTerminalPanel"
      >
        <Terminal class="size-3" aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top"> Show terminal </TooltipContent>
  </Tooltip>
</SidebarFooter>
```

Add `NotificationPopover` before the Terminal tooltip:

```html
<SidebarFooter class="flex flex-row items-center justify-end gap-1">
  <NotificationPopover />
  <Tooltip>
    <TooltipTrigger as-child>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        class="shrink-0"
        data-testid="thread-sidebar-footer-terminal"
        @click="openTerminalPanel"
      >
        <Terminal class="size-3" aria-hidden="true" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top"> Show terminal </TooltipContent>
  </Tooltip>
</SidebarFooter>
```

Note the added `gap-1` class on `SidebarFooter` to space the two buttons.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/desktop && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd apps/desktop && npm run test
```

Expected: all existing tests still pass, plus the 6 new notification tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/modules/notification/components/NotificationPopover.vue \
        apps/desktop/src/layouts/Layout.vue
git commit -m "feat(notification): add NotificationPopover to sidebar footer"
```
