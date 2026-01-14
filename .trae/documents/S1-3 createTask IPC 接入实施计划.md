# S1-3 createTask IPC 接入实施计划

## 目标
实现新建任务弹窗与后端IPC的完整集成，确保任务能真实写入SQLite数据库，并在前端正确显示。

## 实施内容

### 1. 前端类型与转换逻辑优化
- **文件**: `src/features/task-create/taskCreateModal.types.ts`
  - 明确 `scheduledDate` 到 `scheduled_start` 的转换规则：若UI只选日期，则 `scheduled_start` = `YYYY-MM-DDT09:00:00.000Z`
  - 确保 `toCreateTaskInputStep1` 函数返回的类型与后端 `CreateTaskInput` 完全匹配

### 2. 前端组件与IPC集成
- **文件**: `src/features/task-create/TaskCreateModal.tsx`
  - 确保 `isSubmitting` 状态统一使用modal内局部状态，避免与store状态冲突
  - 优化 `handleSubmit` 函数：调用 `planningCreateTask`，成功后关闭弹窗并触发 `onCreated`，失败则保留弹窗并显示错误信息
  - 添加防重复提交逻辑：通过 `isSubmitting` 状态禁用按钮，防止连点

### 3. 前端store与UI更新策略
- **文件**: `src/features/planning/planning.store.ts`
  - 确保 `createTask` 函数调用成功后，先执行局部插入，再触发 `reloadTodayData` 作为兜底刷新
  - 优化 `reloadTodayData` 函数，确保数据更新后UI能及时响应

### 4. 后端IPC命令优化
- **文件**: `src-tauri/src/commands/planning_cmd.rs`
  - 修改 `planning_create_task` 命令，返回完整的 `Task` 对象，包含 `id`、`status`、`order_index`、`scheduled_start`、`created_at` 等必要字段
  - 确保命令正确处理并返回各种错误类型：`VaultNotSelected`、`DbBusy`、`InvalidParameter`、`InternalError` 等

### 5. 服务层与数据层优化
- **文件**: `src-tauri/src/services/planning_service.rs`
  - 修改 `create_task` 方法，移除Markdown文件创建逻辑，将其移至后续Step2实现
  - 确保 `create_task` 方法能正确处理 `scheduled_start` 字段，无论其是否为空

## 测试要点

1. **功能测试**
   - 打开新建任务弹窗，输入标题，选择状态，点击"确认创建"
   - 验证按钮显示"创建中..."状态且不可重复点击
   - 验证任务创建成功后弹窗关闭
   - 验证对应看板列出现新任务（1秒内可见）

2. **数据一致性测试**
   - 创建带有计划日期的任务，验证任务在时间线中正确显示
   - 创建不带计划日期的任务，验证任务不在时间线中显示
   - 重启应用，验证所有任务仍然存在

3. **错误处理测试**
   - 测试在未选择工作目录时创建任务，验证返回 `VaultNotSelected` 错误且弹窗不关闭
   - 测试输入无效参数的情况，验证返回 `InvalidParameter` 错误

4. **性能测试**
   - 连续创建多个任务，验证系统响应流畅
   - 验证兜底刷新机制不会导致UI闪烁或数据错乱

## 验收标准

✅ 点击"确认创建"后按钮进入loading状态，且不可重复提交
✅ `planning_create_task` 返回完整Task对象（含id/status/order_index/created_at）
✅ 创建成功：弹窗关闭；Home中对应列出现新任务（1秒内可见，且refresh后排序不乱）
✅ 创建带scheduled_start（今天）：timeline可见；不带：timeline不出现
✅ 重启应用：任务仍存在（持久化）
✅ Vault未选择：返回VaultNotSelected，弹窗不关闭并给出引导提示

## 依赖与约束

- 前端已完成S1-1和S1-2的实现
- 后端数据库和服务层已完成，且支持：
  - `scheduled_start` 字段可为空
  - `status` 字段不允许为 "doing"（仅通过start_task命令设置）
  - `create_task` 命令不生成Markdown文件
- SQLite数据库已正确配置

## 实施顺序

1. 前端类型转换逻辑优化
2. 前端组件与IPC集成
3. 前端store与UI更新策略实现
4. 后端IPC命令优化
5. 服务层与数据层优化
6. 功能测试与验证
7. 边界情况和错误处理测试
8. 性能测试

## 风险与应对

- **风险1**: 局部插入与兜底刷新可能导致数据冲突
  **应对**: 确保局部插入时使用唯一ID，兜底刷新时忽略重复数据
- **风险2**: 错误处理不完整导致用户体验不佳
  **应对**: 为每种可能的错误类型提供友好的错误提示
- **风险3**: 类型不匹配导致IPC调用失败
  **应对**: 严格验证前后端类型定义，确保完全匹配

## 交付物

- 优化后的 `taskCreateModal.types.ts`
- 优化后的 `TaskCreateModal.tsx`
- 优化后的 `planning.store.ts`
- 优化后的后端 `planning_cmd.rs` 和 `planning_service.rs`
- 完整的功能测试报告