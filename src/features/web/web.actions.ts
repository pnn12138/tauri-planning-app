import { isTauri } from "@tauri-apps/api/core";

import { getTabById, openWebTab as openWebTabInTabStore, setActiveTabId, updateTab } from "../../entities/tab/tab.store";
import type { WebTab } from "../../entities/tab/tab.model";
import { setStatusKind, setStatusMessage } from "../../shared/ui/status.store";
import { backWeb, ensureWebTab, forwardWeb, getWebStoreState, navigateWeb } from "./web.store";

function getTabTitleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

export function openWebTab(url: string, options?: { activate?: boolean }) {
  const id = openWebTabInTabStore(url, {
    activate: options?.activate,
    title: getTabTitleFromUrl,
  });
  if (!id) {
    setStatusKind("info");
    setStatusMessage("Only http/https links are supported.");
    return null;
  }

  const tab = getTabById(id);
  if (tab?.type === "web") {
    ensureWebTab(id, { url: tab.url, title: tab.title });
  }
  if (!isTauri()) {
    setStatusKind("info");
    setStatusMessage("Web tabs require the Tauri runtime.");
  }
  return id;
}

export function navigateActiveWebTab(tabId: string, url: string) {
  navigateWeb(tabId, url, "push");
  updateTab(tabId, (tab) => {
    if (tab.type !== "web") return tab;
    const next: WebTab = { ...tab, url };
    return next;
  });
}

export function reloadWebTab(tabId: string) {
  const tab = getTabById(tabId);
  if (!tab || tab.type !== "web") return;
  const url = getWebStoreState().webByTab[tabId]?.url ?? tab.url;
  navigateWeb(tabId, url, "reload");
}

export function goBack(tabId: string) {
  backWeb(tabId);
  const nextUrl = getWebStoreState().webByTab[tabId]?.url;
  if (nextUrl) {
    updateTab(tabId, (tab) => (tab.type === "web" ? { ...tab, url: nextUrl } : tab));
  }
}

export function goForward(tabId: string) {
  forwardWeb(tabId);
  const nextUrl = getWebStoreState().webByTab[tabId]?.url;
  if (nextUrl) {
    updateTab(tabId, (tab) => (tab.type === "web" ? { ...tab, url: nextUrl } : tab));
  }
}

export function activateTab(tabId: string) {
  setActiveTabId(tabId);
}
