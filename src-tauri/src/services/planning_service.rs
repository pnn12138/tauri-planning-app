use std::collections::HashMap;
use std::path::Path;

use chrono::Utc;
use tauri::AppHandle;
use tracing::{error, info, span, warn, Level};
use uuid::Uuid;

use crate::domain::planning::{CreateTaskInput, OpenDailyInput, OpenDailyResponse, OpenTaskNoteResponse, ReorderTaskInput, Task, TaskStatus, TodayDTO, UpdateTaskInput};
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
        let board_id = input.board_id.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty());
        if board_id.is_none() {
            return Err(ApiError {
                code: "BOARD_ID_REQUIRED".to_string(),
                message: "board_id is required".to_string(),
                details: None,
            });
        }

        let due_date_value = input.due_date.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty());
        if matches!(input.status, TaskStatus::Todo | TaskStatus::Doing) && due_date_value.is_none() {
            return Err(ApiError {
                code: "DUE_DATE_REQUIRED".to_string(),
                message: "due_date is required for todo/doing tasks".to_string(),
                details: None,
            });
        }

        let labels = input.labels.as_ref().or(input.tags.as_ref());
        let completed_at = if input.status == TaskStatus::Done {
            Some(Utc::now().to_rfc3339())
        } else {
            None
        };

        let result = self.db_repo.create_task(
            &input.title,
            input.description.as_deref(),
            input.status,
            input.priority,
            due_date_value,
            board_id,
            input.estimate_min,
            labels.map(|tags| tags.as_ref()),
            input.scheduled_start.as_deref(),
            input.scheduled_end.as_deref(),
            input.note_path.as_deref(),
            completed_at.as_deref(),
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
            let task = self.get_task_or_not_found(&input.id)?;
            
            let next_status = input.status.unwrap_or(task.status);
            let due_date_update = match input.due_date {
                None => None,
                Some(None) => Some(None),
                Some(Some(value)) => {
                    let trimmed = value.trim();
                    if trimmed.is_empty() {
                        Some(None)
                    } else {
                        Some(Some(trimmed.to_string()))
                    }
                }
            };
            let effective_due_date = match &due_date_update {
                Some(value) => value.clone(),
                None => task.due_date.clone(),
            };

            if matches!(next_status, TaskStatus::Todo | TaskStatus::Doing) && effective_due_date.is_none() {
                return Err(ApiError {
                    code: "DUE_DATE_REQUIRED".to_string(),
                    message: "due_date is required for todo/doing tasks".to_string(),
                    details: None,
                });
            }

            if matches!(next_status, TaskStatus::Todo | TaskStatus::Doing) {
                if let Some(None) = due_date_update {
                    return Err(ApiError {
                        code: "DUE_DATE_REQUIRED".to_string(),
                        message: "due_date cannot be cleared for todo/doing tasks".to_string(),
                        details: None,
                    });
                }
            }

            let completed_at_update = if task.status == TaskStatus::Done && next_status != TaskStatus::Done {
                Some(None)
            } else if task.status != TaskStatus::Done && next_status == TaskStatus::Done {
                Some(Some(Utc::now().to_rfc3339()))
            } else {
                None
            };

            let board_id = match input.board_id.as_ref() {
                Some(value) => {
                    let trimmed = value.trim();
                    if trimmed.is_empty() {
                        return Err(ApiError {
                            code: "BOARD_ID_REQUIRED".to_string(),
                            message: "board_id cannot be empty".to_string(),
                            details: None,
                        });
                    }
                    Some(trimmed)
                }
                None => None,
            };

            let labels = input.labels.as_ref().or(input.tags.as_ref());

            // Update task in database
            let updated_task = self.db_repo.update_task(
                &input.id,
                input.title.as_deref(),
                input.description.as_deref(),
                input.status,
                input.priority,
                labels,
                input.order_index,
                input.estimate_min,
                input.scheduled_start.as_deref(),
                input.scheduled_end.as_deref(),
                due_date_update.clone(),
                board_id,
                input.note_path.as_deref(),
                input.archived,
                completed_at_update,
            )?;
            
            // Prepare frontmatter updates
            let mut frontmatter_updates = HashMap::new();
            
            // Always update updated_at
            frontmatter_updates.insert("updated_at".to_string(), updated_task.updated_at.clone());
            
            // Update other fields if they changed
            if input.title.is_some() {
                frontmatter_updates.insert("title".to_string(), updated_task.title.clone());
            }
            
            if input.status.is_some() {
                frontmatter_updates.insert("status".to_string(), updated_task.status.to_string());
            }
            
            if input.priority.is_some() {
                frontmatter_updates.insert("priority".to_string(), updated_task.priority.map(|p| p.to_string()).unwrap_or("p3".to_string()));
            }
            
            if labels.is_some() {
                let tags_str = format!("[{}]", updated_task.tags.clone().unwrap_or_default().join(", "));
                frontmatter_updates.insert("tags".to_string(), tags_str);
            }
            
            if input.estimate_min.is_some() {
                let estimate_str = updated_task.estimate_min.map(|min| min.to_string()).unwrap_or("null".to_string());
                frontmatter_updates.insert("estimate_min".to_string(), estimate_str);
            }
            
            if due_date_update.is_some() {
                let due_date_str = updated_task.due_date.as_deref().unwrap_or("null");
                frontmatter_updates.insert("due_date".to_string(), due_date_str.to_string());
            }
            
            // Sync to markdown file
            if !frontmatter_updates.is_empty() {
                self.sync_task_to_md(&updated_task.id, &frontmatter_updates)?;
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
            
            // Sync status change to markdown file
            let now = Utc::now().to_rfc3339();
            let mut frontmatter_updates = HashMap::new();
            frontmatter_updates.insert("status".to_string(), "done".to_string());
            frontmatter_updates.insert("updated_at".to_string(), now.clone());
            frontmatter_updates.insert("completed_at".to_string(), now);
            self.sync_task_to_md(task_id, &frontmatter_updates)?;
            
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

            if task.due_date.is_none() {
                return Err(ApiError {
                    code: "DUE_DATE_REQUIRED".to_string(),
                    message: "due_date is required for todo/doing tasks".to_string(),
                    details: None,
                });
            }
            
            self.db_repo.reopen_task(task_id)?;
            
            // Sync status change to markdown file
            let now = Utc::now().to_rfc3339();
            let mut frontmatter_updates = HashMap::new();
            frontmatter_updates.insert("status".to_string(), "todo".to_string());
            frontmatter_updates.insert("updated_at".to_string(), now);
            frontmatter_updates.insert("completed_at".to_string(), "null".to_string());
            self.sync_task_to_md(task_id, &frontmatter_updates)?;
            
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

            if task.due_date.is_none() {
                return Err(ApiError {
                    code: "DUE_DATE_REQUIRED".to_string(),
                    message: "due_date is required for todo/doing tasks".to_string(),
                    details: None,
                });
            }
            
            self.db_repo.start_task(task_id)?;
            
            // Sync status change to markdown file
            let now = Utc::now().to_rfc3339();
            let mut frontmatter_updates = HashMap::new();
            frontmatter_updates.insert("status".to_string(), "doing".to_string());
            frontmatter_updates.insert("updated_at".to_string(), now);
            self.sync_task_to_md(task_id, &frontmatter_updates)?;
            
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

            if task.due_date.is_none() {
                return Err(ApiError {
                    code: "DUE_DATE_REQUIRED".to_string(),
                    message: "due_date is required for todo/doing tasks".to_string(),
                    details: None,
                });
            }
            
            self.db_repo.stop_task(task_id)?;
            
            // Sync status change to markdown file
            let now = Utc::now().to_rfc3339();
            let mut frontmatter_updates = HashMap::new();
            frontmatter_updates.insert("status".to_string(), "todo".to_string());
            frontmatter_updates.insert("updated_at".to_string(), now);
            self.sync_task_to_md(task_id, &frontmatter_updates)?;
            
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
                // Create template with improved structure
                let template = format!(
                    "---
fm_version: 2
id: {}
title: {}
status: {}
priority: {}
tags: {}
estimate_min: {}
due_date: {}
created_at: {}
updated_at: {}
---

<!-- 
Frontmatter 由系统维护；正文为你的笔记区。
-->

## Notes

- 
",
                    task.id,
                    task.title,
                    task.status,
                    task.priority.map(|p| p.to_string()).unwrap_or("p3".to_string()),
                    task.tags.map(|tags| format!("[{}]", tags.join(", "))).unwrap_or("[]".to_string()),
                    task.estimate_min.map(|min| min.to_string()).unwrap_or("null".to_string()),
                    task.due_date.as_deref().unwrap_or("null"),
                    task.created_at,
                    task.updated_at
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
        
        let result = (|| -> Result<(), ApiError> {
            // First update tasks in database
            self.db_repo.reorder_tasks(tasks.clone())?;
            
            // Then sync each task to markdown file
            for task in tasks {
                // Get the updated task from database
                let updated_task = self.get_task_or_not_found(&task.id)?;
                
                // Prepare frontmatter updates
                let mut frontmatter_updates = HashMap::new();
                frontmatter_updates.insert("updated_at".to_string(), updated_task.updated_at.clone());
                
                // Update status if it changed
                if let Some(status) = task.status {
                    frontmatter_updates.insert("status".to_string(), status.to_string());
                }
                
                // Always include current status and priority
                frontmatter_updates.insert("status".to_string(), updated_task.status.to_string());
                frontmatter_updates.insert("priority".to_string(), updated_task.priority.map(|p| p.to_string()).unwrap_or("p3".to_string()));
                
                // Sync to markdown file
                self.sync_task_to_md(&updated_task.id, &frontmatter_updates)?;
            }
            
            Ok(())
        })();
        
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
    
    // Sync task changes to markdown file
    pub fn sync_task_to_md(&self, task_id: &str, frontmatter_updates: &HashMap<String, String>) -> Result<(), ApiError> {
        self.md_repo.update_task_frontmatter(task_id, frontmatter_updates)
    }
    
    // Delete a task and its associated resources
    pub fn delete_task(&mut self, task_id: &str) -> Result<(), ApiError> {
        let op_id = Uuid::new_v4().to_string();
        let span = span!(Level::INFO, "planning.delete_task", op_id = op_id, task_id = task_id);
        let _enter = span.enter();
        
        let start = std::time::Instant::now();
        
        let result = (|| -> Result<(), ApiError> {
            // Check if task exists
            self.get_task_or_not_found(task_id)?;
            
            // Delete task from database
            self.db_repo.delete_task(task_id)?;
            
            // Delete associated markdown file if it exists
            match self.md_repo.delete_task_md(task_id) {
                Ok(_) => {
                    info!(target: "planning", "delete_task_md succeeded: task_id={}", task_id);
                },
                Err(e) => {
                    // Log warning but don't fail the entire deletion
                    warn!(target: "planning", "delete_task_md failed: task_id={}, error={:?}", task_id, e);
                }
            }
            
            Ok(())
        })();
        
        let elapsed = start.elapsed();
        
        match &result {
            Ok(_) => {
                info!(target: "planning", "delete_task succeeded: task_id={}, elapsed_ms={}", task_id, elapsed.as_millis());
            },
            Err(e) => {
                error!(target: "planning", "delete_task failed: task_id={}, error_code={}, error_message={}, elapsed_ms={}", task_id, &e.code, &e.message, elapsed.as_millis());
            }
        }
        
        result
    }
}
