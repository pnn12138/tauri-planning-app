# 修复删除任务功能和UI居中问题

## 问题分析
1. **删除任务功能失败**：
   - 出现两个错误提示："Command planning_delete_task not found" 和 "删除任务失败: undefined"
   - 虽然后端代码中已实现 `planning_delete_task` 命令，但前端调用时找不到该命令
   - 错误处理逻辑可能导致重复显示错误提示

2. **UI居中问题**：
   - 任务编辑界面没有在屏幕中央显示
   - 删除确认提示没有在编辑界面中央显示，而是显示在屏幕顶部

## 解决方案

### 1. 修复删除任务功能

**后端检查**：
- 确认 `planning_delete_task` 命令是否被正确注册到Tauri命令列表
- 检查命令名称拼写是否正确一致

**前端修复**：
- 检查 `planning.api.ts` 中的 `planningDeleteTask` 函数是否正确实现
- 修复 `handleDeleteTask` 函数中的错误处理逻辑，避免重复显示错误提示

### 2. 改进UI设计

**任务编辑界面居中**：
- 修改编辑模态框的CSS样式，使其在屏幕中央显示
- 确保模态框具有正确的定位和层级

**删除确认提示居中**：
- 修改删除确认提示的实现方式，使其在编辑模态框内部居中显示
- 使用更现代的确认对话框组件，而不是默认的 `alert()`

## 具体实现步骤

### 步骤1：检查并修复后端命令注册
- 确认 `src-tauri/src/commands/planning_cmd.rs` 中的 `planning_delete_task` 命令是否被正确注册
- 检查命令名称拼写是否与前端调用一致

### 步骤2：修复前端删除任务逻辑
- 修改 `src/Home.tsx` 中的 `handleDeleteTask` 函数，改进错误处理
- 确保只显示一次错误提示
- 使用更友好的确认对话框替代默认 `confirm()`

### 步骤3：改进编辑模态框样式
- 修改编辑模态框的CSS，使其在屏幕中央显示
- 添加背景遮罩，提升用户体验

### 步骤4：修复删除确认提示
- 将删除确认提示集成到编辑模态框中
- 确保提示在编辑界面中央显示

### 步骤5：测试功能
- 测试删除任务功能是否正常工作
- 验证UI居中效果
- 检查错误提示是否正确显示

## 预期效果
1. 删除任务功能正常工作，不再出现错误
2. 任务编辑界面在屏幕中央显示
3. 删除确认提示在编辑界面中央显示
4. 错误提示清晰明了，只显示一次

## 代码修改点
- `src/Home.tsx`：修改 `handleDeleteTask` 函数和编辑模态框样式
- `src/features/planning/planning.api.ts`：检查 `planningDeleteTask` 函数
- `src-tauri/src/commands/planning_cmd.rs`：确认 `planning_delete_task` 命令注册
- 相关CSS文件：添加或修改模态框居中样式