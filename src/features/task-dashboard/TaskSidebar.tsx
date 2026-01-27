import React, { useEffect, useRef, useState } from 'react';
import { createSession, sendMessage, useAiStore, abortGeneration } from '../ai/ai.store';
import type { Task } from '../../shared/types/planning';
import './TaskDashboard.css';

interface TaskSidebarProps {
    task: Task;
}

export const TaskSidebar: React.FC<TaskSidebarProps> = ({ task }) => {
    const { sessions, isGenerating, activeAgentId } = useAiStore();
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Find or Create Session for this Task
    const session = sessions.find(s => s.taskId === task.id);
    const sessionId = session?.id;

    useEffect(() => {
        if (!session) {
            // Create a new session specifically for this task
            createSession({
                taskId: task.id,
                title: `Task: ${task.title}`
            });
        }
    }, [task.id, session]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [session?.messages.length, isGenerating]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [inputValue]);

    const handleSend = async () => {
        if (!inputValue.trim() || !sessionId || isGenerating) return;
        const content = inputValue.trim();
        setInputValue('');
        await sendMessage(content, sessionId);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!session) return <div className="p-4">Loading AI Session...</div>;

    return (
        <aside className="td-ai-panel">
            {/* Header Removed as per user request */}

            {/* Messages Area */}
            <div className="td-chat-area">
                {/* Timestamp removed */}

                {session.messages.length === 0 && (
                    <div className="td-msg-row">
                        <div className="td-avatar bot">
                            <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                        </div>
                        <div className="td-msg-content">
                            {/* Name removed */}
                            <div className="td-bubble">
                                你好！我已准备好协助你处理 <strong>{task.title}</strong>。有什么我可以帮忙的吗？比如拆解子任务？
                            </div>
                        </div>
                    </div>
                )}

                {session.messages.map(msg => {
                    const isUser = msg.role === 'user';
                    return (
                        <div key={msg.id} className={`td-msg-row ${isUser ? 'reverse' : ''}`}>
                            <div className={`td-avatar ${isUser ? 'user' : 'bot'}`}>
                                {isUser ? (
                                    <span className="material-symbols-outlined text-[16px] text-secondary">person</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                                )}
                            </div>
                            <div className="td-msg-content">

                                <div className="td-bubble whitespace-pre-wrap">
                                    {msg.content}
                                </div>
                            </div>
                        </div>
                    )
                })}

                {isGenerating && (
                    <div className="td-msg-row">
                        <div className="td-avatar bot">
                            <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                        </div>
                        <div className="td-msg-content">
                            <div className="td-bubble text-secondary italic">
                                正在思考...
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="td-input-area">
                <div className="td-input-wrapper focus-within:ring-2 ring-primary/20">
                    <button className="p-2 text-secondary hover:text-primary transition-colors rounded-lg">
                        <span className="material-symbols-outlined text-[20px]">add_circle</span>
                    </button>
                    <textarea
                        ref={textareaRef}
                        className="td-input-textarea"
                        placeholder="输入消息给 AI..."
                        rows={1}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isGenerating}
                    />
                    <button
                        className={`p-2 rounded-lg shadow-sm transition-colors mb-0.5 ${inputValue.trim() ? 'bg-primary text-white hover:opacity-90' : 'bg-gray-200 text-gray-400'}`}
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isGenerating}
                    >
                        <span className="material-symbols-outlined text-[18px] filled">send</span>
                    </button>
                </div>
                <div className="flex justify-center mt-2">
                    <p className="text-[10px] text-secondary text-center">AI generated content may be inaccurate.</p>
                </div>
            </div>
        </aside>
    );
};
