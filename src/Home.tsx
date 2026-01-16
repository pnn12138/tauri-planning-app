import { useEffect, useRef, useState } from 'react';
import { usePlanningStore, loadTodayData, markTaskDone, reopenTask, updateTask, startTask, stopTask, updateKanban, setIsDragging, reorderTasks, updateUIState, setCurrentVaultId, loadUIState, saveSnapshot, rollback, getTaskById } from './features/planning/planning.store';
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
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragMoveEvent,
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

const toDatetimeLocalInput = (value: string | undefined): string => {
  if (!value) return '';
  return value.slice(0, 16);
};

// Get total scheduled hours for today
const getTotalScheduledHours = (tasks: Task[]): string => {
  const totalMinutes = tasks.reduce((sum, task) => {
    return sum + (task.estimate_min || 0);
  }, 0);
  return (totalMinutes / 60).toFixed(1);
};

// Convert time string (HH:MM) to minutes since midnight
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Check if a time slot is available for a task
const isTimeSlotAvailable = (tasks: Task[], scheduledStart: string, duration: number): boolean => {
  const startMinutes = timeToMinutes(scheduledStart);
  const endMinutes = startMinutes + duration;
  
  return !tasks.some(task => {
    if (!task.scheduled_start || !task.estimate_min) return false;
    
    const taskStart = timeToMinutes(task.scheduled_start);
    const taskEnd = taskStart + task.estimate_min;
    
    // Check if there's any overlap
    return (startMinutes < taskEnd) && (endMinutes > taskStart);
  });
};

