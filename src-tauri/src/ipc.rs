use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone, Debug)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
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

