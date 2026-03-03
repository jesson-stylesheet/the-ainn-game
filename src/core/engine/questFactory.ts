/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Quest Factory (Mock LLM Parser)
 * ═══════════════════════════════════════════════════════════════════════
 * THE VERBOSITY SCALING MECHANIC:
 *
 * Player input IS the quest. The more lore/narrative the player writes,
 * the more skill tags are extracted — but each tag gets a LOWER value.
 * Conversely, a terse/direct quest like "fish 2 salmon in the river"
 * produces fewer tags (Fishing, Navigation) but at HIGHER values.
 *
 *   Verbose quest → many tags × low values  → wider patron coverage
 *   Terse quest   → few tags × high values  → narrow, harder to match
 *
 * This incentivizes worldbuilding: rich lore posts create quests that
 * more patrons CAN attempt, while blunt commands create specialist jobs.
 *
 * In production, the LLM determines the tags. This mock uses keywords.
 * ═══════════════════════════════════════════════════════════════════════
 */

import {
    type SkillTag,
    type IQuest,
    ALL_SKILL_TAGS,
    createEmptySkillVector,
} from '../types/entity';
import { DEFAULT_QUEST_DEADLINE_HOURS, TICK_MULTIPLIER } from '../constants';
import { generateUUID, rollInt } from './utils';
import { ticker } from './ticker';

// ── Verbosity Constants ─────────────────────────────────────────────────

/**
 * Minimum value any active tag can have after verbosity scaling.
 * Prevents tags from becoming meaningless noise.
 */
const MIN_TAG_VALUE = 2;

/**
 * Maximum value a tag can have when the quest is very terse.
 * Prevents a 1-tag quest from requiring an impossible skill level.
 */
const MAX_TAG_VALUE = 20;

/**
 * Words that count as "lore filler" — they add atmosphere but
 * don't directly map to skills. Each one slightly nudges verbosity up.
 */
const LORE_WORDS = new Set([
    'the', 'a', 'an', 'of', 'in', 'at', 'to', 'from', 'by', 'with',
    'and', 'or', 'but', 'for', 'on', 'into', 'upon', 'through',
    'ancient', 'legendary', 'mysterious', 'forgotten', 'cursed',
    'enchanted', 'sacred', 'hidden', 'lost', 'haunted', 'abandoned',
    'ruined', 'crumbling', 'shadowy', 'twilight', 'whispered',
    'once', 'long', 'ago', 'legend', 'tale', 'story', 'myth',
    'prophecy', 'rumor', 'whisper', 'they', 'say', 'that', 'who',
    'where', 'when', 'was', 'were', 'has', 'had', 'been', 'is',
    'it', 'its', 'their', 'there', 'this', 'those', 'these',
    'beneath', 'above', 'between', 'beyond', 'across', 'within',
    'without', 'before', 'after', 'during', 'since', 'until',
    'while', 'deep', 'far', 'near', 'old', 'young', 'great',
    'small', 'many', 'few', 'some', 'all', 'every', 'each',
]);

// ── Keyword → Skill Mapping ─────────────────────────────────────────────
// Weights here are RELATIVE priorities within a keyword's tags.
// The actual final values are determined by the verbosity scaler.

