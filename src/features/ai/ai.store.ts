import { useSyncExternalStore } from 'react';
import { AiSettings, ChatSession, ChatMessage } from './ai.types';
import { getAiSettings, saveAiSettings, chatWithAI } from './ai.api';
import { v4 as uuidv4 } from 'uuid';
import { AgentPersona } from './personas/types';
import { PersonaRegistry } from './personas/registry';
import { getTaskById } from '../planning/planning.store';

interface AiState {
    settings: AiSettings;
    isSettingsOpen: boolean;
    isSmartAddOpen: boolean;
    isChatOpen: boolean;
    chatMode: 'fullscreen' | 'panel'; // fullscreen = replace main view, panel = right sidebar
    sessions: ChatSession[];
    activeSessionId: string | null;
    isGenerating: boolean;
    isLoading: boolean;
    error: string | null;
    abortController: AbortController | null;

    // Agent Persona
    personas: AgentPersona[];
    activeAgentId: string;
}

// Initial State
let aiState: AiState = {
    settings: {
        provider: 'gemini',
        base_url: "https://generativelanguage.googleapis.com/v1beta",
        api_key: "AIzaSyCJbs5T3bvEGxRDN77zC39v4bFSO-j7gIU",
        model_name: "gemini-pro",
    },
    isSettingsOpen: false,
    isSmartAddOpen: false,
    isChatOpen: false,
    chatMode: 'panel', // Default to panel mode
    sessions: [],
    activeSessionId: null,
    isGenerating: false,
    isLoading: false,
    error: null,
    abortController: null,

    // Agent Defaults
    personas: [],
    activeAgentId: 'default',
};

const listeners = new Set<() => void>();

function emitChange() {
    for (const listener of listeners) listener();
}

export function getAiState() {
    return aiState;
}

function setAiState(newState: Partial<AiState>) {
    aiState = { ...aiState, ...newState };
    emitChange();
}

// Actions
export const loadSettings = async () => {
    setAiState({ isLoading: true, error: null });
    try {
        const settings = await getAiSettings();
        setAiState({ settings, isLoading: false });
    } catch (error) {
        setAiState({ error: String(error), isLoading: false });
    }
};

export const updateSettings = async (settings: AiSettings) => {
    setAiState({ isLoading: true, error: null });
    try {
        await saveAiSettings(settings);
        setAiState({ settings, isLoading: false, isSettingsOpen: false });
    } catch (error) {
        setAiState({ error: String(error), isLoading: false });
    }
};

export const setSettingsOpen = (isOpen: boolean) => setAiState({ isSettingsOpen: isOpen });
export const setSmartAddOpen = (isOpen: boolean) => setAiState({ isSmartAddOpen: isOpen });

// Chat Actions
export const toggleChat = () => {
    const newState = !aiState.isChatOpen;
    setAiState({ isChatOpen: newState });

    // Create default session if opening for first time with no sessions
    if (newState && aiState.sessions.length === 0) {
        createSession();
    }
};

export const setChatMode = (mode: 'fullscreen' | 'panel') => {
    setAiState({ chatMode: mode });
};


export const createSession = (props?: Partial<ChatSession>): string => {
    const newSession: ChatSession = {
        id: uuidv4(),
        title: props?.title || 'New Chat',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...props
    };

    setAiState({
        sessions: [...aiState.sessions, newSession],
        activeSessionId: newSession.id,
    });

    return newSession.id;
};

export const startTaskSession = (taskId: string) => {
    // 1. Check if a session for this task already exists
    const existingSession = aiState.sessions.find(s => s.taskId === taskId);

    if (existingSession) {
        setAiState({
            activeSessionId: existingSession.id,
            isChatOpen: true,
            chatMode: 'panel',
            activeAgentId: 'task_agent'
        });
        return;
    }

    // 2. Create new session for this task
    const task = getTaskById(taskId);
    const taskTitle = task ? `Task: ${task.title}` : 'Task Workspace';

    createSession({
        title: taskTitle,
        taskId: taskId,
        // Optional: Pre-fill with a system-like message or just rely on Task Agent persona
    });

    setAiState({
        isChatOpen: true,
        chatMode: 'panel',
        activeAgentId: 'task_agent'
    });
};

