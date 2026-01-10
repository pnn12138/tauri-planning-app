use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};

const IGNORE_DIRS: [&str; 5] = [".git", "node_modules", "target", ".idea", ".vscode"];
const MAX_SCAN_ENTRIES_WARNING: usize = 2000;
const MAX_SCAN_ENTRIES_LIMIT: usize = 8000;
const DEFAULT_VAULT_PATH: &str = r"C:\Users\25008\Desktop\1111";

struct VaultState {
    root: Mutex<Option<PathBuf>>,
    config_path: PathBuf,
}

#[derive(Serialize)]
struct ApiError {
    code: String,
    message: String,
    details: Option<serde_json::Value>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum ApiResponse<T> {
    Ok { ok: bool, data: T },
    Err { ok: bool, error: ApiError },
}

impl<T> ApiResponse<T> {
    fn ok(data: T) -> Self {
        ApiResponse::Ok { ok: true, data }
    }

    fn err(code: &str, message: &str, details: Option<serde_json::Value>) -> Self {
        ApiResponse::Err {
            ok: false,
            error: ApiError {
                code: code.to_string(),
                message: message.to_string(),
                details,
            },
        }
    }
}

#[derive(Serialize)]
struct SelectVaultResponse {
    vaultRoot: String,
}

#[derive(Serialize)]
struct WarningItem {
    code: String,
    message: String,
    path: Option<String>,
}

#[derive(Serialize)]
struct ScanVaultResponse {
    vaultRoot: String,
    tree: Vec<FileNode>,
    warnings: Vec<WarningItem>,
}

#[derive(Serialize)]
struct ReadMarkdownResponse {
    path: String,
    content: String,
    mtime: Option<u64>,
}

#[derive(Serialize)]
struct WriteMarkdownResponse {
    path: String,
    mtime: Option<u64>,
}

fn init_webview_bridge<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
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

#[derive(Serialize)]
struct FileNode {
    #[serde(rename = "type")]
    node_type: String,
    name: String,
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    mtime: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileNode>>,
}

#[derive(Deserialize)]
struct ReadMarkdownInput {
    path: String,
}

#[derive(Deserialize)]
struct WriteMarkdownInput {
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct RenameMarkdownInput {
    path: String,
    #[serde(rename = "newName")]
    new_name: String,
}

#[derive(Serialize)]
struct RenameMarkdownResponse {
    #[serde(rename = "oldPath")]
    old_path: String,
    #[serde(rename = "newPath")]
    new_path: String,
    mtime: Option<u64>,
}

#[tauri::command]
fn select_vault(state: State<VaultState>) -> ApiResponse<SelectVaultResponse> {
    let folder = rfd::FileDialog::new().pick_folder();
    let Some(path) = folder else {
        return ApiResponse::err("NoVaultSelected", "Vault selection cancelled", None);
    };

    if let Err(err) = ensure_no_symlink(&path) {
        return ApiResponse::err(&err.code, &err.message, err.details);
    }

    let canonical = match path.canonicalize() {
        Ok(path) => path,
        Err(err) => {
            return ApiResponse::err(
                "Unknown",
                "Failed to resolve vault path",
                Some(serde_json::json!({ "error": err.to_string() })),
            )
        }
    };
    if !canonical.is_dir() {
        return ApiResponse::err("NotFound", "Vault path is not a directory", None);
    }

    if let Err(err) = persist_vault(&state, &canonical) {
        return ApiResponse::err(&err.code, &err.message, err.details);
    }
    let mut guard = state.root.lock().expect("vault mutex poisoned");
    *guard = Some(canonical.clone());

    ApiResponse::ok(SelectVaultResponse {
        vaultRoot: canonical_to_string(&canonical),
    })
}

#[tauri::command]
async fn scan_vault(
    state: State<'_, VaultState>,
    path: Option<String>,
) -> Result<ApiResponse<ScanVaultResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = path
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(PathBuf::from(trimmed))
            }
        });
    let result = tauri::async_runtime::spawn_blocking(move || scan_vault_impl(&vault_root, rel_path))
        .await;
    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(response)),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "ScanFailed",
            "Scan task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[tauri::command]
async fn read_markdown(
    state: State<'_, VaultState>,
    input: ReadMarkdownInput,
) -> Result<ApiResponse<ReadMarkdownResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = PathBuf::from(&input.path);
    let result = tauri::async_runtime::spawn_blocking(move || read_markdown_impl(&vault_root, &rel_path))
        .await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(response)),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Read task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[tauri::command]
