use std::fs;
use std::path::{Path, PathBuf};

use tauri::State;

use crate::ipc::{map_write_error, ApiError};
use crate::security::path_policy;
use crate::state::VaultState;

pub fn persist_vault(state: &State<'_, VaultState>, vault_root: &Path) -> Result<(), ApiError> {
    let payload = serde_json::json!({ "vault_root": vault_root.to_string_lossy().to_string() });
    let data = serde_json::to_string(&payload).map_err(|err| ApiError {
        code: "WriteFailed".to_string(),
        message: "Failed to encode vault state".to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    })?;
    fs::write(&state.config_path, data).map_err(|err| map_write_error("Failed to persist vault", err))?;
    Ok(())
}

pub fn load_persisted_vault(config_path: &Path) -> Option<PathBuf> {
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
    None
}

fn validate_vault_path(path: &Path) -> Option<PathBuf> {
    path_policy::ensure_no_symlink(path).ok()?;
    let canonical = path.canonicalize().ok()?;
    if !canonical.is_dir() {
        return None;
    }
    Some(canonical)
}