const KEYWORD_MAP: Record<string, { tag: SkillTag; priority: number }[]> = {
    // Combat
    'fight': [{ tag: 'MeleeWeapon', priority: 3 }, { tag: 'Bravery', priority: 2 }, { tag: 'Defense', priority: 1 }],
    'slay': [{ tag: 'MeleeWeapon', priority: 3 }, { tag: 'Bravery', priority: 2 }, { tag: 'Constitution', priority: 1 }],
    'battle': [{ tag: 'MeleeWeapon', priority: 3 }, { tag: 'Defense', priority: 2 }, { tag: 'Bravery', priority: 2 }],
    'kill': [{ tag: 'MeleeWeapon', priority: 3 }, { tag: 'Bravery', priority: 2 }],
    'defend': [{ tag: 'Defense', priority: 3 }, { tag: 'Constitution', priority: 2 }, { tag: 'Bravery', priority: 1 }],
    'protect': [{ tag: 'Defense', priority: 3 }, { tag: 'Bravery', priority: 2 }, { tag: 'Constitution', priority: 1 }],
    'attack': [{ tag: 'MeleeWeapon', priority: 3 }, { tag: 'Agility', priority: 1 }],
    'sword': [{ tag: 'MeleeWeapon', priority: 2 }],
    'shield': [{ tag: 'Defense', priority: 2 }],

    // Ranged
    'shoot': [{ tag: 'LongRangeWeapon', priority: 3 }, { tag: 'Agility', priority: 1 }],
    'snipe': [{ tag: 'LongRangeWeapon', priority: 3 }, { tag: 'Agility', priority: 2 }],
    'hunt': [{ tag: 'LongRangeWeapon', priority: 2 }, { tag: 'Navigation', priority: 2 }, { tag: 'Foraging', priority: 1 }],
    'bow': [{ tag: 'LongRangeWeapon', priority: 2 }],
    'arrow': [{ tag: 'LongRangeWeapon', priority: 2 }],

    // Exploration
    'explore': [{ tag: 'Navigation', priority: 3 }, { tag: 'Curiosity', priority: 2 }, { tag: 'Agility', priority: 1 }],
    'scout': [{ tag: 'Navigation', priority: 2 }, { tag: 'Agility', priority: 2 }, { tag: 'Curiosity', priority: 1 }],
    'find': [{ tag: 'Navigation', priority: 2 }, { tag: 'Curiosity', priority: 2 }],
    'search': [{ tag: 'Curiosity', priority: 2 }, { tag: 'Navigation', priority: 2 }],
    'track': [{ tag: 'Navigation', priority: 3 }, { tag: 'Foraging', priority: 1 }],
    'navigate': [{ tag: 'Navigation', priority: 3 }],
    'travel': [{ tag: 'Navigation', priority: 2 }, { tag: 'Constitution', priority: 1 }],

    // Gathering
    'mine': [{ tag: 'Mining', priority: 3 }, { tag: 'Constitution', priority: 2 }],
    'dig': [{ tag: 'Mining', priority: 3 }, { tag: 'Constitution', priority: 1 }],
    'ore': [{ tag: 'Mining', priority: 2 }],
    'gem': [{ tag: 'Mining', priority: 2 }, { tag: 'Curiosity', priority: 1 }],
    'forage': [{ tag: 'Foraging', priority: 3 }, { tag: 'Navigation', priority: 1 }],
    'gather': [{ tag: 'Foraging', priority: 2 }, { tag: 'Navigation', priority: 1 }],
    'herb': [{ tag: 'Foraging', priority: 3 }, { tag: 'BasicMagic', priority: 1 }],
    'fish': [{ tag: 'Fishing', priority: 3 }, { tag: 'Constitution', priority: 1 }],
    'salmon': [{ tag: 'Fishing', priority: 2 }],
    'catch': [{ tag: 'Fishing', priority: 2 }, { tag: 'Agility', priority: 1 }],
    'river': [{ tag: 'Navigation', priority: 1 }, { tag: 'Fishing', priority: 1 }],

    // Magic
    'magic': [{ tag: 'BasicMagic', priority: 3 }],
    'spell': [{ tag: 'BasicMagic', priority: 3 }, { tag: 'Curiosity', priority: 1 }],
    'enchant': [{ tag: 'BasicMagic', priority: 3 }, { tag: 'Curiosity', priority: 2 }],
    'curse': [{ tag: 'DarkMagic', priority: 3 }, { tag: 'Curiosity', priority: 1 }],
    'dark': [{ tag: 'DarkMagic', priority: 2 }],
    'undead': [{ tag: 'DarkMagic', priority: 3 }, { tag: 'Bravery', priority: 1 }],
    'necro': [{ tag: 'DarkMagic', priority: 3 }],
    'skeleton': [{ tag: 'DarkMagic', priority: 2 }],
    'heal': [{ tag: 'HolyMagic', priority: 3 }, { tag: 'Charisma', priority: 1 }],
    'bless': [{ tag: 'HolyMagic', priority: 3 }, { tag: 'Charisma', priority: 1 }],
    'holy': [{ tag: 'HolyMagic', priority: 3 }],
    'purify': [{ tag: 'HolyMagic', priority: 3 }, { tag: 'BasicMagic', priority: 1 }],
    'pray': [{ tag: 'HolyMagic', priority: 2 }, { tag: 'Charisma', priority: 1 }],

    // Social
    'charm': [{ tag: 'Charisma', priority: 3 }, { tag: 'Curiosity', priority: 1 }],
    'negotiate': [{ tag: 'Charisma', priority: 3 }, { tag: 'Curiosity', priority: 2 }],
    'persuade': [{ tag: 'Charisma', priority: 3 }],
    'talk': [{ tag: 'Charisma', priority: 2 }],
    'diplomat': [{ tag: 'Charisma', priority: 3 }, { tag: 'Curiosity', priority: 1 }],
    'entertain': [{ tag: 'Charisma', priority: 3 }, { tag: 'Agility', priority: 1 }],

    // Survival & Movement
    'survive': [{ tag: 'Constitution', priority: 3 }, { tag: 'Foraging', priority: 2 }],
    'endure': [{ tag: 'Constitution', priority: 3 }],
    'climb': [{ tag: 'Agility', priority: 3 }, { tag: 'Constitution', priority: 1 }],
    'sneak': [{ tag: 'Agility', priority: 3 }, { tag: 'Curiosity', priority: 1 }],
    'stealth': [{ tag: 'Agility', priority: 3 }, { tag: 'Curiosity', priority: 1 }],
    'dodge': [{ tag: 'Agility', priority: 3 }],
    'run': [{ tag: 'Agility', priority: 2 }, { tag: 'Constitution', priority: 1 }],
    'brave': [{ tag: 'Bravery', priority: 3 }],
    'courage': [{ tag: 'Bravery', priority: 3 }],

    // Creatures & Locations (add tags via lore context)
    'dragon': [{ tag: 'Bravery', priority: 2 }, { tag: 'Defense', priority: 2 }, { tag: 'MeleeWeapon', priority: 2 }],
    'demon': [{ tag: 'DarkMagic', priority: 2 }, { tag: 'Bravery', priority: 2 }, { tag: 'HolyMagic', priority: 2 }],
    'cave': [{ tag: 'Mining', priority: 1 }, { tag: 'Navigation', priority: 2 }, { tag: 'Bravery', priority: 1 }],
    'forest': [{ tag: 'Navigation', priority: 2 }, { tag: 'Foraging', priority: 2 }],
    'mountain': [{ tag: 'Constitution', priority: 2 }, { tag: 'Navigation', priority: 2 }, { tag: 'Mining', priority: 1 }],
    'dungeon': [{ tag: 'Bravery', priority: 2 }, { tag: 'Navigation', priority: 2 }, { tag: 'Defense', priority: 1 }],
    'swamp': [{ tag: 'Constitution', priority: 2 }, { tag: 'Navigation', priority: 2 }, { tag: 'Foraging', priority: 1 }],
    'village': [{ tag: 'Charisma', priority: 1 }, { tag: 'Navigation', priority: 1 }],
    'temple': [{ tag: 'HolyMagic', priority: 2 }, { tag: 'Curiosity', priority: 1 }],
    'tavern': [{ tag: 'Charisma', priority: 2 }],
    'castle': [{ tag: 'Bravery', priority: 1 }, { tag: 'Defense', priority: 1 }, { tag: 'Navigation', priority: 1 }],

    // Crafting
    'craft': [{ tag: 'Crafting', priority: 3 }, { tag: 'Intelligent', priority: 1 }],
    'build': [{ tag: 'Crafting', priority: 3 }, { tag: 'Constitution', priority: 1 }],
    'forge': [{ tag: 'Crafting', priority: 3 }, { tag: 'Mining', priority: 1 }],
    'repair': [{ tag: 'Crafting', priority: 3 }, { tag: 'Dexterity', priority: 1 }],

    // Intelligent
    'read': [{ tag: 'Intelligent', priority: 3 }, { tag: 'Curiosity', priority: 2 }],
    'study': [{ tag: 'Intelligent', priority: 3 }, { tag: 'Curiosity', priority: 1 }],
    'solve': [{ tag: 'Intelligent', priority: 3 }],
    'decipher': [{ tag: 'Intelligent', priority: 3 }, { tag: 'BasicMagic', priority: 1 }],
    'investigate': [{ tag: 'Intelligent', priority: 3 }, { tag: 'Curiosity', priority: 2 }],

    // Dexterity
    'pick': [{ tag: 'Dexterity', priority: 3 }, { tag: 'Agility', priority: 1 }],
    'steal': [{ tag: 'Dexterity', priority: 3 }, { tag: 'Agility', priority: 2 }],
    'lock': [{ tag: 'Dexterity', priority: 3 }, { tag: 'Intelligent', priority: 1 }],
    'disarm': [{ tag: 'Dexterity', priority: 3 }, { tag: 'Intelligent', priority: 1 }],
    'trap': [{ tag: 'Dexterity', priority: 2 }, { tag: 'Navigation', priority: 1 }],

    // Alchemy
    'brew': [{ tag: 'Alchemy', priority: 3 }, { tag: 'Cooking', priority: 1 }],
    'potion': [{ tag: 'Alchemy', priority: 3 }, { tag: 'BasicMagic', priority: 1 }],
    'poison': [{ tag: 'Alchemy', priority: 3 }, { tag: 'Foraging', priority: 1 }],
    'transmute': [{ tag: 'Alchemy', priority: 3 }, { tag: 'BasicMagic', priority: 2 }],

    // Cooking
    'cook': [{ tag: 'Cooking', priority: 3 }, { tag: 'Foraging', priority: 1 }],
    'bake': [{ tag: 'Cooking', priority: 3 }],
    'stew': [{ tag: 'Cooking', priority: 3 }, { tag: 'Foraging', priority: 1 }],
    'chef': [{ tag: 'Cooking', priority: 3 }, { tag: 'Charisma', priority: 1 }],
};

