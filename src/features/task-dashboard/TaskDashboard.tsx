import React from 'react';
import { usePlanningStore } from '../planning/planning.store';
import { TaskHeader } from './TaskHeader';
import { TaskContent } from './TaskContent';
import { useTaskNote } from './useTaskNote';
import './TaskDashboard.css';

interface TaskDashboardProps {
    taskId: string;
}

export default function TaskDashboard({ taskId }: TaskDashboardProps) {
    const task = usePlanningStore(state => {
        if (!state.todayData) return null;
        // Flatten all columns to find the task
        const { todo, doing, verify, done } = state.todayData.kanban;
        const allTasks = [...todo, ...doing, ...verify, ...done];
        return allTasks.find(t => t.id === taskId);
    });

    const { subtasks: mdSubtasks, toggleSubtask, isLoading: isLoadingNote } = useTaskNote(taskId);

    if (!task) {
        return (
            <div className="task-dashboard-container items-center justify-center">
                <div className="text-center p-8 bg-card border border-border rounded-xl shadow-sm">
                    <h2 className="text-xl font-bold text-main mb-2">任务未找到</h2>
                    <p className="text-secondary">ID 为 "{taskId}" 的任务不存在或已被删除。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="task-dashboard-container">
            <div className="td-main-layout">

                {/* Left Panel: Header + Content */}
                <section className="td-left-panel">
                    <div className="td-content-wrapper">
                        <TaskHeader task={task} />
                        <TaskContent
                            task={task}
                            mdSubtasks={mdSubtasks.length > 0 ? mdSubtasks : undefined}
                            onToggleSubtask={toggleSubtask}
                            isLoadingNote={isLoadingNote}
                        />
                    </div>
                </section>

            </div>
        </div>
    );
}
