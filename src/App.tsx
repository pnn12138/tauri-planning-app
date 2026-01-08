
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import Home from "./Home";
import "./App.css";

type ApiError = { code: string; message: string; details?: unknown };
type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

type FileNode = {
  type: "dir" | "file";
  name: string;
  path: string;
  mtime?: number | null;
  children?: FileNode[];
};

type WarningItem = {
  code: string;
  message: string;
  path?: string | null;
};

type ScanVaultResponse = {
  vaultRoot: string;
  tree: FileNode[];
  warnings: WarningItem[];
};

type ReadMarkdownResponse = {
  path: string;
  content: string;
  mtime?: number | null;
};

type WriteMarkdownResponse = {
  path: string;
  mtime?: number | null;
};

type TabType = "home" | "markdown" | "web";

type BaseTab = {
  id: string;
  type: TabType;
  title: string;
};

type HomeTab = BaseTab & {
  type: "home";
};

type MarkdownTab = BaseTab & {
  type: "markdown";
  filePath: string;
};

type WebTab = BaseTab & {
  type: "web";
  url: string;
  loading: boolean;
  error: string | null;
  history: string[];
  historyIndex: number;
  webviewLabel: string;
};

type Tab = HomeTab | MarkdownTab | WebTab;

type EditorState = {
  content: string;
  dirty: boolean;
  mtime: number | null;
  diskMtime: number | null;
  diskChangeNotified: boolean;
};

type WebviewStatePayload = {
  label: string;
  url?: string;
  title?: string;
  readyState?: string;
};

type WebviewOpenPayload = {
  label: string;
  url?: string;
};

const HOME_TAB_ID = "home";
const DEFAULT_WEB_TAB_URL = "https://example.com";
const DEFAULT_SEARCH_URL = "https://www.google.com/search?q=";
async function invokeApi<T>(command: string, args?: Record<string, unknown>) {
  const response = await invoke<ApiResponse<T>>(command, args);
  if (response.ok) {
    return response.data;
  }
  throw response.error;
}

function safeLink(uri?: string) {
  if (!uri) return "";
  const normalized = uri.trim().toLowerCase();
  if (normalized.startsWith("javascript:") || normalized.startsWith("data:")) {
    return "";
  }
  return uri;
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

function getTabTitleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (_error) {
    return url;
  }
}

function getFileTitle(path: string) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
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

function resolveRelativePath(basePath: string | null, href: string) {
  const cleaned = href.replace(/\\/g, "/");
  if (!cleaned) return null;
  const withoutHash = cleaned.split("#")[0];
  if (!withoutHash) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withoutHash)) return null;

  let target = withoutHash;
  if (target.startsWith("/")) {
    target = target.replace(/^\/+/, "");
  } else if (basePath) {
    const baseDir = basePath.split("/").slice(0, -1).join("/");
    target = baseDir ? `${baseDir}/${target}` : target;
  }

  const parts = target.split("/").filter((part) => part.length > 0);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

function isMarkdownTab(tab: Tab | null): tab is MarkdownTab {
  return Boolean(tab && tab.type === "markdown");
}

function isWebTab(tab: Tab | null): tab is WebTab {
  return Boolean(tab && tab.type === "web");
}

class PreviewErrorBoundary extends React.Component<
  { content: string; children: React.ReactNode },
  { hasError: boolean; error?: unknown }
