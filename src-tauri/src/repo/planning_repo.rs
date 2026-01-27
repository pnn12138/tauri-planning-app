use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, Utc};
use rusqlite::params;
use rusqlite::{Connection, OptionalExtension, Result};
use serde_json;
use tauri::AppHandle;
use tracing::{info, span, Level};
use uuid::Uuid;

use crate::domain::planning::{
    DayLog, KanbanTasks, ReorderTaskInput, Task, TaskPriority, TaskStatus, Timer, TodayDTO,
};
use crate::ipc::ApiError;
use crate::paths::{planning_db_path, planning_dir, vault_meta_path};
use serde::{Deserialize, Serialize};

// Database repository for planning data
pub struct PlanningRepo {
    conn: Connection,
}

#[derive(Debug, Serialize, Deserialize)]
struct VaultMeta {
    vault_id: String,
    created_at: String,
    schema_version: i32,
}

impl PlanningRepo {
    // Create a new instance of PlanningRepo
    pub fn new(vault_root: &std::path::Path) -> Result<Self, ApiError> {
        // Ensure .planning directory exists
        let planning_dir_path = planning_dir(vault_root);
        std::fs::create_dir_all(&planning_dir_path).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to create .planning directory: {}", e),
            details: None,
        })?;

        let db_path = planning_db_path(vault_root);

        let conn = Connection::open(db_path).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to open database: {}", e),
            details: None,
        })?;

        // Configure SQLite for better performance and cloud sync safety
        // Configure SQLite for better performance and cloud sync safety
        // PRAGMA journal_mode returns the new mode, so we must use query_row, not execute
        let _mode: String = conn
            .query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to set WAL mode: {}", e),
                details: None,
            })?;

        conn.pragma_update(None, "busy_timeout", 5000)
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to set busy timeout: {}", e),
                details: None,
            })?;

        let repo = Self { conn };
        repo.init()?;

        Ok(repo)
    }

    // Initialize database tables
    fn init(&self) -> Result<(), ApiError> {
        // Create tasks table
        self.conn
            .execute(
                r#"CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                priority TEXT,
                tags TEXT,
                due_date TEXT,
                board_id TEXT,
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
            )
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to create tasks table: {}", e),
                details: None,
            })?;

        // Add priority column if not exists
        let has_priority: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'priority'",
            [],
            |row| row.get(0),
        )?;

        if has_priority == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN priority TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add priority column: {}", e),
                    details: None,
                })?;
        }

        // Add tags column if not exists
        let has_tags: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'tags'",
            [],
            |row| row.get(0),
        )?;

        if has_tags == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN tags TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add tags column: {}", e),
                    details: None,
                })?;
        }

        // Add description column if not exists
        let has_description: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'description'",
            [],
            |row| row.get(0),
        )?;

        if has_description == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN description TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add description column: {}", e),
                    details: None,
                })?;
        }

        // Add due_date column if not exists
        let has_due_date: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'due_date'",
            [],
            |row| row.get(0),
        )?;

        if has_due_date == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN due_date TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add due_date column: {}", e),
                    details: None,
                })?;
        }

        // Add board_id column if not exists
        let has_board_id: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'board_id'",
            [],
            |row| row.get(0),
        )?;

        if has_board_id == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN board_id TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add board_id column: {}", e),
                    details: None,
                })?;
        }

        // Add subtasks column if not exists
        let has_subtasks: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'subtasks'",
            [],
            |row| row.get(0),
        )?;

        if has_subtasks == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN subtasks TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add subtasks column: {}", e),
                    details: None,
                })?;
        }

        // Add periodicity column if not exists
        let has_periodicity: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'periodicity'",
            [],
            |row| row.get(0),
        )?;

        if has_periodicity == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN periodicity TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add periodicity column: {}", e),
                    details: None,
                })?;
        }

        // Add task_dir_slug column if not exists
        let has_task_dir_slug: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'task_dir_slug'",
            [],
            |row| row.get(0),
        )?;

        if has_task_dir_slug == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN task_dir_slug TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add task_dir_slug column: {}", e),
                    details: None,
                })?;
        }

        // Add md_rel_path column if not exists
        let has_md_rel_path: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'md_rel_path'",
            [],
            |row| row.get(0),
        )?;

        if has_md_rel_path == 0 {
            self.conn
                .execute("ALTER TABLE tasks ADD COLUMN md_rel_path TEXT", [])
                .map_err(|e| ApiError {
                    code: "DatabaseError".to_string(),
                    message: format!("Failed to add md_rel_path column: {}", e),
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

        self.conn
            .execute(
                r#"CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON tasks(scheduled_start)"#,
                [],
            )
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to create tasks schedule index: {}", e),
                details: None,
            })?;

        // Create task_timer table
        self.conn
            .execute(
                r#"CREATE TABLE IF NOT EXISTS task_timer (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                start_at TEXT NOT NULL,
                stop_at TEXT,
                duration_sec INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'manual'
            )"#,
                [],
            )
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to create task_timer table: {}", e),
                details: None,
            })?;

        // Create index for task_timer table
        self.conn
            .execute(
                r#"CREATE INDEX IF NOT EXISTS idx_timer_task ON task_timer(task_id, start_at)"#,
                [],
            )
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to create task_timer index: {}", e),
                details: None,
            })?;

        // Create day_log table
        self.conn
            .execute(
                r#"CREATE TABLE IF NOT EXISTS day_log (
                day TEXT PRIMARY KEY,
                daily_md_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"#,
                [],
            )
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to create day_log table: {}", e),
                details: None,
            })?;

        // Create ui_state table with vault_id as primary key
        // This is an upgraded schema from the old key-value schema
        self.conn
            .execute(
                r#"CREATE TABLE IF NOT EXISTS ui_state (
                vault_id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"#,
                [],
            )
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to create ui_state table: {}", e),
                details: None,
            })?;

        // Create vault_meta table for vault identification and metadata
        self.conn
            .execute(
                r#"CREATE TABLE IF NOT EXISTS vault_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )"#,
                [],
            )
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to create vault_meta table: {}", e),
                details: None,
            })?;

        Ok(())
    }

    // Get all tasks for today's home page
    pub fn get_today_data(&self, today: &str) -> Result<TodayDTO, ApiError> {
        // Get all tasks
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM tasks ORDER BY status, order_index")?;
        let task_iter = stmt.query_map([], |row| task_from_row(row))?;

        let mut all_tasks: Vec<Task> = Vec::new();
        for task in task_iter {
            all_tasks.push(task?);
        }

        // Group tasks by status for kanban
        let mut kanban = KanbanTasks {
            todo: Vec::new(),
            doing: Vec::new(),
            verify: Vec::new(),
            done: Vec::new(),
        };

        for task in &all_tasks {
            match task.status {
                TaskStatus::Todo => kanban.todo.push(task.clone()),
                TaskStatus::Doing => kanban.doing.push(task.clone()),
                TaskStatus::Verify => kanban.verify.push(task.clone()),
                TaskStatus::Done => kanban.done.push(task.clone()),
            }
        }

        // Filter timeline tasks (scheduled_start is today)
        let today_start = format!("{today}T00:00:00");
        let today_end = format!("{today}T23:59:59");

        let timeline: Vec<Task> = all_tasks
            .iter()
            .flat_map(|task| {
                let mut tasks_for_timeline = Vec::new();

                // 1. Check scheduled_start (exact match for one-off or base occurrence)
                if let Some(start) = &task.scheduled_start {
                    if start >= &today_start && start <= &today_end {
                        tasks_for_timeline.push(task.clone());
                        return tasks_for_timeline;
                    }
                }

                // 2. Check periodicity
                if let Some(periodicity) = &task.periodicity {
                    // Parse today's date
                    let Ok(current_date) = NaiveDate::parse_from_str(today, "%Y-%m-%d") else {
                        return tasks_for_timeline;
                    };

                    // Try parsing as DateTime (RFC3339) -> NaiveDateTime (YYYY-MM-DDTHH:MM:SS) -> Date (YYYY-MM-DD)
                    let (start_date, start_time_str) = if let Ok(dt) =
                        DateTime::parse_from_rfc3339(&periodicity.start_date)
                    {
                        (
                            dt.date_naive(),
                            dt.format("%H:%M:%S").to_string(), // Extract time part
                        )
                    } else if let Ok(ndt) =
                        NaiveDateTime::parse_from_str(&periodicity.start_date, "%Y-%m-%dT%H:%M:%S")
                    {
                        (ndt.date(), ndt.time().to_string())
                    } else if let Ok(d) =
                        NaiveDate::parse_from_str(&periodicity.start_date, "%Y-%m-%d")
                    {
                        (d, "00:00:00".to_string())
                    } else {
                        return tasks_for_timeline;
                    };

                    if current_date < start_date {
                        return tasks_for_timeline;
                    }

                    // Check end_date if rule is 'date'
                    if periodicity.end_rule == "date" {
                        if let Some(end_date_str) = &periodicity.end_date {
                            if let Ok(end_date) =
                                NaiveDate::parse_from_str(end_date_str, "%Y-%m-%d")
                            {
                                if current_date > end_date {
                                    return tasks_for_timeline;
                                }
                            }
                        }
                    }

                    // Calculate recurrence
                    let diff = current_date.signed_duration_since(start_date);
                    let days = diff.num_days();
                    let interval = periodicity.interval.max(1) as i64;

                    let is_recurrence = match periodicity.strategy.as_str() {
                        "day" => days % interval == 0,
                        "week" => days % (7 * interval) == 0,
                        "month" => {
                            if current_date.day() != start_date.day() {
                                false
                            } else {
                                let year_diff = current_date.year() - start_date.year();
                                let month_diff =
                                    current_date.month() as i32 - start_date.month() as i32;
                                let total_months = year_diff * 12 + month_diff;
                                total_months % (interval as i32) == 0
                            }
                        }
                        "year" => {
                            current_date.day() == start_date.day()
                                && current_date.month() == start_date.month()
                                && (current_date.year() - start_date.year()) % (interval as i32)
                                    == 0
                        }
                        _ => false,
                    };

                    if is_recurrence {
                        // Create a virtual instance for today
                        let mut instance = task.clone();
                        // Construct scheduled_start with today's date and the original start time
                        instance.scheduled_start = Some(format!("{}T{}", today, start_time_str));
                        tasks_for_timeline.push(instance);
                    }
                }

                tasks_for_timeline
            })
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
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM task_timer WHERE stop_at IS NULL LIMIT 1")?;

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
        let task = stmt.query_row([task_id], |row| task_from_row(row))?;

        Ok(task)
    }

    // Get task by id, returns None if not found
    pub fn get_task(&self, task_id: &str) -> Result<Option<Task>, ApiError> {
        let mut stmt = self.conn.prepare("SELECT * FROM tasks WHERE id = ?")?;
        let task = stmt
            .query_row([task_id], |row| task_from_row(row))
            .optional()?;

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
    pub fn create_task(
        &self,
        title: &str,
        description: Option<&str>,
        status: TaskStatus,
        priority: Option<TaskPriority>,
        due_date: Option<&str>,
        board_id: Option<&str>,
        estimate_min: Option<i64>,
        tags: Option<&Vec<String>>,
        subtasks: Option<&Vec<crate::domain::planning::Subtask>>,
        periodicity: Option<&crate::domain::planning::TaskPeriodicity>,
        scheduled_start: Option<&str>,
        scheduled_end: Option<&str>,
        note_path: Option<&str>,
        completed_at: Option<&str>,
        task_dir_slug: Option<&str>,
        md_rel_path: Option<&str>,
    ) -> Result<Task, ApiError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        // Get max order index for the status
        let max_order: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(order_index), -1) FROM tasks WHERE status = ?",
            [status.to_string()],
            |row| row.get(0),
        )?;

        let order_index = max_order + 1;

        let tags_json = match tags {
            Some(tags_vec) if !tags_vec.is_empty() => match serde_json::to_string(tags_vec) {
                Ok(json) => Some(json),
                Err(e) => {
                    log::warn!("Failed to serialize tags: {}", e);
                    None
                }
            },
            _ => None,
        };

        // Convert subtasks to JSON string
        let subtasks_json = match subtasks {
            Some(subtasks_vec) if !subtasks_vec.is_empty() => {
                match serde_json::to_string(subtasks_vec) {
                    Ok(json) => Some(json),
                    Err(e) => {
                        log::warn!("Failed to serialize subtasks: {}", e);
                        None
                    }
                }
            }
            _ => None,
        };

        // Convert periodicity to JSON string
        let periodicity_json = match periodicity {
            Some(p) => match serde_json::to_string(p) {
                Ok(json) => Some(json),
                Err(e) => {
                    log::warn!("Failed to serialize periodicity: {}", e);
                    None
                }
            },
            None => None,
        };

        self.conn.execute(
            r#"INSERT INTO tasks (
                id, title, description, status, priority, tags, subtasks, periodicity, 
                due_date, board_id, order_index, estimate_min, scheduled_start, scheduled_end, 
                note_path, created_at, updated_at, completed_at, archived,
                task_dir_slug, md_rel_path
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)"#,
            params![
                id,
                title,
                description,
                status.to_string(),
                priority.map(|p| p.to_string()),
                tags_json,
                subtasks_json,
                periodicity_json,
                due_date,
                board_id,
                order_index,
                estimate_min,
                scheduled_start,
                scheduled_end,
                note_path,
                now,
                now,
                completed_at,
                task_dir_slug,
                md_rel_path
            ],
        )?;

        self.get_task_by_id(&id)
    }

    // Update an existing task
    pub fn update_task(
        &self,
        task_id: &str,
        title: Option<&str>,
        description: Option<&str>,
        status: Option<TaskStatus>,
        priority: Option<TaskPriority>,
        tags: Option<&Vec<String>>,
        subtasks: Option<&Vec<crate::domain::planning::Subtask>>,
        periodicity: Option<&crate::domain::planning::TaskPeriodicity>,
        order_index: Option<i64>,
        estimate_min: Option<i64>,
        scheduled_start: Option<&str>,
        scheduled_end: Option<&str>,
        due_date: Option<Option<String>>,
        board_id: Option<&str>,
        note_path: Option<&str>,
        archived: Option<i32>,
        completed_at: Option<Option<String>>,
    ) -> Result<Task, ApiError> {
        let now = Utc::now().to_rfc3339();

        // Get current task to preserve unchanged fields
        let mut current_task = self.get_task_by_id(task_id)?;

        // Update fields if provided
        if let Some(new_title) = title {
            current_task.title = new_title.to_string();
        }

        if let Some(new_description) = description {
            current_task.description = Some(new_description.to_string());
        }

        if let Some(new_status) = status {
            current_task.status = new_status;
            // Update order_index if status changed
            let max_order: i64 = self.conn.query_row(
                "SELECT COALESCE(MAX(order_index), -1) FROM tasks WHERE status = ?",
                [new_status.to_string()],
                |row| row.get(0),
            )?;
            current_task.order_index = max_order + 1;
        }

        if let Some(new_priority) = priority {
            current_task.priority = Some(new_priority);
        }

        if let Some(new_tags) = tags {
            current_task.tags = Some(new_tags.clone());
            current_task.labels = Some(new_tags.clone());
        }

        if let Some(new_subtasks) = subtasks {
            current_task.subtasks = Some(new_subtasks.clone());
        }

        if let Some(new_periodicity) = periodicity {
            current_task.periodicity = Some(new_periodicity.clone());
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

        if let Some(new_due_date) = due_date {
            current_task.due_date = new_due_date;
        }

        if let Some(new_board_id) = board_id {
            current_task.board_id = Some(new_board_id.to_string());
        }

        if let Some(new_note_path) = note_path {
            current_task.note_path = Some(new_note_path.to_string());
        }

        if let Some(new_archived) = archived {
            current_task.archived = new_archived;
        }

        if let Some(new_completed_at) = completed_at {
            current_task.completed_at = new_completed_at;
        }

        current_task.updated_at = now;

        // Serialize tags to JSON string
        let tags_json = match &current_task.tags {
            Some(tags) if !tags.is_empty() => match serde_json::to_string(tags) {
                Ok(json) => Some(json),
                Err(e) => {
                    log::warn!("Failed to serialize tags: {} for task {}", e, task_id);
                    None
                }
            },
            _ => None,
        };

        // Serialize subtasks to JSON string
        let subtasks_json = match &current_task.subtasks {
            Some(subtasks) if !subtasks.is_empty() => match serde_json::to_string(subtasks) {
                Ok(json) => Some(json),
                Err(e) => {
                    log::warn!("Failed to serialize subtasks: {} for task {}", e, task_id);
                    None
                }
            },
            _ => None,
        };

        // Serialize periodicity to JSON string
        let periodicity_json = match &current_task.periodicity {
            Some(p) => match serde_json::to_string(p) {
                Ok(json) => Some(json),
                Err(e) => {
                    log::warn!(
                        "Failed to serialize periodicity: {} for task {}",
                        e,
                        task_id
                    );
                    None
                }
            },
            None => None,
        };

        // Update in database
        self.conn.execute(
            r#"UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, tags = ?, subtasks = ?, periodicity = ?, due_date = ?, board_id = ?, order_index = ?, estimate_min = ?,
               scheduled_start = ?, scheduled_end = ?, note_path = ?, updated_at = ?, archived = ?, completed_at = ?
               WHERE id = ?"#,
            params![
                current_task.title, current_task.description, current_task.status.to_string(),
                current_task.priority.map(|p| p.to_string()), tags_json, subtasks_json, periodicity_json, current_task.due_date,
                current_task.board_id, current_task.order_index, current_task.estimate_min,
                current_task.scheduled_start, current_task.scheduled_end, current_task.note_path,
                current_task.updated_at, current_task.archived, current_task.completed_at, task_id
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
            "SELECT id, start_at FROM task_timer WHERE task_id = ? AND stop_at IS NULL LIMIT 1",
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
        let mut stmt = self
            .conn
            .prepare("SELECT id, start_at FROM task_timer WHERE stop_at IS NULL")?;

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

        let day_log = stmt
            .query_row([day], |row| {
                Ok(DayLog {
                    day: row.get(0)?,
                    daily_md_path: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })
            .optional()?;

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
                }
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

    // Delete a task and its associated timers
    pub fn delete_task(&mut self, task_id: &str) -> Result<(), ApiError> {
        let span = span!(Level::INFO, "planning.delete_task", task_id = task_id);
        let _enter = span.enter();

        // First, check if task exists
        if self.get_task(task_id)?.is_none() {
            return Err(ApiError {
                code: "NotFound".to_string(),
                message: format!("Task with id {} not found", task_id),
                details: None,
            });
        }

        // Start a transaction to ensure atomicity
        let transaction = self.conn.transaction()?;

        // Delete associated timers
        transaction.execute("DELETE FROM task_timer WHERE task_id = ?", [task_id])?;

        // Delete the task
        transaction.execute("DELETE FROM tasks WHERE id = ?", [task_id])?;

        // Commit the transaction
        transaction.commit()?;

        info!(target: "planning", "delete_task succeeded: task_id={}", task_id);

        Ok(())
    }

    // Get UI state for a vault
    #[allow(dead_code)]
    pub fn get_ui_state(&self, vault_id: &str) -> Result<Option<String>, ApiError> {
        let mut stmt = self
            .conn
            .prepare("SELECT state_json FROM ui_state WHERE vault_id = ?")?;
        let result = stmt.query_row([vault_id], |row| row.get(0)).optional()?;

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
            }
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

    // Get or generate vault_id for this vault
    pub fn ensure_vault_id(&self, vault_root: &std::path::Path) -> Result<String, ApiError> {
        let ids = self.get_vault_meta_from_db()?;
        let db_vault_id = ids.0;
        let db_created_at = ids.1;

        let meta_path = vault_meta_path(vault_root);
        let file_meta = if meta_path.exists() {
            let content = std::fs::read_to_string(&meta_path).map_err(|e| ApiError {
                code: "IOError".to_string(),
                message: format!("Failed to read vault.json: {}", e),
                details: None,
            })?;
            serde_json::from_str::<VaultMeta>(&content).ok()
        } else {
            None
        };

        let (vault_id, created_at) = match (db_vault_id, file_meta) {
            (Some(id), Some(meta)) => {
                if id != meta.vault_id {
                    info!(target: "planning", "Vault ID mismatch! DB: {}, File: {}", id, meta.vault_id);
                    // For now, trust DB as source of truth for the app
                }
                (id, meta.created_at) // Use DB id, file time? Or DB time?
            }
            (Some(id), None) => {
                // DB has ID, file missing -> sync to file
                let created_at = db_created_at.unwrap_or_else(|| Utc::now().to_rfc3339());
                self.write_vault_meta_file(&meta_path, &id, &created_at)?;
                (id, created_at)
            }
            (None, Some(meta)) => {
                // DB missing, file has ID -> restore to DB
                self.store_vault_meta_to_db(&meta.vault_id, &meta.created_at)?;
                (meta.vault_id, meta.created_at)
            }
            (None, None) => {
                // Both missing -> new vault
                let id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                self.store_vault_meta_to_db(&id, &now)?;
                self.write_vault_meta_file(&meta_path, &id, &now)?;
                (id, now)
            }
        };

        Ok(vault_id)
    }

    fn get_vault_meta_from_db(&self) -> Result<(Option<String>, Option<String>), ApiError> {
        let vault_id: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM vault_meta WHERE key = 'vault_id'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        let created_at: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM vault_meta WHERE key = 'created_at'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        Ok((vault_id, created_at))
    }

    fn store_vault_meta_to_db(&self, vault_id: &str, created_at: &str) -> Result<(), ApiError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('vault_id', ?)",
            params![vault_id],
        )?;
        self.conn.execute(
            "INSERT OR REPLACE INTO vault_meta (key, value) VALUES ('created_at', ?)",
            params![created_at],
        )?;
        Ok(())
    }

    fn write_vault_meta_file(
        &self,
        path: &std::path::Path,
        vault_id: &str,
        created_at: &str,
    ) -> Result<(), ApiError> {
        let meta = VaultMeta {
            vault_id: vault_id.to_string(),
            created_at: created_at.to_string(),
            schema_version: 1,
        };
        let content = serde_json::to_string_pretty(&meta)?;
        std::fs::write(path, content).map_err(|e| ApiError {
            code: "IOError".to_string(),
            message: format!("Failed to write vault.json: {}", e),
            details: None,
        })
    }

    // Perform WAL checkpoint to reduce wal file size
    pub fn checkpoint(&self) -> Result<(), ApiError> {
        self.conn
            .execute("PRAGMA wal_checkpoint(TRUNCATE)", [])
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to checkpoint WAL: {}", e),
                details: None,
            })?;
        Ok(())
    }

    // Update task's markdown relative path and slug
    pub fn update_task_path_info(
        &self,
        task_id: &str,
        slug: &str,
        md_rel_path: &str,
    ) -> Result<(), ApiError> {
        let now = Utc::now().to_rfc3339();

        self.conn.execute(
            "UPDATE tasks SET task_dir_slug = ?, md_rel_path = ?, updated_at = ? WHERE id = ?",
            params![slug, md_rel_path, now, task_id],
        )?;

        Ok(())
    }

    // Import tasks from legacy database
    pub fn import_legacy_tasks(&self, old_db_path: &std::path::Path) -> Result<i32, ApiError> {
        // Attach old database
        let attach_sql = format!(
            "ATTACH DATABASE '{}' AS old_db",
            old_db_path.to_string_lossy()
        );
        self.conn.execute(&attach_sql, []).map_err(|e| ApiError {
            code: "DatabaseError".to_string(),
            message: format!("Failed to attach legacy DB: {}", e),
            details: None,
        })?;

        // Import tasks (using INSERT OR IGNORE to avoid overwriting if somehow already exists, or REPLACE?)
        // Assuming we want to import old tasks. If ID conflicts, what to do?
        // Let's use INSERT OR IGNORE for safety.
        // We migrate all columns that existed in old DB.
        // Old DB schema assumed specific columns.
        let count = self
            .conn
            .execute(
                r#"
            INSERT OR IGNORE INTO tasks (
                id, title, description, status, priority, tags, subtasks, periodicity,
                order_index, estimate_min, scheduled_start, scheduled_end, due_date,
                board_id, note_path, created_at, updated_at, completed_at, archived
            )
            SELECT 
                id, title, description, status, priority, tags, subtasks, periodicity,
                order_index, estimate_min, scheduled_start, scheduled_end, due_date,
                board_id, note_path, created_at, updated_at, completed_at, archived
            FROM old_db.tasks
            "#,
                [],
            )
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to import tasks from legacy DB: {}", e),
                details: None,
            })?;

        // Detach
        self.conn
            .execute("DETACH DATABASE old_db", [])
            .map_err(|e| ApiError {
                code: "DatabaseError".to_string(),
                message: format!("Failed to detach legacy DB: {}", e),
                details: None,
            })?;

        Ok(count as i32)
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

