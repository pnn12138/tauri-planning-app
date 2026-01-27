import { useSyncExternalStore } from "react";
import type { Task, TodayDTO } from "../../shared/types/planning";
import * as planningApi from "./planning.api";

// UI State Type
export type PlanningUIState = {
  filters: {
    tags: string[];
    priority: string | undefined;
  };
  layout: {
    timelineCollapsed: boolean;
  };
};

export type PlanningStoreState = {
  todayData: TodayDTO | null;
  isLoading: boolean;
  error: Error | null;
  inFlightByTaskId: Record<string, boolean>;
  // 操作前快照，用于回滚
  prevTodayData: TodayDTO | null;
  // 拖拽状态
  isDragging: boolean;
  // UI状态
  uiState: PlanningUIState;
  // 当前vault ID
  currentVaultId: string | null;
};

const listeners = new Set<() => void>();

let planningStoreState: PlanningStoreState = {
  todayData: null,
  isLoading: false,
  error: null,
  inFlightByTaskId: {},
  prevTodayData: null,
  isDragging: false,
  // UI状态初始值
  uiState: {
    filters: {
      tags: [],
      priority: undefined,
    },
    layout: {
      timelineCollapsed: false,
    },
  },
  currentVaultId: null,
};

function emitChange() {
  for (const listener of listeners) listener();
}

export function getPlanningStoreState() {
  return planningStoreState;
}

export function setPlanningStoreState(updater: (prev: PlanningStoreState) => PlanningStoreState) {
  planningStoreState = updater(planningStoreState);
  emitChange();
}

export function resetPlanningStoreState() {
  planningStoreState = {
    todayData: null,
    isLoading: false,
    error: null,
    inFlightByTaskId: {},
    prevTodayData: null,
    isDragging: false,
    // Reset UI state to defaults
    uiState: {
      filters: {
        tags: [],
        priority: undefined,
      },
      layout: {
        timelineCollapsed: false,
      },
    },
    currentVaultId: null,
  };
  emitChange();
}

// Update the kanban tasks in the store
export function updateKanban(kanban: TodayDTO['kanban']) {
  setPlanningStoreState((prev) => {
    if (!prev.todayData) return prev;

    return {
      ...prev,
      todayData: {
        ...prev.todayData,
        kanban,
      },
    };
  });
}

// Set dragging state
export function setIsDragging(isDragging: boolean) {
  setPlanningStoreState((prev) => ({
    ...prev,
    isDragging,
  }));
}

export function usePlanningStore<T>(selector: (state: PlanningStoreState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(planningStoreState),
    () => selector(planningStoreState)
  );
}

// Save snapshot of current state before mutation
export function saveSnapshot() {
  setPlanningStoreState((prev) => ({
    ...prev,
    prevTodayData: prev.todayData ? { ...prev.todayData } : null,
  }));
}

// Remove task from local state by ID
function removeTaskFromLocalState(taskId: string) {
  setPlanningStoreState((prev) => {
    if (!prev.todayData) return prev;

    const updatedTodayData = { ...prev.todayData };

    // Remove from all kanban columns
    // Remove from all kanban columns
    updatedTodayData.kanban = {
      todo: updatedTodayData.kanban.todo.filter(task => task.id !== taskId),
      doing: updatedTodayData.kanban.doing.filter(task => task.id !== taskId),
      verify: updatedTodayData.kanban.verify.filter(task => task.id !== taskId),
      done: updatedTodayData.kanban.done.filter(task => task.id !== taskId),
    };

    // Remove from timeline
    updatedTodayData.timeline = updatedTodayData.timeline.filter(task => task.id !== taskId);

    // Update currentDoing if it's the removed task
    if (updatedTodayData.currentDoing && updatedTodayData.currentDoing.id === taskId) {
      updatedTodayData.currentDoing = undefined;
    }

    // Update currentTimer if it's for the removed task
    if (updatedTodayData.currentTimer && updatedTodayData.currentTimer.task_id === taskId) {
      updatedTodayData.currentTimer = undefined;
    }

    return {
      ...prev,
      todayData: updatedTodayData,
    };
  });
}

