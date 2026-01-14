# S1-5 错误码映射到弹窗UX优化实现计划

## 目标
创建失败时用户知道怎么处理，覆盖以下错误场景：
- VaultNotSelected：提示并引导去选择 Vault
- DbBusy：提示“稍后重试”+ 重试按钮（同一弹窗内）
- InvalidParameter：表单字段提示

## 实现步骤

### 1. 统一错误解析机制
- 在 `planning.api.ts` 中添加 `normalizeError` 函数，统一解析API错误
- 确保所有API调用返回规范化的 `ApiError` 结构：`{ code: string; message: string; fieldErrors?: Record<string,string> }`
- 区分业务错误（Envelope error）和异常（invoke失败/序列化失败）

### 2. 优化 TaskCreateModal.tsx 错误处理逻辑
- 添加 `apiError` 状态，区分前端验证错误和API错误
- 修改 `handleSubmit` 函数，使用统一的错误解析
- 保存 `lastSubmitInput`，用于重试机制
- 实现三段式结构：`submit()` → `normalizeError()` → `renderError()`

### 3. 实现错误类型对应的UI处理
- **VaultNotSelected**：显示提示信息，添加“去选择Vault”按钮
- **DbBusy**：显示“稍后重试”提示，添加重试按钮，基于 `lastSubmitInput` 重试
- **InvalidParameter**：
  - 若返回 `fieldErrors`，按字段显示
  - 否则显示在弹窗顶部通用错误区域
- 其他错误：显示在弹窗顶部通用错误区域

### 4. 增强错误状态管理
- 使用统一的顶部错误条展示API错误
- 字段级错误直接显示在对应表单字段下方
- 复用现有的错误样式，避免UI风格漂移

### 5. 添加重试机制
- 为 `DbBusy` 错误实现重试按钮功能
- 重试时使用 `lastSubmitInput`，且受 `isSubmitting` 保护
- 确保重试操作串行执行，避免并发问题

### 6. 测试验证
- **VaultNotSelected**：不选Vault点击创建，验证错误提示和引导按钮
- **DbBusy**：模拟并发写入，验证重试机制
- **InvalidParameter**：测试title为空/超长，验证字段错误提示
- 确保弹窗在错误发生时保持打开状态

## 代码修改点

1. **src/features/planning/planning.api.ts**：
   - 添加 `normalizeError` 函数，统一解析API错误
   - 确保所有API调用返回规范化的错误结构

2. **src/features/task-create/TaskCreateModal.tsx**：
   - 添加 `apiError` 和 `lastSubmitInput` 状态管理
   - 实现三段式错误处理结构
   - 根据错误码显示不同的错误信息和UI
   - 为DbBusy错误添加基于 `lastSubmitInput` 的重试按钮
   - 为VaultNotSelected错误添加“去选择Vault”按钮

3. **src/features/task-create/taskCreateModal.css**：
   - 复用现有错误样式
   - 仅添加必要的新样式（如错误条、重试按钮）

## 验收标准
- 人为制造错误时，弹窗不会关闭，提示明确
- VaultNotSelected错误显示引导信息和明确的动作入口
- DbBusy错误显示重试按钮，重试基于上一次提交的payload
- InvalidParameter错误根据类型显示在对应位置
- 所有错误处理遵循统一的模式，代码可复用

## 实现注意事项
- 保持代码的可维护性和扩展性
- 遵循现有的代码风格和架构
- 确保错误处理逻辑不影响正常的任务创建流程
- 提供清晰、友好的用户提示信息
- 限制新增CSS样式数量，复用现有样式
- 确保重试机制安全可靠，避免并发问题