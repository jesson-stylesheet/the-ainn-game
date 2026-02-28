/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — LLM Quest Parser (Structured Outputs)
 * ═══════════════════════════════════════════════════════════════════════
 * Parses player-posted quest text using LLM with JSON Schema validation.
 * Falls back to mock keyword parser if LLM is unavailable.
 */

import { parseQuestStructured, deduplicateItemName } from './narrativeRenderer';
import {
    type SkillTag,
    type IQuest,
    type QuestType,
    ALL_SKILL_TAGS,
    createEmptySkillVector,
} from '../../core/types/entity';
import { DEFAULT_QUEST_DEADLINE_HOURS, TICK_MULTIPLIER } from '../../core/constants';
import { generateUUID } from '../../core/engine/utils';
import { parseQuestText as mockParseQuestText } from '../../core/engine/questFactory';
import { gameState } from '../../core/engine/gameState';

// Valid quest types for validation
const VALID_QUEST_TYPES: QuestType[] = ['diplomacy', 'itemRetrieval', 'subjugation', 'escort'];

/**
 * Parse quest text using the LLM via OpenRouter with structured output.
 * Falls back to mock parser on failure.
 */
export async function parseQuestWithLLM(text: string): Promise<IQuest> {
    try {
        const response = await parseQuestStructured(text);

        // Build the skill vector from structured response
        const vector = createEmptySkillVector();
        let validTagCount = 0;

        if (response.skills && typeof response.skills === 'object') {
            for (const tag of ALL_SKILL_TAGS) {
                const value = response.skills[tag];
                if (typeof value === 'number' && value > 0) {
                    vector[tag] = Math.max(1, Math.min(18, Math.round(value)));
                    validTagCount++;
                }
            }
        }

        // Fallback if LLM returned no valid tags
        if (validTagCount === 0) {
            console.warn('⚠ LLM returned no valid tags, falling back to mock parser');
            return mockParseQuestText(text);
        }

        // Validate quest type
        const questType: QuestType = VALID_QUEST_TYPES.includes(response.questType)
            ? response.questType
            : 'subjugation';

        // Calculate difficulty — for itemRetrieval, rarity scales it
        let difficulty = typeof response.difficulty === 'number'
            ? Math.max(10, Math.min(50, Math.round(response.difficulty)))
            : 20;

        // Build item details if applicable
        let itemDetails: IQuest['itemDetails'] = undefined;
        if (questType === 'itemRetrieval' && response.itemDetails) {
            const rarity = Math.max(0, Math.min(100, response.itemDetails.rarity ?? 0));
            const quantity = Math.max(1, Math.round(response.itemDetails.quantity ?? 1));
            let itemName = response.itemDetails.itemName || 'unknown item';
            const category = response.itemDetails.category || 'questItem';

            // ── Item Deduplication ──────────────────────────────────────
            // Check existing inventory for semantic duplicates
            const existingItems = gameState.getInnInventory().map(i => i.name);
            const dedup = await deduplicateItemName(itemName, existingItems);
            if (dedup.wasDeduped) {
                console.log(`  🔗 Dedup: "${itemName}" → "${dedup.canonicalName}" (${dedup.reasoning})`);
            }
            itemName = dedup.canonicalName;

            itemDetails = { itemName, category, quantity, rarity };

            // Rarity-scaled difficulty boost (the LLM should already do this,
            // but we enforce a mathematical floor as safety net)
            const rarityFloor = 10 + Math.round(rarity * 0.35); // 0→10, 100→45
            difficulty = Math.max(difficulty, rarityFloor);
            difficulty = Math.min(50, difficulty);
        }

        const now = Date.now();

        return {
            id: generateUUID(),
            originalText: text,
            type: questType,
            requirements: vector,
            difficultyScalar: difficulty,
            resolutionTicks: Math.max(10, Math.round(response.resolutionTicks ?? 20)),
            assignedPatronId: null,
            status: 'POSTED',
            deadlineTimestamp: now + (DEFAULT_QUEST_DEADLINE_HOURS * TICK_MULTIPLIER * 1000),
            ...(itemDetails ? { itemDetails } : {}),
        };
    } catch (error) {
        console.warn(`⚠ LLM quest parsing failed, using mock:`, (error as Error).message);
        return mockParseQuestText(text);
    }
}

export { mockParseQuestText as parseQuestOffline };
