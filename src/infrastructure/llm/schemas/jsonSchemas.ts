/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — LLM JSON Schemas (Centralized)
 * ═══════════════════════════════════════════════════════════════════════
 * All structured output schemas live here. These are sent to
 * OpenRouter to enforce type-safe JSON responses from the LLM.
 */

import { ALL_SKILL_TAGS } from '../../../core/types/entity';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Build JSON Schema properties for the skill vector from the canonical tag list. */
function buildSkillProperties(): Record<string, { type: string }> {
    const props: Record<string, { type: string }> = {};
    for (const tag of ALL_SKILL_TAGS) {
        props[tag] = { type: 'number' };
    }
    return props;
}

// ── Quest Resolution Schema ────────────────────────────────────────────

export const RESOLUTION_SCHEMA = {
    name: 'quest_resolution_narrative',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            story: {
                type: 'string',
                description: 'A short story (max 200 words) of the quest outcome from a grizzled innkeeper perspective.',
            },
            lore_entry: {
                type: 'string',
                description: 'A 2-3 sentence chronicle entry. Written like an ancient logbook.',
            },
            patron_health: {
                type: 'string',
                enum: ['HEALTHY', 'INJURED', 'DEAD'],
                description: 'Patron health after the quest. DEAD should be extremely rare (<5%).',
            },
            injury_description: {
                type: 'string',
                description: 'If INJURED or DEAD, describe the wound or cause of death. Empty if HEALTHY.',
            },
        },
        required: ['story', 'lore_entry', 'patron_health', 'injury_description'],
        additionalProperties: false,
    },
};

// ── Quest Parse Schema ─────────────────────────────────────────────────

export const QUEST_PARSE_SCHEMA = {
    name: 'quest_parse',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            questType: {
                type: 'string',
                description: 'The narrative category of the quest.',
                enum: ['diplomacy', 'itemRetrieval', 'subjugation', 'escort'],
            },
            skills: {
                type: 'object',
                description: 'Skill requirements. Keys are exact SkillTag names, values are integers 1-20.',
                properties: buildSkillProperties(),
                required: [...ALL_SKILL_TAGS],
                additionalProperties: false,
            },
            difficulty: {
                type: 'number',
                description: 'Difficulty scalar from 10 to 50 based on the danger described. If questType is itemRetrieval and the item is very rare, scale this difficulty up proportionally (e.g. 99.00 rarity -> 40+ difficulty).',
            },
            resolutionTicks: {
                type: 'number',
                description: 'The time required to resolve the quest in game ticks, based on the description and difficulty. Easy tasks take 10 ticks. Hard tasks take up to 100 ticks. Intermediate tasks scale accordingly.',
            },
            itemDetails: {
                type: ['object', 'null'],
                description: 'ONLY populated if questType is itemRetrieval. Otherwise null.',
                properties: {
                    itemName: { type: 'string', description: 'The specific name of the item being retrieved.' },
                    category: {
                        type: 'string',
                        description: 'What category does this item fall into?',
                        enum: ['questItem', 'consumables', 'meleeWeapon', 'magicWeapon', 'rangeWeapon', 'shield', 'lightHeadGear', 'heavyHeadGear', 'lightBodyArmor', 'heavyBodyArmor', 'lightLegGear', 'heavyLegGear', 'lightFootGear', 'heavyFootGear']
                    },
                    quantity: { type: 'number', description: 'The integer amount requested.' },
                    rarity: { type: 'number', description: 'A float from 0.00 (abundant/common dirt) to 100.00 (unique, legendary artifact).' }
                },
                required: ['itemName', 'category', 'quantity', 'rarity'],
                additionalProperties: false,
            },
            reasoning: {
                type: 'string',
                description: 'Brief explanation of tag choices and verbosity assessment.',
            },
        },
        required: ['questType', 'skills', 'difficulty', 'resolutionTicks', 'itemDetails', 'reasoning'],
        additionalProperties: false,
    },
};

// ── Item Deduplication Schema ──────────────────────────────────────────

export const ITEM_DEDUP_SCHEMA = {
    name: 'item_dedup_check',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            isMatch: {
                type: 'boolean',
                description: 'True if the new item matches an existing item in the inventory.',
            },
            canonicalName: {
                type: 'string',
                description: 'If isMatch is true, the EXACT existing item name from the inventory list. If false, the new item name as-is.',
            },
            reasoning: {
                type: 'string',
                description: 'Brief explanation of why the items are or are not the same.',
            },
        },
        required: ['isMatch', 'canonicalName', 'reasoning'],
        additionalProperties: false,
    },
};

// ── Lore Chronicle Guardian Schema ──────────────────────────────────────

export const GUARDIAN_QUESTION_SCHEMA = {
    name: 'guardian_questions',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            dialogue: {
                type: 'string',
                description: 'The Guardian\'s greeting and initial observation of the recent lore.',
            },
            questions: {
                type: 'array',
                description: 'Exactly 3 questions for the Innkeeper to connect the lore threads.',
                items: { type: 'string' },
                minItems: 3,
                maxItems: 3,
            },
        },
        required: ['dialogue', 'questions'],
        additionalProperties: false,
    },
};
