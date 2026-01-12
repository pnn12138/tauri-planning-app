import { useSyncExternalStore } from "react";

export type StatusKind = "info" | "error";

export type StatusState = {
  message: string | null;
  kind: StatusKind;
};

const listeners = new Set<() => void>();

let statusState: StatusState = {
  message: null,
  kind: "info",
};

function emitChange() {
  for (const listener of listeners) listener();
}

export function getStatusState() {
  return statusState;
}

export function setStatusState(updater: (prev: StatusState) => StatusState) {
  statusState = updater(statusState);
  emitChange();
}

export function useStatusStore<T>(selector: (state: StatusState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(statusState),
    () => selector(statusState)
  );
}

export function setStatus(kind: StatusKind, message: string) {
  setStatusState(() => ({ kind, message }));
}

export function setStatusKind(kind: StatusKind) {
  setStatusState((prev) => ({ ...prev, kind }));
}

export function setStatusMessage(message: string | null) {
  setStatusState((prev) => ({ ...prev, message }));
}

export function clearStatus() {
  setStatusMessage(null);
}
