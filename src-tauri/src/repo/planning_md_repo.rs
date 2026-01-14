use std::fs;
use std::path::{Path, PathBuf};

use crate::ipc::ApiError;
use crate::security::path_policy;

const PLANNING_DIR: &str = ".planning";
const TASKS_DIR: &str = "tasks";
const DAILY_DIR: &str = "daily";

// Markdown repository for planning data
pub struct PlanningMdRepo {
    vault_root: PathBuf,
}

impl PlanningMdRepo {
    // Create a new instance of PlanningMdRepo
    pub fn new(vault_root: &Path) -> Result<Self, ApiError> {
        let repo = Self {
            vault_root: vault_root.to_path_buf(),
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
    
    // Create or update a task markdown file
    pub fn upsert_task_md(&self, task_id: &str, title: &str, content: &str) -> Result<PathBuf, ApiError> {
        let md_path = self.get_task_md_path(task_id)?;
        
        // Create frontmatter
        let frontmatter = format!(
            "---\nid: {}\ntitle: {}\n---\n\n",
            task_id, title
        );
        
        // Combine frontmatter and content
        let full_content = format!("{}{}", frontmatter, content);
        
        // Write to file
        fs::write(&md_path, full_content).map_err(|e| ApiError {
            code: "FileWriteError".to_string(),
            message: format!("Failed to write task markdown file: {}", e),
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
