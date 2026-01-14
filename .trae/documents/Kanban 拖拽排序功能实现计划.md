# Kanban 拖拽排序功能实现计划（最终版）

## 1. 核心策略

- **DnD 覆盖范围**：仅支持 backlog/todo/done 三列，doing 列不可拖入/拖出
- **持久化排序策略**：采用整数重排（reindex），order_index = i * 1000（从1000开始），按列作用域
- **持久化接口**：新增 `planning_reorder_tasks` 批量事务更新，status 可选
- **拖拽库**：使用 `@dnd-kit/core @dnd-kit/sortable`（主流、活跃维护）

## 2. 技术基础

### 2.1 现有代码结构
- **后端**：`Task` 结构体已包含 `order_index` 字段，数据库表 `tasks` 已支持 `order_index` 和 `status` 列
- **前端**：`Home.tsx` 中实现了看板组件，任务卡片使用 `renderTaskCard` 函数渲染

### 2.2 所需依赖
- 前端拖拽库：`@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

## 3. 实现计划

### 3.1 第一步：安装依赖

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 3.2 第二步：后端扩展 - 新增批量更新接口

#### 3.2.1 新增 IPC 命令 `planning_reorder_tasks`
1. **修改 tauri invoke_handler 所在文件**：添加新命令到 invoke_handler
2. **修改 `src-tauri/src/services/planning_service.rs`**：实现 `reorder_tasks` 方法
3. **修改 `src-tauri/src/repo/planning_repo.rs`**：实现批量更新任务的方法，使用事务确保原子性
4. **修改前端 API 类型定义**：添加 `planning_reorder_tasks` 命令的类型定义

#### 3.2.2 批量更新方法实现

1. **修改 `src-tauri/src/domain/planning.rs`**：
   ```rust
   // 批量更新任务的输入
   #[derive(Debug, Clone, Serialize, Deserialize)]
   pub struct ReorderTaskInput {
       pub id: String,
       pub status: Option<TaskStatus>,
       pub order_index: i64,
   }
   ```

2. **修改 `src-tauri/src/repo/planning_repo.rs`**：
   ```rust
   // 批量更新任务的 order_index 和 status（可选）
   pub fn reorder_tasks(&self, tasks: Vec<ReorderTaskInput>) -> Result<(), ApiError> {
       let now = Utc::now().to_rfc3339();
       
       // 使用事务确保原子性
       let tx = self.conn.transaction()?;
       
       for task in tasks {
           // 更新数据库，status 可选
           match task.status {
               Some(status) => {
                   tx.execute(
                       r#"UPDATE tasks SET status = ?, order_index = ?, updated_at = ? WHERE id = ?"#,
                       params![status.to_string(), task.order_index, now, task.id],
                   )?;
               },
               None => {
                   tx.execute(
                       r#"UPDATE tasks SET order_index = ?, updated_at = ? WHERE id = ?"#,
                       params![task.order_index, now, task.id],
                   )?;
               }
           }
       }
       
       // 提交事务
       tx.commit()?;
       
       Ok(())
   }
   ```

### 3.3 第三步：前端实现 - 拖拽排序功能

#### 3.3.1 修改 Home.tsx

1. **引入拖拽相关组件**：
   ```typescript
   import {
     DndContext,
     closestCenter,
     KeyboardSensor,
     PointerSensor,
     useSensor,
     useSensors,
     DragEndEvent,
     DragStartEvent,
   } from '@dnd-kit/core';
   import {
     arrayMove,
     SortableContext,
     sortableKeyboardCoordinates,
     verticalListSortingStrategy,
     SortableItem,
     SortableContextProps,
     useSortable,
   } from '@dnd-kit/sortable';
   import { CSS } from '@dnd-kit/utilities';
   ```

2. **设置传感器和拖拽上下文**：
   ```typescript
   // 设置传感器
   const sensors = useSensors(
     useSensor(PointerSensor),
     useSensor(KeyboardSensor, {
       coordinateGetter: sortableKeyboardCoordinates,
     })
   );
   
   // 拖拽前快照
   const [prevTodaySnapshot, setPrevTodaySnapshot] = useState<TodayDTO | null>(null);
   ```

3. **包裹看板为 DndContext**：
   ```typescript
   <DndContext
     sensors={sensors}
     collisionDetection={closestCenter}
     onDragStart={handleDragStart}
     onDragEnd={handleDragEnd}
   >
     {/* 看板内容 */}
   </DndContext>
   ```

4. **转换任务列表为 SortableContext**：
   ```typescript
   // 为每列创建 SortableContext
   const renderKanbanColumn = (columnId: 'backlog' | 'todo' | 'doing' | 'done', title: string) => {
     const tasks = getFilteredTasks()[columnId];
     
     return (
       <div className="kanban-column" key={columnId}>
         <div className="kanban-column-header">
           {/* 列标题和计数 */}
         </div>
         <SortableContext 
           items={tasks.map(task => task.id)} 
           strategy={verticalListSortingStrategy}
         >
           <div className="kanban-tasks">
             {tasks.map(task => (
               <CustomSortableItem 
                 key={task.id} 
                 id={task.id} 
                 task={task} 
                 columnId={columnId}
               />
             ))}
           </div>
         </SortableContext>
       </div>
     );
   };
   ```

5. **自定义 SortableItem 组件**：
   ```typescript
   // 自定义 SortableItem 组件，携带 columnId 信息
   const CustomSortableItem = ({ id, task, columnId }: { id: string; task: Task; columnId: string }) => {
     const {
       attributes,
       listeners,
       setNodeRef,
       transform,
       transition,
       isDragging,
     } = useSortable({
       id,
       data: {
         columnId,
         task,
       },
     });
     
     // 应用拖拽样式
     const style = {
       transform: CSS.Transform.toString(transform),
       transition,
       opacity: isDragging ? 0.5 : 1,
     };
     
     // 渲染任务卡片
     return (
       <div
         ref={setNodeRef}
         {...attributes}
         {...listeners}
         style={style}
         className={`task-card ${task.status === 'doing' ? 'active' : ''} ${task.status === 'todo' ? 'blue-border' : ''}`}
         onClick={() => handleTaskCardClick(task)}
       >
         {/* 任务卡片内容 */}
       </div
     );
   };
   ```

6. **为每列添加 Droppable 容器（不包括 doing 列）**：
   ```typescript
   // 只有非 doing 列才添加 droppable 功能
   const canDrop = (columnId: string) => columnId !== 'doing';
   ```

#### 3.3.2 实现拖拽开始和结束处理函数

```typescript
// 拖拽开始时保存快照
const handleDragStart = () => {
  setPrevTodaySnapshot(todayData);
};

