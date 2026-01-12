pub fn init_webview_bridge<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("webview-bridge")
        .on_webview_ready(|webview| {
            let label = webview.label().to_string();
            if !label.starts_with("webview-") {
                return;
            }
            let script = webview_bridge_script(&label);
            let _ = webview.eval(script);
        })
        .build()
}

fn webview_bridge_script(label: &str) -> String {
    let label_json = serde_json::to_string(label).unwrap_or_else(|_| "\"\"".to_string());
    format!(
        r#"(function() {{
  const label = {label_json};
  if (window.__TAURI_WEBVIEW_BRIDGE__ && window.__TAURI_WEBVIEW_BRIDGE__.label === label) {{
    return;
  }}
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.event) {{
    return;
  }}
  window.__TAURI_WEBVIEW_BRIDGE__ = {{ label }};

  const emitState = () => {{
    try {{
      tauri.event.emit("webview-state", {{
        label,
        url: window.location.href,
        title: document.title || window.location.href,
        readyState: document.readyState
      }});
    }} catch (_err) {{}}
  }};
  const emitOpen = (url) => {{
    try {{
      tauri.event.emit("webview-open", {{ label, url }});
    }} catch (_err) {{}}
  }};

  const handleOpenUrl = (url) => {{
    if (typeof url !== "string" || url.length === 0) return;
    emitOpen(url);
  }};

  const originalOpen = window.open;
  window.open = function(url, ...args) {{
    if (typeof url === "string" && url.length > 0) {{
      handleOpenUrl(url);
    }}
    if (args && args[0] && args[0] !== "_blank" && args[0] !== "newWebTab" && args[0] !== "newWebview") {{
      return originalOpen.apply(window, [url, ...args]);
    }}
    if (args && args[0] && args[0] === "navigation") {{
      return originalOpen.apply(window, [url, ...args]);
    }}
    return null;
  }};

  if (tauri.event.listen) {{
    tauri.event.listen("webview-nav", (event) => {{
      const action = event && event.payload && event.payload.action;
      if (action === "back") {{
        history.back();
        return;
      }}
      if (action === "forward") {{
        history.forward();
        return;
      }}
      if (action === "reload") {{
        location.reload();
      }}
    }});
    tauri.event.listen("webview-navigate", (event) => {{
      const url = event && event.payload && event.payload.url;
      if (typeof url === "string" && url.length > 0) {{
        location.href = url;
      }}
    }});
  }}
  emitState();
  window.addEventListener("load", emitState);
  window.addEventListener("hashchange", emitState);
  window.addEventListener("popstate", emitState);
  document.addEventListener("readystatechange", emitState);
}})();"#,
        label_json = label_json
    )
}
