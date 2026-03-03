/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Narrative Worker
 * ═══════════════════════════════════════════════════════════════════════
 * Listens for quest resolutions and spins up asynchronous LLM calls
 * to generate story, lore, and determine final patron health without
 * blocking the main physics tick loop.
 */

import { eventBus } from './eventBus';
import { renderResolution } from '../../infrastructure/llm/narrativeRenderer';
import { loreChronicle } from './loreChronicle';
import { gameState } from './gameState';

class NarrativeWorker {
    private initialized = false;

    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        eventBus.on('quest:resolved', async ({ result, patron, quest }) => {
            console.log(`[NarrativeWorker] Received quest:resolved for ${quest.id} (${result.success ? 'SUCCESS' : 'FAILED'})`);
            try {
                // Call the LLM to render the story, lore, and health impact
                console.log(`[NarrativeWorker] Calling LLM renderResolution...`);
                const resolution = await renderResolution(result, patron, quest);
                console.log(`[NarrativeWorker] Received LLM response for ${quest.id}`);

                // Apply consequences to the in-memory state
                const actualPatron = gameState.getPatron(patron.id);
                if (actualPatron) {
                    actualPatron.healthStatus = resolution.patron_health;
                    if (resolution.patron_health === 'DEAD') {
                        actualPatron.state = 'DEAD';
                    } else {
                        // Release from AWAITING_NARRATIVE
                        actualPatron.state = result.success ? 'LOUNGING' : 'IDLE';
                    }
                }

                // Append lore memory
                loreChronicle.recordResolution(quest, patron, result, resolution.lore_entry, resolution.story);

                // Notify the rest of the engine (e.g., Sync Adapter, WebSockets)
                eventBus.emit('narrative:completed', {
                    questId: quest.id,
                    patronId: patron.id,
                    success: result.success,
                    story: resolution.story,
                    loreEntry: resolution.lore_entry,
                    patronHealth: resolution.patron_health,
                    injuryDescription: resolution.injury_description,
                });

            } catch (error) {
                console.error(`[NarrativeWorker] Error processing quest:resolved for ${quest.id}:`, error);
            }
        });

        console.log('✅ NarrativeWorker initialized');
    }
}

export const narrativeWorker = new NarrativeWorker();
