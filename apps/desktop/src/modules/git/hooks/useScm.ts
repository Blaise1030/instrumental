import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, unref } from "vue";
import type { Ref } from "vue";
import { useAppContext } from "@/app-context/useAppContext";

export function useScm(cwd: Ref<string>) {
  const appContext = useAppContext();
  const queryClient = useQueryClient();
  const queryKey = computed(() => ["git", "scm", unref(cwd)] as const);

  const statusQuery = useQuery({
    queryKey,
    queryFn: () => appContext.value.gitService.getStatus(unref(cwd)),
    enabled: computed(() => Boolean(unref(cwd))),
  });

  const repoStatus = computed(() => statusQuery.data.value?.entries ?? []);
  const scmMeta = computed(() => ({
    branch: statusQuery.data.value?.branch ?? "",
    shortLabel: statusQuery.data.value?.shortLabel ?? "",
    lastCommitSubject: statusQuery.data.value?.lastCommitSubject ?? null,
  }));
  const hasGitRepository = computed(
    () => statusQuery.data.value !== null && statusQuery.data.value !== undefined
  );

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: queryKey.value });
  }

  const stagePaths = useMutation({
    mutationFn: (paths: string[]) =>
      appContext.value.gitService.stagePaths(unref(cwd), paths),
    onSuccess: invalidate,
  });

  const stageAll = useMutation({
    mutationFn: () => appContext.value.gitService.stageAll(unref(cwd)),
    onSuccess: invalidate,
  });

  const unstagePaths = useMutation({
    mutationFn: (paths: string[]) =>
      appContext.value.gitService.unstagePaths(unref(cwd), paths),
    onSuccess: invalidate,
  });

  const unstageAll = useMutation({
    mutationFn: () => appContext.value.gitService.unstageAll(unref(cwd)),
    onSuccess: invalidate,
  });

  const discardPaths = useMutation({
    mutationFn: (paths: string[]) =>
      appContext.value.gitService.discardPaths(unref(cwd), paths),
    onSuccess: invalidate,
  });

  const discardAll = useMutation({
    mutationFn: () => appContext.value.gitService.discardAll(unref(cwd)),
    onSuccess: invalidate,
  });

  const commit = useMutation({
    mutationFn: (message: string) =>
      appContext.value.gitService.commit(unref(cwd), message),
    onSuccess: invalidate,
  });

  const fetch = useMutation({
    mutationFn: () => appContext.value.gitService.fetch(unref(cwd)),
    onSuccess: invalidate,
  });

  const push = useMutation({
    mutationFn: () => appContext.value.gitService.push(unref(cwd)),
    onSuccess: invalidate,
  });

  return {
    statusQuery,
    repoStatus,
    scmMeta,
    hasGitRepository,
    stagePaths,
    stageAll,
    unstagePaths,
    unstageAll,
    discardPaths,
    discardAll,
    commit,
    fetch,
    push,
  };
}
