import { invoke } from "@tauri-apps/api/core";

import type {
  ApiResponse,
  ReadMarkdownResponse,
  RenameMarkdownResponse,
  WriteMarkdownResponse,
} from "../../shared/types/api";

async function invokeApi<T>(command: string, args?: Record<string, unknown>) {
  const response = await invoke<ApiResponse<T>>(command, args);
  if (response.ok) return response.data;
  throw response.error;
}

export async function readMarkdown(path: string) {
  return invokeApi<ReadMarkdownResponse>("read_markdown", { input: { path } });
}

export async function writeMarkdown(input: { path: string; content: string }) {
  return invokeApi<WriteMarkdownResponse>("write_markdown", { input });
}

export async function renameMarkdown(input: { path: string; newName: string }) {
  return invokeApi<RenameMarkdownResponse>("rename_markdown", { input });
}


