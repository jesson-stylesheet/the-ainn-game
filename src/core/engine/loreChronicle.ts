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
    questId: string | null;
    originalText: string;             // The player's raw quest narrative or the synthesis questions
    outcome: 'COMPLETED' | 'FAILED' | 'SYNTHESIS';
    patronName: string | null;               // Who attempted it (null for synthesis)
    patronArchetype: string | null;          // What they were (null for synthesis)
    loreText: string;                 // LLM-generated chronicle entry or synthesis
    storyText: string;                // LLM-generated short story for the player or Guardian dialogue
}

class LoreChronicle {
    private entries: LoreEntry[] = [];
    private unacknowledgedCount = 0;

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
        this.unacknowledgedCount++;
    }

    /**
     * Record a Guardian's synthesis entry.
     */
    recordSynthesis(synthesisText: string, questionsAndAnswersText: string = ''): void {
        this.entries.push({
            timestamp: Date.now(),
            questId: null,
            originalText: questionsAndAnswersText,
            outcome: 'SYNTHESIS',
            patronName: 'The Chronicle Guardian',
            patronArchetype: 'Celestial Observer',
            loreText: synthesisText,
            storyText: 'The Guardian weaves the threads of fate.',
        });
        // Note: We don't increment the unacknowledged count here, as a synthesis doesn't trigger another synthesis.
    }

    /** 
     * How many normal lore entries have been added since the last Guardian visit? 
     */
    get unacknowledgedEntriesCount(): number {
        return this.unacknowledgedCount;
    }

    /**
     * Remove the synthesized entries and reset the counter after a Guardian visit.
     * At call-time the array is: [...older, ...N unacknowledged, SYNTHESIS].
     * We splice out the N unacknowledged entries, keeping older + SYNTHESIS.
     */
    acknowledgeEntries(): void {
        if (this.unacknowledgedCount > 0) {
            // The synthesis entry is the last element; the N entries before it are what we consume.
            const spliceStart = this.entries.length - 1 - this.unacknowledgedCount;
            this.entries.splice(spliceStart, this.unacknowledgedCount);
        }
        this.unacknowledgedCount = 0;
    }

    /**
     * Get the lore texts that haven't been synthesized yet.
     */
    getUnacknowledgedLoreContext(): string {
        if (this.unacknowledgedCount === 0) return 'No new tales have been spun since the last visit.';
        const recent = this.entries.slice(-this.unacknowledgedCount);
        return recent.map(e => e.loreText).join('\n');
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
            if (entry.outcome === 'SYNTHESIS') {
                return `\n${'-'.repeat(40)}\n📜 SYNTHESIS RECORD: ${entry.loreText}\n${'-'.repeat(40)}\n`;
            }
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

    /**
     * Get the most recent synthesis entry's lore text, if any.
     * Used to give the Guardian memory of its prior visit.
     */
    getLastSynthesis(): string | null {
        for (let i = this.entries.length - 1; i >= 0; i--) {
            if (this.entries[i].outcome === 'SYNTHESIS') {
                return this.entries[i].loreText;
            }
        }
        return null;
    }

    /** Total entries. */
    get size(): number {
        return this.entries.length;
    }

    /**
     * Hydrate the chronicle from a list of entries (usually from DB).
     */
    hydrate(entries: LoreEntry[]): void {
        this.entries = [...entries];
        // We assume all loaded entries are already "acknowledged" by a prior synthesis
        // or we just reset the counter to 0 upon start to avoid instant Guardian trigger
        // unless the user specifically wants to catch up.
        this.unacknowledgedCount = 0;
    }

    /** Reset for testing. */
    reset(): void {
        this.entries = [];
        this.unacknowledgedCount = 0;
    }
}

/** Singleton lore chronicle. */
export const loreChronicle = new LoreChronicle();
