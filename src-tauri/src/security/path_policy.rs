use std::fs;
use std::path::{Path, PathBuf};

use crate::ipc::{map_io_error, ApiError};

fn validate_rel_no_parent(rel_path: &Path) -> Result<(), ApiError> {
    if rel_path.is_absolute() {
        return Err(ApiError {
            code: "PathOutsideVault".to_string(),
            message: "Absolute paths are not allowed".to_string(),
            details: None,
        });
    }

    for component in rel_path.components() {
        match component {
            std::path::Component::ParentDir => {
                return Err(ApiError {
                    code: "PathOutsideVault".to_string(),
                    message: "Parent directory (..) is not allowed".to_string(),
                    details: Some(serde_json::json!({ "path": rel_path.to_string_lossy().to_string() })),
                });
            }
            std::path::Component::Prefix(_) => {
                return Err(ApiError {
                    code: "PathOutsideVault".to_string(),
                    message: "Path prefix is not allowed".to_string(),
                    details: Some(serde_json::json!({ "path": rel_path.to_string_lossy().to_string() })),
                });
            }
            _ => {}
        }
    }
    Ok(())
}

pub fn ensure_no_symlink(path: &Path) -> Result<(), ApiError> {
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component);
        if matches!(component, std::path::Component::Prefix(_)) {
            continue;
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(windows)]
    fn ensure_no_symlink_does_not_probe_drive_prefix() {
        let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        let drive_root = PathBuf::from(format!("{system_drive}\\"));
        ensure_no_symlink(&drive_root).unwrap();
    }
}

pub fn resolve_existing_path(vault_root: &Path, rel_path: &Path) -> Result<PathBuf, ApiError> {
    validate_rel_no_parent(rel_path)?;

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
    for component in abs_dir.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(ApiError {
                code: "PathOutsideVault".to_string(),
                message: "Parent directory (..) is not allowed".to_string(),
                details: Some(serde_json::json!({ "path": abs_dir.to_string_lossy().to_string() })),
            });
        }
    }

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

    let rel_dir = abs_dir.strip_prefix(vault_root).unwrap_or(Path::new(""));
    validate_rel_no_parent(rel_dir)?;

    let mut current = canonical_root.clone();
    for component in rel_dir.components() {
        match component {
            std::path::Component::CurDir => continue,
            std::path::Component::Normal(part) => current.push(part),
            _ => {
                return Err(ApiError {
                    code: "PathOutsideVault".to_string(),
                    message: "Invalid path component".to_string(),
                    details: Some(serde_json::json!({ "path": rel_dir.to_string_lossy().to_string() })),
                })
            }
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
            if !meta.is_dir() {
                return Err(ApiError {
                    code: "WriteFailed".to_string(),
                    message: "Path component is not a directory".to_string(),
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
