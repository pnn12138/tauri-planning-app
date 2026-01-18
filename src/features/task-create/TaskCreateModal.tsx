import React, { useState } from 'react';
import { createTask } from '../planning/planning.store';
import { normalizeError, NormalizedApiError, planningOpenTaskNote } from '../planning/planning.api';
import { TaskCreateModalProps, TaskCreateDraftStep1, toCreateTaskInputStep1, CreateTaskInput } from './taskCreateModal.types';
import './taskCreateModal.css';

const TaskCreateModal: React.FC<TaskCreateModalProps> = ({
  open,
  defaultStatus = 'backlog',
  onClose,
  onCreated,
}) => {
  // 确保默认状态不是 doing
  const safeDefaultStatus = defaultStatus === 'doing' ? 'todo' : defaultStatus;
  
  // Initial draft state (仅包含Step1字段)
  const initialDraft: TaskCreateDraftStep1 = {
    title: '',
    description: '',
    status: safeDefaultStatus as 'backlog' | 'todo' | 'done',
    priority: 'p3',
    tags: [],
    dueDateTime: undefined,
    estimateMin: undefined,
    autoCreateNote: true, // 默认自动创建task note
    newTagInput: '',
  };

  // State management
  const [draft, setDraft] = useState<TaskCreateDraftStep1>(initialDraft);
  const [error, setError] = useState<string>('');
  const [dueDateError, setDueDateError] = useState<string>('');
  const [apiError, setApiError] = useState<NormalizedApiError | null>(null);
  const [lastSubmitInput, setLastSubmitInput] = useState<CreateTaskInput | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Update draft helper with real-time validation
  const updateDraft = (patch: Partial<TaskCreateDraftStep1>) => {
    const newDraft = { ...draft, ...patch };
    setDraft(newDraft);
    
    // Real-time validation for title
    if (patch.title !== undefined) {
      if (!newDraft.title.trim()) {
        setError('任务标题不能为空');
      } else {
        setError('');
      }
    }
    
    // Clear API error when user edits the form
    setApiError(null);

    if (patch.dueDateTime !== undefined || patch.status !== undefined) {
      setDueDateError('');
    }
  };

  // Handle form submission
  const handleSubmit = async (e?: React.FormEvent, input?: CreateTaskInput) => {
    if (e) {
      e.preventDefault();
    }
    
    // Use provided input or convert from draft
    const submitInput = input || toCreateTaskInputStep1(draft);
    
    // Validation
    if (!submitInput.title.trim()) {
      setError('任务标题不能为空');
      return;
    }

    if (submitInput.status === 'todo' && !submitInput.due_date) {
      setDueDateError('待办任务需要设置截止日期');
      return;
    }

    setError('');
    setDueDateError('');
    setApiError(null);
    setIsSubmitting(true);
    
    // Save last submitted input for retry
    setLastSubmitInput(submitInput);

    try {
      // Create task and get the new task object
      const newTask = await createTask(submitInput);
      
      // If autoCreateNote is true, open the task note
      if (draft.autoCreateNote) {
        await planningOpenTaskNote(newTask.id);
      }
      
      onCreated();
      onClose();
      // Reset form for next use
      setDraft(initialDraft);
      setLastSubmitInput(null);
    } catch (err) {
      const normalizedError = normalizeError(err);
      setApiError(normalizedError);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle retry for DbBusy error
  const handleRetry = () => {
    if (lastSubmitInput && !isSubmitting) {
      handleSubmit(undefined, lastSubmitInput);
    }
  };
  
  // Handle go to select vault
  const handleGoToSelectVault = () => {
    onClose();
    // TODO: Implement vault selection trigger
    // This would typically call a global function or dispatch an event to open vault selection
    alert('请在设置中选择Vault');
  };
  
  // Render error based on error type
  const renderError = () => {
    if (!apiError) return null;
    
    // Common error banner styles
    const errorBannerClass = 'task-create-error-banner';
    const errorButtonClass = 'task-create-error-button';
    
    switch (apiError.code) {
      case 'VaultNotSelected':
        return (
          <div className={`${errorBannerClass} vault-not-selected`}>
            <div className="error-message">{apiError.message}</div>
            <button 
              className={errorButtonClass}
              onClick={handleGoToSelectVault}
              disabled={isSubmitting}
            >
              去选择Vault
            </button>
          </div>
        );
        
      case 'DbBusy':
        return (
          <div className={`${errorBannerClass} db-busy`}>
            <div className="error-message">{apiError.message || '数据库繁忙，请稍后重试'}</div>
            <button 
              className={errorButtonClass}
              onClick={handleRetry}
              disabled={isSubmitting}
            >
              重试
            </button>
          </div>
        );
        
      case 'InvalidParameter':
        // If field errors exist, they will be rendered next to the fields
        // This banner is for global error message
        if (!apiError.fieldErrors || Object.keys(apiError.fieldErrors).length === 0) {
          return (
            <div className={`${errorBannerClass} invalid-parameter`}>
              <div className="error-message">{apiError.message}</div>
            </div>
          );
        }
        return null;
        
      default:
        return (
          <div className={`${errorBannerClass} unknown-error`}>
            <div className="error-message">{apiError.message}</div>
            <button 
              className={errorButtonClass}
              onClick={handleRetry}
              disabled={isSubmitting}
            >
              重试
            </button>
          </div>
        );
    }
  };
  
  // Get field error for a specific field
  const getFieldError = (fieldName: string): string | undefined => {
    return apiError?.fieldErrors?.[fieldName];
  };

  // Handle Enter key press to submit form
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && draft.title.trim() && !isSubmitting) {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  // Close modal and reset form
  const handleClose = () => {
    onClose();
    setDraft(initialDraft);
    setError('');
  };

  // 处理键盘事件
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // 如果modal未打开，不渲染
  if (!open) return null;

  return (
    <div className="task-create-modal-overlay" onClick={handleClose}>
      <div className="task-create-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="task-create-modal-header">
          <div className="task-create-modal-header-left">
            <div className="task-create-modal-icon">
              <span className="material-symbols-outlined">add_task</span>
            </div>
            <h3 className="task-create-modal-title">新建任务</h3>
          </div>
          <button 
            className="task-create-modal-close"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Form */}
        <form id="task-create-form" onSubmit={handleSubmit} className="task-create-modal-form">
          {/* API Error Banner */}
          {renderError()}
          
          {/* Title Input */}
          <div className="task-create-form-group">
            <label className="task-create-form-label">任务标题</label>
            <input
              type="text"
              className={`task-create-form-input task-create-form-title ${error || getFieldError('title') ? 'error' : ''}`}
              placeholder="准备做什么？"
              value={draft.title}
              onChange={(e) => updateDraft({ title: e.target.value })}
              onKeyPress={handleKeyPress}
              disabled={isSubmitting}
              autoFocus
            />
            {error && <div className="task-create-form-error">{error}</div>}
            {getFieldError('title') && <div className="task-create-form-error">{getFieldError('title')}</div>}
          </div>

          {/* Description Input */}
          <div className="task-create-form-group">
            <label className="task-create-form-label">任务描述</label>
            <textarea
              className="task-create-form-input task-create-form-description"
              placeholder="添加详细描述..."
              value={draft.description || ''}
              onChange={(e) => updateDraft({ description: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          {/* Metadata Grid */}
          <div className="task-create-metadata-grid">
            {/* Estimate Time */}
            <div className="task-create-form-group">
              <label className="task-create-form-label">
                <span className="material-symbols-outlined task-create-label-icon">timer</span>
                预估耗时
              </label>
              <div className="task-create-time-input-container">
                <input
                  type="number"
                  className="task-create-form-input task-create-time-input"
                  placeholder="输入预计时间"
                  value={draft.estimateMin || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateDraft({ estimateMin: value ? parseInt(value, 10) : undefined });
                  }}
                  disabled={isSubmitting}
                  min="1"
                  step="5"
                />
                <span className="task-create-time-unit">分钟</span>
              </div>
            </div>

            {/* Due Date */}
            <div className="task-create-form-group">
              <label className="task-create-form-label">
                <span className="material-symbols-outlined task-create-label-icon">event_busy</span>
                截止日期
              </label>
              <div className="task-create-datetime-input-container">
                <input
                  type="datetime-local"
                  className={`task-create-form-input ${dueDateError ? 'error' : ''}`}
                  value={draft.dueDateTime || ''}
                  onChange={(e) => updateDraft({ dueDateTime: e.target.value || undefined })}
                  disabled={isSubmitting}
                  placeholder="选择截止时间"
                />
              </div>
              {dueDateError && <div className="task-create-form-error">{dueDateError}</div>}
              {getFieldError('due_date') && <div className="task-create-form-error">{getFieldError('due_date')}</div>}
            </div>
          </div>

          {/* Priority */}
          <div className="task-create-form-group">
            <label className="task-create-form-label">
              <span className="material-symbols-outlined task-create-label-icon">flag</span>
              优先级
            </label>
            <div className="task-create-priority-options">
              {
                [
                  { value: 'p0', label: 'P0', color: 'priority-urgent' },
                  { value: 'p1', label: 'P1', color: 'priority-high' },
                  { value: 'p2', label: 'P2', color: 'priority-med' },
                  { value: 'p3', label: 'P3', color: 'priority-low' }
                ].map((option) => (
                  <label key={option.value} className="task-create-priority-option">
                    <input
                      type="radio"
                      className="task-create-priority-radio"
                      name="priority"
                      value={option.value}
                      checked={draft.priority === option.value}
                      onChange={(e) => updateDraft({ priority: e.target.value as 'p0' | 'p1' | 'p2' | 'p3' })}
                      disabled={isSubmitting}
                    />
                    <div className="task-create-priority-option-content">
                      <div className={`task-create-priority-dot ${option.color}`}></div>
                      <span>{option.label}</span>
                    </div>
                  </label>
                ))
              }
            </div>
          </div>
          
          {/* Tags Input */}
          <div className="task-create-form-group">
            <label className="task-create-form-label">
              <span className="material-symbols-outlined task-create-label-icon">sell</span>
              标签
            </label>
            <div className="task-create-tags-container">
              {/* Existing tags */}
              <div className="task-create-tags-list">
                {draft.tags && draft.tags.map((tag, index) => (
                  <span key={index} className="task-create-tag-item">
                    {tag}
                    <button
                      type="button"
                      className="task-create-tag-remove"
                      onClick={() => {
                        const newTags = draft.tags?.filter((_, i) => i !== index) || [];
                        updateDraft({ tags: newTags });
                      }}
                      disabled={isSubmitting}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              {/* New tag input */}
              <div className="task-create-tag-input-wrapper">
                <input
                  type="text"
                  className="task-create-form-input task-create-tag-input"
                  placeholder="添加标签..."
                  value={draft.newTagInput || ''}
                  onChange={(e) => updateDraft({ newTagInput: e.target.value })}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && draft.newTagInput?.trim()) {
                      e.preventDefault();
                      const newTag = draft.newTagInput.trim();
                      if (newTag && (!draft.tags || !draft.tags.includes(newTag))) {
                        const newTags = [...(draft.tags || []), newTag];
                        updateDraft({ tags: newTags, newTagInput: '' });
                      }
                    }
                  }}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
          
          {/* Auto create task note option */}
          <div className="task-create-form-group task-create-checkbox-group">
            <label className="task-create-checkbox-label">
              <input
                type="checkbox"
                checked={draft.autoCreateNote || false}
                onChange={(e) => updateDraft({ autoCreateNote: e.target.checked })}
                disabled={isSubmitting}
              />
              <span className="task-create-checkbox-text">
                <span className="material-symbols-outlined task-create-label-icon">description</span>
                自动创建任务笔记
              </span>
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="task-create-modal-footer">
          <button
            type="button"
            className="task-create-modal-cancel"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            type="submit"
            form="task-create-form"
            className="task-create-modal-submit"
            disabled={isSubmitting || !draft.title.trim()}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined">pending</span>
                创建中...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">check</span>
                确认创建
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskCreateModal;
