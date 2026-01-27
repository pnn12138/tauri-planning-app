import React, { useRef, useEffect, useState } from 'react';
import { useAiStore, setChatMode, toggleChat, createSession, abortGeneration } from './ai.store';
import { sendMessage, setSettingsOpen } from './ai.store';
import ChatComposer from './components/ChatComposer';
import './ai.css';

/**
 * AI Chat Panel - appears as a right sidebar (like task list panel)
 * This is the "panel mode" version that doesn't take over the whole screen
 */
export default function AiChatPanel() {
    const { sessions, activeSessionId, isGenerating, error, isChatOpen, activeAgentId, personas } = useAiStore();
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activeSession = sessions.find(s => s.id === activeSessionId);
    const activeAgentName = personas.find(p => p.id === activeAgentId)?.name || 'AI 智能助手';

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages]);

    const handleSubmit = async () => {
        if (!inputValue.trim() || isGenerating) return;

        const message = inputValue.trim();
        setInputValue('');

        await sendMessage(message);
    };

    const handleExpandToFullscreen = () => {
        setChatMode('fullscreen');
    };

    const handleClose = () => {
        toggleChat();
    };

    const handleNewChat = () => {
        createSession();
    };

    if (!isChatOpen) return null;

    return (
        <aside className="ai-chat-panel">
            {/* Header */}
            <div className="ai-panel-header">
                <div className="ai-panel-header-left">
                    <div className="ai-panel-icon">🤖</div>
                    <div>
                        <h3 className="ai-panel-title">{activeAgentName}</h3>
                        <div className="ai-panel-status">
                            <span className="ai-status-dot"></span>
                            <span>在线中</span>
                        </div>
                    </div>
                </div>
                <div className="ai-panel-header-actions">
                    <button
                        className="ai-panel-action-btn"
                        onClick={handleNewChat}
                        title="新建对话"
                    >
                        ➕
                    </button>
                    <button
                        className="ai-panel-action-btn"
                        onClick={() => setSettingsOpen(true)}
                        title="设置"
                    >
                        ⚙️
                    </button>
                    <button
                        className="ai-panel-action-btn"
                        onClick={handleExpandToFullscreen}
                        title="全屏"
                    >
                        ⛶
                    </button>
                    <button
                        className="ai-panel-action-btn"
                        onClick={handleClose}
                        title="关闭"
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
                                    <div className="ai-panel-message-avatar-user">你</div>
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
            <ChatComposer
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSubmit}
                disabled={isGenerating}
                placeholder="发送消息给 AI..."
                mode="panel"
                isGenerating={isGenerating}
                onStop={abortGeneration}
            />
        </aside>
    );
}