// ── Difficulty Words ────────────────────────────────────────────────────

const DIFFICULTY_MODIFIERS: Record<string, number> = {
    'easy': -8, 'simple': -6, 'minor': -4, 'small': -4,
    'moderate': 0, 'standard': 0,
    'hard': 6, 'difficult': 8, 'dangerous': 10,
    'deadly': 14, 'legendary': 18, 'impossible': 22,
    'dragon': 12, 'demon': 10,
};

// ── Verbosity Analysis ──────────────────────────────────────────────────

export interface VerbosityAnalysis {
    wordCount: number;
    loreWordCount: number;
    keywordHits: number;
    uniqueActiveTags: number;
    verbosityScore: number;      // 0.0 (terse) → 1.0 (extremely verbose)
    scalingFactor: number;       // Multiplier applied to tag values
}

/**
 * Measure how "verbose" a quest post is.
 *
 * Verbosity is determined by:
 *   - Total word count (more words = more verbose)
 *   - Ratio of lore/filler words to keyword hits
 *   - Number of unique skill tags activated
 *
 * Returns a score from 0.0 (maximally terse) to 1.0 (maximally verbose).
 */
function analyzeVerbosity(words: string[], keywordHits: number, uniqueTags: number): VerbosityAnalysis {
    const wordCount = words.length;
    const loreWordCount = words.filter(w => LORE_WORDS.has(w)).length;

    // Verbosity signal 1: Word count (diminishing returns via log)
    // 3 words = very terse, 15+ words = verbose, 30+ = very verbose
    const wordSignal = Math.min(1.0, Math.log2(Math.max(1, wordCount)) / Math.log2(30));

    // Verbosity signal 2: Lore density (non-keyword words as % of total)
    const loreDensity = wordCount > 0 ? loreWordCount / wordCount : 0;

    // Verbosity signal 3: Tag spread (more unique tags = more verbose intent)
    const tagSpreadSignal = Math.min(1.0, uniqueTags / 8);

    // Composite: weighted blend
    const verbosityScore = Math.min(1.0,
        wordSignal * 0.4 +
        loreDensity * 0.3 +
        tagSpreadSignal * 0.3
    );

    // Scaling factor: inverted verbosity
    // Terse (verbosity ~ 0) → scalingFactor near 1.0 (tags get full/high values)
    // Verbose (verbosity ~ 1) → scalingFactor near 0.3 (tags get low values)
    const scalingFactor = 1.0 - (verbosityScore * 0.7);

    return {
        wordCount,
        loreWordCount,
        keywordHits,
        uniqueActiveTags: uniqueTags,
        verbosityScore,
        scalingFactor,
    };
}

