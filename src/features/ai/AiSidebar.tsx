import React from 'react';
import { useAiStore } from './ai.store';
import { createSession, setActiveSession, deleteSession } from './ai.store';
import './ai.css';

export default function AiSidebar() {
    const { sessions, activeSessionId } = useAiStore();

    const handleNewChat = () => {
        createSession();
    };

    const handleSelectSession = (id: string) => {
        setActiveSession(id);
    };

    const handleDeleteSession = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Delete this chat session?')) {
            deleteSession(id);
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    };

    return (
        <aside className="ai-sidebar">
            <div className="ai-sidebar-header">
                <button
                    className="primary"
                    onClick={handleNewChat}
                    style={{ width: '100%' }}
                >
                    + New Chat
                </button>
            </div>

            <div className="ai-session-list">
                {sessions.length === 0 ? (
                    <div className="ai-session-empty">
                        No chat sessions yet. Start a new chat!
                    </div>
                ) : (
                    sessions.map(session => (
                        <div
                            key={session.id}
                            className={`ai-session-item ${session.id === activeSessionId ? 'is-active' : ''}`}
                            onClick={() => handleSelectSession(session.id)}
                        >
                            <div className="ai-session-title">{session.title}</div>
                            <div className="ai-session-meta">
                                <span className="ai-session-time">{formatTime(session.updatedAt)}</span>
                                <span className="ai-session-count">{session.messages.length} messages</span>
                            </div>
                            <button
                                className="ai-session-delete"
                                onClick={(e) => handleDeleteSession(e, session.id)}
                                title="Delete session"
                            >
                                ×
                            </button>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}
