import { invoke } from "@tauri-apps/api/core";
import { AiSettings, ChatMessage } from "./ai.types";
import { CreateTaskInput } from "../../shared/types/planning";
import { ApiResponse } from "../../shared/types/api";
import { aiService } from "./ai.service";

async function invokeApi<T>(command: string, args?: Record<string, unknown>) {
    const response = await invoke<ApiResponse<T>>(command, args);
    if (response.ok) return response.data;
    throw response.error;
}

export async function getAiSettings(): Promise<AiSettings> {
    return invokeApi<AiSettings>("planning_get_ai_settings");
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
    return invokeApi<void>("planning_save_ai_settings", { settings });
}

export async function smartCapture(text: string): Promise<CreateTaskInput[]> {
    return invokeApi<CreateTaskInput[]>("planning_ai_smart_capture", { text });
}

/**
 * Chat with AI using LangChain Service
 * @param messages - Array of chat messages (conversation history)
 * @param settings - AI settings containing provider, API key and model info
 * @returns AI response text
 */
export async function chatWithAI(
    messages: ChatMessage[],
    settings: AiSettings,
    activeAgentId?: string,
    signal?: AbortSignal,
    taskContext?: string
): Promise<string> {
    return aiService.generateResponse(messages, settings, activeAgentId, signal, taskContext);
}

