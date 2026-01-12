import type { FileNode } from "./file";

export type ApiError = { code: string; message: string; details?: unknown };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type WarningItem = {
  code: string;
  message: string;
  path?: string | null;
};

export type ScanVaultResponse = {
  vaultRoot: string;
  tree: FileNode[];
  warnings: WarningItem[];
};

export type ReadMarkdownResponse = {
  path: string;
  content: string;
  mtime?: number | null;
};

export type WriteMarkdownResponse = {
  path: string;
  mtime?: number | null;
};

export type RenameMarkdownResponse = {
  oldPath: string;
  newPath: string;
  mtime?: number | null;
};

export type DeleteEntryResponse = {
  path: string;
};

export type CreateEntryResponse = {
  path: string;
  kind: "file" | "dir";
};

