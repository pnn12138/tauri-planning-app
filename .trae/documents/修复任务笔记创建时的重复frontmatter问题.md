## 问题分析
在 `planning_service.rs` 的 `open_task_note` 函数中，当任务笔记文件为空时，会创建一个带有完整 frontmatter 的模板，然后将该模板传递给 `upsert_task_md` 函数。但 `upsert_task_md` 函数本身会在内容前面添加自己的 frontmatter，导致最终生成的文件有两个 frontmatter 块，破坏了标准的 frontmatter 解析。

## 解决方案
根据用户建议，采用双重修复策略：

### 1. 修复当前模板问题
修改 `planning_service.rs` 中的模板，移除其中的 frontmatter 部分，只保留正文内容。这样 `upsert_task_md` 函数添加的 frontmatter 就会是唯一的。

### 2. 添加长期稳健的兜底逻辑
在 `upsert_task_md` 函数中添加检查：如果传入的内容已经包含开头的 frontmatter 块，则替换它而不是再次追加，这样既能修复历史文件，也能防止未来其他入口再次引入重复 frontmatter。

## 实现步骤

### 步骤1：修改模板，移除frontmatter
- 打开 `src-tauri/src/services/planning_service.rs` 文件
- 定位到 `open_task_note` 函数中的模板创建代码（第 389-399 行）
- 修改模板，移除 frontmatter 部分，只保留正文内容

### 步骤2：在upsert_task_md中添加兜底逻辑
- 打开 `src-tauri/src/repo/planning_md_repo.rs` 文件
- 定位到 `upsert_task_md` 函数（第 80-100 行）
- 添加逻辑：检查传入的内容是否以 `---` 开头且包含 frontmatter 块
- 如果包含，则替换现有的 frontmatter 为新生成的 frontmatter；否则，正常追加

## 修改前后对比

### 步骤1：修改模板
#### 修改前
```rust
let template = format!(
    "---\ntask_id: \"{}\"\ntitle: \"{}\"\nstatus: \"{}\"\ncreated_at: \"{}\"\nscheduled_start: {}\n---\n\n# {}\n\n- Status: {}\n- Scheduled: {}\n",
    task.id,
    task.title,
    task.status,
    task.created_at,
    scheduled_start_str,
    task.title,
    task.status,
    task.scheduled_start.as_ref().map_or("", |s| s)
);
```

#### 修改后
```rust
let template = format!(
    "# {}\n\n- Status: {}\n- Scheduled: {}\n",
    task.title,
    task.status,
    task.scheduled_start.as_ref().map_or("", |s| s)
);
```

### 步骤2：添加兜底逻辑
#### 修改前
```rust
// Create frontmatter
let frontmatter = format!(
    "---\nid: {}\ntitle: {}\n---\n\n",
    task_id, title
);

// Combine frontmatter and content
let full_content = format!("{}{}", frontmatter, content);
```

#### 修改后
```rust
// Create frontmatter
let frontmatter = format!(
    "---\nid: {}\ntitle: {}\n---\n\n",
    task_id, title
);

// Check if content already has frontmatter
let content_without_frontmatter = if content.starts_with("---") {
    // Find the end of frontmatter block
    if let Some(end_idx) = content[3..].find("---") {
        // Extract content after frontmatter
        content[(end_idx + 6)..].trim_start().to_string()
    } else {
        // Malformed frontmatter, use full content
        content.to_string()
    }
} else {
    content.to_string()
};

// Combine frontmatter and content
let full_content = format!("{}{}", frontmatter, content_without_frontmatter);
```

## 预期效果
1. 修复后，新创建的任务笔记文件将只包含一个由 `upsert_task_md` 函数添加的 frontmatter 块
2. 如果未来有其他入口传入带有 frontmatter 的内容，`upsert_task_md` 函数会自动处理，避免重复
3. 职责边界清晰：service 负责内容生成，repo 负责元数据封装
4. 显著降低笔记格式被写坏的概率