> {
  constructor(props: { content: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: { content: string }) {
    if (prevProps.content !== this.props.content && this.state.hasError) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="preview-fallback">
          <div className="preview-fallback-title">PreviewError: render failed.</div>
          <pre className="preview-fallback-body">{this.props.content || " "}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
function App() {
  const isTauriRuntime = isTauri();
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const webviewHostRef = useRef<HTMLDivElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const [topBarHeight, setTopBarHeight] = useState(0);
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"info" | "error">("info");
  const [warnings, setWarnings] = useState<WarningItem[]>([]);
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: HOME_TAB_ID,
      type: "home",
      title: "Home",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(HOME_TAB_ID);
  const [editorByTab, setEditorByTab] = useState<Record<string, EditorState>>(
    {}
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [addressInput, setAddressInput] = useState("Home");
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [lastActiveFile, setLastActiveFile] = useState<string | null>(null);
  const readReqId = useRef(new Map<string, number>());
  const tabIdRef = useRef(0);
  const webviewsRef = useRef<Map<string, Webview>>(new Map());
  const creatingWebviewsRef = useRef<Set<string>>(new Set());
  const webviewLoadingTimeouts = useRef<Map<string, number>>(new Map());
  const mainWindowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);
  const isSavingRef = useRef(false);
  const isScanningRef = useRef(false);

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

  const editorExtensions = useMemo(
    () => [markdown({ codeLanguages: languages })],
    []
  );

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeMarkdownTab = isMarkdownTab(activeTab) ? activeTab : null;
  const activeWebTab = isWebTab(activeTab) ? activeTab : null;
  const activeEditorState = activeMarkdownTab
    ? editorByTab[activeMarkdownTab.id] ?? null
    : null;
  const editorContent = activeEditorState?.content ?? "";
  const deferredContent = useDeferredValue(editorContent);

  const findNodeMtime = useCallback((nodes: FileNode[], path: string) => {
    for (const node of nodes) {
      if (node.path === path) {
        return node.mtime ?? null;
      }
      if (node.children) {
        const child = findNodeMtime(node.children, path);
        if (child !== null) return child;
      }
    }
    return null;
  }, []);

  const updateDiskMtimeFromTree = useCallback(
    (nodes: FileNode[]) => {
      if (!activeMarkdownTab) return;
      const latest = findNodeMtime(nodes, activeMarkdownTab.filePath);
      if (latest === null) return;

      setEditorByTab((prev) => {
        const current = prev[activeMarkdownTab.id];
        if (!current) return prev;
        const next: EditorState = { ...current, diskMtime: latest };
        if (
          current.dirty &&
          current.mtime !== null &&
          latest !== current.mtime &&
          !current.diskChangeNotified
        ) {
          setStatusKind("info");
          setStatus("File changed on disk.");
          next.diskChangeNotified = true;
        } else if (!current.dirty || latest === current.mtime) {
          next.diskChangeNotified = false;
        }
        return { ...prev, [activeMarkdownTab.id]: next };
      });
    },
    [activeMarkdownTab, findNodeMtime]
  );
  const getWebviewRect = useCallback(() => {
    const host = webviewHostRef.current;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    const width = Math.max(0, Math.round(rect.width));
    const height = Math.max(0, Math.round(rect.height));
    if (width === 0 || height === 0) return null;
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width,
      height,
    };
  }, []);

  const getWebviewPlacement = useCallback(async () => {
    if (!isTauriRuntime) return null;
    const rect = getWebviewRect();
    if (!rect) return null;
    const mainWindow = mainWindowRef.current ?? getCurrentWindow();
    mainWindowRef.current = mainWindow;
    const windowPosition = await mainWindow.innerPosition();
    const position = new LogicalPosition(
      windowPosition.x + rect.x,
      windowPosition.y + rect.y
    );
    const size = new LogicalSize(rect.width, rect.height);
    return { position, size };
  }, [getWebviewRect, isTauriRuntime]);

  const syncWebviewBounds = useCallback(async () => {
    const placement = await getWebviewPlacement();
    if (!placement) return;
    for (const webview of webviewsRef.current.values()) {
      try {
        await webview.setPosition(placement.position);
        await webview.setSize(placement.size);
      } catch (error) {
        const message = String(error);
        if (message.includes("not found")) {
          continue;
        }
        setStatusKind("error");
        setStatus(`Webview resize failed: ${message}`);
      }
    }
  }, [getWebviewPlacement]);

  const createWebviewForTab = useCallback(
    async (tab: WebTab, visible: boolean) => {
      if (!isTauriRuntime) return;
      if (webviewsRef.current.has(tab.id)) return;
      if (creatingWebviewsRef.current.has(tab.id)) return;
      creatingWebviewsRef.current.add(tab.id);
      try {
        const placement = await getWebviewPlacement();
        if (!placement) {
          requestAnimationFrame(() => {
            void createWebviewForTab(tab, visible);
          });
          return;
        }

        const mainWindow = mainWindowRef.current ?? getCurrentWindow();
        mainWindowRef.current = mainWindow;
        const webview = new Webview(mainWindow, tab.webviewLabel, {
          url: tab.url,
          x: placement.position.x,
          y: placement.position.y,
          width: placement.size.width,
          height: placement.size.height,
          focus: visible,
        });
        webviewsRef.current.set(tab.id, webview);

        await webview.once("tauri://created", () => {
          setTabs((prev) =>
            prev.map((item) =>
              item.id === tab.id ? { ...item, loading: false } : item
            )
          );
        });
        await webview.once("tauri://error", (event) => {
          setTabs((prev) =>
            prev.map((item) =>
              item.id === tab.id
                ? {
                    ...item,
                    loading: false,
                    error: "Webview failed to load.",
                  }
                : item
            )
          );
          const payload = (event as { payload?: unknown }).payload;
          setStatusKind("error");
          setStatus(
            `WebviewError: ${payload ? String(payload) : "Unknown error"}`
          );
        });

        if (!visible) {
          await webview.hide();
        }
      } finally {
        creatingWebviewsRef.current.delete(tab.id);
      }
    },
    [getWebviewPlacement, isTauriRuntime]
  );

  const updateTabState = useCallback((updated: Tab) => {
    setTabs((prev) => prev.map((tab) => (tab.id === updated.id ? updated : tab)));
  }, []);

  const scheduleWebviewLoadingClear = useCallback((tabId: string, url: string) => {
    const existing = webviewLoadingTimeouts.current.get(tabId);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timeoutId = window.setTimeout(() => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.type !== "web" || tab.id !== tabId) return tab;
          if (!tab.loading) return tab;
          if (tab.url !== url) return tab;
          return { ...tab, loading: false, error: "Load timed out." };
        })
      );
      webviewLoadingTimeouts.current.delete(tabId);
    }, 8000);
    webviewLoadingTimeouts.current.set(tabId, timeoutId);
  }, []);

  const openWebTab = useCallback(
    (url: string, activate = true) => {
      const normalized = url.trim();
      if (!/^https?:\/\//i.test(normalized)) {
        setStatusKind("info");
        setStatus("Only http/https links are supported.");
        return;
      }
      const id = `web-${Date.now()}-${tabIdRef.current++}`;
      const tab: WebTab = {
        id,
        type: "web",
        webviewLabel: `webview-${id}`,
        url: normalized,
        title: getTabTitleFromUrl(normalized),
        loading: true,
        error: null,
        history: [normalized],
        historyIndex: 0,
      };
      setTabs((prev) => [...prev, tab]);
      if (activate) {
        setActiveTabId(id);
      }
      scheduleWebviewLoadingClear(id, normalized);
      if (!isTauriRuntime) {
        setStatusKind("info");
        setStatus("Web tabs require the Tauri runtime.");
        return;
      }
      void createWebviewForTab(tab, activate);
    },
    [createWebviewForTab, isTauriRuntime]
  );

  const emitWebviewNav = useCallback(
    async (tab: WebTab, action: "back" | "forward" | "reload") => {
      const webview = webviewsRef.current.get(tab.id);
      if (!webview) return;
      updateTabState({ ...tab, loading: true });
      try {
        await webview.emit("webview-nav", { action });
      } catch (_error) {
        setStatusKind("error");
        setStatus("Webview navigation failed.");
      }
    },
    [updateTabState]
  );

  const emitWebviewNavigate = useCallback(
    async (tab: WebTab, url: string) => {
      const webview = webviewsRef.current.get(tab.id);
      if (!webview) return;
      updateTabState({
        ...tab,
        url,
        title: getTabTitleFromUrl(url),
        loading: true,
        error: null,
      });
      scheduleWebviewLoadingClear(tab.id, url);
      try {
        await webview.emit("webview-navigate", { url });
      } catch (_error) {
        setStatusKind("error");
        setStatus("Webview navigation failed.");
      }
    },
    [scheduleWebviewLoadingClear, updateTabState]
  );

  const recreateWebviewForTab = useCallback(
    async (
      tab: WebTab,
      url: string,
      mode: "push" | "replace" | "reload" | "back" | "forward"
    ) => {
      let history = tab.history;
      let historyIndex = tab.historyIndex;
      if (mode === "push") {
        if (history[historyIndex] !== url) {
          history = history.slice(0, historyIndex + 1);
          history.push(url);
          historyIndex = history.length - 1;
        }
      } else if (mode === "replace") {
        history = [...history];
        history[historyIndex] = url;
      } else if (mode === "back") {
        historyIndex = Math.max(0, historyIndex - 1);
      } else if (mode === "forward") {
        historyIndex = Math.min(history.length - 1, historyIndex + 1);
      }

      const nextUrl = mode === "back" || mode === "forward" ? history[historyIndex] : url;
      const updatedTab: WebTab = {
        ...tab,
        url: nextUrl,
        title: getTabTitleFromUrl(nextUrl),
        loading: true,
        error: null,
        history,
        historyIndex,
      };
      setTabs((prev) =>
        prev.map((item) => (item.id === tab.id ? updatedTab : item))
      );
      scheduleWebviewLoadingClear(tab.id, nextUrl);

      const existing = webviewsRef.current.get(tab.id);
      if (existing) {
        try {
          await existing.hide();
          await existing.close();
        } catch (error) {
          setStatusKind("error");
          setStatus(`Close webview failed: ${String(error)}`);
        } finally {
          webviewsRef.current.delete(tab.id);
        }
      }

      await createWebviewForTab(updatedTab, tab.id === activeTabId);
    },
    [activeTabId, createWebviewForTab, scheduleWebviewLoadingClear]
  );

  const openMarkdownTab = useCallback(
    async (path: string, activate = true) => {
      if (isSaving) {
        setStatusKind("info");
        setStatus("Save in progress. Please wait.");
        return;
      }

      const existing = tabs.find(
        (tab) => tab.type === "markdown" && tab.filePath === path
      ) as MarkdownTab | undefined;
      const currentEditor = activeMarkdownTab
        ? editorByTab[activeMarkdownTab.id]
        : null;

      if (
        currentEditor?.dirty &&
        activeMarkdownTab &&
        activeMarkdownTab.filePath !== path
      ) {
        const proceed = window.confirm(
          "You have unsaved changes. Discard them and open another file?"
        );
        if (!proceed) return;
      }

      if (existing) {
        if (activate) setActiveTabId(existing.id);
        return;
      }

      const id = `md-${Date.now()}-${tabIdRef.current++}`;
      const tab: MarkdownTab = {
        id,
        type: "markdown",
        title: getFileTitle(path),
        filePath: path,
      };
      setTabs((prev) => [...prev, tab]);
      setEditorByTab((prev) => ({
        ...prev,
        [id]: {
          content: "",
          dirty: false,
          mtime: null,
          diskMtime: null,
          diskChangeNotified: false,
        },
      }));
      if (activate) setActiveTabId(id);
      setStatus(null);

      const nextReqId = (readReqId.current.get(id) ?? 0) + 1;
      readReqId.current.set(id, nextReqId);
      try {
        const result = await invokeApi<ReadMarkdownResponse>("read_markdown", {
          input: { path },
        });
        if (readReqId.current.get(id) !== nextReqId) return;
        setEditorByTab((prev) => ({
          ...prev,
          [id]: {
            content: result.content,
            dirty: false,
            mtime: result.mtime ?? null,
            diskMtime: result.mtime ?? null,
            diskChangeNotified: false,
          },
        }));
        setLastActiveFile(result.path);
      } catch (error) {
        if (readReqId.current.get(id) !== nextReqId) return;
        setStatusKind("error");
        setStatus(formatError(error));
      }
    },
    [activeMarkdownTab, editorByTab, isSaving, tabs]
  );
  const handleTabClick = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      setTabs((prev) => {
        const next = prev.filter((tab) => tab.id !== tabId);
        const index = prev.findIndex((tab) => tab.id === tabId);
        if (activeTabId === tabId) {
          const nextTab = next[index - 1] ?? next[index] ?? null;
          setActiveTabId(nextTab ? nextTab.id : HOME_TAB_ID);
        }
        return next;
      });
      const webview = webviewsRef.current.get(tabId);
      if (webview) {
        webviewsRef.current.delete(tabId);
        try {
          await webview.hide();
          await webview.close();
        } catch (error) {
          setStatusKind("error");
          setStatus(`Close webview failed: ${String(error)}`);
        }
      }
      const timeoutId = webviewLoadingTimeouts.current.get(tabId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        webviewLoadingTimeouts.current.delete(tabId);
      }
      setEditorByTab((prev) => {
        if (!prev[tabId]) return prev;
        const next = { ...prev };
        delete next[tabId];
        return next;
      });
    },
    [activeTabId]
  );

  const handleBack = useCallback(() => {
    if (!activeWebTab) return;
    if (activeWebTab.historyIndex <= 0) return;
    const target = activeWebTab.history[activeWebTab.historyIndex - 1];
    if (!target) return;
    void recreateWebviewForTab(activeWebTab, target, "back");
  }, [activeWebTab, recreateWebviewForTab]);

  const handleForward = useCallback(() => {
    if (!activeWebTab) return;
    if (activeWebTab.historyIndex >= activeWebTab.history.length - 1) return;
    const target = activeWebTab.history[activeWebTab.historyIndex + 1];
    if (!target) return;
    void recreateWebviewForTab(activeWebTab, target, "forward");
  }, [activeWebTab, recreateWebviewForTab]);

  const handleReload = useCallback(() => {
    if (!activeWebTab) return;
    void recreateWebviewForTab(activeWebTab, activeWebTab.url, "reload");
  }, [activeWebTab, recreateWebviewForTab]);

  const handleNewTab = useCallback(() => {
    openWebTab(DEFAULT_WEB_TAB_URL, true);
  }, [openWebTab]);

  const handleAddressSubmit = useCallback(
    (value: string) => {
      const normalized = normalizeAddressInput(value);
      if (!normalized) {
        setStatusKind("info");
        setStatus("Enter a URL or search keyword.");
        return;
      }
      setIsEditingAddress(false);
      if (activeWebTab) {
        void recreateWebviewForTab(activeWebTab, normalized, "push");
        return;
      }
      openWebTab(normalized, true);
    },
    [activeWebTab, openWebTab, recreateWebviewForTab]
  );

  const runScan = useCallback(
    async (options?: { silent?: boolean; resetExpanded?: boolean }) => {
      if (isScanningRef.current) {
        if (!options?.silent) {
          setStatusKind("info");
          setStatus("Scan in progress. Please wait.");
        }
        return;
      }
      if (isSavingRef.current) {
        if (!options?.silent) {
          setStatusKind("info");
          setStatus("Save in progress. Please wait.");
        }
        return;
      }
      if (!options?.silent) {
        setStatus(null);
      }
      isScanningRef.current = true;
      try {
        const result = await invokeApi<ScanVaultResponse>("scan_vault");
        setVaultRoot(result.vaultRoot);
        setFileTree(result.tree);
        setWarnings(result.warnings ?? []);
        if (options?.resetExpanded) {
          setExpandedDirs(new Set());
        }
        updateDiskMtimeFromTree(result.tree);
      } catch (error) {
        const err = error as ApiError;
        if (err && typeof err === "object" && err.code === "NoVaultSelected") {
          setVaultRoot(null);
          setFileTree(null);
          setWarnings([]);
          setLastActiveFile(null);
          setEditorByTab({});
          return;
        }
        if (!options?.silent) {
          setStatusKind("error");
          setStatus(formatError(error));
        }
      } finally {
        isScanningRef.current = false;
      }
    },
    [updateDiskMtimeFromTree]
  );

  const handleSelectVault = useCallback(async () => {
    setStatus(null);
    try {
      const result = await invokeApi<{ vaultRoot: string }>("select_vault");
      setVaultRoot(result.vaultRoot);
      setFileTree(null);
      setExpandedDirs(new Set());
      setWarnings([]);
      setLastActiveFile(null);
      await runScan({ resetExpanded: true });
      setActiveTabId(HOME_TAB_ID);
    } catch (error) {
      setStatusKind("error");
      setStatus(formatError(error));
    }
  }, [runScan]);

  const updateTree = useCallback(
    (nodes: FileNode[], path: string, updater: (node: FileNode) => FileNode) =>
      nodes.map((node) => {
        if (node.path === path) {
          return updater(node);
        }
        if (node.children) {
          return {
            ...node,
            children: updateTree(node.children, path, updater),
          };
        }
        return node;
      }),
    []
  );

  const loadDirChildren = useCallback(
    async (path: string) => {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
      try {
        const result = await invokeApi<ScanVaultResponse>("scan_vault", { path });
        setFileTree((prev) => {
          if (!prev) return prev;
          const next = updateTree(prev, path, (node) => ({
            ...node,
            children: result.tree,
          }));
          updateDiskMtimeFromTree(next);
          return next;
        });
        if (result.warnings?.length) {
          setWarnings((prev) => [...prev, ...result.warnings]);
        }
      } catch (error) {
        setStatusKind("error");
        setStatus(formatError(error));
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [updateDiskMtimeFromTree, updateTree]
  );

  const handleSave = useCallback(async () => {
    if (!activeMarkdownTab || !activeEditorState || isSaving) return;
    setStatus(null);
    setIsSaving(true);
    try {
      const result = await invokeApi<WriteMarkdownResponse>("write_markdown", {
        input: {
          path: activeMarkdownTab.filePath,
          content: activeEditorState.content,
        },
      });
      setEditorByTab((prev) => ({
        ...prev,
        [activeMarkdownTab.id]: {
          ...prev[activeMarkdownTab.id],
          dirty: false,
          mtime: typeof result.mtime === "number" ? result.mtime : null,
          diskMtime: typeof result.mtime === "number" ? result.mtime : null,
          diskChangeNotified: false,
        },
      }));
      setStatusKind("info");
      setStatus(`Saved ${result.path}`);
    } catch (error) {
      setStatusKind("error");
      setStatus(formatError(error));
    } finally {
      setIsSaving(false);
    }
  }, [activeEditorState, activeMarkdownTab, isSaving]);


  const handleOpenFile = useCallback(
    async (path: string) => {
      await openMarkdownTab(path, true);
    },
    [openMarkdownTab]
  );
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    const mainWindow = getCurrentWindow();
    mainWindowRef.current = mainWindow;
    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;
    const setup = async () => {
      unlistenResize = await mainWindow.onResized(async () => {
        await syncWebviewBounds();
      });
      unlistenMove = await mainWindow.onMoved(async () => {
        await syncWebviewBounds();
      });
      await syncWebviewBounds();
    };
    void setup();
    return () => {
      if (unlistenResize) unlistenResize();
      if (unlistenMove) unlistenMove();
    };
  }, [isTauriRuntime, syncWebviewBounds]);

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
    const host = webviewHostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      void syncWebviewBounds();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [isTauriRuntime, syncWebviewBounds, activeTabId]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    void syncWebviewBounds();
  }, [isTauriRuntime, syncWebviewBounds, topBarHeight, sidebarOpen]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await listen<WebviewStatePayload>("webview-state", (event) => {
        const payload = event.payload;
        if (!payload?.label) return;
        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.type !== "web" || tab.webviewLabel !== payload.label) {
              return tab;
            }
            const nextUrl = payload.url ?? tab.url;
            const nextTitle = payload.title?.trim()
              ? payload.title
              : getTabTitleFromUrl(nextUrl);
            let nextLoading = tab.loading;
            if (typeof payload.readyState === "string") {
              nextLoading = payload.readyState === "loading";
            }
            if (nextUrl && nextUrl !== tab.url) {
              nextLoading = false;
            }

            if (!nextLoading) {
              const timeoutId = webviewLoadingTimeouts.current.get(tab.id);
              if (timeoutId) {
                window.clearTimeout(timeoutId);
                webviewLoadingTimeouts.current.delete(tab.id);
              }
            }

            let history = tab.history;
            let historyIndex = tab.historyIndex;
            if (nextUrl && nextUrl !== tab.url) {
              if (history[historyIndex - 1] === nextUrl) {
                historyIndex -= 1;
              } else if (history[historyIndex + 1] === nextUrl) {
                historyIndex += 1;
              } else {
                history = history.slice(0, historyIndex + 1).concat(nextUrl);
                historyIndex = history.length - 1;
              }
            }

            return {
              ...tab,
              url: nextUrl,
              title: nextTitle,
              loading: nextLoading,
              error: nextLoading ? tab.error : null,
              history,
              historyIndex,
            };
          })
        );
      });
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await listen<WebviewOpenPayload>("webview-open", (event) => {
        const payload = event.payload;
        const url = typeof payload?.url === "string" ? payload.url : "";
        if (!url) return;
        openWebTab(url, true);
      });
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauriRuntime, openWebTab]);

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
    if (!isTauriRuntime) return;
    const run = async () => {
      if (!webviewHostRef.current) {
        for (const webview of webviewsRef.current.values()) {
          await webview.hide();
        }
        return;
      }
      for (const tab of tabs) {
        if (tab.type !== "web") continue;
        const webview = webviewsRef.current.get(tab.id);
        if (!webview) {
          if (creatingWebviewsRef.current.has(tab.id)) continue;
          await createWebviewForTab(tab, tab.id === activeTabId);
          continue;
        }
        if (tab.id === activeTabId) {
          await webview.show();
          await webview.setFocus();
        } else {
          await webview.hide();
        }
      }
      if (!activeWebTab) {
        for (const webview of webviewsRef.current.values()) {
          await webview.hide();
        }
      }
    };
    void run();
  }, [activeTabId, activeWebTab, createWebviewForTab, isTauriRuntime, tabs]);

  useEffect(() => {
    void runScan({ silent: true, resetExpanded: true });
  }, [runScan]);

  useEffect(() => {
    if (!vaultRoot) return;
    const timer = window.setInterval(() => {
      void runScan({ silent: true });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [vaultRoot, runScan]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  function toggleDir(path: string, isOpen: boolean, hasChildren?: boolean) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    if (!isOpen && hasChildren === false) {
      void loadDirChildren(path);
    }
  }

  function renderTree(nodes: FileNode[], depth = 0) {
    const highlightPath = activeMarkdownTab?.filePath ?? lastActiveFile;
    return nodes.map((node) => {
      if (node.type === "dir") {
        const isOpen = expandedDirs.has(node.path);
        const hasChildren = node.children !== undefined;
        const isLoading = loadingDirs.has(node.path);
        return (
          <div key={node.path} className="tree-node">
            <button
              type="button"
              className="tree-item tree-dir"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => toggleDir(node.path, isOpen, hasChildren)}
              disabled={isSaving}
              data-tauri-drag-region="false"
            >
              <span className="tree-icon">{isOpen ? "v" : ">"}</span>
              {node.name}
              {isLoading ? " ..." : ""}
            </button>
            {isOpen && node.children && renderTree(node.children, depth + 1)}
          </div>
        );
      }
      return (
        <button
          key={node.path}
          type="button"
          className={`tree-item tree-file ${
            highlightPath === node.path ? "is-active" : ""
          }`}
          style={{ paddingLeft: `${depth * 16 + 26}px` }}
          onClick={() => handleOpenFile(node.path)}
          disabled={isSaving}
          data-tauri-drag-region="false"
        >
          {node.name}
        </button>
      );
    });
  }

  const editorPlaceholder = vaultRoot
    ? "Choose a markdown file to start editing."
    : "Select a vault to load files.";
  const sidebarPlaceholder = vaultRoot
    ? "Scanning vault..."
    : "Select a vault to load files.";
  const vaultDisplayName = getVaultDisplayName(vaultRoot);
  const canGoBack = Boolean(activeWebTab && activeWebTab.historyIndex > 0);
  const canGoForward = Boolean(
    activeWebTab && activeWebTab.historyIndex < activeWebTab.history.length - 1
  );
  const canReload = Boolean(activeWebTab);
  const showSave = Boolean(activeMarkdownTab);
  const isDirty = Boolean(activeEditorState?.dirty);
  const workspacePaddingTop = topBarHeight + 16;
  const addressDisplayValue = activeWebTab
    ? activeWebTab.url
    : activeMarkdownTab
      ? activeMarkdownTab.filePath
      : "Home";
  const addressIsLoading = Boolean(activeWebTab?.loading);

  useEffect(() => {
    if (isEditingAddress) return;
    setAddressInput(addressDisplayValue);
  }, [addressDisplayValue, isEditingAddress]);

  const previewComponents = useMemo(
    () => ({
      a: ({
        href,
        children,
      }: {
        href?: string;
        children?: React.ReactNode;
      }) => {
        const safeHref = safeLink(href);
        const isExternal = /^https?:\/\//i.test(safeHref);
        const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
          if (!safeHref) {
            event.preventDefault();
            return;
          }
          if (safeHref.startsWith("#")) return;
          event.preventDefault();

          if (isExternal) {
            openWebTab(safeHref, !(event.ctrlKey || event.metaKey));
            return;
          }

          if (!activeMarkdownTab) return;
          const resolved = resolveRelativePath(activeMarkdownTab.filePath, safeHref);
          if (!resolved || !resolved.toLowerCase().endsWith(".md")) {
            setStatusKind("info");
            setStatus("Only markdown links can open a markdown tab.");
            return;
          }
          void openMarkdownTab(resolved, true);
        };
        const onAuxClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
          if (!safeHref || safeHref.startsWith("#")) return;
          if (event.button !== 1) return;
          event.preventDefault();
          if (isExternal) {
            openWebTab(safeHref, false);
            return;
          }
          if (!activeMarkdownTab) return;
          const resolved = resolveRelativePath(activeMarkdownTab.filePath, safeHref);
          if (!resolved || !resolved.toLowerCase().endsWith(".md")) return;
          void openMarkdownTab(resolved, false);
        };
        return (
          <a
            href={safeHref}
            onClick={onClick}
            onAuxClick={onAuxClick}
            rel={isExternal ? "noreferrer" : undefined}
            data-tauri-drag-region="false"
          >
            {children}
          </a>
        );
      },
    }),
    [activeMarkdownTab, openMarkdownTab, openWebTab]
  );
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
                  if (!activeWebTab) {
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
                  if (!activeWebTab) {
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
                  if (!activeWebTab) {
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
                  {tab.type === "web" && tab.loading
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
                className="primary"
                onClick={handleSelectVault}
                disabled={isSaving}
                data-tauri-drag-region="false"
              >
                Select vault
              </button>
            </div>
            <div className="top-right">
              {status && (
                <div
                  className={`status ${statusKind === "error" ? "is-error" : ""}`}
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
              <button
                type="button"
                className="primary"
                onClick={handleSave}
                disabled={!showSave || isSaving}
                data-tauri-drag-region="false"
              >
                {isSaving ? "Saving..." : `Save${isDirty ? "*" : ""}`}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="workspace" style={{ paddingTop: `${workspacePaddingTop}px` }}>
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="vault-meta">
              <div className="label">Vault</div>
              <div className="path">{vaultDisplayName}</div>
            </div>
            <div className="tree">
              {fileTree ? (
                renderTree(fileTree)
              ) : (
                <div className="placeholder">{sidebarPlaceholder}</div>
              )}
            </div>
          </aside>
        )}

        <main className="content-pane">
          {activeTab?.type === "home" && (
            <Home hasVault={Boolean(vaultRoot)} onSelectVault={handleSelectVault} />
          )}

          {activeTab?.type === "markdown" && (
            <div className="main-pane">
              <section className="editor-pane">
                <div className="pane-header">
                  <div className="title">Editor</div>
                  <div className="meta">
                    {activeMarkdownTab?.filePath ?? "No file open"}
                  </div>
                </div>
                <div className="pane-body">
                  {activeMarkdownTab ? (
                    <CodeMirror
                      value={editorContent}
                      height="100%"
                      theme="light"
                      extensions={editorExtensions}
                      onChange={(value) => {
                        if (!activeMarkdownTab) return;
                        setEditorByTab((prev) => ({
                          ...prev,
                          [activeMarkdownTab.id]: {
                            ...prev[activeMarkdownTab.id],
                            content: value,
                            dirty: true,
                          },
                        }));
                      }}
                    />
                  ) : (
                    <div className="placeholder">{editorPlaceholder}</div>
                  )}
                </div>
              </section>

              <section className="preview-pane">
                <div className="pane-header">
                  <div className="title">Preview</div>
                  <div className="meta">Live markdown render</div>
                </div>
                <div className="pane-body preview-body">
                  <PreviewErrorBoundary content={deferredContent}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      skipHtml
                      urlTransform={safeLink}
                      components={previewComponents}
                    >
                      {deferredContent || " "}
                    </ReactMarkdown>
                  </PreviewErrorBoundary>
                </div>
              </section>
            </div>
          )}

          {activeTab?.type === "web" && (
            <section className="webview-pane">
              {!isTauriRuntime && (
                <div className="placeholder">
                  Web tabs require the Tauri runtime.
                </div>
              )}
              {activeWebTab?.error && (
                <div className="webview-error">
                  <div className="webview-error-title">404 / Load failed</div>
                  <div className="webview-error-body">
                    {activeWebTab.error}
                  </div>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      if (!activeWebTab) return;
                      void recreateWebviewForTab(
                        activeWebTab,
                        activeWebTab.url,
                        "reload"
                      );
                    }}
                    data-tauri-drag-region="false"
                  >
                    Retry
                  </button>
                </div>
              )}
              <div className="webview-host" ref={webviewHostRef} />
            </section>
          )}
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
