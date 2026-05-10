<script setup lang="ts">
import {
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  MessageSquare,
  Settings,
  SquarePen
} from "lucide-vue-next";
import { computed } from "vue";
import type { LauncherRow } from "@/utils/workspaceLauncherSearch";
import type { ThreadAgent } from "@shared/domain";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const props = defineProps<{ row: LauncherRow }>();

const workspace = useWorkspaceStore();
const active = useActiveWorkspace();

const THREAD_AGENT_LABELS: Record<ThreadAgent, string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

function formatRelativeUpdated(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.round((Date.now() - t) / 1000);
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const threadMetaById = computed(() => {
  const map = new Map<
    string,
    { projectName: string; branchLabel: string; updatedLabel: string }
  >();
  for (const t of active.activeThreads.value) {
    const proj = workspace.projects.find((p) => p.id === t.projectId);
    const branch = t.createdBranch ?? "main";
    map.set(t.id, {
      projectName: proj?.name ?? "Project",
      branchLabel: branch.startsWith("#") ? branch : `#${branch}`,
      updatedLabel: formatRelativeUpdated(t.updatedAt)
    });
  }
  return map;
});

function fileDisplayName(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? relativePath;
}
</script>

<template>
  <template v-if="props.row.kind === 'thread'">
    <MessageSquare class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium">{{ props.row.title }}</div>
      <div class="truncate text-xs text-muted-foreground">
        <template v-if="threadMetaById.get(props.row.id)">
          {{ threadMetaById.get(props.row.id)!.projectName }}
          ·
          {{ threadMetaById.get(props.row.id)!.branchLabel }}
        </template>
        <template v-else>
          {{ THREAD_AGENT_LABELS[props.row.agent] ?? props.row.agent }}
        </template>
      </div>
    </div>
    <span
      v-if="threadMetaById.get(props.row.id)?.updatedLabel"
      class="shrink-0 text-[11px] tabular-nums text-muted-foreground"
    >
      {{ threadMetaById.get(props.row.id)!.updatedLabel }}
    </span>
  </template>
  <template v-else-if="props.row.kind === 'command'">
    <component
      :is="
        props.row.id === 'open-settings'
          ? Settings
          : props.row.id === 'add-project'
            ? FolderPlus
            : SquarePen
      "
      class="size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium">{{ props.row.label }}</div>
      <div v-if="props.row.shortcutHint" class="truncate font-mono text-xs text-muted-foreground">
        {{ props.row.shortcutHint }}
      </div>
    </div>
    <ChevronRight
      v-if="props.row.id === 'new-thread'"
      class="size-4 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  </template>
  <template v-else-if="props.row.kind === 'project'">
    <Folder class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium">{{ props.row.name }}</div>
      <div class="truncate font-mono text-xs text-muted-foreground">{{ props.row.repoPath }}</div>
    </div>
  </template>
  <template v-else-if="props.row.kind === 'worktree'">
    <GitBranch class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium">{{ props.row.branch }}</div>
      <div class="truncate text-xs text-muted-foreground">{{ props.row.name }}</div>
    </div>
  </template>
  <template v-else>
    <FileText class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium">{{ fileDisplayName(props.row.relativePath) }}</div>
      <div class="truncate font-mono text-xs text-muted-foreground">
        {{ props.row.relativePath }}
      </div>
    </div>
  </template>
</template>
