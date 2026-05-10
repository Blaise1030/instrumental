import type { ComputedRef, InjectionKey, Ref } from "vue";
import { inject } from "vue";
import type { ThreadAgent } from "@shared/domain";
import type { KeybindingDefinition, KeybindingId } from "@/keybindings/registry";
import type { useKeybindingsStore } from "@/stores/keybindingsStore";

export type SettingsLayoutContext = {
  draft: Ref<Record<ThreadAgent, string>>;
  draftSkillRoots: Ref<Record<ThreadAgent, string>>;
  preferredAgent: Ref<ThreadAgent>;
  setPreferredAgent: (agent: ThreadAgent) => void;
  agentPageComposerVisible: Ref<boolean>;
  terminalNotificationsEnabled: Ref<boolean>;
  keyboardBindingsRows: ComputedRef<KeybindingDefinition[]>;
  recordingKeybindingId: Ref<KeybindingId | null>;
  recordError: Ref<string | null>;
  startRecording: (id: KeybindingId) => void;
  keybindings: ReturnType<typeof useKeybindingsStore>;
};

export const settingsLayoutContextKey: InjectionKey<SettingsLayoutContext> = Symbol("settingsLayoutContext");

export function useSettingsLayoutContext(): SettingsLayoutContext {
  const ctx = inject(settingsLayoutContextKey);
  if (!ctx) {
    throw new Error("useSettingsLayoutContext() must be used under SettingsLayout");
  }
  return ctx;
}
