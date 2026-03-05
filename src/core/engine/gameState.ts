/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Game State Manager
 * ═══════════════════════════════════════════════════════════════════════
 * In-memory state that serves as the working set. In production this
 * syncs to Supabase. For testing, it IS the source of truth.
 */

import type { IPatron, IQuest, QuestResolutionResult, PatronState, IItem, ItemLocation, EquipmentSlot } from '../types/entity';
import { eventBus } from './eventBus';
import { generateUUID } from './utils';

class GameState {
    private patrons: Map<string, IPatron> = new Map();
    private quests: Map<string, IQuest> = new Map();
    private resolvedResults: QuestResolutionResult[] = [];
    private items: Map<string, IItem> = new Map();

    // ── Multi-Tenancy Identifiers ───────────────────────────────────────
    private _playerId: string = '';
    private _worldId: string = '';
    private _innId: string = '';

    get playerId(): string { return this._playerId; }
    get worldId(): string { return this._worldId; }
    get innId(): string { return this._innId; }

    setIdentifiers(playerId: string, worldId: string, innId: string) {
        this._playerId = playerId;
        this._worldId = worldId;
        this._innId = innId;
    }

    // ── Inn Global State ────────────────────────────────────────────────
    private _currentDay = 0;
    private _innGold = 100;
    private _innCopper = 0;
    private _reputation = 0;

    /**
 * The central brain holding the mutable state of the active Inn.
 * Legacy Note: Previously managed a real-time 'currentTick'. This was
 * migrated to a player-driven 'currentDay' cycle for better pacing.
 */
    get currentDay(): number { return this._currentDay; }
    get innGold(): number { return this._innGold; }
    get innCopper(): number { return this._innCopper; }
    get reputation(): number { return this._reputation; }

    /** Advance one in-game day. Called by DayEngine.advanceDay(). */
    incrementDay(): number {
        this._currentDay++;
        return this._currentDay;
    }

    setInnState(state: { currentDay?: number; gold?: number; copper?: number; reputation?: number }): void {
        if (state.currentDay !== undefined) this._currentDay = state.currentDay;
        if (state.gold !== undefined) this._innGold = state.gold;
        if (state.copper !== undefined) this._innCopper = state.copper;
        if (state.reputation !== undefined) this._reputation = state.reputation;
    }

    // ── Patrons ─────────────────────────────────────────────────────────

    addPatron(patron: IPatron): void {
        this.patrons.set(patron.id, patron);
        eventBus.emit('patron:arrived', { patron });
    }

