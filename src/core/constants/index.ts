/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Constants
 * ═══════════════════════════════════════════════════════════════════════
 * All magic numbers live here. Nowhere else. Ever.
 */

/** 1 real second = 1 in-game hour */
export const TICK_MULTIPLIER = 3600;

/** Milliseconds between ticks (1 second) */
export const TICK_INTERVAL_MS = 1000;

/** The Chaos Coefficient — amplifies the d20 roll's influence on quest outcomes. */
export const GAMMA = 0.2;

/** Minimum stat value for any non-omitted skill after RNG variance. */
export const MIN_STAT = 1;

/** Maximum stat value for any skill. */
export const MAX_STAT = 20;

/** RNG variance applied to patron base stats on instantiation. */
export const STAT_VARIANCE: [number, number] = [-2, 2];

/** Default quest deadline in in-game hours from posting. */
export const DEFAULT_QUEST_DEADLINE_HOURS = 24;

/**
 * Economy: Use strict integers for all currency.
 * 1 Gold = 100 Copper. No floats. Ever. (Blueprint §9.3)
 */
export const COPPER_PER_GOLD = 100;