async fn write_markdown(
    state: State<'_, VaultState>,
    input: WriteMarkdownInput,
) -> Result<ApiResponse<WriteMarkdownResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = PathBuf::from(&input.path);
    let content = input.content;
    let result =
        tauri::async_runtime::spawn_blocking(move || write_markdown_impl(&vault_root, &rel_path, &content))
            .await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(response)),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "WriteFailed",
            "Write task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[tauri::command]
async fn rename_markdown(
    state: State<'_, VaultState>,
    input: RenameMarkdownInput,
) -> Result<ApiResponse<RenameMarkdownResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = PathBuf::from(input.path.trim());
    let new_name = input.new_name;
    let result = tauri::async_runtime::spawn_blocking(move || {
        rename_markdown_impl(&vault_root, &rel_path, &new_name)
    })
    .await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(response)),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "WriteFailed",
            "Rename task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

fn current_vault_root(state: &State<'_, VaultState>) -> Result<PathBuf, ApiError> {
    let guard = state.root.lock().expect("vault mutex poisoned");
    match guard.as_ref() {
        Some(path) => Ok(path.clone()),
        None => Err(ApiError {
            code: "NoVaultSelected".to_string(),
            message: "No vault selected".to_string(),
            details: None,
        }),
    }
}

fn persist_vault(state: &VaultState, vault_root: &Path) -> Result<(), ApiError> {
    let payload = serde_json::json!({ "vault_root": canonical_to_string(vault_root) });
    let data = serde_json::to_string(&payload).map_err(|err| ApiError {
        code: "WriteFailed".to_string(),
        message: "Failed to encode vault state".to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    })?;
    fs::write(&state.config_path, data).map_err(|err| map_write_error("Failed to persist vault", err))?;
    Ok(())
}

fn scan_vault_impl(
    vault_root: &Path,
    rel_path: Option<PathBuf>,
) -> Result<ScanVaultResponse, ApiError> {
    let mut warnings = Vec::new();
    let mut stats = ScanStats::default();

    let target_rel = rel_path.unwrap_or_default();
    if !target_rel.as_os_str().is_empty() {
        resolve_existing_dir(vault_root, &target_rel)?;
    }

    let tree = scan_dir(
        vault_root,
        &target_rel,
        &mut warnings,
        &mut stats,
        false,
    )?;

    if stats.entries > MAX_SCAN_ENTRIES_WARNING {
        warnings.push(WarningItem {
            code: "LargeVault".to_string(),
            message: format!(
                "Vault has {} entries; scan may be slow",
                stats.entries
            ),
            path: None,
        });
    }

    Ok(ScanVaultResponse {
        vaultRoot: canonical_to_string(vault_root),
        tree,
        warnings,
    })
}

#[derive(Default)]
struct ScanStats {
    entries: usize,
    limit_reached: bool,
}

fn scan_dir(
    vault_root: &Path,
    rel_path: &Path,
    warnings: &mut Vec<WarningItem>,
    stats: &mut ScanStats,
    recursive: bool,
) -> Result<Vec<FileNode>, ApiError> {
    if stats.limit_reached {
        return Ok(Vec::new());
    }

    let abs_path = vault_root.join(rel_path);
    let read_dir = match fs::read_dir(&abs_path) {
        Ok(read_dir) => read_dir,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            warnings.push(WarningItem {
                code: "PermissionDenied".to_string(),
                message: "Permission denied when scanning directory".to_string(),
                path: Some(canonical_to_string(&abs_path)),
            });
            return Ok(Vec::new());
        }
        Err(err) => {
            return Err(ApiError {
                code: "ScanFailed".to_string(),
                message: "Failed to read directory".to_string(),
                details: Some(serde_json::json!({
                    "path": canonical_to_string(&abs_path),
                    "error": err.to_string()
                })),
            });
        }
    };

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in read_dir.flatten() {
        if stats.entries >= MAX_SCAN_ENTRIES_LIMIT {
            if !stats.limit_reached {
                warnings.push(WarningItem {
                    code: "ScanLimitReached".to_string(),
                    message: format!(
                        "Scan limit reached at {} entries; results may be incomplete",
                        stats.entries
                    ),
                    path: None,
                });
                stats.limit_reached = true;
            }
            break;
        }

        stats.entries += 1;

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        if IGNORE_DIRS.contains(&name.as_str()) {
            continue;
        }

        let entry_path = entry.path();
        let meta = match fs::symlink_metadata(&entry_path) {
            Ok(meta) => meta,
            Err(_err) => {
                warnings.push(WarningItem {
                    code: "ScanFailed".to_string(),
                    message: "Failed to read entry metadata".to_string(),
                    path: Some(canonical_to_string(&entry_path)),
                });
                continue;
            }
        };

        if meta.file_type().is_symlink() {
            warnings.push(WarningItem {
                code: "SymlinkNotAllowed".to_string(),
                message: "Symlink entry ignored".to_string(),
                path: Some(canonical_to_string(&entry_path)),
            });
            continue;
        }

        if meta.is_dir() {
            let child_rel = rel_path.join(&name);
            let children = if recursive {
                Some(scan_dir(vault_root, &child_rel, warnings, stats, true)?)
            } else {
                None
            };
            dirs.push(FileNode {
                node_type: "dir".to_string(),
                name,
                path: rel_path_string(&child_rel),
                mtime: None,
                children,
            });
        } else if meta.is_file() {
            if entry_path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                continue;
            }

            let file_rel = rel_path.join(&name);
            files.push(FileNode {
                node_type: "file".to_string(),
                name,
                path: rel_path_string(&file_rel),
                mtime: file_mtime(&entry_path),
                children: None,
            });
        }
    }

    dirs.sort_by_key(|node| node.name.to_lowercase());
    files.sort_by_key(|node| node.name.to_lowercase());
    dirs.extend(files);

    Ok(dirs)
}

