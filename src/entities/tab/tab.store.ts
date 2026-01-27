import { useSyncExternalStore } from "react";

import type { MarkdownTab, Tab, WebTab, TaskTab } from "./tab.model";

export const HOME_TAB_ID = "home";

export type TabState = {
  tabs: Tab[];
  activeTabId: string;
};

const listeners = new Set<() => void>();

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
  let url = inputUrl.trim();
  // 确保URL格式正确
  if (!url) {
    url = "https://example.com";
  } else if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const id = `web-${Date.now()}-${tabIdCounter++}`;
  const tab: WebTab = {
    id,
    type: "web",
    webviewLabel: `webview-web-${Date.now()}-${tabIdCounter}`, // 确保webviewLabel唯一且符合预期格式
    url,
    title: options?.title ? options.title(url) : url,
  };
  addTab(tab, { activate: options?.activate !== false });

  return id;
}

export function findWebTabByLabel(label: string) {
  return (
    tabState.tabs.find(
      (tab): tab is WebTab => tab.type === "web" && tab.webviewLabel === label
    ) ?? null
  );
}

export function findTaskTabByTaskId(taskId: string) {
  return (
    tabState.tabs.find(
      (tab): tab is TaskTab => tab.type === "task" && tab.taskId === taskId
    ) ?? null
  );
}

export function openTaskTab(taskId: string, taskTitle?: string, options?: { activate?: boolean }) {
  const existing = findTaskTabByTaskId(taskId);
  if (existing) {
    if (options?.activate !== false) {
      setActiveTabId(existing.id);
    }
    return existing.id;
  }

  const id = `task-${Date.now()}-${tabIdCounter++}`;
  const tab: TaskTab = {
    id,
    type: "task",
    title: taskTitle || `Task ${taskId.slice(0, 8)}`,
    taskId,
  };
  addTab(tab, { activate: options?.activate !== false });
  return id;
}


