/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Game State Manager
 * ═══════════════════════════════════════════════════════════════════════
 * In-memory state that serves as the working set. In production this
 * syncs to Supabase. For testing, it IS the source of truth.
 */

import type { IPatron, IQuest, QuestResolutionResult, PatronState } from '../types/entity';
import { eventBus } from './eventBus';

class GameState {
    private patrons: Map<string, IPatron> = new Map();
    private quests: Map<string, IQuest> = new Map();
    private resolvedResults: QuestResolutionResult[] = [];
    private innInventory: Map<string, { quantity: number; rarity: number }> = new Map();

    // ── Patrons ─────────────────────────────────────────────────────────

    addPatron(patron: IPatron): void {
        this.patrons.set(patron.id, patron);
        eventBus.emit('patron:arrived', { patron });
    }

    getPatron(id: string): IPatron | undefined {
        return this.patrons.get(id);
    }

    getPatronsByState(state: PatronState): IPatron[] {
        return Array.from(this.patrons.values()).filter(p => p.state === state);
    }

    getAllPatrons(): IPatron[] {
        return Array.from(this.patrons.values());
    }

    updatePatronState(id: string, state: PatronState): void {
        const patron = this.patrons.get(id);
        if (patron) {
            patron.state = state;
        }
    }

    // ── Quests ──────────────────────────────────────────────────────────

    addQuest(quest: IQuest): void {
        this.quests.set(quest.id, quest);
        eventBus.emit('quest:posted', { quest });
    }

    getQuest(id: string): IQuest | undefined {
        return this.quests.get(id);
    }

    getAllQuests(): IQuest[] {
        return Array.from(this.quests.values());
    }

    getQuestsByStatus(status: IQuest['status']): IQuest[] {
        return Array.from(this.quests.values()).filter(q => q.status === status);
    }

    /**
     * Assign a patron to a quest. Sets patron to ON_QUEST, quest to ACCEPTED.
     */
    assignPatronToQuest(patronId: string, questId: string): boolean {
        const patron = this.patrons.get(patronId);
        const quest = this.quests.get(questId);

        if (!patron || !quest) return false;
        if (patron.state !== 'IDLE' && patron.state !== 'LOUNGING') return false;
        if (quest.status !== 'POSTED') return false;

        patron.state = 'ON_QUEST';
        quest.assignedPatronId = patronId;
        quest.status = 'ACCEPTED';

        eventBus.emit('quest:accepted', { quest, patron });
        return true;
    }

    // ── Resolution ──────────────────────────────────────────────────────

    /**
     * Decrement resolutionTicks for all accepted quests.
     * Returns the list of quests that have hit 0 and should resolve.
     */
    tickActiveQuests(): IQuest[] {
        const resolving: IQuest[] = [];
        for (const q of this.quests.values()) {
            if (q.status === 'ACCEPTED') {
                q.resolutionTicks--;
                if (q.resolutionTicks <= 0) {
                    resolving.push(q);
                }
            }
        }
        return resolving;
    }

    /**
     * Record a resolution result and update state accordingly.
     */
    recordResolution(result: QuestResolutionResult): void {
        const quest = this.quests.get(result.questId);
        const patron = this.patrons.get(result.patronId);

        if (quest) {
            quest.status = result.success ? 'COMPLETED' : 'FAILED';

            // Deposit extracted items into the Inn's ledger on success
            if (result.success && quest.type === 'itemRetrieval' && quest.itemDetails) {
                const { itemName, quantity, rarity } = quest.itemDetails;
                // Normalize name for grouping (e.g., 'Silverleaf' and 'silverleaf' become same stack)
                const key = itemName.trim().toLowerCase();
                const existing = this.innInventory.get(key) ?? { quantity: 0, rarity };
                this.innInventory.set(key, {
                    quantity: existing.quantity + quantity,
                    rarity: existing.rarity >= rarity ? existing.rarity : rarity // keep highest discovered rarity
                });
            }
        }

        if (patron) {
            patron.state = result.success ? 'LOUNGING' : 'IDLE';
        }

        this.resolvedResults.push(result);

        if (quest && patron) {
            eventBus.emit('quest:resolved', { result, patron, quest });
        }
    }

    getResolvedResults(): QuestResolutionResult[] {
        return [...this.resolvedResults];
    }

    // ── Inventory ───────────────────────────────────────────────────────

    /** Returns the inn's current item ledger as an array. */
    getInventory(): Array<{ name: string; quantity: number; rarity: number }> {
        return Array.from(this.innInventory.entries()).map(([name, data]) => ({
            name,
            quantity: data.quantity,
            rarity: data.rarity
        }));
    }

    // ── Stats ───────────────────────────────────────────────────────────

    getSummary(): {
        totalPatrons: number;
        idlePatrons: number;
        onQuestPatrons: number;
        totalQuests: number;
        postedQuests: number;
        acceptedQuests: number;
        completedQuests: number;
        failedQuests: number;
    } {
        const patrons = this.getAllPatrons();
        const quests = this.getAllQuests();
        return {
            totalPatrons: patrons.length,
            idlePatrons: patrons.filter(p => p.state === 'IDLE' || p.state === 'LOUNGING').length,
            onQuestPatrons: patrons.filter(p => p.state === 'ON_QUEST').length,
            totalQuests: quests.length,
            postedQuests: quests.filter(q => q.status === 'POSTED').length,
            acceptedQuests: quests.filter(q => q.status === 'ACCEPTED').length,
            completedQuests: quests.filter(q => q.status === 'COMPLETED').length,
            failedQuests: quests.filter(q => q.status === 'FAILED').length,
        };
    }

    /** Nuclear reset for testing. */
    reset(): void {
        this.patrons.clear();
        this.quests.clear();
        this.resolvedResults = [];
        this.innInventory.clear();
    }
}

/** Singleton game state. */
export const gameState = new GameState();
