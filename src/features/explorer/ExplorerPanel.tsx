import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";

import { createEntry, deleteEntry, loadDirChildren, renameMarkdown, scanVault } from "./explorer.actions";
import { formatBackendError } from "./explorer.api";
import {
  resetExplorerState,
  setExpandedDirOpen,
  useExplorerStore,
} from "./explorer.store";
import type { FileNode } from "./explorer.store";
import ContextMenu from "../../shared/ui/ContextMenu";
import { getExplorerContextMenuSchema } from "./explorer.menus";

export type ExplorerPanelProps = {
  vaultRoot: string | null;
  openTab: (path: string) => void;
  activePath: string | null;
  onRenameEntry?: (input: {
    kind: "file" | "dir";
    path: string;
    newName: string;
  }) => Promise<void>;
  onDeleteEntry?: (input: {
    kind: "file" | "dir";
    path: string;
    name: string;
  }) => Promise<void>;
};

export default function ExplorerPanel(props: ExplorerPanelProps) {
  const isTauriRuntime = isTauri();
  const tree = useExplorerStore((state) => state.tree);
  const expandedDirs = useExplorerStore((state) => state.expandedDirs);
  const loadingDirs = useExplorerStore((state) => state.loadingDirs);
  const treeWrapperRef = useRef<HTMLDivElement | null>(null);

  const [menu, setMenu] = useState<
    | null
    | ({ x: number; y: number } & (
      | { type: "blank"; parentPath: string }
      | { type: "file"; path: string; name: string }
      | { type: "dir"; path: string; name: string }
    ))
  >(null);

  useEffect(() => {
    if (!props.vaultRoot) {
      resetExplorerState();
      return;
    }
    if (!tree) {
      void scanVault({ resetExpanded: true });
    }
  }, [props.vaultRoot, tree]);

  useEffect(() => {
    if (!props.vaultRoot) return;
    const timer = window.setInterval(() => {
      void scanVault();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [props.vaultRoot]);

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && treeWrapperRef.current?.contains(target)) {
        const inMenu = (target as HTMLElement | null)?.closest?.(".tree-context-menu");
        if (inMenu) return;
      }
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const menuItems = useMemo(() => {
    if (!menu) return [];
    const schema = getExplorerContextMenuSchema(menu);
    return schema.map((item) => ({
      id: item.id,
      label: item.label,
      danger: item.danger,
      disabled: item.disabled,
    }));
  }, [menu]);

  async function handleMenuSelect(id: string) {
    if (!menu) return;
    if (!isTauriRuntime) {
      window.alert("文件操作需要在 Tauri 运行时中使用。");
      return;
    }

    try {
      if (id === "create_file" || id === "create_dir") {
        const parentPath =
          menu.type === "blank" ? menu.parentPath : menu.type === "dir" ? menu.path : "";
        await createEntry({ parentPath, kind: id === "create_file" ? "file" : "dir" });
        return;
      }

      if (id === "rename") {
        if (menu.type === "blank") return;
        const nextName = window.prompt("重命名为：", menu.name);
        if (!nextName) return;
        const raw = nextName.trim();
        if (!raw || raw === "." || raw === "..") {
          window.alert("无效名称。");
          return;
        }
        if (raw.includes("/") || raw.includes("\\")) {
          window.alert("名称不能包含路径分隔符。");
          return;
        }

        let finalName = raw;
        if (menu.type === "file") {
          if (!finalName.toLowerCase().endsWith(".md")) {
            if (finalName.includes(".")) {
              window.alert("只能重命名 .md 文件。");
              return;
            }
            finalName = `${finalName}.md`;
          }
        }

        if (props.onRenameEntry) {
          await props.onRenameEntry({
            kind: menu.type,
            path: menu.path,
            newName: finalName,
          });
          return;
        }

        await renameMarkdown({ path: menu.path, newName: finalName });
        return;
      }

      if (id === "delete") {
        if (menu.type === "blank") return;
        if (props.onDeleteEntry) {
          await props.onDeleteEntry({
            kind: menu.type,
            path: menu.path,
            name: menu.name,
          });
          return;
        }
        const confirmed = window.confirm(
          menu.type === "dir"
            ? `确认删除文件夹“${menu.name}”及其内容吗？`
            : `确认删除文件“${menu.name}”吗？`
        );
        if (!confirmed) return;
        await deleteEntry({ path: menu.path });
        return;
      }
    } catch (error) {
      window.alert(formatBackendError(error));
    }
  }

  function renderTree(nodes: FileNode[], depth = 0) {
    return nodes.map((node) => {
      if (node.type === "dir") {
        const isOpen = expandedDirs.has(node.path);
        const hasChildrenLoaded = node.children !== undefined;
        const isLoading = loadingDirs.has(node.path);
        return (
          <div key={node.path} className="tree-node">
            <div
              className={`tree-item tree-dir ${isOpen ? "is-open" : ""}`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => {
                const nextOpen = !isOpen;
                setExpandedDirOpen(node.path, nextOpen);
                if (nextOpen && !hasChildrenLoaded && !isLoading) {
                  void loadDirChildren(node.path);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                const menuWidth = 200;
                const menuHeight = 144;
                const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
                const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
                setMenu({ type: "dir", path: node.path, name: node.name, x, y });
              }}
              data-tauri-drag-region="false"
            >
              <span className="tree-icon">
                {isLoading ? "…" : isOpen ? "v" : ">"}
              </span>
              <span className="tree-label">{node.name}</span>
            </div>
            {isOpen && node.children && renderTree(node.children, depth + 1)}
          </div>
        );
      }

      const isActive = props.activePath === node.path;
      return (
        <div key={node.path} className="tree-node">
          <div
            className={`tree-item tree-file ${isActive ? "is-active" : ""}`}
            style={{ paddingLeft: `${depth * 16 + 24}px` }}
            onClick={() => props.openTab(node.path)}
            onContextMenu={(event) => {
              event.preventDefault();
              const menuWidth = 200;
              const menuHeight = 96;
              const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
              const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
              setMenu({ type: "file", path: node.path, name: node.name, x, y });
            }}
            data-tauri-drag-region="false"
          >
            <span className="tree-label">{node.name}</span>
          </div>
        </div>
      );
    });
  }

  const placeholder = props.vaultRoot
    ? "正在扫描库..."
    : "选择一个库以浏览文件。";

  return (
    <div
      className="tree"
      ref={treeWrapperRef}
      data-tauri-drag-region="false"
      onContextMenu={(event) => {
        event.preventDefault();
        if (!props.vaultRoot) return;
        const menuWidth = 200;
        const menuHeight = 96;
        const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
        const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
        setMenu({ type: "blank", parentPath: "", x, y });
      }}
    >
      {tree ? renderTree(tree) : <div className="placeholder">{placeholder}</div>}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onSelect={(id) => void handleMenuSelect(id)}
          onRequestClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