import { getSkillBudgetForReputation } from './utils';

// ── Parser ──────────────────────────────────────────────────────────────

/**
 * Parse player-posted quest text into an IQuest.
 *
 * THE CORE MECHANIC:
 *   "fish 2 salmon in the river"
 *     → 2 tags (Fishing, Navigation) at HIGH values (~14-15 each)
 *     → Needs a specialist. Hard to fill. Focused.
 *
 *   "Deep beneath the ancient emerald forest, where the river of
 *    whispered sorrows meets the forgotten temple, the village elders
 *    seek a brave soul to fish the legendary golden salmon..."
 *     → 6+ tags (Fishing, Navigation, Bravery, Curiosity, HolyMagic, Charisma)
 *     → Each at LOW values (~4-6 each)
 *     → Many patrons could attempt it. Rich worldbuilding = wider accessibility.
 *
 * This is the mock LLM. In production, the LLM will determine the tags
 * using the same verbosity→value inverse scaling principle.
 */
export function parseQuestText(text: string, innReputation: number = 0): IQuest {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);

    // Step 1: Collect raw priority scores for each tag from keyword hits
    const rawPriorities: Partial<Record<SkillTag, number>> = {};
    let keywordHits = 0;

    for (const word of words) {
        const mappings = KEYWORD_MAP[word];
        if (mappings) {
            keywordHits++;
            for (const { tag, priority } of mappings) {
                rawPriorities[tag] = (rawPriorities[tag] ?? 0) + priority;
            }
        }
    }

    // Count unique active tags
    const activeTags = Object.keys(rawPriorities) as SkillTag[];
    const uniqueTagCount = activeTags.length;

    // Fallback: if no keywords matched, generic fetch quest
    if (uniqueTagCount === 0) {
        rawPriorities['Navigation'] = 3;
        rawPriorities['Constitution'] = 2;
        activeTags.push('Navigation', 'Constitution');
    }

    // Step 2: Analyze verbosity
    const verbosity = analyzeVerbosity(words, keywordHits, activeTags.length);

    // Step 3: Distribute the skill budget across active tags,
    //         scaled inversely by verbosity.
    //
    // High verbosity → many tags at low values (budget spread thin)
    // Low verbosity  → few tags at high values (budget concentrated)
    const { targetBudget } = getSkillBudgetForReputation(innReputation);
    const vector = createEmptySkillVector();
    const totalPriority = Object.values(rawPriorities).reduce((s, v) => s + (v ?? 0), 0);

    if (totalPriority > 0) {
        for (const tag of activeTags) {
            const priority = rawPriorities[tag] ?? 0;
            const share = priority / totalPriority; // Proportional share of budget

            // Base value from dynamic budget share
            let value = Math.round(targetBudget * share);

            // Apply verbosity scaling:
            // Terse quests amplify values, verbose quests compress them
            value = Math.round(value * (1 / verbosity.scalingFactor));

            // But total budget is fixed, so re-scale based on tag count:
            // Fewer tags = each tag gets more of the budget
            // More tags = each tag gets less
            const tagCountScalar = Math.max(0.4, 2.0 / Math.max(1, activeTags.length));
            value = Math.round(value * tagCountScalar);

            // Clamp
            value = Math.max(MIN_TAG_VALUE, Math.min(MAX_TAG_VALUE, value));

            vector[tag] = value;
        }
    }

    // Step 4: Calculate difficulty scalar
    let baseDifficulty = 20;
    for (const word of words) {
        if (DIFFICULTY_MODIFIERS[word] !== undefined) {
            baseDifficulty += DIFFICULTY_MODIFIERS[word];
        }
    }
    const rawDifficulty = Math.max(10, Math.min(50, baseDifficulty + rollInt(-3, 3)));

    // Calibrate: cap difficulty to 85% of total requirements sum
    // so a perfect-match patron has a realistic chance (S ≈ totalReqs > D)
    const totalReqSum = ALL_SKILL_TAGS.reduce((s, tag) => s + vector[tag], 0);
    const difficultyScalar = totalReqSum > 0
        ? Math.max(10, Math.min(rawDifficulty, Math.round(totalReqSum * 0.85)))
        : rawDifficulty;

    const now = ticker.simulatedTime;

    return {
        id: generateUUID(),
        originalText: text,
        type: 'subjugation', // Mock parser assumes subjugation
        requirements: vector,
        difficultyScalar,
        resolutionTicks: Math.floor(difficultyScalar * 2), // Mock mapping (10 D = 20 ticks, 50 D = 100 ticks)
        assignedPatronId: null,
        postedByPatronId: null,
        status: 'POSTED',
        deadlineTimestamp: now + (DEFAULT_QUEST_DEADLINE_HOURS * TICK_MULTIPLIER * 1000),
    };
}

/**
 * Utility: analyze a quest text and return the verbosity breakdown
 * without creating a full quest. Useful for debugging/TUI display.
 */
export function analyzeQuestVerbosity(text: string): VerbosityAnalysis {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 0);

    const rawPriorities: Partial<Record<SkillTag, number>> = {};
    let keywordHits = 0;

    for (const word of words) {
        const mappings = KEYWORD_MAP[word];
        if (mappings) {
            keywordHits++;
            for (const { tag, priority } of mappings) {
                rawPriorities[tag] = (rawPriorities[tag] ?? 0) + priority;
            }
        }
    }

    const uniqueTags = (Object.keys(rawPriorities) as SkillTag[]).length;
    return analyzeVerbosity(words, keywordHits, uniqueTags);
}
