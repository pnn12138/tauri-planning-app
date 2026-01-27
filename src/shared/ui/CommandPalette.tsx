import { useEffect, useMemo, useRef, useState } from "react";

import { getTabState } from "../../entities/tab/tab.store";
import { setStatus } from "./status.store";
import { useCommandsStore } from "../commands/commands.store";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const commands = useCommandsStore((state) => state.commands);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => cmd.title.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      }
      if (event.key === "Enter") {
        const cmd = filtered[activeIndex];
        if (!cmd) return;
        event.preventDefault();
        const ctx = { activeTabId: getTabState().activeTabId };
        Promise.resolve(cmd.run(ctx))
          .catch((error) => {
            const err = error as any;
            const code = typeof err?.code === "string" ? err.code : "Unknown";
            const message = typeof err?.message === "string" ? err.message : String(error);
            setStatus("error", `${code}: ${message}`);
          })
          .finally(() => onClose());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, onClose, open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="command-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          placeholder="输入命令..."
        />
        <div className="command-palette-list">
          {filtered.length === 0 && <div className="command-palette-empty">无命令</div>}
          {filtered.map((cmd, index) => (
            <button
              key={cmd.key}
              type="button"
              className={`command-palette-item ${index === activeIndex ? "is-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                const ctx = { activeTabId: getTabState().activeTabId };
                Promise.resolve(cmd.run(ctx))
                  .catch((error) => {
                    const err = error as any;
                    const code = typeof err?.code === "string" ? err.code : "Unknown";
                    const message = typeof err?.message === "string" ? err.message : String(error);
                    setStatus("error", `${code}: ${message}`);
                  })
                  .finally(() => onClose());
              }}
            >
              <span className="command-title">{cmd.title}</span>
              <span className="command-source">{cmd.source === "plugin" ? cmd.pluginId : "core"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
