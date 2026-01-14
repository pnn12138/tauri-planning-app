import { useEffect, useState } from 'react';
import { usePlanningStore, loadTodayData, markTaskDone, reopenTask, updateTask, startTask, stopTask, updateKanban, setIsDragging, reorderTasks, updateUIState, setCurrentVaultId, loadUIState } from './features/planning/planning.store';
import { planningOpenTaskNote } from './features/planning/planning.api';
import TaskCreateModal from './features/task-create/TaskCreateModal';
import type { Task } from './shared/types/planning';

// Generate vault_id from vaultRoot path (using simple hash for MVP)
function generateVaultId(vaultRoot: string | null): string {
  if (!vaultRoot) return "default-vault";
  
  // Normalize the path for consistent hashing
  let normalized = vaultRoot;
  if (normalized.startsWith("\\?\\")) {
    normalized = normalized.slice(4);
  }
  normalized = normalized.replace(/[\\/]+$/, "");
  normalized = normalized.replace(/\\/g, "/");
  
  // Simple hash function for MVP
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `vault-${Math.abs(hash).toString(16)}`;
}
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type HomeProps = {
  hasVault: boolean;
  onSelectVault: () => void;
  vaultRoot: string | null;
};

// Get current date in Chinese format
const getCurrentDate = () => {
  const now = new Date();
  const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  
  // Also return YYYY-MM-DD format for API calls
  const year = now.getFullYear();
  const monthNum = String(now.getMonth() + 1).padStart(2, '0');
  const dayNum = String(now.getDate()).padStart(2, '0');
  
  return {
    month: months[now.getMonth()],
    day: now.getDate(),
    weekday: weekdays[now.getDay()],
    yyyymmdd: `${year}-${monthNum}-${dayNum}`
  };
};

// Format time from ISO string (YYYY-MM-DDTHH:MM:SS) to HH:MM
const formatTime = (isoString: string | undefined): string => {
  if (!isoString) return '';
  return isoString.split('T')[1].substring(0, 5);
};

