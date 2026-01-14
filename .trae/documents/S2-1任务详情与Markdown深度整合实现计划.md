# S2-1 任务详情与 Markdown 深度整合实现计划

## 1. 概述

本计划旨在实现任务详情与Markdown深度整合，包括从任务卡片打开Task Note和创建任务时自动创建task note功能，遵循用户反馈的最佳实践。

## 2. 实现步骤

### 2.1 S2-1.1 从任务卡片打开 Task Note（懒创建）

**目标**：点击任务卡片 → 打开 `.planning/tasks/<taskId>.md`（不存在则创建）

**实现方案**：

1. **后端实现**：

   * 在 `src-tauri/src/commands/planning_cmd.rs` 中新增 `planning_open_task_note` 命令

   * 该命令调用 `PlanningService` 的 `open_task_note` 方法

   * `open_task_note` 方法使用 `PlanningMdRepo` 确保任务Markdown文件存在（懒创建）并返回相对路径

2. **前端实现**：

   * 在 `Home.tsx` 的 `renderTaskCard` 函数中添加点击事件处理

   * 点击任务卡片空白区域时调用 `planning_open_task_note` IPC命令

   * Start/Stop等按钮添加 `stopPropagation()` 避免冲突

   * 处理返回的相对Markdown文件路径，使用现有机制打开文件

**文件修改**：

* `src-tauri/src/commands/planning_cmd.rs`：新增 `planning_open_task_note` 命令

* `src-tauri/src/services/planning_service.rs`：新增 `open_task_note` 方法

* `src/features/planning/planning.api.ts`：添加前端API调用

* `src/Home.tsx`：修改 `renderTaskCard` 添加点击事件和按钮 `stopPropagation()`

### 2.2 S2-1.2 创建任务时可选"自动创建 task note"（可选增强）

**目标**：新建任务后自动生成task note（可配置，不修改核心DTO）

**实现方案**：

1. **前端实现**：

   * 在 `TaskCreateModal.tsx` 中添加"自动创建task note"的复选框

   * 提交创建任务请求，成功后如果勾选了复选框，则额外调用 `planning_open_task_note(taskId)`

   * 这样可以确保任务创建和note创建是两个独立的操作，避免复合事务

**文件修改**：

* `src/features/task-create/TaskCreateModal.tsx`：添加复选框UI和创建后调用逻辑

## 3. 技术细节

### 3.1 IPC命令设计

```rust
// 新增命令[tauri::command]
pub async fn planning_open_task_note(
    task_id: String,
    vault_state: State<'_, VaultState>,
    app_handle: AppHandle,
) -> Result<ApiResponse<OpenTaskNoteResponse>, ApiError> {
    // 实现逻辑：
    // 1. 验证vault已选择
    // 2. 获取任务信息
    // 3. 懒创建任务Markdown文件（如果不存在）
    // 4. 返回相对路径
}
```

### 3.2 数据结构设计

```rust
// OpenTaskNoteResponse[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenTaskNoteResponse {
    pub md_path: String, // vault相对路径，如 ".planning/tasks/123.md"
}
```

### 3.3 Markdown文件模板

```markdown
---
task_id: "<id>"
title: "<title>"
status: "<status>"
created_at: "<iso8601>"
scheduled_start: "<iso8601|null>"
---

# <title>

- Status: <status>
- Scheduled: <scheduled_start>
```

## 4. 关键约束与规范

### 4.1 路径规则

* **单一事实源**：任务Markdown文件路径固定为 `.planning/tasks/<taskId>.md`

* **相对路径**：所有返回的文件路径均为vault相对路径

* **安全校验**：所有文件操作必须通过现有path policy/security层校验

### 4.2 幂等性

* `planning_open_task_note` 命令具有幂等性：如果文件已存在，不会覆盖内容

### 4.3 错误处理

* **VaultNotSelected**：当vault未选择时，返回明确错误码，前端引导用户选择

* **PathOutsideVault**：确保所有操作都在vault范围内

### 4.4 交互规则

* **卡片点击**：空白区域点击打开note

* **按钮操作**：Start/Stop等按钮添加 `stopPropagation()`，只执行自身操作

## 5. 验收标准

### 5.1 S2-1.1 从任务卡片打开 Task Note

* [ ] 点击任务卡片空白区域可以打开对应的Markdown文件

* [ ] 如果Markdown文件不存在，自动创建（懒创建）

* [ ] 文件路径为 `.planning/tasks/<taskId>.md`（相对路径）

* [ ] 已存在note时，调用 `open_task_note` 不会覆盖内容

* [ ] Start/Stop等按钮点击不会触发打开note

* [ ] Vault未选择时，返回明确错误，前端正常处理

### 5.2 S2-1.2 创建任务时可选"自动创建 task note"（增强）

* [ ] 任务创建模态框中有"自动创建task note"的复选框

* [ ] 创建任务后，如果勾选了复选框，则自动打开并创建对应的Markdown文件

* [ ] 不影响原有任务创建流程的稳定性

## 6. 依赖关系

* 依赖现有的规划系统架构

* 依赖现有的Markdown文件处理机制

* 依赖现有的IPC通信框架

## 7. 风险评估

* 低风险：功能相对独立，不影响核心流程

* 注意事项：确保文件路径处理正确，避免越权访问

## 8. 实施顺序

1. 首先实现S2-1.1：从任务卡片打开Task Note（懒创建）

2. 验证稳定后，再考虑实现S2-1.2：创建任务时自动创建note（可选增强）

3. 确保每一步都通过验收标准验证

## 9. 代码规范

* 遵循现有代码结构和命名规范

* 确保错误处理完整

* 添加适当的日志记录

* 确保前后端类型定义一致

* 所有文件操作必须通过安全层校验

