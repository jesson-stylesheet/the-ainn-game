/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Day Engine (The Innkeeper's Day Cycle)
 * ═══════════════════════════════════════════════════════════════════════
 * Replaces the continuous real-time Ticker with a player-driven
 * "End Day" action. Time only advances when the innkeeper decides
 * to close the day.
 *
 * Each call to advanceDay():
 *   1. Increments the in-game day counter
 *   2. Expires unaccepted POSTED quests past their deadline
 *   3. Decrements durationDays for all ACCEPTED quests
 *   4. Resolves quests that reach 0 durationDays via probability engine
 *   5. Emits an EndOfDaySummary for the SyncAdapter and TUI
 */

import { resolveQuest } from '../math/probability';
import { gameState } from './gameState';
import { eventBus } from './eventBus';
import type { EndOfDaySummary, IQuest } from '../types/entity';

class DayEngine {
    /**
     * Advances the world by one in-game day.
     * This is the PRIMARY game loop trigger — called when the player
     * explicitly chooses to end the day (TUI option 5, or POST /api/day/advance).
     *
     * Returns an EndOfDaySummary describing everything that happened.
     */
    advanceDay(): EndOfDaySummary {
        // Bump the day counter
        const day = gameState.incrementDay();
        eventBus.emit('day:started', { day });

        const reputationBefore = gameState.reputation;

        // 1. Expire unaccepted POSTED quests past their deadline
        const expired = gameState.expireQuestsByDay(day);

        // 2. Tick all ACCEPTED quests down by 1 day, collect finished ones
        const resolving = gameState.tickActiveQuestsByDay();

        // 3. Resolve finished quests through the probability engine
        for (const quest of resolving) {
            if (!quest.assignedPatronId) continue;

            const patron = gameState.getPatron(quest.assignedPatronId);
            if (!patron) continue;

            const result = resolveQuest(patron, quest);
            gameState.recordResolution(result);
        }

        // 4. Build the End of Day summary
        const summary: EndOfDaySummary = {
            day,
            questsResolved: resolving.length,
            questsExpired: expired.length,
            patronsDeparted: 0,       // Future: patron stay duration mechanic
            reputationGained: gameState.reputation - reputationBefore,
        };

        eventBus.emit('day:ended', summary);

        return summary;
    }
}

/** Singleton day engine instance. */
export const dayEngine = new DayEngine();
