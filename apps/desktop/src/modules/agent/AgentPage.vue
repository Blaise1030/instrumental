<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import { buildThreadCreatePromptWithAttachmentBlocks } from "@/lib/threadCreatePromptAssembly";
import { takePendingAgentBootstrapForThread } from "@/lib/pendingAgentBootstrapSession";
import { useAgentBootstrapCommands } from "@/composables/useAgentBootstrapCommands";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { threadAgentResumeCommandLine } from "@shared/threadAgentBootstrap";
import { isValidPersistedResumeId } from "@shared/resumeSessionId";
import ThreadAdaptivePromptInput from "@/components/ThreadAdaptivePromptInput.vue";
import TerminalPane from "@/components/TerminalPane.vue";
import type { LocalFileAttachment } from "@/lib/localFileAttachment";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";
import type { Thread } from "@shared/domain";
import { useAppContext } from "@/app-context/useAppContext";

const route = useRoute();
const { activeWorktree } = useActiveWorkspace();
const appContext = useAppContext();
const workspace = useWorkspaceStore();
const { bootstrapCommandFor } = useAgentBootstrapCommands();

const threadId = computed(() => route.params.threadId as string);
const pendingBootstrap = ref<PendingAgentBootstrap | null>(null);
const prompt = ref("");
const attachments = ref<LocalFileAttachment[]>([]);
const skillPaths = ref<string[]>([]);
const promptEditorRef = ref<InstanceType<typeof ThreadAdaptivePromptInput> | null>(null);
const terminalRef = ref<InstanceType<typeof TerminalPane> | null>(null);

onMounted(async () => {
  const tid = threadId.value;
  if (!tid) return;

  let boot = takePendingAgentBootstrapForThread(tid);
  if (!boot) {
    const thread: Thread | null = await appContext.value.threadManagementService.getThread(tid);
    if (thread) {
      const session = workspace.threadSessionFor(tid);
      if (
        session?.resumeId &&
        session.status === "resumable" &&
        isValidPersistedResumeId(session.resumeId)
      ) {
        const resumeCmd = threadAgentResumeCommandLine(
          bootstrapCommandFor(thread.agent),
          thread.agent,
          session.resumeId
        );
        await nextTick();
        console.log(resumeCmd)
        terminalRef.value?.injectPrompt(resumeCmd);
        
      }
    }
  }
  pendingBootstrap.value = boot ?? null;
});

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
  prompt.value = "";
  attachments.value = [];
  skillPaths.value = [];
}

</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div v-if="activeWorktree && threadId" class="grid min-h-0 flex-1">
      <TerminalPane ref="terminalRef" class="flex-1" :session-id="threadId" :worktree-id="activeWorktree.id" :cwd="activeWorktree.path"
        aria-label="Agent" :pending-agent-bootstrap="pendingBootstrap" @bootstrap-consumed="onBootstrapConsumed" />
      <div class="px-4 pt-1 min-h-0 flex-col">
        <ThreadAdaptivePromptInput
          class="w-full mx-auto"
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
    </div>

    <div v-else class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      No active thread.
    </div>
  </div>
</template>
