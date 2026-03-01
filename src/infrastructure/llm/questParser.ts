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
const VALID_QUEST_TYPES: QuestType[] = ['diplomacy', 'itemRetrieval', 'subjugation', 'crafting'];

/**
 * Parse quest text using the LLM via OpenRouter with structured output.
 * Falls back to mock parser on failure.
 */
export async function parseQuestWithLLM(text: string): Promise<IQuest> {
    try {
        const response = await parseQuestStructured(text);

        // ── Legitimacy Check ───────────────────────────────────────────
        if (response.isLegitimate === false) {
            throw new Error(`LEGITIMACY_REJECTED:${response.rejectionReason}`);
        }

        // Build the skill vector from structured response
        const vector = createEmptySkillVector();
        let validTagCount = 0;

        if (response.skills && typeof response.skills === 'object') {
            for (const tag of ALL_SKILL_TAGS) {
                const value = response.skills[tag];
                if (typeof value === 'number' && value > 0) {
                    vector[tag] = Math.max(1, Math.min(20, Math.round(value)));
                    validTagCount++;
                }
            }
        }

        // Fallback if LLM returned no valid tags
        if (validTagCount === 0) {
            console.warn('⚠ LLM returned no valid tags, rejecting quest');
            throw new Error('LEGITIMACY_REJECTED:This text does not appear to describe a valid quest requiring any skills.');
        }

        // Validate quest type
        const questType: QuestType = VALID_QUEST_TYPES.includes(response.questType)
            ? response.questType
            : 'subjugation';

        // Calculate difficulty — for itemRetrieval, rarity scales it
        let difficulty = typeof response.difficulty === 'number'
            ? Math.max(10, Math.min(50, Math.round(response.difficulty)))
            : 20;

        // ── Difficulty Calibration ─────────────────────────────────────
        // The sigmoid formula uses S - D, where S (coverage score) is
        // bounded by the sum of quest requirements. If D exceeds that
        // sum, even a perfect patron can never succeed. We cap D to
        // 85% of total reqs so a perfect match yields P ≈ 70-90%.
        const totalReqSum = ALL_SKILL_TAGS.reduce((sum, tag) => sum + vector[tag], 0);
        if (totalReqSum > 0) {
            difficulty = Math.min(difficulty, Math.round(totalReqSum * 0.85));
            difficulty = Math.max(10, difficulty); // Floor stays at 10
        }

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
            postedByPatronId: null,
            status: 'POSTED',
            deadlineTimestamp: now + (DEFAULT_QUEST_DEADLINE_HOURS * TICK_MULTIPLIER * 1000),
            ...(itemDetails ? { itemDetails } : {}),
        };
    } catch (error) {
        console.warn(`⚠ LLM quest parsing failed:`, (error as Error).message);
        throw error;
    }
}

export { mockParseQuestText as parseQuestOffline };
