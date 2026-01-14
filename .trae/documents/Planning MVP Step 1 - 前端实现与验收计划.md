# Planning MVP Step 1 - 前端实现与验收计划

## 1. 现有实现分析

### 已完成功能
- ✅ Home组件基本布局（Kanban四列 + 时间轴 + Doing状态）
- ✅ 状态管理（useSyncExternalStore）
- ✅ API封装（所有必要的IPC调用）
- ✅ 数据加载逻辑

### 待实现功能
- ❌ 任务交互（创建/状态切换/开始停止）
- ❌ 乐观更新 + 失败回滚
- ❌ 打开每日日志功能
- ❌ 计时器显示（仅elapsed时间，无pause）

## 2. 1.3 前端（React）实现计划

### 2.1 核心设计原则

#### 2.1.1 TodayDTO 单源消费
- **规则**：Home的渲染只能来自store的单份TodayDTO，不允许一部分来自list_today，一部分来自单独查询
- **实现**：store里只维护一个today状态：`{ kanban, timeline, currentDoing, today, server_now }`，所有组件只从这里获取数据
- **目的**：避免UI分裂，确保数据一致性

#### 2.1.2 请求序列化与防抖
- **规则1**：同一task的操作串行执行
  - store内维护`inFlightByTaskId`映射，记录每个任务的请求状态
  - 当同一任务有请求正在处理时，拒绝后续请求并toast提示"处理中..."

- **规则2**：start/stop操作的按钮状态管理
  - 调用API时立即禁用按钮
  - API返回或失败后恢复按钮状态
  - 至少300ms的合并处理，防止用户连点
  - 10s超时后提示"请求超时，可重试"

#### 2.1.3 结构化错误处理
- **错误码 → UI行为映射表**：
  | 错误码 | UI行为 |
  |--------|--------|
  | VaultNotSelected | 弹窗引导选择Vault或显示空态 |
  | PathOutsideVault | toast提示"操作超出Vault范围" |
  | DbBusy | toast提示"数据库繁忙" + 重试按钮 |
  | InvalidStateTransition | toast提示"状态转换无效" + 回滚 |
  | AlreadyDoing | toast提示"已有任务在进行中" |
  | InvalidParameter | toast提示"参数无效" |
  | NotFound | toast提示"任务不存在" + 自动刷新数据 |
  | Conflict/StaleState | toast提示"数据已更新" + 强制刷新数据 |

#### 2.1.4 Store隔离规则
- **规则**：planning.store只通过planning.api与后端交互；对外只暴露hooks/selectors，不被其他feature直接import
- **跨feature通信**：通过事件/command触发，不直接引用

### 2.2 任务交互功能

#### 2.2.1 任务创建
- 在Home组件中添加"新建任务"按钮的点击事件处理
- 实现任务创建表单（模态框）
- 调用`planningCreateTask` API
- **处理流程**：
  1. 保存操作前快照
  2. 乐观更新：将新任务插入本地today状态
  3. 调用API
  4. API成功：后台触发一次refreshToday()兜底对齐
  5. API失败：回滚到操作前快照

#### 2.2.2 任务状态切换
- **UI规则**：
  - 进入doing只能通过start（start_task）
  - 菜单只允许：backlog ↔ todo、todo/backlog → done、done → reopen
  - doing状态由currentDoing（timer未stop）驱动，不提供"直接切换为doing"

- **实现**：
  - 实现任务卡片的点击事件处理
  - 添加符合规则的状态切换菜单
  - 根据选择的状态调用相应的API
  - 应用请求序列化规则

#### 2.2.3 任务开始/停止
- 在任务卡片中添加开始/停止按钮
- **开始任务流程**：
  1. 保存操作前快照
  2. 禁用按钮
  3. 乐观更新：更新任务状态为doing，更新currentDoing
  4. 调用`planningStartTask` API
  5. API返回：恢复按钮状态，后台触发refreshToday()
  6. API失败：回滚到操作前快照，恢复按钮状态

- **停止任务流程**：
  1. 保存操作前快照
  2. 禁用按钮
  3. 乐观更新：更新任务状态，清除currentDoing
  4. 调用`planningStopTask` API
  5. API返回：恢复按钮状态，后台触发refreshToday()
  6. API失败：回滚到操作前快照，恢复按钮状态

### 2.3 乐观更新 + 失败回滚机制

#### 2.3.1 实现策略
- **回滚依据**：以"操作前快照"回滚（per-action snapshot）
  - action开始：保存`prevToday = store.today`
  - 乐观更新：写入新today
  - 失败：直接恢复`prevToday`（或只回滚task子集）
  - 约束：每个task同时只允许一个in-flight请求，防止快照被覆盖

#### 2.3.2 失败处理流程
1. API返回错误
2. 根据错误码显示相应UI反馈
3. 回滚到操作前快照
4. 对特定错误（如NotFound、Conflict）自动触发refreshToday()

### 2.4 打开每日日志功能

#### 2.4.1 UI集成
- 在Home组件中添加"打开每日日志"按钮
- 实现按钮点击事件处理

