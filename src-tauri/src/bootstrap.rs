use std::fs;
use std::sync::Mutex;

use tauri::Manager;

use crate::repo::vault_repo;
use crate::state::VaultState;

pub fn init_vault_state(app: &tauri::App) -> tauri::Result<VaultState> {
    let config_dir = app.path().app_config_dir()?;
    fs::create_dir_all(&config_dir)?;
    let config_path = config_dir.join("vault.json");
    Ok(VaultState {
        root: Mutex::new(vault_repo::load_persisted_vault(&config_path)),
        config_path,
    })
}

