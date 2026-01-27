import { invoke } from "@tauri-apps/api/core";
import { ApiResponse } from "../../../shared/types/api";
import { AgentPersona } from "./types";

async function invokeApi<T>(command: string, args?: Record<string, unknown>) {
    const response = await invoke<ApiResponse<T>>(command, args);
    if (response.ok) return response.data;
    throw response.error;
}

export class UserAgentLoader {
    static async loadAgents(): Promise<AgentPersona[]> {
        try {
            const fileList = await invokeApi<{ files: string[] }>("vault_list_files", { path: ".agents" });

            const agents: AgentPersona[] = [];

            for (const filename of fileList.files) {
                if (!filename.endsWith(".json")) continue;

                try {
                    const contentValues = await invokeApi<{ content: string }>("vault_read_text", { path: `.agents/${filename}` });
                    const agent: AgentPersona = JSON.parse(contentValues.content);

                    // Basic validation
                    if (!agent.id || !agent.name || !agent.systemPrompt) {
                        console.warn(`[AgentLoader] Invalid agent definition in ${filename}`);
                        continue;
                    }

                    agents.push(agent);
                } catch (err) {
                    console.error(`[AgentLoader] Failed to load agent from ${filename}:`, err);
                }
            }

            return agents;
        } catch (err) {
            console.warn("[AgentLoader] No .agents directory found or access denied.", err);
            return [];
        }
    }
}
