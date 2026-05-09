<script setup lang="ts">
import { computed, ref } from "vue";
import { useVirtualList } from "@vueuse/core";
import { useRouter } from "vue-router";
import { Bell, CheckCircle2, Eye, XCircle } from "lucide-vue-next";
import { useNotifications } from "../composables/useNotifications";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { encodeBranch } from "@/router/branchParam";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import type { AppNotificationKind } from "@/shared/domain";
import type { ThreadAgent } from "@shared/domain";

const ITEM_HEIGHT = 48;

const router = useRouter();
const workspace = useWorkspaceStore();
const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
const open = ref(false);

const hasUnread = computed(() => unreadCount.value > 0);

const items = computed(() => notifications.value ?? []);

const { list, containerProps, wrapperProps } = useVirtualList(items, {
  itemHeight: ITEM_HEIGHT,
  overscan: 3,
});

const kindStatusIcon: Record<AppNotificationKind, typeof CheckCircle2> = {
  done: CheckCircle2,
  needsReview: Eye,
  failed: XCircle,
};

const kindStatusClass: Record<AppNotificationKind, string> = {
  done: "text-green-500",
  needsReview: "text-yellow-500",
  failed: "text-red-500",
};

const kindLabel: Record<AppNotificationKind, string> = {
  done: "Completed",
  needsReview: "Needs review",
  failed: "Failed",
};

function agentFor(threadId: string): ThreadAgent {
  return workspace.threads.find((t) => t.id === threadId)?.agent ?? "claude";
}

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
  if (!thread?.createdBranch) return;
  void router.push({
    name: "agent",
    params: { projectId, branch: encodeBranch(thread.createdBranch), threadId },
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
        >
          {{ unreadCount > 9 ? "9+" : unreadCount }}
        </span>
      </Button>
    </PopoverTrigger>

    <PopoverContent
      side="top"
      align="end"      
      class="p-0 gap-0"
      data-testid="notification-popover-content"
    >
      <div class="flex items-center justify-between border-b px-2.5 py-1.5">
        <span class="text-xs font-medium">Notifications</span>
        <Button v-if="hasUnread" variant="ghost" size="xs" @click="markAllRead">
          Mark all read
        </Button>
      </div>

      <template v-if="items.length">
        <div v-bind="containerProps" class="max-h-72 p-2">
          <div v-bind="wrapperProps">
            <button
              v-for="{ data: n } in list"
              :key="n.id"
              :style="{ height: `${ITEM_HEIGHT}px` }"
              class="flex w-full rounded-sm items-start gap-2 px-2.5 py-2 text-left hover:bg-muted"
              @click="handleClick(n.id, n.threadId, n.projectId)"
            >
              <!-- Agent icon with unread dot -->
              <div class="relative mt-0.5 shrink-0">
                <AgentIcon :agent="agentFor(n.threadId)" :size="14" class="text-foreground" />
                <span
                  v-if="!n.read"
                  class="absolute -right-1 -top-1 size-1.5 rounded-full bg-primary"
                />
              </div>

              <!-- Title + description -->
              <div class="min-w-0 flex-1 overflow-hidden">
                <p class="truncate text-xs font-medium leading-tight">{{ n.threadTitle }}</p>
                <p class="truncate text-[11px] leading-tight text-muted-foreground">{{ kindLabel[n.kind] }} · {{ n.projectName }}</p>
              </div>

              <!-- Status icon + timestamp -->
              <div class="flex shrink-0 flex-col items-end gap-0.5">
                <component
                  :is="kindStatusIcon[n.kind]"
                  class="size-3.5"
                  :class="kindStatusClass[n.kind]"
                  aria-hidden="true"
                />
                <span class="text-[11px] text-muted-foreground">{{ relativeTime(n.createdAt) }}</span>
              </div>
            </button>
          </div>
        </div>
      </template>

      <p v-else class="px-2 py-4 text-center text-xs text-muted-foreground">
        No notifications
      </p>
    </PopoverContent>
  </Popover>
</template>
