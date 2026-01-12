import { useSyncExternalStore } from "react";

export type WebTabState = {
  url: string;
  title: string;
  loading: boolean;
  error: string | null;
  canBack: boolean;
  canForward: boolean;
  history: string[];
  historyIndex: number;
  navRevision: number;
};

export type WebStoreState = {
  webByTab: Record<string, WebTabState>;
};

const listeners = new Set<() => void>();

let webStoreState: WebStoreState = {
  webByTab: {},
};

function emitChange() {
  for (const listener of listeners) listener();
}

export function getWebStoreState() {
  return webStoreState;
}

export function setWebStoreState(updater: (prev: WebStoreState) => WebStoreState) {
  webStoreState = updater(webStoreState);
  emitChange();
}

export function useWebStore<T>(selector: (state: WebStoreState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(webStoreState),
    () => selector(webStoreState)
  );
}

function recompute(tab: WebTabState): WebTabState {
  const canBack = tab.historyIndex > 0;
  const canForward = tab.historyIndex < tab.history.length - 1;
  return { ...tab, canBack, canForward };
}

export function ensureWebTab(tabId: string, input: { url: string; title: string }) {
  setWebStoreState((prev) => {
    const existing = prev.webByTab[tabId];
    if (existing) return prev;
    const tab: WebTabState = recompute({
      url: input.url,
      title: input.title,
      loading: true,
      error: null,
      canBack: false,
      canForward: false,
      history: [input.url],
      historyIndex: 0,
      navRevision: 0,
    });
    return { ...prev, webByTab: { ...prev.webByTab, [tabId]: tab } };
  });
}

export function removeWebTab(tabId: string) {
  setWebStoreState((prev) => {
    if (!prev.webByTab[tabId]) return prev;
    const next = { ...prev.webByTab };
    delete next[tabId];
    return { ...prev, webByTab: next };
  });
}

export function setWebLoading(tabId: string, loading: boolean) {
  setWebStoreState((prev) => {
    const existing = prev.webByTab[tabId];
    if (!existing) return prev;
    if (existing.loading === loading) return prev;
    return {
      ...prev,
      webByTab: { ...prev.webByTab, [tabId]: { ...existing, loading } },
    };
  });
}

export function setWebError(tabId: string, error: string | null) {
  setWebStoreState((prev) => {
    const existing = prev.webByTab[tabId];
    if (!existing) return prev;
    if (existing.error === error) return prev;
    return {
      ...prev,
      webByTab: { ...prev.webByTab, [tabId]: { ...existing, error } },
    };
  });
}

export function navigateWeb(tabId: string, url: string, mode: "push" | "replace" | "reload") {
  setWebStoreState((prev) => {
    const existing = prev.webByTab[tabId];
    if (!existing) return prev;
    let history = existing.history;
    let historyIndex = existing.historyIndex;
    if (mode === "push") {
      if (history[historyIndex] !== url) {
        history = history.slice(0, historyIndex + 1);
        history.push(url);
        historyIndex = history.length - 1;
      }
    } else if (mode === "replace") {
      history = [...history];
      history[historyIndex] = url;
    }
    const next = recompute({
      ...existing,
      url,
      loading: true,
      error: null,
      history,
      historyIndex,
      navRevision: existing.navRevision + 1,
    });
    return { ...prev, webByTab: { ...prev.webByTab, [tabId]: next } };
  });
}

export function backWeb(tabId: string) {
  setWebStoreState((prev) => {
    const existing = prev.webByTab[tabId];
    if (!existing) return prev;
    if (existing.historyIndex <= 0) return prev;
    const nextIndex = existing.historyIndex - 1;
    const nextUrl = existing.history[nextIndex] ?? existing.url;
    const next = recompute({
      ...existing,
      url: nextUrl,
      loading: true,
      error: null,
      historyIndex: nextIndex,
      navRevision: existing.navRevision + 1,
    });
    return { ...prev, webByTab: { ...prev.webByTab, [tabId]: next } };
  });
}

export function forwardWeb(tabId: string) {
  setWebStoreState((prev) => {
    const existing = prev.webByTab[tabId];
    if (!existing) return prev;
    if (existing.historyIndex >= existing.history.length - 1) return prev;
    const nextIndex = existing.historyIndex + 1;
    const nextUrl = existing.history[nextIndex] ?? existing.url;
    const next = recompute({
      ...existing,
      url: nextUrl,
      loading: true,
      error: null,
      historyIndex: nextIndex,
      navRevision: existing.navRevision + 1,
    });
    return { ...prev, webByTab: { ...prev.webByTab, [tabId]: next } };
  });
}

export function updateWebFromBridge(
  tabId: string,
  input: { url?: string; title?: string; readyState?: string }
) {
  setWebStoreState((prev) => {
    const existing = prev.webByTab[tabId];
    if (!existing) return prev;

    const nextUrl = input.url?.trim() ? input.url : existing.url;
    const nextTitle = input.title?.trim() ? input.title : existing.title;
    let nextLoading = existing.loading;
    if (typeof input.readyState === "string") {
      nextLoading = input.readyState === "loading";
    }
    if (nextUrl && nextUrl !== existing.url) {
      nextLoading = false;
    }

    let history = existing.history;
    let historyIndex = existing.historyIndex;
    if (nextUrl && nextUrl !== existing.url) {
      if (history[historyIndex - 1] === nextUrl) {
        historyIndex -= 1;
      } else if (history[historyIndex + 1] === nextUrl) {
        historyIndex += 1;
      } else {
        history = history.slice(0, historyIndex + 1).concat(nextUrl);
        historyIndex = history.length - 1;
      }
    }

    const next = recompute({
      ...existing,
      url: nextUrl,
      title: nextTitle,
      loading: nextLoading,
      error: nextLoading ? existing.error : null,
      history,
      historyIndex,
    });
    return { ...prev, webByTab: { ...prev.webByTab, [tabId]: next } };
  });
}

