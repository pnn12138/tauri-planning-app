use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use tauri::State;

use crate::ipc::{ApiError, ApiResponse};
use crate::services::plugins_service;
use crate::state::VaultState;

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

#[derive(Serialize, Deserialize, Clone)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub entry: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(rename = "minAppVersion", default)]
    pub min_app_version: String,
    #[serde(default)]
    pub permissions: Vec<String>,
}

#[derive(Serialize)]
pub struct PluginListItem {
    pub manifest: Option<PluginManifest>,
    pub enabled: bool,
    pub dir: String,
    pub error: Option<ApiError>,
}

#[derive(Serialize)]
pub struct PluginsListResponse {
    pub plugins: Vec<PluginListItem>,
}

#[tauri::command]
pub async fn plugins_list(
    state: State<'_, VaultState>,
) -> Result<ApiResponse<PluginsListResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let result =
        tauri::async_runtime::spawn_blocking(move || plugins_service::list_plugins(&vault_root))
            .await;
    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(PluginsListResponse {
            plugins: response
                .plugins
                .into_iter()
                .map(|item| PluginListItem {
                    manifest: item.manifest,
                    enabled: item.enabled,
                    dir: item.dir,
                    error: item.error,
                })
                .collect(),
        })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Plugins list task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[derive(Deserialize)]
pub struct PluginsReadManifestInput {
    #[serde(rename = "pluginId")]
    pub plugin_id: String,
}

#[tauri::command]
pub async fn plugins_read_manifest(
    state: State<'_, VaultState>,
    input: PluginsReadManifestInput,
) -> Result<ApiResponse<PluginManifest>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };
    let plugin_id = input.plugin_id;
    let result = tauri::async_runtime::spawn_blocking(move || {
        plugins_service::read_manifest(&vault_root, &plugin_id)
    })
    .await;

    match result {
        Ok(Ok(manifest)) => Ok(ApiResponse::ok(manifest)),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Plugins read manifest task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[derive(Deserialize)]
pub struct PluginsReadEntryInput {
    #[serde(rename = "pluginId")]
    pub plugin_id: String,
    pub entry: String,
}

#[derive(Serialize)]
pub struct PluginsReadEntryResponse {
    pub content: String,
}

#[tauri::command]
pub async fn plugins_read_entry(
    state: State<'_, VaultState>,
    input: PluginsReadEntryInput,
) -> Result<ApiResponse<PluginsReadEntryResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };
    let plugin_id = input.plugin_id;
    let entry = input.entry;
    let result = tauri::async_runtime::spawn_blocking(move || {
        plugins_service::read_entry(&vault_root, &plugin_id, &entry)
    })
    .await;

    match result {
        Ok(Ok(content)) => Ok(ApiResponse::ok(PluginsReadEntryResponse { content })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Plugins read entry task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[derive(Deserialize)]
pub struct PluginsSetEnabledInput {
    #[serde(rename = "pluginId")]
    pub plugin_id: String,
    pub enabled: bool,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct PluginsSetEnabledResponse {
    pub ok: bool,
}

#[tauri::command]
pub async fn plugins_set_enabled(
    state: State<'_, VaultState>,
    input: PluginsSetEnabledInput,
) -> Result<ApiResponse<PluginsSetEnabledResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };
    let plugin_id = input.plugin_id;
    let enabled = input.enabled;
    let reason = input.reason;
    let result = tauri::async_runtime::spawn_blocking(move || {
        plugins_service::set_enabled(&vault_root, &plugin_id, enabled, reason.as_deref())
    })
    .await;

    match result {
        Ok(Ok(())) => Ok(ApiResponse::ok(PluginsSetEnabledResponse { ok: true })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Plugins set enabled task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[derive(Deserialize)]
pub struct VaultReadTextInput {
    pub path: String,
}

#[derive(Serialize)]
pub struct VaultReadTextResponse {
    pub path: String,
    pub content: String,
    pub mtime: Option<u64>,
}

#[tauri::command]
pub async fn vault_read_text(
    state: State<'_, VaultState>,
    input: VaultReadTextInput,
) -> Result<ApiResponse<VaultReadTextResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };
    let rel_path = PathBuf::from(input.path);
    let result = tauri::async_runtime::spawn_blocking(move || {
        plugins_service::vault_read_text(&vault_root, &rel_path)
    })
    .await;
    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(VaultReadTextResponse {
            path: response.path,
            content: response.content,
            mtime: response.mtime,
        })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Vault read task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[derive(Deserialize)]
pub struct VaultWriteTextInput {
    pub path: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct VaultWriteTextResponse {
    pub path: String,
    pub mtime: Option<u64>,
}

#[tauri::command]
pub async fn vault_write_text(
    state: State<'_, VaultState>,
    input: VaultWriteTextInput,
) -> Result<ApiResponse<VaultWriteTextResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };
    let rel_path = PathBuf::from(input.path);
    let content = input.content;
    let result = tauri::async_runtime::spawn_blocking(move || {
        plugins_service::vault_write_text(&vault_root, &rel_path, &content)
    })
    .await;
    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(VaultWriteTextResponse {
            path: response.path,
            mtime: response.mtime,
        })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Vault write task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}
#[derive(Deserialize)]
pub struct VaultListFilesInput {
    pub path: String, // Relative path, e.g., ".skills"
}

#[derive(Serialize)]
pub struct VaultListFilesResponse {
    pub files: Vec<String>,
}

#[tauri::command]
pub async fn vault_list_files(
    state: State<'_, VaultState>,
    input: VaultListFilesInput,
) -> Result<ApiResponse<VaultListFilesResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = PathBuf::from(input.path);

    let result = tauri::async_runtime::spawn_blocking(move || {
        // Resolve absolute path
        let abs_dir = crate::security::path_policy::resolve_existing_dir(&vault_root, &rel_path)?;

        // List files
        let mut files = Vec::new();
        if let Ok(entries) = std::fs::read_dir(abs_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        if let Ok(name) = entry.file_name().into_string() {
                            files.push(name);
                        }
                    }
                }
            }
        }
        Ok::<VaultListFilesResponse, ApiError>(VaultListFilesResponse { files })
    })
    .await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(response)),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Vault list files task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}
