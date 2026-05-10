import { computed } from "vue";
import type { ComputedRef } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import type { TerminalTab } from "@shared/ipc";

export function useTerminalTabs(worktreeId: ComputedRef<string | null>) {
  const queryClient = useQueryClient();

  const queryKey = computed(() => ["terminals", "tabs", worktreeId.value]);

  const { data: tabs, isLoading } = useQuery<TerminalTab[]>({
    queryKey,
    queryFn: () => window.terminalsApi!.listTabs(worktreeId.value!),
    enabled: computed(() => !!worktreeId.value && !!window.terminalsApi),
  });

  const { mutateAsync: createTab } = useMutation({
    mutationFn: () => {
      if (!window.terminalsApi) throw new Error("terminalsApi unavailable");
      return window.terminalsApi.createTab(worktreeId.value!);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["terminals", "tabs"] }),
  });

  const { mutateAsync: deleteTab } = useMutation({
    mutationFn: (id: string) => window.terminalsApi!.deleteTab(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["terminals", "tabs"] }),
  });

  const { mutateAsync: setActiveTab } = useMutation({
    mutationFn: (id: string) => window.terminalsApi!.setActiveTab(worktreeId.value!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["terminals", "tabs"] }),
  });

  const activeTab = computed(() => tabs.value?.find((t) => t.isActive) ?? tabs.value?.[0] ?? null);

  return { tabs, isLoading, activeTab, createTab, deleteTab, setActiveTab };
}
