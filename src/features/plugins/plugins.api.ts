import { invoke } from "@tauri-apps/api/core";

import type { ApiResponse } from "../../shared/types/api";
import type { PluginManifest, PluginsListResponse } from "./plugins.types";

export async function pluginsList(): Promise<PluginsListResponse> {
  const response = await invoke<ApiResponse<PluginsListResponse>>("plugins_list");
  if (response.ok) return response.data;
  throw response.error;
}

export async function pluginsReadManifest(pluginId: string): Promise<PluginManifest> {
  const response = await invoke<ApiResponse<PluginManifest>>("plugins_read_manifest", {
    input: { pluginId },
  });
  if (response.ok) return response.data;
  throw response.error;
}

export async function pluginsReadEntry(pluginId: string, entry: string): Promise<string> {
  const response = await invoke<ApiResponse<{ content: string }>>("plugins_read_entry", {
    input: { pluginId, entry },
  });
  if (response.ok) return response.data.content;
  throw response.error;
}

export async function pluginsSetEnabled(pluginId: string, enabled: boolean, reason?: string) {
  const response = await invoke<ApiResponse<{ ok: boolean }>>("plugins_set_enabled", {
    input: { pluginId, enabled, reason },
  });
  if (response.ok) return response.data;
  throw response.error;
}

export async function vaultReadText(path: string): Promise<{ path: string; content: string; mtime?: number | null }> {
  const response = await invoke<ApiResponse<{ path: string; content: string; mtime?: number | null }>>(
    "vault_read_text",
    { input: { path } }
  );
  if (response.ok) return response.data;
  throw response.error;
}

export async function vaultWriteText(path: string, content: string): Promise<{ path: string; mtime?: number | null }> {
  const response = await invoke<ApiResponse<{ path: string; mtime?: number | null }>>("vault_write_text", {
    input: { path, content },
  });
  if (response.ok) return response.data;
  throw response.error;
}

