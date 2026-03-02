/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — DB Sync Adapter
 * ═══════════════════════════════════════════════════════════════════════
 * Listens to the EventBus and automatically fires Supabase queries to keep 
 * the database perfectly mirrored with the in-memory GameState.
 */

import { eventBus } from '../../core/engine/eventBus';
import * as db from './queries';
import { gameState } from '../../core/engine/gameState';

class DBSyncAdapter {
    private initialized = false;

    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        const isDBEnabled = () => process.env.USE_DB === 'true'; // Fallback toggle for server

        // ── Patrons
        eventBus.on('patron:arrived', async ({ patron }) => {
            if (!isDBEnabled()) return;
            try { await db.insertPatron(patron); }
            catch (e) { console.error(`[DBSync] patron:arrived failed:`, e); }
        });

        eventBus.on('patron:departed', async ({ patron }) => {
            if (!isDBEnabled()) return;
            try { await db.updatePatronState(patron.id, patron.state); }
            catch (e) { console.error(`[DBSync] patron:departed failed:`, e); }
        });

        // ── Quests
        eventBus.on('quest:posted', async ({ quest }) => {
            if (!isDBEnabled()) return;
            try {
                // Using 0 as a default verbosity score for background-posted quests
                await db.insertQuest(quest, 0);
            }
            catch (e) { console.error(`[DBSync] quest:posted failed:`, e); }
        });

        eventBus.on('quest:accepted', async ({ quest, patron }) => {
            if (!isDBEnabled()) return;
            try {
                await db.assignPatronToQuestAtomic(patron.id, quest.id);

                // If it was a crafting quest, we must also update the DB to reflect consumed items.
                if (quest.type === 'crafting' && quest.consumedItems) {
                    // Since GameState already deleted the consumed items from memory,
                    // we should ideally sync the exact item rows that were deleted.
                    // A simple way here is to just reload all inn vault items and reconcile,
                    // but for now, we'll assume the client/server will handle a full inventory refresh
                    // or we delete them explicitly here if we had their IDs.
                    // (The current queries.ts doesn't have a 'deleteItemsByNamesAndQuantities' function).
                }
            }
            catch (e) { console.error(`[DBSync] quest:accepted failed:`, e); }
        });

        // Items
        eventBus.on('item:added', async ({ item }) => {
            if (!isDBEnabled()) return;
            try { await db.insertItem(item); }
            catch (e) { console.error(`[DBSync] item:added failed:`, e); }
        });

        // ── Narrative / Resolution
        eventBus.on('narrative:completed', async (data) => {
            if (!isDBEnabled()) return;
            try {
                const quest = gameState.getQuest(data.questId);
                const patron = gameState.getPatron(data.patronId);

                // 1. Update Quest Status
                if (quest) {
                    // Find the resolution result in GameState
                    const result = gameState.getResolvedResults().find(r => r.questId === quest.id);
                    if (result) {
                        await db.updateQuestStatus(data.questId, quest.status, result);
                    }
                }

                // 2. Update Patron State & Health
                if (patron) {
                    await db.updatePatronState(patron.id, patron.state);
                    await db.updatePatronHealth(patron.id, patron.healthStatus);
                }

                // 3. Insert Lore
                await db.insertLoreEntry({
                    questId: data.questId,
                    originalText: quest ? quest.originalText : 'Unknown Quest Text',
                    outcome: data.success ? 'COMPLETED' : 'FAILED',
                    patronName: patron ? patron.name : 'Unknown',
                    patronArchetype: patron ? patron.archetype : 'Unknown',
                    narrativeSeed: data.loreEntry
                });

            } catch (e) {
                console.error(`[DBSync] narrative:completed failed:`, e);
            }
        });

        // ── Ticker & Engine
        eventBus.on('tick', async ({ simulatedTime }) => {
            if (!isDBEnabled()) return;
            try {
                // Periodically save the game clock tick (e.g. every 10 ticks to avoid DB spam)
                if (gameState.currentTick % 10 === 0) {
                    await db.tickGameClock(10);
                }
            } catch (e) {
                console.error(`[DBSync] tick failed:`, e);
            }
        });

        console.log('✅ DBSyncAdapter initialized');
    }
}

export const syncAdapter = new DBSyncAdapter();