fn parse_tags(tags_str: Option<String>, task_id: &str) -> Option<Vec<String>> {
    match tags_str {
        Some(s) if !s.is_empty() => match serde_json::from_str(&s) {
            Ok(tags) => Some(tags),
            Err(e) => {
                log::warn!("Failed to parse tags: {} for task {}", e, task_id);
                None
            }
        },
        _ => None,
    }
}

fn parse_subtasks(
    subtasks_str: Option<String>,
    task_id: &str,
) -> Option<Vec<crate::domain::planning::Subtask>> {
    match subtasks_str {
        Some(s) if !s.is_empty() => match serde_json::from_str(&s) {
            Ok(subtasks) => Some(subtasks),
            Err(e) => {
                log::warn!("Failed to parse subtasks: {} for task {}", e, task_id);
                None
            }
        },
        _ => None,
    }
}

fn parse_periodicity(
    periodicity_str: Option<String>,
    task_id: &str,
) -> Option<crate::domain::planning::TaskPeriodicity> {
    match periodicity_str {
        Some(s) if !s.is_empty() => match serde_json::from_str(&s) {
            Ok(periodicity) => Some(periodicity),
            Err(e) => {
                log::warn!("Failed to parse periodicity: {} for task {}", e, task_id);
                None
            }
        },
        _ => None,
    }
}

