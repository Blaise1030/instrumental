import type { GitService } from "@/modules/git/services/gitService";
import type { ThreadManagementService } from "@/services/thread-management/threadManagementService";

export type AppMode = "desktop" | "mobile" | "cloud";

export type AppContext = {
  mode: AppMode;
  threadManagementService: ThreadManagementService;
  gitService: GitService;  
};