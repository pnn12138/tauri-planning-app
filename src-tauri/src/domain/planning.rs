use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};

// Subtask model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtask {
    pub id: String,
    pub title: String,
    pub completed: bool,
}

// Task periodicity model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskPeriodicity {
    pub strategy: String, // "day", "week", "month", "year"
    pub interval: i32,
    pub start_date: String,
    pub end_rule: String, // "never", "date", "count"
    pub end_date: Option<String>,
    pub end_count: Option<i32>,
}

// Task priority enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    #[serde(alias = "p0")]
    Urgent, // P0
    #[serde(alias = "p1")]
    High, // P1
    #[serde(alias = "p2")]
    Medium, // P2
    #[serde(alias = "p3")]
    Low, // P3
}

impl From<&str> for TaskPriority {
    fn from(s: &str) -> Self {
        match s {
            "p0" | "urgent" => TaskPriority::Urgent,
            "p1" | "high" => TaskPriority::High,
            "p2" | "medium" => TaskPriority::Medium,
            "p3" | "low" => TaskPriority::Low,
            _ => TaskPriority::Low, // 默认低优先级 P3
        }
    }
}

impl Display for TaskPriority {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskPriority::Urgent => write!(f, "p0"),
            TaskPriority::High => write!(f, "p1"),
            TaskPriority::Medium => write!(f, "p2"),
            TaskPriority::Low => write!(f, "p3"),
        }
    }
}

// Task status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    #[serde(alias = "Todo")]
    #[serde(alias = "backlog")] // Support legacy backlog for incoming requests
    #[serde(rename = "todo")]
    Todo,

    #[serde(alias = "Doing")]
    #[serde(rename = "doing")]
    Doing,

    #[serde(alias = "Verify")]
    #[serde(rename = "verify")]
    Verify,

    #[serde(alias = "Done")]
    #[serde(rename = "done")]
    Done,
}

impl From<&str> for TaskStatus {
    fn from(s: &str) -> Self {
        match s {
            "backlog" => TaskStatus::Todo, // Map legacy backlog to todo
            "todo" => TaskStatus::Todo,
            "doing" => TaskStatus::Doing,
            "verify" => TaskStatus::Verify,
            "done" => TaskStatus::Done,
            _ => TaskStatus::Todo,
        }
    }
}

impl Display for TaskStatus {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Todo => write!(f, "todo"),
            TaskStatus::Doing => write!(f, "doing"),
            TaskStatus::Verify => write!(f, "verify"),
            TaskStatus::Done => write!(f, "done"),
        }
    }
}

// Task model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: Option<TaskPriority>,
    pub tags: Option<Vec<String>>,
    pub labels: Option<Vec<String>>,
    pub subtasks: Option<Vec<Subtask>>,
    pub periodicity: Option<TaskPeriodicity>,
    pub order_index: i64,
    pub estimate_min: Option<i64>,
    pub scheduled_start: Option<String>,
    pub scheduled_end: Option<String>,
    pub due_date: Option<String>,
    pub board_id: Option<String>,
    pub note_path: Option<String>,
    pub task_dir_slug: Option<String>, // Directory slug for task folder
    pub md_rel_path: Option<String>,   // Relative path to markdown file
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub archived: i32,
}

// Timer model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Timer {
    pub id: String,
    pub task_id: String,
    pub start_at: String,
    pub stop_at: Option<String>,
    pub duration_sec: i64,
    pub source: String,
}

// Day log model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayLog {
    pub day: String,
    pub daily_md_path: String,
    pub created_at: String,
    pub updated_at: String,
}

// Kanban tasks grouped by status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanTasks {
    pub todo: Vec<Task>,
    pub doing: Vec<Task>,
    pub verify: Vec<Task>,
    pub done: Vec<Task>,
}

// TodayDTO - the main data structure for Home page
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodayDTO {
    pub kanban: KanbanTasks,
    pub timeline: Vec<Task>,
    pub current_doing: Option<Task>,
    pub current_timer: Option<Timer>,
    pub today: String,
    pub server_now: String,
}

// Task creation input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskInput {
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<String>,
    pub board_id: Option<String>,
    pub estimate_min: Option<i64>,
    pub tags: Option<Vec<String>>,
    pub labels: Option<Vec<String>>,
    pub subtasks: Option<Vec<Subtask>>,
    pub periodicity: Option<TaskPeriodicity>,
    pub scheduled_start: Option<String>,
    pub scheduled_end: Option<String>,
    pub note_path: Option<String>,
}

// Task update input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub tags: Option<Vec<String>>,
    pub labels: Option<Vec<String>>,
    pub subtasks: Option<Vec<Subtask>>,
    pub periodicity: Option<TaskPeriodicity>,
    pub due_date: Option<Option<String>>,
    pub board_id: Option<String>,
    pub order_index: Option<i64>,
    pub estimate_min: Option<i64>,
    pub scheduled_start: Option<String>,
    pub scheduled_end: Option<String>,
    pub note_path: Option<String>,
    pub archived: Option<i32>,
}

// Batch task reorder input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderTaskInput {
    pub id: String,
    pub status: Option<TaskStatus>,
    pub order_index: i64,
}

// Open daily log input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenDailyInput {
    pub day: String,
}

// Open daily log response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenDailyResponse {
    pub md_path: String,
}

// Open task note response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenTaskNoteResponse {
    pub md_path: String,
}
