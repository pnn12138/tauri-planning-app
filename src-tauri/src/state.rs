use reqwest::Client;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct VaultState {
    pub root: Mutex<Option<PathBuf>>,
    pub config_path: PathBuf,
}

pub struct AppState {
    pub http_client: reqwest::Client,
}
