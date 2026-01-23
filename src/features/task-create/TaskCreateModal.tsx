import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createTask } from '../planning/planning.store';
import { normalizeError, NormalizedApiError, planningOpenTaskNote } from '../planning/planning.api';
import { CreateTaskInput, Subtask, TaskPeriodicity, TaskPriority, TaskStatus } from '../../shared/types/planning';
import './taskCreateModal.css';

interface TaskCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  // State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Defaults: Status = 'todo', Date = Today
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('p3');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // Schedule defaults to Today
  const [scheduledDate, setScheduledDate] = useState<string>(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD
  const [scheduledTimeStart, setScheduledTimeStart] = useState<string>(''); // HH:mm
  const [scheduledTimeEnd, setScheduledTimeEnd] = useState<string>(''); // HH:mm

  // Subtasks
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);

  // Periodicity
  const [isRecurring, setIsRecurring] = useState(false);
  const [periodicity, setPeriodicity] = useState<TaskPeriodicity>({
    strategy: 'week',
    interval: 1,
    start_date: new Date().toLocaleDateString('en-CA'),
    end_rule: 'never',
  });
  const [periodicityTime, setPeriodicityTime] = useState<string>('09:00');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setStatus('todo'); // Always reset to todo
      setPriority('p3');
      setTags([]);
      setSubtasks([]);
      setIsRecurring(false);
      setScheduledDate(new Date().toLocaleDateString('en-CA')); // Reset to Today
      setScheduledTimeStart('');
      setScheduledTimeEnd('');
      setPeriodicityTime('09:00');
      setError('');
    }
  }, [open]);

  // Handlers
  const handleAddSubtask = () => {
    const newSubtask: Subtask = {
      id: uuidv4(),
      title: '',
      completed: false,
    };
    setSubtasks([...subtasks, newSubtask]);
  };

  const handleUpdateSubtask = (id: string, updates: Partial<Subtask>) => {
    setSubtasks(subtasks.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const handleRemoveSubtask = (id: string) => {
    setSubtasks(subtasks.filter(t => t.id !== id));
  };

  const handleAddTag = () => {
    const tag = newTagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('请输入任务标题');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Construct payload
      const filteredSubtasks = subtasks.filter(s => s.title.trim() !== '');

      const payload: CreateTaskInput = {
        title,
        description: description || undefined,
        status: status,
        priority,
        tags: tags.length > 0 ? tags : undefined,
        subtasks: filteredSubtasks.length > 0 ? filteredSubtasks : undefined,
        periodicity: isRecurring ? {
          ...periodicity,
          start_date: periodicityTime ? `${periodicity.start_date}T${periodicityTime}:00` : `${periodicity.start_date}T00:00:00`
        } : undefined,
      };

      // Handle Schedule - defaults to Today or user selected
      // If Recurring, priority goes to Periodicity Start Date/Time
      if (isRecurring && payload.periodicity) {
        payload.scheduled_start = payload.periodicity.start_date;
        payload.due_date = payload.scheduled_start;
        // We ignore scheduledTimeEnd for now as periodicity doesn't cover duration yet explicitly in this UI part
      } else if (scheduledDate) {
        if (scheduledTimeStart) {
          payload.scheduled_start = `${scheduledDate}T${scheduledTimeStart}:00`;
        } else {
          // If no time specific, maybe don't set T00:00:00 if we want it to be "all day" implicitly? 
          // But backend expects ISO string. Let's keep T00:00:00 for now or handled by backend.
          // requirement says "joined schedule defaults to creation time", but actually user wants "Today".
          payload.scheduled_start = `${scheduledDate}T00:00:00`;
        }

        if (scheduledTimeEnd) {
          payload.scheduled_end = `${scheduledDate}T${scheduledTimeEnd}:00`;
        }
        // Also set due_date as scheduled_start for compatibility with Kanban due dates
        payload.due_date = payload.scheduled_start;
      }

      await createTask(payload);
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      setError('创建任务失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="task-create-modal-overlay" onClick={onClose}>
      <div className="task-create-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="task-modal-header">
          <div className="task-modal-header-left">
            <div className="task-modal-icon-box">
              <span className="material-symbols-outlined">edit_note</span>
            </div>
            <h3 className="task-modal-title">创建任务</h3>
          </div>
          <button className="task-modal-close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="task-modal-body custom-scrollbar">
          {/* Title */}
          <div className="task-field-group">
            <label className="task-label">任务标题</label>
            <input
              type="text"
              className="task-input-title"
              placeholder="准备做什么？"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="task-field-group">
            <label className="task-label">任务描述</label>
            <textarea
              className="task-input-desc custom-scrollbar"
              placeholder="添加详细描述..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Subtasks */}
          <div className="task-field-group">
            <div className="subtask-header">
              <label className="subtask-header-label">
                <span className="material-symbols-outlined text-[18px]">checklist</span>
                子任务 ({subtasks.filter(s => s.completed).length}/{subtasks.length})
              </label>
              {subtasks.length > 0 && (
                <div className="subtask-progress">
                  <div
                    className="subtask-progress-bar"
                    style={{ width: `${(subtasks.filter(s => s.completed).length / subtasks.length) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <div className="subtask-list">
              {subtasks.map((subtask) => (
                <div key={subtask.id} className="subtask-item group">
                  <input
                    type="checkbox"
                    className="subtask-checkbox"
                    checked={subtask.completed}
                    onChange={e => handleUpdateSubtask(subtask.id, { completed: e.target.checked })}
                  />
                  <input
                    type="text"
                    className={`subtask-text ${subtask.completed ? 'completed' : ''}`}
                    value={subtask.title}
                    onChange={e => handleUpdateSubtask(subtask.id, { title: e.target.value })}
                    placeholder="子任务名称"
                  />
                  <button
                    className="subtask-delete-btn"
                    onClick={() => handleRemoveSubtask(subtask.id)}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
              <button className="btn-add-subtask" onClick={handleAddSubtask}>
                <span className="material-symbols-outlined text-[18px]">add</span>
                添加子任务
              </button>
            </div>
          </div>

          {/* Grid Layout for Meta */}
          <div className="task-meta-grid">

            {/* Priority - Full Width */}
            <div className="task-row-full">
              <label className="task-section-label">
                <span className="material-symbols-outlined text-gray-400 text-[18px]">flag</span>
                优先级
              </label>
              <div className="priority-grid">
                {[
                  { val: 'p0', label: 'P0', class: 'p0' },
                  { val: 'p1', label: 'P1', class: 'p1' },
                  { val: 'p2', label: 'P2', class: 'p2' },
                  { val: 'p3', label: 'P3', class: 'p3' },
                ].map((p) => (
                  <label key={p.val} className="priority-option group">
                    <input
                      type="radio"
                      name="priority"
                      className="priority-radio peer"
                      value={p.val}
                      checked={priority === p.val}
                      onChange={e => setPriority(e.target.value as TaskPriority)}
                    />
                    <div className="priority-card">
                      <div className={`priority-dot ${p.class}`}></div>
                      <span className="text-sm font-medium">{p.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Tags - Full Width */}
            <div className="task-row-full">
              <label className="task-section-label">
                <span className="material-symbols-outlined text-gray-400 text-[18px]">sell</span>
                标签
              </label>
              <div className="tags-container">
                {tags.map(tag => (
                  <div key={tag} className="tag-item">
                    <span>{tag}</span>
                    <button onClick={() => handleRemoveTag(tag)} className="tag-remove-btn">
                      <span className="material-symbols-outlined text-[16px] align-middle">close</span>
                    </button>
                  </div>
                ))}
                <input
                  type="text"
                  className="tag-input"
                  placeholder="+ 添加标签 (Enter)"
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleAddTag()}
                />
              </div>
            </div>

            {/* Periodicity - Full Width */}
            <div className="task-row-full">
              <div className="periodicity-toggle-row">
                <label className="task-section-label mb-0">
                  <span className="material-symbols-outlined text-gray-400 text-[18px]">update</span>
                  周期性任务
                </label>
                <label className="periodicity-switch">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={isRecurring}
                    onChange={e => setIsRecurring(e.target.checked)}
                  />
                  <div className="switch-slider"></div>
                  <span className="switch-label-text">{isRecurring ? '已启用' : '未启用'}</span>
                </label>
              </div>

              {isRecurring && (
                <div className="periodicity-panel">
                  {/* Frequency */}
                  <div className="periodicity-row">
                    <span className="periodicity-label">重复频率</span>
                    <div className="periodicity-controls">
                      <span className="text-sm">每</span>
                      <input
                        type="number"
                        min="1"
                        className="input-sm w-16 text-center"
                        value={periodicity.interval}
                        onChange={e => setPeriodicity({ ...periodicity, interval: parseInt(e.target.value) || 1 })}
                      />
                      <select
                        className="input-sm flex-1"
                        value={periodicity.strategy}
                        onChange={e => setPeriodicity({ ...periodicity, strategy: e.target.value })}
                      >
                        <option value="day">天 (Days)</option>
                        <option value="week">周 (Weeks)</option>
                        <option value="month">月 (Months)</option>
                        <option value="year">年 (Years)</option>
                      </select>
                    </div>
                  </div>

                  {/* Start Date */}
                  <div className="periodicity-row">
                    <span className="periodicity-label">开始时间</span>
                    <div className="flex gap-2 w-full">
                      <input
                        type="date"
                        className="input-sm flex-1"
                        value={periodicity.start_date}
                        onChange={e => setPeriodicity({ ...periodicity, start_date: e.target.value })}
                      />
                      <input
                        type="time"
                        className="input-sm w-32"
                        value={periodicityTime}
                        onChange={e => setPeriodicityTime(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* End Condition */}
                  <div className="periodicity-row items-start">
                    <span className="periodicity-label pt-2">结束条件</span>
                    <div className="end-conditions">
                      <label className="radio-row">
                        <input
                          type="radio"
                          name="end_rule"
                          className="w-4 h-4 text-primary"
                          checked={periodicity.end_rule === 'never'}
                          onChange={() => setPeriodicity({ ...periodicity, end_rule: 'never' })}
                        />
                        <span>永不结束</span>
                      </label>

                      <label className="radio-row">
                        <input
                          type="radio"
                          name="end_rule"
                          className="w-4 h-4 text-primary"
                          checked={periodicity.end_rule === 'date'}
                          onChange={() => setPeriodicity({ ...periodicity, end_rule: 'date' })}
                        />
                        <span>于指定日期</span>
                        <input
                          type="date"
                          className="input-sm ml-2"
                          disabled={periodicity.end_rule !== 'date'}
                          value={periodicity.end_date || ''}
                          onChange={e => setPeriodicity({ ...periodicity, end_date: e.target.value })}
                        />
                      </label>

                      <label className="radio-row">
                        <input
                          type="radio"
                          name="end_rule"
                          className="w-4 h-4 text-primary"
                          checked={periodicity.end_rule === 'count'}
                          onChange={() => setPeriodicity({ ...periodicity, end_rule: 'count' })}
                        />
                        <span>发生次数后</span>
                        <div className="flex items-center gap-2 ml-2">
                          <input
                            type="number"
                            className="input-sm w-20"
                            disabled={periodicity.end_rule !== 'count'}
                            value={periodicity.end_count || 10}
                            onChange={e => setPeriodicity({ ...periodicity, end_count: parseInt(e.target.value) || 1 })}
                          />
                          <span className="text-xs text-gray-500">次</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="task-modal-footer">
          <button className="btn-delete" disabled>
            {/* Delete functionality placeholder, maybe only for edit mode */}
          </button>

          <div className="footer-actions">
            <button className="btn-cancel" onClick={onClose} disabled={isSubmitting}>
              取消
            </button>
            <button className="btn-save" onClick={handleSubmit} disabled={isSubmitting}>
              <span className="material-symbols-outlined text-[20px]">save</span>
              {isSubmitting ? '保存中...' : '保存任务'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskCreateModal;