    /**
     * Re-add a returning patron (from DEPARTED state) into active play.
     * Emits 'patron:returned' instead of 'patron:arrived' so the SyncAdapter
     * knows to UPDATE the existing DB row rather than INSERT a new one.
     */
    returnPatron(patron: IPatron): void {
        this.patrons.set(patron.id, patron);
        eventBus.emit('patron:returned', { patron });
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

    evictPatron(id: string, reason: string = 'Evicted by Innkeeper'): boolean {
        const patron = this.patrons.get(id);
        if (!patron) return false;

        // Cannot evict if they are on a quest
        if (patron.state === 'ON_QUEST') return false;

        // Unequip all gear before evicting
        for (const slotKey in patron.equipment) {
            const slot = slotKey as EquipmentSlot;
            if (patron.equipment[slot]) {
                this.unequipItem(id, slot);
            }
        }

        patron.state = 'DEPARTED';
        eventBus.emit('patron:departed', { patron, reason });
        this.patrons.delete(id);
        return true;
    }

    /**
     * Decrement daysRemaining for all patrons not currently questing or awaiting narrative.
     * Auto-evicts patrons whose stay has expired.
     * Called by DayEngine on each End of Day.
     */
    decrementPatronStays(): IPatron[] {
        const departed: IPatron[] = [];
        for (const patron of this.patrons.values()) {
            // Skip questing / awaiting patrons — their stay is paused
            if (patron.state === 'ON_QUEST' || patron.state === 'AWAITING_NARRATIVE') continue;
            // Skip already departed or dead
            if (patron.state === 'DEPARTED' || patron.state === 'DEAD') continue;

            patron.daysRemaining--;
            if (patron.daysRemaining <= 0) {
                departed.push({ ...patron }); // snapshot before eviction
                this.evictPatron(patron.id, 'Stay duration expired');
            }
        }
        return departed;
    }

    /** Returns the number of active (non-departed, non-dead) patrons currently in the inn or questing. */
    getActivePatronCount(): number {
        return Array.from(this.patrons.values())
            .filter(p => p.state !== 'DEPARTED' && p.state !== 'DEAD').length;
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
    assignPatronToQuest(patronId: string, questId: string): { ok: boolean; error?: string } {
        const patron = this.patrons.get(patronId);
        const quest = this.quests.get(questId);

        if (!patron) return { ok: false, error: 'Patron not found' };
        if (!quest) return { ok: false, error: 'Quest not found' };

        if (patron.state !== 'IDLE' && patron.state !== 'LOUNGING') {
            return { ok: false, error: `Patron is currently ${patron.state}` };
        }
        if (quest.status !== 'POSTED') {
            return { ok: false, error: `Quest is already ${quest.status}` };
        }
        if (quest.postedByPatronId && quest.postedByPatronId === patronId) {
            return { ok: false, error: 'Patron cannot accept their own quest' };
        }

        if (quest.type === 'crafting' && quest.consumedItems) {
            // First check if we have enough of all required materials
            const missing: string[] = [];
            for (const req of quest.consumedItems) {
                const total = this.getInnInventory()
                    .filter(i => i.name.toLowerCase() === req.itemName.toLowerCase())
                    .reduce((sum, i) => sum + i.quantity, 0);
                if (total < req.quantity) {
                    missing.push(`${req.quantity - total}x ${req.itemName}`);
                }
            }
            if (missing.length > 0) {
                return { ok: false, error: `Missing materials: ${missing.join(', ')}` };
            }
            // Then consume them permanently
            for (const req of quest.consumedItems) {
                this.consumeInnItem(req.itemName, req.quantity);
            }
        }

        patron.state = 'ON_QUEST';
        quest.assignedPatronId = patronId;
        quest.status = 'ACCEPTED';

        eventBus.emit('quest:accepted', { quest, patron });
        return { ok: true };
    }

    /**
     * Expire POSTED quests past their deadline (day-based).
     * Called by DayEngine on each End of Day.
     */
    expireQuestsByDay(currentDay: number): IQuest[] {
        const expired: IQuest[] = [];
        for (const q of this.quests.values()) {
            if (q.status === 'POSTED' && currentDay >= q.deadlineDays) {
                q.status = 'EXPIRED';
                expired.push(q);
                eventBus.emit('quest:expired', { quest: q });
            }
        }
        return expired;
    }

    // ── Resolution ──────────────────────────────────────────────────────

    /**
     * Decrement durationDays for all accepted quests by 1.
     * Returns the list of quests that have hit 0 and should resolve.
     * Called by DayEngine on each End of Day.
     * 
     * Legacy Note: Previously this decremented resolutionTicks on every tick().
     * Now it is called once daily by the DayEngine.
     */
    tickActiveQuestsByDay(): IQuest[] {
        const resolving: IQuest[] = [];
        for (const q of this.quests.values()) {
            if (q.status === 'ACCEPTED') {
                q.durationDays--;
                if (q.durationDays <= 0) {
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

            // Gain reputation on successful subjugation
            if (result.success && quest.type === 'subjugation') {
                const repGain = Math.max(1, Math.floor(quest.difficultyScalar / 5));
                this._reputation += repGain;
                eventBus.emit('inn:reputation_gained', { amount: repGain, total: this._reputation });
            }

            // Deposit extracted or crafted items into the Inn's ledger on success
            if (result.success && (quest.type === 'itemRetrieval' || quest.type === 'crafting') && quest.itemDetails) {
                const newItem: IItem = {
                    id: generateUUID(),
                    name: quest.itemDetails.itemName,
                    category: quest.itemDetails.category,
                    // Legacy Note: Was 'resolutionTicks'. Now 'durationDays'.
                    rarity: quest.itemDetails.rarity,
                    quantity: quest.itemDetails.quantity,
                    ownerPatronId: null,
                    equippedSlot: null,
                    location: 'INN_VAULT',
                    sourceQuestId: quest.id,
                    craftedByPatronId: quest.type === 'crafting' ? result.patronId : null,
                };
                this.addItem(newItem);
            }
        }

        if (patron) {
            patron.state = 'AWAITING_NARRATIVE'; // Locks the patron while background LLM decides their fate
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

        eventBus.emit('item:added', { item });
    }

    getItem(id: string): IItem | undefined {
        return this.items.get(id);
    }

    getAllItems(): IItem[] {
        return Array.from(this.items.values());
    }

    /** Returns the inn's own inventory (items in the vault). */
    getInnInventory(): IItem[] {
        return Array.from(this.items.values()).filter(i => i.location === 'INN_VAULT');
    }

    /** Permanently consumes an quantity of an item from the inn inventory. */
    consumeInnItem(name: string, quantity: number): boolean {
        const innItems = this.getInnInventory().filter(i => i.name.toLowerCase() === name.toLowerCase());
        let needed = quantity;
        for (const item of innItems) {
            if (needed <= 0) break;
            if (item.quantity <= needed) {
                needed -= item.quantity;
                this.items.delete(item.id);
            } else {
                item.quantity -= needed;
                needed = 0;
            }
        }
        return true;
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
        item.location = 'EQUIPPED';
        patron.equipment[slot] = item;

        eventBus.emit('item:equipped', { item, patronId, slot });

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
        item.location = 'INN_VAULT';
        patron.equipment[slot] = null;

        eventBus.emit('item:unequipped', { item, patronId, slot });

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
        const activePatrons = this.getAllPatrons().filter(p => p.state !== 'DEPARTED' && p.state !== 'DEAD');
        const quests = this.getAllQuests();
        return {
            totalPatrons: activePatrons.length,
            idlePatrons: activePatrons.filter(p => p.state === 'IDLE' || p.state === 'LOUNGING').length,
            onQuestPatrons: activePatrons.filter(p => p.state === 'ON_QUEST').length,
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
        this._currentDay = 0;
        this._innGold = 100;
        this._innCopper = 0;
        this._reputation = 0;
    }
}

/** Singleton game state. */
export const gameState = new GameState();
