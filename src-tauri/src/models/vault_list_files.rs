use serde::Serialize;

#[derive(Serialize)]
pub struct VaultListFilesResponse {
    pub files: Vec<String>,
}
