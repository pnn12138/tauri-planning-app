import React, { useDeferredValue, useMemo } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";

import { getTabById, openMarkdownTab } from "../../../entities/tab/tab.store";
import { openWebTab } from "../../web/web.actions";
import { useEditorStore } from "../editor.store";

function safeLink(uri?: string) {
  if (!uri) return "";
  const normalized = uri.trim().toLowerCase();
  if (normalized.startsWith("javascript:") || normalized.startsWith("data:")) {
    return "";
  }
  return uri;
}

function resolveRelativePath(basePath: string | null, href: string) {
  const cleaned = href.replace(/\\/g, "/");
  if (!cleaned) return null;
  const withoutHash = cleaned.split("#")[0];
  if (!withoutHash) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withoutHash)) return null;

  let target = withoutHash;
  if (target.startsWith("/")) {
    target = target.replace(/^\/+/, "");
  } else if (basePath) {
    const baseDir = basePath.split("/").slice(0, -1).join("/");
    target = baseDir ? `${baseDir}/${target}` : target;
  }

  const parts = target.split("/").filter((part) => part.length > 0);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

class PreviewErrorBoundary extends React.Component<
  { content: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { content: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: unknown) {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { content: string }) {
    if (prevProps.content !== this.props.content && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="preview-fallback">
          <div className="preview-fallback-title">PreviewError: render failed.</div>
          <pre className="preview-fallback-body">{this.props.content || " "}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function PreviewPane(props: { tabId: string; content: string }) {
  const deferredContent = useDeferredValue(props.content);
  const editorState = useEditorStore((state) => state.editorByTab[props.tabId] ?? null);

  const components = useMemo(
    () => ({
      a: ({
        href,
        children,
      }: {
        href?: string;
        children?: React.ReactNode;
      }) => {
        const safeHref = safeLink(href);
        const isExternal = /^https?:\/\//i.test(safeHref);
        const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
          if (!safeHref) {
            event.preventDefault();
            return;
          }
          if (safeHref.startsWith("#")) return;
          event.preventDefault();

          const currentTab = getTabById(props.tabId);
          const basePath = currentTab?.type === "markdown" ? currentTab.filePath : null;

          if (isExternal) {
            openWebTab(safeHref, { activate: !(event.ctrlKey || event.metaKey) });
            return;
          }

          const resolved = resolveRelativePath(basePath, safeHref);
          if (!resolved || !resolved.toLowerCase().endsWith(".md")) return;
          if (editorState?.dirty && resolved !== basePath) {
            const proceed = window.confirm(
              "You have unsaved changes. Discard them and open another file?"
            );
            if (!proceed) return;
          }
          openMarkdownTab(resolved, { activate: true });
        };
        return (
          <a href={safeHref} onClick={onClick}>
            {children}
          </a>
        );
      },
    }),
    [editorState?.dirty, props.tabId]
  );

  return (
    <div className="pane-body preview-body">
      <PreviewErrorBoundary content={deferredContent}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm as any]}
          rehypePlugins={[rehypeHighlight as any]}
          skipHtml
          urlTransform={safeLink}
          components={components}
        >
          {deferredContent || " "}
        </ReactMarkdown>
      </PreviewErrorBoundary>
    </div>
  );
}
