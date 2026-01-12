import { useSyncExternalStore } from "react";

import type { ApiError } from "../../shared/types/api";
import { pluginsList, pluginsSetEnabled } from "./plugins.api";
import type { PluginListItem } from "./plugins.types";

export type PluginsState = {
  plugins: PluginListItem[];
  loading: boolean;
  error: ApiError | null;
};

const listeners = new Set<() => void>();

let pluginsState: PluginsState = {
  plugins: [],
  loading: false,
  error: null,
};

function emitChange() {
  for (const listener of listeners) listener();
}

export function getPluginsState() {
  return pluginsState;
}

export function setPluginsState(updater: (prev: PluginsState) => PluginsState) {
  pluginsState = updater(pluginsState);
  emitChange();
}

export function usePluginsStore<T>(selector: (state: PluginsState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(pluginsState),
    () => selector(pluginsState)
  );
}

export async function refreshPlugins() {
  setPluginsState((prev) => ({ ...prev, loading: true, error: null }));
  try {
    const response = await pluginsList();
    const plugins: PluginListItem[] = response.plugins.map((item) => ({
      dir: item.dir,
      enabled: item.enabled,
      manifest: item.manifest ?? null,
      error: item.error ?? null,
    }));
    setPluginsState((prev) => ({ ...prev, plugins, loading: false, error: null }));
  } catch (error) {
    setPluginsState((prev) => ({ ...prev, loading: false, error: error as ApiError }));
  }
}

export async function setPluginEnabled(pluginId: string, enabled: boolean, reason?: string) {
  await pluginsSetEnabled(pluginId, enabled, reason);
  await refreshPlugins();
}

