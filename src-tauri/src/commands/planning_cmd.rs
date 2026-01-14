use tauri::{AppHandle, State};

use crate::domain::planning::{CreateTaskInput, OpenDailyInput, OpenDailyResponse, OpenTaskNoteResponse, ReorderTaskInput, Task, TodayDTO, UpdateTaskInput};
use crate::ipc::{ApiError, ApiResponse};
use crate::services::planning_service::PlanningService;
use crate::state::VaultState;

// Get all data needed for today's home page
#[tauri::command]
pub async fn planning_list_today(
    today: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<TodayDTO>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    let data = service.get_today_data(&today)?;
    
    Ok(ApiResponse::ok(data))
}

// Create a new task
#[tauri::command]
pub async fn planning_create_task(
    input: CreateTaskInput,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<Task>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    let task = service.create_task(input)?;
    
    Ok(ApiResponse::ok(task))
}

// Update an existing task
#[tauri::command]
pub async fn planning_update_task(
    input: UpdateTaskInput,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<()>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    service.update_task(input)?;
    
    Ok(ApiResponse::ok(()))
}

// Mark a task as done
#[tauri::command]
pub async fn planning_mark_done(
    task_id: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<()>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    service.mark_task_done(&task_id)?;
    
    Ok(ApiResponse::ok(()))
}

// Reopen a completed task
#[tauri::command]
pub async fn planning_reopen_task(
    task_id: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<()>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    service.reopen_task(&task_id)?;
    
    Ok(ApiResponse::ok(()))
}

// Start a task (create a timer and update task status)
#[tauri::command]
pub async fn planning_start_task(
    task_id: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<()>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    service.start_task(&task_id)?;
    
    Ok(ApiResponse::ok(()))
}

// Stop a task (update timer and task status)
#[tauri::command]
pub async fn planning_stop_task(
    task_id: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<()>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    service.stop_task(&task_id)?;
    
    Ok(ApiResponse::ok(()))
}

// Open a daily log file (create if not exists)
#[tauri::command]
pub async fn planning_open_daily(
    input: OpenDailyInput,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<OpenDailyResponse>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    let data = service.open_daily(input)?;
    
    Ok(ApiResponse::ok(data))
}

// Open a task note file (create if not exists)
#[tauri::command]
pub async fn planning_open_task_note(
    task_id: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<OpenTaskNoteResponse>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    let data = service.open_task_note(&task_id)?;
    
    Ok(ApiResponse::ok(data))
}

// Reorder tasks in batch
#[tauri::command]
pub async fn planning_reorder_tasks(
    tasks: Vec<ReorderTaskInput>,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<()>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    service.reorder_tasks(tasks)?;
    
    Ok(ApiResponse::ok(()))
}

// Get UI state for the current vault
#[tauri::command]
#[allow(dead_code)]
pub async fn planning_get_ui_state(
    vault_id: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<Option<String>>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    let ui_state = service.get_ui_state(&vault_id)?;
    
    Ok(ApiResponse::ok(ui_state))
}

// Set UI state for the current vault
#[tauri::command]
#[allow(dead_code)]
pub async fn planning_set_ui_state(
    vault_id: String,
    partial_state_json: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<()>, ApiError> {
    let vault_root = vault_state.root.lock()?;
    let vault_path = match vault_root.as_ref() {
        Some(path) => path,
        None => {
            return Err(ApiError {
                code: "VaultNotSelected".to_string(),
                message: "Vault not selected".to_string(),
                details: None,
            });
        }
    };
    
    let service = PlanningService::new(&app_handle, vault_path)?;
    service.set_ui_state(&vault_id, &partial_state_json)?;
    
    Ok(ApiResponse::ok(()))
}
