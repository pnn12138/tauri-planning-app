export type TabType = "home" | "markdown" | "web" | "task";

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
  webviewLabel: string;
};

export type TaskTab = BaseTab & {
  type: "task";
  taskId: string;
};

export type Tab = HomeTab | MarkdownTab | WebTab | TaskTab;

export function isMarkdownTab(tab: Tab | null): tab is MarkdownTab {
  return Boolean(tab && tab.type === "markdown");
}

export function isWebTab(tab: Tab | null): tab is WebTab {
  return Boolean(tab && tab.type === "web");
}

