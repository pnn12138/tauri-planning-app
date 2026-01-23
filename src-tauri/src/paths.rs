use std::path::Path;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub fn canonical_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub fn rel_path_string(path: &Path) -> String {
    path.iter()
        .map(|part| part.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

// Get the application config directory
pub fn get_app_config_dir(app_handle: &AppHandle) -> Result<PathBuf, crate::ipc::ApiError> {
    // Use Tauri's app_data_dir to get system-specific data directory
    let config_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| crate::ipc::ApiError {
            code: "ConfigDirNotFound".to_string(),
            message: format!("Failed to get application data directory: {}", e),
            details: None,
        })?;

    // Ensure the directory exists
    std::fs::create_dir_all(&config_dir).map_err(|e| crate::ipc::ApiError {
        code: "ConfigDirNotFound".to_string(),
        message: format!("Failed to create config directory: {}", e),
        details: None,
    })?;

    Ok(config_dir)
}

// ============================================================================
// Planning System Path Management
// ============================================================================

/// Get the .planning directory path within a vault
pub fn planning_dir(vault_root: &Path) -> PathBuf {
    vault_root.join(".planning")
}

/// Get the planning database file path
pub fn planning_db_path(vault_root: &Path) -> PathBuf {
    planning_dir(vault_root).join("planning.db")
}

/// Get the vault metadata file path
pub fn vault_meta_path(vault_root: &Path) -> PathBuf {
    planning_dir(vault_root).join("vault.json")
}

/// Generate a safe slug from a title for use in directory names
/// Handles illegal characters, length limits, and ensures filesystem compatibility
pub fn generate_slug(title: &str) -> String {
    // Define illegal characters for Windows/Unix filesystems
    let illegal_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

    // Replace illegal characters with underscore and collapse multiple underscores
    let mut slug = title
        .chars()
        .map(|c| {
            if illegal_chars.contains(&c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect::<String>();

    // Collapse multiple underscores/spaces into single underscore
    while slug.contains("__") {
        slug = slug.replace("__", "_");
    }

    // Replace spaces with underscores
    slug = slug.replace(' ', "_");

    // Trim leading/trailing underscores
    slug = slug.trim_matches('_').to_string();

    // Limit length to 50 characters to avoid path length issues
    // Use char_indices to avoid splitting in the middle of a multi-byte character
    if slug.len() > 50 {
        if let Some((idx, _)) = slug.char_indices().nth(50) {
            slug.truncate(idx);
        }
    }

    // Ensure we have at least some content; fallback to "task" if empty
    if slug.is_empty() {
        slug = "task".to_string();
    }

    slug
}

/// Get the task directory path (slug only)
pub fn task_dir_path(vault_root: &Path, _task_id: &str, slug: &str) -> PathBuf {
    vault_root.join("tasks").join(slug)
}

/// Get the task markdown file path
pub fn task_md_path(vault_root: &Path, task_id: &str, slug: &str) -> PathBuf {
    task_dir_path(vault_root, task_id, slug).join("任务详情.md")
}

/// Get the task relative path (for storing in DB)
pub fn task_md_relative_path(_task_id: &str, slug: &str) -> String {
    format!("tasks/{}/任务详情.md", slug)
}
