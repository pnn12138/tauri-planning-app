import React, { useRef, useEffect, useState } from 'react';
import { useAiStore, setChatMode, abortGeneration } from './ai.store';
import { sendMessage } from './ai.store';
import ChatComposer from './components/ChatComposer';
import './ai.css';

export default function AiChatView() {
    const { sessions, activeSessionId, isGenerating, error, activeAgentId, personas } = useAiStore();
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activeSession = sessions.find(s => s.id === activeSessionId);
    const activeAgentName = personas.find(p => p.id === activeAgentId)?.name || 'AI Assistant';

    useEffect(() => {
        // Scroll to bottom when messages change
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages]);

    const handleSubmit = async () => {
        if (!inputValue.trim() || isGenerating) return;

        const message = inputValue.trim();
        setInputValue('');

        await sendMessage(message);
    };

    const handleSwitchToPanel = () => {
        setChatMode('panel');
    };

    if (!activeSession) {
        return (
            <main className="ai-chat-view">
                <div className="ai-chat-empty">
                    <h2>无活动对话</h2>
                    <p>创建一个新对话以开始</p>
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
                    <h3 className="ai-chat-header-title">{activeAgentName}</h3>
                    <div className="ai-chat-header-status">
                        <span className="ai-status-indicator"></span>
                        <span className="ai-status-text">在线</span>
                    </div>
                </div>
                <button
                    className="ai-header-action-btn"
                    onClick={handleSwitchToPanel}
                    title="切换到面板模式"
                >
                    ⬅️ 面板模式
                </button>
            </div>

            <div className="ai-chat-messages">
                {activeSession.messages.length === 0 && (
                    <div className="ai-chat-welcome">
                        <h2>👋 你好！</h2>
                        <p>我是你的 AI 助手。今天能为你做什么？</p>
                    </div>
                )}

                {activeSession.messages.map((message) => (
                    <div
                        key={message.id}
                        className={`ai-message ${message.role === 'user' ? 'ai-message-user' : 'ai-message-assistant'}`}
                    >
                        <div className="ai-message-avatar">
                            {message.role === 'user' ? (
                                <div className="ai-avatar-user">你</div>
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

            <ChatComposer
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSubmit}
                disabled={isGenerating}
                placeholder="输入消息..."
                mode="view"
                isGenerating={isGenerating}
                onStop={abortGeneration}
            />
        </main >
    );
}