// Rollback to previous snapshot
export function rollback() {
  setPlanningStoreState((prev) => ({
    ...prev,
    todayData: prev.prevTodayData ? { ...prev.prevTodayData } : null,
    error: null,
  }));
}

// Set task as in-flight
export function setTaskInFlight(taskId: string, inFlight: boolean) {
  setPlanningStoreState((prev) => ({
    ...prev,
    inFlightByTaskId: {
      ...prev.inFlightByTaskId,
      [taskId]: inFlight,
    },
  }));
}

// Check if task is in-flight
export function isTaskInFlight(taskId: string): boolean {
  return planningStoreState.inFlightByTaskId[taskId] || false;
}

// Load today's planning data
export async function loadTodayData(today: string) {
  setPlanningStoreState((prev) => ({
    ...prev,
    isLoading: true,
    error: null,
  }));

  try {
    const data = await planningApi.planningListToday(today);
    setPlanningStoreState((prev) => ({
      ...prev,
      todayData: data,
      isLoading: false,
    }));
    return data;
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    setPlanningStoreState((prev) => ({
      ...prev,
      isLoading: false,
      error: errorObj,
    }));

    // Handle specific error codes
    const errorCode = (error as any)?.code;
    if (errorCode === 'NotFound' || errorCode === 'Conflict' || errorCode === 'StaleState') {
      // Auto-refresh on these errors with shorter delay
      setTimeout(() => loadTodayData(today), 500);
    }

    throw error;
  }
}

// Get a task by ID from the store
export function getTaskById(taskId: string): Task | undefined {
  const state = getPlanningStoreState();
  if (!state.todayData) return undefined;

  // Search in all kanban columns
  const allTasks = [
    ...state.todayData.kanban.todo,
    ...state.todayData.kanban.doing,
    ...state.todayData.kanban.verify,
    ...state.todayData.kanban.done,
  ];

  return allTasks.find(task => task.id === taskId);
}

// Refresh today's data (useful after mutations)
export async function reloadTodayData(today: string) {
  return loadTodayData(today);
}

// Debounce timer for UI state save
let uiStateSaveTimer: number | null = null;

// Set current vault ID
export function setCurrentVaultId(vaultId: string) {
  setPlanningStoreState((prev) => ({
    ...prev,
    currentVaultId: vaultId,
  }));
}

// Load UI state from backend
export async function loadUIState(vaultId: string) {
  try {
    const savedState = await planningApi.planningGetUiState(vaultId);
    if (savedState) {
      setPlanningStoreState((prev) => ({
        ...prev,
        uiState: {
          ...prev.uiState,
          ...savedState,
        },
      }));
    }
  } catch (error) {
    console.error('Failed to load UI state:', error);
    // Fallback to default UI state
    setPlanningStoreState((prev) => ({
      ...prev,
      uiState: {
        filters: {
          tags: [],
          priority: undefined,
        },
        layout: {
          timelineCollapsed: false,
        },
      },
    }));
  }
}

// Update UI state with debounced save to backend
export function updateUIState(partialUIState: Partial<PlanningUIState>) {
  // Update local state immediately
  setPlanningStoreState((prev) => ({
    ...prev,
    uiState: {
      ...prev.uiState,
      ...partialUIState,
      // Deep merge filters and layout if they're objects
      filters: {
        ...prev.uiState.filters,
        ...(partialUIState.filters || {}),
      },
      layout: {
        ...prev.uiState.layout,
        ...(partialUIState.layout || {}),
      },
    },
  }));

  // Save to backend with debounce
  const vaultId = getPlanningStoreState().currentVaultId;
  if (!vaultId) return;

  // Clear existing timer
  if (uiStateSaveTimer) {
    clearTimeout(uiStateSaveTimer);
  }

  // Set new timer (300ms debounce)
  uiStateSaveTimer = setTimeout(() => {
    saveUIStateToBackend(vaultId);
  }, 300);
}

