use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ipc::{
    map_io_error, map_read_error, map_write_error, write_error_with_context, ApiError,
};
use crate::paths::{canonical_to_string, rel_path_string};
use crate::security::path_policy;

const IGNORE_DIRS: [&str; 5] = [".git", "node_modules", "target", ".idea", ".vscode"];
const MAX_SCAN_ENTRIES_WARNING: usize = 2000;
const MAX_SCAN_ENTRIES_LIMIT: usize = 8000;

#[derive(Serialize, Clone)]
pub struct FileNode {
    #[serde(rename = "type")]
    pub node_type: String,
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Clone)]
pub struct WarningItem {
    pub code: String,
    pub message: String,
    pub path: Option<String>,
}

pub struct ScanVaultResult {
    pub vault_root: String,
    pub tree: Vec<FileNode>,
    pub warnings: Vec<WarningItem>,
}

pub struct ReadTextResult {
    pub path: String,
    pub content: String,
    pub mtime: Option<u64>,
}

pub struct WriteTextResult {
    pub path: String,
    pub mtime: Option<u64>,
}

pub struct RenameEntryResult {
    pub old_path: String,
    pub new_path: String,
    pub mtime: Option<u64>,
}

pub struct DeleteEntryResult {
    pub path: String,
}

pub struct CreateEntryResult {
    pub path: String,
    pub kind: String,
}

pub fn scan_vault(vault_root: &Path, rel_path: Option<PathBuf>) -> Result<ScanVaultResult, ApiError> {
    let canonical_root = vault_root
        .canonicalize()
        .map_err(|err| map_io_error("Unknown", "Vault resolve failed", err))?;
    path_policy::ensure_no_symlink(&canonical_root)?;

    let mut warnings: Vec<WarningItem> = Vec::new();
    let target_rel = rel_path.unwrap_or_else(PathBuf::new);
    let target_abs = if target_rel.as_os_str().is_empty() {
        canonical_root.clone()
    } else {
        path_policy::resolve_existing_dir(&canonical_root, &target_rel)?
    };

    let mut entry_count: usize = 0;
    let tree = scan_dir_children(
        &canonical_root,
        &target_abs,
        &target_rel,
        &mut warnings,
        &mut entry_count,
    )?;

    if entry_count > MAX_SCAN_ENTRIES_WARNING {
        warnings.push(WarningItem {
            code: "LargeVault".to_string(),
            message: format!("Vault has {entry_count} entries, scanning may be slow"),
            path: None,
        });
    }
    if entry_count > MAX_SCAN_ENTRIES_LIMIT {
        warnings.push(WarningItem {
            code: "ScanLimited".to_string(),
            message: format!("Scan stopped at {MAX_SCAN_ENTRIES_LIMIT} entries"),
            path: None,
        });
    }

    Ok(ScanVaultResult {
        vault_root: canonical_to_string(&canonical_root),
        tree,
        warnings,
    })
}

