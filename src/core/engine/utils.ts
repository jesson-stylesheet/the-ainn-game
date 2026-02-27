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