fn read_markdown_impl(
    vault_root: &Path,
    rel_path: &Path,
) -> Result<ReadMarkdownResponse, ApiError> {
    let resolved = resolve_existing_path(vault_root, rel_path)?;
    let bytes = fs::read(&resolved).map_err(map_read_error)?;
    let content = String::from_utf8(bytes).map_err(|err| ApiError {
        code: "DecodeFailed".to_string(),
        message: "Failed to decode file as UTF-8".to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    })?;

    let mtime = file_mtime(&resolved);
    Ok(ReadMarkdownResponse {
        path: rel_path_string(rel_path),
        content,
        mtime,
    })
}

fn write_markdown_impl(
    vault_root: &Path,
    rel_path: &Path,
    content: &str,
) -> Result<WriteMarkdownResponse, ApiError> {
    let resolved = resolve_existing_path(vault_root, rel_path)?;
    let parent = resolved.parent().ok_or_else(|| ApiError {
        code: "WriteFailed".to_string(),
        message: "Invalid target path".to_string(),
        details: None,
    })?;

    let temp_name = format!(
        ".tmp-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    let temp_path = parent.join(temp_name);

    if let Err(err) = fs::write(&temp_path, content) {
        return Err(write_error_with_context(
            "Failed to write temp file",
            err,
            "temp_write",
            &temp_path,
        ));
    }

    if let Err(err) = fs::rename(&temp_path, &resolved) {
        if err.kind() == std::io::ErrorKind::AlreadyExists {
            if let Err(remove_err) = fs::remove_file(&resolved) {
                let _ = fs::remove_file(&temp_path);
                return Err(write_error_with_context(
                    "Failed to remove existing file",
                    remove_err,
                    "remove_existing",
                    &resolved,
                ));
            }
        }
        if let Err(rename_err) = fs::rename(&temp_path, &resolved) {
            let _ = fs::remove_file(&temp_path);
            return Err(write_error_with_context(
                "Failed to replace file",
                rename_err,
                "replace",
                &resolved,
            ));
        } else if err.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(write_error_with_context(
                "Failed to replace file",
                err,
                "replace",
                &resolved,
            ));
        }
    }

    let mtime = file_mtime(&resolved);
    Ok(WriteMarkdownResponse {
        path: rel_path_string(rel_path),
        mtime,
    })
}

