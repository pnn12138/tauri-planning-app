import React, { useRef, useEffect, useState } from 'react';
import { useAiStore, setChatMode, toggleChat } from './ai.store';
import { sendMessage, setSettingsOpen } from './ai.store';
import './ai.css';

/**
 * AI Chat Panel - appears as a right sidebar (like task list panel)
 * This is the "panel mode" version that doesn't take over the whole screen
 */
export default function AiChatPanel() {
    const { sessions, activeSessionId, isGenerating, error, isChatOpen } = useAiStore();
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const activeSession = sessions.find(s => s.id === activeSessionId);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isGenerating) return;

        const message = inputValue.trim();
        setInputValue('');

        await sendMessage(message);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleExpandToFullscreen = () => {
        setChatMode('fullscreen');
    };

    const handleClose = () => {
        toggleChat();
    };

    if (!isChatOpen) return null;

    return (
        <aside className="ai-chat-panel">
            {/* Header */}
            <div className="ai-panel-header">
                <div className="ai-panel-header-left">
                    <div className="ai-panel-icon">🤖</div>
                    <div>
                        <h3 className="ai-panel-title">AI 智能助手</h3>
                        <div className="ai-panel-status">
                            <span className="ai-status-dot"></span>
                            <span>在线中</span>
                        </div>
                    </div>
                </div>
                <div className="ai-panel-header-actions">
                    <button
                        className="ai-panel-action-btn"
                        onClick={() => setSettingsOpen(true)}
                        title="Settings"
                    >
                        ⚙️
                    </button>
                    <button
                        className="ai-panel-action-btn"
                        onClick={handleExpandToFullscreen}
                        title="Expand to fullscreen"
                    >
                        ⛶
                    </button>
                    <button
                        className="ai-panel-action-btn"
                        onClick={handleClose}
                        title="Close"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="ai-panel-messages">
                {!activeSession || activeSession.messages.length === 0 ? (
                    <div className="ai-panel-welcome">
                        <h4>👋 你好！</h4>
                        <p>我是你的 AI 助手，有什么可以帮到你的吗？</p>
                    </div>
                ) : (
                    <>
                        {activeSession.messages.map((message) => (
                            <div
                                key={message.id}
                                className={`ai-panel-message ${message.role === 'user' ? 'ai-panel-message-user' : 'ai-panel-message-assistant'}`}
                            >
                                {message.role === 'assistant' && (
                                    <div className="ai-panel-message-avatar">🤖</div>
                                )}
                                <div className="ai-panel-message-bubble">
                                    {message.content}
                                </div>
                                {message.role === 'user' && (
                                    <div className="ai-panel-message-avatar-user">You</div>
                                )}
                            </div>
                        ))}

                        {isGenerating && (
                            <div className="ai-panel-message ai-panel-message-assistant">
                                <div className="ai-panel-message-avatar">🤖</div>
                                <div className="ai-panel-message-bubble ai-panel-typing">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="ai-panel-error">
                                ⚠️ {error}
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Input */}
            <div className="ai-panel-input-container">
                <form onSubmit={handleSubmit} className="ai-panel-form">
                    <textarea
                        ref={inputRef}
                        className="ai-panel-input"
                        placeholder="发送消息给 AI..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        disabled={isGenerating}
                    />
                    <button
                        type="submit"
                        className="ai-panel-send"
                        disabled={!inputValue.trim() || isGenerating}
                    >
                        {isGenerating ? '⏳' : '📤'}
                    </button>
                </form>
            </div>
        </aside>
    );
}