fn scan_dir_children(
    canonical_root: &Path,
    dir_abs: &Path,
    dir_rel: &Path,
    warnings: &mut Vec<WarningItem>,
    entry_count: &mut usize,
) -> Result<Vec<FileNode>, ApiError> {
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    let entries =
        fs::read_dir(dir_abs).map_err(|err| map_io_error("ScanFailed", "Failed to read directory", err))?;
    for entry in entries {
        if *entry_count >= MAX_SCAN_ENTRIES_LIMIT {
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                warnings.push(WarningItem {
                    code: "ScanFailed".to_string(),
                    message: format!("Failed to read entry: {err}"),
                    path: Some(rel_path_string(dir_rel)),
                });
                continue;
            }
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') {
            continue;
        }
        if IGNORE_DIRS.iter().any(|dir| dir.eq_ignore_ascii_case(&file_name)) {
            continue;
        }

        let entry_path = entry.path();
        let meta = match fs::symlink_metadata(&entry_path) {
            Ok(meta) => meta,
            Err(err) => {
                warnings.push(WarningItem {
                    code: "ScanFailed".to_string(),
                    message: format!("Metadata failed: {err}"),
                    path: Some(rel_path_string(dir_rel)),
                });
                continue;
            }
        };
        if meta.file_type().is_symlink() {
            warnings.push(WarningItem {
                code: "SymlinkNotAllowed".to_string(),
                message: "Symlink path is not allowed".to_string(),
                path: Some(rel_path_string(dir_rel)),
            });
            continue;
        }

        if !entry_path.starts_with(canonical_root) {
            warnings.push(WarningItem {
                code: "PathOutsideVault".to_string(),
                message: "Entry path outside vault".to_string(),
                path: Some(rel_path_string(dir_rel)),
            });
            continue;
        }

        *entry_count += 1;

        if meta.is_dir() {
            let mut child_rel = dir_rel.to_path_buf();
            child_rel.push(&file_name);
            dirs.push(FileNode {
                node_type: "dir".to_string(),
                name: file_name,
                path: rel_path_string(&child_rel),
                mtime: None,
                children: None,
            });
            continue;
        }

        if meta.is_file() {
            let lower = file_name.to_ascii_lowercase();
            if !lower.ends_with(".md") {
                continue;
            }
            let mut file_rel = dir_rel.to_path_buf();
            file_rel.push(&file_name);
            files.push(FileNode {
                node_type: "file".to_string(),
                name: file_name,
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

pub fn read_text_file(vault_root: &Path, rel_path: &Path) -> Result<ReadTextResult, ApiError> {
    let resolved = path_policy::resolve_existing_path(vault_root, rel_path)?;
    let bytes = fs::read(&resolved).map_err(map_read_error)?;
    let content = String::from_utf8(bytes).map_err(|err| ApiError {
        code: "DecodeFailed".to_string(),
        message: "Failed to decode file as UTF-8".to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    })?;

    let mtime = file_mtime(&resolved);
    Ok(ReadTextResult {
        path: rel_path_string(rel_path),
        content,
        mtime,
    })
}

pub fn write_text_file(vault_root: &Path, rel_path: &Path, content: &str) -> Result<WriteTextResult, ApiError> {
    let resolved = path_policy::resolve_existing_path(vault_root, rel_path)?;
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
    Ok(WriteTextResult {
        path: rel_path_string(rel_path),
        mtime,
    })
}

pub fn rename_entry(vault_root: &Path, rel_path: &Path, new_name: &str) -> Result<RenameEntryResult, ApiError> {
    let rel_path_text = rel_path_string(rel_path);
    if rel_path_text.trim().is_empty() {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "Invalid path".to_string(),
            details: None,
        });
    }

    let source_abs = path_policy::resolve_existing_path(vault_root, rel_path)?;
    let metadata = fs::metadata(&source_abs).map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;

    let (target_name, err_exists_message) = if metadata.is_dir() {
        (sanitize_dir_name(new_name)?, "Target directory already exists")
    } else if metadata.is_file() {
        let lower = rel_path_text.to_ascii_lowercase();
        if !lower.ends_with(".md") {
            return Err(ApiError {
                code: "NotFound".to_string(),
                message: "Only markdown files can be renamed".to_string(),
                details: Some(serde_json::json!({ "path": rel_path_text })),
            });
        }
        (sanitize_markdown_file_name(new_name)?, "Target file already exists")
    } else {
        return Err(ApiError {
            code: "NotFound".to_string(),
            message: "Path is not a file or directory".to_string(),
            details: Some(serde_json::json!({ "path": rel_path_text })),
        });
    };

    let parent = source_abs.parent().ok_or_else(|| ApiError {
        code: "WriteFailed".to_string(),
        message: "Invalid target path".to_string(),
        details: None,
    })?;
    let target_abs = parent.join(&target_name);
    if target_abs.exists() {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: err_exists_message.to_string(),
            details: Some(serde_json::json!({ "path": canonical_to_string(&target_abs) })),
        });
    }

    fs::rename(&source_abs, &target_abs).map_err(|err| map_write_error("Failed to rename entry", err))?;
    let mtime = file_mtime(&target_abs);

    let old_rel = rel_path_text;
    let new_rel = replace_last_component(rel_path, &target_name);
    Ok(RenameEntryResult {
        old_path: old_rel,
        new_path: rel_path_string(&new_rel),
        mtime,
    })
}

