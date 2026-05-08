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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
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

      <div class="max-h-80 overflow-y-auto p-1">
        <template v-if="notifications?.length">
          <Item
            v-for="n in notifications"
            :key="n.id"
            as="button"
            size="sm"
            :class="{ 'bg-accent/40': !n.read }"
            class="w-full cursor-pointer"
            @click="handleClick(n.id, n.threadId, n.projectId)"
          >
            <ItemMedia variant="icon">
              <component
                :is="kindIcon[n.kind]"
                :class="kindClass[n.kind]"
                aria-hidden="true"
              />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{{ n.threadTitle }}</ItemTitle>
              <ItemDescription>{{ n.projectName }}</ItemDescription>
            </ItemContent>
            <ItemContent class="flex-none text-right">
              <span class="text-xs text-muted-foreground">{{ relativeTime(n.createdAt) }}</span>
            </ItemContent>
          </Item>
        </template>

        <p v-else class="px-3 py-6 text-center text-sm text-muted-foreground">
          No notifications
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
