import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { Ref } from "vue";
import { computed, unref } from "vue";
import { useAppContext } from "@/app-context/useAppContext";

export function useWorktrees(cwd: Ref<string>) {
  const appContext = useAppContext();
  return useQuery({
    queryKey: ["git", "worktrees", cwd],
    queryFn: () => appContext.value.gitService.listWorktrees(unref(cwd)),
    enabled: computed(() => Boolean(unref(cwd))),
  });
}

export function useCheckoutBranch() {
  const appContext = useAppContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cwd, branch }: { cwd: string; branch: string }) =>
      appContext.value.gitService.checkoutBranch(cwd, branch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git", "worktrees"] });
      queryClient.invalidateQueries({ queryKey: ["git", "branches"] });
    },
  });
}
