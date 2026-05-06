<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import { takePendingAgentBootstrapForThread } from "@/lib/pendingAgentBootstrapSession";
import PromptWithFileAttachments from "@/components/PromptWithFileAttachments.vue";
import TerminalPane from "@/components/TerminalPane.vue";
import { Button } from "@/components/ui/button";
import type { LocalFileAttachment } from "@/lib/localFileAttachment";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";

const route = useRoute();
const { activeWorktree } = useActiveWorkspace();

const threadId = computed(() => route.params.threadId as string);
const pendingBootstrap = ref<PendingAgentBootstrap | null>(null);
const prompt = ref("");
const attachments = ref<LocalFileAttachment[]>([]);
const skillPaths = ref<string[]>([]);
const promptEditorRef = ref<{ flushToModels: () => void } | null>(null);
const terminalRef = ref<InstanceType<typeof TerminalPane> | null>(null);

onMounted(() => {
  const tid = threadId.value;
  if (tid) pendingBootstrap.value = takePendingAgentBootstrapForThread(tid);
});

function onBootstrapConsumed(): void {
  pendingBootstrap.value = null;
}

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const v = value.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Same assembly as `ThreadInlinePromptEditor` when starting a thread. */
function buildPromptWithAttachmentBlocks(text: string): string {
  const parts: string[] = [];
  const note = text.trim();
  if (note) parts.push(note);

  const nextSkills = dedupe(skillPaths.value);
  const nextFiles = dedupe(attachments.value.map((a) => a.path));

  if (nextSkills.length > 0) {
    parts.push(`[Attached skills]\n${nextSkills.join("\n")}`);
  }
  if (nextFiles.length > 0) {
    parts.push(`[Attached files]\n${nextFiles.join("\n")}`);
  }

  return parts.join("\n\n").trim();
}

function submitPrompt(): void {
  promptEditorRef.value?.flushToModels();
  const finalPrompt = buildPromptWithAttachmentBlocks(prompt.value);
  if (!finalPrompt.trim()) return;
  terminalRef.value?.injectPrompt(finalPrompt);
  prompt.value = "";
  attachments.value = [];
  skillPaths.value = [];
}

function onPromptKeydown(e: KeyboardEvent): void {
  if (e.key !== "Enter" || (!e.metaKey && !e.ctrlKey)) return;
  e.preventDefault();
  submitPrompt();
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div v-if="activeWorktree && threadId" class="grid min-h-0 flex-1">
      <TerminalPane ref="terminalRef" class="flex-1" :session-id="threadId" :worktree-id="activeWorktree.id" :cwd="activeWorktree.path"
        aria-label="Agent" :pending-agent-bootstrap="pendingBootstrap" @bootstrap-consumed="onBootstrapConsumed" />
      <div class="px-4 pt-1 min-h-0 flex-col" @keydown.capture="onPromptKeydown">
        <PromptWithFileAttachments class="w-full mx-auto" ref="promptEditorRef" v-model:prompt="prompt" v-model:attachments="attachments"
          v-model:skill-paths="skillPaths" test-id-prefix="agent-page-prompt" :tiptap="true" :show-done-button="false"
          :worktree-path="activeWorktree.path" placeholder="Use @ for files or / for skills...">
          <template #footer>
            <header class="flex ms-auto shrink-0 items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="hidden text-xs text-muted-foreground sm:inline">
                  Ctrl/⌘ + Enter to send
                </span>
                <Button type="button" data-testid="agent-page-send-prompt" @click="submitPrompt">
                  Submit
                </Button>
              </div>
            </header>
          </template>
        </PromptWithFileAttachments>
      </div>
    </div>

    <div v-else class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      No active thread.
    </div>
  </div>
</template>
