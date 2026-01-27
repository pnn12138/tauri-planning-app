import { useEffect, useRef, useState, useMemo } from 'react';
import { usePlanningStore, loadTodayData, markTaskDone, reopenTask, updateTask, startTask, stopTask, updateKanban, setIsDragging, reorderTasks, updateUIState, setCurrentVaultId, loadUIState, saveSnapshot, rollback, getTaskById, deleteTask, createTask } from './features/planning/planning.store';
import { planningOpenTaskNote } from './features/planning/planning.api';
import TaskCreateModal from './features/task-create/TaskCreateModal';
import { SmartAddModal } from './features/ai/SmartAddModal';
import { useAiStore, startTaskSession } from './features/ai/ai.store';
import type { Task, Subtask, TaskPeriodicity, TaskPriority } from './shared/types/planning';
import { v4 as uuidv4 } from 'uuid';
import './features/task-create/taskCreateModal.css';
import { buildTimelineModel, TimelineConfig, FreeBlock, BusyBlock, isWeekTimeline, isDayTimeline } from './shared/timeline/timelineDomain';
import { openTaskTab } from './entities/tab/tab.store';

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
  horizontalListSortingStrategy,
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
const getCurrentDate = (dateString?: string) => {
  const now = dateString ? new Date(dateString) : new Date();
  const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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
  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

const Home: React.FC<HomeProps> = ({ hasVault, onSelectVault, vaultRoot }) => {
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));

  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDate().yyyymmdd);

  // Get current date info from selectedDate
  const { month, day, weekday, yyyymmdd } = getCurrentDate(selectedDate);

  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  // const [editStatus, setEditStatus] = useState<Task['status']>('todo'); // Removed
  const [editPriority, setEditPriority] = useState<Task['priority'] | 'p3'>('p3');
  const [editDueDate, setEditDueDate] = useState('');
  const [editEstimateMin, setEditEstimateMin] = useState('');
  const [editScheduledStart, setEditScheduledStart] = useState('');
  // const [editScheduledEnd, setEditScheduledEnd] = useState(''); // Removed
  // const [editTagsInput, setEditTagsInput] = useState(''); // Removed

  // New state for enhanced eiting
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNewTagInput, setEditNewTagInput] = useState('');
  const [editSubtasks, setEditSubtasks] = useState<Subtask[]>([]);
  const [isEditRecurring, setIsEditRecurring] = useState(false);
  const [editPeriodicity, setEditPeriodicity] = useState<TaskPeriodicity>({
    strategy: 'week',
    interval: 1,
    start_date: new Date().toLocaleDateString('en-CA'),
    end_rule: 'never',
  });
  const [editPeriodicityTime, setEditPeriodicityTime] = useState<string>('09:00');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // --- Edit Modal Sync Logic ---

  // 1. Sync End Date <-> Due Date
  // When periodicity end date changes, update due date
  useEffect(() => {
    if (isEditRecurring && editPeriodicity.end_rule === 'date' && editPeriodicity.end_date) {
      if (editPeriodicity.end_date !== editDueDate) {
        setEditDueDate(editPeriodicity.end_date);
      }
    }
  }, [editPeriodicity.end_date, editPeriodicity.end_rule, isEditRecurring]);

  // When due date changes, if it matches end rule, update periodicity end date
  useEffect(() => {
    if (isEditRecurring && editPeriodicity.end_rule === 'date' && editDueDate) {
      if (editDueDate !== editPeriodicity.end_date) {
        setEditPeriodicity(p => ({ ...p, end_date: editDueDate }));
      }
    }
  }, [editDueDate, isEditRecurring, editPeriodicity.end_rule]);


  // 2. Count -> End Date (Due Date) Calculation
  useEffect(() => {
    if (isEditRecurring && editPeriodicity.end_rule === 'count' && editPeriodicity.end_count) {
      // Use Scheduled Start as base if available, else Periodicity Start
      const baseDateStr = editScheduledStart ? editScheduledStart.split('T')[0] : editPeriodicity.start_date;

      if (!baseDateStr) {
        // user requested error if no start date, but here we might just not calculate
        return;
      }

      const start = new Date(baseDateStr);
      const count = editPeriodicity.end_count;
      const interval = editPeriodicity.interval;

      let end = new Date(start);
      if (editPeriodicity.strategy === 'day') {
        end.setDate(start.getDate() + (count * interval));
      } else if (editPeriodicity.strategy === 'week') {
        end.setDate(start.getDate() + (count * interval * 7));
      } else if (editPeriodicity.strategy === 'month') {
        end.setMonth(start.getMonth() + (count * interval));
      } else if (editPeriodicity.strategy === 'year') {
        end.setFullYear(start.getFullYear() + (count * interval));
      }

      const endDateStr = end.toLocaleDateString('en-CA');

      // Update both
      setEditPeriodicity(p => ({ ...p, end_date: endDateStr }));
      setEditDueDate(endDateStr);
    }
  }, [editPeriodicity.end_count, editPeriodicity.interval, editPeriodicity.strategy, editPeriodicity.end_rule, editPeriodicity.start_date, editScheduledStart, isEditRecurring]);


  // Tags editor related state
  const [isTagsEditorOpen, setIsTagsEditorOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [editingTagsTask, setEditingTagsTask] = useState<Task | null>(null);
  const [tagsEditorInput, setTagsEditorInput] = useState('');
  const [tagsEditorTags, setTagsEditorTags] = useState<string[]>([]);

  // Schedule editor related state
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
  const [editingScheduleTask, setEditingScheduleTask] = useState<Task | null>(null);
  const [scheduleEditorEstimateMin, setScheduleEditorEstimateMin] = useState<string>('');
  const [scheduleEditorScheduledEnd, setScheduleEditorScheduledEnd] = useState<string>('');
  const [scheduleEditorError, setScheduleEditorError] = useState<string>('');

  const [isDragging, setIsDragging] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [draggingOverColumn, setDraggingOverColumn] = useState<string | null>(null);
  const [draggingOverTimeline, setDraggingOverTimeline] = useState<string | null>(null);
  const [draggingSize, setDraggingSize] = useState<{ width: number; height: number } | null>(null);
  const lastOverIdRef = useRef<string | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // New state for Week View Task Carousels - separate index for each status
  const [currentTodoIndex, setCurrentTodoIndex] = useState(0);
  const [currentDoingIndex, setCurrentDoingIndex] = useState(0);
  const [currentVerifyIndex, setCurrentVerifyIndex] = useState(0);
  const [currentDoneIndex, setCurrentDoneIndex] = useState(0);

  const [showDragIndicator, setShowDragIndicator] = useState(false);
  const dragIndicatorPositionRef = useRef<number>(0);
  const dragIndicatorTimeRef = useRef<string>('');
  const dragIndicatorTimeStampRef = useRef<Date | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);

  // Add mouse move listener to track mouse position during drag
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mousePositionRef.current = { x: event.clientX, y: event.clientY };
    };

    // Directly add event listener, not depending on isDragging    // 杩欐牱鍙互纭繚鍦ㄦ嫋鎷藉紑濮嬫椂灏辫兘璺熻釜榧犳爣浣嶇疆
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []); // Only add once on mount
  // Timeline Configuration
  const timelineConfig: TimelineConfig = {
    dayStart: '08:00',
    dayEnd: '20:00',
    minSlotMinutes: 15,
    snapMinutes: 30,
  };

  const timelineContentRef = useRef<HTMLDivElement>(null);

  // Quick Schedule State
  const [isQuickScheduleOpen, setIsQuickScheduleOpen] = useState(false);
  const [quickScheduleStartTime, setQuickScheduleStartTime] = useState<string>('');
  const [quickScheduleTitle, setQuickScheduleTitle] = useState<string>('');
  const [quickScheduleDuration, setQuickScheduleDuration] = useState<number>(30);

  // Get today's data
  const todayData = usePlanningStore((state) => state.todayData);
  // Determine tasks to show in timeline
  const timelineTasks = useMemo(() => {
    if (!todayData) return [];
    if (viewMode === 'day') {
      // Day view needs all timeline tasks
      return todayData.timeline;
    } else {
      // Week view needs all tasks
      return [
        ...todayData.timeline,
        ...todayData.kanban.todo,
        ...todayData.kanban.doing,
        ...todayData.kanban.verify,
        ...todayData.kanban.done
      ];
    }
  }, [todayData, viewMode]);

  // Build timeline model
  const timelineModel = useMemo(() => {
    return buildTimelineModel(timelineTasks, timelineConfig, new Date(selectedDate), viewMode);
  }, [timelineTasks, timelineConfig, selectedDate, viewMode]);

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Day Navigation锟斤拷
  const handlePrevDay = async () => {
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const newDate = prevDate.toISOString().split('T')[0];
    setSelectedDate(newDate);
    await loadTodayData(newDate);
  };

  const handleNextDay = async () => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const newDate = nextDate.toISOString().split('T')[0];
    setSelectedDate(newDate);
    await loadTodayData(newDate);
  };

  // Week Navigation锟斤拷
  const handlePrevWeek = async () => {
    const prevWeek = new Date(selectedDate);
    prevWeek.setDate(prevWeek.getDate() - 7);
    const newDate = prevWeek.toISOString().split('T')[0];
    setSelectedDate(newDate);
    await loadTodayData(newDate);
  };

  const handleNextWeek = async () => {
    const nextWeek = new Date(selectedDate);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const newDate = nextWeek.toISOString().split('T')[0];
    setSelectedDate(newDate);
    await loadTodayData(newDate);
  };

  // Jump to Today
  const handleToday = async () => {
    const today = getCurrentDate().yyyymmdd;
    setSelectedDate(today);
    await loadTodayData(today);
  };


  const lastDragRectRef = useRef<DOMRect | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  const getColumnIdFromPoint = (x: number, y: number): string | null => {
    const elements = document.elementsFromPoint(x, y);
    for (const element of elements) {
      // Check if it is a kanban column
      const column = element.closest?.('.kanban-column') as HTMLElement | null;
      if (column?.id) {
        return column.id;
      }

      // Check if it is a status carousel
      const carousel = element.closest?.('.status-carousel') as HTMLElement | null;
      if (carousel?.id) {
        return carousel.id;
      }

      // Check if it is a timeline container
      const timelineContainer = element.closest?.('.timeline-container') as HTMLElement | null;
      if (timelineContainer?.id) {
        return timelineContainer.id;
      }
    }
    return null;
  };

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

  const verifyDroppable = useDroppable({
    id: 'column:verify',
    data: { columnId: 'verify' },
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

  // Timeline Droppable Setup
  const timelineDroppable = useDroppable({
    id: 'timeline:main',
    data: { type: 'timeline' },
  });

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

  // Handle drag move (throttled, with target detection)
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

    // Timeline drag over logic
    const isOverTimeline = event.over && typeof event.over.id === 'string' && event.over.id.startsWith('timeline:');

    if (isOverTimeline) {
      setShowDragIndicator(true);

      // Get mouse position relative to timeline content
      if (timelineContentRef.current && mousePositionRef.current) {
        const rect = timelineContentRef.current.getBoundingClientRect();
        const timelineHeight = rect.height;
        const mouseY = mousePositionRef.current.y - rect.top;
        const mouseX = mousePositionRef.current.x - rect.left;

        // Calculate position percent
        let positionPercent = (mouseY / timelineHeight) * 100;
        positionPercent = Math.max(0, Math.min(100, positionPercent));

        // Calculate corresponding time
        const totalMinutes = 12 * 60; // 12 hours * 60 minutes
        const minutesFromStart = (positionPercent / 100) * totalMinutes;

        // Calculate hour and minute, handle snap-to-grid
        const startHour = 8;
        const snapMinutes = timelineConfig.snapMinutes;

        // Calculate raw hour and minute
        let rawHour = startHour + Math.floor(minutesFromStart / 60);
        let rawMinute = minutesFromStart % 60;

        // Apply snap-to-grid
        const snappedMinute = Math.round(rawMinute / snapMinutes) * snapMinutes;

        // Handle carry over
        const hour = snappedMinute === 60 ? rawHour + 1 : rawHour;
        const minute = snappedMinute === 60 ? 0 : snappedMinute;

        // Format time string
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

        // Create Date object
        const date = new Date();

        // In week view, determine date based on column
        if (viewMode === 'week' && isWeekTimeline(timelineModel)) {
          // Get column info in week view
          const weekContent = timelineContentRef.current.querySelector('.timeline-week-content');
          const columnsContainer = weekContent?.querySelector('.timeline-week-columns');
          const timeScale = weekContent?.querySelector('.timeline-week-time-scale');

          if (columnsContainer && timeScale) {
            const columnsRect = columnsContainer.getBoundingClientRect();
            const timeScaleRect = timeScale.getBoundingClientRect();
            const columnsWidth = columnsRect.width;
            const columnWidth = columnsWidth / 7;

            // Calculate column index
            const columnIndex = Math.min(Math.floor((mouseX - timeScaleRect.width) / columnWidth), 6);

            // Calculate target date
            const targetDate = new Date(timelineModel.weekStart);
            targetDate.setDate(targetDate.getDate() + columnIndex);
            date.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
          }
        } else {
          // Use current selection year/month/day
          date.setFullYear(parseInt(selectedDate.split('-')[0]), parseInt(selectedDate.split('-')[1]) - 1, parseInt(selectedDate.split('-')[2]));
        }

        date.setHours(hour, minute, 0, 0);

        // Update drag indicator refs
        dragIndicatorPositionRef.current = positionPercent;
        dragIndicatorTimeRef.current = timeStr;
        dragIndicatorTimeStampRef.current = date;
      }
    } else {
      setShowDragIndicator(false);
    }
  };

  // Handle drag end
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

    // Hide drag indicator
    setShowDragIndicator(false);

    let overId = (over?.id ?? lastOverId) as string | null;
    if (!overId && pointer) {
      overId = getColumnIdFromPoint(pointer.x, pointer.y);
    }
    if (!overId && dragRect) {
      const centerX = dragRect.left + dragRect.width / 2;
      const centerY = dragRect.top + dragRect.height / 2;
      overId = getColumnIdFromPoint(centerX, centerY);
    }
    // Ensure drag target is valid
    if (!overId || active.id === overId) {
      return;
    }

    // Ensure todayData exists
    if (!todayData) {
      console.error('Today data is null');
      return;
    }

    const sourceColumnId = active.data.current?.columnId as string;
    if (!sourceColumnId) {
      console.error('Source column ID not found in active data');
      return;
    }

    // Define valid Column IDs
    const validColumnIds = ['todo', 'doing', 'verify', 'done'] as const;

    // Ensure source column ID is valid
    if (!validColumnIds.includes(sourceColumnId as any)) {
      console.error('Invalid source column ID:', sourceColumnId);
      return;
    }

    // Get source column tasks
    const sourceTasks = [...todayData.kanban[sourceColumnId as typeof validColumnIds[number]]];

    const draggedTaskIndex = sourceTasks.findIndex(task => task.id === active.id);
    if (draggedTaskIndex === -1) {
      console.error('Dragged task not found in source column');
      return;
    }
    const draggedTask = sourceTasks[draggedTaskIndex];

    let targetColumnId = sourceColumnId;
    const overTaskData = over?.data?.current;
    let targetTasks = [...sourceTasks];
    let insertIndex = -1;

    const isOverColumn = typeof overId === 'string' && overId.startsWith('column:');

    const isOverTimeline = typeof overId === 'string' && overId.startsWith('timeline:');

    if (isOverTimeline) {
      // Dragging to timeline
      // Use drag indicator time as start time
      if (dragIndicatorTimeRef.current && dragIndicatorTimeStampRef.current) {
        const timeStr = dragIndicatorTimeRef.current;
        const date = dragIndicatorTimeStampRef.current;

        // Validation: Check if task has estimate time
        if (!draggedTask.estimate_min) {
          alert('Task has no estimate time, cannot schedule');
          return;
        }

        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(timeStr)) {
          alert('Invalid time format');
          return;
        }

        // Validation: Check if time slot is available, avoid overlap with existing tasks
        const isAvailable = isTimeSlotAvailable(todayData.timeline, timeStr, draggedTask.estimate_min);
        if (!isAvailable) {
          alert('Time slot occupied, please choose another time');
          return;
        }

        // Logic to add task to timeline
        // 1. Prepare task data
        const scheduledDate = dragIndicatorTimeStampRef.current.toISOString().split('T')[0];
        const scheduledStart = `${scheduledDate}T${timeStr}`;
        const estimatedEnd = calculateEstimatedEnd(scheduledStart, draggedTask.estimate_min);
        const scheduleDueDate = draggedTask.due_date || scheduledDate;

        // 2. Check if time slot is occupied (precise check based on duration)
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

            // Check conflict 
            return !(endTotalMinutes <= taskStartTotalMinutes || startTotalMinutes >= taskEndTotalMinutes);
          });
        }

        // 3. Handle conflict with confirmation
        if (hasConflict) {
          const confirmOverwrite = window.confirm('Time slot occupied, overwrite?');
          if (!confirmOverwrite) {
            return;
          }
        }

        // 4. Update task
        try {
          // Update scheduled time and status
          await updateTask({
            id: draggedTask.id,
            status: 'todo', // Change status to todo since it's scheduled
            scheduled_start: scheduledStart,
            scheduled_end: estimatedEnd,
            ...(draggedTask.due_date ? {} : { due_date: scheduleDueDate }),
          });

          // 5. Remove task from source column (optimistic update)
          const updatedSourceTasks = sourceTasks.filter(task => task.id !== draggedTask.id);
          const updatedKanban = {
            ...todayData.kanban,
            [sourceColumnId]: updatedSourceTasks,
          };
          updateKanban(updatedKanban);

          // 6. Reload data to ensure consistency         await loadTodayData(yyyymmdd);

          // 7. Save snapshot
          saveSnapshot();

          // 8. Show success message
          alert(`Task "${draggedTask.title}" scheduled to "${timeStr}"`);
        } catch (error) {
          console.error('Failed to schedule task:', error);
          alert(`Scheduling failed: ${(error as Error).message}`);
          // Rollback to snapshot         rollback();
        }

        return;
      }
    } else if (!isOverColumn) {
      // over is task, get target column info
      if (overTaskData) {
        targetColumnId = overTaskData.columnId;
        // Verify target column ID is valid
        if (!validColumnIds.includes(targetColumnId as any)) {
          console.error('Invalid target column ID:', targetColumnId);
          return;
        }

        targetTasks = [...todayData.kanban[targetColumnId as typeof validColumnIds[number]]];
        insertIndex = targetTasks.findIndex(task => task.id === overId);
      } else {
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
      // Over is column container, get column ID
      if (typeof overId === 'string') {
        targetColumnId = overId.replace('column:', '');

        // Ensure target ID is valid
        if (!validColumnIds.includes(targetColumnId as any)) {
          console.error('Invalid target column ID:', targetColumnId);
          return;
        }

        targetTasks = [...todayData.kanban[targetColumnId as typeof validColumnIds[number]]];
        insertIndex = targetTasks.length;
      } else {
        console.error('Invalid column ID type:', overId);
        return;
      }
    }

    // Execute drag operation
    let updatedSourceTasks = sourceTasks;
    let updatedTargetTasks = targetTasks;

    if (sourceColumnId === targetColumnId) {
      // Same column drag
      updatedTargetTasks = arrayMove(updatedTargetTasks, draggedTaskIndex, insertIndex);
    } else {
      // Cross column drag
      // Remove task from source column     updatedSourceTasks.splice(draggedTaskIndex, 1);
      // Add to target column
      updatedTargetTasks.splice(insertIndex, 0, {
        ...draggedTask,
        status: targetColumnId as any,
      });
    }

    // Calculate new order_index
    const tasksToUpdate: Array<{ id: string; status?: string; order_index: number }> = [];

    // Update source column task order_index
    updatedSourceTasks.forEach((task, index) => {
      tasksToUpdate.push({
        id: task.id,
        status: undefined,
        order_index: (index + 1) * 1000,
      });
    });

    // Update target column task order_index
    if (sourceColumnId !== targetColumnId) {
      updatedTargetTasks.forEach((task, index) => {
        tasksToUpdate.push({
          id: task.id,
          status: task.status,
          order_index: (index + 1) * 1000,
        });
      });
    } else {
      // Same column drag only updates target column task order_index
      updatedTargetTasks.forEach((task, index) => {
        tasksToUpdate.push({
          id: task.id,
          status: undefined,
          order_index: (index + 1) * 1000,
        });
      });
    }

    // Save snapshot first, then optimistic update   saveSnapshot();

    // Local UI update (optimistic update)
    const updatedKanban = {
      ...todayData.kanban,
      [sourceColumnId]: updatedSourceTasks,
      [targetColumnId]: updatedTargetTasks,
    };
    updateKanban(updatedKanban);

    // Batch update to database
    try {
      await reorderTasks(tasksToUpdate);
    } catch (error) {
      console.error('Failed to reorder tasks:', error);
      alert('Reorder failed, reverted changes');
      // Quick rollback to snapshot     rollback();
      // Async reload to ensure consistency     await loadTodayData(yyyymmdd);
    }
  };

  // Open daily log
  const handleOpenDaily = async () => {
    // TODO: Implement open daily log functionality
    alert('Daily log not implemented yet');
  };

  // Get data from store
  const isLoading = usePlanningStore(state => state.isLoading);
  const error = usePlanningStore(state => state.error);

  // Load today's data when component mounts or selectedDate changes
  useEffect(() => {
    if (hasVault) {
      loadTodayData(selectedDate);
    }

    // Update current time every minute for the display
    const timeDisplayTimer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    }, 60000);

    return () => {
      clearInterval(timeDisplayTimer);
    };
  }, [hasVault, selectedDate]);

  // Handle Create Task Modal
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
    loadTodayData(selectedDate);
  };

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
    // setEditStatus(task.status); // Removed
    setEditPriority(task.priority || 'p3'); // Default p3 if undefined, aligned with New Task logic
    setEditDueDate(task.due_date ?? '');
    setEditEstimateMin(task.estimate_min ? String(task.estimate_min) : '');
    setEditScheduledStart(toDatetimeLocalInput(task.scheduled_start));

    // New state population
    setEditTags(task.tags ?? task.labels ?? []);
    setEditSubtasks(task.subtasks ? [...task.subtasks] : []); // Deep copy if needed, shallow for now

    if (task.periodicity) {
      setIsEditRecurring(true);
      setEditPeriodicity(task.periodicity);
      // Try to extract time from start_date if it contains it, though interface has separate time input for periodicity
      // Actually TaskPeriodicity start_date often stores date only or datetime. 
      // If it's datetime string, we might want to extract time. 
      // But let's assume default '09:00' or extract if possible.
      if (task.periodicity.start_date.includes('T')) {
        setEditPeriodicityTime(task.periodicity.start_date.split('T')[1].substring(0, 5));
      } else {
        setEditPeriodicityTime('09:00');
      }
    } else {
      setIsEditRecurring(false);
      setEditPeriodicity({
        strategy: 'week',
        interval: 1,
        start_date: new Date().toLocaleDateString('en-CA'),
        end_rule: 'never',
      });
      setEditPeriodicityTime('09:00');
    }

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
      alert('Title cannot be empty');
      return;
    }
    // const parsedEstimate = editEstimateMin ? Number(editEstimateMin) : undefined;
    // if (editEstimateMin && parsedEstimate && (!Number.isFinite(parsedEstimate) || parsedEstimate <= 0)) {
    //   alert('Invalid estimate time');
    //   return;
    // }

    // Align validation with New Task if possible, or keep simple.
    const parsedEstimate = editEstimateMin ? parseInt(editEstimateMin) : undefined;


    try {
      const payload: any = {
        id: editingTask.id,
        title: nextTitle,
        description: editDescription.trim() || undefined,
        // status: editStatus, // Status removed
        priority: editPriority || undefined,
        due_date: editDueDate || null,
        estimate_min: parsedEstimate,
        scheduled_start: editScheduledStart || undefined,
        // scheduled_end: editScheduledEnd || undefined, // End time removed
        tags: editTags,
        subtasks: editSubtasks.length > 0 ? editSubtasks : undefined,
      };

      if (isEditRecurring) {
        payload.periodicity = {
          ...editPeriodicity,
          start_date: editPeriodicityTime ? `${editPeriodicity.start_date.split('T')[0]}T${editPeriodicityTime}:00` : `${editPeriodicity.start_date}T00:00:00`
        };
        // If recurring, might want to sync scheduled_start with periodicity start
        payload.scheduled_start = payload.periodicity.start_date;
      } else {
        payload.periodicity = undefined; // Explicitly remove periodicity if turned off? checking backend support.
        // If backend doesn't support setting undefined to remove, we might need another way.
        // Usually updateTask merges. If we want to remove periodicity, we need backend support.
        // Assuming undefined/null removes it or we send empty.
        // For now, let's assume 'periodicity: null' or undefined might not clear it in partial update if not handled. 
        // But let's stick to standard update.
        // Actually, if task was recurring and we turn it off, we should probably set it to null.
        // But UpdateTaskInput defines periodicity optional.
      }

      // Handle the case where we toggle off recurring.
      // If we can't easily clear it, we might leave it. But for correctness we should clear it.
      // Assuming existing backend handles explicit null for clearing? 
      // UpdateTaskInput has periodicity?: TaskPeriodicity.

      await updateTask(payload);
      handleCloseEditModal();
    } catch (error) {
      console.error('Save failed:', error);
      alert(`Save failed: ${(error as Error).message}`);
    }
  };

  // Helper functions for Edit Modal
  const handleAddEditSubtask = () => {
    const newSubtask: Subtask = {
      id: uuidv4(),
      title: '',
      completed: false,
    };
    setEditSubtasks([...editSubtasks, newSubtask]);
  };

  const handleUpdateEditSubtask = (id: string, updates: Partial<Subtask>) => {
    setEditSubtasks(editSubtasks.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const handleRemoveEditSubtask = (id: string) => {
    setEditSubtasks(editSubtasks.filter(t => t.id !== id));
  };

  const handleAddEditTag = () => {
    const tag = editNewTagInput.trim();
    if (tag && !editTags.includes(tag)) {
      setEditTags([...editTags, tag]);
      setEditNewTagInput('');
    }
  };

  const handleRemoveEditTag = (tagToRemove: string) => {
    setEditTags(editTags.filter(tag => tag !== tagToRemove));
  };


  const handleDeleteTask = () => {
    if (!editingTask) return;
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteTask = async () => {
    if (!editingTask) return;

    try {
      await deleteTask(editingTask.id);
      handleCloseEditModal();
      // Refresh task list
    } catch (error) {
      console.error('Failed to delete task:', error);
      // Handle delete errors
    }
    finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleCancelDeleteTask = () => {
    setIsDeleteConfirmOpen(false);
  };

  const handleOpenEditFromMenu = () => {
    if (!selectedTask) return;
    handleOpenEditModal(selectedTask);
    handleCloseStatusMenu();
  };

  // Close menu when clicking outside
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
        // Update task with due date
        await updateTask({
          id: selectedTask.id,
          status: newStatus,
          due_date: input,
        });
      } else {
        // Update task status
        await updateTask({
          id: selectedTask.id,
          status: newStatus,
        });
      }
      handleCloseStatusMenu();
    } catch (error) {
      console.error('Update task status failed:', error);
      alert(`Update task status failed: ${(error as Error).message}`);
    }
  };

  // Mark task as done
  const handleMarkTaskDone = async (taskId: string) => {
    try {
      await markTaskDone(taskId);
    } catch (error) {
      console.error('Mark task done failed:', error);
      alert(`Mark task done failed: ${(error as Error).message}`);
    }
  };

  // Reopen task
  const handleReopenTask = async (taskId: string) => {
    try {
      await reopenTask(taskId);
    } catch (error) {
      console.error('Reopen task failed:', error);
      alert(`Reopen task failed: ${(error as Error).message}`);
    }
  };

  // Start task
  const handleStartTask = async (taskId: string) => {
    try {
      const task = getTaskById(taskId);
      if (task && !task.due_date) {
        const input = window.prompt('Enter due date (YYYY-MM-DD)');
        if (!input) {
          return;
        }
        // Update task with due date
        await updateTask({
          id: taskId,
          due_date: input,
        });
      }
      await startTask(taskId);
    } catch (error) {
      console.error('Start task failed:', error);
      alert(`Start task failed: ${(error as Error).message}`);
    }
  };

  // Stop task
  const handleStopTask = async (taskId: string) => {
    try {
      await stopTask(taskId);
    } catch (error) {
      console.error('Stop task failed:', error);
      alert(`Stop task failed: ${(error as Error).message}`);
    }
  };

  // Update task priority
  const handleUpdatePriority = async (taskId: string, priority?: Task['priority']) => {
    try {
      // Update task priority
      await updateTask({
        id: taskId,
        priority,
      });
      handleCloseStatusMenu();
    } catch (error) {
      console.error('Update priority failed:', error);
      alert(`Update priority failed: ${(error as Error).message}`);
    }
  };

  // Update task tags
  const handleUpdateTags = async (taskId: string, tags: string[]) => {
    try {
      // Update task tags
      await updateTask({
        id: taskId,
        tags,
      });
    } catch (error) {
      console.error('Update tags failed:', error);
      alert(`Update tags failed: ${(error as Error).message}`);
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
      setScheduleEditorError('Estimate must be between 1 and 1440 minutes');
      return;
    }

    let scheduledEnd: string | undefined = undefined;
    if (scheduleEditorScheduledEnd && editingScheduleTask.scheduled_start) {
      // Parse scheduled start time
      const startParts = editingScheduleTask.scheduled_start.split('T');
      if (startParts.length !== 2) {
        setScheduleEditorError('Invalid start time');
        return;
      }

      const datePart = startParts[0];
      const startTimePart = startParts[1].substring(0, 5);
      const endTimePart = scheduleEditorScheduledEnd;

      // Check if end time is earlier than start time
      if (endTimePart < startTimePart) {
        setScheduleEditorError('End time cannot be earlier than start time');
        return;
      }

      // Format scheduled end as YYYY-MM-DDTHH:mm
      scheduledEnd = `${datePart}T${endTimePart}`;
    }

    try {
      // Update task
      setScheduleEditorError('Update schedule failed: ');
      await updateTask({
        id: editingScheduleTask.id,
        estimate_min: estimateMin,
        scheduled_end: scheduledEnd,
      });

      // Close editor and refresh data
      handleCloseScheduleEditor();
      loadTodayData(selectedDate);
    } catch (error) {
      console.error('Update schedule failed:', error);
      setScheduleEditorError(`Update schedule failed: ${(error as Error).message}`);
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
      ...todayData.kanban.todo,
      ...todayData.kanban.doing,
      ...todayData.kanban.verify,
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
        todo: [],
        doing: [],
        verify: [],
        done: []
      };
    }

    return {
      todo: filterTasks(todayData.kanban.todo),
      doing: filterTasks(todayData.kanban.doing),
      verify: filterTasks(todayData.kanban.verify),
      done: filterTasks(todayData.kanban.done)
    };
  };

  const draggingTask = draggingTaskId && todayData
    ? [
      ...todayData.kanban.todo,
      ...todayData.kanban.doing,
      ...todayData.kanban.verify,
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
        <div className="timeline-event-header" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
          <span className="timeline-event-time font-mono font-bold text-xs" style={{ minWidth: '35px' }}>
            {formatTime(task.scheduled_start)}
          </span>
          <div className="timeline-event-title" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.title}
          </div>
        </div>
        {task.estimate_min && (
          <div className="timeline-event-desc">预计 {task.estimate_min} 分钟</div>
        )}
        {endTimeDisplay && (
          <div className="timeline-event-desc">{endTimeDisplay}</div>
        )}
      </div>
    );
  };

  // Handle task card click
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
        alert(`Failed to open task note: ${(error as Error).message}`);
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
      '开发': 'orange',
      '设计': 'indigo',
      '测试': 'blue',
      '文档': 'purple',
      '会议': 'slate',
      '学习': 'green',
      'bug': 'red'
    };

    // Get color class for tag
    const getTagColorClass = (tag: string): string => {
      return tagColorMap[tag] || 'slate';
    };

    // Map priority to P0-P3 format
    const getPriorityDisplay = (priority?: Task['priority']): string => {
      const priorityMap: Record<string, string> = {
        'urgent': 'P0',
        'high': 'P1',
        'medium': 'P2',
        'low': 'P3',
        'p0': 'P0',
        'p1': 'P1',
        'p2': 'P2',
        'p3': 'P3'
      };
      return priorityMap[priority || 'low'] || 'P3';
    };

    // Get priority class for styling
    const getPriorityClass = (priority?: Task['priority']): string => {
      const priorityMap: Record<string, string> = {
        'urgent': 'p0',
        'high': 'p1',
        'medium': 'p2',
        'low': 'p3',
        'p0': 'p0',
        'p1': 'p1',
        'p2': 'p2',
        'p3': 'p3'
      };
      return priorityMap[priority || 'low'] || 'p3';
    };

    return (
      <div
        className={`task-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
        onClick={() => handleTaskCardClick(task)}
        onContextMenu={(event) => handleOpenStatusMenu(event, task)}
      >
        {/* Main content area - 上部区域可拖拽 */}
        <div className="task-card-content" {...listeners}>
          <div className="task-card-header">
            {/* Left: Priority */}
            <div className="task-header-left">
              {task.priority ? (
                <span className={`task-priority ${getPriorityClass(task.priority)}`}>{getPriorityDisplay(task.priority)}</span>
              ) : (
                <span className="task-priority p3">P3</span> // Default priority
              )}
            </div>

            {/* Right: Tags */}
            <div className="task-header-right">
              {tagList && tagList.length > 0 ? (
                <span className={`task-tag ${getTagColorClass(tagList[0])}`}>{tagList[0]}</span>
              ) : (
                <span className="task-tag slate">无标签</span>
              )}
            </div>
          </div>

          <h3 className="task-title">{task.title}</h3>
        </div >

        {/* Bottom metadata area - 下部区域可双击编辑 */}
        <div className="task-card-footer" onDoubleClick={() => handleTaskCardDoubleClick(task)}>
          <div className="task-meta">
            {(task.estimate_min || !hasActiveTimer) && (
              <div className="task-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {task.estimate_min ? `${task.estimate_min}m` : '60m'}
              </div>
            )}
            {hasActiveTimer && (
              <div className="task-timer">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {elapsedTime}
              </div>
            )}
          </div>

          <button
            className="task-workspace-btn"
            onClick={(e) => {
              e.stopPropagation();
              openTaskTab(task.id, task.title);
            }}
            title="Enter Task Workspace"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              marginLeft: 'auto'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
            </svg>
          </button>

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

  // SortableTaskCard component
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

    const style: React.CSSProperties = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
      opacity: isDragging ? 0 : 1,
      visibility: isDragging ? 'hidden' : 'visible',
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

  return (
    <>
      <section className="home-pane">
        <div className="dashboard-container">
          {/* Header */}
          < header className="dashboard-header" >
            <div className="dashboard-header-left">
              <div className="dashboard-logo">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                  <line x1="10" y1="14" x2="14" y2="14"></line>
                  <line x1="10" y1="18" x2="14" y2="18"></line>
                </svg>
              </div>
              <div className="dashboard-date-info">
                <h1 className="dashboard-date">{month}{day} {weekday}</h1>
                <span className="dashboard-subtitle">每日计划与执行</span>
              </div>
            </div>

            {/* Vault Selection CTA */}
            {
              !hasVault && (
                <div className="dashboard-vault-cta">
                  <span className="vault-cta-text">选择一个库以开始规划</span>
                  <button className="vault-cta-button" onClick={onSelectVault}>
                    选择库
                  </button>
                </div>
              )
            }

            <div className="dashboard-search">
              <span className="dashboard-search-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input type="text" className="dashboard-search-input" placeholder="搜索..." />
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
                Daily Log
              </button>
              <button className="dashboard-new-task-btn" onClick={handleOpenCreateModal}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                新建任务
              </button>

            </div>

            {/* Filter Panel */}
            {
              filterPanelOpen && (
                <div className="dashboard-filter-panel-overlay" onClick={() => setFilterPanelOpen(false)}>
                  <div className="dashboard-filter-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="dashboard-filter-panel-header">
                      <h3>筛选</h3>
                      <button className="dashboard-filter-panel-close" onClick={() => setFilterPanelOpen(false)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                    <div className="dashboard-filter-panel-content">
                      <div className="dashboard-filter-section">
                        <span className="dashboard-filter-label">标签:</span>
                        <div className="dashboard-filter-tags">
                          {getAllUniqueTags().map(tag => (
                            <button
                              key={tag}
                              className={`dashboard-filter-tag ${uiState.filters.tags.includes(tag) ? 'active' : ''}`}
                              onClick={() => handleToggleTagFilter(tag)}
                            >
                              {tag}
                              {uiState.filters.tags.includes(tag) && (
                                <span className="dashboard-filter-tag-remove">&times;</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="dashboard-filter-section">
                        <span className="dashboard-filter-label">优先级:</span>
                        <div className="dashboard-filter-priorities">
                          <button
                            className={`dashboard-filter-priority ${uiState.filters.priority === 'p0' ? 'active' : ''}`}
                            onClick={() => handleSetPriorityFilter('p0')}
                          >
                            P0
                          </button>
                          <button
                            className={`dashboard-filter-priority ${uiState.filters.priority === 'p1' ? 'active' : ''}`}
                            onClick={() => handleSetPriorityFilter('p1')}
                          >
                            P1
                          </button>
                          <button
                            className={`dashboard-filter-priority ${uiState.filters.priority === 'p2' ? 'active' : ''}`}
                            onClick={() => handleSetPriorityFilter('p2')}
                          >
                            P2
                          </button>
                          <button
                            className={`dashboard-filter-priority ${uiState.filters.priority === 'p3' ? 'active' : ''}`}
                            onClick={() => handleSetPriorityFilter('p3')}
                          >
                            P3
                          </button>
                        </div>
                      </div>
                      {(uiState.filters.tags.length > 0 || uiState.filters.priority) && (
                        <button className="dashboard-filter-clear" onClick={handleClearFilters}>
                          清除筛选</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            }
          </header >

          {/* Main Content */}
          < main className={`dashboard-main view-mode-${viewMode}`}>
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
                    <span className="timeline-schedule-label">已排期</span>
                    <span className="timeline-schedule-hours">
                      {todayData ? getTotalScheduledHours(todayData.timeline) : '0.0'}h
                    </span>
                  </div>
                  <div className="timeline-date-nav">
                    <button className="timeline-nav-btn" onClick={viewMode === 'day' ? handlePrevDay : handlePrevWeek}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                      </svg>
                    </button>
                    <button className="timeline-nav-btn" onClick={viewMode === 'day' ? handleNextDay : handleNextWeek}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </button>
                    <button className="timeline-today-badge" onClick={handleToday}>
                      {selectedDate === new Date().toISOString().split('T')[0] ? 'Today' : 'Back to Today'}
                    </button>
                  </div>
                  {/* Week View Toggle */}
                  <button
                    className={`timeline-view-toggle ${viewMode === 'week' ? 'active' : ''}`}
                    onClick={() => setViewMode(viewMode === 'day' ? 'week' : 'day')}
                    title={viewMode === 'day' ? 'Switch to Week View' : 'Switch to Day View'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </button>
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
                    <span>筛选条件:</span>
                    <button
                      className="timeline-filter-clear-btn"
                      onClick={handleClearFilters}
                    >
                      清除
                    </button>
                  </div>
                )}

                <div className="timeline-content" ref={timelineContentRef}>
                  <div className="timeline-container" id="timeline:main" ref={timelineDroppable.setNodeRef}>
                    {isDayTimeline(timelineModel) ? (
                      <>
                        {/* Drag Indicator */}
                        {showDragIndicator && (
                          <div
                            className="timeline-drag-indicator"
                            style={{ top: `${dragIndicatorPositionRef.current}%` }}
                          >
                            <div className="timeline-drag-time">{dragIndicatorTimeRef.current}</div>
                            <div className="timeline-drag-line">
                              <div className="timeline-drag-dot"></div>
                            </div>
                          </div>
                        )}

                        {/* Ticks Layer - 整点刻度 */}
                        <div className="timeline-ticks-layer">
                          {Array.from({ length: 13 }, (_, i) => {
                            const hour = 8 + i;
                            const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                            return (
                              <div key={timeStr} className="timeline-tick">
                                <div className="timeline-hour-time">{timeStr}</div>
                                <div className="timeline-hour-line"></div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Blocks Layer - 时间块 */}
                        <div className="timeline-blocks-layer">
                          {/* 渲染已排期块 */}
                          {timelineModel.busyBlocks.map(block => {
                            // 每小时80px，从08:00开始
                            const PIXELS_PER_HOUR = 80;
                            const DAY_START_HOUR = 8;

                            // 计算任务开始时间相对于08:00的分钟数
                            const startHour = block.start.getHours();
                            const startMinute = block.start.getMinutes();
                            const minutesFromDayStart = (startHour - DAY_START_HOUR) * 60 + startMinute;

                            // 计算顶部位置（像素）
                            const topPixels = (minutesFromDayStart / 60) * PIXELS_PER_HOUR;

                            // 计算高度（像素）
                            const heightPixels = (block.durationMinutes / 60) * PIXELS_PER_HOUR;

                            return (
                              <div
                                key={block.id}
                                className="timeline-block timeline-event busy"
                                style={{
                                  top: `${topPixels}px`,
                                  height: `${heightPixels}px`,
                                  minHeight: '35px',
                                }}
                              >
                                <div className="timeline-block-time">
                                  {block.start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}-
                                  {new Date(block.start.getTime() + block.durationMinutes * 60000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="timeline-block-content">
                                  <div className="timeline-event-title">{block.task.title}</div>
                                  {block.task.estimate_min && (
                                    <div className="timeline-event-desc">预计 {block.task.estimate_min} 分钟</div>
                                  )}
                                  {block.task.status && block.durationMinutes >= 45 && (
                                    <div className="timeline-event-tag">{block.task.status.toUpperCase()}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* 渲染空闲块 */}

                        </div>
                      </>
                    ) : isWeekTimeline(timelineModel) ? (
                      <div className="timeline-week-view">
                        {/* 周视图头部 - 显示星期和日期 */}
                        <div className="timeline-week-header">
                          {timelineModel.days.map((dayModel, index) => {
                            const date = dayModel.busyBlocks.length > 0 ?
                              new Date(dayModel.busyBlocks[0].start) :
                              new Date(timelineModel.weekStart.getTime() + index * 24 * 60 * 60 * 1000);

                            const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
                            const isToday = date.toDateString() === new Date().toDateString();

                            return (
                              <div key={index} className={`timeline-week-day-header ${isToday ? 'today' : ''}`}>
                                <div className="timeline-week-day-name">{weekdays[date.getDay() === 0 ? 6 : date.getDay() - 1]}</div>
                                <div className="timeline-week-day-date">{date.getMonth() + 1}/{date.getDate()}</div>
                              </div>
                            );
                          })}
                        </div>

                        {/* 周视图内容 - 7天的时间轴 */}
                        <div className="timeline-week-content">
                          {/* 左侧时间刻度 */}
                          <div className="timeline-week-time-scale">
                            {Array.from({ length: 13 }, (_, i) => {
                              const hour = 8 + i;
                              const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                              return (
                                <div key={timeStr} className="timeline-week-time-item">
                                  {timeStr}
                                </div>
                              );
                            })}
                          </div>

                          {/* 7天的时间轴列 */}
                          <div className="timeline-week-columns">
                            {timelineModel.days.map((dayModel, dayIndex) => {
                              return (
                                <div key={dayIndex} className="timeline-week-column">
                                  {/* 日期分隔线 */}
                                  <div className="timeline-week-column-divider"></div>

                                  {/* 时间轴内容 */}
                                  <div className="timeline-week-column-content">
                                    {/* 已排期块 */}
                                    {dayModel.busyBlocks.map(block => {
                                      const heightPercent = (block.durationMinutes / (12 * 60)) * 100;
                                      // 计算顶部位置，添加0.5%的上边距
                                      const topPercent = ((block.start.getHours() * 60 + block.start.getMinutes() - 480) / (12 * 60)) * 100 + 0.5;

                                      return (
                                        <div
                                          key={block.id}
                                          className="timeline-block timeline-event busy"
                                          style={{
                                            top: `${topPercent}%`,
                                            height: `${heightPercent - 1}%`, // 减去1%的下边距
                                            // TODO: 优化最小高度
                                            minHeight: '35px',
                                          }}
                                        >
                                          <div className="timeline-block-time">
                                            {block.start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}-
                                            {new Date(block.start.getTime() + block.durationMinutes * 60000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                          </div>
                                          <div className="timeline-block-content">
                                            <div className="timeline-event-title">{block.task.title}</div>
                                            {block.task.estimate_min && (
                                              <div className="timeline-event-desc">预计 {block.task.estimate_min} 分钟</div>
                                            )}
                                            {block.task.status && (
                                              <div className="timeline-event-tag">{block.task.status.toUpperCase()}</div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {/* 空闲时间块 */}
                                    {dayModel.freeBlocks.map(block => {
                                      // 计算高度百分比，完全填充可用时间
                                      const heightPercent = (block.durationMinutes / (12 * 60)) * 100;
                                      // 计算顶部位置，添加0.5%的上边距
                                      const topPercent = ((block.start.getHours() * 60 + block.start.getMinutes() - 480) / (12 * 60)) * 100 + 0.5;

                                      return (
                                        <div
                                          key={block.id}
                                          className="timeline-block timeline-free-block"
                                          style={{
                                            top: `${topPercent}%`,
                                            height: `${heightPercent - 1}%`, // 减去1%的下边距
                                            // TODO: 优化最小高度
                                            minHeight: '35px',
                                          }}
                                        >
                                          <div className="timeline-free-block-content">
                                            <div className="timeline-free-block-cta">
                                              空闲时间
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </aside>

              {/* Kanban Section */}
              <section className="kanban-section">
                <div className="kanban-header">
                  <div className="kanban-title-section">
                    <h2 className="kanban-title">任务看板</h2>
                    <nav className="kanban-nav">
                      <button className="kanban-nav-btn active">我的任务</button>
                      <button className="kanban-nav-btn">团队</button>
                      <button className="kanban-nav-btn">归档</button>
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
                    <button className="kanban-filter-btn" onClick={() => setFilterPanelOpen(!filterPanelOpen)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                      </svg>
                    </button>
                  </div>
                </div>




                <SortableContext
                  items={[
                    ...getFilteredTasks().todo.map(task => task.id),
                    ...getFilteredTasks().doing.map(task => task.id),
                    ...getFilteredTasks().verify.map(task => task.id),
                    ...getFilteredTasks().done.map(task => task.id)
                  ]}
                  strategy={verticalListSortingStrategy}
                >
                  {viewMode === 'week' ? (
                    // Week View - Task Carousels for all statuses
                    <div className="status-carousel-container">
                      {/* Todo Carousel */}
                      <div
                        className={`status-carousel ${todoDroppable.isOver || draggingOverColumn === 'column:todo' ? 'dragging-over' : ''}`}
                        ref={todoDroppable.setNodeRef}
                        id="column:todo"
                      >
                        <div className="status-carousel-header">
                          <div className="status-header-left">
                            <div className="status-indicator todo"></div>
                            <span className="status-name">Todo</span>
                          </div>
                          <span className="status-count">
                            {getFilteredTasks().todo.length > 0
                              ? `${Math.min(currentTodoIndex + 1, getFilteredTasks().todo.length)} / ${getFilteredTasks().todo.length}`
                              : '0 / 0'}
                          </span>
                        </div>
                        <div className="carousel-body">
                          <div className="carousel-card-container" style={{ minHeight: '120px' }}>
                            {getFilteredTasks().todo.length > 0 ? (
                              (() => {
                                const todoTasks = getFilteredTasks().todo;
                                const task = todoTasks[Math.min(currentTodoIndex, todoTasks.length - 1)];
                                return task ? (
                                  <SortableTaskCard key={task.id} task={task} columnId="todo" />
                                ) : (
                                  <div className="empty-message">暂无任务</div>
                                );
                              })()
                            ) : (
                              <div className="empty-message" style={{ pointerEvents: 'none' }}>拖拽任务</div>
                            )}
                          </div>

                          {getFilteredTasks().todo.length > 0 && (
                            <div className="carousel-controls">
                              <button
                                className="carousel-nav-btn prev"
                                onClick={() => setCurrentTodoIndex(prev => Math.max(0, prev - 1))}
                                disabled={currentTodoIndex === 0}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                              </button>

                              <div className="carousel-pagination">
                                {getFilteredTasks().todo.map((_, index) => (
                                  <button
                                    key={index}
                                    className={`carousel-dot ${index === Math.min(currentTodoIndex, getFilteredTasks().todo.length - 1) ? 'active' : ''}`}
                                    onClick={() => setCurrentTodoIndex(index)}
                                    aria-label={`Go to task ${index + 1}`}
                                  />
                                ))}
                              </div>

                              <button
                                className="carousel-nav-btn next"
                                onClick={() => setCurrentTodoIndex(prev => Math.min(getFilteredTasks().todo.length - 1, prev + 1))}
                                disabled={currentTodoIndex >= getFilteredTasks().todo.length - 1}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Doing Carousel */}
                      <div
                        className={`status-carousel ${doingDroppable.isOver || draggingOverColumn === 'column:doing' ? 'dragging-over' : ''}`}
                        ref={doingDroppable.setNodeRef}
                        id="column:doing"
                      >
                        <div className="status-carousel-header">
                          <div className="status-header-left">
                            <div className="status-indicator doing"></div>
                            <span className="status-name">Doing</span>
                          </div>
                          <span className="status-count">
                            {getFilteredTasks().doing.length > 0
                              ? `${Math.min(currentDoingIndex + 1, getFilteredTasks().doing.length)} / ${getFilteredTasks().doing.length}`
                              : '0 / 0'}
                          </span>
                        </div>
                        <div className="carousel-body">
                          <div className="carousel-card-container" style={{ minHeight: '120px' }}>
                            {getFilteredTasks().doing.length > 0 ? (
                              (() => {
                                const doingTasks = getFilteredTasks().doing;
                                const task = doingTasks[Math.min(currentDoingIndex, doingTasks.length - 1)];
                                return task ? (
                                  <SortableTaskCard key={task.id} task={task} columnId="doing" />
                                ) : (
                                  <div className="empty-message">暂无任务</div>
                                );
                              })()
                            ) : (
                              <div className="empty-message" style={{ pointerEvents: 'none' }}>拖拽任务</div>
                            )}
                          </div>

                          {getFilteredTasks().doing.length > 0 && (
                            <div className="carousel-controls">
                              <button
                                className="carousel-nav-btn prev"
                                onClick={() => setCurrentDoingIndex(prev => Math.max(0, prev - 1))}
                                disabled={currentDoingIndex === 0}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                              </button>

                              <div className="carousel-pagination">
                                {getFilteredTasks().doing.map((_, index) => (
                                  <button
                                    key={index}
                                    className={`carousel-dot ${index === Math.min(currentDoingIndex, getFilteredTasks().doing.length - 1) ? 'active' : ''}`}
                                    onClick={() => setCurrentDoingIndex(index)}
                                    aria-label={`Go to task ${index + 1}`}
                                  />
                                ))}
                              </div>

                              <button
                                className="carousel-nav-btn next"
                                onClick={() => setCurrentDoingIndex(prev => Math.min(getFilteredTasks().doing.length - 1, prev + 1))}
                                disabled={currentDoingIndex >= getFilteredTasks().doing.length - 1}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Verify Carousel */}
                      <div
                        className={`status-carousel ${verifyDroppable.isOver || draggingOverColumn === 'column:verify' ? 'dragging-over' : ''}`}
                        ref={verifyDroppable.setNodeRef}
                        id="column:verify"
                      >
                        <div className="status-carousel-header">
                          <div className="status-header-left">
                            <div className="status-indicator verify"></div>
                            <span className="status-name">Verify</span>
                          </div>
                          <span className="status-count">
                            {getFilteredTasks().verify.length > 0
                              ? `${Math.min(currentVerifyIndex + 1, getFilteredTasks().verify.length)} / ${getFilteredTasks().verify.length}`
                              : '0 / 0'}
                          </span>
                        </div>
                        <div className="carousel-body">
                          <div className="carousel-card-container" style={{ minHeight: '120px' }}>
                            {getFilteredTasks().verify.length > 0 ? (
                              (() => {
                                const verifyTasks = getFilteredTasks().verify;
                                const task = verifyTasks[Math.min(currentVerifyIndex, verifyTasks.length - 1)];
                                return task ? (
                                  <SortableTaskCard key={task.id} task={task} columnId="verify" />
                                ) : (
                                  <div className="empty-message">暂无任务</div>
                                );
                              })()
                            ) : (
                              <div className="empty-message" style={{ pointerEvents: 'none' }}>拖拽任务</div>
                            )}
                          </div>

                          {getFilteredTasks().verify.length > 0 && (
                            <div className="carousel-controls">
                              <button
                                className="carousel-nav-btn prev"
                                onClick={() => setCurrentVerifyIndex(prev => Math.max(0, prev - 1))}
                                disabled={currentVerifyIndex === 0}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                              </button>

                              <div className="carousel-pagination">
                                {getFilteredTasks().verify.map((_, index) => (
                                  <button
                                    key={index}
                                    className={`carousel-dot ${index === Math.min(currentVerifyIndex, getFilteredTasks().verify.length - 1) ? 'active' : ''}`}
                                    onClick={() => setCurrentVerifyIndex(index)}
                                    aria-label={`Go to task ${index + 1}`}
                                  />
                                ))}
                              </div>

                              <button
                                className="carousel-nav-btn next"
                                onClick={() => setCurrentVerifyIndex(prev => Math.min(getFilteredTasks().verify.length - 1, prev + 1))}
                                disabled={currentVerifyIndex >= getFilteredTasks().verify.length - 1}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Done Carousel */}
                      <div
                        className={`status-carousel ${doneDroppable.isOver || draggingOverColumn === 'column:done' ? 'dragging-over' : ''}`}
                        ref={doneDroppable.setNodeRef}
                        id="column:done"
                      >
                        <div className="status-carousel-header">
                          <div className="status-header-left">
                            <div className="status-indicator done"></div>
                            <span className="status-name">Done</span>
                          </div>
                          <span className="status-count">
                            {getFilteredTasks().done.length > 0
                              ? `${Math.min(currentDoneIndex + 1, getFilteredTasks().done.length)} / ${getFilteredTasks().done.length}`
                              : '0 / 0'}
                          </span>
                        </div>
                        <div className="carousel-body">
                          <div className="carousel-card-container" style={{ minHeight: '120px' }}>
                            {getFilteredTasks().done.length > 0 ? (
                              (() => {
                                const doneTasks = getFilteredTasks().done;
                                const task = doneTasks[Math.min(currentDoneIndex, doneTasks.length - 1)];
                                return task ? (
                                  <SortableTaskCard key={task.id} task={task} columnId="done" />
                                ) : (
                                  <div className="empty-message">暂无任务</div>
                                );
                              })()
                            ) : (
                              <div className="empty-message" style={{ pointerEvents: 'none' }}>暂无任务</div>
                            )}
                          </div>

                          {getFilteredTasks().done.length > 0 && (
                            <div className="carousel-controls">
                              <button
                                className="carousel-nav-btn prev"
                                onClick={() => setCurrentDoneIndex(prev => Math.max(0, prev - 1))}
                                disabled={currentDoneIndex === 0}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                              </button>

                              <div className="carousel-pagination">
                                {getFilteredTasks().done.map((_, index) => (
                                  <button
                                    key={index}
                                    className={`carousel-dot ${index === Math.min(currentDoneIndex, getFilteredTasks().done.length - 1) ? 'active' : ''}`}
                                    onClick={() => setCurrentDoneIndex(index)}
                                    aria-label={`Go to task ${index + 1}`}
                                  />
                                ))}
                              </div>

                              <button
                                className="carousel-nav-btn next"
                                onClick={() => setCurrentDoneIndex(prev => Math.min(getFilteredTasks().done.length - 1, prev + 1))}
                                disabled={currentDoneIndex >= getFilteredTasks().done.length - 1}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Day View - Standard Kanban Board
                    <div className="kanban-columns">
                      {/* To Do */}
                      <div
                        className={`kanban-column ${todoDroppable.isOver || draggingOverColumn === 'column:todo' ? 'dragging-over' : ''}`}
                        id="column:todo"
                        ref={todoDroppable.setNodeRef}
                      >
                        <div className="kanban-column-header">
                          <div className="kanban-column-title-section">
                            <span className="kanban-column-title">Todo</span>
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
                            <div className="loading-message">Loading...</div>
                          ) : error ? (
                            <div className="error-message">Error: {error.message}</div>
                          ) : todayData ? (
                            getFilteredTasks().todo.length > 0 ? (
                              getFilteredTasks().todo.map(task => (
                                <SortableTaskCard key={task.id} task={task} columnId="todo" />
                              ))
                            ) : (
                              <div className="empty-message">
                                {(uiState.filters.tags.length > 0 || uiState.filters.priority) ?
                                  '无匹配任务' : '暂无任务'}
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
                            <span className="kanban-column-title">Doing</span>
                            <span className="kanban-column-count">
                              {getFilteredTasks().doing.length}
                            </span>
                          </div>
                        </div>
                        <div className="kanban-tasks">
                          {isLoading ? (
                            <div className="loading-message">Loading...</div>
                          ) : error ? (
                            <div className="error-message">Error: {error.message}</div>
                          ) : todayData ? (
                            getFilteredTasks().doing.length > 0 ? (
                              getFilteredTasks().doing.map(task => (
                                <SortableTaskCard key={task.id} task={task} columnId="doing" />
                              ))
                            ) : (
                              <div className="empty-message">
                                {(uiState.filters.tags.length > 0 || uiState.filters.priority) ?
                                  '无匹配任务' : '拖拽任务到此处'}
                              </div>
                            )
                          ) : (
                            <div className="empty-message">拖拽任务到此处</div>
                          )}
                        </div>
                      </div>

                      {/* Verify */}
                      <div
                        className={`kanban-column ${verifyDroppable.isOver || draggingOverColumn === 'column:verify' ? 'dragging-over' : ''}`}
                        id="column:verify"
                        ref={verifyDroppable.setNodeRef}
                      >
                        <div className="kanban-column-header">
                          <div className="kanban-column-title-section">
                            <span className="kanban-column-title">Verify</span>
                            <span className="kanban-column-count">
                              {getFilteredTasks().verify.length}
                            </span>
                          </div>
                        </div>
                        <div className="kanban-tasks">
                          {isLoading ? (
                            <div className="loading-message">加载中...</div>
                          ) : error ? (
                            <div className="error-message">加载失败: {error.message}</div>
                          ) : todayData ? (
                            getFilteredTasks().verify.length > 0 ? (
                              getFilteredTasks().verify.map(task => (
                                <SortableTaskCard key={task.id} task={task} columnId="verify" />
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
                            <span className="kanban-column-title">Done</span>
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
                  )}
                </SortableContext>

                <DragOverlay>
                  {draggingTask && !draggingOverTimeline ? (
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
                    拖拽任务以更改状态和顺序
                  </p>
                </div>
              </section>
            </DndContext>
          </main>
        </div>
      </section >

      {/* 新建任务模态框 */}
      < TaskCreateModal
        open={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onCreated={handleTaskCreated}
      />

      {/* 快速排期弹窗 */}
      {
        isQuickScheduleOpen && (
          <div className="quick-schedule-modal-overlay">
            <div className="quick-schedule-modal">
              <div className="quick-schedule-modal-header">
                <h3>快速排期</h3>
                <button
                  className="quick-schedule-close-btn"
                  onClick={() => {
                    setIsQuickScheduleOpen(false);
                    setQuickScheduleTitle('');
                    setQuickScheduleDuration(30);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="quick-schedule-modal-content">
                <div className="quick-schedule-form-group">
                  <label htmlFor="quick-schedule-title">任务标题</label>
                  <input
                    type="text"
                    id="quick-schedule-title"
                    className="quick-schedule-input"
                    placeholder="做什么？"
                    value={quickScheduleTitle}
                    onChange={(e) => setQuickScheduleTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="quick-schedule-form-row">
                  <div className="quick-schedule-form-group">
                    <label htmlFor="quick-schedule-duration">时长</label>
                    <select
                      id="quick-schedule-duration"
                      className="quick-schedule-select"
                      value={quickScheduleDuration}
                      onChange={(e) => setQuickScheduleDuration(Number(e.target.value))}
                    >
                      <option value="15">15 Mins</option>
                      <option value="30">30 Mins</option>
                      <option value="60">60 Mins</option>
                    </select>
                  </div>
                  <div className="quick-schedule-form-group">
                    <label>开始时间</label>
                    <div className="quick-schedule-time-display">
                      {new Date(quickScheduleStartTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="quick-schedule-modal-footer">
                <button
                  className="quick-schedule-cancel-btn"
                  onClick={() => {
                    setIsQuickScheduleOpen(false);
                    // 重置表单
                    setQuickScheduleTitle('');
                    setQuickScheduleDuration(30);
                  }}
                >
                  取消
                </button>
                <button
                  className="quick-schedule-save-btn"
                  onClick={async () => {
                    if (!quickScheduleTitle.trim()) return;

                    try {
                      // Calculate end time
                      const startDate = new Date(quickScheduleStartTime);
                      const endDate = new Date(startDate.getTime() + quickScheduleDuration * 60 * 1000);

                      // Create task
                      await createTask({
                        title: quickScheduleTitle,
                        status: 'todo',
                        estimate_min: quickScheduleDuration,
                        scheduled_start: startDate.toISOString(),
                        scheduled_end: endDate.toISOString(),
                        due_date: yyyymmdd,
                        board_id: 'default',
                        order_index: 0,
                      });

                      // Close modal
                      setQuickScheduleTitle('');
                      setQuickScheduleDuration(30);
                    } catch (error) {
                      console.error('Failed to create task:', error);
                      alert(`Failed to create task: ${(error as Error).message}`);
                    }
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* 任务状态切换菜单 */}
      {
        isStatusMenuOpen && selectedTask && (
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


              {selectedTask.status === 'todo' && (
                <>
                  <button
                    className="status-menu-item"
                    onClick={() => handleChangeTaskStatus('doing')}
                  >
                    开始
                  </button>
                  <button
                    className="status-menu-item"
                    onClick={() => handleMarkTaskDone(selectedTask.id)}
                  >
                    标记完成
                  </button>
                </>
              )}

              {selectedTask.status === 'doing' && (
                <>
                  <button
                    className="status-menu-item"
                    onClick={() => handleChangeTaskStatus('todo')}
                  >
                    暂停
                  </button>
                  <button
                    className="status-menu-item"
                    onClick={() => handleChangeTaskStatus('verify')}
                  >
                    提交审核
                  </button>
                  <button
                    className="status-menu-item"
                    onClick={() => handleMarkTaskDone(selectedTask.id)}
                  >
                    标记完成
                  </button>
                </>
              )}

              {selectedTask.status === 'verify' && (
                <>
                  <button
                    className="status-menu-item"
                    onClick={() => handleChangeTaskStatus('doing')}
                  >
                    返回进行中
                  </button>
                  <button
                    className="status-menu-item"
                    onClick={() => handleMarkTaskDone(selectedTask.id)}
                  >
                    通过审核
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
                    onClick={() => handleChangeTaskStatus('verify')}
                  >
                    重新审核
                  </button>
                </>
              )}

              {/* 优先级设置 */}
              <div className="status-menu-divider"></div>
              <div className="status-menu-section-title">设置优先级</div>
              <button
                className={`status-menu-item ${selectedTask.priority === 'p0' ? 'active' : ''}`}
                onClick={() => handleUpdatePriority(selectedTask.id, 'p0')}
              >
                P0
              </button>
              <button
                className={`status-menu-item ${selectedTask.priority === 'p1' ? 'active' : ''}`}
                onClick={() => handleUpdatePriority(selectedTask.id, 'p1')}
              >
                P1
              </button>
              <button
                className={`status-menu-item ${selectedTask.priority === 'p2' ? 'active' : ''}`}
                onClick={() => handleUpdatePriority(selectedTask.id, 'p2')}
              >
                P2
              </button>
              <button
                className={`status-menu-item ${selectedTask.priority === 'p3' ? 'active' : ''}`}
                onClick={() => handleUpdatePriority(selectedTask.id, 'p3')}
              >
                P3
              </button>

              {/* Tags management */}
              <div className="status-menu-divider"></div>
              <div className="status-menu-section-title">管理标签</div>
              <button
                className="status-menu-item"
                onClick={() => handleOpenTagsEditor(selectedTask)}
              >
                编辑标签
              </button>

              {/* Schedule management */}
              <div className="status-menu-divider"></div>
              <div className="status-menu-section-title">排期</div>
              <button
                className="status-menu-item"
                onClick={() => handleOpenScheduleEditor(selectedTask)}
              >
                编辑排期
              </button>
            </div>
          </div>
        )
      }

      {/* 任务编辑模态框 */}
      {
        isEditModalOpen && editingTask && (
          <div
            className="task-edit-modal-overlay modal open"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                handleCloseEditModal();
              }
            }}
          >
            <div className="task-edit-modal" onMouseDown={(event) => event.stopPropagation()}>
              <div className="task-modal-header">
                <div className="task-modal-header-left">
                  <div className="task-modal-icon-box">
                    <span className="material-symbols-outlined">edit_note</span>
                  </div>
                  <h3 className="task-modal-title">编辑任务</h3>
                </div>
                <button className="task-modal-close-btn" onClick={handleCloseEditModal}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="task-modal-body custom-scrollbar">
                {/* Title */}
                <div className="task-field-group">
                  <label className="task-label">标题</label>
                  <input
                    type="text"
                    className="task-input-title"
                    placeholder="做什么？"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                  />
                </div>

                {/* Description */}
                <div className="task-field-group">
                  <label className="task-label">描述</label>
                  <textarea
                    className="task-input-desc custom-scrollbar"
                    placeholder="详情..."
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                  />
                </div>

                {/* Subtasks */}
                <div className="task-field-group">
                  <div className="subtask-header">
                    <label className="subtask-header-label">
                      <span className="material-symbols-outlined text-[18px]">checklist</span>
                      子任务 ({editSubtasks.filter(s => s.completed).length}/{editSubtasks.length})
                    </label>
                    {editSubtasks.length > 0 && (
                      <div className="subtask-progress">
                        <div
                          className="subtask-progress-bar"
                          style={{ width: `${(editSubtasks.filter(s => s.completed).length / editSubtasks.length) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="subtask-list">
                    {editSubtasks.map((subtask) => (
                      <div key={subtask.id} className="subtask-item group">
                        <input
                          type="checkbox"
                          className="subtask-checkbox"
                          checked={subtask.completed}
                          onChange={e => handleUpdateEditSubtask(subtask.id, { completed: e.target.checked })}
                        />
                        <input
                          type="text"
                          className={`subtask-text ${subtask.completed ? 'completed' : ''}`}
                          value={subtask.title}
                          onChange={e => handleUpdateEditSubtask(subtask.id, { title: e.target.value })}
                          placeholder="子任务标题"
                        />
                        <button
                          className="subtask-delete-btn"
                          onClick={() => handleRemoveEditSubtask(subtask.id)}
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    ))}
                    <button className="btn-add-subtask" onClick={handleAddEditSubtask}>
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      添加子任务
                    </button>
                  </div>
                </div>

                {/* Grid Layout for Meta */}
                <div className="task-meta-grid">

                  {/* Priority - Full Width */}
                  <div className="task-row-full">
                    <label className="task-section-label">
                      <span className="material-symbols-outlined text-gray-400 text-[18px]">flag</span>
                      优先级</label>
                    <div className="priority-grid">
                      {[
                        { val: 'p0', label: 'P0', class: 'p0' },
                        { val: 'p1', label: 'P1', class: 'p1' },
                        { val: 'p2', label: 'P2', class: 'p2' },
                        { val: 'p3', label: 'P3', class: 'p3' },
                      ].map((p) => (
                        <label key={p.val} className="priority-option group">
                          <input
                            type="radio"
                            name="editPriority"
                            className="priority-radio peer"
                            value={p.val}
                            checked={editPriority === p.val}
                            onChange={e => setEditPriority(e.target.value as TaskPriority)}
                          />
                          <div className="priority-card">
                            <div className={`priority-dot ${p.class}`}></div>
                            <span className="text-sm font-medium">{p.label}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Tags - Full Width */}
                  <div className="task-row-full">
                    <label className="task-section-label">
                      <span className="material-symbols-outlined text-gray-400 text-[18px]">sell</span>
                      标签
                    </label>
                    <div className="tags-container">
                      {editTags.map(tag => (
                        <div key={tag} className="tag-item">
                          <span>{tag}</span>
                          <button onClick={() => handleRemoveEditTag(tag)} className="tag-remove-btn">
                            <span className="material-symbols-outlined text-[16px] align-middle">close</span>
                          </button>
                        </div>
                      ))}
                      <input
                        type="text"
                        className="tag-input"
                        placeholder="+ 添加标签 (Enter)"
                        value={editNewTagInput}
                        onChange={e => setEditNewTagInput(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && handleAddEditTag()}
                      />
                    </div>
                  </div>

                  {/* Periodicity - Full Width */}
                  <div className="task-row-full">
                    <div className="periodicity-toggle-row">
                      <label className="task-section-label mb-0">
                        <span className="material-symbols-outlined text-gray-400 text-[18px]">update</span>
                        周期重复
                      </label>
                      <label className="periodicity-switch">
                        <input
                          type="checkbox"
                          className="switch-input"
                          checked={isEditRecurring}
                          onChange={e => setIsEditRecurring(e.target.checked)}
                        />
                        <div className="switch-slider"></div>
                        <span className="switch-label-text">{isEditRecurring ? '开启' : '关闭'}</span>
                      </label>
                    </div>

                    {isEditRecurring && (
                      <div className="periodicity-panel">
                        {/* Frequency */}
                        <div className="periodicity-row">
                          <span className="periodicity-label">频率</span>
                          <div className="periodicity-controls">
                            <span className="text-sm">每</span>
                            <input
                              type="number"
                              min="1"
                              className="input-sm w-16 text-center"
                              value={editPeriodicity.interval}
                              onChange={e => setEditPeriodicity({ ...editPeriodicity, interval: parseInt(e.target.value) || 1 })}
                            />
                            <select
                              className="input-sm flex-1"
                              value={editPeriodicity.strategy}
                              onChange={e => setEditPeriodicity({ ...editPeriodicity, strategy: e.target.value })}
                            >
                              <option value="day">天</option>
                              <option value="week">周</option>
                              <option value="month">月</option>
                              <option value="year">年</option>
                            </select>
                          </div>
                        </div>

                        {/* Start Date */}
                        <div className="periodicity-row">
                          <span className="periodicity-label">开始日期</span>
                          <div className="flex gap-2 w-full">
                            <input
                              type="date"
                              className="input-sm flex-1"
                              value={editPeriodicity.start_date.split('T')[0]} // Handle ISO string
                              onChange={e => setEditPeriodicity({ ...editPeriodicity, start_date: e.target.value })}
                            />
                            <input
                              type="time"
                              className="input-sm w-32"
                              value={editPeriodicityTime}
                              onChange={e => setEditPeriodicityTime(e.target.value)}
                            />
                          </div>
                        </div>

                        {/* End Condition */}
                        <div className="periodicity-row items-start">
                          <span className="periodicity-label pt-2">结束条件</span>
                          <div className="end-conditions">
                            <label className="radio-row">
                              <input
                                type="radio"
                                name="end_rule"
                                className="w-4 h-4 text-primary"
                                checked={editPeriodicity.end_rule === 'never'}
                                onChange={() => setEditPeriodicity({ ...editPeriodicity, end_rule: 'never' })}
                              />
                              <span>永不</span>
                            </label>

                            <label className="radio-row">
                              <input
                                type="radio"
                                name="end_rule"
                                className="w-4 h-4 text-primary"
                                checked={editPeriodicity.end_rule === 'date'}
                                onChange={() => setEditPeriodicity({ ...editPeriodicity, end_rule: 'date' })}
                              />
                              <span>直到日期</span>
                              <input
                                type="date"
                                className="input-sm ml-2"
                                disabled={editPeriodicity.end_rule !== 'date'}
                                value={editPeriodicity.end_date || ''}
                                onChange={e => setEditPeriodicity({ ...editPeriodicity, end_date: e.target.value })}
                              />
                            </label>

                            <label className="radio-row">
                              <input
                                type="radio"
                                name="end_rule"
                                className="w-4 h-4 text-primary"
                                checked={editPeriodicity.end_rule === 'count'}
                                onChange={() => setEditPeriodicity({ ...editPeriodicity, end_rule: 'count' })}
                              />
                              <span>之后</span>
                              <div className="flex items-center gap-2 ml-2">
                                <input
                                  type="number"
                                  className="input-sm w-20"
                                  disabled={editPeriodicity.end_rule !== 'count'}
                                  value={editPeriodicity.end_count || 10}
                                  onChange={e => setEditPeriodicity({ ...editPeriodicity, end_count: parseInt(e.target.value) || 1 })}
                                />
                                <span className="text-xs text-gray-500">Times</span>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scheduled Time - Row */}
                  <div className="task-edit-row">
                    <div className="task-edit-form-group">
                      <label>Start Time</label>
                      <input
                        className="task-edit-input"
                        type="datetime-local"
                        value={editScheduledStart}
                        onChange={(event) => setEditScheduledStart(event.target.value)}
                      />
                    </div>
                    <div className="task-edit-form-group">
                      <label>Deadline</label>
                      <input
                        className="task-edit-input"
                        type="date"
                        value={editDueDate}
                        onChange={(event) => setEditDueDate(event.target.value)}
                      />
                    </div>
                    <div className="task-edit-form-group">
                      <label>Estimate (mins)</label>
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
                </div>
                <div className="task-modal-footer">
                  <button className="btn-delete" onClick={handleDeleteTask}>
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    Delete
                  </button>

                  <div className="footer-actions">
                    <button className="btn-cancel" onClick={handleCloseEditModal}>
                      Cancel
                    </button>
                    <button className="btn-save" onClick={handleSaveEditModal}>
                      <span className="material-symbols-outlined text-[20px]">save</span>
                      Save
                    </button>
                  </div>
                </div>

                {/* 删锟斤拷确锟较对伙拷锟斤拷 */}
                {isDeleteConfirmOpen && (
                  <div className="delete-confirm-overlay">
                    <div className="delete-confirm-modal">
                      <div className="delete-confirm-title">Confirm Delete</div>
                      <div className="delete-confirm-content">
                        Are you sure you want to delete task "{editingTask.title}"? This cannot be undone.
                      </div>
                      <div className="delete-confirm-footer">
                        <button className="delete-confirm-cancel" onClick={handleCancelDeleteTask}>
                          Cancel
                        </button>
                        <button className="delete-confirm-delete" onClick={handleConfirmDeleteTask}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* 锟斤拷签锟洁辑锟斤拷 */}
      {
        isTagsEditorOpen && editingTagsTask && (
          <div className="tags-editor-overlay">
            <div className="tags-editor">
              <div className="tags-editor-header">
                <h3>Edit Tags - {editingTagsTask.title}</h3>
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
                    <label>Tags List</label>
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
                        <div className="tags-editor-empty">No tags, add one below</div>
                      )}
                    </div>
                  </div>
                  <div className="tags-editor-form-group">
                    <label>Add New Tag</label>
                    <div className="tags-editor-input-group">
                      <input
                        type="text"
                        className="tags-editor-input"
                        placeholder="Enter tag name (Enter)"
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
                        Add
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
                  Cancel
                </button>
                <button
                  className="tags-editor-save-btn"
                  onClick={handleSaveTags}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* 锟脚程编辑锟斤拷 */}
      {
        isScheduleEditorOpen && editingScheduleTask && (
          <div className="schedule-editor-overlay">
            <div className="schedule-editor">
              <div className="schedule-editor-header">
                <h3>Edit Schedule - {editingScheduleTask.title}</h3>
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
                    <label htmlFor="estimate-min">Estimate (mins)</label>
                    <input
                      type="number"
                      id="estimate-min"
                      className="schedule-editor-input"
                      placeholder="Estimate time (1-1440 mins)"
                      value={scheduleEditorEstimateMin}
                      onChange={(e) => setScheduleEditorEstimateMin(e.target.value)}
                      min="1"
                      max="1440"
                    />
                  </div>
                  <div className="schedule-editor-form-group">
                    <label htmlFor="scheduled-end">Scheduled End</label>
                    {editingScheduleTask.scheduled_start ? (
                      <input
                        type="time"
                        id="scheduled-end"
                        className="schedule-editor-input"
                        placeholder="Select end time"
                        value={scheduleEditorScheduledEnd}
                        onChange={(e) => setScheduleEditorScheduledEnd(e.target.value)}
                        step="300" /* 5锟斤拷锟接诧拷锟斤拷 */
                      />
                    ) : (
                      <div className="schedule-editor-notice">
                        Task has no start time set. Cannot schedule end time.
                      </div>
                    )}
                  </div>
                </div>
                <div className="schedule-editor-footer">
                  <button
                    className="schedule-editor-cancel-btn"
                    onClick={handleCloseScheduleEditor}
                  >
                    Cancel
                  </button>
                  <button
                    className="schedule-editor-save-btn"
                    onClick={handleSaveSchedule}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
      <SmartAddModal />
    </>
  );

};

export default Home;
