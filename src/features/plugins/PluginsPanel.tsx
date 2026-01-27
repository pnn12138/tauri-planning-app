import { useMemo } from "react";

import { setPluginEnabled, usePluginsStore } from "./plugins.store";

type PluginsPanelProps = {
  onClose: () => void;
};

export default function PluginsPanel({ onClose }: PluginsPanelProps) {
  const plugins = usePluginsStore((state) => state.plugins);
  const loading = usePluginsStore((state) => state.loading);
  const error = usePluginsStore((state) => state.error);

  const hasPlugins = plugins.length > 0;

  const sorted = useMemo(() => {
    return [...plugins].sort((a, b) => a.dir.localeCompare(b.dir));
  }, [plugins]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="plugins-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="plugins-panel-header">
          <div className="plugins-panel-title">插件</div>
          <button type="button" className="plugins-panel-close" onClick={onClose}>
            x
          </button>
        </div>

        {loading && <div className="plugins-panel-status">加载中...</div>}
        {error && <div className="plugins-panel-error">{error.code}: {error.message}</div>}

        {!loading && !error && !hasPlugins && (
          <div className="plugins-panel-empty">
            未找到插件。请将插件放置在库的 <code>.yourapp/plugins/&lt;id&gt;/</code> 目录下。
          </div>
        )}

        <div className="plugins-list">
          {sorted.map((plugin) => {
            const manifest = plugin.manifest;
            const title = manifest?.name ?? plugin.dir;
            const subtitle = manifest ? `${manifest.version}${manifest.author ? ` • ${manifest.author}` : ""}` : "";
            const permissions = manifest?.permissions ?? [];
            const manifestError = plugin.error;
            return (
              <div key={plugin.dir} className="plugin-item">
                <div className="plugin-meta">
                  <div className="plugin-title-row">
                    <div className="plugin-title">{title}</div>
                    <label className="plugin-toggle">
                      <input
                        type="checkbox"
                        checked={plugin.enabled}
                        disabled={!manifest || !!manifestError}
                        onChange={(e) => {
                          void setPluginEnabled(plugin.dir, e.target.checked);
                        }}
                      />
                      <span className="plugin-toggle-label">
                        {plugin.enabled ? "已启用" : "已禁用"}
                      </span>
                    </label>
                  </div>
                  {subtitle && <div className="plugin-subtitle">{subtitle}</div>}
                  {manifest?.description && <div className="plugin-desc">{manifest.description}</div>}
                  {permissions.length > 0 && (
                    <div className="plugin-perms">
                      <span className="plugin-perms-label">权限:</span>{" "}
                      {permissions.join(", ")}
                    </div>
                  )}
                  {manifestError && (
                    <div className="plugin-error">
                      {manifestError.code}: {manifestError.message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

