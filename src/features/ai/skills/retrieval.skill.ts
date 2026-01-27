import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";

export const searchSimilarTool = new DynamicStructuredTool({
    name: "search_context",
    description: "Search for similar text in a provided list of candidates. Useful for finding related information.",
    schema: z.object({
        query: z.string().describe("The query text to search for."),
        candidates: z.array(z.string()).describe("List of text candidates to search within."),
    }),
    func: async ({ query, candidates }) => {
        try {
            const results = await invoke("ai_search_similar", { query, candidates });
            return JSON.stringify(results);
        } catch (error) {
            return `Error searching similar: ${JSON.stringify(error)}`;
        }
    },
});

export const RetrievalSkill = {
    name: "retrieval",
    description: "Tools for retrieving information from local knowledge base.",
    tools: [searchSimilarTool]
};
