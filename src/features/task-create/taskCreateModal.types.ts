import { TaskStatus, TaskPriority } from '../../shared/types/planning';

// Step1 专用类型 - 仅包含Step1实现的字段
export type TaskCreateDraftStep1 = {
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'done';
  priority: 'p0' | 'p1' | 'p2' | 'p3';
  tags?: string[];
  dueDateTime?: string; // ISO datetime-local format YYYY-MM-DDTHH:mm
  estimateMin?: number;
  autoCreateNote?: boolean; // 是否自动创建task note
  newTagInput?: string; // 用于输入新标签的临时字段
};

// UI state for task creation form (完整类型，Step2使用)
export type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'p0' | 'p1' | 'p2' | 'p3';
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
  labels?: string[];
  due_date?: string;
  board_id?: string;
  estimate_min?: number;
  scheduled_start?: string; // ISO datetime string
  scheduled_end?: string; // ISO datetime string
}

// Convert Step1 UI draft to API input
export const toCreateTaskInputStep1 = (draft: TaskCreateDraftStep1): CreateTaskInput => {
  // 字段归一化处理
  const normalizedTags = draft.tags
    ? draft.tags.filter(tag => tag.trim() !== '').filter((value, index, self) => self.indexOf(value) === index)
    : undefined;
  
  // 处理截止日期时间
  let dueDate: string | undefined;
  if (draft.dueDateTime) {
    // dueDateTime 格式为 YYYY-MM-DDTHH:mm，直接转换为 ISO 字符串
    const date = new Date(draft.dueDateTime);
    dueDate = date.toISOString();
  }
  
  const result: CreateTaskInput = {
    title: draft.title.trim(),
    description: draft.description?.trim() || undefined,
    status: draft.status,
    priority: draft.priority,
    tags: normalizedTags && normalizedTags.length > 0 ? normalizedTags : undefined,
    due_date: dueDate,
    board_id: "default",
    estimate_min: draft.estimateMin,
  };
  
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
  board_id: "default",
  estimate_min: draft.estimateMin,
});

// Component props interface
export interface TaskCreateModalProps {
  open: boolean;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onCreated: () => void;
}
