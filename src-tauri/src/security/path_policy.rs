use std::fs;
use std::path::{Path, PathBuf};

use crate::ipc::{map_io_error, ApiError};

pub fn ensure_no_symlink(path: &Path) -> Result<(), ApiError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component);
        let meta = fs::symlink_metadata(&current)
            .map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
        if meta.file_type().is_symlink() {
            return Err(ApiError {
                code: "SymlinkNotAllowed".to_string(),
                message: "Symlink path is not allowed".to_string(),
                details: Some(serde_json::json!({ "path": path.to_string_lossy().to_string() })),
            });
        }
    }
    Ok(())
}

pub fn resolve_existing_path(vault_root: &Path, rel_path: &Path) -> Result<PathBuf, ApiError> {
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
                details: Some(serde_json::json!({ "path": rel_path.to_string_lossy().to_string() })),
            });
        }
        let meta = fs::symlink_metadata(&current)
            .map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
        if meta.file_type().is_symlink() {
            return Err(ApiError {
                code: "SymlinkNotAllowed".to_string(),
                message: "Symlink path is not allowed".to_string(),
                details: Some(serde_json::json!({ "path": rel_path.to_string_lossy().to_string() })),
            });
        }
    }

    let canonical_root = vault_root
        .canonicalize()
        .map_err(|err| map_io_error("Unknown", "Vault resolve failed", err))?;
    let canonical_path = current
        .canonicalize()
        .map_err(|err| map_io_error("Unknown", "Path resolve failed", err))?;

    if !canonical_path.starts_with(&canonical_root) {
        return Err(ApiError {
            code: "PathOutsideVault".to_string(),
            message: "Path is outside vault".to_string(),
            details: Some(serde_json::json!({ "path": rel_path.to_string_lossy().to_string() })),
        });
    }

    Ok(canonical_path)
}

pub fn resolve_existing_dir(vault_root: &Path, rel_path: &Path) -> Result<PathBuf, ApiError> {
    let resolved = resolve_existing_path(vault_root, rel_path)?;
    let metadata = fs::metadata(&resolved)
        .map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
    if !metadata.is_dir() {
        return Err(ApiError {
            code: "NotFound".to_string(),
            message: "Path is not a directory".to_string(),
            details: Some(serde_json::json!({ "path": rel_path.to_string_lossy().to_string() })),
        });
    }
    Ok(resolved)
}

pub fn ensure_abs_file_in_vault(vault_root: &Path, abs_path: &Path) -> Result<PathBuf, ApiError> {
    let canonical_root = vault_root
        .canonicalize()
        .map_err(|err| map_io_error("Unknown", "Vault resolve failed", err))?;
    let canonical_path = abs_path
        .canonicalize()
        .map_err(|err| map_io_error("Unknown", "Path resolve failed", err))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(ApiError {
            code: "PathOutsideVault".to_string(),
            message: "Path is outside vault".to_string(),
            details: Some(serde_json::json!({ "path": abs_path.to_string_lossy().to_string() })),
        });
    }
    ensure_no_symlink(&canonical_path)?;
    Ok(canonical_path)
}

pub fn ensure_or_create_dir_in_vault(vault_root: &Path, abs_dir: &Path) -> Result<(), ApiError> {
    let canonical_root = vault_root
        .canonicalize()
        .map_err(|err| map_io_error("Unknown", "Vault resolve failed", err))?;

    let abs_dir = if abs_dir.is_absolute() {
        abs_dir.to_path_buf()
    } else {
        vault_root.join(abs_dir)
    };
    if !abs_dir.starts_with(vault_root) {
        return Err(ApiError {
            code: "PathOutsideVault".to_string(),
            message: "Path is outside vault".to_string(),
            details: Some(serde_json::json!({ "path": abs_dir.to_string_lossy().to_string() })),
        });
    }

    let mut current = PathBuf::new();
    for component in abs_dir.components() {
        current.push(component);
        if current == canonical_root {
            continue;
        }
        if current.exists() {
            let meta = fs::symlink_metadata(&current)
                .map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
            if meta.file_type().is_symlink() {
                return Err(ApiError {
                    code: "SymlinkNotAllowed".to_string(),
                    message: "Symlink path is not allowed".to_string(),
                    details: Some(serde_json::json!({ "path": current.to_string_lossy().to_string() })),
                });
            }
            continue;
        }
        fs::create_dir(&current)
            .map_err(|err| map_io_error("WriteFailed", "Failed to create directory", err))?;
    }

    let canonical_dir = abs_dir
        .canonicalize()
        .map_err(|err| map_io_error("Unknown", "Path resolve failed", err))?;
    if !canonical_dir.starts_with(&canonical_root) {
        return Err(ApiError {
            code: "PathOutsideVault".to_string(),
            message: "Path is outside vault".to_string(),
            details: Some(serde_json::json!({ "path": abs_dir.to_string_lossy().to_string() })),
        });
    }
    ensure_no_symlink(&canonical_dir)?;
    Ok(())
}