// Save UI state to backend immediately (without debounce)
async function saveUIStateToBackend(vaultId: string) {
  try {
    const uiState = getPlanningStoreState().uiState;
    await planningApi.planningSetUiState(vaultId, uiState);
  } catch (error) {
    console.error('Failed to save UI state to backend:', error);
  }
}

// Create a new task
export async function createTask(input: any) {
  // Check if any task is in flight
  if (Object.values(getPlanningStoreState().inFlightByTaskId).some(inFlight => inFlight)) {
    throw new Error('有任务正在处理中，请稍后再试');
  }

  saveSnapshot();

  try {
    // 调用API创建任务，获取返回的完整Task对象
    const newTask = await planningApi.planningCreateTask(input);

    // 局部插入：将新任务添加到对应看板列
    setPlanningStoreState((prev) => {
      if (!prev.todayData) return prev;

      const updatedKanban = { ...prev.todayData.kanban };
      const status = newTask.status as keyof typeof updatedKanban;
      updatedKanban[status] = [...updatedKanban[status], newTask];

      // 如果有计划日期且是今天，添加到时间线
      const updatedTimeline = prev.todayData.timeline;
      if (newTask.scheduled_start) {
        const taskDate = newTask.scheduled_start.split('T')[0];
        if (taskDate === prev.todayData.today) {
          updatedTimeline.push(newTask);
        }
      }

      return {
        ...prev,
        todayData: {
          ...prev.todayData,
          kanban: updatedKanban,
          timeline: updatedTimeline,
        },
      };
    });

    // 后台触发一次refreshToday()兜底对齐
    setTimeout(() => {
      const state = getPlanningStoreState();
      if (state.todayData) {
        reloadTodayData(state.todayData.today);
      }
    }, 100);

    return newTask;
  } catch (error) {
    rollback();
    throw error;
  }
}

// Common error handling function
function handleApiError(error: unknown, taskId: string | undefined, action: string) {
  const normalizedError = planningApi.normalizeError(error);

  // Check if there's a modal open (simplified check)
  const hasModalOpen = document.querySelector('.modal.open') !== null;

  if (normalizedError.code === 'NotFound' && taskId) {
    // Show toast: Task not found
    alert(`${action}失败：任务不存在或已被删除`);

    // Remove task from local state immediately
    removeTaskFromLocalState(taskId);

    // Refresh after a short delay, but not if there's a modal open
    if (!hasModalOpen) {
      const state = getPlanningStoreState();
      if (state.todayData) {
        const today = state.todayData.today;
        setTimeout(() => reloadTodayData(today), 500);
      }
    }
  } else if (normalizedError.code === 'InvalidStateTransition') {
    // Show toast: Invalid state transition
    alert(`${action}失败：${normalizedError.message}`);
  } else {
    // Show toast: General error
    alert(`${action}失败：${normalizedError.message}`);
  }

  throw error;
}

// Update a task
export async function updateTask(input: any) {
  if (isTaskInFlight(input.id)) {
    throw new Error('该任务正在处理中，请稍后再试');
  }

  setTaskInFlight(input.id, true);
  saveSnapshot();

  try {
    await planningApi.planningUpdateTask(input);
    // 后台触发一次refreshToday()兜底对齐
    setTimeout(() => {
      const state = getPlanningStoreState();
      if (state.todayData) {
        reloadTodayData(state.todayData.today);
      }
    }, 100);
  } catch (error) {
    rollback();
    handleApiError(error, input.id, '更新任务');
  } finally {
    setTaskInFlight(input.id, false);
  }
}

