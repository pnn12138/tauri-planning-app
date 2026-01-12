import { invokeBackend } from "./explorer.api";
import { getExplorerState, setExplorerState } from "./explorer.store";
import type { FileNode, WarningItem } from "./explorer.store";

export type ScanVaultResponse = {
  vaultRoot: string;
  tree: FileNode[];
  warnings: WarningItem[];
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

const dirScanReqId = new Map<string, number>();

function mergeFileTree(
  existing: FileNode[] | null | undefined,
  incoming: FileNode[]
): FileNode[] {
  if (!existing?.length) return incoming;
  const existingByPath = new Map(existing.map((node) => [node.path, node]));
  return incoming.map((node) => {
    const prev = existingByPath.get(node.path);
    if (!prev) return node;
    if (node.type !== prev.type) return node;
    if (node.type === "dir") {
      const hasExistingChildren = prev.children !== undefined;
      const hasIncomingChildren = node.children !== undefined;
      if (hasIncomingChildren && hasExistingChildren) {
        return { ...node, children: mergeFileTree(prev.children, node.children ?? []) };
      }
      if (!hasIncomingChildren && hasExistingChildren) {
        return { ...node, children: prev.children };
      }
    }
    return node;
  });
}

function updateTree(
  nodes: FileNode[],
  path: string,
  updater: (node: FileNode) => FileNode
): FileNode[] {
  return nodes.map((node) => {
    if (node.path === path) return updater(node);
    if (node.children) {
      return { ...node, children: updateTree(node.children, path, updater) };
    }
    return node;
  });
}

export async function scanVault(options?: { resetExpanded?: boolean }) {
  const result = await invokeBackend<ScanVaultResponse>("scan_vault");
  setExplorerState((prev) => {
    const mergedTree = options?.resetExpanded ? result.tree : mergeFileTree(prev.tree, result.tree);
    return {
      ...prev,
      tree: mergedTree,
      warnings: result.warnings ?? [],
      expandedDirs: options?.resetExpanded ? new Set() : prev.expandedDirs,
    };
  });
  return result;
}

export async function loadDirChildren(path: string) {
  const nextReqId = (dirScanReqId.get(path) ?? 0) + 1;
  dirScanReqId.set(path, nextReqId);

  setExplorerState((prev) => {
    const nextLoading = new Set(prev.loadingDirs);
    nextLoading.add(path);
    return { ...prev, loadingDirs: nextLoading };
  });

  try {
    const result = await invokeBackend<ScanVaultResponse>("scan_vault", { path });
    if (dirScanReqId.get(path) !== nextReqId) return result;

    setExplorerState((prev) => {
      if (!prev.tree) return prev;
      const nextTree = updateTree(prev.tree, path, (node) => ({
        ...node,
        children: mergeFileTree(node.children, result.tree),
      }));
      return { ...prev, tree: nextTree, warnings: [...prev.warnings, ...(result.warnings ?? [])] };
    });
    return result;
  } finally {
    setExplorerState((prev) => {
      const nextLoading = new Set(prev.loadingDirs);
      nextLoading.delete(path);
      return { ...prev, loadingDirs: nextLoading };
    });
  }
}

export async function renameMarkdown(input: { path: string; newName: string }) {
  const result = await invokeBackend<RenameMarkdownResponse>("rename_markdown", {
    input: { path: input.path, newName: input.newName },
  });
  await scanVault();
  return result;
}

export async function deleteEntry(input: { path: string }) {
  const result = await invokeBackend<DeleteEntryResponse>("delete_entry", {
    input: { path: input.path },
  });
  await scanVault();
  return result;
}

export async function createEntry(input: { parentPath: string; kind: "file" | "dir" }) {
  const result = await invokeBackend<CreateEntryResponse>("create_entry", {
    input: { parentPath: input.parentPath, kind: input.kind },
  });
  await scanVault();
  if (input.parentPath) {
    await loadDirChildren(input.parentPath);
  }
  return result;
}

export function getExplorerTree() {
  return getExplorerState().tree;
}
