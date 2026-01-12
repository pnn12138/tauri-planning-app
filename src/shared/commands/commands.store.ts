import { useSyncExternalStore } from "react";

import type { CommandDefinition } from "./commands.model";

export type CommandsState = {
  commands: CommandDefinition[];
};

const listeners = new Set<() => void>();

let commandsState: CommandsState = {
  commands: [],
};

function emitChange() {
  for (const listener of listeners) listener();
}

export function getCommandsState() {
  return commandsState;
}

export function setCommandsState(updater: (prev: CommandsState) => CommandsState) {
  commandsState = updater(commandsState);
  emitChange();
}

export function useCommandsStore<T>(selector: (state: CommandsState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(commandsState),
    () => selector(commandsState)
  );
}

export function registerCommand(command: CommandDefinition) {
  setCommandsState((prev) => {
    const next = prev.commands.filter((item) => item.key !== command.key);
    next.push(command);
    next.sort((a, b) => a.title.localeCompare(b.title));
    return { ...prev, commands: next };
  });
}

export function unregisterCommandsByPlugin(pluginId: string) {
  setCommandsState((prev) => ({
    ...prev,
    commands: prev.commands.filter((cmd) => cmd.pluginId !== pluginId),
  }));
}

