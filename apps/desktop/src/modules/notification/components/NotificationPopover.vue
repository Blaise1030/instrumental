<script setup lang="ts">
import { computed, ref } from "vue";
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
import {
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import type { AppNotificationKind } from "@/shared/domain";
import type { ThreadAgent } from "@shared/domain";

const router = useRouter();
const workspace = useWorkspaceStore();
const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
const open = ref(false);

const hasUnread = computed(() => unreadCount.value > 0);

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
  done: "Thread completed",
  needsReview: "Needs your review",
  failed: "Thread failed",
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
      class="w-64 p-0"
      data-testid="notification-popover-content"
    >
      <div class="flex items-center justify-between border-b px-3 py-2">
        <span class="text-sm font-medium">Notifications</span>
        <Button v-if="hasUnread" variant="ghost" size="xs" @click="markAllRead">
          Mark all read
        </Button>
      </div>

      <div class="max-h-80 overflow-y-auto p-1">
        <template v-if="notifications?.length">
          <Button
            v-for="n in notifications"
            :key="n.id"
            variant="ghost"
            class="h-auto w-full justify-start gap-2.5 whitespace-normal px-2 py-2"
            @click="handleClick(n.id, n.threadId, n.projectId)"
          >
            <!-- Agent icon with unread dot -->
            <div class="relative shrink-0">
              <div class="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <AgentIcon :agent="agentFor(n.threadId)" :size="16" />
              </div>
              <span
                v-if="!n.read"
                class="absolute -left-0.5 -top-0.5 size-2.5 rounded-full border-2 border-popover bg-primary"
              />
            </div>

            <!-- Title + description -->
            <ItemContent class="min-w-0">
              <ItemTitle class="truncate">{{ n.threadTitle }}</ItemTitle>
              <ItemDescription class="truncate">{{ kindLabel[n.kind] }} · {{ n.projectName }}</ItemDescription>
            </ItemContent>

            <!-- Status icon + timestamp -->
            <ItemContent class="flex-none items-end">
              <component
                :is="kindStatusIcon[n.kind]"
                class="size-4 shrink-0"
                :class="kindStatusClass[n.kind]"
                aria-hidden="true"
              />
              <ItemDescription>{{ relativeTime(n.createdAt) }}</ItemDescription>
            </ItemContent>
          </Button>
        </template>

        <p v-else class="px-3 py-6 text-center text-sm text-muted-foreground">
          No notifications
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>
