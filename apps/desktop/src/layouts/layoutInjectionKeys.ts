import type { InjectionKey, Ref } from "vue";

export const runStatusByThreadIdKey: InjectionKey<Ref<Record<string, string | null>>> =
  Symbol("runStatusByThreadId");

export const idleAttentionByThreadIdKey: InjectionKey<Ref<Record<string, boolean>>> =
  Symbol("idleAttentionByThreadId");

export const clearIdleAttentionKey: InjectionKey<(threadId: string) => void> =
  Symbol("clearIdleAttention");
