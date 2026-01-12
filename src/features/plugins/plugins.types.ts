import type { ApiError } from "../../shared/types/api";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  entry: string;
  description: string;
  author: string;
  minAppVersion: string;
  permissions: string[];
};

export type PluginListItem = {
  dir: string;
  enabled: boolean;
  manifest: PluginManifest | null;
  error: ApiError | null;
};

export type PluginsListResponse = {
  plugins: Array<{
    dir: string;
    enabled: boolean;
    manifest?: PluginManifest | null;
    error?: ApiError | null;
  }>;
};

