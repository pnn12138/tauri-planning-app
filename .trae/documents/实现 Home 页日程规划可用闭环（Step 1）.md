# 实现 Home 页日程规划可用闭环（Step 1）

## 1. 数据模型定义（严格契约）

### 1.1 核心枚举与类型

#### 1.1.1 TaskStatus 枚举
```typescript
export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'done';
```

#### 1.1.2 Task 模型
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 任务唯一标识 |
| title | string | 是 | 任务标题 |
| status | TaskStatus | 是 | 任务状态 |
| order_index | number | 是 | 列内排序索引，同一状态内唯一 |
| estimate_min | number | 否 | 预估时长（分钟） |
| scheduled_start | string | 否 | 排程开始时间（ISO 格式），为空则只出现在 Kanban |
| scheduled_end | string | 否 | 排程结束时间（ISO 格式），为空则由 estimate_min 推算展示 |
| note_path | string | 否 | 任务详情 Markdown 路径（vault 相对路径） |
| created_at | string | 是 | 创建时间（ISO 格式） |
| updated_at | string | 是 | 更新时间（ISO 格式） |
| completed_at | string | 否 | 完成时间（ISO 格式） |
| archived | number | 是 | 是否归档（0/1） |

#### 1.1.3 Timer 模型
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | 计时记录唯一标识 |
| task_id | string | 是 | 关联任务 ID |
| start_at | string | 是 | 开始时间（ISO 格式） |
| stop_at | string | 否 | 结束时间（ISO 格式），为 null 表示当前正在进行 |
| duration_sec | number | 是 | 持续时长（秒），可由 start_at/stop_at 计算得出 |
| source | string | 是 | 来源，默认为 'manual' |

#### 1.1.4 DayLog 模型
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| day | string | 是 | 日期（YYYY-MM-DD 格式） |
| daily_md_path | string | 是 | 每日复盘 Markdown 路径（vault 相对路径） |
| created_at | string | 是 | 创建时间（ISO 格式） |
| updated_at | string | 是 | 更新时间（ISO 格式） |

#### 1.1.5 TodayDTO 模型
```typescript
export type TodayDTO = {
  // Kanban 四列任务，按 status 分组
  kanban: {
    backlog: Task[];
    todo: Task[];
    doing: Task[];
    done: Task[];
  };
  // 今日时间轴任务
  timeline: Task[];
  // 当前正在进行的任务（如果有）
  currentDoing?: Task;
};
```

### 1.2 关键契约规则

#### 1.2.1 时间轴规则
- 时间轴任务必须满足：`scheduled_start` 不为空且落在本地日期的 00:00–24:00 范围内
- 若 `scheduled_end` 为空，则在 UI 展示时由 `scheduled_start` + `estimate_min` 推算结束时间
- 未排程任务（`scheduled_start` 为空）只出现在 Kanban，不出现在时间轴

#### 1.2.2 排序规则
- `order_index` 为同一 `status` 内的排序索引
- 新任务默认插入到对应列末尾（`max(order_index) + 1`）
- 任务状态变更时，移动到目标列末尾（先计算目标列 `max(order_index) + 1`）

#### 1.2.3 Doing 任务规则
- **单一事实来源**：存在 `stop_at` 为 `null` 的 `Timer` 记录时，对应的任务为当前 Doing 任务
- `Task.status` 仅作为 UI 辅助：开始任务时设为 `doing`，停止任务时根据逻辑设回 `todo` 或其他状态
- **互斥规则**：同一时间只允许一个 Doing 任务，切换 Doing 任务时自动停止上一个

#### 1.2.4 路径存储规则
- `note_path` 和 `daily_md_path` 一律存储为 vault 相对路径（例如：`.planning/tasks/2026-01-13-001.md`）
- 避免存储绝对路径，确保 Vault 迁移时数据仍然有效

## 2. 后端实现

### 2.1 目录结构
```
src-tauri/src/
├─ commands/
│  └─ planning_cmd.rs       # IPC 接口实现
├─ services/
│  └─ planning_service.rs    # 业务逻辑层
├─ repo/
│  ├─ planning_repo.rs       # SQLite 数据库操作
│  └─ planning_md_repo.rs    # Markdown 文件操作
└─ domain/
   └─ planning.rs            # 领域模型定义
```

### 2.2 核心功能实现

#### 2.2.1 数据库设计
- 实现 SQLite 数据库，包含 `tasks`、`task_timer`、`day_log`、`ui_state` 四张表
- 严格按照文档中的表结构创建索引

#### 2.2.2 服务层功能
- `planning_list_today()`：获取今日全部数据，封装为 TodayDTO
- `planning_create_task(input)`：创建新任务
- `planning_update_task(input)`：更新任务信息
- `planning_mark_done(taskId)`：标记任务完成
- `planning_reopen_task(taskId)`：重新打开已完成任务
- `planning_start_task(taskId)`：开始任务（处理 Doing 互斥）
- `planning_stop_task(taskId)`：停止任务
- `planning_open_daily(day)`：打开或创建每日复盘文件

#### 2.2.3 IPC 响应格式
```typescript
// 成功响应
{ ok: true, data: T }
// 错误响应
{ ok: false, error: { code: string, message: string } }
```

## 3. 前端实现

### 3.1 目录结构
```
src/
├─ features/
│  └─ planning/
│     ├─ planning.api.ts      # API 服务封装
│     ├─ planning.store.ts    # 状态管理
│     └─ planning.types.ts    # 类型定义
└─ shared/
   └─ types/
      └─ planning.ts          # 共享类型定义
```

### 3.2 核心功能实现

#### 3.2.1 类型定义
- 与后端严格对齐的 TypeScript 类型
- API 响应类型封装

#### 3.2.2 API 服务
- 封装 Tauri IPC 调用
- 实现统一的错误处理

#### 3.2.3 Store 管理
- 管理规划数据状态
- 实现数据获取、更新、删除等方法
- 处理乐观更新和失败回滚

#### 3.2.4 Home 页集成
- 修改 `Home.tsx`，使用真实数据渲染
- 实现任务状态变更、开始/停止任务等交互
- 支持任务创建和编辑

## 4. 实现步骤

1. **定义数据模型**：前端和后端同步定义核心类型和契约
2. **实现后端数据库**：创建 SQLite 数据库和表结构
3. **实现后端仓库层**：完成数据库和文件操作
4. **实现后端服务层**：实现业务逻辑和数据处理
5. **实现后端命令层**：暴露 Tauri IPC 接口
6. **实现前端类型和 API 服务**：封装后端接口调用
7. **实现前端 Store**：管理规划数据状态
8. **修改 Home 页**：替换模拟数据为真实数据
9. **测试和验证**：确保功能正常运行

## 5. 验收标准

- ✅ Home 页使用真实 DB 数据渲染
- ✅ 新建/更新任务会写入 SQLite
- ✅ Doing 状态在重启后可恢复
- ✅ 可以打开并创建 `.planning` 下的 Markdown 文件
- ✅ 遵循 Doing 任务互斥规则
- ✅ 未排程任务不出现在时间轴
- ✅ 任务状态变更时排序正确
- ✅ 路径存储为相对路径，支持 Vault 迁移

## 6. 技术要点

- 确保前后端类型严格一致
- 实现可靠的错误处理机制
- 保证数据持久化和状态恢复
- 遵循现有项目架构和代码风格
- 优先实现核心功能，避免过度设计

现在开始按照上述计划逐步实现，首先定义数据模型和类型。