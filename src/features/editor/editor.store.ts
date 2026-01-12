import { useSyncExternalStore } from "react";

export type EditorState = {
  content: string;
  dirty: boolean;
  mtime: number | null;
  diskMtime: number | null;
  diskChangeNotified: boolean;
  isSaving: boolean;
  hasLoaded: boolean;
};

export type EditorStoreState = {
  editorByTab: Record<string, EditorState>;
};

const listeners = new Set<() => void>();

let editorStoreState: EditorStoreState = {
  editorByTab: {},
};

function emitChange() {
  for (const listener of listeners) listener();
}

export function getEditorStoreState() {
  return editorStoreState;
}

export function setEditorStoreState(updater: (prev: EditorStoreState) => EditorStoreState) {
  editorStoreState = updater(editorStoreState);
  emitChange();
}

export function resetEditorStoreState() {
  editorStoreState = { editorByTab: {} };
  emitChange();
}

export function useEditorStore<T>(selector: (state: EditorStoreState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(editorStoreState),
    () => selector(editorStoreState)
  );
}

export function ensureEditorTab(tabId: string) {
  setEditorStoreState((prev) => {
    if (prev.editorByTab[tabId]) return prev;
    return {
      ...prev,
      editorByTab: {
        ...prev.editorByTab,
        [tabId]: {
          content: "",
          dirty: false,
          mtime: null,
          diskMtime: null,
          diskChangeNotified: false,
          isSaving: false,
          hasLoaded: false,
        },
      },
    };
  });
}

export function removeEditorTab(tabId: string) {
  setEditorStoreState((prev) => {
    if (!prev.editorByTab[tabId]) return prev;
    const next = { ...prev.editorByTab };
    delete next[tabId];
    return { ...prev, editorByTab: next };
  });
}

export function setEditorContent(tabId: string, content: string) {
  setEditorStoreState((prev) => {
    const existing = prev.editorByTab[tabId];
    if (!existing) return prev;
    return {
      ...prev,
      editorByTab: {
        ...prev.editorByTab,
        [tabId]: {
          ...existing,
          content,
          dirty: true,
          hasLoaded: true,
        },
      },
    };
  });
}

export function setEditorFromDisk(tabId: string, input: { content: string; mtime: number | null }) {
  setEditorStoreState((prev) => {
    const existing = prev.editorByTab[tabId];
    if (!existing) return prev;
    return {
      ...prev,
      editorByTab: {
        ...prev.editorByTab,
        [tabId]: {
          ...existing,
          content: input.content,
          dirty: false,
          mtime: input.mtime,
          diskMtime: input.mtime,
          diskChangeNotified: false,
          hasLoaded: true,
        },
      },
    };
  });
}

export function setEditorSaving(tabId: string, isSaving: boolean) {
  setEditorStoreState((prev) => {
    const existing = prev.editorByTab[tabId];
    if (!existing) return prev;
    if (existing.isSaving === isSaving) return prev;
    return {
      ...prev,
      editorByTab: {
        ...prev.editorByTab,
        [tabId]: {
          ...existing,
          isSaving,
        },
      },
    };
  });
}

export function markEditorSaved(tabId: string, mtime: number | null) {
  setEditorStoreState((prev) => {
    const existing = prev.editorByTab[tabId];
    if (!existing) return prev;
    return {
      ...prev,
      editorByTab: {
        ...prev.editorByTab,
        [tabId]: {
          ...existing,
          dirty: false,
          mtime,
          diskMtime: mtime,
          diskChangeNotified: false,
          hasLoaded: true,
        },
      },
    };
  });
}


