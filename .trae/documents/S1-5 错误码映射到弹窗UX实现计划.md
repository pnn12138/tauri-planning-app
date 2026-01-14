# S1-5 错误码映射到弹窗UX实现计划

## 目标

创建失败时用户知道怎么处理，覆盖以下错误场景：

* VaultNotSelected：提示并引导去选择 Vault

* DbBusy：提示“稍后重试”+ 重试按钮（同一弹窗内）

* InvalidParameter：表单字段提示

## 实现步骤

### 1. 修改 TaskCreateModal.tsx 错误处理逻辑

* 更新 `handleSubmit` 函数，捕获API调用错误

* 根据错误码显示不同的错误信息

* 确保弹窗在错误发生时不关闭，保持表单状态

### 2. 实现错误类型对应的UI处理

* **VaultNotSelected**：显示提示信息，引导用户去选择Vault

* **DbBusy**：显示“稍后重试”提示，添加重试按钮

* **InvalidParameter**：将错误信息映射到对应的表单字段

* 其他错误：显示通用错误信息

### 3. 增强错误状态管理

* 在组件中添加 `apiError` 状态，区分前端验证错误和API错误

* 为不同类型的错误添加对应的CSS样式

### 4. 添加重试机制

* 为 `DbBusy` 错误实现重试按钮功能

* 点击重试按钮时重新执行表单提交逻辑

### 5. 测试验证

* 验证VaultNotSelected错误处理

* 验证DbBusy错误处理和重试功能

* 验证InvalidParameter错误处理

* 确保弹窗在错误发生时保持打开状态

## 代码修改点

1. **src/features/task-create/TaskCreateModal.tsx**：

   * 添加 `apiError` 状态管理

   * 修改 `handleSubmit` 函数，添加错误捕获和处理逻辑

   * 根据错误码显示不同的错误信息和UI

   * 为DbBusy错误添加重试按钮

2. **src/features/task-create/taskCreateModal.css**：

   * 添加不同类型错误的CSS样式

   * 为重试按钮添加样式

## 验收标准

* 人为制造错误（例如不选Vault）时，弹窗不会关闭，提示明确

* VaultNotSelected错误显示引导信息

* DbBusy错误显示重试按钮

* InvalidParameter错误显示在对应表单字段

* 错误处理不影响其他功能

## 实现注意事项

* 保持代码的可维护性和扩展性

* 遵循现有的代码风格和架构

* 确保错误处理逻辑不影响正常的任务创建流程

* 提供清晰、友好的用户提示信息

