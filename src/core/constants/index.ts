/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Constants
 * ═══════════════════════════════════════════════════════════════════════
 * All magic numbers live here. Nowhere else. Ever.
 */

/** The Chaos Coefficient — amplifies the d20 roll's influence on quest outcomes. */
export const GAMMA = 1.50;

/**
 * Sigmoid Temperature — controls the steepness of the probability curve.
 * Derived from GAMMA so that when S = D (even match):
 *   d20 = 20 → P = 95%  (nat 20 nearly guarantees success)
 *   d20 = 1  → P = 5%   (nat 1 nearly guarantees failure)
 *   d20 = 10 → P ≈ 46%  (average roll, coin flip territory)
 *
 * The math: P(d20=20) = 0.95 requires γ*9.5/T = ln(19), so T = 9.5γ/ln(19).
 *
 * Current value ≈ 4.84.
 *   S=30 D=33 d20=7  → ~15%    (slightly under-qualified, bad roll)
 *   S=30 D=33 d20=12 → ~46%    (slightly under-qualified, decent roll)
 *   S >> D     d20=any → >98%   (perfect match, always succeeds)
 */
export const SIGMOID_TEMPERATURE = (9.5 * GAMMA) / Math.log(19);

/** Minimum stat value for any non-omitted skill after RNG variance. */
export const MIN_STAT = 1;

/** Maximum stat value for any skill. */
export const MAX_STAT = 20;

/** RNG variance applied to patron base stats on instantiation. */
export const STAT_VARIANCE: [number, number] = [-2, 2];

/**
 * How many in-game days a POSTED quest stays on the board before expiring
 * if no patron accepts it. Innkeeper should check quests every day.
 */
export const DEFAULT_QUEST_DEADLINE_DAYS = 3;

/**
 * Economy: Use strict integers for all currency.
 * 1 Gold = 100 Copper. No floats. Ever. (Blueprint §9.3)
 */
export const COPPER_PER_GOLD = 100;
