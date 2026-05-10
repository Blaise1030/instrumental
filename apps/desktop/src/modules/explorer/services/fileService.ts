import type { FileSummary } from "@shared/ipc";

export interface FileService {
  listFiles(cwd: string): Promise<FileSummary[]>;
  searchFiles(cwd: string, query: string): Promise<string[]>;
  searchFileContents?(cwd: string, query: string): Promise<string[]>;
  readFile(cwd: string, relativePath: string): Promise<string>;
  writeFile(cwd: string, relativePath: string, content: string): Promise<void>;
  createFile(cwd: string, relativePath: string): Promise<void>;
  deleteFile(cwd: string, relativePath: string): Promise<void>;
  createFolder?(cwd: string, relativePath: string): Promise<void>;
  deleteFolder?(cwd: string, relativePath: string): Promise<void>;
  renameEntry?(cwd: string, from: string, to: string): Promise<void>;
  onWorkingTreeFilesChanged?(callback: () => void): () => void;
  onWorkspaceChanged?(callback: () => void): () => void;
}
