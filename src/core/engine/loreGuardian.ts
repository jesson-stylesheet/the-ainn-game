/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Lore Guardian
 * ═══════════════════════════════════════════════════════════════════════
 * The Guardian of Chronicles visits the inn periodically (every 25 lore entries
 * or when manually summoned). The Guardian synthesizes recent events, asks the
 * Innkeeper 3 questions to connect lore threads, and weaves a new cohesive
 * synthesis entry into the Chronicle.
 */

import { loreChronicle } from './loreChronicle';
import { eventBus } from './eventBus';


export const GUARDIAN_THRESHOLD = 12;

class LoreGuardian {
    /**
     * Check if the condition for the Guardian's arrival is met.
     */
    checkArrivalCondition(): void {
        if (loreChronicle.unacknowledgedEntriesCount >= GUARDIAN_THRESHOLD) {
            this.arrive();
        }
    }

    /**
     * Trigger the Guardian's arrival manually or automatically.
     */
    arrive(): void {
        // Collect the recent lore that the Guardian hasn't reviewed yet
        const recentLore = loreChronicle.getUnacknowledgedLoreContext();

        // Emit an event to pause the game loop and interact with the UI
        eventBus.emit('lore:guardian_arrived', { recentLore });

        // Note: The actual Q&A and LLM generation happens in the UI layer interacting with the LLM wrappers,
        // because we need interactive player input.
    }

    /**
     * Once the synthesis is complete, this method is called to finalize the Guardian's visit.
     * Replaces ALL in-memory lore entries with just the synthesis (the new canonical seed),
     * then emits `lore:synthesis_finalized` so the DB layer can mirror the same replacement.
     */
    finalizeVisit(synthesisEntry: string, questionsAndAnswersText: string): void {
        // Replace every prior entry with the single synthesis — both regular lore and old syntheses.
        loreChronicle.replaceWithSynthesis(synthesisEntry, questionsAndAnswersText);

        // Signal the DB sync layer to wipe world lore and persist only this synthesis.
        eventBus.emit('lore:synthesis_finalized', {
            synthesisText: synthesisEntry,
            questionsAndAnswersText,
        });
    }
}

export const loreGuardian = new LoreGuardian();
