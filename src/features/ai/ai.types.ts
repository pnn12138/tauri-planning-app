export interface AiSettings {
    provider: 'gemini' | 'openai' | 'ollama' | 'openrouter';
    base_url: string;
    api_key: string;
    model_name: string;
}

export interface SmartCaptureResponse {
    tasks: any[]; // will map to CreateTaskInput
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    taskId?: string; // Optional: Link to a specific task
}

export interface LocalAiConfig {
    openrouter?: {
        apiKey?: string;
        model?: string;
    };
    openai?: {
        apiKey?: string;
        model?: string;
    };
    gemini?: {
        apiKey?: string;
        model?: string;
    };
}
