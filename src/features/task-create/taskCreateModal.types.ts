import { TaskStatus, TaskPriority } from '../../shared/types/planning';

// Step1 专用类型 - 仅包含Step1实现的字段
export type TaskCreateDraftStep1 = {
  title: string;
  status: 'backlog' | 'todo' | 'done';
  priority?: TaskPriority;
  tags?: string[];
  scheduledDate?: string; // YYYY-MM-DD 格式
  autoCreateNote?: boolean; // 是否自动创建task note
  newTagInput?: string; // 用于输入新标签的临时字段
};

// UI state for task creation form (完整类型，Step2使用)
export type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  dueDate?: string;
  newTagInput: string;
  estimateMin?: number;
};

// Updated CreateTaskInput with new fields
export interface CreateTaskInput {
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  due_date?: string;
  estimate_min?: number;
  scheduled_start?: string; // ISO datetime string
  scheduled_end?: string; // ISO datetime string
}

// Convert Step1 UI draft to API input
export const toCreateTaskInputStep1 = (draft: TaskCreateDraftStep1): CreateTaskInput => {
  const result: CreateTaskInput = {
    title: draft.title,
    status: draft.status,
    priority: draft.priority,
    tags: draft.tags && draft.tags.length > 0 ? draft.tags : undefined,
  };
  
  // 只有当选择了日期时才添加 scheduled_start
  // 使用本地时间语义，不添加Z后缀（Z表示UTC时间）
  if (draft.scheduledDate) {
    result.scheduled_start = `${draft.scheduledDate}T09:00:00.000`;
  }
  
  return result;
};

// Convert full UI draft to API input (Step2使用)
export const toCreateTaskInput = (draft: TaskDraft): CreateTaskInput => ({
  title: draft.title,
  description: draft.description || undefined,
  status: draft.status,
  priority: draft.priority,
  tags: draft.tags.length > 0 ? draft.tags : undefined,
  due_date: draft.dueDate,
  estimate_min: draft.estimateMin,
});

// Component props interface
export interface TaskCreateModalProps {
  open: boolean;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onCreated: () => void;
}