fn replace_last_component(path: &Path, new_name: &str) -> PathBuf {
    let mut parts: Vec<_> = path.iter().map(|p| p.to_os_string()).collect();
    if !parts.is_empty() {
        parts.pop();
    }
    parts.push(new_name.into());
    parts.iter().collect()
}

fn sanitize_dir_name(input: &str) -> Result<String, ApiError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "Directory name is empty".to_string(),
            details: None,
        });
    }
    if trimmed.contains(['/', '\\']) {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "Directory name cannot contain path separators".to_string(),
            details: None,
        });
    }
    Ok(trimmed.to_string())
}

fn sanitize_markdown_file_name(input: &str) -> Result<String, ApiError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "File name is empty".to_string(),
            details: None,
        });
    }
    if trimmed.contains(['/', '\\']) {
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "File name cannot contain path separators".to_string(),
            details: None,
        });
    }
    let mut name = trimmed.to_string();
    if !name.to_ascii_lowercase().ends_with(".md") {
        name.push_str(".md");
    }
    Ok(name)
}

pub fn delete_entry(vault_root: &Path, rel_path: &Path) -> Result<DeleteEntryResult, ApiError> {
    let resolved = path_policy::resolve_existing_path(vault_root, rel_path)?;
    let metadata = fs::metadata(&resolved).map_err(|err| map_io_error("Unknown", "Metadata failed", err))?;
    if metadata.is_dir() {
        fs::remove_dir_all(&resolved).map_err(|err| map_write_error("Failed to delete directory", err))?;
    } else {
        fs::remove_file(&resolved).map_err(|err| map_write_error("Failed to delete file", err))?;
    }
    Ok(DeleteEntryResult {
        path: rel_path_string(rel_path),
    })
}

pub fn create_entry(vault_root: &Path, parent_rel: Option<&Path>, kind: &str) -> Result<CreateEntryResult, ApiError> {
    let parent_rel = parent_rel.unwrap_or_else(|| Path::new(""));
    let parent_abs = if parent_rel.as_os_str().is_empty() {
        vault_root.to_path_buf()
    } else {
        path_policy::resolve_existing_dir(vault_root, parent_rel)?
    };

    if kind == "file" {
        for index in 0..100 {
            let name = if index == 0 {
                "Untitled.md".to_string()
            } else {
                format!("Untitled ({index}).md")
            };
            let candidate = parent_abs.join(&name);
            match fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
                Ok(_file) => {
                    let mut rel = parent_rel.to_path_buf();
                    rel.push(name);
                    return Ok(CreateEntryResult {
                        path: rel_path_string(&rel),
                        kind: "file".to_string(),
                    });
                }
                Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(err) => return Err(map_write_error("Failed to create file", err)),
            }
        }
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "Failed to allocate file name".to_string(),
            details: Some(serde_json::json!({ "path": canonical_to_string(&parent_abs) })),
        });
    }

    if kind == "dir" {
        for index in 0..100 {
            let name = if index == 0 {
                "New Folder".to_string()
            } else {
                format!("New Folder {index}")
            };
            let candidate = parent_abs.join(&name);
            match fs::create_dir(&candidate) {
                Ok(()) => {
                    let mut rel = parent_rel.to_path_buf();
                    rel.push(name);
                    return Ok(CreateEntryResult {
                        path: rel_path_string(&rel),
                        kind: "dir".to_string(),
                    });
                }
                Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(err) => return Err(map_write_error("Failed to create directory", err)),
            }
        }
        return Err(ApiError {
            code: "WriteFailed".to_string(),
            message: "Failed to allocate directory name".to_string(),
            details: Some(serde_json::json!({ "path": canonical_to_string(&parent_abs) })),
        });
    }

    Err(ApiError {
        code: "WriteFailed".to_string(),
        message: "Invalid create kind".to_string(),
        details: Some(serde_json::json!({ "kind": kind })),
    })
}

fn file_mtime(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    modified.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

