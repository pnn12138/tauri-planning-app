# Markdown文件处理优化计划（修订版）

## 1. 优化目标

- 改进Markdown文件格式，使用工程化的YAML Frontmatter存储任务属性
- 实现可靠的Markdown更新机制，确保任务属性变更时自动同步
- 优化模板创建逻辑，包含所有重要任务属性
- 确保所有任务操作都能安全同步更新Markdown文件
- 保护用户编辑内容，避免覆盖和冲突

## 2. 优化方案

### 2.1 改进Markdown文件格式

**优化后格式**：
```yaml
---
fm_version: 2
id: task_id
title: 任务标题
status: backlog
priority: p3
tags: [标签1, 标签2]
estimate_min: 60
due_date: 2026-01-17
created_at: 2026-01-17T09:00:00+08:00
updated_at: 2026-01-17T09:30:00+08:00
---

<!-- 
Frontmatter 由系统维护；正文为你的笔记区。
-->

## Notes

- 
```

### 2.2 字段规范

| 字段名 | 类型 | 枚举/格式 | 说明 |
|--------|------|-----------|------|
| fm_version | integer | 2 | 版本号，用于向后兼容 |
| id | string | UUID | 任务唯一标识 |
| title | string | 自由文本 | 任务标题 |
| status | string | backlogtododoingdonearchived | 任务状态 |
| priority | string | p0p1p2p3 | 任务优先级 |
| tags | array | 字符串数组 | 任务标签 |
| estimate_min | integer | 正整数 | 预估时间（分钟） |
| due_date | string | YYYY-MM-DD | 截止日期 |
| created_at | string | RFC3339带时区 | 创建时间 |
| updated_at | string | RFC3339带时区 | 更新时间 |

### 2.3 扩展Frontmatter支持

- 修改 `planning_md_repo.rs` 中的 `upsert_task_md` 函数
- 添加 `update_task_frontmatter` 函数，专门用于更新Frontmatter
- 实现Frontmatter解析、合并和生成逻辑
- 维护系统字段白名单，只更新系统管理的字段

### 2.4 实现可靠的更新机制

#### 2.4.1 分层职责设计

**planning_service.rs**
- 负责业务逻辑：更新任务、变更状态、更新标签等
- 事务提交后调用 `sync_task_to_md(task_id, patch)`

**planning_md_repo.rs**
- 负责文件操作：定位路径、读写、Frontmatter处理、原子写入
- 实现 `sync_task_to_md` 函数，接收变更字段（patch）

#### 2.4.2 合并策略

1. **只改Frontmatter，绝不碰正文**
   - 读取文件
   - 解析Frontmatter（如果没有则创建）
   - 只更新系统字段白名单中的键
   - 保持正文原样，包括用户的空行和Markdown格式

2. **系统字段白名单**：
   - fm_version, id, title, status, priority, tags, estimate_min, due_date, created_at, updated_at

#### 2.4.3 并发与原子性保障

1. **原子写入**：
   - 使用"写临时文件 + rename覆盖"策略
   - 确保文件写入操作的原子性

2. **并发控制**：
   - 对同一task_id的Markdown更新加锁
   - 实现任务级别的更新队列
   - 更新前检查updated_at，减少覆盖冲突概率

#### 2.4.4 冲突处理

1. **检测文件占用**：
   - 检查文件是否被外部占用/锁住
   - 如果文件被占用，标记为"待同步"

2. **重试机制**：
   - 将冲突的更新加入队列
   - 下次打开任务或空闲时重试
   - 记录日志，必要时提示用户

### 2.5 优化模板创建逻辑

1. **改进模板结构**：
   - 使用规范的Frontmatter格式
   - 包含所有重要任务属性
   - 添加注释说明，引导用户编辑
   - 使用null作为默认值

2. **模板创建位置**：
   - 只在 `open_task_note` 函数中创建模板
   - 确保模板创建逻辑符合新格式要求

### 2.6 统一Markdown更新入口

1. **创建 `sync_task_to_md` 函数**：
   - 单一入口，接收task_id和变更字段（patch）
   - 实现完整的更新逻辑
   - 支持部分字段更新

2. **调用时机**：
   - `update_task` 函数中，当属性变更时
   - `mark_task_done` 函数
   - `reopen_task` 函数
   - `start_task` 函数
   - `stop_task` 函数
   - 其他任务属性变更操作

## 3. 实现步骤

### 步骤1：扩展Frontmatter支持

1. 修改 `planning_md_repo.rs`：
   - 添加 `update_task_frontmatter` 函数
   - 实现Frontmatter解析和合并逻辑
   - 实现原子写入操作
   - 添加并发控制机制

2. 修改 `upsert_task_md` 函数：
   - 支持完整的任务属性
   - 实现系统字段白名单

### 步骤2：优化模板创建逻辑

1. 修改 `open_task_note` 函数中的模板格式：
   - 使用新的Frontmatter格式
   - 添加注释说明
   - 使用null作为默认值
   - 移除冗余标题

2. 确保模板包含所有重要任务属性

### 步骤3：实现可靠的更新机制

1. 修改 `update_task` 函数：
   - 当任务属性变更时，调用 `sync_task_to_md`
   - 传递变更字段（patch）而非完整任务

2. 修改状态变更函数：
   - `mark_task_done`
   - `reopen_task`
   - `start_task`
   - `stop_task`
   - 添加 `sync_task_to_md` 调用

3. 实现 `sync_task_to_md` 函数：
   - 接收task_id和变更字段
   - 实现完整的更新逻辑
   - 处理并发和冲突

### 步骤4：测试与验证

1. **回归兼容测试**：
   - 测试旧格式文件的处理
   - 确保能正确补齐字段，不破坏正文

2. **冲突场景测试**：
   - 测试用户正在编辑时的系统更新
   - 确保正文不丢失，不重排

3. **功能测试**：
   - 测试任务创建、编辑、状态变更等操作
   - 验证Markdown文件是否正确更新
   - 确保所有任务属性都能正确同步

## 4. 预期效果

- Markdown文件包含完整的任务属性，格式规范
- 任务属性变更时自动同步更新Markdown文件
- 保护用户编辑内容，避免覆盖和冲突
- 支持向后兼容，能处理旧格式文件
- 可靠的并发控制和冲突处理机制
- 统一的Markdown更新入口，便于维护

## 5. 影响范围

- `src-tauri/src/services/planning_service.rs`
- `src-tauri/src/repo/planning_md_repo.rs`
- 所有任务相关操作函数

## 6. 风险评估

- **业务风险**：低，不修改核心任务数据模型
- **用户体验风险**：中等，涉及用户内容文件写入
- **技术风险**：中等，需要处理并发和冲突

**风险缓解措施**：
- 实现原子写入操作
- 只改Frontmatter，不碰正文
- 对同一任务的更新加锁
- 实现冲突检测和重试机制
- 维护系统字段白名单
- 添加版本号，支持向后兼容

## 7. 关键技术点

1. **YAML Frontmatter解析和生成**
2. **原子文件写入**
3. **并发控制和锁机制**
4. **冲突检测和重试机制**
5. **向后兼容处理**
6. **系统字段白名单管理**