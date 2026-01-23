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

// Day timeline model interface
export interface DayTimelineModel {
  busyBlocks: BusyBlock[];
  freeBlocks: FreeBlock[];
  nowLine: NowLine;
}

// Week timeline model interface
export interface WeekTimelineModel {
  days: DayTimelineModel[];
  weekStart: Date;
  weekEnd: Date;
}

// Combined timeline model interface
export type TimelineModel = DayTimelineModel | WeekTimelineModel;

// Helper function to determine if a timeline model is a week view
export const isWeekTimeline = (model: TimelineModel): model is WeekTimelineModel => {
  return 'days' in model;
};

// Helper function to determine if a timeline model is a day view
export const isDayTimeline = (model: TimelineModel): model is DayTimelineModel => {
  return 'busyBlocks' in model;
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
    let originalStart: Date;

    // Determine the effective start time for this day
    // Check if this is a periodic occurrence that needs date adjustment
    if (task.periodicity && task.periodicity.start_date) {
      // For periodic tasks, we construct the start time using the task's time but ON the current day
      // This relies on normalizeEvents being called with tasks ALREADY filtered for this day/range
      // But normalizeEvents logic creates day range from task's own date.
      // We need to pass the target date context. 
      // Ideally, normalizeEvents should infer the "target date" or we handle strictly in `buildDayTimelineModel`.
      // Let's rely on scheduled_start being present. 
      // If task is periodic and filtered into this day, we must pretend its scheduled_start IS today.

      // However, `normalizeEvents` iterates ALL filtered tasks.
      // We need to know WHICH day we are normalizing for if we overlap?
      // Actually `normalizeEvents` is called by `buildDayTimelineModel` which targets a specific `baseDate`.
      // But `normalizeEvents` function signature doesn't take `baseDate`.
      // We should update `normalizeEvents` signature or logic.

      // Actually, let's look at `buildDayTimelineModel`. 
      // `tasksForDate` are already filtered.
      // But the `task` object is cloned? No.
      // If we modify `task` here it might affect other things.
      // `normalizeEvents` returns NEW objects.

      // We should fix the scheduled_start in `buildDayTimelineModel` BEFORE calling `normalizeEvents`?
      // YES.
      originalStart = new Date(task.scheduled_start!);
    } else {
      originalStart = new Date(task.scheduled_start!);
    }

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

// Build day timeline model from normalized events
const buildDayTimelineModel = (tasks: Task[], config: TimelineConfig, baseDate: Date = new Date()): DayTimelineModel => {
  const { dayStart, dayEnd, minSlotMinutes } = config;
  const dayStartDate = createDateForTime(dayStart, baseDate);
  const dayEndDate = createDateForTime(dayEnd, baseDate);
  const totalMinutes = timeToMinutes(dayEnd) - timeToMinutes(dayStart);

  // First, filter tasks to only include those for the specific date
  const tasksForDate = tasks.filter(task => {
    const taskDateStr = baseDate.toISOString().split('T')[0];

    // 1. Check scheduled_start (exact match)
    if (task.scheduled_start) {
      const taskStart = new Date(task.scheduled_start);
      // Check if task is on the same day as baseDate
      if (taskStart.toDateString() === baseDate.toDateString()) {
        return true;
      }
    }

    // 2. Check periodicity
    if (task.periodicity && task.periodicity.start_date) {
      const periodicityStart = new Date(task.periodicity.start_date);
      // Normalize baseDate for comparison (midnight)
      const currentDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
      const startDay = new Date(periodicityStart.getFullYear(), periodicityStart.getMonth(), periodicityStart.getDate());

      // If current day is before start date, return false
      if (currentDay.getTime() < startDay.getTime()) {
        return false;
      }

      // Check end_rule
      if (task.periodicity.end_rule === 'date' && task.periodicity.end_date) {
        const endDate = new Date(task.periodicity.end_date);
        const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        if (currentDay.getTime() > endDay.getTime()) {
          return false;
        }
      }

      // Calculate recurrence
      const diffTime = currentDay.getTime() - startDay.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const interval = Math.max(1, task.periodicity.interval);

      let isRecurrence = false;
      switch (task.periodicity.strategy) {
        case 'day':
          isRecurrence = diffDays % interval === 0;
          break;
        case 'week':
          isRecurrence = diffDays % (7 * interval) === 0;
          break;
        case 'month':
          // Simple month check: same day of month
          // And total months difference is multiple of interval
          if (currentDay.getDate() !== startDay.getDate()) {
            isRecurrence = false;
          } else {
            const monthDiff = (currentDay.getFullYear() - startDay.getFullYear()) * 12 + (currentDay.getMonth() - startDay.getMonth());
            isRecurrence = monthDiff % interval === 0;
          }
          break;
        case 'year':
          isRecurrence = currentDay.getDate() === startDay.getDate() &&
            currentDay.getMonth() === startDay.getMonth() &&
            (currentDay.getFullYear() - startDay.getFullYear()) % interval === 0;
          break;
        default:
          isRecurrence = false;
      }

      return isRecurrence;
    }

    return false;
  });

  // Normalize only the filtered tasks - but first ensure they are mapped to the simplified day if periodic
  const tasksMappedToDay = tasksForDate.map(task => {
    // If it's a periodic task matching this day (checked by filter above)
    // We need to map it to the current day if it's not already

    // If it's the exact scheduled task, return as is
    if (task.scheduled_start) {
      const checkStart = new Date(task.scheduled_start);
      if (checkStart.toDateString() === baseDate.toDateString()) {
        return task;
      }
    }

    // Otherwise it must be a periodic occurrence
    if (task.periodicity && task.periodicity.start_date) {
      let timeSource = task.scheduled_start;
      // Prefer time from periodicity start_date if available (T-format)
      if (task.periodicity.start_date.includes('T')) {
        timeSource = task.periodicity.start_date;
      }

      if (timeSource) {
        const timeDate = new Date(timeSource);
        // Create new date on baseDate with time from timeSource
        const newStart = new Date(baseDate);
        newStart.setHours(timeDate.getHours(), timeDate.getMinutes(), timeDate.getSeconds());

        // Adjust end time similarly if exists
        let newEnd: string | undefined = undefined;

        // Calculate duration from original task
        let duration = 30 * 60 * 1000; // default 30m
        if (task.scheduled_end && task.scheduled_start) {
          duration = new Date(task.scheduled_end).getTime() - new Date(task.scheduled_start).getTime();
        } else if (task.estimate_min) {
          duration = task.estimate_min * 60 * 1000;
        }

        const newEndDate = new Date(newStart.getTime() + duration);
        newEnd = newEndDate.toISOString();

        return {
          ...task,
          scheduled_start: newStart.toISOString(),
          scheduled_end: newEnd,
          id: `${task.id}-${baseDate.getTime()}` // Virtual ID for the view logic
        };
      }
    }
    return task;
  });

  const normalizedTasks = normalizeEvents(tasksMappedToDay, config);

  // Create busy blocks - all normalized tasks are for the specified date
  let busyBlocks: BusyBlock[] = normalizedTasks
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

// Build week timeline model from tasks
export const buildTimelineModel = (tasks: Task[], config: TimelineConfig, baseDate: Date = new Date(), viewMode: 'day' | 'week' = 'day'): TimelineModel => {
  if (viewMode === 'day') {
    return buildDayTimelineModel(tasks, config, baseDate);
  }

  // Calculate week start (Monday) and week end (Sunday)
  const weekStart = new Date(baseDate);
  const dayOfWeek = weekStart.getDay();
  // Adjust to Monday as the first day of the week
  const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Generate timeline models for each day of the week
  const days: DayTimelineModel[] = [];
  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(weekStart);
    currentDay.setDate(weekStart.getDate() + i);
    days.push(buildDayTimelineModel(tasks, config, currentDay));
  }

  return {
    days,
    weekStart,
    weekEnd,
  };
};
