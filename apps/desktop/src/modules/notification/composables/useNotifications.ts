import { computed, onMounted, onUnmounted } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useAppContext } from "@/app-context/useAppContext";

const QUERY_KEY = ["notifications"] as const;

export function useNotifications() {
  const appContext = useAppContext();
  const queryClient = useQueryClient();

  const notificationService = computed(() => appContext.value?.notificationService);

  const { data: notifications } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => notificationService.value!.list(),
    enabled: computed(() => !!notificationService.value),
  });

  const unreadCount = computed(
    () => notifications.value?.filter((n) => !n.read).length ?? 0,
  );

  let unsub: (() => void) | null = null;

  onMounted(() => {
    const service = notificationService.value;
    if (!service) return;
    unsub = service.onDidChange(() => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    });
  });

  onUnmounted(() => {
    unsub?.();
  });

  async function markRead(id: string): Promise<void> {
    await notificationService.value?.markRead(id);
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function markAllRead(): Promise<void> {
    await notificationService.value?.markAllRead();
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  return { notifications, unreadCount, markRead, markAllRead };
}
