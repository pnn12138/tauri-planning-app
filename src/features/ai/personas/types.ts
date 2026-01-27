export interface AgentPersona {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    skills: string[]; // List of skill names (e.g. 'planning', 'retrieval') or '*'
}
