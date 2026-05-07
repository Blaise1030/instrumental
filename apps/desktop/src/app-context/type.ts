import type { GitService } from "@/modules/git/services/gitService";
import type { ThreadManagementService } from "@/modules/agent/services/threadManagementService";
import type { WorkspaceService } from "./workspaceService";

export type AppMode = "desktop" | "mobile" | "cloud";

export type AppContext = {
  mode: AppMode;
  threadManagementService: ThreadManagementService;
  gitService: GitService;
  workspaceService: WorkspaceService;
};