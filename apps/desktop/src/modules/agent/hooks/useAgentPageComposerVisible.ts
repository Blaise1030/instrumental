import { effectScope, ref, watch } from "vue";

export const STORAGE_AGENT_PAGE_COMPOSER_VISIBLE = "instrument.agentPageComposerVisible";

function readBool(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
    /* private mode */
  }
  return defaultValue;
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const agentPageComposerVisible = ref(readBool(STORAGE_AGENT_PAGE_COMPOSER_VISIBLE, true));

const persistScope = effectScope();
persistScope.run(() => {
  watch(
    agentPageComposerVisible,
    (v) => writeBool(STORAGE_AGENT_PAGE_COMPOSER_VISIBLE, v),
    { flush: "sync" }
  );
});

/** Re-sync ref from `localStorage` (for tests after mutating storage). */
export function resetAgentPageComposerVisibleForTests(): void {
  agentPageComposerVisible.value = readBool(STORAGE_AGENT_PAGE_COMPOSER_VISIBLE, true);
}

/** Persisted `instrument.agentPageComposerVisible` — Agents settings + agent thread view. */
export function useAgentPageComposerVisible(): {
  agentPageComposerVisible: typeof agentPageComposerVisible;
} {
  return { agentPageComposerVisible };
}