fn task_from_row(row: &rusqlite::Row<'_>) -> Result<Task, rusqlite::Error> {
    let id: String = row.get("id")?;
    let priority_str: Option<String> = row.get("priority")?;
    let priority = priority_str.as_deref().map(TaskPriority::from);
    let tags_str: Option<String> = row.get("tags")?;
    let tags = parse_tags(tags_str, &id);
    let subtasks_str: Option<String> = row.get("subtasks").unwrap_or(None); // Use unwrap_or(None) to handle missing column during migration
    let subtasks = parse_subtasks(subtasks_str, &id);
    let periodicity_str: Option<String> = row.get("periodicity").unwrap_or(None);
    let periodicity = parse_periodicity(periodicity_str, &id);

    Ok(Task {
        id,
        title: row.get("title")?,
        description: row.get("description")?,
        status: TaskStatus::from(row.get::<_, String>("status")?.as_str()),
        priority,
        tags: tags.clone(),
        labels: tags,
        subtasks,
        periodicity,
        order_index: row.get("order_index")?,
        estimate_min: row.get("estimate_min")?,
        scheduled_start: row.get("scheduled_start")?,
        scheduled_end: row.get("scheduled_end")?,
        due_date: row.get("due_date")?,
        board_id: row.get("board_id")?,
        note_path: row.get("note_path")?,
        task_dir_slug: row.get("task_dir_slug").unwrap_or(None),
        md_rel_path: row.get("md_rel_path").unwrap_or(None),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        completed_at: row.get("completed_at")?,
        archived: row.get("archived")?,
    })
}
