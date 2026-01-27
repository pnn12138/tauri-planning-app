import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { AiSettings, ChatMessage } from "./ai.types";
import { SkillRegistry } from "./skills/registry"; // Import Registry
import { PersonaRegistry } from "./personas/registry";

/**
 * Service to handle AI interactions using LangChain.js
 * This unifies different providers (Gemini, OpenAI, Ollama) under a single interface.
 * Now supports Tool Calling (Agentic behavior).
 */
export class AiService {
    private static instance: AiService;

    private constructor() { }

    public static getInstance(): AiService {
        if (!AiService.instance) {
            AiService.instance = new AiService();
        }
        return AiService.instance;
    }

    /**
     * Generate a response from the AI provider tailored by settings.
     * Executes tools if the model requests them.
     */
    public async generateResponse(
        messages: ChatMessage[],
        settings: AiSettings,
        activeAgentId: string = 'default',
        signal?: AbortSignal,
        taskContext?: string // Optional context about the current task
    ): Promise<string> {
        // 1. Load Persona
        const persona = await PersonaRegistry.getPersonaById(activeAgentId) || await PersonaRegistry.getPersonaById('default');

        let history = this.convertMessages(messages);

        // Inject System Prompt
        if (persona) {
            let systemPrompt = persona.systemPrompt;
            if (taskContext) {
                systemPrompt += `\n\n[CURRENT TASK CONTEXT]\n${taskContext}`;
            }
            history.unshift(new HumanMessage({ content: `System: ${systemPrompt}` }));
        }

        // 2. Load Tools & Filter by Persona Skills
        const allTools = await SkillRegistry.getAggregatedTools();

        let allowedTools = allTools;
        if (persona && !persona.skills.includes('*')) {
            allowedTools = allTools.filter(t => persona.skills.includes(t.name) || persona.skills.includes('planning'));
        }
        const toolMap = Object.fromEntries(allowedTools.map(tool => [tool.name, tool]));

        // 3. Initialize Model
        let model: any; // Using any to allow binding tools dynamically
        if (settings.provider === 'gemini') {
            model = this.createGeminiModel(settings);
        } else {
            // OpenAI and OpenRouter and Ollama share the same interface
            model = this.createOpenAIModel(settings);
        }

        // 4. Bind Tools
        const modelWithTools = model.bindTools(allowedTools);

        // 5. Execution Loop
        let finalResponse: BaseMessage | null = null;
        let iterations = 0;
        const MAX_ITERATIONS = 5;

        while (iterations < MAX_ITERATIONS) {
            // Check for abort before each iteration
            if (signal?.aborted) {
                throw new Error("Aborted");
            }

            const response = await modelWithTools.invoke(history, { signal });

            // Check if there are tool calls
            if (!response.tool_calls || response.tool_calls.length === 0) {
                finalResponse = response;
                break;
            }

            // Append the assistant's request to history
            history.push(response);

            // Execute tools
            for (const toolCall of response.tool_calls) {
                const tool = toolMap[toolCall.name];
                if (tool) {
                    console.log(`[AI Agent] Executing tool: ${toolCall.name} with args:`, toolCall.args);
                    try {
                        const toolOutput = await tool.invoke(toolCall.args);
                        history.push(new ToolMessage({
                            tool_call_id: toolCall.id,
                            content: String(toolOutput),
                            name: toolCall.name // Optional but good for debugging
                        }));
                    } catch (err: any) {
                        console.error(`[AI Agent] Tool execution failed:`, err);
                        history.push(new ToolMessage({
                            tool_call_id: toolCall.id,
                            content: `Error executing tool: ${err.message}`,
                        }));
                    }
                } else {
                    history.push(new ToolMessage({
                        tool_call_id: toolCall.id,
                        content: `Error: Tool ${toolCall.name} not found.`,
                    }));
                }
            }

            iterations++;
        }

        if (!finalResponse) {
            // If loop exhausted or broke early without final response (shouldn't happen logic-wise unless void)
            return "I'm sorry, I got stuck in a loop of operations. Please try again.";
        }

        // In LangChain, content can be complex (string | Record), but for text models it's usually string.
        if (typeof finalResponse.content === 'string') {
            return finalResponse.content;
        } else {
            return JSON.stringify(finalResponse.content);
        }
    }

    private convertMessages(messages: ChatMessage[]): BaseMessage[] {
        return messages.map(msg => {
            if (msg.role === 'user') {
                return new HumanMessage(msg.content);
            } else {
                return new AIMessage(msg.content);
            }
        });
    }

    private createGeminiModel(settings: AiSettings) {
        return new ChatGoogleGenerativeAI({
            apiKey: settings.api_key,
            model: settings.model_name || 'gemini-pro',
            maxOutputTokens: 2048,
            temperature: 0.7,
        });
    }

    private createOpenAIModel(settings: AiSettings) {
        const apiKey = settings.api_key || 'dummy-key'; // Ollama requires a non-empty string

        const config: any = {
            apiKey: apiKey,
            model: settings.model_name,
            temperature: 0.7,
        };

        if (settings.base_url) {
            config.configuration = {
                baseURL: settings.base_url
            };
        }

        return new ChatOpenAI(config);
    }
}

export const aiService = AiService.getInstance();