#### 2.4.2 API调用
- 调用`planningOpenDaily` API
- 获取返回的mdPath

#### 2.4.3 复用现有Markdown Tab逻辑
- 利用现有代码打开Markdown文件
- 确保文件创建和打开的流畅体验

### 2.5 计时器显示

#### 2.5.1 实时elapsed时间显示
- **实现**：Doing卡片显示 `elapsed = now - currentDoing.timer.start_at`
- **更新频率**：每秒更新一次
- **格式**：HH:MM:SS
- **注意**：不做暂停功能，只显示已流逝时间

#### 2.5.2 计时器管理
- 处理组件卸载时的计时器清理
- 确保在currentDoing变化时正确更新计时器

## 3. 1.4 最小验收标准

### 3.1 契约冻结点
- **规则**：Step1只冻结TodayDTO与Task/Timer/DayLog DTO字段，不在Step1引入拖拽/复杂过滤/统计字段
- **TodayDTO结构**：包含`kanban`、`timeline`、`currentDoing`、`today`、`server_now`字段

### 3.2 必测用例（可执行）

#### T1：冷启动自动建表
- **操作**：首次启动应用
- **预期**：自动创建数据库表，重复启动不报错，数据不丢失

#### T2：新建任务持久化
- **操作**：新建任务 → 刷新/重启应用
- **预期**：任务仍存在于相应列中

#### T3：Doing状态恢复
- **操作**：将任务从todo → doing（start）→ 重启应用
- **预期**：任务仍显示为currentDoing，计时器正确恢复

#### T4：Doing任务互斥
- **操作**：doing任务A时start任务B
- **预期**：任务A自动stop，任务B成为doing

#### T5：停止Doing任务
- **操作**：stop doing任务
- **预期**：任务状态回到todo，timer正确落库

#### T6：任务完成与重开
- **操作**：mark_done任务 → 检查done列 → reopen任务
- **预期**：任务先出现在done列，重开后回到todo（或backlog）

#### T7：每日日志自动创建
- **操作**：点击"打开每日日志"按钮
- **预期**：首次自动创建`.planning/daily/YYYY-MM-DD.md`，再次打开不重复创建，可正常编辑

#### T8：Vault未选择场景
- **操作**：未选择Vault时调用list_today或open_daily
- **预期**：返回错误码`VaultNotSelected`，前端显示空态或引导弹窗

### 3.3 性能与交互稳定性最低线
- **list_today返回时间**：本地DB小数据量情况下 < 200ms
- **Home首次渲染**：显示loading skeleton，避免空白闪烁
- **操作响应**：点击按钮后立即有视觉反馈（按钮禁用/状态变化）

### 3.4 验收标准

#### 3.4.1 功能验收
- ✅ Home 可以展示真实任务（四列 + 今日 + doing）
- ✅ start/stop 后重启应用：doing 状态可恢复（未 stop timer 也能恢复）
- ✅ 自动创建 `.planning/daily/YYYY-MM-DD.md` 并可打开编辑
- ✅ Doing 任务互斥规则生效
- ✅ 计时器显示正确（无暂停功能）

#### 3.4.2 非功能验收
- ✅ 所有必测用例通过
- ✅ 符合性能最低线要求
- ✅ 结构化错误处理生效
- ✅ 请求序列化机制生效

## 4. 实现步骤

1. **完善状态管理**
   - 确保store只维护单份TodayDTO
   - 添加请求序列化机制
   - 实现结构化错误处理
   - 实现操作前快照回滚机制

2. **实现任务创建功能**
   - 添加任务创建表单和处理逻辑
   - 实现乐观更新和失败回滚
   - 添加API调用和兜底刷新

3. **实现任务状态切换功能**
   - 实现符合规则的状态切换菜单
   - 调用相应的API
   - 应用请求序列化规则

4. **实现任务开始/停止功能**
   - 实现开始/停止按钮的点击事件处理
   - 实现乐观更新和失败回滚
   - 应用按钮禁用规则

5. **实现计时器显示功能**
   - 实现elapsed时间计算和显示
   - 实现计时器的启动和清理

6. **实现打开每日日志功能**
   - 添加UI按钮和事件处理
   - 实现API调用和文件打开逻辑

7. **执行验收测试**
   - 运行所有必测用例
   - 验证性能和交互稳定性
   - 确保所有验收标准通过

## 5. Step1 范围总结

**Step1 = 真实数据渲染 + CRUD + start/stop 互斥 + 重启恢复 + open_daily**

- 计时器仅做elapsed展示（无pause）
- doing只能通过start进入，菜单不允许直接置doing
- in-flight不做排队，只做拒绝 + toast + 刷新兜底
- 乐观更新采用操作前快照回滚
- 后端返回today和server_now，避免跨时区问题
- 结构化错误处理，包含NotFound和Conflict/StaleState

## 6. 文档精简
- 移除缓存策略等超出Step1范围的内容
- 聚焦核心功能实现
- 明确各功能的边界和约束