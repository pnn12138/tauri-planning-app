import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { ApiResponse } from '../../../shared/types/api';

interface UserSkillDefinition {
    name: string;
    description: string;
    type: "http";
    endpoint: string;
    method?: string;
    headers?: Record<string, string>;
    body_schema?: Record<string, any>; // Simplified schema definition
}

async function invokeApi<T>(command: string, args?: Record<string, unknown>) {
    const response = await invoke<ApiResponse<T>>(command, args);
    if (response.ok) return response.data;
    throw response.error;
}

export class UserSkillLoader {
    /**
     * Load all skills from the .skills directory
     */
    static async loadSkills(): Promise<DynamicStructuredTool[]> {
        try {
            // 1. List files in .skills
            const fileList = await invokeApi<{ files: string[] }>("vault_list_files", { path: ".skills" });

            const tools: DynamicStructuredTool[] = [];

            for (const filename of fileList.files) {
                if (!filename.endsWith(".json")) continue;

                try {
                    // 2. Read each file
                    const contentValues = await invokeApi<{ content: string }>("vault_read_text", { path: `.skills/${filename}` });
                    const definition: UserSkillDefinition = JSON.parse(contentValues.content);

                    // 3. Convert to Tool
                    const tool = this.createHttpTool(definition);
                    tools.push(tool);
                    console.log(`[SkillLoader] Loaded user skill: ${definition.name}`);
                } catch (err) {
                    console.error(`[SkillLoader] Failed to load skill from ${filename}:`, err);
                }
            }

            return tools;
        } catch (err) {
            console.warn("[SkillLoader] No .skills directory found or access denied.", err);
            return [];
        }
    }

    private static createHttpTool(def: UserSkillDefinition): DynamicStructuredTool {
        // Construct Zod schema from simple JSON definition
        // For now, we assume a flat object with string properties for simplicity
        // In a real app, you'd want a robust JSON Schema parser
        const schemaObject: Record<string, any> = {};
        if (def.body_schema) {
            for (const [key, _val] of Object.entries(def.body_schema)) {
                schemaObject[key] = z.string().describe(`Parameter ${key}`);
            }
        }

        const schema = z.object(schemaObject);

        return new DynamicStructuredTool({
            name: def.name,
            description: def.description,
            schema: schema,
            func: async (args) => {
                try {
                    const method = def.method || "POST";
                    const headers = def.headers || {};
                    headers['Content-Type'] = 'application/json';

                    const response = await fetch(def.endpoint, {
                        method,
                        headers,
                        body: method !== 'GET' ? JSON.stringify(args) : undefined
                    });

                    const text = await response.text();
                    return text;
                } catch (error) {
                    return `Error executing HTTP skill ${def.name}: ${JSON.stringify(error)}`;
                }
            }
        });
    }
}