// 拖拽结束处理
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  
  // 确保拖拽目标有效
  if (!over || active.id === over.id) {
    return;
  }
  
  // 从 active.data 中获取源列信息
  const sourceColumnId = active.data.current?.columnId as string;
  if (!sourceColumnId) {
    console.error('Source column ID not found in active data');
    return;
  }
  
  // 获取源列任务
  const sourceTasks = [...todayData.kanban[sourceColumnId]];
  
  // 找到拖拽的任务
  const draggedTaskIndex = sourceTasks.findIndex(task => task.id === active.id);
  if (draggedTaskIndex === -1) {
    console.error('Dragged task not found in source column');
    return;
  }
  const draggedTask = sourceTasks[draggedTaskIndex];
  
  // 处理目标列
  let targetColumnId = sourceColumnId;
  let targetTasks = [...sourceTasks];
  let insertIndex = -1;
  
  // 检查 over 是否为任务
  const isOverTask = over.id !== 'column:' + sourceColumnId;
  
  if (isOverTask) {
    // over 是任务，获取目标列信息
    const overTaskData = over.data.current;
    if (overTaskData) {
      targetColumnId = overTaskData.columnId;
      // 禁止拖拽到 doing 列或从 doing 列拖拽
      if (targetColumnId === 'doing' || sourceColumnId === 'doing') {
        toast.error('doing 列不可拖拽，请使用 Start/Stop 按钮管理');
        return;
      }
      
      targetTasks = [...todayData.kanban[targetColumnId]];
      insertIndex = targetTasks.findIndex(task => task.id === over.id);
    }
  } else {
    // over 是列容器，获取列 ID
    targetColumnId = over.id.replace('column:', '');
    // 禁止拖拽到 doing 列或从 doing 列拖拽
    if (targetColumnId === 'doing' || sourceColumnId === 'doing') {
      toast.error('doing 列不可拖拽，请使用 Start/Stop 按钮管理');
      return;
    }
    
    targetTasks = [...todayData.kanban[targetColumnId]];
    insertIndex = targetTasks.length; // 插入到列尾
  }
  
  // 执行拖拽操作
  let updatedSourceTasks = sourceTasks;
  let updatedTargetTasks = targetTasks;
  
  if (sourceColumnId === targetColumnId) {
    // 同列拖拽
    updatedTargetTasks = arrayMove(updatedTargetTasks, draggedTaskIndex, insertIndex);
  } else {
    // 跨列拖拽
    // 从源列移除任务
    updatedSourceTasks.splice(draggedTaskIndex, 1);
    // 添加到目标列
    updatedTargetTasks.splice(insertIndex, 0, {
      ...draggedTask,
      status: targetColumnId,
    });
  }
  
  // 计算新的 order_index
  const tasksToUpdate: ReorderTaskInput[] = [];
  
  // 更新源列任务的 order_index
  updatedSourceTasks.forEach((task, index) => {
    tasksToUpdate.push({
      id: task.id,
      status: undefined, // 同列拖拽不需要更新 status
      order_index: (index + 1) * 1000, // 从 1000 开始
    });
  });
  
  // 更新目标列任务的 order_index
  if (sourceColumnId !== targetColumnId) {
    updatedTargetTasks.forEach((task, index) => {
      tasksToUpdate.push({
        id: task.id,
        status: task.status as TaskStatus, // 跨列拖拽需要更新 status
        order_index: (index + 1) * 1000, // 从 1000 开始
      });
    });
  } else {
    // 同列拖拽只更新目标列任务的 order_index
    updatedTargetTasks.forEach((task, index) => {
      tasksToUpdate.push({
        id: task.id,
        status: undefined,
        order_index: (index + 1) * 1000, // 从 1000 开始
      });
    });
  }
  
  // 先本地更新 UI（乐观更新）
  const updatedKanban = {
    ...todayData.kanban,
    [sourceColumnId]: updatedSourceTasks,
    [targetColumnId]: updatedTargetTasks,
  };
  updateKanban(updatedKanban);
  
  // 批量更新到数据库
  planningReorderTasks(tasksToUpdate)
    .catch(error => {
      console.error('Failed to reorder tasks:', error);
      toast.error('排序更新失败，已恢复原顺序');
      // 恢复快照
      if (prevTodaySnapshot) {
        updateKanban(prevTodaySnapshot.kanban);
      } else {
        // 快照不存在时重新加载
        loadTodayData(yyyymmdd);
      }
    });
};
```

### 3.4 第四步：前端状态管理优化

1. **添加拖拽状态管理**：
   - 在 store 中添加 `isDragging` 状态
   - 拖拽开始时设置 `isDragging = true`，结束时设置 `isDragging = false`
   - 拖拽过程中禁用卡片点击和 start/stop 按钮

2. **优化 UI 反馈**：
   - 添加拖拽过程中的视觉反馈
   - 使用 toast 提示操作结果
   - 拖拽失败时自动回滚到快照状态

## 4. 具体实现步骤

### 4.1 后端实现

1. **修改 `src-tauri/src/domain/planning.rs`**：
   - 新增 `ReorderTaskInput` 结构体，用于批量更新任务

2. **修改 `src-tauri/src/repo/planning_repo.rs`**：
   - 实现 `reorder_tasks` 方法，使用事务批量更新任务
   - 支持 status 可选更新
   - 不返回完整任务，只返回操作结果

3. **修改 `src-tauri/src/services/planning_service.rs`**：
   - 实现 `reorder_tasks` 服务方法

4. **修改 tauri invoke_handler 所在文件**：
   - 添加 `planning_reorder_tasks` 命令到 invoke_handler

5. **修改前端 API 类型定义**：
   - 在 `src/features/planning/planning.api.ts` 中添加 `planningReorderTasks` 函数
   - 在 `src/shared/types/planning.ts` 中添加相关类型定义

### 4.2 前端实现

1. **安装依赖**：
   ```bash
   npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
   ```

2. **修改 `src/features/planning/planning.store.ts`**：
   - 添加 `isDragging` 状态
   - 添加 `updateKanban` 方法，用于本地更新看板任务

3. **修改 `src/Home.tsx`**：
   - 引入 `@dnd-kit` 相关组件
   - 包裹看板组件为 `DndContext`
   - 将任务列表转换为 `SortableContext`
   - 实现自定义 `CustomSortableItem` 组件，携带 columnId 信息
   - 实现 `handleDragStart` 和 `handleDragEnd` 处理函数
   - 为每列添加 Droppable 容器（不包括 doing 列）
   - 拖拽过程中禁用卡片点击和 start/stop 按钮

### 4.3 测试与验证

1. **列内拖拽测试**：
   - 在同一列内拖拽任务，验证排序是否正确
   - 刷新页面后验证排序是否保持
   - 检查数据库中 `order_index` 是否正确更新

2. **跨列拖拽测试**：
   - 在不同列间拖拽任务，验证状态和排序是否正确
   - 刷新页面后验证状态和排序是否保持
   - 检查数据库中 `status` 和 `order_index` 是否正确更新

3. **doing列拖拽限制测试**：
   - 尝试拖拽任务到 doing 列，验证是否被禁止
   - 尝试从 doing 列拖拽任务，验证是否被禁止

4. **错误处理测试**：
   - 模拟网络请求失败，验证状态是否正确回滚到快照
   - 验证错误提示是否清晰

## 5. 代码变更点

- **新增依赖**：`@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- **后端修改文件**：
  - `src-tauri/src/domain/planning.rs`
  - `src-tauri/src/repo/planning_repo.rs`
  - `src-tauri/src/services/planning_service.rs`
  - tauri invoke_handler 所在文件
