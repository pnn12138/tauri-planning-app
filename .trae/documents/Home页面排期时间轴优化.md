# Home页面排期时间轴优化计划（桌面端增强版）

## 1. 核心设计原则

### 1.1 桌面端约束与边界

* **明确时间范围**：dayStart=08:00，dayEnd=20:00（可配置）

* **最小时间粒度**：minSlotMinutes=15（默认）

* **对齐单位**：snapMinutes=30（默认，扩展模式可15）

* **事件规范化**：合并重叠任务，裁剪跨天任务，确保事件有序

### 1.2 模块化架构

* 将时间轴作为独立控件开发，避免Home组件膨胀

* 分离数据模型、业务逻辑和UI渲染

* 采用分层渲染架构，提高性能和可扩展性

## 2. 技术实现方案

### 2.1 数据模型与业务逻辑

#### 2.1.1 时间轴域模型

* **核心函数**：`buildTimelineModel(events, dayRange)` → `{ busyBlocks, freeBlocks, nowLine }`

* **事件规范化**：`normalizeEvents(events, dayRange)` 处理重叠、跨天、排序等问题

* **空闲时段计算**：基于规范化后的事件，计算freeBlocks

#### 2.1.2 状态管理

* **Source of Truth**：events作为唯一数据源

* **派生数据**：freeSlots通过useMemo从events派生，避免状态不一致

* **UI状态**：单独管理滚动锁定、hover状态等

### 2.2 组件架构设计

#### 2.2.1 分层渲染架构

1. **TimelineViewport**：滚动容器，处理自动滚动与锁定
2. **TicksLayer**：刻度层，显示背景和整点线
3. **BlocksLayer**：时间块层，渲染已排期任务和空闲块
4. **NowIndicatorLayer**：当前时间线，永远置顶
5. **InteractionLayer**：交互层，处理拖拽、hover等

#### 2.2.2 核心组件实现

* **FreeBlock组件**：显示空闲时段，包含弱化CTA文案

* **BusyBlock组件**：显示已排期任务，包含时间和任务信息

* **NowIndicator组件**：当前时间指示线，带时间标签

* **QuickScheduleModal组件**：轻量级排期弹窗

### 2.3 交互优化

#### 2.3.1 自动滚动策略

* **首次加载**：滚动到当前时间位置

* **用户手动滚动后**：添加`hasUserScrolled`标志，锁定自动滚动

* **回到现在按钮**：提供手动回到当前时间的选项

#### 2.3.2 Hover效果优化

* 避免频繁重绘，仅改变opacity/outline

* CTA文案常驻弱化显示，hover时增强

* 列表滚动时禁用hover效果

## 3. 实施步骤

### P0（基础稳定版）

1. **实现时间轴域模型**：

   * 开发`normalizeEvents`函数，处理事件边界

   * 实现`buildTimelineModel`，计算busyBlocks和freeBlocks

   * 确保边界情况（无任务、重叠任务、跨天任务）处理正确

2. **重构时间轴组件**：

   * 采用分层渲染架构

   * 实现TimelineViewport，处理滚动逻辑

   * 开发TicksLayer，显示整点刻度

3. **实现空闲块UI与交互**：

   * 渲染freeBlocks，设置最小高度

   * 添加弱化CTA文案

   * 实现点击事件，打开快速排期弹窗

4. **优化当前时间指示**：

   * 改进NowIndicator样式，确保置顶显示

   * 添加"回到现在"按钮

   * 实现自动滚动与锁定逻辑

5. **开发快速排期功能**：

   * 创建轻量级QuickScheduleModal

   * 自动填充开始时间，支持时长选择

   * 实现任务创建逻辑

### P1（增强版）

1. **扩展模式支持**：添加半小时刻度线选项
2. **拖拽落点提示**：实现拖拽到时间轴的预览高亮
3. **优化移动端适配**：确保在小屏幕上正常显示
4. **添加任务详情查看**：点击已排期任务查看详情

## 4. 验收标准（桌面端可测）

1. **边界情况处理**：

   * 无任务时：显示1个覆盖全天的freeBlock，可点击创建任务

   * 重叠任务：UI不崩溃，busyBlocks不重叠，freeSlots不为负

   * 跨天任务：正确裁剪到当天时间范围

2. **交互体验**：

   * 首次加载：自动滚动到当前时间

   * 用户手动滚动后：不再自动抢滚动，点击"回到现在"才返回

   * 点击空闲块：快速打开轻量弹窗，自动填充时间

3. **性能表现**：

   * 滚动时无明显卡顿

   * hover效果流畅，无频繁重绘

   * 事件更新时渲染高效

4. **视觉效果**：

   * 明确区分已排期和空闲时间

   * 当前时间指示清晰可见

   * 空闲块具有明确的"可安排"语义

## 5. 关键技术要点

### 5.1 事件规范化实现

```typescript
// 事件规范化流程
1. 按开始时间排序事件
2. 合并重叠或相邻事件
3. 裁剪超出dayRange的事件
4. 确保事件时间对齐到snapMinutes
```

### 5.2 空闲时段计算

```typescript
// 空闲时段计算逻辑
1. 初始化空闲时段起点为dayStart
2. 遍历规范化后的事件
3. 计算当前事件与上一事件（或dayStart）之间的空闲时段
4. 更新空闲时段起点为当前事件的结束时间
5. 添加最后一个事件到dayEnd之间的空闲时段
```

### 5.3 自动滚动与锁定

```typescript
// 自动滚动逻辑
const handleScroll = useCallback(() => {
  if (!autoScrollLockRef.current) {
    autoScrollLockRef.current = true;
  }
}, []);

// 回到现在按钮点击事件
const handleGoToNow = useCallback(() => {
  // 滚动到当前时间位置
  autoScrollLockRef.current = false;
}, []);
```

## 6. 预期效果

* 时间轴从"时间展示控件"升级为"执行中枢"

* 明确区分已排期、空闲和当前时间

* 提供高效的任务安排入口

* 稳定的桌面端交互体验

* 良好的性能表现和可扩展性

* 符合参考设计 `d:\tauri\tauri-planning-app\plan\stitch_integrated_timeline_kanban_view (9)` 的样式要求

