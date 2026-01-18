import { Task } from '../types/planning';

// Timeline configuration interface
export interface TimelineConfig {
  dayStart: string; // Format: 'HH:MM'
  dayEnd: string; // Format: 'HH:MM'
  minSlotMinutes: number;
  snapMinutes: number;
}

// Timeline block base interface
export interface TimelineBlock {
  id: string;
  start: Date;
  end: Date;
  durationMinutes: number;
}

// Busy block interface
export interface BusyBlock extends TimelineBlock {
  type: 'busy';
  task: Task;
}

// Free block interface
export interface FreeBlock extends TimelineBlock {
  type: 'free';
}

// Now line interface
export interface NowLine {
  time: Date;
  position: number; // Percentage from top (0-100)
}

// Timeline model interface
export interface TimelineModel {
  busyBlocks: BusyBlock[];
  freeBlocks: FreeBlock[];
  nowLine: NowLine;
}

// Convert HH:MM string to minutes since midnight
const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

// Convert minutes since midnight to HH:MM string
const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// Create a Date object for given time string on a specific date
const createDateForTime = (timeStr: string, baseDate: Date = new Date()): Date => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes);
  return date;
};

// Normalize time to nearest snap minutes
const normalizeTime = (date: Date, snapMinutes: number): Date => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const normalizedMinutes = Math.round(minutes / snapMinutes) * snapMinutes;
  const normalizedDate = new Date(date);
  normalizedDate.setHours(Math.floor(normalizedMinutes / 60));
  normalizedDate.setMinutes(normalizedMinutes % 60);
  normalizedDate.setSeconds(0);
  normalizedDate.setMilliseconds(0);
  return normalizedDate;
};

// Normalize events: handle overlaps, crop to day range, sort
export const normalizeEvents = (tasks: Task[], config: TimelineConfig): Task[] => {
  const { dayStart, dayEnd, snapMinutes } = config;
  
  // Filter tasks with at least scheduled start time
  let timelineTasks = tasks.filter(task => {
    return task.scheduled_start;
  });
  
  // Convert to Date objects and normalize
  const normalizedTasks = timelineTasks.map(task => {
    const originalStart = new Date(task.scheduled_start!);
    
    // Create day range for the task's date
    const taskDate = new Date(originalStart);
    const dayStartDate = createDateForTime(dayStart, taskDate);
    const dayEndDate = createDateForTime(dayEnd, taskDate);
    
    // Normalize start time
    const start = normalizeTime(originalStart, snapMinutes);
    
    // Calculate end time based on priority: scheduled_end > estimate_min > default 30 minutes
    let end: Date;
    if (task.scheduled_end) {
      end = new Date(task.scheduled_end);
    } else {
      // Use estimate_min if available, otherwise default to 30 minutes
      const durationMinutes = task.estimate_min || 30;
      end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    }
    
    // Normalize end time
    const normalizedEnd = normalizeTime(end, snapMinutes);
    
    // Crop to day range
    const croppedStart = start < dayStartDate ? dayStartDate : start;
    const croppedEnd = normalizedEnd > dayEndDate ? dayEndDate : normalizedEnd;
    
    return {
      ...task,
      scheduled_start: croppedStart.toISOString(),
      scheduled_end: croppedEnd.toISOString(),
    };
  });
  
  // Sort by start time
  normalizedTasks.sort((a, b) => {
    const aStart = new Date(a.scheduled_start!).getTime();
    const bStart = new Date(b.scheduled_start!).getTime();
    return aStart - bStart;
  });
  
  // Merge overlapping tasks - only merge tasks on the same day
  const mergedTasks: Task[] = [];
  for (const task of normalizedTasks) {
    if (mergedTasks.length === 0) {
      mergedTasks.push(task);
      continue;
    }
    
    const lastTask = mergedTasks[mergedTasks.length - 1];
    const lastTaskEnd = new Date(lastTask.scheduled_end!);
    const currentTaskStart = new Date(task.scheduled_start!);
    const currentTaskEnd = new Date(task.scheduled_end!);
    
    // Check if tasks are on the same day
    const isSameDay = lastTaskEnd.toDateString() === currentTaskStart.toDateString();
    
    if (isSameDay && currentTaskStart <= lastTaskEnd) {
      // Overlapping or adjacent tasks on the same day, merge them
      const mergedEnd = new Date(Math.max(lastTaskEnd.getTime(), currentTaskEnd.getTime()));
      mergedTasks[mergedTasks.length - 1] = {
        ...lastTask,
        scheduled_end: mergedEnd.toISOString(),
      };
    } else {
      // Non-overlapping task or different day, add to list
      mergedTasks.push(task);
    }
  }
  
  return mergedTasks;
};

