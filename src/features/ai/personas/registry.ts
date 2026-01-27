import { DefaultAgent } from "./default";
import { TaskAgent } from "./task_agent";
import { UserAgentLoader } from "./user_agent_loader";
import { AgentPersona } from "./types";

export class PersonaRegistry {
    static async getAggregatedPersonas(): Promise<AgentPersona[]> {
        // 1. Built-in Agents
        const builtInAgents = [DefaultAgent, TaskAgent];

        // 2. User Agents
        const userAgents = await UserAgentLoader.loadAgents();

        return [...builtInAgents, ...userAgents];
    }

    static async getPersonaById(id: string): Promise<AgentPersona | undefined> {
        const all = await this.getAggregatedPersonas();
        return all.find(p => p.id === id);
    }
}
