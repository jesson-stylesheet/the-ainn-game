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
import { generateUUID } from '../../core/engine/utils';
import async from 'async';

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

            // 5. Lore
            try {
                const loreRows = await db.fetchAllLoreEntries();
                const loreEntries = loreRows.map(row => ({
                    timestamp: new Date(row.created_at).getTime(),
                    questId: row.quest_id,
                    originalText: row.original_text,
                    outcome: row.outcome as any,
                    patronName: row.patron_name,
                    patronArchetype: row.patron_archetype,
                    loreText: row.lore_text,
                    storyText: row.story_text,
                }));
                import('../../core/engine/loreChronicle').then(({ loreChronicle }) => {
                    loreChronicle.hydrate(loreEntries);
                });
                console.log(`[DBSync] Lore hydrated: ${loreEntries.length} entries.`);
            } catch (e) {
                console.warn(`[DBSync] Failed to hydrate lore: ${e}`);
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

    private dbQueue = async.queue(async (task: () => Promise<void>) => {
        try {
            await task();
        } catch (e: any) {
            console.error(`[DBSync] Task failed in queue:`, e.message);
        }
    }, 1);

    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        const isDBEnabled = () => process.env.USE_DB === 'true' && !this.isHydrating; // Block outgoing sync if hydrating

        // ── Patrons
        eventBus.on('patron:arrived', ({ patron }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                await db.insertPatron(patron);
            });
            // Pre-register every patron in the World Codex so the lore system can find them
            // by their canonical name, preventing epithet variants ("Old Man Aldric") from
            // being mistakenly registered as new characters.
            this.dbQueue.push(async () => {
                try {
                    await db.insertCodexCharacter({
                        id: generateUUID(),
                        name: patron.name,
                        description: `A ${patron.archetype} who frequents The AInn. An adventurer available to take on quests and contribute to the saga of the realm.`,
                        characterType: 'patron',
                        patronId: patron.id,
                    });
                } catch (e) {
                    // Non-fatal — codex registration is best-effort
                    console.warn(`[DBSync] Failed to pre-register patron "${patron.name}" in codex:`, e);
                }
            });
        });

        eventBus.on('patron:departed', ({ patron }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                await db.updatePatronState(patron.id, patron.state);
            });
        });

        // ── Quests
        eventBus.on('quest:posted', ({ quest }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                // Using 0 as a default verbosity score for background-posted quests
                await db.insertQuest(quest, 0);
            });
        });

        eventBus.on('quest:expired', ({ quest }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                await db.updateQuestStatus(quest.id, 'EXPIRED');
            });
        });

        eventBus.on('quest:accepted', ({ quest, patron }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                await db.assignPatronToQuestAtomic(patron.id, quest.id);

                // If it was a crafting quest, we must also update the DB to reflect consumed items.
                if (quest.type === 'crafting' && quest.consumedItems) {
                    for (const req of quest.consumedItems) {
                        try {
                            await db.consumeInnItemFromDB(req.itemName, req.quantity);
                        } catch (e) {
                            console.error(`[DBSync] consumeInnItemFromDB failed in queue:`, e);
                        }
                    }
                }
            });
        });

        // Items
        eventBus.on('item:added', ({ item }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                await db.insertItem(item);
            });
        });

        eventBus.on('item:equipped', ({ item, patronId, slot }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                await db.updateItemLocation(item.id, patronId, slot as any, 'EQUIPPED');
            });
        });

        eventBus.on('item:unequipped', ({ item }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                await db.updateItemLocation(item.id, null, null, 'INN_VAULT');
            });
        });

        // ── Inn State
        eventBus.on('inn:reputation_gained', ({ total }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                await db.updateInnState({ reputation: total });
            });
        });

        // ── Narrative / Resolution
        eventBus.on('narrative:completed', (data) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
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
                        patronId: data.patronId,
                        originalText: quest ? quest.originalText : 'Unknown Quest Text',
                        outcome: data.success ? 'COMPLETED' : 'FAILED',
                        patronName: patron ? patron.name : 'Unknown',
                        patronArchetype: patron ? patron.archetype : 'Unknown',
                        loreText: data.loreEntry,
                        storyText: data.story
                    });
                    console.log(`[DBSync] Lore entry saved for quest: ${data.questId}`);
                } catch (e) {
                    console.error(`[DBSync] narrative:completed failed in queue:`, e);
                }
            });
        });

        // ── Lore Guardian Synthesis
        eventBus.on('lore:synthesis_finalized', ({ synthesisText, questionsAndAnswersText }) => {
            if (!isDBEnabled()) return;
            this.dbQueue.push(async () => {
                try {
                    // 1. Wipe ALL lore entries for this world — every inn in the world is cleared.
                    await db.deleteAllLoreEntriesByWorld();
                    // 2. Insert the synthesis as the single canonical seed entry.
                    await db.insertLoreEntry({
                        questId: null,
                        originalText: questionsAndAnswersText,
                        outcome: 'SYNTHESIS',
                        patronName: 'The Chronicle Guardian',
                        patronArchetype: 'Celestial Observer',
                        loreText: synthesisText,
                        storyText: 'The Guardian weaves the threads of fate.',
                    });
                    console.log('[DBSync] World lore replaced with Guardian synthesis.');
                } catch (e) {
                    console.error('[DBSync] lore:synthesis_finalized failed in queue:', e);
                }
            });
        });

        // ── Ticker & Engine
        eventBus.on('tick', ({ simulatedTime }) => {
            if (!isDBEnabled()) return;
            // Periodically save the game clock tick (e.g. every 10 ticks to avoid DB spam)
            if (gameState.currentTick % 10 === 0) {
                this.dbQueue.push(async () => {
                    await db.tickGameClock(10);
                });
            }
        });

        console.log('✅ DBSyncAdapter initialized');
    }
}

export const syncAdapter = new DBSyncAdapter();
