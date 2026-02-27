/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Probability Engine
 * ═══════════════════════════════════════════════════════════════════════
 * Cold math. Sigmoid resolution. The LLM never touches this.
 *
 * P(Success) = 1 / (1 + Math.exp(-(S - D + γ * (Rd20 - 10.5))))
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
} from '../types/entity';
import { GAMMA } from '../constants';
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
            gaps.push({ tag, gap });
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
 *   P(Success) = 1 / (1 + e^(-(S - D + γ*(Rd20 - 10.5))))
 *
 * Where:
 *   S  = coverage score (sum of min(patronSkill, questReq) for each skill)
 *   D  = quest difficulty scalar (10–50)
 *   γ  = chaos coefficient (0.2)
 *   Rd20 = random 1–20 roll
 *
 * When S ≈ D, probability is ~50%. When S >> D, near certain success.
 * When S << D, near certain failure.
 */
export function resolveQuest(patron: IPatron, quest: IQuest): QuestResolutionResult {
    const coverageScore = computeCoverageScore(patron.skills, quest.requirements);
    const d20 = rollD20();
    const D = quest.difficultyScalar;

    // The Sigmoid
    const exponent = -(coverageScore - D + GAMMA * (d20 - 10.5));
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
