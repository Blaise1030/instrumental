import type { Ref } from "vue";
import { computed, watch } from "vue";
import { StorageSerializers, useStorage } from "@vueuse/core";

const STORAGE_PREFIX = "instrument.threadMessageDraft";

function storageKey(threadId: string): string {
  return `${STORAGE_PREFIX}.${threadId}`;
}

export function clearThreadMessageDraft(threadId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(threadId));
  } catch {
    /* quota or private mode */
  }
}

/**
 * Persists the unsent prompt text per thread ID.
 * - Loads saved draft whenever threadId changes.
 * - Saves to localStorage on every prompt change.
 * Call clearThreadMessageDraft(threadId) after a successful send.
 */
export function useThreadMessageDraft(threadId: Ref<string>, prompt: Ref<string>): void {
  const key = computed(() => {
    const tid = threadId.value;
    return tid ? storageKey(tid) : `${STORAGE_PREFIX}.__inactive__`;
  });

  const stored = useStorage(
    key,
    "",
    typeof localStorage === "undefined" ? undefined : localStorage,
    { serializer: StorageSerializers.string },
  );

  watch(
    threadId,
    (tid) => {
      if (!tid) return;
      prompt.value = stored.value;
    },
    { immediate: true },
  );

  watch(prompt, (text) => {
    const tid = threadId.value;
    if (!tid) return;
    if (text) {
      stored.value = text;
      return;
    }
    clearThreadMessageDraft(tid);
    stored.value = "";
  });
}
