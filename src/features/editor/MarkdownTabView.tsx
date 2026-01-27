import { useCallback, useEffect } from "react";

import { useDebounce } from "../../shared/lib/hooks";
import { getTabById, useTabStore } from "../../entities/tab/tab.store";
import { readMarkdown, writeMarkdown } from "./editor.api";
import type { ApiError } from "../../shared/types/api";
import {
  ensureEditorTab,
  getEditorStoreState,
  markEditorSaved,
  setEditorFromDisk,
  setEditorSaving,
  useEditorStore,
  setEditorContent,
} from "./editor.store";
import CodeMirrorEditor from "./cm/CodeMirrorEditor";
import PreviewPane from "./preview/PreviewPane";
import { setStatus } from "../../shared/ui/status.store";

const readReqIdByTab = new Map<string, number>();

function formatError(error: unknown) {
  if (typeof error === "string") return `UnexpectedError: ${error}`;
  if (!error || typeof error !== "object") return "UnexpectedError: Unexpected error.";
  const err = error as ApiError;
  if (!err.code || !err.message) {
    try {
      return `UnexpectedError: ${JSON.stringify(error)}`;
    } catch {
      return "UnexpectedError: Unexpected error.";
    }
  }
  const details = err.details;
  const detailParts: string[] = [];
  if (details && typeof details === "object") {
    const detailRecord = details as Record<string, unknown>;
    if (typeof detailRecord.step === "string") detailParts.push(`step=${detailRecord.step}`);
    if (typeof detailRecord.path === "string") detailParts.push(`path=${detailRecord.path}`);
    if (typeof detailRecord.error === "string") detailParts.push(`error=${detailRecord.error}`);
  }
  const detailText = detailParts.length ? ` (${detailParts.join(", ")})` : "";
  return `${err.code}: ${err.message}${detailText}`;
}

export default function MarkdownTabView(props: { tabId: string }) {
  const tab = useTabStore((state) => state.tabs.find((t) => t.id === props.tabId) ?? null);
  const filePath = tab?.type === "markdown" ? tab.filePath : null;
  const editor = useEditorStore((state) => state.editorByTab[props.tabId] ?? null);

  useEffect(() => {
    if (!filePath) return;
    ensureEditorTab(props.tabId);
  }, [filePath, props.tabId]);

  useEffect(() => {
    if (!filePath) return;
    if (!editor || editor.hasLoaded) return;

    const nextReqId = (readReqIdByTab.get(props.tabId) ?? 0) + 1;
    readReqIdByTab.set(props.tabId, nextReqId);

    void (async () => {
      try {
        const result = await readMarkdown(filePath);
        if (readReqIdByTab.get(props.tabId) !== nextReqId) return;
        setStatus("info", `Loaded ${result.path}`);
        setEditorFromDisk(props.tabId, {
          content: result.content,
          mtime: typeof result.mtime === "number" ? result.mtime : null,
        });
      } catch (error) {
        if (readReqIdByTab.get(props.tabId) !== nextReqId) return;
        setStatus("error", formatError(error));
        setEditorFromDisk(props.tabId, { content: "", mtime: null });
      }
    })();
  }, [editor, filePath, props.tabId]);

  const handleSave = useCallback(async () => {
    const currentTab = getTabById(props.tabId);
    if (!currentTab || currentTab.type !== "markdown") return;
    const currentEditor = getEditorStoreState().editorByTab[props.tabId];
    if (!currentEditor) return;
    if (!currentEditor.dirty || currentEditor.isSaving) return;
    setEditorSaving(props.tabId, true);
    try {
      const result = await writeMarkdown({
        path: currentTab.filePath,
        content: currentEditor.content,
      });
      markEditorSaved(props.tabId, typeof result.mtime === "number" ? result.mtime : null);
      setStatus("info", `Saved ${result.path}`);
    } catch (error) {
      setStatus("error", formatError(error));
    } finally {
      setEditorSaving(props.tabId, false);
    }
  }, [props.tabId]);

  const debouncedSave = useDebounce(() => {
    void handleSave();
  }, 1000);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  useEffect(() => {
    return () => {
      void handleSave();
    };
  }, [handleSave]);

  if (!tab || tab.type !== "markdown") {
    return <div className="placeholder">未选择 Markdown 标签。</div>;
  }

  const content = editor?.content ?? "";
  return (
    <div className="main-pane">
      <section className="editor-pane">
        <div className="pane-header">
          <div className="title">编辑器</div>
          <div className="meta">{tab.filePath}</div>
        </div>
        <div className="pane-body">
          <CodeMirrorEditor
            value={content}
            disabled={Boolean(editor?.isSaving)}
            onChange={(value) => {
              setEditorContent(props.tabId, value);
              debouncedSave();
            }}
          />
        </div>
      </section>

      <section className="preview-pane">
        <div className="pane-header">
          <div className="title">预览</div>
          <div className="meta">实时 Markdown 渲染</div>
        </div>
        <PreviewPane tabId={props.tabId} content={content} />
      </section>
    </div>
  );
}
