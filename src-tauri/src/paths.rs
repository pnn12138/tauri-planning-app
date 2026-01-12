use std::path::Path;

pub fn canonical_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub fn rel_path_string(path: &Path) -> String {
    path.iter()
        .map(|part| part.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

