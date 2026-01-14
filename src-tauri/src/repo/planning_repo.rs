use chrono::{DateTime, Utc};
use rusqlite::params;
use rusqlite::{Connection, OptionalExtension, Result};
use serde_json;
use tauri::AppHandle;
use uuid::Uuid;

use crate::domain::planning::{DayLog, KanbanTasks, ReorderTaskInput, Task, TaskPriority, TaskStatus, Timer, TodayDTO};
use crate::ipc::ApiError;
use crate::paths::get_app_config_dir;

const DB_FILENAME: &str = "planning.db";

// Database repository for planning data
pub struct PlanningRepo {
    conn: Connection,
}

impl PlanningRepo {
    // Create a new instance of PlanningRepo
    pub fn new(app_handle: &AppHandle) -> Result<Self, ApiError> {
        let config_dir = get_app_config_dir(app_handle)?;
        let db_path = config_dir.join(DB_FILENAME);
        
        let conn = Connection::open(db_path).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to open database: {}", e),
            details: None,
        })?;
        
        let repo = Self { conn };
        repo.init()?;
        
        Ok(repo)
    }
    
    // Initialize database tables
    fn init(&self) -> Result<(), ApiError> {
        // Create tasks table
        self.conn.execute(
            r#"CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                estimate_min INTEGER,
                scheduled_start TEXT,
                scheduled_end TEXT,
                note_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT,
                archived INTEGER NOT NULL DEFAULT 0
            )"#,
            [],
        ).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to create tasks table: {}", e),
            details: None,
        })?;
        
        // Add priority column if not exists
        let has_priority: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'priority'",
            [],
            |row| row.get(0)
        )?;
        
        if has_priority == 0 {
            self.conn.execute(
                "ALTER TABLE tasks ADD COLUMN priority TEXT",
                [],
            ).map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to add priority column: {}", e),
                details: None,
            })?;
        }
        
        // Add tags column if not exists
        let has_tags: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'tags'",
            [],
            |row| row.get(0)
        )?;
        
        if has_tags == 0 {
            self.conn.execute(
                "ALTER TABLE tasks ADD COLUMN tags TEXT",
                [],
            ).map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to add tags column: {}", e),
                details: None,
            })?;
        }
        
        // Create indexes for tasks table
        self.conn.execute(
            r#"CREATE INDEX IF NOT EXISTS idx_tasks_status_order ON tasks(status, order_index)"#,
            [],
        ).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to create tasks index: {}", e),
            details: None,
        })?;
        
        self.conn.execute(
            r#"CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON tasks(scheduled_start)"#,
            [],
        ).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to create tasks schedule index: {}", e),
            details: None,
        })?;
        
        // Create task_timer table
        self.conn.execute(
            r#"CREATE TABLE IF NOT EXISTS task_timer (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                start_at TEXT NOT NULL,
                stop_at TEXT,
                duration_sec INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'manual'
            )"#,
            [],
        ).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to create task_timer table: {}", e),
            details: None,
        })?;
        
        // Create index for task_timer table
        self.conn.execute(
            r#"CREATE INDEX IF NOT EXISTS idx_timer_task ON task_timer(task_id, start_at)"#,
            [],
        ).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to create task_timer index: {}", e),
            details: None,
        })?;
        
        // Create day_log table
        self.conn.execute(
            r#"CREATE TABLE IF NOT EXISTS day_log (
                day TEXT PRIMARY KEY,
                daily_md_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"#,
            [],
        ).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to create day_log table: {}", e),
            details: None,
        })?;
        
        // Create ui_state table with vault_id as primary key
        // This is an upgraded schema from the old key-value schema
        self.conn.execute(
            r#"CREATE TABLE IF NOT EXISTS ui_state (
                vault_id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"#,
            [],
        ).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to create ui_state table: {}", e),
            details: None,
        })?;
        
        Ok(())
    }
    
    // Get all tasks for today's home page
    pub fn get_today_data(&self, today: &str) -> Result<TodayDTO, ApiError> {
        // Get all tasks
        let mut stmt = self.conn.prepare("SELECT * FROM tasks ORDER BY status, order_index")?;
        let task_iter = stmt.query_map([], |row| {
            // Parse priority
            let priority_str: Option<String> = row.get(12)?;
            let priority = priority_str.as_deref().map(TaskPriority::from);
            
            // Parse tags
            let tags_str: Option<String> = row.get(13)?;
            let tags = match tags_str {
                Some(s) if !s.is_empty() => {
                    match serde_json::from_str(&s) {
                        Ok(tags) => Some(tags),
                        Err(e) => {
                            log::warn!("Failed to parse tags: {} for task {}", e, row.get::<_, String>(0)?);
                            None
                        }
                    }
                },
                _ => None
            };
            
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                status: TaskStatus::from(row.get::<_, String>(2)?.as_str()),
                priority,
                tags,
                order_index: row.get(3)?,
                estimate_min: row.get(4)?,
                scheduled_start: row.get(5)?,
                scheduled_end: row.get(6)?,
                note_path: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                completed_at: row.get(10)?,
                archived: row.get(11)?,
            })
        })?;
        
        let mut all_tasks: Vec<Task> = Vec::new();
        for task in task_iter {
            all_tasks.push(task?);
        }
        
        // Group tasks by status for kanban
        let mut kanban = KanbanTasks {
            backlog: Vec::new(),
            todo: Vec::new(),
            doing: Vec::new(),
            done: Vec::new(),
        };
        
        for task in &all_tasks {
            match task.status {
                TaskStatus::Backlog => kanban.backlog.push(task.clone()),
                TaskStatus::Todo => kanban.todo.push(task.clone()),
                TaskStatus::Doing => kanban.doing.push(task.clone()),
                TaskStatus::Done => kanban.done.push(task.clone()),
            }
        }
        
        // Filter timeline tasks (scheduled_start is today)
        let today_start = format!("{today}T00:00:00");
        let today_end = format!("{today}T23:59:59");
        
        let timeline: Vec<Task> = all_tasks
            .iter()
            .filter(|task| {
                if let Some(start) = &task.scheduled_start {
                    start >= &today_start && start <= &today_end
                } else {
                    false
                }
            })
            .cloned()
            .collect();
        
        // Get current doing task and timer (if any)
        let (current_doing, current_timer) = self.get_current_doing_info()?;
        
        // Get server current time
        let server_now = Utc::now().to_rfc3339();
        
        Ok(TodayDTO {
            kanban,
            timeline,
            current_doing,
            current_timer,
            today: today.to_string(),
            server_now,
        })
    }
    
    // Get current doing task and timer based on active timer
    pub fn get_current_doing_info(&self) -> Result<(Option<Task>, Option<Timer>), ApiError> {
        // Find active timer (stop_at is null)
        let mut stmt = self.conn.prepare(
            "SELECT * FROM task_timer WHERE stop_at IS NULL LIMIT 1"
        )?;
        
        let mut timer_iter = stmt.query_map([], |row| {
            Ok(Timer {
                id: row.get(0)?,
                task_id: row.get(1)?,
                start_at: row.get(2)?,
                stop_at: row.get(3)?,
                duration_sec: row.get(4)?,
                source: row.get(5)?,
            })
        })?;
        
        if let Some(timer) = timer_iter.next() {
            let timer = timer?;
            // Get the task associated with this timer
            let task = self.get_task_by_id(&timer.task_id)?;
            Ok((Some(task), Some(timer)))
        } else {
            Ok((None, None))
        }
    }
    
    // Get task by id
    pub fn get_task_by_id(&self, task_id: &str) -> Result<Task, ApiError> {
        let mut stmt = self.conn.prepare("SELECT * FROM tasks WHERE id = ?")?;
        let task = stmt.query_row([task_id], |row| {
            // Parse priority
            let priority_str: Option<String> = row.get(12)?;
            let priority = priority_str.as_deref().map(TaskPriority::from);
            
            // Parse tags
            let tags_str: Option<String> = row.get(13)?;
            let tags = match tags_str {
                Some(s) if !s.is_empty() => {
                    match serde_json::from_str(&s) {
                        Ok(tags) => Some(tags),
                        Err(e) => {
                            log::warn!("Failed to parse tags: {} for task {}", e, row.get::<_, String>(0)?);
                            None
                        }
                    }
                },
                _ => None
            };
            
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                status: TaskStatus::from(row.get::<_, String>(2)?.as_str()),
                priority,
                tags,
                order_index: row.get(3)?,
                estimate_min: row.get(4)?,
                scheduled_start: row.get(5)?,
                scheduled_end: row.get(6)?,
                note_path: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                completed_at: row.get(10)?,
                archived: row.get(11)?,
            })
        })?;
        
        Ok(task)
    }
    
    // Get task by id, returns None if not found
    pub fn get_task(&self, task_id: &str) -> Result<Option<Task>, ApiError> {
        let mut stmt = self.conn.prepare("SELECT * FROM tasks WHERE id = ?")?;
        let task = stmt.query_row([task_id], |row| {
            // Parse priority
            let priority_str: Option<String> = row.get(12)?;
            let priority = priority_str.as_deref().map(TaskPriority::from);
            
            // Parse tags
            let tags_str: Option<String> = row.get(13)?;
            let tags = match tags_str {
                Some(s) if !s.is_empty() => {
                    match serde_json::from_str(&s) {
                        Ok(tags) => Some(tags),
                        Err(e) => {
                            log::warn!("Failed to parse tags: {} for task {}", e, row.get::<_, String>(0)?);
                            None
                        }
                    }
                },
                _ => None
            };
            
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                status: TaskStatus::from(row.get::<_, String>(2)?.as_str()),
                priority,
                tags,
                order_index: row.get(3)?,
                estimate_min: row.get(4)?,
                scheduled_start: row.get(5)?,
                scheduled_end: row.get(6)?,
                note_path: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                completed_at: row.get(10)?,
                archived: row.get(11)?,
            })
        }).optional()?;
        
        Ok(task)
    }
    
    // Update task's note_path
    pub fn update_task_note_path(&self, task_id: &str, note_path: &str) -> Result<(), ApiError> {
        let now = Utc::now().to_rfc3339();
        
        self.conn.execute(
            "UPDATE tasks SET note_path = ?, updated_at = ? WHERE id = ?",
            params![note_path, now, task_id],
        )?;
        
        Ok(())
    }
    
    // Create a new task
    pub fn create_task(&self, title: &str, status: TaskStatus, estimate_min: Option<i64>, 
                      scheduled_start: Option<&str>, scheduled_end: Option<&str>, 
                      note_path: Option<&str>) -> Result<Task, ApiError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        // Get max order index for the status
        let max_order: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(order_index), -1) FROM tasks WHERE status = ?",
            [status.to_string()],
            |row| row.get(0)
        )?;
        
        let order_index = max_order + 1;
        
        self.conn.execute(
            r#"INSERT INTO tasks (id, title, status, order_index, estimate_min, scheduled_start, scheduled_end, note_path, created_at, updated_at, archived) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"#,
            params![
                id, title, status.to_string(), order_index, estimate_min, 
                scheduled_start, scheduled_end, note_path, now, now
            ],
        )?;
        
        self.get_task_by_id(&id)
    }
    
    // Update an existing task
    pub fn update_task(&self, task_id: &str, title: Option<&str>, status: Option<TaskStatus>, 
                      priority: Option<TaskPriority>, tags: Option<&Vec<String>>, order_index: Option<i64>, 
                      estimate_min: Option<i64>, scheduled_start: Option<&str>, scheduled_end: Option<&str>, 
                      note_path: Option<&str>, archived: Option<i32>) -> Result<Task, ApiError> {
        let now = Utc::now().to_rfc3339();
        
        // Get current task to preserve unchanged fields
        let mut current_task = self.get_task_by_id(task_id)?;
        
        // Update fields if provided
        if let Some(new_title) = title {
            current_task.title = new_title.to_string();
        }
        
        if let Some(new_status) = status {
            current_task.status = new_status;
            // Update order_index if status changed
            let max_order: i64 = self.conn.query_row(
                "SELECT COALESCE(MAX(order_index), -1) FROM tasks WHERE status = ?",
                [new_status.to_string()],
                |row| row.get(0)
            )?;
            current_task.order_index = max_order + 1;
        }
        
        if let Some(new_priority) = priority {
            current_task.priority = Some(new_priority);
        }
        
        if let Some(new_tags) = tags {
            current_task.tags = Some(new_tags.clone());
        }
        
        if let Some(new_order) = order_index {
            current_task.order_index = new_order;
        }
        
        if let Some(new_estimate) = estimate_min {
            current_task.estimate_min = Some(new_estimate);
        }
        
        if let Some(new_start) = scheduled_start {
            current_task.scheduled_start = Some(new_start.to_string());
        }
        
        if let Some(new_end) = scheduled_end {
            current_task.scheduled_end = Some(new_end.to_string());
        }
        
        if let Some(new_note_path) = note_path {
            current_task.note_path = Some(new_note_path.to_string());
        }
        
        if let Some(new_archived) = archived {
            current_task.archived = new_archived;
        }
        
        current_task.updated_at = now;
        
        // Serialize tags to JSON string
        let tags_json = match &current_task.tags {
            Some(tags) if !tags.is_empty() => {
                match serde_json::to_string(tags) {
                    Ok(json) => Some(json),
                    Err(e) => {
                        log::warn!("Failed to serialize tags: {} for task {}", e, task_id);
                        None
                    }
                }
            },
            _ => None
        };
        
        // Update in database
        self.conn.execute(
            r#"UPDATE tasks SET title = ?, status = ?, priority = ?, tags = ?, order_index = ?, estimate_min = ?, 
               scheduled_start = ?, scheduled_end = ?, note_path = ?, updated_at = ?, archived = ? 
               WHERE id = ?"#,
            params![
                current_task.title, current_task.status.to_string(), 
                current_task.priority.map(|p| p.to_string()), tags_json,
                current_task.order_index, current_task.estimate_min, 
                current_task.scheduled_start, current_task.scheduled_end,
                current_task.note_path, current_task.updated_at, current_task.archived, task_id
            ],
        )?;
        
        self.get_task_by_id(task_id)
    }
    
    // Mark a task as done
    pub fn mark_task_done(&self, task_id: &str) -> Result<Task, ApiError> {
        let now = Utc::now().to_rfc3339();
        
        self.conn.execute(
            "UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?",
            params![now, now, task_id],
        )?;
        
        self.get_task_by_id(task_id)
    }
    
    // Reopen a completed task
    pub fn reopen_task(&self, task_id: &str) -> Result<Task, ApiError> {
        let now = Utc::now().to_rfc3339();
        
        self.conn.execute(
            "UPDATE tasks SET status = 'todo', completed_at = NULL, updated_at = ? WHERE id = ?",
            params![now, task_id],
        )?;
        
        self.get_task_by_id(task_id)
    }
    
    // Start a task (create a timer and update task status)
    pub fn start_task(&self, task_id: &str) -> Result<(), ApiError> {
        // First, stop any existing active timer
        self.stop_all_active_timers()?;
        
        let now = Utc::now().to_rfc3339();
        let timer_id = Uuid::new_v4().to_string();
        
        // Create new timer
        self.conn.execute(
            r#"INSERT INTO task_timer (id, task_id, start_at, duration_sec, source) 
               VALUES (?, ?, ?, 0, 'manual')"#,
            params![timer_id, task_id, now],
        )?;
        
        // Update task status to doing
        self.conn.execute(
            "UPDATE tasks SET status = 'doing', updated_at = ? WHERE id = ?",
            params![now, task_id],
        )?;
        
        Ok(())
    }
    
    // Stop a task (update timer and task status)
    pub fn stop_task(&self, task_id: &str) -> Result<(), ApiError> {
        let now = Utc::now().to_rfc3339();
        
        // Find active timer for this task
        let mut stmt = self.conn.prepare(
            "SELECT id, start_at FROM task_timer WHERE task_id = ? AND stop_at IS NULL LIMIT 1"
        )?;
        
        let mut timer_iter = stmt.query_map([task_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        
        if let Some(timer_result) = timer_iter.next() {
            let (timer_id, start_at) = timer_result?;
            
            // Calculate duration
            let start_dt = DateTime::parse_from_rfc3339(&start_at)
                .map_err(|e| ApiError {
                    code: "DateTimeError".to_string(),
                    message: format!("Failed to parse start time: {}", e),
                    details: None,
                })?
                .with_timezone(&Utc);
            
            let end_dt = Utc::now();
            let duration_sec = end_dt.signed_duration_since(start_dt).num_seconds();
            
            // Update timer
            self.conn.execute(
                "UPDATE task_timer SET stop_at = ?, duration_sec = ? WHERE id = ?",
                params![now, duration_sec, timer_id],
            )?;
        }
        
        // Update task status to todo
        self.conn.execute(
            "UPDATE tasks SET status = 'todo', updated_at = ? WHERE id = ?",
            params![now, task_id],
        )?;
        
        Ok(())
    }
    
    // Stop all active timers
    fn stop_all_active_timers(&self) -> Result<(), ApiError> {
        let now = Utc::now().to_rfc3339();
        
        // Find all active timers
        let mut stmt = self.conn.prepare(
            "SELECT id, start_at FROM task_timer WHERE stop_at IS NULL"
        )?;
        
        let timer_iter = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        
        for timer_result in timer_iter {
            let (timer_id, start_at) = timer_result?;
            
            // Calculate duration
            let start_dt = DateTime::parse_from_rfc3339(&start_at)
                .map_err(|e| ApiError {
                    code: "DateTimeError".to_string(),
                    message: format!("Failed to parse start time: {}", e),
                    details: None,
                })?
                .with_timezone(&Utc);
            
            let end_dt = Utc::now();
            let duration_sec = end_dt.signed_duration_since(start_dt).num_seconds();
            
            // Update timer
            self.conn.execute(
                "UPDATE task_timer SET stop_at = ?, duration_sec = ? WHERE id = ?",
                params![now, duration_sec, timer_id],
            )?;
        }
        
        // Update all doing tasks to todo
        self.conn.execute(
            "UPDATE tasks SET status = 'todo', updated_at = ? WHERE status = 'doing'",
            [now],
        )?;
        
        Ok(())
    }
    
    // Get day log for a specific day
    pub fn get_day_log(&self, day: &str) -> Result<Option<DayLog>, ApiError> {
        let mut stmt = self.conn.prepare("SELECT * FROM day_log WHERE day = ?")?;
        
        let day_log = stmt.query_row([day], |row| {
            Ok(DayLog {
                day: row.get(0)?,
                daily_md_path: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        }).optional()?;
        
        Ok(day_log)
    }
    
    // Create or update a day log
        pub fn upsert_day_log(&self, day: &str, daily_md_path: &str) -> Result<DayLog, ApiError> {
        let now = Utc::now().to_rfc3339();
        
        // Check if day log exists
        if let Some(mut existing_log) = self.get_day_log(day)? {
            // Update existing log
            existing_log.daily_md_path = daily_md_path.to_string();
            existing_log.updated_at = now.clone();
            
            self.conn.execute(
                "UPDATE day_log SET daily_md_path = ?, updated_at = ? WHERE day = ?",
                params![daily_md_path, now, day],
            )?;
            
            Ok(existing_log)
        } else {
            // Create new log
            let day_log = DayLog {
                day: day.to_string(),
                daily_md_path: daily_md_path.to_string(),
                created_at: now.clone(),
                updated_at: now,
            };
            
            self.conn.execute(
                "INSERT INTO day_log (day, daily_md_path, created_at, updated_at) VALUES (?, ?, ?, ?)",
                params![day, daily_md_path, day_log.created_at.clone(), day_log.updated_at.clone()],
            )?;
            
            Ok(day_log)
        }
    }
    
    // Batch update tasks order and status
    pub fn reorder_tasks(&self, tasks: Vec<ReorderTaskInput>) -> Result<(), ApiError> {
        let now = Utc::now().to_rfc3339();
        
        for task in tasks {
            match task.status {
                Some(status) => {
                    // Update both status and order_index
                    self.conn.execute(
                        r#"UPDATE tasks SET status = ?, order_index = ?, updated_at = ? WHERE id = ?"#,
                        params![status.to_string(), task.order_index, now, task.id],
                    )?;
                },
                None => {
                    // Update only order_index
                    self.conn.execute(
                        r#"UPDATE tasks SET order_index = ?, updated_at = ? WHERE id = ?"#,
                        params![task.order_index, now, task.id],
                    )?;
                }
            }
        }
        
        Ok(())
    }
    
    // Get UI state for a vault
    #[allow(dead_code)]
    pub fn get_ui_state(&self, vault_id: &str) -> Result<Option<String>, ApiError> {
        let mut stmt = self.conn.prepare("SELECT state_json FROM ui_state WHERE vault_id = ?")?;
        let result = stmt.query_row([vault_id], |row| row.get(0))
            .optional()?;
        
        Ok(result)
    }
    
    // Set UI state for a vault (merge with existing state if it exists)
    #[allow(dead_code)]
    pub fn set_ui_state(&self, vault_id: &str, partial_state_json: &str) -> Result<(), ApiError> {
        let now = Utc::now().to_rfc3339();
        
        // Get existing state if it exists
        let existing_state_json = self.get_ui_state(vault_id)?;
        
        // Merge partial state with existing state
        let merged_state_json = match existing_state_json {
            Some(existing) => {
                // Parse existing and partial states
                let existing_state: serde_json::Value = serde_json::from_str(&existing)?;
                let partial_state: serde_json::Value = serde_json::from_str(partial_state_json)?;
                
                // Merge partial into existing (partial takes precedence)
                let merged_state = merge_json(existing_state, partial_state);
                
                // Serialize back to string
                serde_json::to_string(&merged_state)?
            },
            None => {
                // No existing state, use partial as full state
                partial_state_json.to_string()
            }
        };
        
        // Upsert into database
        self.conn.execute(
            r#"INSERT INTO ui_state (vault_id, state_json, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(vault_id) DO UPDATE SET
               state_json = excluded.state_json,
               updated_at = excluded.updated_at"#,
            params![vault_id, merged_state_json, now],
        )?;
        
        Ok(())
    }
}

// Helper function to merge two JSON objects
#[allow(dead_code)]
fn merge_json(existing: serde_json::Value, partial: serde_json::Value) -> serde_json::Value {
    // Check if both are objects
    if existing.is_object() && partial.is_object() {
        let mut existing_map = existing.as_object().unwrap().clone();
        let partial_map = partial.as_object().unwrap();
        
        for (key, partial_value) in partial_map {
            if existing_map.contains_key(key) {
                // If both values are objects, recursively merge
                if existing_map[key].is_object() && partial_value.is_object() {
                    let merged_value = merge_json(existing_map[key].clone(), partial_value.clone());
                    existing_map.insert(key.clone(), merged_value);
                } else {
                    // Otherwise, overwrite with partial value
                    existing_map.insert(key.clone(), partial_value.clone());
                }
            } else {
                // New key, add to existing
                existing_map.insert(key.clone(), partial_value.clone());
            }
        }
        serde_json::Value::Object(existing_map)
    } else {
        // If either is not an object, partial takes precedence
        partial
    }
}