- **前端修改文件**：
  - `src/features/planning/planning.api.ts`
  - `src/features/planning/planning.store.ts`
  - `src/shared/types/planning.ts`
  - `src/Home.tsx`

## 6. 预期结果

- **S2-3.1 列内排序拖拽**：同列拖拽后任务顺序持久化，刷新/重启后顺序不变
- **S2-3.2 跨列拖拽**：跨列拖拽后任务状态和顺序正确更新，刷新/重启后状态不变
- **doing列保护**：禁止直接拖拽到/出 doing 列，保持状态机一致性
- **良好的用户体验**：拖拽过程流畅，操作反馈清晰，失败时自动回滚到快照状态

## 7. 风险评估与解决方案

- **依赖风险**：使用活跃维护的 `@dnd-kit` 库，降低兼容性和 bug 风险
- **性能风险**：批量更新采用事务处理，确保原子性，减少数据库操作次数
- **状态一致性风险**：采用乐观更新 + 快照回滚策略，确保前端状态与数据库一致
- **用户体验风险**：添加清晰的操作反馈和错误提示，引导用户正确使用拖拽功能
- **事务处理风险**：严格使用事务连接进行所有数据库操作，避免事务外查询

通过以上优化方案，我们可以实现一个功能完整、性能稳定、用户体验良好的 Kanban 拖拽排序功能，同时避免了各种落地陷阱。