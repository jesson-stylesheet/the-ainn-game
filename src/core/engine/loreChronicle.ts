/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Lore Chronicle
 * ═══════════════════════════════════════════════════════════════════════
 * Every quest resolution contributes to the living worldbuilding lore.
 * The LLM writes the lore entries at quest completion/failure.
 * This append-only chronicle feeds into procedural world generation.
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { IQuest, QuestResolutionResult, IPatron } from '../types/entity';

export interface LoreEntry {
    timestamp: number;
    questId: string;
    originalText: string;             // The player's raw quest narrative
    outcome: 'COMPLETED' | 'FAILED';  // Always set (lore written at resolution)
    patronName: string;               // Who attempted it
    patronArchetype: string;          // What they were
    loreText: string;                 // LLM-generated chronicle entry
    storyText: string;                // LLM-generated short story for the player
}

class LoreChronicle {
    private entries: LoreEntry[] = [];

    /**
     * Record a completed quest resolution with LLM-generated lore and story.
     * Called AFTER the LLM has generated both the short story and lore entry.
     */
    recordResolution(
        quest: IQuest,
        patron: IPatron,
        result: QuestResolutionResult,
        loreText: string,
        storyText: string
    ): void {
        this.entries.push({
            timestamp: Date.now(),
            questId: quest.id,
            originalText: quest.originalText,
            outcome: result.success ? 'COMPLETED' : 'FAILED',
            patronName: patron.name,
            patronArchetype: patron.archetype,
            loreText,
            storyText,
        });
    }

    /**
     * Get all lore entries chronologically.
     */
    getChronicle(): LoreEntry[] {
        return [...this.entries];
    }

    /**
     * Get recent entries (last N) for LLM context windows.
     */
    getRecent(count: number): LoreEntry[] {
        return this.entries.slice(-count);
    }

    /**
     * Export the full chronicle as a narrative digest.
     * This is what gets fed to the LLM for world generation.
     */
    toNarrativeDigest(): string {
        if (this.entries.length === 0) return 'The inn has been quiet. No tales to tell.';

        const lines = this.entries.map(entry => {
            const icon = entry.outcome === 'COMPLETED' ? '✦' : '✧';
            return `${icon} ${entry.loreText}`;
        });

        return `Chronicle of The AInn:\n\n${lines.join('\n\n')}`;
    }

    /**
     * Get the most recent lore texts for context injection.
     */
    getRecentLoreContext(count: number): string {
        const recent = this.getRecent(count);
        if (recent.length === 0) return '';
        return recent.map(e => e.loreText).join('\n');
    }

    /** Total entries. */
    get size(): number {
        return this.entries.length;
    }

    /** Reset for testing. */
    reset(): void {
        this.entries = [];
    }
}

/** Singleton lore chronicle. */
export const loreChronicle = new LoreChronicle();
