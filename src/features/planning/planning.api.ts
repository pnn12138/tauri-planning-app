import { invoke } from "@tauri-apps/api/core";

import type {
  ApiResponse,
  ApiError,
} from "../../shared/types/api";

import type {
  CreateTaskInput,
  OpenDailyInput,
  OpenDailyResponse,
  OpenTaskNoteResponse,
  ReorderTaskInput,
  Task,
  TodayDTO,
  UpdateTaskInput,
} from "../../shared/types/planning";

// Normalized API error with field errors support
export type NormalizedApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
};

async function invokeApi<T>(command: string, args?: Record<string, unknown>) {
  const response = await invoke<ApiResponse<T>>(command, args);
  if (response.ok) return response.data;
  throw response.error;
}

// Parse and normalize API errors
export function normalizeError(error: unknown): NormalizedApiError {
  // Handle API errors from invokeApi
  if (typeof error === "object" && error !== null) {
    const apiError = error as ApiError;
    if ("code" in apiError && "message" in apiError) {
      // Check if details contains field errors
      const fieldErrors = apiError.details as Record<string, string> | undefined;
      
      return {
        code: apiError.code,
        message: apiError.message,
        fieldErrors: typeof fieldErrors === "object" && fieldErrors !== null 
          ? fieldErrors 
          : undefined,
      };
    }
  }
  
  // Handle other errors (network, serialization, etc.)
  return {
    code: "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  };
}

// Get all data needed for today's home page
export async function planningListToday(today: string): Promise<TodayDTO> {
  return invokeApi<TodayDTO>("planning_list_today", { today });
}

// Create a new task
export async function planningCreateTask(input: CreateTaskInput): Promise<Task> {
  return invokeApi<Task>("planning_create_task", { input });
}

// Update an existing task
export async function planningUpdateTask(input: UpdateTaskInput): Promise<void> {
  return invokeApi<void>("planning_update_task", { input });
}

// Mark a task as done
export async function planningMarkDone(taskId: string): Promise<void> {
  return invokeApi<void>("planning_mark_done", { taskId });
}

// Reopen a completed task
export async function planningReopenTask(taskId: string): Promise<void> {
  return invokeApi<void>("planning_reopen_task", { taskId });
}

// Start a task (create a timer and update task status)
export async function planningStartTask(taskId: string): Promise<void> {
  return invokeApi<void>("planning_start_task", { taskId });
}

// Stop a task (update timer and task status)
export async function planningStopTask(taskId: string): Promise<void> {
  return invokeApi<void>("planning_stop_task", { taskId });
}

// Open a daily log file (create if not exists)
export async function planningOpenDaily(input: OpenDailyInput): Promise<OpenDailyResponse> {
  return invokeApi<OpenDailyResponse>("planning_open_daily", { input });
}

// Open a task note file (create if not exists)
export async function planningOpenTaskNote(taskId: string): Promise<OpenTaskNoteResponse> {
  return invokeApi<OpenTaskNoteResponse>("planning_open_task_note", { taskId });
}

// Reorder tasks in batch
export async function planningReorderTasks(tasks: ReorderTaskInput[]): Promise<void> {
  return invokeApi<void>("planning_reorder_tasks", { tasks });
}

// Get UI state for the current vault
export async function planningGetUiState(
  vaultId: string
): Promise<Record<string, any> | null> {
  const result = await invokeApi<string | null>("planning_get_ui_state", { 
    vaultId 
  });

  if (result == null) return null;

  try {
    const parsed: unknown = JSON.parse(result);

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }

    console.warn("[planningGetUiState] Parsed UI state is not an object:", { vaultId, parsed });
    return null;
  } catch (error) {
    console.error("[planningGetUiState] Failed to parse UI state:", { vaultId, error, result });
    return null;
  }
}

// Set UI state for the current vault
export async function planningSetUiState(vaultId: string, partialState: Record<string, any>): Promise<void> {
  return invokeApi<void>("planning_set_ui_state", { 
    vaultId, 
    partial_state_json: JSON.stringify(partialState) 
  });
}
