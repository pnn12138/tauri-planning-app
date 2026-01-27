use rusqlite::Error as RusqliteError;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone, Debug)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum ApiResponse<T> {
    Ok { ok: bool, data: T },
    Err { ok: bool, error: ApiError },
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        ApiResponse::Ok { ok: true, data }
    }

    pub fn err(code: &str, message: &str, details: Option<serde_json::Value>) -> Self {
        ApiResponse::Err {
            ok: false,
            error: ApiError {
                code: code.to_string(),
                message: message.to_string(),
                details,
            },
        }
    }
}

pub fn map_io_error(code: &str, message: &str, err: std::io::Error) -> ApiError {
    ApiError {
        code: code.to_string(),
        message: message.to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    }
}

pub fn map_read_error(err: std::io::Error) -> ApiError {
    match err.kind() {
        std::io::ErrorKind::NotFound => ApiError {
            code: "NotFound".to_string(),
            message: "File not found".to_string(),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        },
        std::io::ErrorKind::PermissionDenied => ApiError {
            code: "PermissionDenied".to_string(),
            message: "Permission denied".to_string(),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        },
        _ => ApiError {
            code: "Unknown".to_string(),
            message: "Failed to read file".to_string(),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        },
    }
}

pub fn map_write_error(message: &str, err: std::io::Error) -> ApiError {
    let code = match err.kind() {
        std::io::ErrorKind::PermissionDenied => "PermissionDenied",
        std::io::ErrorKind::NotFound => "NotFound",
        _ => "WriteFailed",
    };
    ApiError {
        code: code.to_string(),
        message: message.to_string(),
        details: Some(serde_json::json!({ "error": err.to_string() })),
    }
}

pub fn write_error_with_context(
    message: &str,
    err: std::io::Error,
    step: &str,
    path: &Path,
) -> ApiError {
    let code = match err.kind() {
        std::io::ErrorKind::PermissionDenied => "PermissionDenied",
        std::io::ErrorKind::NotFound => "NotFound",
        _ => "WriteFailed",
    };
    ApiError {
        code: code.to_string(),
        message: message.to_string(),
        details: Some(serde_json::json!({
            "step": step,
            "path": path.to_string_lossy().to_string(),
            "error": err.to_string()
        })),
    }
}

// Implement From<RusqliteError> for ApiError so that ? can automatically convert
impl From<RusqliteError> for ApiError {
    fn from(err: RusqliteError) -> Self {
        ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Database operation failed: {}", err),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        }
    }
}

// Implement From<std::sync::PoisonError> for ApiError so that ? can automatically convert
impl<T> From<std::sync::PoisonError<T>> for ApiError {
    fn from(err: std::sync::PoisonError<T>) -> Self {
        ApiError {
            code: "MutexPoisoned".to_string(),
            message: format!("Mutex was poisoned: {}", err),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        }
    }
}

// Implement From<serde_json::Error> for ApiError so that ? can automatically convert
impl From<serde_json::Error> for ApiError {
    fn from(err: serde_json::Error) -> Self {
        ApiError {
            code: "JsonError".to_string(),
            message: format!("JSON operation failed: {}", err),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        }
    }
}

// Implement From<std::io::Error> for ApiError so that ? can automatically convert
impl From<std::io::Error> for ApiError {
    fn from(err: std::io::Error) -> Self {
        ApiError {
            code: "IOError".to_string(),
            message: format!("IO operation failed: {}", err),
            details: Some(serde_json::json!({ "error": err.to_string() })),
        }
    }
}