fn rename_markdown_impl(
    vault_root: &Path,
    rel_path: &Path,
    new_name: &str,
) -> Result<RenameMarkdownResponse, ApiError> {
    let rel_path_text = rel_path_string(rel_path);
    if rel_path_text.trim().is_empty() {
        return Err(ApiError {
            code: "NotFound".to_string(),
            message: "Path does not exist".to_string(),
            details: Some(serde_json::json!({ "path": rel_path_text })),
        });
    }

    let lower = rel_path_text.to_ascii_lowercase();
    if !lower.ends_with(".md") {
        return Err(ApiError {
            code: "NotFound".to_string(),
            message: "Only markdown files can be renamed".to_string(),
            details: Some(serde_json::json!({ "path": rel_path_text })),
        });
    }

    let source_abs = resolve_existing_path(vault_root, rel_path)?;
    let metadata =
        fs::metadata(&source_abs).map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
    if !metadata.is_file() {
        return Err(ApiError {
            code: "NotFound".to_string(),
            message: "Path is not a file".to_string(),
            details: Some(serde_json::json!({ "path": rel_path_text })),
        });
    }

    let file_name = sanitize_markdown_file_name(new_name)?;
    let existing_name = source_abs
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or_default();
    if existing_name == file_name {
        let mtime = file_mtime(&source_abs);
        return Ok(RenameMarkdownResponse {
            old_path: rel_path_text.clone(),
            new_path: rel_path_text,
            mtime,
        });
    }

    let parent_rel = rel_path.parent().unwrap_or_else(|| Path::new(""));
    let parent_abs = resolve_existing_dir(vault_root, parent_rel)?;
    let target_abs = parent_abs.join(&file_name);
    if target_abs.exists() {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "Target file already exists".to_string(),
            details: Some(serde_json::json!({ "path": canonical_to_string(&target_abs) })),
        });
    }

    fs::rename(&source_abs, &target_abs)
        .map_err(|err| map_write_error("Failed to rename file", err))?;
    let mtime = file_mtime(&target_abs);

    let mut new_rel = parent_rel.to_path_buf();
    new_rel.push(file_name);

    Ok(RenameMarkdownResponse {
        old_path: rel_path_text,
        new_path: rel_path_string(&new_rel),
        mtime,
    })
}

fn sanitize_markdown_file_name(input: &str) -> Result<String, ApiError> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "Invalid file name".to_string(),
            details: None,
        });
    }

    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "Invalid file name".to_string(),
            details: Some(serde_json::json!({ "name": trimmed })),
        });
    }

    let mut name = trimmed.to_string();
    let lower = name.to_ascii_lowercase();
    if !lower.ends_with(".md") {
        if name.contains('.') {
            return Err(ApiError {
                code: "WriteFailed".to_string(),
                message: "Only .md files can be renamed".to_string(),
                details: Some(serde_json::json!({ "name": name })),
            });
        }
        name.push_str(".md");
    }

    Ok(name)
}

fn resolve_existing_path(vault_root: &Path, rel_path: &Path) -> Result<PathBuf, ApiError> {
    if rel_path.is_absolute() {
        return Err(ApiError {
            code: "PathOutsideVault".to_string(),
            message: "Absolute paths are not allowed".to_string(),
            details: None,
        });
    }

    let mut current = vault_root.to_path_buf();
    for component in rel_path.components() {
        current.push(component);
        if !current.exists() {
            return Err(ApiError {
                code: "NotFound".to_string(),
                message: "Path does not exist".to_string(),
                details: Some(serde_json::json!({ "path": rel_path_string(rel_path) })),
            });
        }
        let meta = fs::symlink_metadata(&current).map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
        if meta.file_type().is_symlink() {
            return Err(ApiError {
                code: "SymlinkNotAllowed".to_string(),
                message: "Symlink path is not allowed".to_string(),
                details: Some(serde_json::json!({ "path": rel_path_string(rel_path) })),
            });
        }
    }

    let canonical_root =
        vault_root
            .canonicalize()
            .map_err(|err| map_io_error("Unknown", "Vault resolve failed", err))?;
    let canonical_path = current
        .canonicalize()
        .map_err(|err| map_io_error("Unknown", "Path resolve failed", err))?;

    if !canonical_path.starts_with(&canonical_root) {
        return Err(ApiError {
            code: "PathOutsideVault".to_string(),
            message: "Path is outside vault".to_string(),
            details: Some(serde_json::json!({ "path": rel_path_string(rel_path) })),
        });
    }

    Ok(canonical_path)
}

fn resolve_existing_dir(vault_root: &Path, rel_path: &Path) -> Result<PathBuf, ApiError> {
    let resolved = resolve_existing_path(vault_root, rel_path)?;
    let metadata = fs::metadata(&resolved)
        .map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
    if !metadata.is_dir() {
        return Err(ApiError {
            code: "NotFound".to_string(),
            message: "Path is not a directory".to_string(),
            details: Some(serde_json::json!({ "path": rel_path_string(rel_path) })),
        });
    }
    Ok(resolved)
}

