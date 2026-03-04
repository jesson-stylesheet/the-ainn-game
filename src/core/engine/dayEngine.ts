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
 *   5. Decrements patron stays and evicts those whose time is up
 *   6. Generates new or recurring patrons based on day and probability
 *   7. Emits an EndOfDaySummary for the SyncAdapter and TUI
 */

import { resolveQuest } from '../math/probability';
import { gameState } from './gameState';
import { eventBus } from './eventBus';
import { createPatron, reviveRecurringPatron } from './patronFactory';
import { loreChronicle } from './loreChronicle';
import * as db from '../../infrastructure/db/queries';
import { generatePatronQuest } from '../../infrastructure/llm/narrativeRenderer';
import { parseQuestWithLLM } from '../../infrastructure/llm/questParser';
import type { EndOfDaySummary, IPatron } from '../types/entity';

// ── Constants ────────────────────────────────────────────────────────────

const MAX_INN_CAPACITY = 9;
const INITIAL_GENERATION_DAYS = 9;

/** Probability thresholds for day 11+ patron generation. */
const BASE_NEW_CHANCE = 0.10;          // 10%
const BASE_RECURRING_CHANCE = 0.25;    // 25% (cumulative: 35%)
// Remaining 65% = no patron

/** When fewer than 2 patrons are in the inn, chances are doubled. */
const LOW_POP_MULTIPLIER = 2;
const LOW_POP_THRESHOLD = 2;

/** Minimum lore entries before patrons can auto-post quests. */
const AUTO_QUEST_LORE_THRESHOLD = 5;
/** Chance (0-1) that a newly arriving patron posts their own quest. */
const AUTO_QUEST_CHANCE = 0.5;

class DayEngine {
    /**
     * Advances the world by one in-game day.
     * This is the PRIMARY game loop trigger — called when the player
     * explicitly chooses to end the day (TUI option 5, or POST /api/day/advance).
     *
     * Returns an EndOfDaySummary describing everything that happened.
     */
    async advanceDay(): Promise<EndOfDaySummary> {
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

        // 4. Decrement patron stays and evict expired patrons
        const patronsDeparted = gameState.decrementPatronStays();

        // 5. Generate new patrons based on day and probability
        const patronsArrived = await this.generatePatrons(day);

        // 6. Auto-quest: each arriving patron has a chance to post their own quest
        for (const patron of patronsArrived) {
            await this.tryAutoQuest(patron);
        }

        // 7. Build the End of Day summary
        const summary: EndOfDaySummary = {
            day,
            questsResolved: resolving.length,
            questsExpired: expired.length,
            patronsDeparted: patronsDeparted.length,
            patronsInInn: gameState.getActivePatronCount(),
            patronsQuesting: gameState.getPatronsByState('ON_QUEST').length,
            reputationGained: gameState.reputation - reputationBefore,
        };

        eventBus.emit('day:ended', summary);

        return summary;
    }

    /**
     * Patron generation logic based on the current day.
     * Days 1–9:  One new random patron per day (up to MAX_INN_CAPACITY).
     * Day 10:    One recurring patron from the codex (fallback to new).
     * Day 11+:   Probability roll — 10% new / 25% recurring / 65% nothing.
     *            If fewer than 2 patrons in inn, chances are doubled.
     */
    private async generatePatrons(day: number): Promise<IPatron[]> {
        const arrived: IPatron[] = [];
        const currentCount = gameState.getActivePatronCount();

        // Never exceed capacity
        if (currentCount >= MAX_INN_CAPACITY) return arrived;

        if (day <= INITIAL_GENERATION_DAYS) {
            // Days 1-9: Guaranteed one new patron per day
            const patron = createPatron(undefined, undefined, gameState.reputation);
            gameState.addPatron(patron);
            arrived.push(patron);

        } else if (day === INITIAL_GENERATION_DAYS + 1) {
            // Day 10: Try to bring in a recurring patron
            const patron = await this.trySpawnRecurring();
            if (patron) {
                arrived.push(patron);
            } else {
                // Fallback to a new patron if no recurring ones exist yet
                const newPatron = createPatron(undefined, undefined, gameState.reputation);
                gameState.addPatron(newPatron);
                arrived.push(newPatron);
            }

        } else {
            // Day 11+: Probability roll
            let newChance = BASE_NEW_CHANCE;
            let recurringChance = BASE_RECURRING_CHANCE;

            if (currentCount < LOW_POP_THRESHOLD) {
                newChance *= LOW_POP_MULTIPLIER;
                recurringChance *= LOW_POP_MULTIPLIER;
            }

            const roll = Math.random();

            if (roll < newChance) {
                // Spawn a brand-new patron
                const patron = createPatron(undefined, undefined, gameState.reputation);
                gameState.addPatron(patron);
                arrived.push(patron);

            } else if (roll < newChance + recurringChance) {
                // Try to spawn a recurring patron
                const patron = await this.trySpawnRecurring();
                if (patron) {
                    arrived.push(patron);
                } else {
                    // Fallback to new if no recurring patrons available
                    const newPatron = createPatron(undefined, undefined, gameState.reputation);
                    gameState.addPatron(newPatron);
                    arrived.push(newPatron);
                }
            }
            // else: 65% (or 30% if low pop) — no patron arrives
        }

        return arrived;
    }

    /**
     * Attempt to fetch a recurring patron from the patrons table.
     * If found, re-rolls their skills based on current reputation but keeps their name and id.
     */
    private async trySpawnRecurring(): Promise<IPatron | null> {
        const isDBEnabled = process.env.USE_DB === 'true';
        if (!isDBEnabled) return null;

        try {
            const activeNames = gameState.getAllPatrons().map(p => p.name);
            const recurring = await db.fetchRandomRecurringPatron(activeNames);
            if (!recurring) return null;

            const patron = reviveRecurringPatron(
                recurring.id,
                recurring.name,
                recurring.archetype,
                gameState.reputation,
            );
            gameState.returnPatron(patron);
            return patron;
        } catch (e) {
            console.warn(`[DayEngine] Failed to fetch recurring patron: ${(e as Error).message}`);
            return null;
        }
    }

    /**
     * If the world has enough lore, flip a coin for the arriving patron
     * to autonomously post their own quest on the board via LLM.
     */
    private async tryAutoQuest(patron: IPatron): Promise<void> {
        if (loreChronicle.size < AUTO_QUEST_LORE_THRESHOLD) return;
        if (Math.random() >= AUTO_QUEST_CHANCE) return;

        try {
            const loreContext = loreChronicle.getRecentLoreContext(5);
            const questText = await generatePatronQuest(patron, loreContext);

            const quest = await parseQuestWithLLM(questText, gameState.reputation);
            quest.postedByPatronId = patron.id;
            gameState.addQuest(quest);

            eventBus.emit('quest:auto_posted', { quest, patron });
        } catch (e) {
            console.warn(`[DayEngine] Auto-quest failed for ${patron.name}: ${(e as Error).message}`);
        }
    }
}

/** Singleton day engine instance. */
export const dayEngine = new DayEngine();
