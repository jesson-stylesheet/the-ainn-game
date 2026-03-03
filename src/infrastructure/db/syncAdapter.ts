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
    private isHydrating = false;

    async hydrateGameState(): Promise<boolean> {
        const isDBEnabled = process.env.USE_DB === 'true';
        if (!isDBEnabled) return false;

        this.isHydrating = true;
        try {
            console.log('\n[DBSync] Hydrating game state from Supabase...');

            // 1. Inn State
            try {
                const innState = await db.fetchInnState();
                gameState.setInnState(innState);
            } catch (e) {
                console.warn(`[DBSync] No inn state found, defaulting. ${e}`);
            }

            // 2. Patrons
            const patrons = await db.fetchAllPatrons();
            for (const p of patrons) {
                // We use addPatron which emits the event, but we block the DB write
                gameState.addPatron(p);
            }

            // 3. Quests (Only active/posted ones needed for engine loop)
            const activeQuests = [
                ...(await db.fetchQuestsByStatus('POSTED')),
                ...(await db.fetchQuestsByStatus('ACCEPTED'))
            ];
            for (const q of activeQuests) {
                gameState.addQuest(q);
            }

            // 4. Items
            const items = await db.fetchAllItems();
            for (const item of items) {
                gameState.addItem(item);
            }

            console.log(`[DBSync] Hydration complete: ${patrons.length} patrons, ${activeQuests.length} quests, ${items.length} items.`);
            return true;
        } catch (e) {
            console.error('[DBSync] Hydration completely failed:', e);
            return false;
        } finally {
            this.isHydrating = false;
        }
    }

    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        const isDBEnabled = () => process.env.USE_DB === 'true' && !this.isHydrating; // Block outgoing sync if hydrating

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

        eventBus.on('quest:expired', async ({ quest }) => {
            if (!isDBEnabled()) return;
            try { await db.updateQuestStatus(quest.id, 'EXPIRED'); }
            catch (e) { console.error(`[DBSync] quest:expired failed:`, e); }
        });

        eventBus.on('quest:accepted', async ({ quest, patron }) => {
            if (!isDBEnabled()) return;
            try {
                await db.assignPatronToQuestAtomic(patron.id, quest.id);

                // If it was a crafting quest, we must also update the DB to reflect consumed items.
                if (quest.type === 'crafting' && quest.consumedItems) {
                    for (const req of quest.consumedItems) {
                        await db.consumeInnItemFromDB(req.itemName, req.quantity);
                    }
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

        // ── Inn State
        eventBus.on('inn:reputation_gained', async ({ total }) => {
            if (!isDBEnabled()) return;
            try { await db.updateInnState({ reputation: total }); }
            catch (e) { console.error(`[DBSync] inn:reputation_gained failed:`, e); }
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
