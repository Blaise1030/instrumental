<script setup lang="ts">
import { computed } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { useAppContext } from "@/app-context/useAppContext";
import ThreadInlinePromptEditor from "@/modules/agent/components/ThreadInlinePromptEditor.vue";
import { useAgentBootstrapCommands } from "@/modules/agent/hooks/useAgentBootstrapCommands";
import { decodeBranch, encodeBranch } from "@/router/branchParam";
import { stashPendingAgentBootstrap } from "@/modules/agent/utils/pendingAgentBootstrapSession";
import { useWorkspaceStore, worktreeBranchNameContextLabel, type WorktreeSummary } from "@/stores/workspaceStore";
import type { Thread, ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import type { WorkspaceSnapshot } from "@shared/ipc";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";

const THREAD_AGENT_LABELS: Record<ThreadAgent, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
  gemini: "Gemini"
};

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const appContext = useAppContext();
const workspace = useWorkspaceStore();
const { bootstrapCommandLineWithPrompt } = useAgentBootstrapCommands();

const projectId = computed(() => route.params.projectId as string);
const branchParam = computed(() => route.params.branch as string);
const decodedBranch = computed(() => decodeBranch(branchParam.value));

const project = computed(() => workspace.projects.find((p) => p.id === projectId.value));

const threadForBranch = computed(() => {
  const pid = projectId.value;
  const branch = decodedBranch.value;
  return workspace.threads.find((t) => t.projectId === pid && t.createdBranch === branch);
});

const repoPath = computed(() => project.value?.repoPath ?? "");

const { data: gitWorktrees, isPending: gitWorktreesPending, isError: gitWorktreesError } = useQuery({
  queryKey: ["createNewThread", "gitWorktrees", repoPath],
  enabled: computed(
    () =>
      Boolean(appContext.value.gitService && repoPath.value) &&
      !threadForBranch.value
  ),
  queryFn: () => appContext.value.gitService.listWorktrees(repoPath.value)
});

const worktree = computed<WorktreeSummary | null>(() => {
  const pid = projectId.value;
  const branch = decodedBranch.value;
  const thread = threadForBranch.value;
  if (thread) {
    const proj = project.value;
    const isDefault = thread.worktreePath === proj?.repoPath;
    return { path: thread.worktreePath, id: thread.worktreePath, branch, isDefault, projectId: pid };
  }
  const entry = (gitWorktrees.value ?? []).find((w) => w.branch === branch);
  if (!entry) return null;
  const proj = project.value;
  const isDefault = entry.path === proj?.repoPath;
  return { path: entry.path, id: entry.path, branch, isDefault, projectId: pid };
});

const awaitingGitWorktrees = computed(
  () => !threadForBranch.value && Boolean(repoPath.value && appContext.value.gitService && gitWorktreesPending.value)
);

const threadContextLabel = computed(() =>
  worktree.value ? worktreeBranchNameContextLabel(worktree.value.branch) : null
);

const createError = computed(() => {
  if (!projectId.value?.trim() || !branchParam.value?.trim()) {
    return "Missing project or branch.";
  }
  if (!project.value) {
    return "Project not found. Return to the workspace and try again.";
  }
  if (threadForBranch.value) {
    return null;
  }
  if (!repoPath.value) {
    return "This worktree is not available. Return to the workspace and try again.";
  }
  if (!appContext.value.gitService) {
    return "Git is not available in this environment.";
  }
  if (gitWorktreesPending.value) {
    return null;
  }
  if (gitWorktreesError.value) {
    return "Could not load worktrees for this project. Try again.";
  }
  if (!worktree.value) {
    return "This worktree is not available. Return to the workspace and try again.";
  }
  return null;
});

async function refreshWorkspace(): Promise<void> {
  const api = window.workspaceApi;
  if (!api?.getSnapshot) return;
  const snap = (await api.getSnapshot()) as WorkspaceSnapshot;
  workspace.hydrate(snap);
}

function defaultTitleForAgent(agent: ThreadAgent): string {
  const label = THREAD_AGENT_LABELS[agent];
  const sameAgentCount = workspace.threads.filter((t) => t.agent === agent).length;
  if (sameAgentCount === 0) return label;
  const stamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${label} · ${stamp}`;
}

function resolveNewThreadTitle(payload: ThreadCreateWithAgentPayload, agent: ThreadAgent): string {
  const explicit = payload.threadTitle?.trim();
  if (explicit) return explicit;
  const first = payload.prompt.trim().split(/\n/)[0]?.trim() ?? "";
  if (first && !first.startsWith("[")) return first;
  return defaultTitleForAgent(agent);
}

function onCancel(): void {
  router.back();
}

async function onSubmit(payload: ThreadCreateWithAgentPayload): Promise<void> {
  const wt = worktree.value;
  const pid = projectId.value;
  const api = window.workspaceApi;
  if (!wt || !pid || !api?.createThread) return;

  const { agent, prompt } = payload;
  const title = resolveNewThreadTitle(payload, agent);

  try {
    const created = (await api.createThread({
      projectId: pid,
      worktreePath: wt.path,
      title,
      agent
    })) as Thread;

    const boot: PendingAgentBootstrap = {
      threadId: created.id,
      command: bootstrapCommandLineWithPrompt(agent, prompt),
      mode: "prompt"
    };
    stashPendingAgentBootstrap(boot);

    await refreshWorkspace();
    void queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    void queryClient.invalidateQueries({ queryKey: ["projectTabs"] });
    void queryClient.invalidateQueries({ queryKey: ["projectPath"] });

    const eb = encodeBranch(wt.branch);
    await router.replace({
      name: "agent",
      params: { projectId: pid, branch: eb, threadId: created.id }
    });
  } catch (e: unknown) {
    onSubmitError(e);
  }
}

function onSubmitError(e: unknown): void {
  toast.error("Could not start thread", {
    description: e instanceof Error ? e.message : "Something went wrong."
  });
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div
      v-if="createError"
      class="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <p class="text-sm text-muted-foreground">{{ createError }}</p>
      <button
        type="button"
        class="text-sm font-medium text-primary underline-offset-4 hover:underline"
        @click="router.push({ name: 'welcome' })"
      >
        Back to workspace
      </button>
    </div>
    <div
      v-else-if="awaitingGitWorktrees"
      class="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center"
    >
      <p class="text-sm text-muted-foreground">Loading worktree…</p>
    </div>
    <ThreadInlinePromptEditor
      v-else-if="worktree"
      :worktree-id="worktree.id"
      :worktree-path="worktree.path"
      :thread-context-label="threadContextLabel"
      @submit="(p) => void onSubmit(p).catch(onSubmitError)"
      @cancel="onCancel"
    />
  </div>
</template>
