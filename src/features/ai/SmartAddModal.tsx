import React, { useState } from 'react';
import { useAiStoreWithActions } from './ai.store';
import { smartCapture } from './ai.api';
import { CreateTaskInput } from '../../shared/types/planning';
import { createTask } from '../planning/planning.store';
import './ai.css';

export const SmartAddModal: React.FC = () => {
    const { isSmartAddOpen, setSmartAddOpen } = useAiStoreWithActions();
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewTasks, setPreviewTasks] = useState<CreateTaskInput[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleProcess = async () => {
        if (!input.trim()) return;
        setIsProcessing(true);
        setError(null);
        try {
            const tasks = await smartCapture(input);
            setPreviewTasks(tasks);
        } catch (err) {
            setError('处理文本失败。请检查 AI 设置并重试。');
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirm = async () => {
        setIsProcessing(true);
        try {
            for (const task of previewTasks) {
                await createTask(task);
            }
            setSmartAddOpen(false);
            setInput('');
            setPreviewTasks([]);
        } catch (err) {
            setError('创建任务失败。');
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isSmartAddOpen) return null;

    return (
        <div className="ai-modal-overlay" onClick={() => setSmartAddOpen(false)}>
            <div className="ai-modal" style={{ maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
                <div className="ai-modal-header">
                    <div className="ai-modal-title">
                        <span className="material-symbols-outlined">auto_fix_high</span>
                        智能添加任务
                    </div>
                    <button className="ai-modal-close-btn" onClick={() => setSmartAddOpen(false)}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="ai-modal-body">
                    <div className="ai-field-group">
                        <label className="ai-label">用自然语言描述您的任务...</label>
                        <textarea
                            className="ai-input ai-textarea"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="例如：下周一下午2点和John开会，明天提醒我买牛奶。"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div style={{ color: 'red', marginBottom: '16px', fontSize: '0.875rem' }}>
                            {error}
                        </div>
                    )}

                    {previewTasks.length > 0 && (
                        <div className="ai-preview-list">
                            <h4 className="ai-label">预览 ({previewTasks.length} 个任务)</h4>
                            {previewTasks.map((task, idx) => (
                                <div key={idx} className="ai-preview-item">
                                    <div className="ai-preview-content">
                                        <div className="ai-preview-title">{task.title}</div>
                                        {task.description && <div className="text-sm text-gray-500">{task.description}</div>}
                                        <div className="ai-preview-meta">
                                            {task.due_date && <span className="ai-tag">截止: {task.due_date}</span>}
                                            {task.priority && <span className="ai-tag">优先级: {String(task.priority)}</span>}
                                            {task.estimate_min && <span className="ai-tag">{task.estimate_min} 分钟</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="ai-modal-footer">
                    {previewTasks.length === 0 ? (
                        <button className="ai-btn ai-btn-primary" onClick={handleProcess} disabled={isProcessing || !input.trim()}>
                            {isProcessing ? '处理中...' : '分析文本'}
                        </button>
                    ) : (
                        <>
                            <button className="ai-btn ai-btn-secondary" onClick={() => setPreviewTasks([])}>
                                返回编辑
                            </button>
                            <button className="ai-btn ai-btn-primary" onClick={handleConfirm} disabled={isProcessing}>
                                {isProcessing ? '创建中...' : `创建 ${previewTasks.length} 个任务`}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
