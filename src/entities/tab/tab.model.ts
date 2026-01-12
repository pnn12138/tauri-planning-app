export type TabType = "home" | "markdown" | "web";

export type BaseTab = {
  id: string;
  type: TabType;
  title: string;
};

export type HomeTab = BaseTab & {
  type: "home";
};

export type MarkdownTab = BaseTab & {
  type: "markdown";
  filePath: string;
};

export type WebTab = BaseTab & {
  type: "web";
  url: string;
  loading: boolean;
  error: string | null;
  history: string[];
  historyIndex: number;
  webviewLabel: string;
};

export type Tab = HomeTab | MarkdownTab | WebTab;

export function isMarkdownTab(tab: Tab | null): tab is MarkdownTab {
  return Boolean(tab && tab.type === "markdown");
}

export function isWebTab(tab: Tab | null): tab is WebTab {
  return Boolean(tab && tab.type === "web");
}