// Build timeline model from normalized events
export const buildTimelineModel = (tasks: Task[], config: TimelineConfig): TimelineModel => {
  const { dayStart, dayEnd, minSlotMinutes } = config;
  const today = new Date();
  const dayStartDate = createDateForTime(dayStart, today);
  const dayEndDate = createDateForTime(dayEnd, today);
  const totalMinutes = timeToMinutes(dayEnd) - timeToMinutes(dayStart);
  
  // Normalize events
  const normalizedTasks = normalizeEvents(tasks, config);
  
  // Create busy blocks - only for today's tasks
  let busyBlocks: BusyBlock[] = normalizedTasks
    .filter(task => {
      const taskStart = new Date(task.scheduled_start!);
      // Check if task is on the same day as dayStartDate
      return taskStart.toDateString() === dayStartDate.toDateString();
    })
    .map(task => {
      const start = new Date(task.scheduled_start!);
      const end = new Date(task.scheduled_end!);
      const durationMinutes = Math.max(
        (end.getTime() - start.getTime()) / (1000 * 60),
        minSlotMinutes
      );
      
      return {
        id: `busy-${task.id}`,
        type: 'busy',
        start,
        end,
        durationMinutes,
        task,
      };
    });
  
  // Sort busy blocks by start time
  busyBlocks.sort((a, b) => a.start.getTime() - b.start.getTime());
  
  // Create free blocks
  const freeBlocks: FreeBlock[] = [];
  
  // Handle case with no tasks (full day free)
  if (busyBlocks.length === 0) {
    freeBlocks.push({
      id: `free-full-day-${dayStartDate.getTime()}`,
      type: 'free',
      start: new Date(dayStartDate),
      end: new Date(dayEndDate),
      durationMinutes: totalMinutes,
    });
  } else {
    let currentStart = dayStartDate;
    
    for (const busyBlock of busyBlocks) {
      if (currentStart < busyBlock.start) {
        // Add free block between currentStart and busyBlock.start
        const durationMinutes = Math.max(
          (busyBlock.start.getTime() - currentStart.getTime()) / (1000 * 60),
          minSlotMinutes
        );
        
        freeBlocks.push({
          id: `free-${currentStart.getTime()}-${busyBlock.start.getTime()}`,
          type: 'free',
          start: new Date(currentStart),
          end: new Date(busyBlock.start),
          durationMinutes,
        });
      }
      
      // Update currentStart to busyBlock.end
      currentStart = new Date(busyBlock.end);
    }
    
    // Add final free block if there's time left in the day
    if (currentStart < dayEndDate) {
      const durationMinutes = Math.max(
        (dayEndDate.getTime() - currentStart.getTime()) / (1000 * 60),
        minSlotMinutes
      );
      
      freeBlocks.push({
        id: `free-${currentStart.getTime()}-${dayEndDate.getTime()}`,
        type: 'free',
        start: new Date(currentStart),
        end: new Date(dayEndDate),
        durationMinutes,
      });
    }
  }
  
  // Calculate now line position
  const now = new Date();
  let nowPosition = 0;
  
  if (now >= dayStartDate && now <= dayEndDate) {
    // Now is within the day range
    const minutesSinceDayStart = (now.getTime() - dayStartDate.getTime()) / (1000 * 60);
    nowPosition = (minutesSinceDayStart / totalMinutes) * 100;
  } else if (now < dayStartDate) {
    // Now is before day start
    nowPosition = 0;
  } else {
    // Now is after day end
    nowPosition = 100;
  }
  
  const nowLine: NowLine = {
    time: now,
    position: nowPosition,
  };
  
  return {
    busyBlocks,
    freeBlocks,
    nowLine,
  };
};