export const setActiveSession = (id: string) => {
    setAiState({ activeSessionId: id });
};

export const deleteSession = (id: string) => {
    const updatedSessions = aiState.sessions.filter(s => s.id !== id);
    let newActiveId = aiState.activeSessionId;

    // If deleting active session, switch to another
    if (id === aiState.activeSessionId) {
        newActiveId = updatedSessions.length > 0 ? updatedSessions[0].id : null;
    }

    setAiState({
        sessions: updatedSessions,
        activeSessionId: newActiveId,
    });
};

export const loadPersonas = async () => {
    try {
        const personas = await PersonaRegistry.getAggregatedPersonas();
        setAiState({ personas });
    } catch (error) {
        console.error("Failed to load personas:", error);
    }
};

export const setActiveAgent = (agentId: string) => {
    setAiState({ activeAgentId: agentId });
};

export const abortGeneration = () => {
    if (aiState.abortController) {
        aiState.abortController.abort();
        setAiState({ isGenerating: false, abortController: null, isLoading: false });
    }
};

export const sendMessage = async (content: string, targetSessionId?: string) => {
    const sessionId = targetSessionId || aiState.activeSessionId;
    if (!sessionId) return;

    const userMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content,
        timestamp: Date.now(),
    };

    // Add user message to active session
    const updatedSessions = aiState.sessions.map(session => {
        if (session.id === sessionId) {
            return {
                ...session,
                messages: [...session.messages, userMessage],
                updatedAt: Date.now(),
                // Update title based on first message
                title: session.messages.length === 0
                    ? content.slice(0, 30) + (content.length > 30 ? '...' : '')
                    : session.title,
            };
        }
        return session;
    });

    const controller = new AbortController();
    setAiState({
        sessions: updatedSessions,
        isGenerating: true,
        error: null,
        abortController: controller
    });

    try {
        // Get current session's messages for context
        const currentSession = updatedSessions.find(s => s.id === sessionId);
        if (!currentSession) throw new Error('Session not found');

        // Prepare Task Context if applicable
        let taskContext = undefined;
        if (currentSession.taskId) {
            const task = getTaskById(currentSession.taskId);
            if (task) {
                taskContext = JSON.stringify(task, null, 2);
            }
        }

        // Call AI API
        const responseText = await chatWithAI(
            currentSession.messages,
            aiState.settings,
            aiState.activeAgentId,
            controller.signal,
            taskContext
        );

        const assistantMessage: ChatMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: responseText,
            timestamp: Date.now(),
        };

        // Add assistant message
        const finalSessions = aiState.sessions.map(session => {
            if (session.id === sessionId) {
                return {
                    ...session,
                    messages: [...session.messages, assistantMessage],
                    updatedAt: Date.now(),
                };
            }
            return session;
        });

        setAiState({ sessions: finalSessions, isGenerating: false, abortController: null });
    } catch (error: any) {
        // Ignore abort errors
        if (error.name === 'AbortError' || error.message === 'Aborted') {
            console.log('AI generation aborted');
            setAiState({ isGenerating: false, abortController: null });
            return;
        }

        setAiState({
            error: `Failed to get AI response: ${String(error)}`,
            isGenerating: false,
            abortController: null
        });
    }
};

// Hook
export function useAiStore() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => aiState
    );
}

// Convenience hook to return actions as well
export function useAiStoreWithActions() {
    const state = useAiStore();
    return {
        ...state,
        loadSettings,
        updateSettings,
        setSettingsOpen,
        setSmartAddOpen,
        setActiveAgent,
        loadPersonas,
        abortGeneration,
        startTaskSession,
    };
}
