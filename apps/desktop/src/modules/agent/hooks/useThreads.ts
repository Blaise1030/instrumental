import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { CreateThreadInput, UpdateThreadInput } from "@shared/ipc";
import type { Ref } from "vue";
import { computed, unref } from "vue";
import { useAppContext } from "@/app-context/useAppContext";

export function useThreads(projectId: Ref<string>) {
  const appContext = useAppContext();
  return useQuery({
    queryKey: ["agent", "threads", projectId],
    queryFn: () => appContext.value.threadManagementService.loadThreads(unref(projectId)),
    enabled: computed(() => Boolean(unref(projectId))),
  });
}

export function useCreateThread() {
  const appContext = useAppContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateThreadInput) =>
      appContext.value.threadManagementService.createThread(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", "threads"] });
    },
  });
}

export function useRemoveThread() {
  const appContext = useAppContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      appContext.value.threadManagementService.removeThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", "threads"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}

export function useUpdateThread() {
  const appContext = useAppContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateThreadInput) =>
      appContext.value.threadManagementService.updateThread(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", "threads"] });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
    },
  });
}