// Mark task as done
export async function markTaskDone(taskId: string) {
  if (isTaskInFlight(taskId)) {
    throw new Error('该任务正在处理中，请稍后再试');
  }

  setTaskInFlight(taskId, true);
  saveSnapshot();

  try {
    await planningApi.planningMarkDone(taskId);
    // 后台触发一次refreshToday()兜底对齐
    setTimeout(() => {
      const state = getPlanningStoreState();
      if (state.todayData) {
        reloadTodayData(state.todayData.today);
      }
    }, 100);
  } catch (error) {
    rollback();
    handleApiError(error, taskId, '标记任务完成');
  } finally {
    setTaskInFlight(taskId, false);
  }
}

// Reopen a completed task
export async function reopenTask(taskId: string) {
  if (isTaskInFlight(taskId)) {
    throw new Error('该任务正在处理中，请稍后再试');
  }

  setTaskInFlight(taskId, true);
  saveSnapshot();

  try {
    await planningApi.planningReopenTask(taskId);
    // 后台触发一次refreshToday()兜底对齐
    setTimeout(() => {
      const state = getPlanningStoreState();
      if (state.todayData) {
        reloadTodayData(state.todayData.today);
      }
    }, 100);
  } catch (error) {
    rollback();
    handleApiError(error, taskId, '重新打开任务');
  } finally {
    setTaskInFlight(taskId, false);
  }
}

// Start a task
export async function startTask(taskId: string) {
  if (isTaskInFlight(taskId)) {
    throw new Error('该任务正在处理中，请稍后再试');
  }

  setTaskInFlight(taskId, true);
  saveSnapshot();

  try {
    await planningApi.planningStartTask(taskId);
    // 后台触发一次refreshToday()兜底对齐
    setTimeout(() => {
      const state = getPlanningStoreState();
      if (state.todayData) {
        reloadTodayData(state.todayData.today);
      }
    }, 100);
  } catch (error) {
    rollback();
    handleApiError(error, taskId, '开始任务');
  } finally {
    setTaskInFlight(taskId, false);
  }
}

// Stop a task
export async function stopTask(taskId: string) {
  if (isTaskInFlight(taskId)) {
    throw new Error('该任务正在处理中，请稍后再试');
  }

  setTaskInFlight(taskId, true);
  saveSnapshot();

  try {
    await planningApi.planningStopTask(taskId);
    // 后台触发一次refreshToday()兜底对齐
    setTimeout(() => {
      const state = getPlanningStoreState();
      if (state.todayData) {
        reloadTodayData(state.todayData.today);
      }
    }, 100);
  } catch (error) {
    rollback();
    handleApiError(error, taskId, '停止任务');
  } finally {
    setTaskInFlight(taskId, false);
  }
}

// Open daily log
export async function openDaily(day: string) {
  try {
    return await planningApi.planningOpenDaily({ day });
  } catch (error) {
    // Handle specific error codes
    const errorCode = (error as any)?.code;
    if (errorCode === 'VaultNotSelected') {
      // 处理Vault未选择的情况
      throw new Error('请先选择工作目录');
    }
    throw error;
  }
}

// Reorder tasks in batch
export async function reorderTasks(tasks: any[]) {
  await planningApi.planningReorderTasks(tasks);
  // 后台触发一次refreshToday()兜底对齐
  setTimeout(() => {
    const state = getPlanningStoreState();
    if (state.todayData) {
      reloadTodayData(state.todayData.today);
    }
  }, 100);
}

// Delete a task
export async function deleteTask(taskId: string) {
  if (isTaskInFlight(taskId)) {
    throw new Error('该任务正在处理中，请稍后再试');
  }

  setTaskInFlight(taskId, true);
  saveSnapshot();

  try {
    // 乐观更新：先从本地状态中删除任务
    removeTaskFromLocalState(taskId);

    // 调用API删除任务
    await planningApi.planningDeleteTask(taskId);

    // 后台触发一次refreshToday()兜底对齐
    setTimeout(() => {
      const state = getPlanningStoreState();
      if (state.todayData) {
        reloadTodayData(state.todayData.today);
      }
    }, 100);
  } catch (error) {
    rollback();
    handleApiError(error, taskId, '删除任务');
  } finally {
    setTaskInFlight(taskId, false);
  }
}
