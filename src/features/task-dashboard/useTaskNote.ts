import { useState, useEffect, useCallback } from 'react';
import { planningOpenTaskNote, planningUpdateTask } from '../planning/planning.api'; // Ensure this exists or use store action
import { readMarkdown, writeMarkdown } from '../editor/editor.api';
import type { Subtask } from '../../shared/types/planning';
import { v4 as uuidv4 } from 'uuid';

export interface TaskNoteData {
    notePath: string | null;
    content: string;
    subtasks: Subtask[];
    isLoading: boolean;
    error: string | null;
}

export function useTaskNote(taskId: string) {
    const [data, setData] = useState<TaskNoteData>({
        notePath: null,
        content: '',
        subtasks: [],
        isLoading: true,
        error: null,
    });

    const fetchNote = useCallback(async () => {
        try {
            setData(prev => ({ ...prev, isLoading: true, error: null }));

            // 1. Get Path (ensure exists)
            const { mdPath } = await planningOpenTaskNote(taskId);

            // 2. Read Content
            const { content } = await readMarkdown(mdPath);

            // 3. Parse Subtasks
            const subtasks = parseSubtasksFromMd(content);

            setData({
                notePath: mdPath,
                content,
                subtasks,
                isLoading: false,
                error: null,
            });

            // Optional: Sync parsed subtasks to DB if different? 
            // avoiding instant sync for now to prevent loops, but could be good.

        } catch (err) {
            console.error("Failed to load task note:", err);
            setData(prev => ({ ...prev, isLoading: false, error: String(err) }));
        }
    }, [taskId]);

    useEffect(() => {
        fetchNote();
    }, [fetchNote]);

    const updateNoteContent = useCallback(async (newContent: string) => {
        if (!data.notePath) return;

        // Optimistic Update
        const newSubtasks = parseSubtasksFromMd(newContent);
        setData(prev => ({ ...prev, content: newContent, subtasks: newSubtasks }));

        try {
            // Write to File
            await writeMarkdown({ path: data.notePath, content: newContent });

            // Sync Subtasks to DB (to keep Kanban view updated)
            // Note: This requires mapping MD items to existing Subtask IDs if possible, 
            // but simplistic parsing generates new IDs or lacks IDs. 
            // Strategy: We just push the new list. DB will replace.
            await planningUpdateTask({
                id: taskId,
                subtasks: newSubtasks
            });

        } catch (err) {
            console.error("Failed to update note:", err);
            // Revert? (Complex, skip for MVP)
        }
    }, [taskId, data.notePath]);

    const toggleSubtask = useCallback(async (index: number) => {
        const lines = data.content.split('\n');
        let checkboxIndex = 0;

        const newLines = lines.map(line => {
            const match = line.match(/^(\s*-\s*\[)([ x])(\]\s.*)$/);
            if (match) {
                if (checkboxIndex === index) {
                    const isChecked = match[2] === 'x';
                    return `${match[1]}${isChecked ? ' ' : 'x'}${match[3]}`;
                }
                checkboxIndex++;
            }
            return line;
        });

        await updateNoteContent(newLines.join('\n'));
    }, [data.content, updateNoteContent]);

    return { ...data, reload: fetchNote, updateNoteContent, toggleSubtask };
}

function parseSubtasksFromMd(content: string): Subtask[] {
    const lines = content.split('\n');
    const subtasks: Subtask[] = [];

    lines.forEach(line => {
        // Match "- [ ] Title" or "- [x] Title"
        const match = line.match(/^\s*-\s*\[([ x])\]\s+(.*)$/);
        if (match) {
            subtasks.push({
                id: uuidv4(), // Generate temp ID, or could try to persist stable IDs in MD comments
                title: match[2].trim(),
                completed: match[1] === 'x'
            });
        }
    });

    return subtasks;
}