// Format elapsed time from startAt to now in HH:MM:SS format
const formatElapsedTime = (startAt: string | undefined): string => {
  if (!startAt) return '00:00:00';
  
  const startDate = new Date(startAt);
  const now = new Date();
  const elapsedSeconds = Math.floor((now.getTime() - startDate.getTime()) / 1000);
  
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Calculate estimated end time based on scheduled_start and estimate_min
const calculateEstimatedEnd = (scheduledStart: string | undefined, estimateMin: number | undefined): string | undefined => {
  if (!scheduledStart || !estimateMin) return undefined;
  
  const startDate = new Date(scheduledStart);
  const endDate = new Date(startDate.getTime() + estimateMin * 60 * 1000);
  
  // Format as YYYY-MM-DDTHH:mm
  const year = endDate.getFullYear();
  const month = (endDate.getMonth() + 1).toString().padStart(2, '0');
  const day = endDate.getDate().toString().padStart(2, '0');
  const hours = endDate.getHours().toString().padStart(2, '0');
  const minutes = endDate.getMinutes().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Get total scheduled hours for today
const getTotalScheduledHours = (tasks: Task[]): string => {
  const totalMinutes = tasks.reduce((sum, task) => {
    return sum + (task.estimate_min || 0);
  }, 0);
  return (totalMinutes / 60).toFixed(1);
};

function Home({ hasVault, onSelectVault, vaultRoot }: HomeProps) {
  const { month, day, weekday, yyyymmdd } = getCurrentDate();
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  
  // 新建任务相关状态
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // 任务状态切换相关状态
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  
  // Tags editor related state
  const [isTagsEditorOpen, setIsTagsEditorOpen] = useState(false);
  const [editingTagsTask, setEditingTagsTask] = useState<Task | null>(null);
  const [tagsEditorInput, setTagsEditorInput] = useState('');
  const [tagsEditorTags, setTagsEditorTags] = useState<string[]>([]);
  
  // Schedule editor related state
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
  const [editingScheduleTask, setEditingScheduleTask] = useState<Task | null>(null);
  const [scheduleEditorEstimateMin, setScheduleEditorEstimateMin] = useState<string>('');
  const [scheduleEditorScheduledEnd, setScheduleEditorScheduledEnd] = useState<string>('');
  const [scheduleEditorError, setScheduleEditorError] = useState<string>('');
  
  // 从store获取UI状态
  const uiState = usePlanningStore(state => state.uiState);
  
  // Set vault_id when vaultRoot changes
  useEffect(() => {
    if (vaultRoot) {
      const vaultId = generateVaultId(vaultRoot);
      setCurrentVaultId(vaultId);
      // Load UI state from backend
      loadUIState(vaultId);
    }
  }, [vaultRoot]);
  
  // DnD sensors setup
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // 拖拽开始处理
  const handleDragStart = (_event: DragStartEvent) => {
    setIsDragging(true);
  };
  
  // 拖拽结束处理
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setIsDragging(false);
    
    // 确保拖拽目标有效
    if (!over || active.id === over.id) {
      return;
    }
    
    // 确保 todayData 存在
    if (!todayData) {
      console.error('Today data is null');
      return;
    }
    
    // 从 active.data 中获取源列信息
    const sourceColumnId = active.data.current?.columnId as string;
    if (!sourceColumnId) {
      console.error('Source column ID not found in active data');
      return;
    }
    
    // 定义有效列 ID
    const validColumnIds = ['backlog', 'todo', 'doing', 'done'] as const;
    
    // 确保源列 ID 有效
    if (!validColumnIds.includes(sourceColumnId as any)) {
      console.error('Invalid source column ID:', sourceColumnId);
      return;
    }
    
    // 获取源列任务
    const sourceTasks = [...todayData.kanban[sourceColumnId as typeof validColumnIds[number]]];
    
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
    
    // 检查 over 是否为列容器
    const isOverColumn = typeof over.id === 'string' && over.id.startsWith('column:');
    
    if (!isOverColumn) {
      // over 是任务，获取目标列信息
      const overTaskData = over.data.current;
      if (overTaskData) {
        targetColumnId = overTaskData.columnId;
        // 禁止拖拽到 doing 列或从 doing 列拖拽
        if (targetColumnId === 'doing' || sourceColumnId === 'doing') {
          alert('doing 列不可拖拽，请使用 Start/Stop 按钮管理');
          return;
        }
        
        // 确保目标列 ID 有效
        if (!validColumnIds.includes(targetColumnId as any)) {
          console.error('Invalid target column ID:', targetColumnId);
          return;
        }
        
        targetTasks = [...todayData.kanban[targetColumnId as typeof validColumnIds[number]]];
        insertIndex = targetTasks.findIndex(task => task.id === over.id);
      } else {
        // 如果无法从 over.data 获取目标列信息，尝试查找 over.id 对应的任务
        // 遍历所有列，查找 over.id 对应的任务
        let foundTask = null;
        for (const columnId of validColumnIds) {
          const tasks = todayData.kanban[columnId as typeof validColumnIds[number]];
          foundTask = tasks.find(task => task.id === over.id);
          if (foundTask) {
            targetColumnId = columnId as string;
            break;
          }
        }
        
        if (foundTask) {
          // 禁止拖拽到 doing 列或从 doing 列拖拽
          if (targetColumnId === 'doing' || sourceColumnId === 'doing') {
            alert('doing 列不可拖拽，请使用 Start/Stop 按钮管理');
            return;
          }
          
          targetTasks = [...todayData.kanban[targetColumnId as typeof validColumnIds[number]]];
          insertIndex = targetTasks.findIndex(task => task.id === over.id);
        } else {
          console.error('Failed to find target task with id:', over.id);
          return;
        }
      }
    } else {
      // over 是列容器，获取列 ID
      if (typeof over.id === 'string') {
        targetColumnId = over.id.replace('column:', '');
        
        // 禁止拖拽到 doing 列或从 doing 列拖拽
        if (targetColumnId === 'doing' || sourceColumnId === 'doing') {
          alert('doing 列不可拖拽，请使用 Start/Stop 按钮管理');
          return;
        }
        
        // 确保目标列 ID 有效
        if (!validColumnIds.includes(targetColumnId as any)) {
          console.error('Invalid target column ID:', targetColumnId);
          return;
        }
        
        targetTasks = [...todayData.kanban[targetColumnId as typeof validColumnIds[number]]];
        insertIndex = targetTasks.length; // 插入到列尾
      } else {
        console.error('Invalid column ID type:', over.id);
        return;
      }
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
        status: targetColumnId as any,
      });
    }
    
    // 计算新的 order_index
    const tasksToUpdate: Array<{ id: string; status?: string; order_index: number }> = [];
    
    // 更新源列任务的 order_index
    updatedSourceTasks.forEach((task, index) => {
      tasksToUpdate.push({
        id: task.id,
        status: undefined,
        order_index: (index + 1) * 1000,
      });
    });
    
    // 更新目标列任务的 order_index
    if (sourceColumnId !== targetColumnId) {
      updatedTargetTasks.forEach((task, index) => {
        tasksToUpdate.push({
          id: task.id,
          status: task.status,
          order_index: (index + 1) * 1000,
        });
      });
    } else {
      // 同列拖拽只更新目标列任务的 order_index
      updatedTargetTasks.forEach((task, index) => {
        tasksToUpdate.push({
          id: task.id,
          status: undefined,
          order_index: (index + 1) * 1000,
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
    try {
      await reorderTasks(tasksToUpdate);
    } catch (error) {
      console.error('Failed to reorder tasks:', error);
      alert('排序更新失败，已恢复原顺序');
      // 恢复原始数据
      loadTodayData(yyyymmdd);
    }
  };
  
  // Open daily log
  const handleOpenDaily = async () => {
    // TODO: Implement open daily log functionality
    alert('打开每日日志功能尚未实现');
  };
  
  // Get data from store
  const todayData = usePlanningStore(state => state.todayData);
  const isLoading = usePlanningStore(state => state.isLoading);
  const error = usePlanningStore(state => state.error);
  
  // Load today's data when component mounts
  useEffect(() => {
    if (hasVault) {
      loadTodayData(yyyymmdd);
    }
    
    // Update current time every minute for the display
    const timeDisplayTimer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    }, 60000);
    
    return () => {
      clearInterval(timeDisplayTimer);
    };
  }, [hasVault, yyyymmdd]);
  
  // 新建任务模态框处理
  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };
  
  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };
  
  const handleTaskCreated = () => {
    console.log('Task created successfully');
    setIsCreateModalOpen(false);
    // Reload today's data to include the new task
    loadTodayData(yyyymmdd);
  };
  
  // 任务状态菜单处理
  const handleOpenStatusMenu = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setSelectedTask(task);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setIsStatusMenuOpen(true);
  };
  
  const handleCloseStatusMenu = () => {
    setIsStatusMenuOpen(false);
    setSelectedTask(null);
  };
  
  // 点击页面其他地方关闭菜单
  useEffect(() => {
    const handleClickOutside = () => {
      handleCloseStatusMenu();
    };
    
    if (isStatusMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [isStatusMenuOpen]);
  
  // 切换任务状态
  const handleChangeTaskStatus = async (newStatus: Task['status']) => {
    if (!selectedTask) return;
    
    try {
      await updateTask({
        id: selectedTask.id,
        status: newStatus,
      });
      handleCloseStatusMenu();
    } catch (error) {
      console.error('更新任务状态失败:', error);
      alert(`更新任务状态失败: ${(error as Error).message}`);
    }
  };
  
  // 标记任务完成
  const handleMarkTaskDone = async (taskId: string) => {
    try {
      await markTaskDone(taskId);
    } catch (error) {
      console.error('标记任务完成失败:', error);
      alert(`标记任务完成失败: ${(error as Error).message}`);
    }
  };
  
  // 重新打开任务
  const handleReopenTask = async (taskId: string) => {
    try {
      await reopenTask(taskId);
    } catch (error) {
      console.error('重新打开任务失败:', error);
      alert(`重新打开任务失败: ${(error as Error).message}`);
    }
  };
  
  // 开始任务
  const handleStartTask = async (taskId: string) => {
    try {
      await startTask(taskId);
    } catch (error) {
      console.error('开始任务失败:', error);
      alert(`开始任务失败: ${(error as Error).message}`);
    }
  };
  
  // 停止任务
  const handleStopTask = async (taskId: string) => {
    try {
      await stopTask(taskId);
    } catch (error) {
      console.error('停止任务失败:', error);
      alert(`停止任务失败: ${(error as Error).message}`);
    }
  };
  
  // Update task priority
  const handleUpdatePriority = async (taskId: string, priority?: Task['priority']) => {
    try {
      await updateTask({
        id: taskId,
        priority,
      });
      handleCloseStatusMenu();
    } catch (error) {
      console.error('更新任务优先级失败:', error);
      alert(`更新任务优先级失败: ${(error as Error).message}`);
    }
  };

  // Update task tags
  const handleUpdateTags = async (taskId: string, tags: string[]) => {
    try {
      await updateTask({
        id: taskId,
        tags,
      });
    } catch (error) {
      console.error('更新任务标签失败:', error);
      alert(`更新任务标签失败: ${(error as Error).message}`);
    }
  };

  // Open tags editor
  const handleOpenTagsEditor = (task: Task) => {
    setEditingTagsTask(task);
    setTagsEditorTags(task.tags || []);
    setTagsEditorInput('');
    setIsTagsEditorOpen(true);
    handleCloseStatusMenu();
  };

  // Close tags editor
  const handleCloseTagsEditor = () => {
    setIsTagsEditorOpen(false);
    setEditingTagsTask(null);
    setTagsEditorTags([]);
    setTagsEditorInput('');
  };
  
  // Open schedule editor
  const handleOpenScheduleEditor = (task: Task) => {
    setEditingScheduleTask(task);
    setScheduleEditorEstimateMin(task.estimate_min?.toString() || '');
    setScheduleEditorScheduledEnd(task.scheduled_end ? formatTime(task.scheduled_end) : '');
    setScheduleEditorError('');
    setIsScheduleEditorOpen(true);
    handleCloseStatusMenu();
  };
  
  // Close schedule editor
  const handleCloseScheduleEditor = () => {
    setIsScheduleEditorOpen(false);
    setEditingScheduleTask(null);
    setScheduleEditorEstimateMin('');
    setScheduleEditorScheduledEnd('');
    setScheduleEditorError('');
  };
  
  // Save schedule
  const handleSaveSchedule = async () => {
    if (!editingScheduleTask) return;
    
    // Reset error
    setScheduleEditorError('');
    
    // Validate inputs
    const estimateMin = scheduleEditorEstimateMin ? parseInt(scheduleEditorEstimateMin) : undefined;
    if (estimateMin !== undefined && (isNaN(estimateMin) || estimateMin < 1 || estimateMin > 1440)) {
      setScheduleEditorError('预计时间必须是1-1440之间的整数');
      return;
    }
    
    let scheduledEnd: string | undefined = undefined;
    if (scheduleEditorScheduledEnd && editingScheduleTask.scheduled_start) {
      // Parse scheduled start time
      const startParts = editingScheduleTask.scheduled_start.split('T');
      if (startParts.length !== 2) {
        setScheduleEditorError('无效的开始时间格式');
        return;
      }
      
      const datePart = startParts[0];
      const startTimePart = startParts[1].substring(0, 5);
      const endTimePart = scheduleEditorScheduledEnd;
      
      // Check if end time is earlier than start time
      if (endTimePart < startTimePart) {
        setScheduleEditorError('结束时间不能早于开始时间');
        return;
      }
      
      // Format scheduled end as YYYY-MM-DDTHH:mm
      scheduledEnd = `${datePart}T${endTimePart}`;
    }
    
    try {
      // Update task
      await updateTask({
        id: editingScheduleTask.id,
        estimate_min: estimateMin,
        scheduled_end: scheduledEnd,
      });
      
      // Close editor and refresh data
      handleCloseScheduleEditor();
      loadTodayData(yyyymmdd);
    } catch (error) {
      console.error('更新任务排程失败:', error);
      setScheduleEditorError(`更新任务排程失败: ${(error as Error).message}`);
    }
  };

  // Add tag to tags editor
  const handleAddTag = () => {
    if (tagsEditorInput.trim() && !tagsEditorTags.includes(tagsEditorInput.trim())) {
      setTagsEditorTags([...tagsEditorTags, tagsEditorInput.trim()]);
      setTagsEditorInput('');
    }
  };

  // Remove tag from tags editor
  const handleRemoveTag = (index: number) => {
    setTagsEditorTags(tagsEditorTags.filter((_, i) => i !== index));
  };

  // Save tags from tags editor
  const handleSaveTags = async () => {
    if (editingTagsTask) {
      await handleUpdateTags(editingTagsTask.id, tagsEditorTags);
      handleCloseTagsEditor();
    }
  };

  // Filter-related functions
  const handleToggleTagFilter = (tag: string) => {
    const updatedTags = uiState.filters.tags.includes(tag)
      ? uiState.filters.tags.filter(t => t !== tag)
      : [...uiState.filters.tags, tag];
    
    updateUIState({
      filters: {
        ...uiState.filters,
        tags: updatedTags,
      },
    });
  };

  const handleSetPriorityFilter = (priority: string | undefined) => {
    const updatedPriority = priority === uiState.filters.priority ? undefined : priority;
    
    updateUIState({
      filters: {
        ...uiState.filters,
        priority: updatedPriority,
      },
    });
  };

  const handleClearFilters = () => {
    updateUIState({
      filters: {
        tags: [],
        priority: undefined,
      },
    });
  };

  // Get all unique tags from today's tasks
  const getAllUniqueTags = (): string[] => {
    if (!todayData) return [];
    
    const allTasks = [
      ...todayData.kanban.backlog,
      ...todayData.kanban.todo,
      ...todayData.kanban.doing,
      ...todayData.kanban.done
    ];
    
    const tagSet = new Set<string>();
    for (const task of allTasks) {
      if (task.tags) {
        for (const tag of task.tags) {
          tagSet.add(tag);
        }
      }
    }
    
    return Array.from(tagSet).sort();
  };

  // Filter tasks based on selected filters
  const filterTasks = (tasks: Task[]): Task[] => {
    const { tags: filterTags, priority: filterPriority } = uiState.filters;
    
    return tasks.filter(task => {
      // Filter by tags (if any selected)
      if (filterTags.length > 0) {
        const taskTags = task.tags || [];
        // Task must have all selected tags
        if (!filterTags.every(tag => taskTags.includes(tag))) {
          return false;
        }
      }
      
      // Filter by priority (if selected)
      if (filterPriority) {
        if (task.priority !== filterPriority) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Get filtered tasks for each status
  const getFilteredTasks = () => {
    if (!todayData) {
      return {
        backlog: [],
        todo: [],
        doing: [],
        done: []
      };
    }
    
    return {
      backlog: filterTasks(todayData.kanban.backlog),
      todo: filterTasks(todayData.kanban.todo),
      doing: filterTasks(todayData.kanban.doing),
      done: filterTasks(todayData.kanban.done)
    };
  };

  // Render timeline event
  const renderTimelineEvent = (task: Task) => {
    // Calculate estimated end time
    const estimatedEnd = calculateEstimatedEnd(task.scheduled_start, task.estimate_min);
    
    // Determine end time to display based on priority rules
    let endTimeDisplay = '';
    if (task.scheduled_end) {
      // Priority 1: Use actual scheduled end time
      endTimeDisplay = `结束: ${formatTime(task.scheduled_end)}`;
    } else if (estimatedEnd) {
      // Priority 2: Use calculated estimated end time
      endTimeDisplay = `预计结束: ${formatTime(estimatedEnd)}`;
    }
    
    return (
      <div key={task.id} className="timeline-event blue">
        <div className="timeline-event-title">{task.title}</div>
        {task.estimate_min && (
          <div className="timeline-event-desc">预计 {task.estimate_min} 分钟</div>
        )}
        {endTimeDisplay && (
          <div className="timeline-event-desc">{endTimeDisplay}</div>
        )}
      </div>
    );
  };
  
  // Handle task card click to open note
  const handleTaskCardClick = async (task: Task) => {
    try {
      const result = await planningOpenTaskNote(task.id);
      console.log('Task note opened:', result.mdPath);
      // 这里假设已经有一个函数可以打开Markdown文件
      // 实际项目中应该调用现有的打开文件机制
    } catch (error) {
      console.error('Failed to open task note:', error);
      alert(`打开任务笔记失败: ${(error as Error).message}`);
    }
  };

  // 自定义 SortableItem 组件，用于包装任务卡片，使其支持拖拽
  const SortableTaskCard = ({ task, columnId }: { task: Task; columnId: string }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
    } = useSortable({
      id: task.id,
      data: {
        columnId,
        task,
      },
    });
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };
    
    return (
      <div ref={setNodeRef} style={style} {...attributes}>
        {/* 任务卡片包装器 */}
        <div className="task-card-wrapper">
          {/* 拖拽句柄 - 只有点击这个区域才会触发拖拽 */}
          <div className="task-card-drag-handle" {...listeners}>
            {/* 拖拽指示图标 */}
            <svg className="drag-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </div>
          {/* 任务卡片内容 - 点击这个区域不会触发拖拽 */}
          {renderTaskCard(task)}
        </div>
      </div>
    );
  };
  
  // Render task card
  const renderTaskCard = (task: Task) => {
    const isActive = task.status === 'doing';
    
    // Check if this task has an active timer
    const hasActiveTimer = todayData?.currentDoing?.id === task.id;
    // Get the start time from the current timer
    const startTime = hasActiveTimer && todayData?.currentTimer ? todayData.currentTimer.start_at : undefined;
    // Calculate elapsed time
    const elapsedTime = startTime ? formatElapsedTime(startTime) : '00:00:00';
    
    // Priority badge text mapping
    const priorityBadgeText: Record<string, string> = {
      'high': '高',
      'medium': '中',
      'low': '低'
    };
    
    return (
      <div 
        className={`task-card ${isActive ? 'active' : ''} ${task.status === 'todo' ? 'blue-border' : ''}`}
        onClick={() => handleTaskCardClick(task)}
      >
        <div className="task-card-header">
          <div className="task-tag">{task.status}</div>
          {/* Priority badge */}
          {task.priority && (
            <div className={`task-priority-badge priority-${task.priority}`}>
              {priorityBadgeText[task.priority]}
            </div>
          )}
          {isActive && <div className="task-card-avatar">{task.title.substring(0, 2).toUpperCase()}</div>}
          <div className="task-card-actions">
            <button 
              className="task-card-menu-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenStatusMenu(e, task);
              }}
              title="切换状态"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
          </div>
        </div>
        <div className="task-title">{task.title}</div>
        {/* Tags display */}
        {task.tags && task.tags.length > 0 && (
          <div className="task-tags">
            {task.tags.slice(0, 2).map((tag, index) => (
              <span key={index} className="task-tag-item">{tag}</span>
            ))}
            {task.tags.length > 2 && (
              <span className="task-tag-more">+{task.tags.length - 2}</span>
            )}
          </div>
        )}
        <div className="task-meta">
          {task.estimate_min && (
            <div className="task-meta-left">
              <div className="task-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {task.estimate_min}m
              </div>
            </div>
          )}
          {hasActiveTimer && (
            <div className="task-timer">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span className="task-timer-text">{elapsedTime}</span>
            </div>
          )}
          {isActive && <span className="task-status">正在进行...</span>}
        </div>
        <div className="task-actions">
          {/* 根据任务状态显示开始/停止按钮 */}
          {!isActive && task.status !== 'done' && (
            <button 
              className="task-action-btn start-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleStartTask(task.id);
              }}
              title="开始任务"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              开始
            </button>
          )}
          {isActive && (
            <button 
              className="task-action-btn stop-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleStopTask(task.id);
              }}
              title="停止任务"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              停止
            </button>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <>
      <section className="home-pane">
        <div className="dashboard-container">
          {/* Header */}
          <header className="dashboard-header">
            <div className="dashboard-header-left">
              <div className="dashboard-logo">P</div>
              <div className="dashboard-date-info">
                <h1 className="dashboard-date">{month}{day}日 {weekday}</h1>
                <span className="dashboard-subtitle">今日规划与执行看板</span>
              </div>
            </div>
            
            {/* Vault Selection CTA */}
            {!hasVault && (
              <div className="dashboard-vault-cta">
                <span className="vault-cta-text">请选择工作目录以开始规划</span>
                <button className="vault-cta-button" onClick={onSelectVault}>
                  选择目录
                </button>
              </div>
            )}
            
            <div className="dashboard-search">
              <span className="dashboard-search-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input type="text" className="dashboard-search-input" placeholder="搜索任务..." />
            </div>
            
            <div className="dashboard-header-right">
              <button className="dashboard-notification-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </button>
              <button className="dashboard-daily-btn" onClick={handleOpenDaily}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                每日日志
              </button>
              <button className="dashboard-new-task-btn" onClick={handleOpenCreateModal}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                新建任务
              </button>
            </div>
          </header>
          
          {/* Main Content */}
          <main className="dashboard-main">
            {/* Timeline Sidebar */}
            <aside className={`timeline-sidebar ${uiState.layout.timelineCollapsed ? 'collapsed' : ''}`}>
              <div className="timeline-header">
                <div className="timeline-schedule-info">
                  <span className="timeline-schedule-label">已排期:</span>
                  <span className="timeline-schedule-hours">
                    {todayData ? getTotalScheduledHours(todayData.timeline) : '0.0'}h
                  </span>
                </div>
                <div className="timeline-date-nav">
                  <button className="timeline-nav-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                  </button>
                  <button className="timeline-nav-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                  <span className="timeline-today-badge">今日</span>
                </div>
                {/* Timeline Collapse Toggle */}
                <button 
                  className={`timeline-collapse-btn ${uiState.layout.timelineCollapsed ? 'collapsed' : ''}`}
                  onClick={() => updateUIState({
                    layout: {
                      timelineCollapsed: !uiState.layout.timelineCollapsed
                    }
                  })}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {uiState.layout.timelineCollapsed ? (
                      <polyline points="15 18 9 12 15 6"></polyline>
                    ) : (
                      <polyline points="9 18 15 12 9 6"></polyline>
                    )}
                  </svg>
                </button>
              </div>
              
              {/* Filtered indicator */}
              {(uiState.filters.tags.length > 0 || uiState.filters.priority) && (
                <div className="timeline-filter-indicator">
                  <span>筛选中</span>
                  <button 
                    className="timeline-filter-clear-btn"
                    onClick={handleClearFilters}
                  >
                    清除
                  </button>
                </div>
              )}
              
              <div className="timeline-content">
                <div className="timeline-container">
                  {/* Now Indicator */}
                  <div className="timeline-now-indicator">
                    <div className="timeline-now-time">{currentTime}</div>
                    <div className="timeline-now-line">
                      <div className="timeline-now-dot"></div>
                    </div>
                  </div>
                  
                  {/* Timeline Hours */}
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">08:00</div>
                    <div className="timeline-hour-line"></div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">09:00</div>
                    <div className="timeline-hour-line">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '09:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">10:00</div>
                    <div className="timeline-hour-line">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '10:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">11:00</div>
                    <div className="timeline-hour-line">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '11:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">12:00</div>
                    <div className="timeline-hour-line">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '12:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">13:00</div>
                    <div className="timeline-hour-line">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '13:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">14:00</div>
                    <div className="timeline-hour-line">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '14:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">15:00</div>
                    <div className="timeline-hour-line">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '15:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">16:00</div>
                    <div className="timeline-hour-line">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '16:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
            
            {/* Kanban Section */}
            <section className="kanban-section">
              <div className="kanban-header">
                <div className="kanban-title-section">
                  <h2 className="kanban-title">任务执行看板</h2>
                  <nav className="kanban-nav">
                    <button className="kanban-nav-btn active">我的任务</button>
                    <button className="kanban-nav-btn">团队协作</button>
                    <button className="kanban-nav-btn">归档项目</button>
                  </nav>
                </div>
                <div className="kanban-actions">
                  <div className="kanban-view-toggle">
                    <button className="kanban-view-btn active">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                      </svg>
                    </button>
                    <button className="kanban-view-btn">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  <button className="kanban-filter-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Filter Bar */}
              <div className="kanban-filter-bar">
                <div className="kanban-filter-section">
                  <span className="kanban-filter-label">标签:</span>
                  <div className="kanban-filter-tags">
                    {getAllUniqueTags().map(tag => (
                      <button 
                        key={tag}
                        className={`kanban-filter-tag ${uiState.filters.tags.includes(tag) ? 'active' : ''}`}
                        onClick={() => handleToggleTagFilter(tag)}
                      >
                        {tag}
                        {uiState.filters.tags.includes(tag) && (
                          <span className="kanban-filter-tag-remove">&times;</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="kanban-filter-section">
                  <span className="kanban-filter-label">优先级:</span>
                  <div className="kanban-filter-priorities">
                    <button 
                      className={`kanban-filter-priority ${uiState.filters.priority === 'high' ? 'active' : ''}`}
                      onClick={() => handleSetPriorityFilter('high')}
                    >
                      高
                    </button>
                    <button 
                      className={`kanban-filter-priority ${uiState.filters.priority === 'medium' ? 'active' : ''}`}
                      onClick={() => handleSetPriorityFilter('medium')}
                    >
                      中
                    </button>
                    <button 
                      className={`kanban-filter-priority ${uiState.filters.priority === 'low' ? 'active' : ''}`}
                      onClick={() => handleSetPriorityFilter('low')}
                    >
                      低
                    </button>
                  </div>
                </div>
                {(uiState.filters.tags.length > 0 || uiState.filters.priority) && (
                  <button className="kanban-filter-clear" onClick={handleClearFilters}>
                    清除筛选
                  </button>
                )}
              </div>
              
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="kanban-columns">
                  {/* Backlog */}
                  <div className="kanban-column">
                    <div className="kanban-column-header">
                      <div className="kanban-column-title-section">
                        <span className="kanban-column-title">待排期</span>
                        <span className="kanban-column-count">
                          {getFilteredTasks().backlog.length}
                        </span>
                      </div>
                      <button className="kanban-column-add-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                      </button>
                    </div>
                    <div className="kanban-tasks" id="column:backlog">
                      <SortableContext items={getFilteredTasks().backlog.map(task => task.id)} strategy={verticalListSortingStrategy}>
                        {isLoading ? (
                          <div className="loading-message">加载中...</div>
                        ) : error ? (
                          <div className="error-message">加载失败: {error.message}</div>
                        ) : todayData ? (
                          getFilteredTasks().backlog.length > 0 ? (
                            getFilteredTasks().backlog.map(task => (
                              <SortableTaskCard key={task.id} task={task} columnId="backlog" />
                            ))
                          ) : (
                            <div className="empty-message">
                              {(uiState.filters.tags.length > 0 || uiState.filters.priority) ? 
                                '筛选条件下暂无任务' : '暂无任务'}
                            </div>
                          )
                        ) : (
                          <div className="empty-message">暂无任务</div>
                        )}
                      </SortableContext>
                    </div>
                  </div>
                  
                  {/* To Do */}
                  <div className="kanban-column">
                    <div className="kanban-column-header">
                      <div className="kanban-column-title-section">
                        <span className="kanban-column-title">待做</span>
                        <span className="kanban-column-count">
                          {getFilteredTasks().todo.length}
                        </span>
                      </div>
                      <button className="kanban-column-add-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                      </button>
                    </div>
                    <div className="kanban-tasks" id="column:todo">
                      <SortableContext items={getFilteredTasks().todo.map(task => task.id)} strategy={verticalListSortingStrategy}>
                        {isLoading ? (
                          <div className="loading-message">加载中...</div>
                        ) : error ? (
                          <div className="error-message">加载失败: {error.message}</div>
                        ) : todayData ? (
                          getFilteredTasks().todo.length > 0 ? (
                            getFilteredTasks().todo.map(task => (
                              <SortableTaskCard key={task.id} task={task} columnId="todo" />
                            ))
                          ) : (
                            <div className="empty-message">
                              {(uiState.filters.tags.length > 0 || uiState.filters.priority) ? 
                                '筛选条件下暂无任务' : '暂无任务'}
                            </div>
                          )
                        ) : (
                          <div className="empty-message">暂无任务</div>
                        )}
                      </SortableContext>
                    </div>
                  </div>
                  
                  {/* In Progress */}
                  <div className="kanban-column active">
                    <div className="kanban-column-header">
                      <div className="kanban-column-title-section">
                        <span className="kanban-column-title">进行中</span>
                        <span className="kanban-column-count">
                          {getFilteredTasks().doing.length}
                        </span>
                      </div>
                    </div>
                    <div className="kanban-tasks" id="column:doing">
                      <SortableContext items={getFilteredTasks().doing.map(task => task.id)} strategy={verticalListSortingStrategy}>
                        {isLoading ? (
                          <div className="loading-message">加载中...</div>
                        ) : error ? (
                          <div className="error-message">加载失败: {error.message}</div>
                        ) : todayData ? (
                          getFilteredTasks().doing.length > 0 ? (
                            getFilteredTasks().doing.map(task => (
                              <SortableTaskCard key={task.id} task={task} columnId="doing" />
                            ))
                          ) : (
                            <div className="empty-message">
                              {(uiState.filters.tags.length > 0 || uiState.filters.priority) ? 
                                '筛选条件下暂无任务' : '暂无任务'}
                            </div>
                          )
                        ) : (
                          <div className="empty-message">暂无任务</div>
                        )}
                      </SortableContext>
                    </div>
                  </div>
                  
                  {/* Completed */}
                  <div className="kanban-column">
                    <div className="kanban-column-header">
                      <div className="kanban-column-title-section">
                        <span className="kanban-column-title">已完成</span>
                        <span className="kanban-column-count">
                          {getFilteredTasks().done.length}
                        </span>
                      </div>
                    </div>
                    <div className="kanban-tasks" id="column:done">
                      <SortableContext items={getFilteredTasks().done.map(task => task.id)} strategy={verticalListSortingStrategy}>
                        {isLoading ? (
                          <div className="loading-message">加载中...</div>
                        ) : error ? (
                          <div className="error-message">加载失败: {error.message}</div>
                        ) : todayData ? (
                          getFilteredTasks().done.length > 0 ? (
                            getFilteredTasks().done.map(task => (
                              <SortableTaskCard key={task.id} task={task} columnId="done" />
                            ))
                          ) : (
                            <div className="empty-message">
                              {(uiState.filters.tags.length > 0 || uiState.filters.priority) ? 
                                '筛选条件下暂无任务' : '暂无任务'}
                            </div>
                          )
                        ) : (
                          <div className="empty-message">暂无任务</div>
                        )}
                      </SortableContext>
                    </div>
                  </div>
                </div>
              </DndContext>
              
              <div className="kanban-footer">
                <p className="kanban-footer-text">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  点击卡片查看详情，拖拽卡片至左侧时间轴可快速排期
                </p>
              </div>
            </section>
          </main>
        </div>
      </section>
      
      {/* 新建任务模态框 */}
      <TaskCreateModal
        open={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onCreated={handleTaskCreated}
      />
      
      {/* 任务状态切换菜单 */}
      {isStatusMenuOpen && selectedTask && (
        <div 
          className="status-menu"
          style={{ 
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
            zIndex: 1000
          }}
        >
          <div className="status-menu-content">
            {/* 显示任务标题 */}
            <div className="status-menu-title">{selectedTask.title}</div>
            <div className="status-menu-divider"></div>
            
            {/* 根据当前状态显示可用选项 */}
            {selectedTask.status === 'backlog' && (
              <>
                <button 
                  className="status-menu-item"
                  onClick={() => handleChangeTaskStatus('todo')}
                >
                  移到待做
                </button>
                <button 
                  className="status-menu-item"
                  onClick={() => handleMarkTaskDone(selectedTask.id)}
                >
                  标记为已完成
                </button>
              </>
            )}
            
            {selectedTask.status === 'todo' && (
              <>
                <button 
                  className="status-menu-item"
                  onClick={() => handleChangeTaskStatus('backlog')}
                >
                  移到待排期
                </button>
                <button 
                  className="status-menu-item"
                  onClick={() => handleMarkTaskDone(selectedTask.id)}
                >
                  标记为已完成
                </button>
              </>
            )}
            
            {selectedTask.status === 'doing' && (
              <>
                {/* doing状态不允许直接切换，只能通过start/stop */}
                <button 
                  className="status-menu-item disabled"
                  disabled
                >
                  移到待排期（不允许）
                </button>
                <button 
                  className="status-menu-item disabled"
                  disabled
                >
                  移到待做（不允许）
                </button>
                <button 
                  className="status-menu-item"
                  onClick={() => handleMarkTaskDone(selectedTask.id)}
                >
                  标记为已完成
                </button>
              </>
            )}
            
            {selectedTask.status === 'done' && (
              <>
                <button 
                  className="status-menu-item"
                  onClick={() => handleReopenTask(selectedTask.id)}
                >
                  重新打开
                </button>
                <button 
                  className="status-menu-item"
                  onClick={() => handleChangeTaskStatus('backlog')}
                >
                  移到待排期
                </button>
              </>
            )}
            
            {/* 优先级设置 */}
            <div className="status-menu-divider"></div>
            <div className="status-menu-section-title">设置优先级：</div>
            <button 
              className={`status-menu-item ${selectedTask.priority === 'high' ? 'active' : ''}`}
              onClick={() => handleUpdatePriority(selectedTask.id, 'high')}
            >
              高优先级
            </button>
            <button 
              className={`status-menu-item ${selectedTask.priority === 'medium' ? 'active' : ''}`}
              onClick={() => handleUpdatePriority(selectedTask.id, 'medium')}
            >
              中优先级
            </button>
            <button 
              className={`status-menu-item ${selectedTask.priority === 'low' ? 'active' : ''}`}
              onClick={() => handleUpdatePriority(selectedTask.id, 'low')}
            >
              低优先级
            </button>
            <button 
              className={`status-menu-item ${selectedTask.priority === undefined ? 'active' : ''}`}
              onClick={() => handleUpdatePriority(selectedTask.id, undefined)}
            >
              清除优先级
            </button>
            
            {/* Tags management */}
            <div className="status-menu-divider"></div>
            <div className="status-menu-section-title">标签管理：</div>
            <button 
              className="status-menu-item"
              onClick={() => handleOpenTagsEditor(selectedTask)}
            >
              编辑标签
            </button>
            
            {/* Schedule management */}
            <div className="status-menu-divider"></div>
            <div className="status-menu-section-title">排程管理：</div>
            <button 
              className="status-menu-item"
              onClick={() => handleOpenScheduleEditor(selectedTask)}
            >
              编辑排程
            </button>
          </div>
        </div>
      )}
      
      {/* 标签编辑器 */}
      {isTagsEditorOpen && editingTagsTask && (
        <div className="tags-editor-overlay">
          <div className="tags-editor">
            <div className="tags-editor-header">
              <h3>编辑标签 - {editingTagsTask.title}</h3>
              <button 
                className="tags-editor-close"
                onClick={handleCloseTagsEditor}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="tags-editor-content">
              <div className="tags-editor-form">
                <div className="tags-editor-form-group">
                  <label>标签列表</label>
                  <div className="tags-editor-tags-list">
                    {tagsEditorTags.map((tag, index) => (
                      <span key={index} className="tags-editor-tag-item">
                        {tag}
                        <button 
                          className="tags-editor-tag-remove"
                          onClick={() => handleRemoveTag(index)}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                    {tagsEditorTags.length === 0 && (
                      <div className="tags-editor-empty">暂无标签，添加一个吧</div>
                    )}
                  </div>
                </div>
                <div className="tags-editor-form-group">
                  <label>添加新标签</label>
                  <div className="tags-editor-input-group">
                    <input
                      type="text"
                      className="tags-editor-input"
                      placeholder="输入标签名称，按Enter添加"
                      value={tagsEditorInput}
                      onChange={(e) => setTagsEditorInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddTag();
                        }
                      }}
                    />
                    <button 
                      className="tags-editor-add-btn"
                      onClick={handleAddTag}
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="tags-editor-footer">
              <button 
                className="tags-editor-cancel-btn"
                onClick={handleCloseTagsEditor}
              >
                取消
              </button>
              <button 
                className="tags-editor-save-btn"
                onClick={handleSaveTags}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 排程编辑器 */}
      {isScheduleEditorOpen && editingScheduleTask && (
        <div className="schedule-editor-overlay">
          <div className="schedule-editor">
            <div className="schedule-editor-header">
              <h3>编辑排程 - {editingScheduleTask.title}</h3>
              <button 
                className="schedule-editor-close"
                onClick={handleCloseScheduleEditor}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="schedule-editor-content">
              {scheduleEditorError && (
                <div className="schedule-editor-error">
                  {scheduleEditorError}
                </div>
              )}
              <div className="schedule-editor-form">
                <div className="schedule-editor-form-group">
                  <label htmlFor="estimate-min">预计时间（分钟）</label>
                  <input 
                    type="number" 
                    id="estimate-min"
                    className="schedule-editor-input"
                    placeholder="输入预计时间（1-1440）"
                    value={scheduleEditorEstimateMin}
                    onChange={(e) => setScheduleEditorEstimateMin(e.target.value)}
                    min="1"
                    max="1440"
                  />
                </div>
                <div className="schedule-editor-form-group">
                  <label htmlFor="scheduled-end">结束时间</label>
                  {editingScheduleTask.scheduled_start ? (
                    <input 
                      type="time" 
                      id="scheduled-end"
                      className="schedule-editor-input"
                      placeholder="选择结束时间"
                      value={scheduleEditorScheduledEnd}
                      onChange={(e) => setScheduleEditorScheduledEnd(e.target.value)}
                      step="300" /* 5分钟步进 */
                    />
                  ) : (
                    <div className="schedule-editor-notice">
                      此任务尚未设置开始时间，无法设置结束时间
                    </div>
                  )}
                </div>
              </div>
              <div className="schedule-editor-footer">
                <button 
                  className="schedule-editor-cancel-btn"
                  onClick={handleCloseScheduleEditor}
                >
                  取消
                </button>
                <button 
                  className="schedule-editor-save-btn"
                  onClick={handleSaveSchedule}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Home;
