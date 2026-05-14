import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import type { SymphonyTasksSnapshot } from "@/shared/symphony";

const POLL_MS = 60_000;

export function useSymphonyTasks(projectId: Ref<string>) {
  const queryClient = useQueryClient();
  const secondsUntilRefetch = ref<number | null>(null);

  const { data: snapshot, isLoading, error, dataUpdatedAt } = useQuery<SymphonyTasksSnapshot>({
    queryKey: ["symphony", "tasks", projectId],
    queryFn: () => window.symphonyApi!.getTasks({ projectId: projectId.value }),
    enabled: computed(() => Boolean(projectId.value && window.symphonyApi)),
    refetchInterval: false,
  });

  let unsubscribe: (() => void) | undefined;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;

  function startCountdown(): void {
    clearInterval(countdownTimer);
    let remaining = Math.round(POLL_MS / 1000);
    secondsUntilRefetch.value = remaining;
    countdownTimer = setInterval(() => {
      remaining -= 1;
      secondsUntilRefetch.value = Math.max(0, remaining);
    }, 1000);
  }

  watch(dataUpdatedAt, (ts) => {
    if (ts) startCountdown();
  });

  onMounted(() => {
    if (!window.symphonyApi) return;
    unsubscribe = window.symphonyApi.onDidChange(() => {
      void queryClient.invalidateQueries({ queryKey: ["symphony", "tasks", projectId] });
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
    clearInterval(countdownTimer);
  });

  return { snapshot, isLoading, error, secondsUntilRefetch };
}
