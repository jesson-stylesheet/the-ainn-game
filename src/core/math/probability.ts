/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Probability Engine
 * ═══════════════════════════════════════════════════════════════════════
 * Cold math. Sigmoid resolution. The LLM never touches this.
 *
 * P(Success) = 1 / (1 + Math.exp(-(S - D + γ * (Rd20 - 10.5)) / T))
 *
 * Where S is the patron's "coverage score" against the quest requirements.
 * The coverage score uses min(patron, req) to measure how well the
 * patron's skills match the quest's demands, keeping S in the same
 * numeric range as D for meaningful Sigmoid curves.
 */

import {
    type SkillTag,
    type SkillVector,
    type IPatron,
    type IQuest,
    type QuestResolutionResult,
    ALL_SKILL_TAGS,
    ItemCategory,
    IItem,
} from '../types/entity';
import { GAMMA, SIGMOID_TEMPERATURE } from '../constants';
import { rollD20 } from '../engine/utils';

// ── Coverage Score ──────────────────────────────────────────────────────

/**
 * Compute a patron's coverage score against a quest's requirements.
 *
 * For each overlapping skill, the patron earns min(patronSkill, questReq),
 * meaning they get full credit only if they meet or exceed the requirement.
 * This keeps the score in the same numeric range as quest difficulty (D).
 *
 * A patron with perfectly matching skills scores = sum of all quest reqs.
 * A patron with zero matching skills scores 0.
 */
export function computeCoverageScore(patronSkills: SkillVector, questReqs: SkillVector): number {
    let score = 0;
    for (const tag of ALL_SKILL_TAGS) {
        if (questReqs[tag] > 0) {
            score += Math.min(patronSkills[tag], questReqs[tag]);
        }
    }
    return score;
}

/**
 * Compute the raw multiplicative dot product (retained for analytics).
 */
export function computeDotProduct(patronSkills: SkillVector, questReqs: SkillVector): number {
    let sum = 0;
    for (const tag of ALL_SKILL_TAGS) {
        if (questReqs[tag] > 0 && patronSkills[tag] > 0) {
            sum += patronSkills[tag] * questReqs[tag];
        }
    }
    return sum;
}

// ── Equipment Synergy ───────────────────────────────────────────────────

/**
 * Computes the bonus score provided by the patron's currently equipped items.
 * Items provide a synergy bonus (rarity / 10) if the quest demands skills
 * loosely related to the equipment's category. Otherwise, combat gear provides
 * a minor flat bonus (rarity / 25) strictly for subjugation quests.
 */
export function computeEquipmentBonus(patron: IPatron, quest: IQuest): number {
    let bonus = 0;

    const synergyMap: Record<ItemCategory, SkillTag[]> = {
        meleeWeapon: ['MeleeWeapon', 'Bravery'],
        magicWeapon: ['BasicMagic', 'DarkMagic', 'HolyMagic'],
        rangeWeapon: ['LongRangeWeapon', 'Agility'],
        shield: ['Defense', 'Constitution'],
        lightHeadGear: ['Agility', 'Navigation'],
        lightBodyArmor: ['Agility', 'Navigation'],
        lightLegGear: ['Agility', 'Navigation'],
        lightFootGear: ['Agility', 'Navigation'],
        heavyHeadGear: ['Defense', 'Constitution'],
        heavyBodyArmor: ['Defense', 'Constitution'],
        heavyLegGear: ['Defense', 'Constitution'],
        heavyFootGear: ['Defense', 'Constitution'],
        questItem: [],
        consumables: [],
    };

    const isCombat = quest.type === 'subjugation';

    // Loop through equipped items
    for (const slot of Object.values(patron.equipment)) {
        if (!slot) continue;

        const item: IItem = slot;
        const mappedSkills = synergyMap[item.category] || [];

        // Quality multiplier: crafted items use their quality score,
        // found/retrieved items default to 50 (baseline).
        const effectiveQuality = item.quality ?? 50;
        let qualityMultiplier = 1.0;
        if (effectiveQuality >= 90) qualityMultiplier = 2.0;  // Masterwork
        else if (effectiveQuality >= 70) qualityMultiplier = 1.5;  // Exceptional
        else if (effectiveQuality < 30) qualityMultiplier = 0.5;  // Shoddy

        let hasSynergy = false;
        for (const skill of mappedSkills) {
            if (quest.requirements[skill] > 0) {
                hasSynergy = true;
                break;
            }
        }

        if (hasSynergy) {
            bonus += (item.rarity / 10) * qualityMultiplier;
        } else if (isCombat && mappedSkills.length > 0) {
            // Apply flat bonus if it's armor/weapon during combat, with no specific synergy
            bonus += (item.rarity / 25) * qualityMultiplier;
        }
    }

    return bonus;
}

// ── Weakness Extraction ─────────────────────────────────────────────────

/**
 * Identify the skill tags where the quest demands high skill
 * but the patron is weakest. Returns up to 3 tags, sorted by
 * descending "gap" (questReq - patronSkill).
 */
export function extractWeakestTags(
    patronSkills: SkillVector,
    questReqs: SkillVector,
    maxTags: number = 3
): SkillTag[] {
    const gaps: { tag: SkillTag; gap: number }[] = [];

    for (const tag of ALL_SKILL_TAGS) {
        if (questReqs[tag] > 0) {
            const gap = questReqs[tag] - patronSkills[tag];
            if (gap > 0) {
                gaps.push({ tag, gap });
            }
        }
    }

    // Sort by largest gap first (biggest weakness)
    gaps.sort((a, b) => b.gap - a.gap);

    return gaps.slice(0, maxTags).map(g => g.tag);
}

// ── Sigmoid Resolution ──────────────────────────────────────────────────

/**
 * Resolve a quest outcome using the Sigmoid probability function.
 *
 * The formula:
 *   P(Success) = 1 / (1 + e^(-(S - D + γ*(Rd20 - 10.5)) / T))
 *
 * Where:
 *   S    = coverage score (sum of min(patronSkill, questReq) for each skill)
 *   D    = quest difficulty scalar (10–50)
 *   γ    = chaos coefficient (1.50) — amplifies d20 influence
 *   T    = sigmoid temperature (≈4.84, derived) — flattens the curve
 *   Rd20 = random 1–20 roll
 *
 * When S = D: d20=20 → 95%, d20=1 → 5%, d20=10 → ~46%.
 * When S >> D, near certain success. When S << D, near certain failure.
 */
export function resolveQuest(patron: IPatron, quest: IQuest): QuestResolutionResult {
    let coverageScore = computeCoverageScore(patron.skills, quest.requirements);
    const equipmentBonus = computeEquipmentBonus(patron, quest);

    // Add equipment bonus to the coverage score before sigmoid
    coverageScore += equipmentBonus;

    const d20 = rollD20();
    const D = quest.difficultyScalar;

    // The Sigmoid
    const exponent = -(coverageScore - D + GAMMA * (d20 - 10.5)) / SIGMOID_TEMPERATURE;
    const probability = 1 / (1 + Math.exp(exponent));

    // Fate roll
    const rawRoll = Math.random();
    const success = rawRoll <= probability;

    // Extract tags that caused the highest negative impact
    const weakestTags = extractWeakestTags(patron.skills, quest.requirements);

    return {
        questId: quest.id,
        patronId: patron.id,
        success,
        probability,
        d20Roll: d20,
        dotProduct: coverageScore,  // Use coverage score as the primary metric
        weakestTags,
        rawRoll,
    };
}
