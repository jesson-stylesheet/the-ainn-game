/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Game State Manager
 * ═══════════════════════════════════════════════════════════════════════
 * In-memory state that serves as the working set. In production this
 * syncs to Supabase. For testing, it IS the source of truth.
 */

import type { IPatron, IQuest, QuestResolutionResult, PatronState, IItem, EquipmentSlot } from '../types/entity';
import { eventBus } from './eventBus';
import { generateUUID } from './utils';

class GameState {
    private patrons: Map<string, IPatron> = new Map();
    private quests: Map<string, IQuest> = new Map();
    private resolvedResults: QuestResolutionResult[] = [];
    private items: Map<string, IItem> = new Map();

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
        if (quest.postedByPatronId && quest.postedByPatronId === patronId) return false; // Can't do your own quest

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
                const newItem: IItem = {
                    id: generateUUID(),
                    name: quest.itemDetails.itemName,
                    category: quest.itemDetails.category,
                    rarity: quest.itemDetails.rarity,
                    quantity: quest.itemDetails.quantity,
                    ownerPatronId: null, // Goes straight to the Inn
                    equippedSlot: null
                };
                this.addItem(newItem);
            }
        }

        if (patron) {
            patron.state = result.success ? 'LOUNGING' : 'IDLE';
        }

        this.resolvedResults.push(result);

        if (quest && patron) {
            eventBus.emit('quest:resolved', { result, patron, quest });
            // Check if we hit the threshold for the Lore Guardian
            import('./loreGuardian').then(({ loreGuardian }) => loreGuardian.checkArrivalCondition())
                .catch(err => console.warn('⚠ Lore Guardian check failed:', (err as Error).message));
        }
    }

    getResolvedResults(): QuestResolutionResult[] {
        return [...this.resolvedResults];
    }

    // ── Items & Inventory ───────────────────────────────────────────────

    addItem(item: IItem): void {
        this.items.set(item.id, item);

        // If it belongs to a patron, sync their reference
        if (item.ownerPatronId) {
            const patron = this.patrons.get(item.ownerPatronId);
            if (patron) {
                if (item.equippedSlot) {
                    patron.equipment[item.equippedSlot] = item;
                } else {
                    patron.inventory.push(item);
                }
            }
        }
    }

    getItem(id: string): IItem | undefined {
        return this.items.get(id);
    }

    getAllItems(): IItem[] {
        return Array.from(this.items.values());
    }

    /** Returns the inn's own inventory (unassigned items). */
    getInnInventory(): IItem[] {
        return Array.from(this.items.values()).filter(i => !i.ownerPatronId);
    }

    /** Move an item from the inn to a patron's equipment slot. */
    equipItem(patronId: string, itemId: string, slot: EquipmentSlot): boolean {
        const item = this.items.get(itemId);
        const patron = this.patrons.get(patronId);

        if (!item || !patron) return false;

        // Ensure item isn't already equipped or owned by someone else
        if (item.ownerPatronId && item.ownerPatronId !== patronId) return false;

        // If something is already there, unequip it first
        if (patron.equipment[slot]) {
            this.unequipItem(patronId, slot);
        }

        // Remove from patron's inventory array if it was there
        if (item.ownerPatronId === patronId && !item.equippedSlot) {
            patron.inventory = patron.inventory.filter(i => i.id !== itemId);
        }

        item.ownerPatronId = patronId;
        item.equippedSlot = slot;
        patron.equipment[slot] = item;

        return true;
    }

    /** Unequip an item and return it to the Inn's inventory. */
    unequipItem(patronId: string, slot: EquipmentSlot): boolean {
        const patron = this.patrons.get(patronId);
        if (!patron) return false;

        const item = patron.equipment[slot];
        if (!item) return false;

        item.ownerPatronId = null;
        item.equippedSlot = null;
        patron.equipment[slot] = null;

        return true;
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
        this.items.clear();
    }
}

/** Singleton game state. */
export const gameState = new GameState();
