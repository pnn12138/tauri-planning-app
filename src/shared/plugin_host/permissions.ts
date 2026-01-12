import type { PluginManifest } from "./types";

export function hasPermission(manifest: PluginManifest, permission: string) {
  return Array.isArray(manifest.permissions) && manifest.permissions.includes(permission);
}

