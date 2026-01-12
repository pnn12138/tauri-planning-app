import { useSyncExternalStore } from "react";

import type { MarkdownTab, Tab, WebTab } from "./tab.model";

export const HOME_TAB_ID = "home";

export type TabState = {
  tabs: Tab[];
  activeTabId: string;
};

const listeners = new Set<() => void>();
const webTabLoadingTimeouts = new Map<string, number>();

let tabIdCounter = 0;

let tabState: TabState = {
  tabs: [
    {
      id: HOME_TAB_ID,
      type: "home",
      title: "Home",
    },
  ],
  activeTabId: HOME_TAB_ID,
};

function emitChange() {
  for (const listener of listeners) listener();
}

export function getTabState() {
  return tabState;
}

export function setTabState(updater: (prev: TabState) => TabState) {
  tabState = updater(tabState);
  emitChange();
}

export function resetTabState() {
  tabState = {
    tabs: [
      {
        id: HOME_TAB_ID,
        type: "home",
        title: "Home",
      },
    ],
    activeTabId: HOME_TAB_ID,
  };
  for (const timeoutId of webTabLoadingTimeouts.values()) {
    window.clearTimeout(timeoutId);
  }
  webTabLoadingTimeouts.clear();
  emitChange();
}

export function useTabStore<T>(selector: (state: TabState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(tabState),
    () => selector(tabState)
  );
}

export function getTabById(tabId: string) {
  return tabState.tabs.find((tab) => tab.id === tabId) ?? null;
}

export function setActiveTabId(tabId: string) {
  setTabState((prev) => ({ ...prev, activeTabId: tabId }));
}

export function addTab(tab: Tab, options?: { activate?: boolean }) {
  setTabState((prev) => ({
    ...prev,
    tabs: [...prev.tabs, tab],
    activeTabId: options?.activate ? tab.id : prev.activeTabId,
  }));
}

export function updateTab(tabId: string, updater: (tab: Tab) => Tab) {
  setTabState((prev) => ({
    ...prev,
    tabs: prev.tabs.map((tab) => (tab.id === tabId ? updater(tab) : tab)),
  }));
}

export function closeTab(tabId: string) {
  if (tabId === HOME_TAB_ID) return;

  const timeoutId = webTabLoadingTimeouts.get(tabId);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    webTabLoadingTimeouts.delete(tabId);
  }

  setTabState((prev) => {
    const nextTabs = prev.tabs.filter((tab) => tab.id !== tabId);
    if (prev.activeTabId !== tabId) {
      return { ...prev, tabs: nextTabs };
    }

    const prevIndex = prev.tabs.findIndex((tab) => tab.id === tabId);
    const nextActive =
      nextTabs[prevIndex - 1] ?? nextTabs[prevIndex] ?? nextTabs[0] ?? null;
    return {
      ...prev,
      tabs: nextTabs,
      activeTabId: nextActive?.id ?? HOME_TAB_ID,
    };
  });
}

export function findMarkdownTabByPath(path: string) {
  return (
    tabState.tabs.find(
      (tab): tab is MarkdownTab => tab.type === "markdown" && tab.filePath === path
    ) ?? null
  );
}

export function openMarkdownTab(path: string, options?: { activate?: boolean }) {
  const existing = findMarkdownTabByPath(path);
  if (existing) {
    if (options?.activate !== false) {
      setActiveTabId(existing.id);
    }
    return existing.id;
  }

  const id = `md-${Date.now()}-${tabIdCounter++}`;
  const tab: MarkdownTab = {
    id,
    type: "markdown",
    title: path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path,
    filePath: path,
  };
  addTab(tab, { activate: options?.activate !== false });
  return id;
}

export function openWebTab(
  inputUrl: string,
  options?: { activate?: boolean; title?: (url: string) => string }
) {
  const url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) return null;

  const id = `web-${Date.now()}-${tabIdCounter++}`;
  const tab: WebTab = {
    id,
    type: "web",
    webviewLabel: `webview-${id}`,
    url,
    title: options?.title ? options.title(url) : url,
    loading: true,
    error: null,
    history: [url],
    historyIndex: 0,
  };
  addTab(tab, { activate: options?.activate !== false });

  const timeoutId = window.setTimeout(() => {
    updateTab(id, (current) => {
      if (current.type !== "web") return current;
      if (!current.loading) return current;
      if (current.url !== url) return current;
      return { ...current, loading: false, error: "Load timed out." };
    });
    webTabLoadingTimeouts.delete(id);
  }, 8000);
  webTabLoadingTimeouts.set(id, timeoutId);

  return id;
}

export function scheduleWebTabLoadingClear(tabId: string, url: string) {
  const existing = webTabLoadingTimeouts.get(tabId);
  if (existing) {
    window.clearTimeout(existing);
  }
  const timeoutId = window.setTimeout(() => {
    updateTab(tabId, (current) => {
      if (current.type !== "web") return current;
      if (!current.loading) return current;
      if (current.url !== url) return current;
      return { ...current, loading: false, error: "Load timed out." };
    });
    webTabLoadingTimeouts.delete(tabId);
  }, 8000);
  webTabLoadingTimeouts.set(tabId, timeoutId);
}

export function cancelWebTabLoadingClear(tabId: string) {
  const existing = webTabLoadingTimeouts.get(tabId);
  if (!existing) return;
  window.clearTimeout(existing);
  webTabLoadingTimeouts.delete(tabId);
}
