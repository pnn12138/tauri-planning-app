use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use tauri::State;

use crate::ipc::{ApiError, ApiResponse};
use crate::repo::vault_repo;
use crate::security::path_policy;
use crate::services::vault_service;
use crate::state::VaultState;

#[derive(Serialize)]
pub struct SelectVaultResponse {
    #[serde(rename = "vaultRoot")]
    pub vault_root: String,
}

#[derive(Serialize)]
pub struct WarningItem {
    pub code: String,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Serialize)]
pub struct ScanVaultResponse {
    #[serde(rename = "vaultRoot")]
    pub vault_root: String,
    pub tree: Vec<vault_service::FileNode>,
    pub warnings: Vec<WarningItem>,
}

#[derive(Serialize)]
pub struct ReadMarkdownResponse {
    pub path: String,
    pub content: String,
    pub mtime: Option<u64>,
}

#[derive(Serialize)]
pub struct WriteMarkdownResponse {
    pub path: String,
    pub mtime: Option<u64>,
}

#[derive(Deserialize)]
pub struct ReadMarkdownInput {
    pub path: String,
}

#[derive(Deserialize)]
pub struct WriteMarkdownInput {
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct RenameMarkdownInput {
    pub path: String,
    #[serde(rename = "newName")]
    pub new_name: String,
}

#[derive(Serialize)]
pub struct RenameMarkdownResponse {
    #[serde(rename = "oldPath")]
    pub old_path: String,
    #[serde(rename = "newPath")]
    pub new_path: String,
    pub mtime: Option<u64>,
}

#[derive(Deserialize)]
pub struct DeleteEntryInput {
    pub path: String,
}

#[derive(Serialize)]
pub struct DeleteEntryResponse {
    pub path: String,
}

#[derive(Deserialize)]
pub struct CreateEntryInput {
    #[serde(rename = "parentPath")]
    pub parent_path: Option<String>,
    pub kind: String,
}

#[derive(Serialize)]
pub struct CreateEntryResponse {
    pub path: String,
    pub kind: String,
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

#[tauri::command]
pub fn select_vault(state: State<'_, VaultState>) -> ApiResponse<SelectVaultResponse> {
    let folder = rfd::FileDialog::new().pick_folder();
    let Some(path) = folder else {
        return ApiResponse::err("NoVaultSelected", "Vault selection cancelled", None);
    };

    if let Err(err) = path_policy::ensure_no_symlink(&path) {
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

    if let Err(err) = vault_repo::persist_vault(&state, &canonical) {
        return ApiResponse::err(&err.code, &err.message, err.details);
    }
    let mut guard = state.root.lock().expect("vault mutex poisoned");
    *guard = Some(canonical.clone());

    ApiResponse::ok(SelectVaultResponse {
        vault_root: canonical.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn scan_vault(
    state: State<'_, VaultState>,
    path: Option<String>,
) -> Result<ApiResponse<ScanVaultResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = path.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(PathBuf::from(trimmed))
        }
    });

    let result =
        tauri::async_runtime::spawn_blocking(move || vault_service::scan_vault(&vault_root, rel_path)).await;
    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(ScanVaultResponse {
            vault_root: response.vault_root,
            tree: response.tree,
            warnings: response
                .warnings
                .into_iter()
                .map(|warning| WarningItem {
                    code: warning.code,
                    message: warning.message,
                    path: warning.path,
                })
                .collect(),
        })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "ScanFailed",
            "Scan task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[tauri::command]
pub async fn read_markdown(
    state: State<'_, VaultState>,
    input: ReadMarkdownInput,
) -> Result<ApiResponse<ReadMarkdownResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = PathBuf::from(&input.path);
    let result =
        tauri::async_runtime::spawn_blocking(move || vault_service::read_text_file(&vault_root, &rel_path)).await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(ReadMarkdownResponse {
            path: response.path,
            content: response.content,
            mtime: response.mtime,
        })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "Unknown",
            "Read task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[tauri::command]
pub async fn write_markdown(
    state: State<'_, VaultState>,
    input: WriteMarkdownInput,
) -> Result<ApiResponse<WriteMarkdownResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = PathBuf::from(&input.path);
    let content = input.content;
    let result = tauri::async_runtime::spawn_blocking(move || {
        vault_service::write_text_file(&vault_root, &rel_path, &content)
    })
    .await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(WriteMarkdownResponse {
            path: response.path,
            mtime: response.mtime,
        })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "WriteFailed",
            "Write task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[tauri::command]
pub async fn rename_markdown(
    state: State<'_, VaultState>,
    input: RenameMarkdownInput,
) -> Result<ApiResponse<RenameMarkdownResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = PathBuf::from(input.path.trim());
    let new_name = input.new_name;
    let result =
        tauri::async_runtime::spawn_blocking(move || vault_service::rename_entry(&vault_root, &rel_path, &new_name))
            .await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(RenameMarkdownResponse {
            old_path: response.old_path,
            new_path: response.new_path,
            mtime: response.mtime,
        })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "WriteFailed",
            "Rename task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[tauri::command]
pub async fn delete_entry(
    state: State<'_, VaultState>,
    input: DeleteEntryInput,
) -> Result<ApiResponse<DeleteEntryResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let rel_path = PathBuf::from(input.path.trim());
    let result =
        tauri::async_runtime::spawn_blocking(move || vault_service::delete_entry(&vault_root, &rel_path)).await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(DeleteEntryResponse { path: response.path })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "WriteFailed",
            "Delete task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

#[tauri::command]
pub async fn create_entry(
    state: State<'_, VaultState>,
    input: CreateEntryInput,
) -> Result<ApiResponse<CreateEntryResponse>, ApiError> {
    let vault_root = match current_vault_root(&state) {
        Ok(path) => path,
        Err(err) => return Ok(ApiResponse::err(&err.code, &err.message, err.details)),
    };

    let parent_rel = input.parent_path.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(PathBuf::from(trimmed))
        }
    });
    let kind = input.kind;
    let result = tauri::async_runtime::spawn_blocking(move || {
        vault_service::create_entry(&vault_root, parent_rel.as_deref(), &kind)
    })
    .await;

    match result {
        Ok(Ok(response)) => Ok(ApiResponse::ok(CreateEntryResponse {
            path: response.path,
            kind: response.kind,
        })),
        Ok(Err(err)) => Ok(ApiResponse::err(&err.code, &err.message, err.details)),
        Err(err) => Ok(ApiResponse::err(
            "WriteFailed",
            "Create task failed",
            Some(serde_json::json!({ "error": err.to_string() })),
        )),
    }
}

