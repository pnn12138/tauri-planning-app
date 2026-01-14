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
    let config_dir = app_handle.path().app_data_dir().map_err(|e| crate::ipc::ApiError {
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