fn file_mtime(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    modified.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

fn ensure_no_symlink(path: &Path) -> Result<(), ApiError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component);
        let meta = fs::symlink_metadata(&current).map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
        if meta.file_type().is_symlink() {
            return Err(ApiError {
                code: "SymlinkNotAllowed".to_string(),
                message: "Symlink path is not allowed".to_string(),
                details: Some(serde_json::json!({ "path": canonical_to_string(path) })),
            });
        }
    }
    Ok(())
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
    if (typeof url !== "string") return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    emitOpen(trimmed);
    return true;
  }};

  const wrapHistory = (method) => {{
    const original = history[method];
    if (!original) return;
    history[method] = function(...args) {{
      const result = original.apply(this, args);
      setTimeout(emitState, 0);
      return result;
    }};
  }};
  wrapHistory("pushState");
  wrapHistory("replaceState");

  window.addEventListener("DOMContentLoaded", emitState);
  window.addEventListener("load", emitState);
  window.addEventListener("hashchange", emitState);
  window.addEventListener("popstate", emitState);
  window.addEventListener("pageshow", emitState);
  emitState();

  document.addEventListener("click", (event) => {{
    const target = event.target;
    if (!target || !target.closest) return;
    const anchor = target.closest("a");
    if (!anchor) return;
    const targetAttr = anchor.getAttribute("target");
    if (targetAttr && targetAttr.toLowerCase() === "_blank") {{
      const href = anchor.href;
      if (handleOpenUrl(href)) {{
        event.preventDefault();
      }}
    }}
  }}, true);

  const originalOpen = window.open;
  window.open = function(url, ...args) {{
    if (handleOpenUrl(url)) {{
      return null;
    }}
    if (typeof originalOpen === "function") {{
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
}})();"#,
        label_json = label_json
    )
}

fn canonical_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn rel_path_string(path: &Path) -> String {
    path.iter()
        .map(|part| part.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn map_io_error(code: &str, message: &str, err: std::io::Error) -> ApiError {
    ApiError {
        code: code.to_string(),
        message: message.to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    }
}

fn map_read_error(err: std::io::Error) -> ApiError {
    match err.kind() {
        std::io::ErrorKind::NotFound => ApiError {
            code: "NotFound".to_string(),
            message: "File not found".to_string(),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        },
        std::io::ErrorKind::PermissionDenied => ApiError {
            code: "PermissionDenied".to_string(),
            message: "Permission denied".to_string(),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        },
        _ => ApiError {
            code: "Unknown".to_string(),
            message: "Failed to read file".to_string(),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        },
    }
}

fn map_write_error(message: &str, err: std::io::Error) -> ApiError {
    let code = match err.kind() {
        std::io::ErrorKind::PermissionDenied => "PermissionDenied",
        std::io::ErrorKind::NotFound => "NotFound",
        _ => "WriteFailed",
    };
    ApiError {
        code: code.to_string(),
        message: message.to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    }
}

fn write_error_with_context(
    message: &str,
    err: std::io::Error,
    step: &str,
    path: &Path,
) -> ApiError {
    let code = match err.kind() {
        std::io::ErrorKind::PermissionDenied => "PermissionDenied",
        std::io::ErrorKind::NotFound => "NotFound",
        _ => "WriteFailed",
    };
    ApiError {
        code: code.to_string(),
        message: message.to_string(),
        details: Some(serde_json::json!({
            "step": step,
            "path": canonical_to_string(path),
            "error": err.to_string()
        })),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            fs::create_dir_all(&config_dir)?;
            let config_path = config_dir.join("vault.json");
            let state = VaultState {
                root: Mutex::new(load_persisted_vault(&config_path)),
                config_path,
            };
            app.manage(state);
            Ok(())
        })
        .plugin(init_webview_bridge())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            select_vault,
            scan_vault,
            read_markdown,
            write_markdown,
            rename_markdown
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn load_persisted_vault(config_path: &Path) -> Option<PathBuf> {
    if let Ok(data) = fs::read_to_string(config_path) {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&data) {
            if let Some(vault_root) = payload.get("vault_root").and_then(|v| v.as_str()) {
                let path = PathBuf::from(vault_root);
                if let Some(validated) = validate_vault_path(&path) {
                    return Some(validated);
                }
            }
        }
    }
    load_default_vault()
}

fn load_default_vault() -> Option<PathBuf> {
    let path = PathBuf::from(DEFAULT_VAULT_PATH);
    validate_vault_path(&path)
}

fn validate_vault_path(path: &Path) -> Option<PathBuf> {
    ensure_no_symlink(path).ok()?;
    let canonical = path.canonicalize().ok()?;
    if !canonical.is_dir() {
        return None;
    }
    Some(canonical)
}
