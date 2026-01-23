use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ipc::{map_read_error, map_write_error, ApiError};
use crate::security::path_policy;

const SETTINGS_DIR: &str = ".yourapp";
const SETTINGS_FILE: &str = "settings.json";

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct PluginDisabledInfo {
    pub reason: String,
    pub at: String,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct PluginsSettings {
    #[serde(default)]
    pub enabled: Vec<String>,
    #[serde(default)]
    pub disabled: BTreeMap<String, PluginDisabledInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AiSettings {
    #[serde(default = "default_ai_base_url")]
    pub base_url: String, // e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1"
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_ai_model")]
    pub model_name: String, // e.g. "gpt-4o", "deepseek-chat", "llama3"
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            base_url: default_ai_base_url(),
            api_key: String::new(),
            model_name: default_ai_model(),
        }
    }
}

fn default_ai_base_url() -> String {
    "http://localhost:11434/v1".to_string() // Default to local Ollama
}

fn default_ai_model() -> String {
    "llama3".to_string()
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Settings {
    #[serde(default)]
    pub plugins: PluginsSettings,
    #[serde(default)]
    pub ai: AiSettings,
}

fn now_unix_string() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{secs}")
}

fn settings_path(vault_root: &Path) -> PathBuf {
    vault_root.join(SETTINGS_DIR).join(SETTINGS_FILE)
}

pub fn load_settings(vault_root: &Path) -> Result<Settings, ApiError> {
    let path = settings_path(vault_root);
    if !path.exists() {
        return Ok(Settings::default());
    }
    let resolved = path_policy::ensure_abs_file_in_vault(vault_root, &path)?;
    let content = fs::read_to_string(&resolved).map_err(map_read_error)?;
    serde_json::from_str(&content).map_err(|err| ApiError {
        code: "DecodeFailed".to_string(),
        message: "Failed to decode settings.json".to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    })
}

fn save_settings(vault_root: &Path, settings: &Settings) -> Result<(), ApiError> {
    let settings_dir = vault_root.join(SETTINGS_DIR);
    path_policy::ensure_or_create_dir_in_vault(vault_root, &settings_dir)?;
    let path = settings_path(vault_root);
    let data = serde_json::to_string_pretty(settings).map_err(|err| ApiError {
        code: "WriteFailed".to_string(),
        message: "Failed to encode settings.json".to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    })?;
    fs::write(&path, data).map_err(|err| map_write_error("Failed to write settings.json", err))?;
    Ok(())
}

pub fn set_plugin_enabled(
    vault_root: &Path,
    plugin_id: &str,
    enabled: bool,
    reason: Option<&str>,
) -> Result<(), ApiError> {
    let mut settings = load_settings(vault_root)?;
    settings.plugins.enabled.retain(|id| id != plugin_id);

    if enabled {
        settings.plugins.enabled.push(plugin_id.to_string());
        settings.plugins.disabled.remove(plugin_id);
    } else if let Some(reason) = reason {
        settings.plugins.disabled.insert(
            plugin_id.to_string(),
            PluginDisabledInfo {
                reason: reason.to_string(),
                at: now_unix_string(),
            },
        );
    }

    save_settings(vault_root, &settings)?;
    Ok(())
}

pub fn get_ai_settings(vault_root: &Path) -> Result<AiSettings, ApiError> {
    let settings = load_settings(vault_root)?;
    Ok(settings.ai)
}

pub fn save_ai_settings(vault_root: &Path, ai_settings: AiSettings) -> Result<(), ApiError> {
    let mut settings = load_settings(vault_root)?;
    settings.ai = ai_settings;
    save_settings(vault_root, &settings)
}
