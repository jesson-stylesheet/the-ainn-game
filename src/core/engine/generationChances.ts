/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Patron Generation Chances
 * ═══════════════════════════════════════════════════════════════════════
 * Probabilities derived from the race/job matrix CSV.
 * Defines the likelihood of a Race taking on a specific Job.
 */

export const RACES = [
    'human', 'elven', 'dwarven', 'lizardman', 'skeleton',
    'goblin', 'orc', 'kitsune', 'nekomimi'
] as const;

export type Race = typeof RACES[number];

export const JOBS = [
    'warrior', 'archer', 'miner', 'mechanic', 'necromancer',
    'wizard', 'berserker', 'cleric', 'geisha', 'bard', 'rogue', 'artisan'
] as const;

export type Job = typeof JOBS[number];

/**
 * Probability matrix mapping a Race to their likelihood (0.0 to 1.0) of
 * having a specific Job.
 */
export const CHANCES_MATRIX: Record<Race, Record<Job, number>> = {
    human: { warrior: 0.3, archer: 0.15, miner: 0.1, mechanic: 0.1, necromancer: 0, wizard: 0.05, berserker: 0, cleric: 0, geisha: 0, bard: 0.1, rogue: 0.1, artisan: 0.1 },
    elven: { warrior: 0, archer: 0.49, miner: 0, mechanic: 0, necromancer: 0, wizard: 0.2, berserker: 0, cleric: 0.2, geisha: 0, bard: 0.1, rogue: 0.01, artisan: 0 },
    dwarven: { warrior: 0.05, archer: 0.05, miner: 0.35, mechanic: 0.25, necromancer: 0, wizard: 0, berserker: 0.1, cleric: 0, geisha: 0, bard: 0.05, rogue: 0, artisan: 0.1 },
    lizardman: { warrior: 0.2, archer: 0.1, miner: 0, mechanic: 0.5, necromancer: 0.1, wizard: 0, berserker: 0, cleric: 0, geisha: 0, bard: 0, rogue: 0.1, artisan: 0 },
    skeleton: { warrior: 0.1, archer: 0.1, miner: 0.1, mechanic: 0.1, necromancer: 0.4, wizard: 0.1, berserker: 0.05, cleric: 0.05, geisha: 0, bard: 0, rogue: 0, artisan: 0 },
    goblin: { warrior: 0.2, archer: 0.2, miner: 0.2, mechanic: 0, necromancer: 0, wizard: 0.3, berserker: 0.1, cleric: 0, geisha: 0, bard: 0, rogue: 0, artisan: 0 },
    orc: { warrior: 0.3, archer: 0, miner: 0, mechanic: 0, necromancer: 0, wizard: 0, berserker: 0.6, cleric: 0, geisha: 0, bard: 0, rogue: 0, artisan: 0.1 },
    kitsune: { warrior: 0, archer: 0.1, miner: 0, mechanic: 0, necromancer: 0, wizard: 0.1, berserker: 0, cleric: 0.4, geisha: 0.2, bard: 0.15, rogue: 0, artisan: 0.05 },
    nekomimi: { warrior: 0, archer: 0, miner: 0, mechanic: 0.1, necromancer: 0.1, wizard: 0, berserker: 0, cleric: 0.2, geisha: 0.5, bard: 0.05, rogue: 0, artisan: 0.05 },
};

/**
 * Helper to capitalize the first letter of a string.
 */
export function capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}
