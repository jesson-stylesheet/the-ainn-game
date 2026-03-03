/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Utility Functions
 * ═══════════════════════════════════════════════════════════════════════
 * Pure helpers, zero side effects, zero imports from infrastructure.
 */

import { randomBytes } from 'crypto';

/** Generate a v4 UUID without external dependencies. */
export function generateUUID(): string {
    const bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;  // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80;  // variant 1
    const hex = bytes.toString('hex');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-');
}

/**
 * Roll a random integer within [min, max] (inclusive).
 * Uses crypto.randomBytes for better distribution.
 */
export function rollInt(min: number, max: number): number {
    const range = max - min + 1;
    const bytes = randomBytes(4);
    const value = bytes.readUInt32BE(0);
    return min + (value % range);
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Standard d20 roll: random integer [1, 20].
 */
export function rollD20(): number {
    return rollInt(1, 20);
}

/**
 * Calculates the required skill budget for a quest based on the Inn's reputation.
 * At 0 reputation, returns a budget bounds around 10-15.
 * At 200+ reputation (approximate cap), returns bounds around 40-50.
 */
export function getSkillBudgetForReputation(reputation: number): { minBudget: number; maxBudget: number; targetBudget: number } {
    const scale = Math.min(1.0, Math.max(0, reputation / 200));
    const minBudget = Math.round(10 + scale * 30); // 10 to 40
    const maxBudget = Math.round(15 + scale * 35); // 15 to 50
    const targetBudget = Math.round((minBudget + maxBudget) / 2); // 13 to 45
    return { minBudget, maxBudget, targetBudget };
}
