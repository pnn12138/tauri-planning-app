import React, { useRef, useEffect, useState } from 'react';
import { useAiStore, setChatMode } from './ai.store';
import { sendMessage } from './ai.store';
import './ai.css';

export default function AiChatView() {
    const { sessions, activeSessionId, isGenerating, error } = useAiStore();
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const activeSession = sessions.find(s => s.id === activeSessionId);

    useEffect(() => {
        // Scroll to bottom when messages change
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isGenerating) return;

        const message = inputValue.trim();
        setInputValue('');

        await sendMessage(message);

        // Focus back on input
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleSwitchToPanel = () => {
        setChatMode('panel');
    };

    if (!activeSession) {
        return (
            <main className="ai-chat-view">
                <div className="ai-chat-empty">
                    <h2>No active chat</h2>
                    <p>Create a new chat session to get started</p>
                </div>
            </main>
        );
    }

    return (
        <main className="ai-chat-view">
            <div className="ai-chat-header">
                <div className="ai-chat-header-icon">
                    <span className="ai-icon">🤖</span>
                </div>
                <div className="ai-chat-header-info">
                    <h3 className="ai-chat-header-title">AI Assistant</h3>
                    <div className="ai-chat-header-status">
                        <span className="ai-status-indicator"></span>
                        <span className="ai-status-text">Online</span>
                    </div>
                </div>
                <button
                    className="ai-header-action-btn"
                    onClick={handleSwitchToPanel}
                    title="Switch to panel mode"
                >
                    ⬅️ panel
                </button>
            </div>

            <div className="ai-chat-messages">
                {activeSession.messages.length === 0 && (
                    <div className="ai-chat-welcome">
                        <h2>👋 Hello!</h2>
                        <p>I'm your AI assistant. How can I help you today?</p>
                    </div>
                )}

                {activeSession.messages.map((message) => (
                    <div
                        key={message.id}
                        className={`ai-message ${message.role === 'user' ? 'ai-message-user' : 'ai-message-assistant'}`}
                    >
                        <div className="ai-message-avatar">
                            {message.role === 'user' ? (
                                <div className="ai-avatar-user">You</div>
                            ) : (
                                <div className="ai-avatar-assistant">🤖</div>
                            )}
                        </div>
                        <div className="ai-message-content">
                            <div className="ai-message-bubble">
                                {message.content}
                            </div>
                        </div>
                    </div>
                ))}

                {isGenerating && (
                    <div className="ai-message ai-message-assistant">
                        <div className="ai-message-avatar">
                            <div className="ai-avatar-assistant">🤖</div>
                        </div>
                        <div className="ai-message-content">
                            <div className="ai-message-bubble ai-typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="ai-error-message">
                        ⚠️ {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="ai-chat-input-container">
                <form onSubmit={handleSubmit} className="ai-chat-form">
                    <textarea
                        ref={inputRef}
                        className="ai-chat-input"
                        placeholder="Type your message..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        disabled={isGenerating}
                    />
                    <button
                        type="submit"
                        className="ai-chat-send"
                        disabled={!inputValue.trim() || isGenerating}
                    >
                        {isGenerating ? '⏳' : '📤'}
                    </button>
                </form>
            </div>
        </main>
    );
}
