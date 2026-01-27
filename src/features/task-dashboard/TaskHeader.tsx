import React, { useState, useEffect } from 'react';
import type { Task, TaskStatus } from '../../shared/types/planning';
import { updateTask } from '../planning/planning.store';
import './TaskDashboard.css';

interface TaskHeaderProps {
    task: Task;
}

export const TaskHeader: React.FC<TaskHeaderProps> = ({ task }) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState(task.title);

    useEffect(() => {
        setTitleInput(task.title);
    }, [task.title]);

    const handleTitleBlur = () => {
        setIsEditingTitle(false);
        if (titleInput !== task.title) {
            updateTask({ id: task.id, title: titleInput });
        }
    };

    const handleStatusUpdate = (newStatus: TaskStatus) => {
        updateTask({ id: task.id, status: newStatus });
    };

    return (
        <div className="flex flex-col gap-6">
            {/* Breadcrumbs */}
            <nav className="td-header-nav">
                <a href="#">任务管理</a>
                <span className="mx-2">/</span>
                <span className="font-medium text-main">{task.id.slice(0, 8)}</span>
            </nav>

            <div className="td-headline-row">
                <div className="flex flex-col gap-2 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        {isEditingTitle ? (
                            <input
                                className="td-title border-b border-primary outline-none"
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                onBlur={handleTitleBlur}
                                onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
                                autoFocus
                            />
                        ) : (
                            <h1 className="td-title cursor-pointer hover:opacity-80" onClick={() => setIsEditingTitle(true)}>
                                {task.title}
                            </h1>
                        )}
                    </div>

                    <div className="flex gap-4 text-xs text-secondary">
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                            截止: {task.due_date ? new Date(task.due_date).toLocaleDateString() : '未设置'}
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">priority_high</span>
                            优先级: {task.priority?.toUpperCase() || 'P3'}
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">update</span>
                            更新于 {new Date(task.updated_at).toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <span
                        className={`td-badge cursor-pointer select-none status-${task.status} ${getStatusColorClass(task.status)}`}
                        onClick={() => {
                            const statusOrder: TaskStatus[] = ['todo', 'doing', 'verify', 'done'];
                            const currentIndex = statusOrder.indexOf(task.status);
                            const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
                            handleStatusUpdate(nextStatus);
                        }}
                    >
                        {getStatusLabel(task.status)}
                    </span>

                    <button className="flex items-center justify-center rounded-lg h-9 px-3 bg-card border border-border text-secondary hover:text-primary hover:border-primary transition-all text-sm font-medium">
                        <span className="material-symbols-outlined text-[18px] mr-1">edit</span> 编辑
                    </button>
                    <button
                        className="flex items-center gap-2 rounded-lg h-9 px-4 bg-primary hover:opacity-90 text-white font-bold text-sm shadow-md transition-all"
                        onClick={() => updateTask({ id: task.id, status: 'doing' })}
                        disabled={task.status === 'doing'}
                    >
                        <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                        <span>{task.status === 'doing' ? '进行中' : '开始工作'}</span>
                    </button>
                </div>
            </div>

            {/* Timeline Component */}
            <TaskTimeline currentStatus={task.status} onStatusChange={handleStatusUpdate} />
        </div>
    );
};

const TaskTimeline: React.FC<{ currentStatus: TaskStatus, onStatusChange: (s: TaskStatus) => void }> = ({ currentStatus, onStatusChange }) => {
    // Stages mapping
    const stages = [
        { id: 'todo', label: '规划', icon: 'check', step: 1 },
        { id: 'doing', label: '执行', icon: 'edit_document', step: 2 },
        { id: 'verify', label: '审查', icon: 'sync', step: 3 },
        { id: 'done', label: '完成', icon: 'check_circle', step: 4 },
    ];

    const currentIndex = stages.findIndex(s => s.id === currentStatus);
    const progressWidth = Math.max(0, Math.min(100, (currentIndex / (stages.length - 1)) * 100));

    return (
        <div className="td-card overflow-x-auto">
            <div className="min-w-[500px] w-full flex items-center justify-between relative px-6 py-2">
                {/* Background Line */}
                <div className="absolute left-6 right-6 top-[28px] h-0.5 bg-border -z-10"></div>

                {/* Progress Line */}
                <div
                    className="absolute left-6 top-[28px] h-0.5 bg-primary -z-10 transition-all duration-1000"
                    style={{ width: `${progressWidth}%` }}
                ></div>

                {stages.map((stage, idx) => {
                    const isCompleted = idx < currentIndex;
                    const isActive = idx === currentIndex;
                    const isPending = idx > currentIndex;

                    return (
                        <div
                            key={stage.id}
                            className={`flex flex-col items-center gap-2 group cursor-pointer ${isPending ? 'opacity-40 hover:opacity-100' : ''}`}
                            onClick={() => onStatusChange(stage.id as TaskStatus)}
                            title={`切换状态到: ${stage.label}`}
                        >
                            {isCompleted && (
                                <div className="size-9 rounded-full bg-primary text-white flex items-center justify-center ring-4 ring-card shadow-sm transition-all group-hover:scale-110">
                                    <span className="material-symbols-outlined timeline-check-icon">check</span>
                                </div>
                            )}

                            {isActive && (
                                <div className={`size-9 rounded-full bg-card border-2 border-primary text-primary flex items-center justify-center ring-4 ring-card shadow-lg relative transition-all group-hover:scale-110 ${stage.id === 'doing' ? 'shadow-blue-glow' : ''}`}>
                                    <span className={`material-symbols-outlined text-sm filled ${stage.id === 'doing' || stage.id === 'verify' ? 'animate-pulse' : ''}`}>
                                        {stage.icon}
                                    </span>
                                </div>
                            )}

                            {isPending && (
                                <div className="size-9 rounded-full bg-bg-light text-secondary flex items-center justify-center ring-4 ring-card border border-border transition-all group-hover:border-primary group-hover:text-primary">
                                    <span className="text-xs font-bold">{stage.step}</span>
                                </div>
                            )}

                            <span className={`text-xs font-bold transition-colors ${isActive ? 'text-main' : (isCompleted ? 'text-primary' : 'text-secondary group-hover:text-primary')}`}>
                                {stage.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

function getStatusLabel(status: TaskStatus) {
    const map: Record<TaskStatus, string> = {
        todo: '待办',
        doing: '进行中',
        verify: '待核验',
        done: '已完成'
    };
    return map[status] || status;
}

function getStatusColorClass(status: TaskStatus) {
    return `status-${status}`;
}
