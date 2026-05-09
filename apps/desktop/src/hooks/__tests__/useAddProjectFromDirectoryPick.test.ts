import { ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@shared/domain";
import type { WorkspaceSnapshot } from "@shared/ipc";
import type { AppContext } from "@/app-context/type";
import type { WorkspaceService } from "@/app-context/workspaceService";
import { useAddProjectFromDirectoryPick } from "../useAddProjectFromDirectoryPick";

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn()
}));

/** Shared across tests; reset in `beforeEach`. */
const appContextRef = ref<Partial<AppContext>>({});

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    error: toastErrorMock,
    success: vi.fn(),
    dismiss: vi.fn()
  })
}));

vi.mock("@/app-context/useAppContext", () => ({
  useAppContext: (): Ref<Partial<AppContext>> => appContextRef as Ref<AppContext>
}));

function emptySnapshot(): WorkspaceSnapshot {
  return {
    projects: [],
    worktrees: [],
    threads: [],
    threadSessions: [],
    activeProjectId: null,
    activeWorktreeId: null,
    activeThreadId: null
  };
}

function minimalProject(overrides: Partial<Project> & Pick<Project, "id" | "name" | "repoPath">): Project {
  return {
    status: "idle",
    tabOrder: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("useAddProjectFromDirectoryPick", () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
    appContextRef.value = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("success: adds project and navigates to new id", async () => {
    const navigateToProject = vi.fn().mockResolvedValue(undefined);
    const getSnapshot = vi.fn().mockResolvedValueOnce(emptySnapshot());
    const pickRepoDirectory = vi.fn().mockResolvedValue("/new/repo");
    const addProject = vi.fn().mockResolvedValue(
      {
        ...emptySnapshot(),
        projects: [
          minimalProject({
            id: "p-new",
            name: "repo",
            repoPath: "/new/repo"
          })
        ]
      } satisfies WorkspaceSnapshot
    );

    const workspaceService: Pick<
      WorkspaceService,
      "getSnapshot" | "pickRepoDirectory" | "addProject"
    > = {
      getSnapshot,
      pickRepoDirectory,
      addProject
    };
    appContextRef.value = { workspaceService: workspaceService as WorkspaceService };

    const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });
    await pickAndAddProject();

    expect(addProject).toHaveBeenCalledWith({ name: "repo", repoPath: "/new/repo" });
    expect(navigateToProject).toHaveBeenCalledWith("p-new");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("cancel: null pick skips add and navigate", async () => {
    const navigateToProject = vi.fn();
    const addProject = vi.fn();
    const workspaceService: Pick<
      WorkspaceService,
      "getSnapshot" | "pickRepoDirectory" | "addProject"
    > = {
      getSnapshot: vi.fn().mockResolvedValue(emptySnapshot()),
      pickRepoDirectory: vi.fn().mockResolvedValue(null),
      addProject
    };
    appContextRef.value = { workspaceService: workspaceService as WorkspaceService };

    const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });
    await pickAndAddProject();

    expect(addProject).not.toHaveBeenCalled();
    expect(navigateToProject).not.toHaveBeenCalled();
  });

  it("duplicate: normalized path match shows error and skips add", async () => {
    const navigateToProject = vi.fn();
    const addProject = vi.fn();
    const workspaceService: Pick<
      WorkspaceService,
      "getSnapshot" | "pickRepoDirectory" | "addProject"
    > = {
      getSnapshot: vi.fn().mockResolvedValue({
        ...emptySnapshot(),
        projects: [
          minimalProject({
            id: "p1",
            name: "repo",
            repoPath: "/new/repo///"
          })
        ]
      } satisfies WorkspaceSnapshot),
      pickRepoDirectory: vi.fn().mockResolvedValue("/new/repo"),
      addProject
    };
    appContextRef.value = { workspaceService: workspaceService as WorkspaceService };

    const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });
    await pickAndAddProject();

    expect(addProject).not.toHaveBeenCalled();
    expect(navigateToProject).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Already in workspace",
      "This folder is already in the workspace."
    );
  });

  it("addProject throws: error toast and no navigate", async () => {
    const navigateToProject = vi.fn();
    const err = new Error("disk full");
    const workspaceService: Pick<
      WorkspaceService,
      "getSnapshot" | "pickRepoDirectory" | "addProject"
    > = {
      getSnapshot: vi.fn().mockResolvedValue(emptySnapshot()),
      pickRepoDirectory: vi.fn().mockResolvedValue("/new/repo"),
      addProject: vi.fn().mockRejectedValue(err)
    };
    appContextRef.value = { workspaceService: workspaceService as WorkspaceService };

    const { pickAndAddProject } = useAddProjectFromDirectoryPick({ navigateToProject });
    await pickAndAddProject();

    expect(navigateToProject).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Could not add project", "Error: disk full");
  });
});