// Throttle function to limit the rate at which a function can fire
const throttle = <T extends (...args: any[]) => any>(func: T, limit: number): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return function(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
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
  
  // 任务编辑模态框状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<Task['status']>('backlog');
  const [editPriority, setEditPriority] = useState<Task['priority'] | ''>('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editEstimateMin, setEditEstimateMin] = useState('');
  const [editScheduledStart, setEditScheduledStart] = useState('');
  const [editScheduledEnd, setEditScheduledEnd] = useState('');
  const [editTagsInput, setEditTagsInput] = useState('');
  
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
  
  // 拖拽状态管理
  const [isDragging, setIsDragging] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [draggingOverColumn, setDraggingOverColumn] = useState<string | null>(null);
  const [draggingOverTimeline, setDraggingOverTimeline] = useState<string | null>(null);
  const [draggingSize, setDraggingSize] = useState<{ width: number; height: number } | null>(null);
  const lastOverIdRef = useRef<string | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragRectRef = useRef<DOMRect | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  const getColumnIdFromPoint = (x: number, y: number): string | null => {
    const elements = document.elementsFromPoint(x, y);
    for (const element of elements) {
      const column = element.closest?.('.kanban-column') as HTMLElement | null;
      if (column?.id) {
        return column.id;
      }
    }
    return null;
  };
  
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

  const backlogDroppable = useDroppable({
    id: 'column:backlog',
    data: { columnId: 'backlog' },
  });
  const todoDroppable = useDroppable({
    id: 'column:todo',
    data: { columnId: 'todo' },
  });
  const doingDroppable = useDroppable({
    id: 'column:doing',
    data: { columnId: 'doing' },
  });
  const doneDroppable = useDroppable({
    id: 'column:done',
    data: { columnId: 'done' },
  });
  
  // 拖拽开始处理
  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
    setDraggingTaskId(event.active.id as string);
    setDraggingOverColumn(null);
    setDraggingOverTimeline(null);
    const rect = event.active.rect.current?.initial;
    if (rect) {
      setDraggingSize({ width: rect.width, height: rect.height });
    } else {
      setDraggingSize(null);
    }
  };
  
  // 拖拽过程处理（使用节流优化性能，添加拖拽目标检测）
  const handleDragMove = throttle((event: DragMoveEvent) => {
    const { over } = event;
    const activatorEvent = event.activatorEvent as PointerEvent | undefined;
    if (activatorEvent && 'clientX' in activatorEvent) {
      lastPointerRef.current = { x: activatorEvent.clientX, y: activatorEvent.clientY };
    }
    const translatedRect = event.active.rect.current?.translated ?? event.active.rect.current?.initial ?? null;
    if (translatedRect) {
      lastDragRectRef.current = translatedRect as DOMRect;
      const centerX = translatedRect.left + translatedRect.width / 2;
      const centerY = translatedRect.top + translatedRect.height / 2;
      const columnId = getColumnIdFromPoint(centerX, centerY);
      if (columnId) {
        lastOverIdRef.current = columnId;
        setDraggingOverColumn(columnId);
        setDraggingOverTimeline(null);
        return;
      }
    }
    
    if (over) {
      if (typeof over.id === 'string' && over.id.startsWith('column:')) {
        setDraggingOverColumn(over.id);
        setDraggingOverTimeline(null);
      } else if (typeof over.id === 'string' && over.id.startsWith('timeline:')) {
        setDraggingOverTimeline(over.id);
        setDraggingOverColumn(null);
      } else {
        setDraggingOverColumn(null);
        setDraggingOverTimeline(null);
      }
    } else {
      const pointer = lastPointerRef.current;
      const columnId = pointer ? getColumnIdFromPoint(pointer.x, pointer.y) : null;
      if (columnId) {
        lastOverIdRef.current = columnId;
      }
      setDraggingOverColumn(columnId);
      setDraggingOverTimeline(null);
    }
  }, 50);

  const handleDragOver = (event: DragOverEvent) => {
    if (event.over?.id) {
      lastOverIdRef.current = event.over.id as string;
    }
  };
  
  // 拖拽结束处理
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const lastOverId = lastOverIdRef.current;
    lastOverIdRef.current = null;
    const pointer = lastPointerRef.current;
    lastPointerRef.current = null;
    const dragRect = lastDragRectRef.current;
    lastDragRectRef.current = null;
    setIsDragging(false);
    setDraggingTaskId(null);
    setDraggingOverColumn(null);
    setDraggingOverTimeline(null);
    setDraggingSize(null);
    
    let overId = (over?.id ?? lastOverId) as string | null;
    if (!overId && pointer) {
      overId = getColumnIdFromPoint(pointer.x, pointer.y);
    }
    if (!overId && dragRect) {
      const centerX = dragRect.left + dragRect.width / 2;
      const centerY = dragRect.top + dragRect.height / 2;
      overId = getColumnIdFromPoint(centerX, centerY);
    }
    // 确保拖拽目标有效
    if (!overId || active.id === overId) {
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
    const isOverColumn = typeof overId === 'string' && overId.startsWith('column:');
    
    // 检查 over 是否为时间线项目
    const isOverTimeline = typeof overId === 'string' && overId.startsWith('timeline:');
    
    if (isOverTimeline) {
      // 处理时间线拖拽
      // 从 over.id 中提取时间信息，格式：timeline:HH:MM
      if (typeof overId === 'string') {
        const timeStr = overId.replace('timeline:', '');
        
        // 验证：检查任务是否有预估时间
        if (!draggedTask.estimate_min) {
          alert('请先为任务设置预估时间，再进行排期');
          return;
        }
        
        // 验证：检查时间格式
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(timeStr)) {
          alert('无效的时间格式');
          return;
        }
        
        // 验证：检查时间段是否可用，避免与现有任务重叠
        const isAvailable = isTimeSlotAvailable(todayData.timeline, timeStr, draggedTask.estimate_min);
        if (!isAvailable) {
          alert('该时间段已被其他任务占用，请选择其他时间段');
          return;
        }
        
        // 实现将任务添加到时间线的逻辑
        // 1. 准备任务数据
        const scheduledStart = `${yyyymmdd}T${timeStr}`;
        const estimatedEnd = calculateEstimatedEnd(scheduledStart, draggedTask.estimate_min);
        
        // 2. 检查时间段是否被占用（基于任务时长的精确检查）
        let hasConflict = false;
        
        if (todayData && todayData.timeline) {
            const [startHour, startMinute] = timeStr.split(':').map(Number);
            const startTotalMinutes = startHour * 60 + startMinute;
            const endTotalMinutes = startTotalMinutes + (draggedTask.estimate_min || 0);
            
            hasConflict = todayData.timeline.some(task => {
                if (!task.scheduled_start || !task.estimate_min) return false;
                
                const taskStart = formatTime(task.scheduled_start);
                const [taskHour, taskMinute] = taskStart.split(':').map(Number);
                const taskStartTotalMinutes = taskHour * 60 + taskMinute;
                const taskEndTotalMinutes = taskStartTotalMinutes + task.estimate_min;
                
                // 检查时间重叠
                return !(endTotalMinutes <= taskStartTotalMinutes || startTotalMinutes >= taskEndTotalMinutes);
            });
        }
        
        // 3. 如果有冲突，显示确认对话框
        if (hasConflict) {
            const confirmOverwrite = window.confirm(`该时间段已有任务，是否继续排期？`);
            if (!confirmOverwrite) {
                return;
            }
        }
        
        // 4. 更新任务
        try {
            // 将任务从原看板列中移除
            await updateTask({
                id: draggedTask.id,
                status: 'todo', // 将任务状态改为todo，因为已排期
                scheduled_start: scheduledStart,
                scheduled_end: estimatedEnd,
            });
            
            // 5. 从原列中移除任务（乐观更新）
            const updatedSourceTasks = sourceTasks.filter(task => task.id !== draggedTask.id);
            const updatedKanban = {
                ...todayData.kanban,
                [sourceColumnId]: updatedSourceTasks,
            };
            updateKanban(updatedKanban);
            
            // 6. 重新加载数据确保一致性
            await loadTodayData(yyyymmdd);
            
            // 7. 保存快照
            saveSnapshot();
            
            // 8. 显示成功提示
            alert(`任务 "${draggedTask.title}" 已成功排期到 ${timeStr}`);
        } catch (error) {
            console.error('Failed to schedule task:', error);
            alert(`排期失败: ${(error as Error).message}`);
            // 回滚到快照状态
            rollback();
        }
        
        return;
      }
    } else if (!isOverColumn) {
      // over 是任务，获取目标列信息
      const overTaskData = over?.data?.current;
      if (overTaskData) {
        targetColumnId = overTaskData.columnId;
        // 确保目标列 ID 有效
        if (!validColumnIds.includes(targetColumnId as any)) {
          console.error('Invalid target column ID:', targetColumnId);
          return;
        }
        
        targetTasks = [...todayData.kanban[targetColumnId as typeof validColumnIds[number]]];
        insertIndex = targetTasks.findIndex(task => task.id === overId);
      } else {
        // 如果无法从 over.data 获取目标列信息，尝试查找 over.id 对应的任务
        // 遍历所有列，查找 over.id 对应的任务
        let foundTask = null;
        for (const columnId of validColumnIds) {
          const tasks = todayData.kanban[columnId as typeof validColumnIds[number]];
          foundTask = tasks.find(task => task.id === overId);
          if (foundTask) {
            targetColumnId = columnId as string;
            break;
          }
        }
        
        if (foundTask) {
          targetTasks = [...todayData.kanban[targetColumnId as typeof validColumnIds[number]]];
          insertIndex = targetTasks.findIndex(task => task.id === overId);
        } else {
          console.error('Failed to find target task with id:', overId);
          return;
        }
      }
    } else {
      // over 是列容器，获取列 ID
      if (typeof overId === 'string') {
        targetColumnId = overId.replace('column:', '');
        
        // 确保目标列 ID 有效
        if (!validColumnIds.includes(targetColumnId as any)) {
          console.error('Invalid target column ID:', targetColumnId);
          return;
        }
        
        targetTasks = [...todayData.kanban[targetColumnId as typeof validColumnIds[number]]];
        insertIndex = targetTasks.length; // 插入到列尾
      } else {
        console.error('Invalid column ID type:', overId);
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
    
    // 先保存快照，然后再进行乐观更新
    saveSnapshot();
    
    // 本地更新 UI（乐观更新）
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
      // 先快速回滚到快照状态
      rollback();
      // 再异步重拉数据确保最终一致性
      await loadTodayData(yyyymmdd);
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
    e.preventDefault();
    e.stopPropagation();
    setSelectedTask(task);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setIsStatusMenuOpen(true);
  };
  
  const handleCloseStatusMenu = () => {
    setIsStatusMenuOpen(false);
    setSelectedTask(null);
  };

  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? '');
    setEditStatus(task.status);
    setEditPriority(task.priority ?? '');
    setEditDueDate(task.due_date ?? '');
    setEditEstimateMin(task.estimate_min ? String(task.estimate_min) : '');
    setEditScheduledStart(toDatetimeLocalInput(task.scheduled_start));
    setEditScheduledEnd(toDatetimeLocalInput(task.scheduled_end));
    const tagList = task.tags ?? task.labels ?? [];
    setEditTagsInput(tagList.join(', '));
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingTask(null);
  };

  const handleSaveEditModal = async () => {
    if (!editingTask) return;
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      alert('任务标题不能为空');
      return;
    }
    if ((editStatus === 'todo' || editStatus === 'doing') && !editDueDate) {
      alert('待做/进行中任务需要设置截止日期');
      return;
    }
    const parsedEstimate = editEstimateMin ? Number(editEstimateMin) : undefined;
    if (editEstimateMin && (!Number.isFinite(parsedEstimate) || parsedEstimate <= 0)) {
      alert('预计时间需为正整数');
      return;
    }
    const tags = editTagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
    try {
      await updateTask({
        id: editingTask.id,
        title: nextTitle,
        description: editDescription.trim() || undefined,
        status: editStatus,
        priority: editPriority || undefined,
        due_date: editDueDate ? editDueDate : null,
        estimate_min: parsedEstimate,
        scheduled_start: editScheduledStart || undefined,
        scheduled_end: editScheduledEnd || undefined,
        tags,
      });
      handleCloseEditModal();
    } catch (error) {
      console.error('更新任务失败:', error);
      alert(`更新任务失败: ${(error as Error).message}`);
    }
  };

  const handleOpenEditFromMenu = () => {
    if (!selectedTask) return;
    handleOpenEditModal(selectedTask);
    handleCloseStatusMenu();
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
  // Change task status
  const handleChangeTaskStatus = async (newStatus: Task['status']) => {
    if (!selectedTask) return;
    
    try {
      if ((newStatus === 'todo' || newStatus === 'doing') && !selectedTask.due_date) {
        const input = window.prompt('Enter due date (YYYY-MM-DD)');
        if (!input) {
          return;
        }
        await updateTask({
          id: selectedTask.id,
          status: newStatus,
          due_date: input,
        });
      } else {
        await updateTask({
          id: selectedTask.id,
          status: newStatus,
        });
      }
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
      const task = getTaskById(taskId);
      if (task && !task.due_date) {
        const input = window.prompt('Enter due date (YYYY-MM-DD)');
        if (!input) {
          return;
        }
        await updateTask({
          id: taskId,
          due_date: input,
        });
      }
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

  const draggingTask = draggingTaskId && todayData
    ? [
        ...todayData.kanban.backlog,
        ...todayData.kanban.todo,
        ...todayData.kanban.doing,
        ...todayData.kanban.done,
      ].find(task => task.id === draggingTaskId) || null
    : null;

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
  
  // Handle task card click to open note (debounced to allow double click)
  const handleTaskCardClick = (task: Task) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = window.setTimeout(async () => {
      clickTimerRef.current = null;
      try {
        const result = await planningOpenTaskNote(task.id);
        console.log('Task note opened:', result.mdPath);
        // 这里假设已经有一个函数可以打开Markdown文件
        // 实际项目中应该调用现有的打开文件机制
      } catch (error) {
        console.error('Failed to open task note:', error);
        alert(`打开任务笔记失败: ${(error as Error).message}`);
      }
    }, 220);
  };

  const handleTaskCardDoubleClick = (task: Task) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    handleOpenEditModal(task);
  };

  // 自定义 SortableItem 组件，用于包装任务卡片，使其支持拖拽
  const SortableTaskCard = ({ task, columnId }: { task: Task; columnId: string }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({
      id: task.id,
      data: {
        columnId,
        task,
      },
    });
    
    const style = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
      opacity: isDragging ? 0 : 1, // 拖拽时原位置卡片透明化
    };
    
    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        className={`task-card-wrapper ${isDragging ? 'dragging' : ''}`}
        {...attributes}
      >
        {renderTaskCard(task, listeners)}
      </div>
    );
  };
  
  // Render task card
  const renderTaskCard = (task: Task, listeners: any) => {
    const isActive = task.status === 'doing';
    const isCompleted = task.status === 'done';
    
    // Check if this task has an active timer
    const hasActiveTimer = todayData?.currentDoing?.id === task.id;
    // Get the start time from the current timer
    const startTime = hasActiveTimer && todayData?.currentTimer ? todayData.currentTimer.start_at : undefined;
    // Calculate elapsed time
    const elapsedTime = startTime ? formatElapsedTime(startTime) : '00:00:00';
    
    const tagList = task.labels ?? task.tags;

    // Tag color mapping
    const tagColorMap: Record<string, string> = {
      '行政': 'orange',
      '个人': 'indigo',
      '设计系统': 'blue',
      '开发': 'purple',
      '会议': 'slate',
      '调研': 'green',
      'bug': 'red'
    };
    
    // Get color class for tag
    const getTagColorClass = (tag: string): string => {
      return tagColorMap[tag] || 'slate';
    };
    
    return (
      <div 
        className={`task-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
        onClick={() => handleTaskCardClick(task)}
        onDoubleClick={() => handleTaskCardDoubleClick(task)}
        onContextMenu={(event) => handleOpenStatusMenu(event, task)}
      >
        {/* Main content area - 上部区域可拖拽 */}
        <div className="task-card-content" {...listeners}>
          <div className="task-card-header">
            {/* Tags */}
            {task.priority && (
              <span className={`task-priority ${task.priority}`}>{task.priority.toUpperCase()}</span>
            )}
            {tagList && tagList.length > 0 ? (
              tagList.map((tag, index) => (
                <span key={index} className={`task-tag ${getTagColorClass(tag)}`}>{tag}</span>
              ))
            ) : (
              <span className="task-tag slate">Unlabeled</span>
            )}
            {isActive && (
              <div className="task-card-avatar">
                {task.title.substring(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <h3 className="task-title">{task.title}</h3>
        </div>
        
        {/* Bottom metadata area */}
        <div className="task-card-footer">
          <div className="task-meta">
            {task.estimate_min && (
              <div className="task-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {task.estimate_min}m
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
          </div>
          {isCompleted && (
            <span className="task-completed-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
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
            <DndContext
              sensors={sensors}
              collisionDetection={(args) => {
                const pointerCollisions = pointerWithin(args);
                if (pointerCollisions.length > 0) {
                  return pointerCollisions;
                }
                return rectIntersection(args);
              }}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            >
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
                    <div className="timeline-hour-line" id="timeline:08:00"></div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">09:00</div>
                    <div className="timeline-hour-line" id="timeline:09:00">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '09:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">10:00</div>
                    <div className="timeline-hour-line" id="timeline:10:00">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '10:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">11:00</div>
                    <div className="timeline-hour-line" id="timeline:11:00">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '11:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">12:00</div>
                    <div className="timeline-hour-line" id="timeline:12:00">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '12:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">13:00</div>
                    <div className="timeline-hour-line" id="timeline:13:00">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '13:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">14:00</div>
                    <div className="timeline-hour-line" id="timeline:14:00">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '14:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">15:00</div>
                    <div className="timeline-hour-line" id="timeline:15:00">
                      {todayData && todayData.timeline
                        .filter(task => formatTime(task.scheduled_start) === '15:00')
                        .map(renderTimelineEvent)}
                    </div>
                  </div>
                  
                  <div className="timeline-hour">
                    <div className="timeline-hour-time">16:00</div>
                    <div className="timeline-hour-line" id="timeline:16:00">
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
              

                <SortableContext 
                  items={[
                    ...getFilteredTasks().backlog.map(task => task.id),
                    ...getFilteredTasks().todo.map(task => task.id),
                    ...getFilteredTasks().doing.map(task => task.id),
                    ...getFilteredTasks().done.map(task => task.id)
                  ]} 
                  strategy={verticalListSortingStrategy}
                >
                <div className="kanban-columns">
                  {/* Backlog */}
                  <div
                    className={`kanban-column ${backlogDroppable.isOver || draggingOverColumn === 'column:backlog' ? 'dragging-over' : ''}`}
                    id="column:backlog"
                    ref={backlogDroppable.setNodeRef}
                  >
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
                    <div className="kanban-tasks">
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
                    </div>
                  </div>
                  
                  {/* To Do */}
                  <div
                    className={`kanban-column ${todoDroppable.isOver || draggingOverColumn === 'column:todo' ? 'dragging-over' : ''}`}
                    id="column:todo"
                    ref={todoDroppable.setNodeRef}
                  >
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
                    <div className="kanban-tasks">
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
                    </div>
                  </div>
                  
                  {/* In Progress */}
                  <div
                    className={`kanban-column active ${doingDroppable.isOver || draggingOverColumn === 'column:doing' ? 'dragging-over' : ''}`}
                    id="column:doing"
                    ref={doingDroppable.setNodeRef}
                  >
                    <div className="kanban-column-header">
                      <div className="kanban-column-title-section">
                        <span className="kanban-column-title">进行中</span>
                        <span className="kanban-column-count">
                          {getFilteredTasks().doing.length}
                        </span>
                      </div>
                    </div>
                    <div className="kanban-tasks">
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
                    </div>
                  </div>
                  
                  {/* Completed */}
                  <div
                    className={`kanban-column ${doneDroppable.isOver || draggingOverColumn === 'column:done' ? 'dragging-over' : ''}`}
                    id="column:done"
                    ref={doneDroppable.setNodeRef}
                  >
                    <div className="kanban-column-header">
                      <div className="kanban-column-title-section">
                        <span className="kanban-column-title">已完成</span>
                        <span className="kanban-column-count">
                          {getFilteredTasks().done.length}
                        </span>
                      </div>
                    </div>
                    <div className="kanban-tasks">
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
                    </div>
                  </div>
                </div>
                </SortableContext>

                <DragOverlay>
                  {draggingTask ? (
                    <div
                      className="task-card-wrapper task-card-drag-overlay"
                      style={draggingSize ? { width: draggingSize.width, height: draggingSize.height } : undefined}
                    >
                      {renderTaskCard(draggingTask, undefined)}
                    </div>
                  ) : null}
                </DragOverlay>
              
              <div className="kanban-footer">
                <p className="kanban-footer-text">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  点击卡片查看详情，拖拽卡片至左侧时间轴可快速排期
                </p>
              </div>
            </section>
            </DndContext>
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
            <button 
              className="status-menu-item"
              onClick={handleOpenEditFromMenu}
            >
              编辑任务
            </button>
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

      {/* 任务编辑模态框 */}
      {isEditModalOpen && editingTask && (
        <div
          className="task-edit-modal-overlay modal open"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseEditModal();
            }
          }}
        >
          <div className="task-edit-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="task-edit-modal-header">
              <div className="task-edit-modal-title">编辑任务</div>
              <button className="task-edit-modal-close" onClick={handleCloseEditModal} aria-label="关闭">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="task-edit-modal-body">
              <div className="task-edit-form-group">
                <label>任务标题</label>
                <input
                  className="task-edit-input"
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
              </div>
              <div className="task-edit-form-group">
                <label>任务描述</label>
                <textarea
                  className="task-edit-textarea"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  rows={4}
                />
              </div>
              <div className="task-edit-row">
                <div className="task-edit-form-group">
                  <label>状态</label>
                  <select
                    className="task-edit-select"
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as Task['status'])}
                  >
                    <option value="backlog">待排期</option>
                    <option value="todo">待做</option>
                    <option value="doing">进行中</option>
                    <option value="done">已完成</option>
                  </select>
                </div>
                <div className="task-edit-form-group">
                  <label>优先级</label>
                  <select
                    className="task-edit-select"
                    value={editPriority}
                    onChange={(event) => setEditPriority(event.target.value as Task['priority'] | '')}
                  >
                    <option value="">无</option>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
              </div>
              <div className="task-edit-row">
                <div className="task-edit-form-group">
                  <label>截止日期</label>
                  <input
                    className="task-edit-input"
                    type="date"
                    value={editDueDate}
                    onChange={(event) => setEditDueDate(event.target.value)}
                  />
                </div>
                <div className="task-edit-form-group">
                  <label>预计时间（分钟）</label>
                  <input
                    className="task-edit-input"
                    type="number"
                    min="1"
                    step="1"
                    value={editEstimateMin}
                    onChange={(event) => setEditEstimateMin(event.target.value)}
                  />
                </div>
              </div>
              <div className="task-edit-row">
                <div className="task-edit-form-group">
                  <label>开始时间</label>
                  <input
                    className="task-edit-input"
                    type="datetime-local"
                    value={editScheduledStart}
                    onChange={(event) => setEditScheduledStart(event.target.value)}
                  />
                </div>
                <div className="task-edit-form-group">
                  <label>结束时间</label>
                  <input
                    className="task-edit-input"
                    type="datetime-local"
                    value={editScheduledEnd}
                    onChange={(event) => setEditScheduledEnd(event.target.value)}
                  />
                </div>
              </div>
              <div className="task-edit-form-group">
                <label>标签（逗号分隔）</label>
                <input
                  className="task-edit-input"
                  type="text"
                  value={editTagsInput}
                  onChange={(event) => setEditTagsInput(event.target.value)}
                />
              </div>
            </div>
            <div className="task-edit-modal-footer">
              <button className="task-edit-cancel" onClick={handleCloseEditModal}>
                取消
              </button>
              <button className="task-edit-save" onClick={handleSaveEditModal}>
                保存修改
              </button>
            </div>
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
