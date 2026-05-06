<script setup lang="ts">
import { ref } from "vue";
import PromptWithFileAttachments from "@/components/PromptWithFileAttachments.vue";
import type { LocalFileAttachment } from "@/lib/localFileAttachment";

const prompt = defineModel<string>("prompt", { default: "" });
const attachments = defineModel<LocalFileAttachment[]>("attachments", { default: () => [] });
const skillPaths = defineModel<string[]>("skillPaths", { default: () => [] });

const emit = defineEmits<{
  queueRemove: [];
}>();

withDefaults(
  defineProps<{
    worktreePath?: string | null;
    placeholder?: string;
    testIdPrefix?: string;
    showDoneButton?: boolean;
    contextTagLabel?: string | null;
    showQueueRemove?: boolean;
    queueRemoveAriaLabel?: string;
  }>(),
  {
    worktreePath: null,
    placeholder: "",
    testIdPrefix: "thread-adaptive-prompt",
    showDoneButton: false,
    contextTagLabel: null,
    showQueueRemove: false,
    queueRemoveAriaLabel: "Remove this queue entry"
  }
);

const innerRef = ref<InstanceType<typeof PromptWithFileAttachments> | null>(null);

defineExpose({
  flushToModels: () => innerRef.value?.flushToModels(),
  openFilePicker: () => innerRef.value?.openFilePicker()
});
</script>

<template>
  <PromptWithFileAttachments
    ref="innerRef"
    v-model:prompt="prompt"
    v-model:attachments="attachments"
    v-model:skill-paths="skillPaths"
    :test-id-prefix="testIdPrefix"
    :tiptap="true"
    adaptive-line-layout
    :worktree-path="worktreePath"
    :placeholder="placeholder"
    :show-done-button="showDoneButton"
    :context-tag-label="contextTagLabel"
    :show-queue-remove="showQueueRemove"
    :queue-remove-aria-label="queueRemoveAriaLabel"
    @queue-remove="emit('queueRemove')"
  >
    <template #footer>
      <slot name="footer" />
    </template>
  </PromptWithFileAttachments>
</template>
