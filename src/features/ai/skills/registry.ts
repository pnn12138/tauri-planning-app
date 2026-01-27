import { DynamicStructuredTool } from "@langchain/core/tools";
import { UserSkillLoader } from "./user_skill_loader";
import { PlanningSkill } from "./planning.skill";
import { RetrievalSkill } from "./retrieval.skill";

export class SkillRegistry {
    /**
     * Get all available tools: Core Skills + Dynamic User Skills
     */
    static async getAggregatedTools(): Promise<any[]> {
        // 1. Core Skills (Code-based)
        const coreSkills = [PlanningSkill, RetrievalSkill];
        const coreTools = coreSkills.flatMap((skill: any) => skill.tools) as any[];

        // 2. User Skills (JSON-based)
        const userTools = await UserSkillLoader.loadSkills();

        return [...coreTools, ...userTools];
    }
}
