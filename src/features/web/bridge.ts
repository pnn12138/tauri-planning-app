import { listen } from "@tauri-apps/api/event";

import { findWebTabByLabel, updateTab } from "../../entities/tab/tab.store";
import { setStatus } from "../../shared/ui/status.store";
import { openWebTab } from "./web.actions";
import { ensureWebTab, updateWebFromBridge } from "./web.store";

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

export function installWebBridge(options: { enabled: boolean }) {
  if (!options.enabled) return () => {};

  let unlistenState: (() => void) | undefined;
  let unlistenOpen: (() => void) | undefined;

  const setup = async () => {
    unlistenState = await listen<WebviewStatePayload>("webview-state", (event) => {
      const payload = event.payload;
      if (!payload?.label) return;
      const tab = findWebTabByLabel(payload.label);
      if (!tab) return;

      ensureWebTab(tab.id, { url: tab.url, title: tab.title });
      updateWebFromBridge(tab.id, {
        url: payload.url,
        title: payload.title,
        readyState: payload.readyState,
      });

      const nextUrl = typeof payload.url === "string" && payload.url.trim() ? payload.url : null;
      const nextTitle =
        typeof payload.title === "string" && payload.title.trim() ? payload.title : null;
      if (nextUrl || nextTitle) {
        updateTab(tab.id, (current) => {
          if (current.type !== "web") return current;
          return {
            ...current,
            url: nextUrl ?? current.url,
            title: nextTitle ?? current.title,
          };
        });
      }
    });

    unlistenOpen = await listen<WebviewOpenPayload>("webview-open", (event) => {
      const payload = event.payload;
      const url = typeof payload?.url === "string" ? payload.url : "";
      if (!url) return;
      openWebTab(url, { activate: true });
    });
  };

  void setup().catch((error) => {
    const err = error as any;
    const code = typeof err?.code === "string" ? err.code : "Unknown";
    const message = typeof err?.message === "string" ? err.message : String(error);
    setStatus("error", `${code}: ${message}`);
  });
  return () => {
    if (unlistenState) unlistenState();
    if (unlistenOpen) unlistenOpen();
  };
}


