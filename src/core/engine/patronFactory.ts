/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Patron Factory
 * ═══════════════════════════════════════════════════════════════════════
 * Deterministic archetype-based entity instantiation with bounded RNG
 * variance. Every patron is born from math, not narrative.
 */

import {
    type SkillTag,
    type SkillVector,
    type IPatron,
    type ArchetypeBlueprint,
    createEmptySkillVector,
    createEmptyEquipment,
} from '../types/entity';
import { MIN_STAT, MAX_STAT, STAT_VARIANCE } from '../constants';
import { generateUUID, rollInt, clamp } from './utils';

// ── Fantasy Name Pools ──────────────────────────────────────────────────

const NAME_PREFIXES: Record<string, string[]> = {
    'Human Warrior': ['Aldric', 'Bran', 'Cedric', 'Dorin', 'Elara', 'Fiora', 'Gareth', 'Helena'],
    'Elven Archer': ['Aelindra', 'Caelum', 'Faelith', 'Isilmë', 'Lúthien', 'Nimrodel', 'Thalion', 'Silvan'],
    'Dwarven Miner': ['Thorin', 'Balin', 'Durin', 'Gimrik', 'Kragg', 'Magni', 'Ulfgar', 'Brunhild'],
    'Lizardman Mechanic': ['Skrix', 'Zessik', 'Krath', 'Thazzik', 'Vrix', 'Ssariss', 'Nexik', 'Drazzit'],
    'Skeleton Necromancer': ['Morthos', 'Vesper', 'Nyx', 'Grimshaw', 'Cadaver', 'Ossian', 'Revenant', 'Dirge'],
    'Goblin Wizard': ['Snix', 'Blarg', 'Fizzwick', 'Grubnik', 'Narkle', 'Zibble', 'Kneecap', 'Sparky'],
    'Orc Berserker': ['Grokmar', 'Thudgut', 'Bonecrush', 'Skarrg', 'Urghash', 'Mogrul', 'Kragfist', 'Draaga'],
    'Kitsune Cleric': ['Inari', 'Sakuya', 'Tamamo', 'Kuzuha', 'Hoshimi', 'Ayame', 'Tsukiyo', 'Mikaze'],
    'Nekomimi Geisha': ['Mitsuki', 'Hanabi', 'Suzume', 'Kohana', 'Tsubaki', 'Shiori', 'Yukina', 'Aiko'],
};

const NAME_SUFFIXES = [
    'the Bold', 'the Wanderer', 'Ironside', 'Shadowstep',
    'Firebrand', 'the Quiet', 'Blackthorn', 'Stonehand',
    'Moonwhisper', 'the Cunning', 'Stormbreaker', 'the Lost',
];

// ── Archetype Blueprints ────────────────────────────────────────────────

const ARCHETYPES: ArchetypeBlueprint[] = [
    {
        name: 'Human Warrior',
        primarySkills: { MeleeWeapon: [14, 20], Defense: [14, 20], Constitution: [14, 20], Bravery: [14, 20] },
        secondarySkills: { Agility: [6, 12], Charisma: [6, 12], Navigation: [6, 12], Foraging: [6, 12] },
    },
    {
        name: 'Elven Archer',
        primarySkills: { Agility: [14, 20], LongRangeWeapon: [14, 20], Navigation: [14, 20], Foraging: [14, 20] },
        secondarySkills: { Curiosity: [6, 12], Constitution: [6, 12], Defense: [6, 12], BasicMagic: [6, 12] },
    },
    {
        name: 'Dwarven Miner',
        primarySkills: { Mining: [14, 20], Constitution: [14, 20], Bravery: [14, 20], Defense: [14, 20] },
        secondarySkills: { MeleeWeapon: [6, 12], Navigation: [6, 12], Charisma: [6, 12], Foraging: [6, 12] },
    },
    {
        name: 'Lizardman Mechanic',
        primarySkills: { Curiosity: [14, 20], Agility: [14, 20], Constitution: [14, 20], Defense: [14, 20], Crafting: [14, 20] },
        secondarySkills: { Foraging: [6, 12], Navigation: [6, 12], MeleeWeapon: [6, 12], BasicMagic: [6, 12] },
    },
    {
        name: 'Skeleton Necromancer',
        primarySkills: { DarkMagic: [14, 20], Constitution: [14, 20], Curiosity: [14, 20], BasicMagic: [14, 20] },
        secondarySkills: { Defense: [6, 12], Navigation: [6, 12], Foraging: [6, 12], Charisma: [6, 12], Alchemy: [6, 12] },
    },
    {
        name: 'Goblin Wizard',
        primarySkills: { BasicMagic: [14, 20], Curiosity: [14, 20], Agility: [14, 20], Foraging: [14, 20], Intelligent: [14, 20] },
        secondarySkills: { Navigation: [6, 12], Defense: [6, 12], Bravery: [6, 12], MeleeWeapon: [6, 12] },
    },
    {
        name: 'Orc Berserker',
        primarySkills: { MeleeWeapon: [14, 20], Bravery: [14, 20], Constitution: [14, 20], Defense: [14, 20] },
        secondarySkills: { Agility: [6, 12], Foraging: [6, 12], Navigation: [6, 12], Charisma: [6, 12] },
    },
    {
        name: 'Kitsune Cleric',
        primarySkills: { HolyMagic: [14, 20], Charisma: [14, 20], Agility: [14, 20], Curiosity: [14, 20] },
        secondarySkills: { BasicMagic: [6, 12], Navigation: [6, 12], Bravery: [6, 12], Defense: [6, 12], Dexterity: [6, 12] },
    },
    {
        name: 'Nekomimi Geisha',
        primarySkills: { Charisma: [14, 20], Agility: [14, 20], Curiosity: [14, 20], Cooking: [14, 20] },
        secondarySkills: { Navigation: [6, 12], BasicMagic: [6, 12], Bravery: [6, 12], Foraging: [6, 12], Defense: [6, 12], Dexterity: [6, 12] },
    },
];

