import type { Ref } from "vue";
import { watch } from "vue";

const STORAGE_PREFIX = "instrument.threadMessageDraft";

function storageKey(threadId: string): string {
  return `${STORAGE_PREFIX}.${threadId}`;
}

function saveDraft(threadId: string, text: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (text) {
      localStorage.setItem(storageKey(threadId), text);
    } else {
      localStorage.removeItem(storageKey(threadId));
    }
  } catch {
    /* quota or private mode */
  }
}

function loadDraft(threadId: string): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(storageKey(threadId)) ?? "";
  } catch {
    return "";
  }
}

export function clearThreadMessageDraft(threadId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(threadId));
  } catch {
    /* */
  }
}

/**
 * Persists the unsent prompt text per thread ID.
 * - Loads saved draft whenever threadId changes.
 * - Saves to localStorage on every prompt change.
 * Call clearThreadMessageDraft(threadId) after a successful send.
 */
export function useThreadMessageDraft(threadId: Ref<string>, prompt: Ref<string>): void {
  watch(
    threadId,
    (tid) => {
      if (!tid) return;
      prompt.value = loadDraft(tid);
    },
    { immediate: true }
  );

  watch(prompt, (text) => {
    const tid = threadId.value;
    if (!tid) return;
    saveDraft(tid, text);
  });
}
