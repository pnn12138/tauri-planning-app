use std::fs;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::collections::HashMap;

use crate::ipc::ApiError;
use crate::security::path_policy;

const PLANNING_DIR: &str = ".planning";
const TASKS_DIR: &str = "tasks";
const DAILY_DIR: &str = "daily";
const FRONTMATTER_VERSION: i32 = 2;

// System-managed frontmatter fields
const SYSTEM_FIELDS: &[&str] = &[
    "fm_version", "id", "title", "status", "priority", 
    "tags", "estimate_min", "due_date", "created_at", "updated_at"
];

// Markdown repository for planning data
pub struct PlanningMdRepo {
    vault_root: PathBuf,
    // Task-level write locks to prevent concurrent updates
    task_locks: Mutex<HashMap<String, Mutex<()>>>,
}

impl PlanningMdRepo {
    // Create a new instance of PlanningMdRepo
    pub fn new(vault_root: &Path) -> Result<Self, ApiError> {
        let repo = Self {
            vault_root: vault_root.to_path_buf(),
            task_locks: Mutex::new(HashMap::new()),
        };
        
        repo.ensure_directories()?;
        
        Ok(repo)
    }
    
    // Ensure the required directories exist
    fn ensure_directories(&self) -> Result<(), ApiError> {
        // Ensure .planning directory exists
        let planning_dir = self.vault_root.join(PLANNING_DIR);
        path_policy::ensure_or_create_dir_in_vault(&self.vault_root, &planning_dir)?;
        
        // Ensure tasks directory exists
        let tasks_dir = planning_dir.join(TASKS_DIR);
        path_policy::ensure_or_create_dir_in_vault(&self.vault_root, &tasks_dir)?;
        
        // Ensure daily directory exists
        let daily_dir = planning_dir.join(DAILY_DIR);
        path_policy::ensure_or_create_dir_in_vault(&self.vault_root, &daily_dir)?;
        
        Ok(())
    }
    
    // Get the path for a task markdown file
    fn get_task_md_path(&self, task_id: &str) -> Result<PathBuf, ApiError> {
        let md_filename = format!("{}.md", task_id);
        let md_path = self.vault_root.join(PLANNING_DIR).join(TASKS_DIR).join(md_filename);
        
        // Check if the path is within the vault without requiring the file to exist
        if !md_path.starts_with(&self.vault_root) {
            return Err(ApiError {
                code: "PathOutsideVault".to_string(),
                message: "Task note path is outside vault".to_string(),
                details: Some(serde_json::json!({ "path": md_path.to_string_lossy().to_string() })),
            });
        }
        
        Ok(md_path)
    }
    
    // Get the path for a daily log markdown file
    fn get_daily_md_path(&self, day: &str) -> Result<PathBuf, ApiError> {
        let md_filename = format!("{}.md", day);
        let md_path = self.vault_root.join(PLANNING_DIR).join(DAILY_DIR).join(md_filename);
        
        // Check if the path is within the vault without requiring the file to exist
        if !md_path.starts_with(&self.vault_root) {
            return Err(ApiError {
                code: "PathOutsideVault".to_string(),
                message: "Daily log path is outside vault".to_string(),
                details: Some(serde_json::json!({ "path": md_path.to_string_lossy().to_string() })),
            });
        }
        
        Ok(md_path)
    }
    
