import { useSyncExternalStore } from "react";

export type FileNode = {
  type: "dir" | "file";
  name: string;
  path: string;
  mtime?: number | null;
  children?: FileNode[];
};

export type WarningItem = {
  code: string;
  message: string;
  path?: string | null;
};

export type ExplorerState = {
  tree: FileNode[] | null;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  warnings: WarningItem[];
};

const listeners = new Set<() => void>();

let explorerState: ExplorerState = {
  tree: null,
  expandedDirs: new Set(),
  loadingDirs: new Set(),
  warnings: [],
};

function emitChange() {
  for (const listener of listeners) listener();
}

export function getExplorerState() {
  return explorerState;
}

export function setExplorerState(updater: (prev: ExplorerState) => ExplorerState) {
  explorerState = updater(explorerState);
  emitChange();
}

export function resetExplorerState() {
  explorerState = {
    tree: null,
    expandedDirs: new Set(),
    loadingDirs: new Set(),
    warnings: [],
  };
  emitChange();
}

export function useExplorerStore<T>(selector: (state: ExplorerState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(explorerState),
    () => selector(explorerState)
  );
}

export function setExpandedDirOpen(path: string, open: boolean) {
  setExplorerState((prev) => {
    const nextExpanded = new Set(prev.expandedDirs);
    if (open) {
      nextExpanded.add(path);
    } else {
      nextExpanded.delete(path);
    }
    return { ...prev, expandedDirs: nextExpanded };
  });
}