// ── Public API ───────────────────────────────────────────────────────────

/** Returns all available archetype names. */
export function getArchetypeNames(): string[] {
    return ARCHETYPES.map(a => a.name);
}

/** Returns a random archetype blueprint. */
export function getRandomArchetype(): ArchetypeBlueprint {
    return ARCHETYPES[rollInt(0, ARCHETYPES.length - 1)];
}

/** Returns a specific archetype blueprint by name. */
export function getArchetypeByName(name: string): ArchetypeBlueprint | undefined {
    return ARCHETYPES.find(a => a.name === name);
}

/**
 * Generate a random patron name for a given archetype.
 */
function generatePatronName(archetype: string): string {
    const prefixes = NAME_PREFIXES[archetype] ?? ['Unknown'];
    const prefix = prefixes[rollInt(0, prefixes.length - 1)];
    const suffix = NAME_SUFFIXES[rollInt(0, NAME_SUFFIXES.length - 1)];
    return `${prefix} ${suffix}`;
}

/**
 * Build a SkillVector from an archetype blueprint.
 * Primary and Secondary skills get base rolls within their range.
 * All stats then receive [-2, +2] variance, clamped to [1, 20].
 * Omitted stats remain exactly 0.
 */
function buildSkillVector(blueprint: ArchetypeBlueprint): SkillVector {
    const vector = createEmptySkillVector();

    // Roll base primary stats
    for (const [tag, [min, max]] of Object.entries(blueprint.primarySkills)) {
        vector[tag as SkillTag] = rollInt(min, max);
    }

    // Roll base secondary stats
    for (const [tag, [min, max]] of Object.entries(blueprint.secondarySkills)) {
        vector[tag as SkillTag] = rollInt(min, max);
    }

    // Apply [-2, +2] RNG variance to all non-zero stats
    for (const tag of Object.keys(vector) as SkillTag[]) {
        if (vector[tag] > 0) {
            const variance = rollInt(STAT_VARIANCE[0], STAT_VARIANCE[1]);
            vector[tag] = clamp(vector[tag] + variance, MIN_STAT, MAX_STAT);
        }
    }

    return vector;
}

/**
 * Instantiate a new patron from a specific archetype.
 */
export function createPatron(archetypeName?: string): IPatron {
    const blueprint = archetypeName
        ? getArchetypeByName(archetypeName) ?? getRandomArchetype()
        : getRandomArchetype();

    return {
        id: generateUUID(),
        name: generatePatronName(blueprint.name),
        archetype: blueprint.name,
        skills: buildSkillVector(blueprint),
        state: 'IDLE',
        healthStatus: 'HEALTHY',
        arrivalTimestamp: Date.now(),
        equipment: createEmptyEquipment(),
        inventory: [],
    };
}

/**
 * Instantiate one patron of each archetype. Useful for testing.
 */
export function createOneOfEach(): IPatron[] {
    return ARCHETYPES.map(a => createPatron(a.name));
}
