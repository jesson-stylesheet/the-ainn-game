/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — LLM Response Types (Centralized)
 * ═══════════════════════════════════════════════════════════════════════
 * TypeScript interfaces that mirror the JSON Schema outputs.
 * Used to type the parsed LLM responses throughout the engine.
 */

import type { PatronHealthStatus, ItemCategory } from '../../../core/types/entity';

// ── Quest Resolution ────────────────────────────────────────────────────

export interface ResolutionNarrative {
    story: string;
    lore_entry: string;
    patron_health: PatronHealthStatus;
    injury_description: string;
}

// ── Quest Parse ─────────────────────────────────────────────────────────

export interface QuestParseResult {
    isLegitimate: boolean;
    rejectionReason: string;
    questType: 'diplomacy' | 'itemRetrieval' | 'subjugation' | 'crafting';
    skills: Record<string, number>;
    difficulty: number;
    resolutionTicks: number;
    itemDetails: {
        itemName: string;
        category: ItemCategory;
        quantity: number;
        rarity: number;
    } | null;
    reasoning: string;
}

// ── Item Deduplication ──────────────────────────────────────────────────

export interface ItemDedupResult {
    isMatch: boolean;
    canonicalName: string;
    reasoning: string;
}

// ── Lore Chronicle Guardian ─────────────────────────────────────────────

export interface GuardianQuestionResult {
    dialogue: string;
    questions: string[];
}
