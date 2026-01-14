use std::path::Path;
use tauri::AppHandle;
use tracing::{error, info, span, Level};
use uuid::Uuid;

use crate::domain::planning::{CreateTaskInput, OpenDailyInput, OpenDailyResponse, OpenTaskNoteResponse, ReorderTaskInput, Task, TodayDTO, UpdateTaskInput};
use crate::ipc::ApiError;
use crate::repo::{planning_md_repo::PlanningMdRepo, planning_repo::PlanningRepo};

// Planning service that handles business logic
pub struct PlanningService {
    db_repo: PlanningRepo,
    md_repo: PlanningMdRepo,
}

impl PlanningService {
    // Create a new instance of PlanningService
    pub fn new(app_handle: &AppHandle, vault_root: &Path) -> Result<Self, ApiError> {
        let db_repo = PlanningRepo::new(app_handle)?;
        let md_repo = PlanningMdRepo::new(vault_root)?;
        
        Ok(Self {
            db_repo,
            md_repo,
        })
    }
    
    // Get all data needed for today's home page
    pub fn get_today_data(&self, today: &str) -> Result<TodayDTO, ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.get_today_data", op_id = op_id, today = today);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = self.db_repo.get_today_data(today);
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                tracing::info!("planning.get_today_data succeeded: elapsed_ms={}", elapsed.as_millis());
            },
            Err(e) => {
                tracing::error!("planning.get_today_data failed: error_code={}, error_message={}, elapsed_ms={}", e.code, e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Create a new task
    pub fn create_task(&self, input: CreateTaskInput) -> Result<Task, ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.create_task", op_id = op_id, title = &input.title, status = input.status.to_string());
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = self.db_repo.create_task(
            &input.title,
            input.status,
            input.estimate_min,
            input.scheduled_start.as_deref(),
            input.scheduled_end.as_deref(),
            input.note_path.as_deref(),
        );
        let elapsed = start.elapsed();
        
        match &result {
            Ok(task) => {
                info!(target: "planning", "create_task succeeded: task_id={}, elapsed_ms={}", &task.id, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "create_task failed: error_code={}, error_message={}, elapsed_ms={}", &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        // Markdown file creation moved to Step2
        
        result
    }
    
    // Update an existing task
    pub fn update_task(&self, input: UpdateTaskInput) -> Result<(), ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.update_task", op_id = op_id, task_id = &input.id);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        
        let result = (|| -> Result<(), ApiError> {
            // Check if task exists
            self.get_task_or_not_found(&input.id)?;
            
            // Update task in database
            let updated_task = self.db_repo.update_task(
                &input.id,
                input.title.as_deref(),
                input.status,
                input.priority,
                input.tags.as_ref(),
                input.order_index,
                input.estimate_min,
                input.scheduled_start.as_deref(),
                input.scheduled_end.as_deref(),
                input.note_path.as_deref(),
                input.archived,
            )?;
            
            // If title changed, update markdown file
            if let Some(new_title) = &input.title {
                // Read current content
                let current_content = self.md_repo.read_task_md(&updated_task.id)?;
                // Update with new title
                self.md_repo.upsert_task_md(&updated_task.id, new_title, &current_content)?;
            }
            
            Ok(())
        })();
        
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "update_task succeeded: task_id={}, elapsed_ms={}", &input.id, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "update_task failed: task_id={}, error_code={}, error_message={}, elapsed_ms={}", &input.id, &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Check if task exists and return it
    fn get_task_or_not_found(&self, task_id: &str) -> Result<Task, ApiError> {
        let task = self.db_repo.get_task(task_id)?;
        match task {
            Some(task) => Ok(task),
            None => Err(ApiError {
                code: "NotFound".to_string(),
                message: format!("Task with id {} not found", task_id),
                details: None,
            }),
        }
    }
    
    // Mark a task as done
    pub fn mark_task_done(&self, task_id: &str) -> Result<(), ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.mark_task_done", op_id = op_id, task_id = task_id);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = (|| -> Result<(), ApiError> {
            // Check if task exists
            let task = self.get_task_or_not_found(task_id)?;
            
            // Check if task is already done
            if task.status == crate::domain::planning::TaskStatus::Done {
                return Err(ApiError {
                    code: "InvalidStateTransition".to_string(),
                    message: "Task is already done".to_string(),
                    details: None,
                });
            }
            
            self.db_repo.mark_task_done(task_id)?;
            Ok(())
        })();
        
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "mark_task_done succeeded: task_id={}, elapsed_ms={}", task_id, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "mark_task_done failed: task_id={}, error_code={}, error_message={}, elapsed_ms={}", task_id, &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Reopen a completed task
    pub fn reopen_task(&self, task_id: &str) -> Result<(), ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.reopen_task", op_id = op_id, task_id = task_id);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = (|| -> Result<(), ApiError> {
            // Check if task exists
            let task = self.get_task_or_not_found(task_id)?;
            
            // Check if task is already not done
            if task.status != crate::domain::planning::TaskStatus::Done {
                return Err(ApiError {
                    code: "InvalidStateTransition".to_string(),
                    message: "Task is not done yet".to_string(),
                    details: None,
                });
            }
            
            self.db_repo.reopen_task(task_id)?;
            Ok(())
        })();
        
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "reopen_task succeeded: task_id={}, elapsed_ms={}", task_id, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "reopen_task failed: task_id={}, error_code={}, error_message={}, elapsed_ms={}", task_id, &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Start a task (create a timer and update task status)
    pub fn start_task(&self, task_id: &str) -> Result<(), ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.start_task", op_id = op_id, task_id = task_id);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = (|| -> Result<(), ApiError> {
            // Check if task exists
            let task = self.get_task_or_not_found(task_id)?;
            
            // Check if task is already doing or done
            if task.status == crate::domain::planning::TaskStatus::Doing {
                return Err(ApiError {
                    code: "InvalidStateTransition".to_string(),
                    message: "Task is already in progress".to_string(),
                    details: None,
                });
            }
            
            if task.status == crate::domain::planning::TaskStatus::Done {
                return Err(ApiError {
                    code: "InvalidStateTransition".to_string(),
                    message: "Cannot start a done task".to_string(),
                    details: None,
                });
            }
            
            self.db_repo.start_task(task_id)?;
            Ok(())
        })();
        
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "start_task succeeded: task_id={}, elapsed_ms={}", task_id, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "start_task failed: task_id={}, error_code={}, error_message={}, elapsed_ms={}", task_id, &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Stop a task (update timer and task status)
    pub fn stop_task(&self, task_id: &str) -> Result<(), ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.stop_task", op_id = op_id, task_id = task_id);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = (|| -> Result<(), ApiError> {
            // Check if task exists
            let task = self.get_task_or_not_found(task_id)?;
            
            // Check if task is not doing
            if task.status != crate::domain::planning::TaskStatus::Doing {
                return Err(ApiError {
                    code: "InvalidStateTransition".to_string(),
                    message: "Task is not in progress".to_string(),
                    details: None,
                });
            }
            
            self.db_repo.stop_task(task_id)?;
            Ok(())
        })();
        
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "stop_task succeeded: task_id={}, elapsed_ms={}", task_id, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "stop_task failed: task_id={}, error_code={}, error_message={}, elapsed_ms={}", task_id, &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Open a daily log file (create if not exists)
    pub fn open_daily(&self, input: OpenDailyInput) -> Result<OpenDailyResponse, ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.open_daily", op_id = op_id, day = &input.day);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = (|| -> Result<OpenDailyResponse, ApiError> {
            // Check if day log exists in database
            let day_log = self.db_repo.get_day_log(&input.day)?;
            
            if let Some(existing_log) = day_log {
                // Return existing path
                Ok(OpenDailyResponse {
                    md_path: existing_log.daily_md_path,
                })
            } else {
                // Create new daily log
                // First, read the markdown file (will create default content if not exists)
                let content = self.md_repo.read_daily_md(&input.day)?;
                
                // Write default content to file
                let _md_path = self.md_repo.upsert_daily_md(&input.day, &content)?;
                
                // Get relative path for storage
                let relative_path = self.md_repo.get_daily_md_relative_path(&input.day);
                
                // Create day log in database
                self.db_repo.upsert_day_log(&input.day, &relative_path)?;
                
                Ok(OpenDailyResponse {
                    md_path: relative_path,
                })
            }
        })();
        
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "open_daily succeeded: day={}, elapsed_ms={}", &input.day, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "open_daily failed: day={}, error_code={}, error_message={}, elapsed_ms={}", &input.day, &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Open a task note file (create if not exists)
    pub fn open_task_note(&self, task_id: &str) -> Result<OpenTaskNoteResponse, ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.open_task_note", op_id = op_id, task_id = task_id);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = (|| -> Result<OpenTaskNoteResponse, ApiError> {
            // Get task from database
            let task = self.db_repo.get_task(task_id)?;
            
            // Check if task exists
            if task.is_none() {
                return Err(ApiError {
                    code: "NotFound".to_string(),
                    message: format!("Task with id {} not found", task_id),
                    details: None,
                });
            }
            
            let task = task.unwrap();
            
            // Check if markdown file exists by reading its content
            let current_content = self.md_repo.read_task_md(&task.id)?;
            
            // If content is empty, create a new note with template
            if current_content.is_empty() {
                // Create template content
                let template = format!(
                    "# {}\n\n- Status: {}\n- Scheduled: {}\n",
                    task.title,
                    task.status,
                    task.scheduled_start.as_ref().map_or("", |s| s)
                );
                
                // Write template to file
                self.md_repo.upsert_task_md(&task.id, &task.title, &template)?;
            }
            
            // Get relative path
            let relative_path = self.md_repo.get_task_md_relative_path(&task.id);
            
            // Update task's note_path in database if needed
            if task.note_path.is_none() || task.note_path != Some(relative_path.clone()) {
                self.db_repo.update_task_note_path(&task.id, &relative_path)?;
            }
            
            Ok(OpenTaskNoteResponse {
                md_path: relative_path,
            })
        })();
        
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "open_task_note succeeded: task_id={}, elapsed_ms={}", task_id, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "open_task_note failed: task_id={}, error_code={}, error_message={}, elapsed_ms={}", task_id, &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Reorder tasks in batch
    pub fn reorder_tasks(&self, tasks: Vec<ReorderTaskInput>) -> Result<(), ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.reorder_tasks", op_id = op_id, task_count = tasks.len());
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        let result = self.db_repo.reorder_tasks(tasks);
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "reorder_tasks succeeded: elapsed_ms={}", elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "reorder_tasks failed: error_code={}, error_message={}, elapsed_ms={}", &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
    
    // Get UI state for the current vault
    #[allow(dead_code)]
    pub fn get_ui_state(&self, vault_id: &str) -> Result<Option<String>, ApiError> {
        self.db_repo.get_ui_state(vault_id)
    }
    
    // Set UI state for the current vault
    #[allow(dead_code)]
    pub fn set_ui_state(&self, vault_id: &str, partial_state_json: &str) -> Result<(), ApiError> {
        self.db_repo.set_ui_state(vault_id, partial_state_json)
    }
}