    // Parse frontmatter from markdown content
    fn parse_frontmatter(&self, content: &str) -> (Option<HashMap<String, String>>, String) {
        if !content.starts_with("---") {
            return (None, content.to_string());
        }
        
        // Find the end of frontmatter block
        if let Some(end_idx) = content[3..].find("---") {
            // Extract frontmatter content
            let frontmatter_content = &content[3..(end_idx + 3)];
            // Extract content after frontmatter
            let content_after = content[(end_idx + 6)..].trim_start().to_string();
            
            // Parse frontmatter lines
            let mut frontmatter = HashMap::new();
            for line in frontmatter_content.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                
                if let Some((key, value)) = line.split_once(':') {
                    let key = key.trim();
                    let value = value.trim();
                    frontmatter.insert(key.to_string(), value.to_string());
                }
            }
            
            (Some(frontmatter), content_after)
        } else {
            // Malformed frontmatter, return as content
            (None, content.to_string())
        }
    }
    
    // Generate frontmatter from a hashmap
    fn generate_frontmatter(&self, frontmatter: &HashMap<String, String>) -> String {
        let mut lines = vec!["---".to_string()];
        
        // Always include version first
        lines.push(format!("fm_version: {}", FRONTMATTER_VERSION));
        
        // Add other fields in order
        for field in SYSTEM_FIELDS {
            if *field != "fm_version" && frontmatter.contains_key(*field) {
                let value = frontmatter.get(*field).unwrap();
                lines.push(format!("{}: {}", field, value));
            }
        }
        
        lines.push("---".to_string());
        lines.push("".to_string());
        
        lines.join("\n")
    }
    
    // Update only the frontmatter section of a task markdown file
    pub fn update_task_frontmatter(&self, task_id: &str, frontmatter_updates: &HashMap<String, String>) -> Result<(), ApiError> {
        // Get or create a lock for this task
        let mut task_locks = self.task_locks.lock().map_err(|_| ApiError {
            code: "LockError".to_string(),
            message: "Failed to acquire task lock".to_string(),
            details: None,
        })?;
        
        let task_lock = task_locks
            .entry(task_id.to_string())
            .or_insert_with(|| Mutex::new(()));
        
        // Lock this task's update
        let _task_lock_guard = task_lock.lock().map_err(|_| ApiError {
            code: "LockError".to_string(),
            message: "Failed to acquire task lock".to_string(),
            details: None,
        })?;
        
        let md_path = self.get_task_md_path(task_id)?;
        
        // Read current content
        let current_content = if md_path.exists() {
            fs::read_to_string(&md_path).map_err(|e| ApiError {
                code: "FileReadError".to_string(),
                message: format!("Failed to read task markdown file: {}", e),
                details: None,
            })?
        } else {
            // File doesn't exist, no need to update
            return Ok(());
        };
        
        // Parse existing frontmatter
        let (existing_frontmatter, content_after) = self.parse_frontmatter(&current_content);
        
        // Merge updates with existing frontmatter
        let mut merged_frontmatter = existing_frontmatter.unwrap_or_default();
        
        // Only update system fields
        for (key, value) in frontmatter_updates {
            if SYSTEM_FIELDS.contains(&key.as_str()) {
                merged_frontmatter.insert(key.clone(), value.clone());
            }
        }
        
        // Ensure version is set
        merged_frontmatter.insert("fm_version".to_string(), FRONTMATTER_VERSION.to_string());
        
        // Generate new frontmatter
        let new_frontmatter = self.generate_frontmatter(&merged_frontmatter);
        
        // Combine into full content
        let full_content = format!("{}{}", new_frontmatter, content_after);
        
        // Atomic write: write to temp file first, then rename
        let temp_path = md_path.with_extension(".tmp");
        
        // Write to temp file
        let mut temp_file = File::create(&temp_path).map_err(|e| ApiError {
            code: "FileWriteError".to_string(),
            message: format!("Failed to write temp file: {}", e),
            details: None,
        })?;
        
        temp_file.write_all(full_content.as_bytes()).map_err(|e| ApiError {
            code: "FileWriteError".to_string(),
            message: format!("Failed to write temp file content: {}", e),
            details: None,
        })?;
        
        // Flush and sync to disk
        temp_file.flush().map_err(|e| ApiError {
            code: "FileWriteError".to_string(),
            message: format!("Failed to flush temp file: {}", e),
            details: None,
        })?;
        
        // Atomic rename
        fs::rename(&temp_path, &md_path).map_err(|e| ApiError {
            code: "FileRenameError".to_string(),
            message: format!("Failed to rename temp file: {}", e),
            details: None,
        })?;
        
        Ok(())
    }
    
    // Create or update a task markdown file with proper frontmatter
    pub fn upsert_task_md(&self, task_id: &str, title: &str, content: &str) -> Result<PathBuf, ApiError> {
        let md_path = self.get_task_md_path(task_id)?;
        
        // Get or create a lock for this task
        let mut task_locks = self.task_locks.lock().map_err(|_| ApiError {
            code: "LockError".to_string(),
            message: "Failed to acquire task lock".to_string(),
            details: None,
        })?;
        
        let task_lock = task_locks
            .entry(task_id.to_string())
            .or_insert_with(|| Mutex::new(()));
        
        // Lock this task's update
        let _task_lock_guard = task_lock.lock().map_err(|_| ApiError {
            code: "LockError".to_string(),
            message: "Failed to acquire task lock".to_string(),
            details: None,
        })?;
        
        // Check if content already has frontmatter
        let (existing_frontmatter, content_without_frontmatter) = self.parse_frontmatter(content);
        
        // Create or merge frontmatter
        let mut frontmatter = existing_frontmatter.unwrap_or_default();
        frontmatter.insert("id".to_string(), task_id.to_string());
        frontmatter.insert("title".to_string(), title.to_string());
        frontmatter.insert("fm_version".to_string(), FRONTMATTER_VERSION.to_string());
        
        // Generate frontmatter
        let frontmatter_str = self.generate_frontmatter(&frontmatter);
        
        // Combine frontmatter and content
        let full_content = format!("{}{}", frontmatter_str, content_without_frontmatter);
        
        // Atomic write: write to temp file first, then rename
        let temp_path = md_path.with_extension(".tmp");
        
        // Write to temp file
        let mut temp_file = File::create(&temp_path).map_err(|e| ApiError {
            code: "FileWriteError".to_string(),
            message: format!("Failed to write temp file: {}", e),
            details: None,
        })?;
        
        temp_file.write_all(full_content.as_bytes()).map_err(|e| ApiError {
            code: "FileWriteError".to_string(),
            message: format!("Failed to write temp file content: {}", e),
            details: None,
        })?;
        
        // Flush and sync to disk
        temp_file.flush().map_err(|e| ApiError {
            code: "FileWriteError".to_string(),
            message: format!("Failed to flush temp file: {}", e),
            details: None,
        })?;
        
        // Atomic rename
        fs::rename(&temp_path, &md_path).map_err(|e| ApiError {
            code: "FileRenameError".to_string(),
            message: format!("Failed to rename temp file: {}", e),
            details: None,
        })?;
        
        Ok(md_path)
    }
    
    // Read a task markdown file
    pub fn read_task_md(&self, task_id: &str) -> Result<String, ApiError> {
        let md_path = self.get_task_md_path(task_id)?;
        
        // Check if file exists
        if !md_path.exists() {
            return Ok(String::new());
        }
        
        // Read file content
        let content = fs::read_to_string(&md_path).map_err(|e| ApiError {
            code: "FileReadError".to_string(),
            message: format!("Failed to read task markdown file: {}", e),
            details: None,
        })?;
        
        Ok(content)
    }
    
    // Delete a task markdown file
    #[allow(dead_code)]
    pub fn delete_task_md(&self, task_id: &str) -> Result<(), ApiError> {
        let md_path = self.get_task_md_path(task_id)?;
        
        // Check if file exists
        if md_path.exists() {
            // Delete file
            fs::remove_file(&md_path).map_err(|e| ApiError {
                code: "FileDeleteError".to_string(),
                message: format!("Failed to delete task markdown file: {}", e),
                details: None,
            })?;
        }
        
        Ok(())
    }
    
    // Create or update a daily log markdown file
    pub fn upsert_daily_md(&self, day: &str, content: &str) -> Result<PathBuf, ApiError> {
        let md_path = self.get_daily_md_path(day)?;
        
        // Create frontmatter
        let frontmatter = format!(
            "---\nday: {}\n---\n\n",
            day
        );
        
        // Combine frontmatter and content
        let full_content = format!("{}{}", frontmatter, content);
        
        // Write to file
        fs::write(&md_path, full_content).map_err(|e| ApiError {
            code: "FileWriteError".to_string(),
            message: format!("Failed to write daily log markdown file: {}", e),
            details: None,
        })?;
        
        Ok(md_path)
    }
    
    // Read a daily log markdown file
    pub fn read_daily_md(&self, day: &str) -> Result<String, ApiError> {
        let md_path = self.get_daily_md_path(day)?;
        
        // Check if file exists
        if !md_path.exists() {
            // Return default content if file doesn't exist
            return Ok(format!(
                "---\nday: {}\n---\n\n# {}\n\n## 今日完成\n\n- \n\n## 明日计划\n\n- \n\n## 反思与总结\n\n",
                day, day
            ));
        }
        
        // Read file content
        let content = fs::read_to_string(&md_path).map_err(|e| ApiError {
            code: "FileReadError".to_string(),
            message: format!("Failed to read daily log markdown file: {}", e),
            details: None,
        })?;
        
        Ok(content)
    }
    
    // Get the relative path for a task markdown file
    pub fn get_task_md_relative_path(&self, task_id: &str) -> String {
        format!("{}/{}/{}.md", PLANNING_DIR, TASKS_DIR, task_id)
    }
    
    // Get the relative path for a daily log markdown file
    pub fn get_daily_md_relative_path(&self, day: &str) -> String {
        format!("{}/{}/{}.md", PLANNING_DIR, DAILY_DIR, day)
    }
}
