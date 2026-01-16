use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};

// Task priority enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    High,
    Medium,
    Low,
}

impl From<&str> for TaskPriority {
    fn from(s: &str) -> Self {
        match s {
            "high" => TaskPriority::High,
            "medium" => TaskPriority::Medium,
            "low" => TaskPriority::Low,
            _ => TaskPriority::Medium,
        }
    }
}

impl Display for TaskPriority {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskPriority::High => write!(f, "high"),
            TaskPriority::Medium => write!(f, "medium"),
            TaskPriority::Low => write!(f, "low"),
        }
    }
}

// Task status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    #[serde(alias = "Backlog")]
    #[serde(rename = "backlog")]
    Backlog,

    #[serde(alias = "Todo")]
    #[serde(rename = "todo")]
    Todo,

    #[serde(alias = "Doing")]
    #[serde(rename = "doing")]
    Doing,

    #[serde(alias = "Done")]
    #[serde(rename = "done")]
    Done,
}

impl From<&str> for TaskStatus {
    fn from(s: &str) -> Self {
        match s {
            "backlog" => TaskStatus::Backlog,
            "todo" => TaskStatus::Todo,
            "doing" => TaskStatus::Doing,
            "done" => TaskStatus::Done,
            _ => TaskStatus::Backlog,
        }
    }
}

impl Display for TaskStatus {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Backlog => write!(f, "backlog"),
            TaskStatus::Todo => write!(f, "todo"),
            TaskStatus::Doing => write!(f, "doing"),
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
    pub order_index: i64,
    pub estimate_min: Option<i64>,
    pub scheduled_start: Option<String>,
    pub scheduled_end: Option<String>,
    pub due_date: Option<String>,
    pub board_id: Option<String>,
    pub note_path: Option<String>,
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
    pub backlog: Vec<Task>,
    pub todo: Vec<Task>,
    pub doing: Vec<Task>,
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
