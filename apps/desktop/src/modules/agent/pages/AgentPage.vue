<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { buildThreadCreatePromptWithAttachmentBlocks } from "@/modules/agent/utils/threadCreatePromptAssembly";
import { useAgentBootstrapCommands } from "@/modules/agent/hooks/useAgentBootstrapCommands";
import { threadAgentResumeCommandLine } from "@shared/threadAgentBootstrap";
import { isValidPersistedResumeId } from "@/shared/resumeSessionId";
import ThreadAdaptivePromptInput from "@/modules/agent/components/ThreadAdaptivePromptInput.vue";
import TerminalPane from "@/modules/agent/components/TerminalPane.vue";
import type { LocalFileAttachment } from "@/modules/agent/utils/localFileAttachment";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";
import { useAppContext } from "@/app-context/useAppContext";
import { useAgentPageComposerVisible } from "@/modules/agent/hooks/useAgentPageComposerVisible";
import { useThreadMessageDraft, clearThreadMessageDraft } from "@/modules/agent/hooks/useThreadMessageDraft";
import { takePendingAgentBootstrapForThread } from "@/modules/agent/utils/pendingAgentBootstrapSession";

const route = useRoute();
const { activeWorktree } = useActiveWorkspace();
const appContext = useAppContext();
const { bootstrapCommandFor } = useAgentBootstrapCommands();
const { agentPageComposerVisible } = useAgentPageComposerVisible();

const threadId = computed(() => route.params.threadId as string);
const pendingBootstrap = ref<PendingAgentBootstrap | null>(null);
const prompt = ref("");
const attachments = ref<LocalFileAttachment[]>([]);
const skillPaths = ref<string[]>([]);
const promptEditorRef = ref<InstanceType<typeof ThreadAdaptivePromptInput> | null>(null);
const terminalRef = ref<InstanceType<typeof TerminalPane> | null>(null);

useThreadMessageDraft(threadId, prompt);

watch(
  threadId,
  async (tid) => {
    pendingBootstrap.value = null;
    if (!tid) return;

    const pendingCreateBootstrap = takePendingAgentBootstrapForThread(tid);
    if (pendingCreateBootstrap?.command.trim()) {
      pendingBootstrap.value = pendingCreateBootstrap;
      return;
    }

    const workspaceService = appContext.value?.workspaceService;
    if (!workspaceService) return;

    const snapshot = await workspaceService.getSnapshot();
    const thread = snapshot.threads.find((t) => t.id === tid);
    if (!thread) return;

    const session = snapshot.threadSessions.find((s) => s.threadId === tid);
    if (!session?.resumeId || !isValidPersistedResumeId(session.resumeId)) return;

    const resumeCmd = threadAgentResumeCommandLine(
      bootstrapCommandFor(thread.agent),
      thread.agent,
      session.resumeId,
    );
    pendingBootstrap.value = { threadId: tid, command: resumeCmd, mode: "resume" };
  },
  { immediate: true }
);

function onBootstrapConsumed(): void {
  pendingBootstrap.value = null;
}

function submitPrompt(): void {
  promptEditorRef.value?.flushToModels();
  const finalPrompt = buildThreadCreatePromptWithAttachmentBlocks(
    prompt.value,
    skillPaths.value,
    attachments.value.map((a) => a.path)
  );
  if (!finalPrompt.trim()) return;
  terminalRef.value?.injectPrompt(finalPrompt);
  clearThreadMessageDraft(threadId.value);
  prompt.value = "";
  attachments.value = [];
  skillPaths.value = [];
}

</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <template v-if="activeWorktree && threadId">
      <!-- flex-1 wrapper: TerminalPane uses h-full; it must not also be a flex-1 sibling or % height fills the whole column and the prompt cannot steal height -->
      <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
        <TerminalPane
          ref="terminalRef"
          class="h-full min-h-0"
          :session-id="threadId"
          :worktree-id="activeWorktree.id"
          :cwd="activeWorktree.path"
          aria-label="Agent"
          :pending-agent-bootstrap="pendingBootstrap"
          @bootstrap-consumed="onBootstrapConsumed"
        />
      </div>
      <div v-if="agentPageComposerVisible" class="shrink-0 px-2 pb-2">
        <ThreadAdaptivePromptInput
          class="mx-auto w-full"
          ref="promptEditorRef"
          v-model:prompt="prompt"
          v-model:attachments="attachments"
          v-model:skill-paths="skillPaths"
          test-id-prefix="agent-page-prompt"
          :worktree-path="activeWorktree.path"
          placeholder="Use @ for files or / for skills..."
          composer-label="Composer 2"
          @submit="submitPrompt"
        />
      </div>
    </template>
    <div v-else class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      No active thread.
    </div>
  </div>
</template>
