import type { FileSummary } from "@shared/ipc";
import type { FileService } from "./fileService";

export class IpcFileService implements FileService {
  listFiles(cwd: string): Promise<FileSummary[]> {
    return window.workspaceApi!.listFiles(cwd);
  }

  searchFiles(cwd: string, query: string): Promise<string[]> {
    return window.workspaceApi!.searchFiles(cwd, query);
  }

  searchFileContents(cwd: string, query: string): Promise<string[]> {
    const api = window.workspaceApi;
    if (!api?.searchFileContents) {
      return Promise.reject(new Error("Full-text search is not available in this build."));
    }
    return api.searchFileContents(cwd, query);
  }

  readFile(cwd: string, relativePath: string): Promise<string> {
    return window.workspaceApi!.readFile(cwd, relativePath);
  }

  writeFile(cwd: string, relativePath: string, content: string): Promise<void> {
    return window.workspaceApi!.writeFile(cwd, relativePath, content);
  }

  createFile(cwd: string, relativePath: string): Promise<void> {
    return window.workspaceApi!.createFile(cwd, relativePath);
  }

  deleteFile(cwd: string, relativePath: string): Promise<void> {
    return window.workspaceApi!.deleteFile(cwd, relativePath);
  }

  createFolder(cwd: string, relativePath: string): Promise<void> {
    const api = window.workspaceApi;
    if (!api?.createFolder) return Promise.resolve();
    return api.createFolder(cwd, relativePath);
  }

  deleteFolder(cwd: string, relativePath: string): Promise<void> {
    const api = window.workspaceApi;
    if (!api?.deleteFolder) return Promise.resolve();
    return api.deleteFolder(cwd, relativePath);
  }

  onWorkingTreeFilesChanged(callback: () => void): () => void {
    return window.workspaceApi?.onWorkingTreeFilesChanged?.(callback) ?? (() => {});
  }

  onWorkspaceChanged(callback: () => void): () => void {
    return window.workspaceApi?.onWorkspaceChanged?.(callback) ?? (() => {});
  }
}
