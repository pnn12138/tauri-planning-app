use std::fs;
use std::path::{Path, PathBuf};

use crate::commands::plugins::PluginManifest;
use crate::ipc::{map_read_error, map_write_error, ApiError};
use crate::paths::rel_path_string;
use crate::repo::settings_repo;
use crate::security::path_policy;
use crate::services::vault_service;
use std::time::{SystemTime, UNIX_EPOCH};

const PLUGINS_DIR: &str = ".yourapp/plugins";
const MANIFEST_FILE: &str = "manifest.json";

pub struct PluginListItem {
    pub manifest: Option<PluginManifest>,
    pub enabled: bool,
    pub dir: String,
    pub error: Option<ApiError>,
}

pub struct PluginsListResult {
    pub plugins: Vec<PluginListItem>,
}

fn plugins_root(vault_root: &Path) -> PathBuf {
    vault_root.join(PLUGINS_DIR)
}

fn is_valid_plugin_id(plugin_id: &str) -> bool {
    if plugin_id.is_empty() || plugin_id.len() > 64 {
        return false;
    }
    plugin_id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

fn validate_plugin_id(plugin_id: &str) -> Result<(), ApiError> {
    if !is_valid_plugin_id(plugin_id) {
        return Err(ApiError {
            code: "InvalidManifest".to_string(),
            message: "Invalid plugin id".to_string(),
            details: Some(serde_json::json!({ "pluginId": plugin_id })),
        });
    }
    Ok(())
}

pub fn list_plugins(vault_root: &Path) -> Result<PluginsListResult, ApiError> {
    let settings = settings_repo::load_settings(vault_root).unwrap_or_default();
    let enabled_set = settings.plugins.enabled;

    let root = plugins_root(vault_root);
    if !root.exists() {
        return Ok(PluginsListResult { plugins: vec![] });
    }
    path_policy::ensure_no_symlink(&root)?;

    let mut out: Vec<PluginListItem> = Vec::new();
    let entries = fs::read_dir(&root).map_err(map_read_error)?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                out.push(PluginListItem {
                    manifest: None,
                    enabled: false,
                    dir: "".to_string(),
                    error: Some(ApiError {
                        code: "ScanFailed".to_string(),
                        message: "Failed to read plugin entry".to_string(),
                        details: Some(serde_json::json!({ "error": err.to_string() })),
                    }),
                });
                continue;
            }
        };
        let file_type = entry.file_type().map_err(map_read_error)?;
        if !file_type.is_dir() {
            continue;
        }
        if file_type.is_symlink() {
            continue;
        }

        let dir_name = entry.file_name().to_string_lossy().to_string();
        let enabled = enabled_set.iter().any(|id| id == &dir_name);
        if !is_valid_plugin_id(&dir_name) {
            out.push(PluginListItem {
                manifest: None,
                enabled,
                dir: dir_name,
                error: Some(ApiError {
                    code: "InvalidManifest".to_string(),
                    message: "Invalid plugin directory name".to_string(),
                    details: None,
                }),
            });
            continue;
        }

        let manifest_path = entry.path().join(MANIFEST_FILE);
        if !manifest_path.exists() {
            out.push(PluginListItem {
                manifest: None,
                enabled,
                dir: dir_name,
                error: Some(ApiError {
                    code: "InvalidManifest".to_string(),
                    message: "manifest.json not found".to_string(),
                    details: None,
                }),
            });
            continue;
        }

        let manifest_text = match fs::read_to_string(&manifest_path) {
            Ok(text) => text,
            Err(err) => {
                out.push(PluginListItem {
                    manifest: None,
                    enabled,
                    dir: dir_name,
                    error: Some(map_read_error(err)),
                });
                continue;
            }
        };
        let manifest: PluginManifest = match serde_json::from_str(&manifest_text) {
            Ok(value) => value,
            Err(err) => {
                out.push(PluginListItem {
                    manifest: None,
                    enabled,
                    dir: dir_name,
                    error: Some(ApiError {
                        code: "InvalidManifest".to_string(),
                        message: "Failed to parse manifest.json".to_string(),
                        details: Some(serde_json::json!({ "error": err.to_string() })),
                    }),
                });
                continue;
            }
        };
        if manifest.id != dir_name {
            out.push(PluginListItem {
                manifest: None,
                enabled,
                dir: dir_name,
                error: Some(ApiError {
                    code: "InvalidManifest".to_string(),
                    message: "manifest.id must match directory name".to_string(),
                    details: Some(serde_json::json!({ "id": manifest.id })),
                }),
            });
            continue;
        }
        if manifest.entry != "main.js" {
            out.push(PluginListItem {
                manifest: None,
                enabled,
                dir: dir_name,
                error: Some(ApiError {
                    code: "InvalidManifest".to_string(),
                    message: "Only entry=main.js is supported in v0".to_string(),
                    details: Some(serde_json::json!({ "entry": manifest.entry })),
                }),
            });
            continue;
        }

        out.push(PluginListItem {
            manifest: Some(manifest),
            enabled,
            dir: dir_name,
            error: None,
        });
    }

    out.sort_by_key(|item| item.dir.to_lowercase());
    Ok(PluginsListResult { plugins: out })
}

