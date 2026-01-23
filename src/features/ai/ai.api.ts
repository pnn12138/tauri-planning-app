import { invoke } from "@tauri-apps/api/core";
import { AiSettings, ChatMessage } from "./ai.types";
import { CreateTaskInput } from "../../shared/types/planning";
import { ApiResponse } from "../../shared/types/api";

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
 * Chat with Google Gemini API
 * @param messages - Array of chat messages (conversation history)
 * @param settings - AI settings containing API key and model info
 * @returns AI response text
 */
export async function chatWithGemini(
    messages: ChatMessage[],
    settings: AiSettings
): Promise<string> {
    const apiKey = settings.api_key;
    const modelName = settings.model_name || 'gemini-pro';

    // Convert our message format to Gemini's expected format
    const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();

    // Extract the response text from Gemini's response format
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
    }

    throw new Error('Unexpected response format from Gemini API');
}
