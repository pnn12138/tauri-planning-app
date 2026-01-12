export type CommandContext = {
  activeTabId: string;
};

export type CommandDefinition = {
  key: string;
  title: string;
  source: "core" | "plugin";
  pluginId?: string;
  run: (ctx: CommandContext) => Promise<void> | void;
};

