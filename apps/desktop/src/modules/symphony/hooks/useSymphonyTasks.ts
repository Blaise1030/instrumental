import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, onMounted, onUnmounted, type Ref } from "vue";
import type { SymphonyTasksSnapshot } from "@/shared/symphony";

export function useSymphonyTasks(projectId: Ref<string>) {
  const queryClient = useQueryClient();

  const { data: snapshot, isLoading, error } = useQuery<SymphonyTasksSnapshot>({
    queryKey: ["symphony", "tasks", projectId],
    queryFn: () => window.symphonyApi!.getTasks({ projectId: projectId.value }),
    enabled: computed(() => Boolean(projectId.value && window.symphonyApi)),
    refetchInterval: false,
  });

  let unsubscribe: (() => void) | undefined;

  onMounted(() => {
    if (!window.symphonyApi) return;
    unsubscribe = window.symphonyApi.onDidChange(() => {
      void queryClient.invalidateQueries({ queryKey: ["symphony", "tasks", projectId] });
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  return { snapshot, isLoading, error };
}
