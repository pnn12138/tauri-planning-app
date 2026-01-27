import React, { useMemo } from 'react';
import type { Task, Subtask } from '../../shared/types/planning';
import { updateTask } from '../planning/planning.store';
import './TaskDashboard.css';

interface TaskContentProps {
    task: Task;
    mdSubtasks?: Subtask[];
    onToggleSubtask?: (index: number) => void;
    isLoadingNote?: boolean;
}

export const TaskContent: React.FC<TaskContentProps> = ({ task, mdSubtasks, onToggleSubtask }) => {
    // Use MD subtasks if available, otherwise DB subtasks
    const activeSubtasks = mdSubtasks || task.subtasks || [];

    const completedStats = useMemo(() => {
        const total = activeSubtasks.length;
        const completed = activeSubtasks.filter(s => s.completed).length;
        const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
        return { total, completed, percentage };
    }, [activeSubtasks]);

    const handleToggle = (idOrIndex: string | number) => {
        if (mdSubtasks && onToggleSubtask && typeof idOrIndex === 'number') {
            onToggleSubtask(idOrIndex);
        } else if (typeof idOrIndex === 'string') {
            const newSubtasks = (task.subtasks || []).map(s =>
                s.id === idOrIndex ? { ...s, completed: !s.completed } : s
            );
            updateTask({ id: task.id, subtasks: newSubtasks });
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full">


            {/* 2. Main Grid: Subtasks & Acceptance */}
            <div className="td-stats-grid">

                {/* Subtask Progress */}
                <div className="td-card flex flex-col h-full">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-base font-bold flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[20px]">account_tree</span>
                            子任务进度
                        </h3>
                        <span className="text-xs font-bold text-secondary bg-bg-light px-2 py-0.5 rounded">
                            {completedStats.completed}/{completedStats.total}
                        </span>
                    </div>

                    <div className="flex items-start gap-6">
                        {/* Radial Chart */}
                        <div className="relative size-24 shrink-0 mt-2">
                            <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                                <path className="text-border" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4"></path>
                                <path
                                    className="text-primary transition-all duration-1000 ease-out"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeDasharray={`${completedStats.percentage}, 100`}
                                    strokeLinecap="round"
                                    strokeWidth="4"
                                ></path>
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center flex-col">
                                <span className="text-lg font-bold">{completedStats.percentage}%</span>
                            </div>
                        </div>

                        {/* Subtask List */}
                        <div className="flex-1 space-y-3 w-full">
                            {activeSubtasks.length === 0 && (
                                <div className="text-sm text-secondary italic">无子任务 (可在 Markdown 中添加 - [ ] ...)</div>
                            )}
                            {activeSubtasks.map((sub, index) => (
                                <div
                                    key={sub.id || index}
                                    className="flex items-center gap-2.5 cursor-pointer hover:bg-bg-light p-1 rounded -ml-1 transition-colors"
                                    onClick={() => mdSubtasks ? handleToggle(index) : handleToggle(sub.id)}
                                >
                                    <span className={`material-symbols-outlined text-[18px] ${sub.completed ? 'text-green-500 filled' : 'text-secondary'}`}>
                                        {sub.completed ? 'check_circle' : 'radio_button_unchecked'}
                                    </span>
                                    <span className={`text-sm ${sub.completed ? 'text-secondary line-through' : 'font-medium'}`}>
                                        {sub.title}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Acceptance / Checklist (Simulated as another list for now) */}
                <div className="td-card flex flex-col h-full">
                    <h3 className="text-base font-bold flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-purple-500 text-[20px]">fact_check</span>
                        验收标准
                    </h3>
                    <div className="space-y-3 flex-1">
                        {/* Mock Acceptance Criteria for MVP */}
                        <AcceptanceItem text="核心功能功能测试通过" checked={true} />
                        <AcceptanceItem text="UI 样式符合设计规范" checked={false} />
                    </div>
                </div>

            </div>

            {/* 3. Activity & Attributes */}
            {/* (Skipping Activity Content as requested to be empty/minimal, but keeping structure) */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <div className="td-card xl:col-span-2">
                    <h3 className="text-base font-bold flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-orange-500 text-[20px]">history</span>
                        最近动态
                    </h3>
                    <div className="relative pl-4 border-l border-border space-y-5">
                        <p className="text-sm text-secondary italic">暂无动态 (Database Not Connected)</p>
                    </div>
                </div>

                {/* Task Attributes */}
                <div className="td-card xl:col-span-1 flex flex-col gap-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">任务属性</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-secondary">优先级</span>
                            <span className="text-sm font-bold text-red-500 bg-red-100 dark:bg-red-900/20 px-2 py-0.5 rounded">
                                {task.priority?.toUpperCase() || 'Normal'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-secondary">标签</span>
                            <div className="flex gap-1 flex-wrap justify-end">
                                {(task.tags || ['#策略', '#Q3']).map(tag => (
                                    <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-bg-light text-secondary">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-secondary">关联文件</span>
                            <span className="text-xs text-secondary truncate max-w-[150px]" title={task.note_path}>
                                {task.note_path ? 'Linked' : 'None'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

const StageStep = ({ icon, label, active, completed }: { icon: string, label: string, active: boolean, completed: boolean }) => (
    <div className={`flex flex-col items-center gap-2 group cursor-default ${!active ? 'opacity-40' : ''}`}>
        <div className={`size-9 rounded-full flex items-center justify-center ring-4 ring-card shadow-sm transition-all
            ${completed ? 'bg-primary text-white' : (active ? 'bg-card border-2 border-primary text-primary' : 'bg-bg-light text-secondary border border-border')}
        `}>
            <span className={`material-symbols-outlined text-sm ${active && !completed ? 'filled animate-pulse' : ''}`}>
                {completed ? 'check' : icon}
            </span>
        </div>
        <span className={`text-xs font-bold ${active ? 'text-main' : 'text-secondary'}`}>{label}</span>
    </div>
);

const AcceptanceItem = ({ text, checked }: { text: string, checked: boolean }) => (
    <label className="flex items-start gap-3 group cursor-pointer">
        <div className="relative flex items-center">
            <input type="checkbox" checked={checked} readOnly className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border checked:border-primary checked:bg-primary transition-all" />
            <div className={`absolute top-0.5 left-0.5 pointer-events-none ${!checked && 'hidden'}`}>
                <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>
            </div>
        </div>
        <div className="flex flex-col">
            <span className={`text-sm font-medium transition-colors ${checked ? 'text-secondary line-through' : 'text-main group-hover:text-primary'}`}>
                {text}
            </span>
        </div>
    </label>
);

function getProgressWidth(status: string) {
    if (status === 'todo') return '10%';
    if (status === 'doing') return '40%';
    if (status === 'verify') return '75%';
    if (status === 'done') return '100%';
    return '0%';
}
