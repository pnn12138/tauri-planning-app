
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Home from "./Home";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import ExplorerPanel from "./features/explorer/ExplorerPanel";
import MarkdownTabView from "./features/editor/MarkdownTabView";
import WebTabView from "./features/web/WebTabView";
import { deleteEntry, renameMarkdown, scanVault } from "./features/explorer/explorer.actions";
import { resetExplorerState, useExplorerStore } from "./features/explorer/explorer.store";
import PluginsPanel from "./features/plugins/PluginsPanel";
import { refreshPlugins, usePluginsStore } from "./features/plugins/plugins.store";
import {
  closeTab,
  getTabById,
  HOME_TAB_ID,
  openMarkdownTab,
  resetTabState,
  setActiveTabId,
  setTabState,
  useTabStore,
} from "./entities/tab/tab.store";
import { removeEditorTab, resetEditorStoreState, useEditorStore } from "./features/editor/editor.store";
import {
  clearStatus,
  setStatusKind,
  setStatusMessage as setStatus,
  useStatusStore,
} from "./shared/ui/status.store";
import { installWebBridge } from "./features/web/bridge";
import { goBack, goForward, navigateActiveWebTab, openWebTab, reloadWebTab } from "./features/web/web.actions";
import { removeWebTab, useWebStore } from "./features/web/web.store";
import CommandPalette from "./shared/ui/CommandPalette";
import { registerCommand as registerCoreCommand } from "./shared/commands/commands.store";
import { pluginHost } from "./shared/plugin_host/host";

import "./App.css";

import type {
  ApiError,
  ApiResponse,
} from "./shared/types/api";
import type { MarkdownTab } from "./entities/tab/tab.model";
import { isMarkdownTab, isWebTab } from "./entities/tab/tab.model";

const DEFAULT_WEB_TAB_URL = "https://example.com";
const DEFAULT_SEARCH_URL = "https://www.google.com/search?q=";
async function invokeApi<T>(command: string, args?: Record<string, unknown>) {
  const response = await invoke<ApiResponse<T>>(command, args);
  if (response.ok) {
    return response.data;
  }
  throw response.error;
}

function getVaultDisplayName(vaultRoot: string | null) {
  if (!vaultRoot) return "No vault selected";
  let normalized = vaultRoot;
  if (normalized.startsWith("\\\\?\\")) {
    normalized = normalized.slice(4);
  }
  normalized = normalized.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? vaultRoot;
}

function getFileTitle(path: string) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function isPathInDir(path: string, dir: string) {
  if (!dir) return true;
  return path === dir || path.startsWith(`${dir}/`);
}

function replacePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  if (path === oldPrefix) return newPrefix;
  if (!oldPrefix) return path;
  if (path.startsWith(`${oldPrefix}/`)) {
    return `${newPrefix}${path.slice(oldPrefix.length)}`;
  }
  return path;
}

function normalizeAddressInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  const looksLikeUrl = !/\s/.test(trimmed) && trimmed.includes(".");
  if (looksLikeUrl) {
    return `https://${trimmed}`;
  }
  return `${DEFAULT_SEARCH_URL}${encodeURIComponent(trimmed)}`;
}
function App() {
  const isTauriRuntime = isTauri();
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const [topBarHeight, setTopBarHeight] = useState(0);
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isPluginsOpen, setIsPluginsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const status = useStatusStore((state) => state.message);
  const statusKindValue = useStatusStore((state) => state.kind);
  const warnings = useExplorerStore((state) => state.warnings);
  const tabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const editorByTab = useEditorStore((state) => state.editorByTab);
  const enabledPluginManifests = usePluginsStore((state) =>
    state.plugins
      .filter((plugin) => plugin.enabled && plugin.manifest && !plugin.error)
      .map((plugin) => plugin.manifest!)
  );
  const [isMaximized, setIsMaximized] = useState(false);
  const [addressInput, setAddressInput] = useState("Home");
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const mainWindowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);

  const handleTopBarMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isTauriRuntime || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          "button, input, textarea, select, a, [role='button'], [data-no-drag]"
        )
      ) {
        return;
      }
      event.preventDefault();
      const windowRef = mainWindowRef.current ?? getCurrentWindow();
      mainWindowRef.current = windowRef;
      windowRef.startDragging().catch((error) => {
        setStatusKind("error");
        setStatus(`Drag failed: ${String(error)}`);
      });
    },
    [isTauriRuntime]
  );

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeMarkdownTab = isMarkdownTab(activeTab) ? activeTab : null;
  const activeWebTab = isWebTab(activeTab) ? activeTab : null;
  const activeEditorState = activeMarkdownTab ? editorByTab[activeMarkdownTab.id] ?? null : null;
  const isSaving = Boolean(activeEditorState?.isSaving);
  const webByTab = useWebStore((state) => state.webByTab);
  const activeWebState = activeTab?.type === "web" ? webByTab[activeTabId] ?? null : null;

  const handleOpenWebTab = useCallback(
    (url: string, activate = true) => {
      openWebTab(url, { activate });
    },
    []
  );

  const handleOpenMarkdownTab = useCallback(
    async (path: string, activate = true) => {
      if (isSaving) {
        setStatusKind("info");
        setStatus("Save in progress. Please wait.");
        return;
      }

      if (activeMarkdownTab && activeEditorState?.dirty && activeMarkdownTab.filePath !== path) {
        const proceed = window.confirm(
          "You have unsaved changes. Discard them and open another file?"
        );
        if (!proceed) return;
      }

      openMarkdownTab(path, { activate });
      clearStatus();
    },
    [activeEditorState?.dirty, activeMarkdownTab, isSaving]
  );

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const tab = getTabById(tabId);
      closeTab(tabId);
      if (tab?.type === "markdown") {
        removeEditorTab(tabId);
      }
      if (tab?.type === "web") {
        removeWebTab(tabId);
      }
    },
    []
  );

  const handleBack = useCallback(() => {
    if (!activeTab || activeTab.type !== "web") return;
    if (!activeWebState?.canBack) return;
    goBack(activeTab.id);
  }, [activeTab, activeWebState?.canBack]);

  const handleForward = useCallback(() => {
    if (!activeTab || activeTab.type !== "web") return;
    if (!activeWebState?.canForward) return;
    goForward(activeTab.id);
  }, [activeTab, activeWebState?.canForward]);

  const handleReload = useCallback(() => {
    if (!activeTab || activeTab.type !== "web") return;
    reloadWebTab(activeTab.id);
  }, [activeTab]);

  const handleNewTab = useCallback(() => {
    handleOpenWebTab(DEFAULT_WEB_TAB_URL, true);
  }, [handleOpenWebTab]);

  const handleAddressSubmit = useCallback(
    (value: string) => {
      const normalized = normalizeAddressInput(value);
      if (!normalized) {
        setStatusKind("info");
        setStatus("Enter a URL or search keyword.");
        return;
      }
      setIsEditingAddress(false);
      if (activeTab?.type === "web") {
        navigateActiveWebTab(activeTab.id, normalized);
        return;
      }
      handleOpenWebTab(normalized, true);
    },
    [activeTab, handleOpenWebTab]
  );

  const refreshExplorer = useCallback(
    async (options?: { silent?: boolean; resetExpanded?: boolean }) => {
      if (!options?.silent) {
        clearStatus();
      }
      try {
        const result = await scanVault({ resetExpanded: options?.resetExpanded });
        setVaultRoot(result.vaultRoot);
      } catch (error) {
        const err = error as { code?: string } | null;
        if (err && typeof err === "object" && err.code === "NoVaultSelected") {
          setVaultRoot(null);
          resetExplorerState();
          resetEditorStoreState();
          resetTabState();
          return;
        }
        if (!options?.silent) {
          setStatusKind("error");
          setStatus(formatError(error));
        }
      }
    },
    []
  );

  useEffect(() => {
    void refreshExplorer({ silent: true, resetExpanded: true });
  }, [refreshExplorer]);

  const handleExplorerRenameEntry = useCallback(
    async (input: { kind: "file" | "dir"; path: string; newName: string }) => {
      try {
        const result = await renameMarkdown({ path: input.path, newName: input.newName });
        setTabState((prev) => ({
          ...prev,
          tabs: prev.tabs.map((tab) => {
            if (tab.type !== "markdown") return tab;
            if (input.kind === "file") {
              if (tab.filePath !== result.oldPath) return tab;
              return {
                ...tab,
                filePath: result.newPath,
                title: getFileTitle(result.newPath),
              };
            }

            if (!isPathInDir(tab.filePath, result.oldPath)) return tab;
            const nextPath = replacePathPrefix(tab.filePath, result.oldPath, result.newPath);
            return {
              ...tab,
              filePath: nextPath,
              title: getFileTitle(nextPath),
            };
          }),
        }));
        setStatusKind("info");
        setStatus(`已重命名：${result.oldPath} -> ${result.newPath}`);
      } catch (error) {
        setStatusKind("error");
        setStatus(formatError(error));
      }
    },
    []
  );

  const handleExplorerDeleteEntry = useCallback(
    async (input: { kind: "file" | "dir"; path: string; name: string }) => {
      if (!isTauriRuntime) {
        setStatusKind("error");
        setStatus("删除需要在 Tauri 运行时中使用。");
        return;
      }

      const isDir = input.kind === "dir";
      const targetPath = input.path;
      const isAffected = (filePath: string) =>
        isDir ? isPathInDir(filePath, targetPath) : filePath === targetPath;

      const affectedMarkdownTabs = tabs.filter(
        (tab): tab is MarkdownTab => tab.type === "markdown" && isAffected(tab.filePath)
      );
      const dirtyTabs = affectedMarkdownTabs.filter((tab) => editorByTab[tab.id]?.dirty);
      if (dirtyTabs.length > 0) {
        const dirtyLinesMax = 8;
        const dirtyLines = dirtyTabs
          .slice(0, dirtyLinesMax)
          .map((tab) => `- ${tab.filePath}`)
          .join("\n");
        const dirtyMore =
          dirtyTabs.length > dirtyLinesMax
            ? `\n- ... (+${dirtyTabs.length - dirtyLinesMax})`
            : "";
        const proceed = window.confirm(
          `Warning: the following open files have unsaved changes. Deleting will discard them:\n${dirtyLines}${dirtyMore}\n\nContinue?`
        );
        if (!proceed) return;
      }

      const confirmed = window.confirm(
        isDir
          ? `确认删除文件夹“${input.name}”及其内容吗？`
          : `确认删除文件“${input.name}”吗？`
      );
      if (!confirmed) return;

      try {
        await deleteEntry({ path: targetPath });

        const removedTabIds = new Set(affectedMarkdownTabs.map((tab) => tab.id));
        if (removedTabIds.size > 0) {
          setTabState((prev) => {
            const nextTabs = prev.tabs.filter((tab) => !removedTabIds.has(tab.id));
            if (!removedTabIds.has(prev.activeTabId)) {
              return { ...prev, tabs: nextTabs };
            }

            const currentIndex = prev.tabs.findIndex((tab) => tab.id === prev.activeTabId);
            let resolvedActiveId = HOME_TAB_ID;
            for (let index = currentIndex - 1; index >= 0; index--) {
              const candidate = prev.tabs[index];
              if (!candidate) continue;
              if (!removedTabIds.has(candidate.id)) {
                resolvedActiveId = candidate.id;
                break;
              }
            }
            if (resolvedActiveId === HOME_TAB_ID) {
              for (let index = currentIndex + 1; index < prev.tabs.length; index++) {
                const candidate = prev.tabs[index];
                if (!candidate) continue;
                if (!removedTabIds.has(candidate.id)) {
                  resolvedActiveId = candidate.id;
                  break;
                }
              }
            }

            return { ...prev, tabs: nextTabs, activeTabId: resolvedActiveId };
          });
          for (const tabId of removedTabIds) {
            removeEditorTab(tabId);
          }
        }

        setStatusKind("info");
        setStatus(`已删除：${targetPath}`);
      } catch (error) {
        setStatusKind("error");
        setStatus(formatError(error));
      }
    },
    [editorByTab, isTauriRuntime, tabs]
  );

  const handleSelectVault = useCallback(async () => {
    clearStatus();
    try {
      const result = await invokeApi<{ vaultRoot: string }>("select_vault");
      resetExplorerState();
      resetEditorStoreState();
      resetTabState();
      setVaultRoot(result.vaultRoot);
      await refreshExplorer({ resetExpanded: true, silent: true });
      setActiveTabId(HOME_TAB_ID);
    } catch (error) {
      setStatusKind("error");
      setStatus(formatError(error));
    }
  }, [refreshExplorer]);

  const handleOpenFile = useCallback(
    async (path: string) => {
      await handleOpenMarkdownTab(path, true);
    },
    [handleOpenMarkdownTab]
  );

  useEffect(() => {
    const cleanup = installWebBridge({ enabled: isTauriRuntime });
    return () => cleanup();
  }, [isTauriRuntime]);

  useEffect(() => {
    registerCoreCommand({
      key: "core:select-vault",
      title: "Select Vault",
      source: "core",
      run: async () => {
        await handleSelectVault();
      },
    });
    registerCoreCommand({
      key: "core:open-plugins",
      title: "Open Plugins",
      source: "core",
      run: () => setIsPluginsOpen(true),
    });
    registerCoreCommand({
      key: "core:open-command-palette",
      title: "Open Command Palette",
      source: "core",
      run: () => setIsCommandPaletteOpen(true),
    });
  }, [handleSelectVault]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      setIsCommandPaletteOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const updateHeight = () => {
      if (!topBarRef.current) return;
      const rect = topBarRef.current.getBoundingClientRect();
      setTopBarHeight(rect.height);
    };
    updateHeight();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateHeight)
        : null;
    if (observer && topBarRef.current) {
      observer.observe(topBarRef.current);
    }
    window.addEventListener("resize", updateHeight);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);



  useEffect(() => {
    if (!isTauriRuntime) return;
    const setup = async () => {
      const windowRef = mainWindowRef.current ?? getCurrentWindow();
      mainWindowRef.current = windowRef;
      setIsMaximized(await windowRef.isMaximized());
      const unlistenResize = await windowRef.onResized(async () => {
        setIsMaximized(await windowRef.isMaximized());
      });
      const unlistenFocus = await windowRef.onFocusChanged(async () => {
        setIsMaximized(await windowRef.isMaximized());
      });
      return () => {
        unlistenResize();
        unlistenFocus();
      };
    };
    let cleanup: (() => void) | undefined;
    void setup().then((dispose) => {
      cleanup = dispose;
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime || !vaultRoot) {
      pluginHost.unloadAll();
      return;
    }
    void refreshPlugins().catch((error) => {
      setStatusKind("error");
      setStatus(formatError(error));
    });
  }, [isTauriRuntime, vaultRoot]);

  useEffect(() => {
    if (!isTauriRuntime || !vaultRoot) {
      pluginHost.unloadAll();
      return;
    }
    void pluginHost.syncEnabledManifests(enabledPluginManifests).catch((error) => {
      setStatusKind("error");
      setStatus(formatError(error));
    });
  }, [enabledPluginManifests, isTauriRuntime, vaultRoot]);

  const vaultDisplayName = getVaultDisplayName(vaultRoot);
  const canGoBack = Boolean(activeWebState?.canBack);
  const canGoForward = Boolean(activeWebState?.canForward);
  const canReload = Boolean(activeTab?.type === "web");
  const workspacePaddingTop = topBarHeight + 16;
  const addressDisplayValue = activeTab?.type === "web"
    ? activeWebState?.url ?? activeWebTab?.url ?? "about:blank"
    : activeMarkdownTab
      ? activeMarkdownTab.filePath
      : "Home";
  const addressIsLoading = Boolean(activeWebState?.loading);

  useEffect(() => {
    if (isEditingAddress) return;
    setAddressInput(addressDisplayValue);
  }, [addressDisplayValue, isEditingAddress]);
  return (
    <div className="app-shell">
      <header
        className="top-bar"
        ref={topBarRef}
        data-tauri-drag-region="false"
        onMouseDown={handleTopBarMouseDown}
      >
        <div className="browser-bar" data-tauri-drag-region="false">
          <div className="app-brand" data-tauri-drag-region>
            <img src="/tauri.svg" alt="" className="app-logo" />
            <span className="app-title">tauri-planning-app</span>
          </div>
          {isTauriRuntime && (
            <div className="nav-controls" data-tauri-drag-region="false">
              <button
                type="button"
                className={`ghost icon-only ${canGoBack ? "" : "is-disabled"}`}
                onClick={() => {
                  if (activeTab?.type !== "web") {
                    setStatusKind("info");
                    setStatus("No web tab is active.");
                    return;
                  }
                  if (!canGoBack) {
                    setStatusKind("info");
                    setStatus("No back history for this tab.");
                    return;
                  }
                  handleBack();
                }}
                data-tauri-drag-region="false"
                aria-label="Back"
                title="Back"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M10.5 3 5.5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className={`ghost icon-only ${canGoForward ? "" : "is-disabled"}`}
                onClick={() => {
                  if (activeTab?.type !== "web") {
                    setStatusKind("info");
                    setStatus("No web tab is active.");
                    return;
                  }
                  if (!canGoForward) {
                    setStatusKind("info");
                    setStatus("No forward history for this tab.");
                    return;
                  }
                  handleForward();
                }}
                data-tauri-drag-region="false"
                aria-label="Forward"
                title="Forward"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M5.5 3 10.5 8l-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className={`ghost icon-only ${canReload ? "" : "is-disabled"}`}
                onClick={() => {
                  if (activeTab?.type !== "web") {
                    setStatusKind("info");
                    setStatus("No web tab is active.");
                    return;
                  }
                  handleReload();
                }}
                data-tauri-drag-region="false"
                aria-label="Reload"
                title="Reload"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M12.5 8a4.5 4.5 0 1 1-2-3.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12.5 3.5v3.2H9.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
          <form
            className={`address-bar ${addressIsLoading ? "is-loading" : ""}`}
            data-tauri-drag-region="false"
            onSubmit={(event) => {
              event.preventDefault();
              handleAddressSubmit(addressInput);
            }}
          >
            <input
              ref={addressInputRef}
              className="address-input"
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
              onFocus={() => setIsEditingAddress(true)}
              onBlur={() => setIsEditingAddress(false)}
              spellCheck={false}
              data-tauri-drag-region="false"
              aria-label="Address"
            />
            {addressIsLoading && (
              <span className="address-status" aria-hidden="true">
                Loading...
              </span>
            )}
          </form>
          {isTauriRuntime && (
            <div className="window-controls" data-tauri-drag-region="false">
              <button
                type="button"
                className="ghost icon-only"
                onClick={async () => {
                  try {
                    const windowRef =
                      mainWindowRef.current ?? getCurrentWindow();
                    mainWindowRef.current = windowRef;
                    await windowRef.minimize();
                  } catch (error) {
                    setStatusKind("error");
                    setStatus(`Minimize failed: ${String(error)}`);
                  }
                }}
                data-tauri-drag-region="false"
                aria-label="Minimize"
                title="Minimize"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3 11.5h10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="ghost icon-only"
                onClick={async () => {
                  try {
                    const windowRef =
                      mainWindowRef.current ?? getCurrentWindow();
                    mainWindowRef.current = windowRef;
                    await windowRef.toggleMaximize();
                    setIsMaximized(await windowRef.isMaximized());
                  } catch (error) {
                    setStatusKind("error");
                    setStatus(`Maximize failed: ${String(error)}`);
                  }
                }}
                data-tauri-drag-region="false"
                aria-label={isMaximized ? "Restore" : "Maximize"}
                title={isMaximized ? "Restore" : "Maximize"}
              >
                {isMaximized ? (
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <rect
                      x="4"
                      y="4"
                      width="8"
                      height="8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M6 4V2h8v8h-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <rect
                      x="3"
                      y="3"
                      width="10"
                      height="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className="ghost icon-only is-danger"
                onClick={async () => {
                  try {
                    const windowRef =
                      mainWindowRef.current ?? getCurrentWindow();
                    mainWindowRef.current = windowRef;
                    await windowRef.close();
                  } catch (error) {
                    setStatusKind("error");
                    setStatus(`Close failed: ${String(error)}`);
                  }
                }}
                data-tauri-drag-region="false"
                aria-label="Close"
                title="Close"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
        <div className="tab-bar" data-tauri-drag-region="false">
          <div className="tab-strip">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tab-item ${tab.id === activeTabId ? "is-active" : ""}`}
                onClick={() => handleTabClick(tab.id)}
                data-tauri-drag-region="false"
              >
                <span className="tab-title">
                  {tab.type === "web" && webByTab[tab.id]?.loading
                    ? "Loading..."
                    : tab.title}
                </span>
                {tab.type !== "home" && (
                  <span
                    className="tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleCloseTab(tab.id);
                    }}
                    data-tauri-drag-region="false"
                  >
                    x
                  </span>
                )}
              </button>
            ))}
              <button
                type="button"
                className="tab-add"
                onClick={handleNewTab}
                data-tauri-drag-region="false"
              >
                +
              </button>
          </div>
          <div className="top-actions" data-tauri-drag-region="false">
            <div className="top-left">
              <button
                type="button"
                className={`icon-button ${sidebarOpen ? "is-active" : ""}`}
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label={sidebarOpen ? "Hide files" : "Show files"}
                title={sidebarOpen ? "Hide files" : "Show files"}
                data-tauri-drag-region="false"
              >
                <span className="icon-bars" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsCommandPaletteOpen(true)}
                aria-label="Open command palette"
                title="Commands (Ctrl/Cmd+P)"
                data-tauri-drag-region="false"
              >
                ⌘P
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsPluginsOpen(true)}
                aria-label="Open plugins"
                title="Plugins"
                data-tauri-drag-region="false"
              >
                Plugins
              </button>
            </div>
            <div className="top-right">
              {status && (
                <div
                  className={`status ${statusKindValue === "error" ? "is-error" : ""}`}
                  data-tauri-drag-region="false"
                >
                  <span className="status-text">{status}</span>
                  <button
                    type="button"
                    className="status-close"
                    onClick={() => setStatus(null)}
                    aria-label="Dismiss status"
                    data-tauri-drag-region="false"
                  >
                    x
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="workspace" style={{ paddingTop: `${workspacePaddingTop}px` }}>
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="vault-meta">
              <button
                type="button"
                className="vault-name-button"
                onDoubleClick={handleSelectVault}
                disabled={isSaving}
                data-tauri-drag-region="false"
              >
                {vaultDisplayName}
              </button>
            </div>
            <ExplorerPanel
              vaultRoot={vaultRoot}
              openTab={handleOpenFile}
              activePath={activeMarkdownTab?.filePath ?? null}
              onRenameEntry={handleExplorerRenameEntry}
              onDeleteEntry={handleExplorerDeleteEntry}
            />
          </aside>
        )}

        <main className="content-pane">
          {activeTab?.type === "home" && (
            <Home hasVault={!!vaultRoot} onSelectVault={handleSelectVault} />
          )}

          {activeTab?.type === "markdown" && (
            <MarkdownTabView tabId={activeTabId} />
          )}

          <WebTabView tabId={activeTabId} />
        </main>
      </div>

      {warnings.length > 0 && (
        <div className="warning-bar">
          {warnings.map((warning, index) => (
            <div key={`${warning.code}-${index}`}>
              {warning.code}: {warning.message}
              {warning.path ? ` (${warning.path})` : ""}
            </div>
          ))}
        </div>
      )}

      <CommandPalette open={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
      {isPluginsOpen && <PluginsPanel onClose={() => setIsPluginsOpen(false)} />}

    </div>
  );
}

function formatError(error: unknown) {
  if (typeof error === "string") {
    return `UnexpectedError: ${error}`;
  }
  if (!error || typeof error !== "object") {
    return "UnexpectedError: Unexpected error.";
  }
  const err = error as ApiError;
  if (!err.code || !err.message) {
    try {
      return `UnexpectedError: ${JSON.stringify(error)}`;
    } catch (_err) {
      return "UnexpectedError: Unexpected error.";
    }
  }
  const details = err.details;
  const detailParts: string[] = [];
  if (details && typeof details === "object") {
    const detailRecord = details as Record<string, unknown>;
    if (typeof detailRecord.step === "string") {
      detailParts.push(`step=${detailRecord.step}`);
    }
    if (typeof detailRecord.path === "string") {
      detailParts.push(`path=${detailRecord.path}`);
    }
    if (typeof detailRecord.error === "string") {
      detailParts.push(`error=${detailRecord.error}`);
    }
  }
  const detailText = detailParts.length ? ` (${detailParts.join(", ")})` : "";
  return `${err.code}: ${err.message}${detailText}`;
}

export default App;