pub fn read_manifest(vault_root: &Path, plugin_id: &str) -> Result<PluginManifest, ApiError> {
    validate_plugin_id(plugin_id)?;
    let manifest_path = plugins_root(vault_root).join(plugin_id).join(MANIFEST_FILE);
    if !manifest_path.exists() {
        return Err(ApiError {
            code: "NotFound".to_string(),
            message: "manifest.json not found".to_string(),
            details: Some(serde_json::json!({ "pluginId": plugin_id })),
        });
    }
    let text = fs::read_to_string(&manifest_path).map_err(map_read_error)?;
    let manifest: PluginManifest = serde_json::from_str(&text).map_err(|err| ApiError {
        code: "InvalidManifest".to_string(),
        message: "Failed to parse manifest.json".to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    })?;
    if manifest.id != plugin_id {
        return Err(ApiError {
            code: "InvalidManifest".to_string(),
            message: "manifest.id must match pluginId".to_string(),
            details: Some(serde_json::json!({ "id": manifest.id, "pluginId": plugin_id })),
        });
    }
    Ok(manifest)
}

pub fn read_entry(vault_root: &Path, plugin_id: &str, entry: &str) -> Result<String, ApiError> {
    validate_plugin_id(plugin_id)?;
    if entry != "main.js" {
        return Err(ApiError {
            code: "EntryNotFound".to_string(),
            message: "Only main.js is supported in v0".to_string(),
            details: Some(serde_json::json!({ "entry": entry })),
        });
    }
    let entry_path = plugins_root(vault_root).join(plugin_id).join(entry);
    if !entry_path.exists() {
        return Err(ApiError {
            code: "EntryNotFound".to_string(),
            message: "Entry not found".to_string(),
            details: Some(serde_json::json!({ "entry": entry })),
        });
    }
    let resolved = path_policy::ensure_abs_file_in_vault(vault_root, &entry_path)?;
    fs::read_to_string(&resolved).map_err(map_read_error)
}

pub fn set_enabled(vault_root: &Path, plugin_id: &str, enabled: bool, reason: Option<&str>) -> Result<(), ApiError> {
    validate_plugin_id(plugin_id)?;
    settings_repo::set_plugin_enabled(vault_root, plugin_id, enabled, reason)
}

pub fn vault_read_text(vault_root: &Path, rel_path: &Path) -> Result<vault_service::ReadTextResult, ApiError> {
    vault_service::read_text_file(vault_root, rel_path)
}

pub fn vault_write_text(
    vault_root: &Path,
    rel_path: &Path,
    content: &str,
) -> Result<vault_service::WriteTextResult, ApiError> {
    if rel_path.is_absolute() {
        return Err(ApiError {
            code: "PathOutsideVault".to_string(),
            message: "Absolute paths are not allowed".to_string(),
            details: None,
        });
    }
    let abs_path = vault_root.join(rel_path);
    if let Some(parent) = abs_path.parent() {
        path_policy::ensure_or_create_dir_in_vault(vault_root, parent)?;
    }

    if abs_path.exists() {
        let meta = fs::symlink_metadata(&abs_path).map_err(map_read_error)?;
        if meta.file_type().is_symlink() {
            return Err(ApiError {
                code: "SymlinkNotAllowed".to_string(),
                message: "Symlink file is not allowed".to_string(),
                details: Some(serde_json::json!({ "path": rel_path_string(rel_path) })),
            });
        }
    }

    let parent = abs_path.parent().ok_or_else(|| ApiError {
        code: "WriteFailed".to_string(),
        message: "Invalid target path".to_string(),
        details: None,
    })?;

    let temp_name = format!(
        ".tmp-plugin-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    let temp_path = parent.join(temp_name);

    fs::write(&temp_path, content).map_err(|err| map_write_error("Failed to write temp file", err))?;

    if let Err(err) = fs::rename(&temp_path, &abs_path) {
        if err.kind() == std::io::ErrorKind::AlreadyExists {
            if let Ok(meta) = fs::symlink_metadata(&abs_path) {
                if meta.file_type().is_symlink() {
                    let _ = fs::remove_file(&temp_path);
                    return Err(ApiError {
                        code: "SymlinkNotAllowed".to_string(),
                        message: "Symlink file is not allowed".to_string(),
                        details: Some(serde_json::json!({ "path": rel_path_string(rel_path) })),
                    });
                }
            }
            if let Err(remove_err) = fs::remove_file(&abs_path) {
                let _ = fs::remove_file(&temp_path);
                return Err(map_write_error("Failed to remove existing file", remove_err));
            }
            fs::rename(&temp_path, &abs_path)
                .map_err(|rename_err| map_write_error("Failed to replace file", rename_err))?;
        } else {
            let _ = fs::remove_file(&temp_path);
            return Err(map_write_error("Failed to write file", err));
        }
    }

    let mtime = fs::metadata(&abs_path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    Ok(vault_service::WriteTextResult {
        path: rel_path_string(rel_path),
        mtime,
    })
}
