/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Entity DNA
 * ═══════════════════════════════════════════════════════════════════════
 * The 15-dimensional skill vector is the mathematical anchor of every
 * entity in the simulation. Missing skills default to 0. No exceptions.
 */

// ── Skill Tags ──────────────────────────────────────────────────────────

export type SkillTag =
    | 'Agility' | 'Bravery' | 'Charisma' | 'Curiosity' | 'Constitution'
    | 'Defense' | 'MeleeWeapon' | 'LongRangeWeapon' | 'Fishing'
    | 'Foraging' | 'Navigation' | 'BasicMagic' | 'DarkMagic'
    | 'HolyMagic' | 'Mining' | 'Crafting' | 'Intelligent'
    | 'Dexterity' | 'Alchemy' | 'Cooking';

/** Canonical ordered list of all skill tags. */
export const ALL_SKILL_TAGS: readonly SkillTag[] = [
    'Agility', 'Bravery', 'Charisma', 'Curiosity', 'Constitution',
    'Defense', 'MeleeWeapon', 'LongRangeWeapon', 'Fishing',
    'Foraging', 'Navigation', 'BasicMagic', 'DarkMagic',
    'HolyMagic', 'Mining', 'Crafting', 'Intelligent',
    'Dexterity', 'Alchemy', 'Cooking',
] as const;

// ── Skill Vector ────────────────────────────────────────────────────────

/** A strict record ensuring all 15 skills exist. Unassigned skills = 0. */
export type SkillVector = Record<SkillTag, number>;

/** Creates a zeroed-out SkillVector. */
export function createEmptySkillVector(): SkillVector {
    const vector = {} as SkillVector;
    for (const tag of ALL_SKILL_TAGS) {
        vector[tag] = 0;
    }
    return vector;
}

// ── Patron States ───────────────────────────────────────────────────────

export type PatronState = 'IDLE' | 'LOUNGING' | 'ON_QUEST' | 'DEPARTED' | 'DEAD';

// ── Patron Health ─────────────────────────────────────────────────────────

export type PatronHealthStatus = 'HEALTHY' | 'INJURED' | 'DEAD';

// ── Equipment & Items ───────────────────────────────────────────────────

export type ItemCategory =
    | 'questItem' | 'consumables' | 'meleeWeapon' | 'magicWeapon'
    | 'rangeWeapon' | 'shield' | 'lightHeadGear' | 'heavyHeadGear'
    | 'lightBodyArmor' | 'heavyBodyArmor' | 'lightLegGear' | 'heavyLegGear'
    | 'lightFootGear' | 'heavyFootGear';

export type EquipmentSlot =
    | 'headwear' | 'bodyArmor' | 'legwear' | 'footwear'
    | 'righthand' | 'lefthand';

export type ItemLocation = 'INN_VAULT' | 'PATRON_INVENTORY' | 'EQUIPPED' | 'LOST';

export interface IItem {
    id: string;              // UUID
    name: string;
    category: ItemCategory;
    rarity: number;          // 0.00 to 100.00
    quantity: number;
    ownerPatronId?: string | null;  // If owned by a patron
    equippedSlot?: EquipmentSlot | null; // If worn by the patron
    location: ItemLocation;  // Where this item currently lives
    sourceQuestId?: string | null; // Quest that produced this item
    craftedByPatronId?: string | null; // If crafted, who crafted it
}

export type PatronEquipment = Record<EquipmentSlot, IItem | null>;

/** Creates an empty equipment record for a new patron. */
export function createEmptyEquipment(): PatronEquipment {
    return {
        headwear: null,
        bodyArmor: null,
        legwear: null,
        footwear: null,
        righthand: null,
        lefthand: null,
    };
}

// ── IPatron ─────────────────────────────────────────────────────────────

export interface IPatron {
    id: string;                   // UUID
    name: string;
    archetype: string;
    skills: SkillVector;          // The mathematical anchor
    state: PatronState;
    healthStatus: PatronHealthStatus; // HEALTHY, INJURED, or DEAD
    arrivalTimestamp: number;     // Unix epoch (ms)

    equipment: PatronEquipment;   // Items currently worn/wielded
    inventory: IItem[];           // Items held but not equipped

    gold: number;                 // Patron's personal gold
    copper: number;               // Patron's personal copper (100 copper = 1 gold)

    // Future expansion slots (see Blueprint §9.2 — Vectorized Grudges)
    memoryIds?: string[];
    eventIds?: string[];
}

// ── Quest States & Types ────────────────────────────────────────────────

export type QuestStatus = 'POSTED' | 'ACCEPTED' | 'FAILED' | 'COMPLETED';

export type QuestType = 'diplomacy' | 'itemRetrieval' | 'subjugation' | 'crafting';

export interface IQuest {
    id: string;                   // UUID
    originalText: string;         // The raw player-posted quest text
    type: QuestType;              // The inferred category of the quest
    requirements: SkillVector;    // Extracted by LLM (or mock)
    difficultyScalar: number;     // D — generally 10–50
    resolutionTicks: number;      // Ticks to resolve (10=easy, 100=hard)
    assignedPatronId: string | null;
    postedByPatronId: string | null; // Patron who posted this quest (prevents self-assignment)
    status: QuestStatus;
    deadlineTimestamp: number;    // Unix epoch (ms)

    // Valid only if QuestType is 'itemRetrieval' or 'crafting'
    itemDetails?: {
        itemName: string;
        category: ItemCategory;
        quantity: number;
        rarity: number;           // 0.00 (common) to 100.00 (unique)
    };

    // Valid only if QuestType is 'crafting'
    consumedItems?: {
        itemName: string;
        quantity: number;
    }[];
}

// ── Quest Resolution Result ─────────────────────────────────────────────

export interface QuestResolutionResult {
    questId: string;
    patronId: string;
    success: boolean;
    probability: number;          // P(Success) from Sigmoid
    d20Roll: number;              // The chaos roll (1–20)
    dotProduct: number;           // Raw skill overlap score
    weakestTags: SkillTag[];      // Tags causing highest negative impact
    rawRoll: number;              // The Math.random() that decided fate
}

// ── Archetype Definition ────────────────────────────────────────────────

export interface ArchetypeBlueprint {
    name: string;
    primarySkills: Partial<Record<SkillTag, [number, number]>>;   // [min, max] ranges
    secondarySkills: Partial<Record<SkillTag, [number, number]>>; // [min, max] ranges
}
