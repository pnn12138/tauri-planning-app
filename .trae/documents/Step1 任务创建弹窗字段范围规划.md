# Step1 任务创建弹窗字段范围规划

## 目标
将任务创建弹窗的字段范围冻结，明确Step1实现的字段，避免范围膨胀，确保工程化实施。

## 当前实现分析
- **当前存在的字段**：title、description、status、priority、tags、dueDate、estimateMin
- **字段映射**：dueDate 对应需求中的 scheduled_start

## Step1 硬规则
1. **status 取值限制**：只允许 backlog/todo/done，不允许 doing（doing 只能通过 start 操作进入）
2. **scheduled_start 规则**：
   - UI 只支持日期选择（YYYY-MM-DD）
   - 时间默认为 09:00
   - 后端存储为完整 ISO 字符串
3. **payload 极简原则**：只传递 { title, status, scheduled_start? }，其他字段不出现在请求中
4. **类型安全**：使用 Step1 专用类型，避免类型污染

## Step1 实现字段（必填+可选）
1. **title**：任务标题（必填）
2. **status**：所属看板（必填，值为 backlog/todo/done）
3. **scheduled_start**：加入日程（可选，日期格式，默认时间 09:00）

## Step1 排除字段
1. **description**：任务描述
2. **priority**：优先级
3. **tags**：标签
4. **estimateMin**：预计时间
5. **任何其他未明确提及的字段**

## 实现方案

### 1. 更新类型定义
- 新增 `TaskCreateDraftStep1` 类型，只包含 Step1 需要的字段
- 保留完整 `TaskDraft` 类型供 Step2 使用
- 更新 `CreateTaskInput` 类型，明确 Step1 字段

### 2. 修改 TaskCreateModal.tsx
- **UI 组件调整**：
  - 只保留：任务标题输入框、所属看板选择器、加入日程日期选择器
  - 完全移除：任务描述文本框、优先级选择器、标签输入区域、预计时间输入框
- **status 选择器调整**：
  - 移除或禁用 "doing" 选项
  - 设置默认值为 "todo"
- **UX 优化**：
  - title 字段自动聚焦
  - Enter 键可提交表单（当 title 非空且不在提交中）
  - 提交按钮显示加载状态

### 3. 更新 toCreateTaskInput 函数
- 确保只传递 Step1 需要的字段：title、status、scheduled_start（如已选择）
- 其他字段完全不进入 payload
- scheduled_start 格式化为完整 ISO 字符串（日期 + 09:00:00）

### 4. 保持后端兼容性
- 确认后端 create_task 接口对缺失字段有合理默认值
- 确保数据库 schema 对隐藏字段允许 NULL 或不存储

## 类型定义更新
```typescript
// Step1 专用类型
export type TaskCreateDraftStep1 = {
  title: string;
  status: 'backlog' | 'todo' | 'done';
  scheduledDate?: string; // YYYY-MM-DD 格式
};

// 转换为 API 输入（仅 Step1 字段）
export const toCreateTaskInputStep1 = (draft: TaskCreateDraftStep1): CreateTaskInput => {
  const result: CreateTaskInput = {
    title: draft.title,
    status: draft.status,
  };
  
  // 只有当选择了日期时才添加 scheduled_start
  if (draft.scheduledDate) {
    result.scheduled_start = `${draft.scheduledDate}T09:00:00.000Z`;
  }
  
  return result;
};
```

## 验收标准
1. **UI 展示**：弹窗中只显示 Step1 需要的 3 个字段
2. **status 限制**：所属看板选择器中没有 "doing" 选项，或该选项被禁用
3. **payload 纯净**：API 请求只包含 { title, status, scheduled_start? }，无其他字段
4. **类型安全**：使用 Step1 专用类型，确保编译时类型检查
5. **后端兼容**：后端成功处理请求，不产生 DB 约束错误
6. **UX 友好**：title 自动聚焦，Enter 键可提交，提交状态清晰

## 实现步骤
1. 更新类型定义，新增 Step1 专用类型
2. 修改 TaskCreateModal.tsx，移除不需要的 UI 组件
3. 调整 status 选择器，移除/禁用 "doing" 选项
4. 更新 toCreateTaskInput 函数，只传递必要字段
5. 实现 UX 优化（自动聚焦、Enter 提交、加载状态）
6. 测试 API 请求，确保 payload 纯净
7. 验证后端兼容性

## 预期效果
弹窗界面简洁，只包含核心字段，用户体验流畅，API 请求纯净，为后续 Step2 扩展做好准备。