import { useQuery } from "@tanstack/vue-query";
import type { Ref } from "vue";
import { computed, unref } from "vue";
import { useAppContext } from "@/app-context/useAppContext";

export function useBranches(cwd: Ref<string>) {
  const appContext = useAppContext();
  return useQuery({
    queryKey: ["git", "branches", cwd],
    queryFn: () => appContext.value.gitService.listBranchesExcludingWorktrees(unref(cwd)),
    enabled: computed(() => Boolean(unref(cwd))),
  });
}
