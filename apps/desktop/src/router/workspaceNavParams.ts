import type { RouteLocationNormalizedLoaded } from "vue-router";
import { decodeBranch } from "@/router/branchParam";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/** Params for routes nested under `/:projectId/:branch/thread/:threadId/…`. */
export type ThreadScopedWorkspaceParams = {
  projectId: string;
  branch: string;
  threadId: string;
};

/**
 * When `threadId` is absent but we are not on new-thread, resolve the first thread on the branch.
 */
export function resolveThreadScopedWorkspaceParams(
  route: RouteLocationNormalizedLoaded
): ThreadScopedWorkspaceParams | null {
  const pid = route.params.projectId;
  const branchParam = route.params.branch;
  if (typeof pid !== "string" || typeof branchParam !== "string") return null;

  let tid = typeof route.params.threadId === "string" ? route.params.threadId : "";
  if (!tid && route.name !== "threadNew") {
    const decoded = decodeBranch(branchParam);
    const ws = useWorkspaceStore();
    const thread = ws.threads.find((t) => t.projectId === pid && t.createdBranch === decoded);
    tid = thread?.id ?? "";
  }
  if (!tid) return null;
  return { projectId: pid, branch: branchParam, threadId: tid };
}
