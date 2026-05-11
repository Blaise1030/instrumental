import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import type { SymphonySetConfigInput, SymphonyStoredConfig } from "@/shared/symphony";

export function useSymphonyConfig(projectId: Ref<string>) {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["symphony", "config", projectId],
    queryFn: () =>
      window.symphonyApi!.getConfig({ projectId: projectId.value }) as Promise<SymphonyStoredConfig | null>,
    enabled: computed(() => Boolean(projectId.value && window.symphonyApi)),
  });

  const { mutate: saveConfig } = useMutation({
    mutationFn: (payload: SymphonySetConfigInput) => window.symphonyApi!.setConfig(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["symphony", "config", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["symphony", "tasks", projectId] });
    },
  });

  const { mutate: deleteConfig } = useMutation({
    mutationFn: () => window.symphonyApi!.deleteConfig({ projectId: projectId.value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["symphony", "config", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["symphony", "tasks", projectId] });
    },
  });

  return { config, isLoading, saveConfig, deleteConfig };
}
