// Task status enum
export type TaskStatus = 'backlog' | 'todo' | 'doing' | 'done';

// Task priority enum
export type TaskPriority = 'p0' | 'p1' | 'p2' | 'p3';

// Task model
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  labels?: string[];
  order_index: number;
  estimate_min?: number;
  scheduled_start?: string;
  scheduled_end?: string;
  due_date?: string;
  board_id?: string;
  note_path?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  archived: number;
}

// Timer model
export interface Timer {
  id: string;
  task_id: string;
  start_at: string;
  stop_at?: string;
  duration_sec: number;
  source: string;
}

// Day log model
export interface DayLog {
  day: string;
  daily_md_path: string;
  created_at: string;
  updated_at: string;
}

// TodayDTO - the main data structure for Home page
export interface TodayDTO {
  // Kanban tasks grouped by status
  kanban: {
    backlog: Task[];
    todo: Task[];
    doing: Task[];
    done: Task[];
  };
  // Timeline tasks for today
  timeline: Task[];
  // Currently active doing task (if any)
  currentDoing?: Task;
  // Currently active timer (if any)
  currentTimer?: Timer;
  // Today's date in YYYY-MM-DD format
  today: string;
  // Server current time in ISO format
  serverNow: string;
}

// Task creation input
export interface CreateTaskInput {
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  board_id?: string;
  estimate_min?: number;
  tags?: string[];
  labels?: string[];
  scheduled_start?: string;
  scheduled_end?: string;
  note_path?: string;
}

// Task update input
export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  tags?: string[];
  labels?: string[];
  due_date?: string | null;
  board_id?: string;
  order_index?: number;
  estimate_min?: number;
  scheduled_start?: string;
  scheduled_end?: string;
  note_path?: string;
  archived?: number;
}

// Open daily log input
export interface OpenDailyInput {
  day: string;
}

// Open daily log response
export interface OpenDailyResponse {
  mdPath: string;
}

// Open task note response
export interface OpenTaskNoteResponse {
  mdPath: string;
}

// Batch task reorder input
export interface ReorderTaskInput {
  id: string;
  status?: TaskStatus;
  order_index: number;
}
