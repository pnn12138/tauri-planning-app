import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { CreateTaskInput, TaskStatus, TodayDTO, TaskPeriodicity, UpdateTaskInput } from "../../../shared/types/planning";
import { ApiResponse } from "../../../shared/types/api";
import { reloadTodayData, getPlanningStoreState } from "../../planning/planning.store";

// Helper to invoke Tauri commands
async function invokeApi<T>(command: string, args?: Record<string, unknown>) {
    const response = await invoke<ApiResponse<T>>(command, args);
    if (response.ok) return response.data;
    throw response.error;
}

function getLocalYyyymmdd(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export const getTodayTasksTool = new DynamicStructuredTool({
    name: "get_today_tasks",
    description: "Get the list of tasks and schedule for a specific date (default is today). Use this to see what the user has to do.",
    schema: z.object({
        date: z.string().optional().describe("Date in YYYY-MM-DD format. If not provided, uses today."),
    }),
    func: async ({ date }) => {
        const targetDate = date || getLocalYyyymmdd();
        try {
            const data = await invokeApi<TodayDTO>("planning_list_today", { today: targetDate });
            return JSON.stringify(data);
        } catch (error) {
            return `Error fetching today's data: ${JSON.stringify(error)}`;
        }
    },
});

export const createTaskTool = new DynamicStructuredTool({
    name: "create_task",
    description: "Create a new task in the user's plan. Supports setting priority, due dates, scheduled times, and periodicity.",
    schema: z.object({
        title: z.string().describe("Title of the task"),
        description: z.string().optional().describe("Detailed description or notes for the task."),
        status: z.enum(["todo", "doing", "done", "verify"]).optional().describe("Initial status of the task. Default is 'todo'."),
        priority: z.enum(["p0", "p1", "p2", "p3"]).optional().describe("Priority of the task. p0 is highest/urgent. Default is 'p3'."),
        due_date: z.string().optional().describe("Due date in YYYY-MM-DD format."),
        scheduled_start: z.string().optional().describe("Scheduled start time in ISO format (YYYY-MM-DDTHH:mm:ss) or YYYY-MM-DD."),
        scheduled_end: z.string().optional().describe("Scheduled end time in ISO format (YYYY-MM-DDTHH:mm:ss) or YYYY-MM-DD."),
        estimate_min: z.number().optional().describe("Estimated time in minutes."),
        tags: z.array(z.string()).optional().describe("List of tags for the task."),
        periodicity: z.object({
            strategy: z.enum(["day", "week", "month", "year"]).describe("Repetition strategy."),
            interval: z.number().describe("Interval for repetition (e.g. 1 for every day/week)."),
            start_date: z.string().describe("Start date for the periodicity in YYYY-MM-DD."),
            end_rule: z.enum(["never", "date", "count"]).describe("Rule for ending the repetition."),
            end_date: z.string().optional().describe("End date if end_rule is 'date'."),
            end_count: z.number().optional().describe("Count if end_rule is 'count'."),
        }).optional().describe("Periodicity settings for recurring tasks."),
    }),
    func: async (input) => {
        try {
            const taskInput: CreateTaskInput = {
                title: input.title,
                description: input.description,
                status: (input.status as TaskStatus) || "todo",
                priority: (input.priority as any) || "p3",
                due_date: input.due_date,
                scheduled_start: input.scheduled_start,
                scheduled_end: input.scheduled_end,
                estimate_min: input.estimate_min,
                tags: input.tags,
                periodicity: input.periodicity as TaskPeriodicity | undefined,
                // Defaults
                board_id: undefined,
                labels: undefined,
                subtasks: undefined,
                note_path: undefined,
            };

            const task = await invokeApi("planning_create_task", { input: taskInput });

            // Refresh UI
            const state = getPlanningStoreState();
            const today = state.todayData?.today || getLocalYyyymmdd();
            await reloadTodayData(today);

            return `Task created successfully: ${JSON.stringify(task)}`;
        } catch (error) {
            return `Error creating task: ${JSON.stringify(error)}`;
        }
    },
});

export const updateTaskTool = new DynamicStructuredTool({
    name: "update_task",
    description: "Update an existing task's properties.",
    schema: z.object({
        id: z.string().describe("ID of the task to update."),
        title: z.string().optional().describe("New title of the task."),
        description: z.string().optional().describe("New description."),
        status: z.enum(["todo", "doing", "done", "verify"]).optional(),
        priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
        due_date: z.string().nullable().optional().describe("New due date (YYYY-MM-DD) or null to remove."),
        scheduled_start: z.string().optional(),
        scheduled_end: z.string().optional(),
        estimate_min: z.number().optional(),
        tags: z.array(z.string()).optional(),
    }),
    func: async (input) => {
        try {
            const updateInput: UpdateTaskInput = {
                id: input.id,
                title: input.title,
                description: input.description,
                status: input.status as TaskStatus,
                priority: input.priority as any,
                due_date: input.due_date,
                scheduled_start: input.scheduled_start,
                scheduled_end: input.scheduled_end,
                estimate_min: input.estimate_min,
                tags: input.tags,
            };

            await invokeApi("planning_update_task", { input: updateInput });

            // Refresh UI
            const state = getPlanningStoreState();
            const today = state.todayData?.today || getLocalYyyymmdd();
            await reloadTodayData(today);

            return "Task updated successfully.";
        } catch (error) {
            return `Error updating task: ${JSON.stringify(error)}`;
        }
    },
});

export const PlanningSkill = {
    name: "planning",
    description: "Tools for managing tasks and schedule.",
    tools: [getTodayTasksTool, createTaskTool, updateTaskTool]
};
