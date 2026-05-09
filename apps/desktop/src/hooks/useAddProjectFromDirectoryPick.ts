import { useToast } from "@/hooks/useToast";
import { displayNameFromRepoPath, normalizeRepoPathForCompare } from "@/utils/repoPathUtils";
import { useAppContext } from "@/app-context/useAppContext";

export function useAddProjectFromDirectoryPick(options: {
  navigateToProject: (projectId: string) => Promise<void | boolean>;
}): { pickAndAddProject: () => Promise<void> } {
  const toast = useToast();
  const appContext = useAppContext();

  async function pickAndAddProject(): Promise<void> {
    const workspaceService = appContext.value?.workspaceService;
    if (!workspaceService) return;

    const before = await workspaceService.getSnapshot();

    const picked = await workspaceService.pickRepoDirectory();
    if (picked == null) {
      return;
    }

    if (
      before.projects.some(
        (p) => normalizeRepoPathForCompare(p.repoPath) === normalizeRepoPathForCompare(picked)
      )
    ) {
      toast.error("Already in workspace", "This folder is already in the workspace.");
      return;
    }

    const name = displayNameFromRepoPath(picked);

    let after;
    try {
      after = await workspaceService.addProject({ name, repoPath: picked });
    } catch (err) {
      toast.error("Could not add project", String(err));
      return;
    }

    const added = after.projects.find(
      (p) => normalizeRepoPathForCompare(p.repoPath) === normalizeRepoPathForCompare(picked)
    );
    if (!added) {
      toast.error(
        "Could not add project",
        "Project was added but could not be found in the workspace snapshot."
      );
      return;
    }

    await options.navigateToProject(added.id);
  }

  return { pickAndAddProject };
}
