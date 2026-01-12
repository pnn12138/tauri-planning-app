use std::path::PathBuf;
use std::sync::Mutex;

pub struct VaultState {
    pub root: Mutex<Option<PathBuf>>,
    pub config_path: PathBuf,
}

