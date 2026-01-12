import { useCallback, useEffect, useMemo, useRef } from "react";

import { isTauri } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getTabById, useTabStore } from "../../entities/tab/tab.store";
import { setStatusKind, setStatusMessage } from "../../shared/ui/status.store";
import {
  ensureWebTab,
  getWebStoreState,
  removeWebTab,
  setWebError,
  setWebLoading,
  useWebStore,
} from "./web.store";

export default function WebTabView(props: { tabId: string }) {
  const isTauriRuntime = isTauri();
  const activeTab = useTabStore((state) => state.tabs.find((t) => t.id === props.tabId) ?? null);
  const tabs = useTabStore((state) => state.tabs);
  const webState = useWebStore((state) => state.webByTab[props.tabId] ?? null);

  const webviewHostRef = useRef<HTMLDivElement | null>(null);
  const mainWindowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);
  const webviewsRef = useRef<Map<string, Webview>>(new Map());
  const creatingRef = useRef<Set<string>>(new Set());
  const lastNavRevisionRef = useRef<Map<string, number>>(new Map());

  const webTabIds = useMemo(
    () => new Set(tabs.filter((t) => t.type === "web").map((t) => t.id)),
    [tabs]
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
        if (message.includes("not found")) continue;
        setStatusKind("error");
        setStatusMessage(`Webview resize failed: ${message}`);
      }
    }
  }, [getWebviewPlacement]);

  const closeWebview = useCallback(async (tabId: string) => {
    const webview = webviewsRef.current.get(tabId);
    if (!webview) return;
    webviewsRef.current.delete(tabId);
    try {
      await webview.hide();
      await webview.close();
    } catch (error) {
      setStatusKind("error");
      setStatusMessage(`Close webview failed: ${String(error)}`);
    }
  }, []);

  const createWebviewForTab = useCallback(
    async (tabId: string, visible: boolean) => {
      if (!isTauriRuntime) return;
      const tab = getTabById(tabId);
      if (!tab || tab.type !== "web") return;
      if (webviewsRef.current.has(tabId)) return;
      if (creatingRef.current.has(tabId)) return;
      creatingRef.current.add(tabId);
      try {
        const placement = await getWebviewPlacement();
        if (!placement) {
          requestAnimationFrame(() => {
            void createWebviewForTab(tabId, visible);
          });
          return;
        }

        ensureWebTab(tabId, { url: tab.url, title: tab.title });
        const desiredUrl = getWebStoreState().webByTab[tabId]?.url ?? tab.url;
        setWebLoading(tabId, true);
        setWebError(tabId, null);

        const mainWindow = mainWindowRef.current ?? getCurrentWindow();
        mainWindowRef.current = mainWindow;
        const webview = new Webview(mainWindow, tab.webviewLabel, {
          url: desiredUrl,
          x: placement.position.x,
          y: placement.position.y,
          width: placement.size.width,
          height: placement.size.height,
          focus: visible,
        });
        webviewsRef.current.set(tabId, webview);

        await webview.once("tauri://created", () => {
          setWebLoading(tabId, false);
        });
        await webview.once("tauri://error", (event) => {
          setWebLoading(tabId, false);
          setWebError(tabId, "Webview failed to load.");
          const payload = (event as { payload?: unknown }).payload;
          setStatusKind("error");
          setStatusMessage(`WebviewError: ${payload ? String(payload) : "Unknown error"}`);
        });

        if (!visible) {
          await webview.hide();
        } else {
          await webview.show();
          await webview.setFocus();
        }
      } finally {
        creatingRef.current.delete(tabId);
      }
    },
    [getWebviewPlacement, isTauriRuntime]
  );

  useEffect(() => {
    if (!isTauriRuntime) return;
    for (const existingId of [...webviewsRef.current.keys()]) {
      if (webTabIds.has(existingId)) continue;
      void closeWebview(existingId);
      removeWebTab(existingId);
      lastNavRevisionRef.current.delete(existingId);
    }
  }, [closeWebview, isTauriRuntime, webTabIds]);

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
    if (!isTauriRuntime) return;
    const host = webviewHostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      void syncWebviewBounds();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [isTauriRuntime, syncWebviewBounds, props.tabId]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    const isActiveWeb = Boolean(activeTab && activeTab.type === "web");
    const run = async () => {
      if (!isActiveWeb) {
        for (const webview of webviewsRef.current.values()) {
          await webview.hide();
        }
        return;
      }
      for (const tab of tabs) {
        if (tab.type !== "web") continue;
        const webview = webviewsRef.current.get(tab.id);
        if (!webview) continue;
        if (tab.id === props.tabId) {
          await webview.show();
          await webview.setFocus();
        } else {
          await webview.hide();
        }
      }
    };
    void run();
  }, [activeTab, isTauriRuntime, props.tabId, tabs]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    if (!activeTab || activeTab.type !== "web") return;

    ensureWebTab(activeTab.id, { url: activeTab.url, title: activeTab.title });
    const tabState = getWebStoreState().webByTab[activeTab.id] ?? webState;
    if (!tabState) return;

    const lastRevision = lastNavRevisionRef.current.get(activeTab.id) ?? -1;
    const shouldRecreate = lastRevision !== tabState.navRevision;
    lastNavRevisionRef.current.set(activeTab.id, tabState.navRevision);

    const existing = webviewsRef.current.get(activeTab.id);
    if (!existing) {
      void createWebviewForTab(activeTab.id, true);
      return;
    }
    if (shouldRecreate) {
      void (async () => {
        await closeWebview(activeTab.id);
        await createWebviewForTab(activeTab.id, true);
      })();
    }
  }, [activeTab, closeWebview, createWebviewForTab, isTauriRuntime, webState]);

  if (!activeTab || activeTab.type !== "web") {
    return null;
  }

  const error = webState?.error ?? null;
  return (
    <section className="webview-pane">
      {!isTauriRuntime && (
        <div className="placeholder">Web tabs require the Tauri runtime.</div>
      )}
      {error && (
        <div className="webview-error">
          <div className="webview-error-title">404 / Load failed</div>
          <div className="webview-error-body">{error}</div>
          <button
            type="button"
            className="primary"
            onClick={() => {
              ensureWebTab(activeTab.id, { url: activeTab.url, title: activeTab.title });
              setWebLoading(activeTab.id, true);
              void (async () => {
                await closeWebview(activeTab.id);
                await createWebviewForTab(activeTab.id, true);
              })();
            }}
            data-tauri-drag-region="false"
          >
            Retry
          </button>
        </div>
      )}
      <div className="webview-host" ref={webviewHostRef} />
    </section>
  );
}
