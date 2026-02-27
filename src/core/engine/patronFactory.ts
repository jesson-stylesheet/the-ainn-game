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
        primarySkills: { MeleeWeapon: [10, 15], Defense: [10, 15], Constitution: [10, 15], Bravery: [10, 15] },
        secondarySkills: { Agility: [5, 9], Charisma: [5, 9], Navigation: [5, 9], Foraging: [5, 9] },
    },
    {
        name: 'Elven Archer',
        primarySkills: { Agility: [10, 15], LongRangeWeapon: [10, 15], Navigation: [10, 15], Foraging: [10, 15] },
        secondarySkills: { Curiosity: [5, 9], Constitution: [5, 9], Defense: [5, 9], BasicMagic: [5, 9] },
    },
    {
        name: 'Dwarven Miner',
        primarySkills: { Mining: [10, 15], Constitution: [10, 15], Bravery: [10, 15], Defense: [10, 15] },
        secondarySkills: { MeleeWeapon: [5, 9], Navigation: [5, 9], Charisma: [5, 9], Foraging: [5, 9] },
    },
    {
        name: 'Lizardman Mechanic',
        primarySkills: { Curiosity: [10, 15], Agility: [10, 15], Constitution: [10, 15], Defense: [10, 15] },
        secondarySkills: { Foraging: [5, 9], Navigation: [5, 9], MeleeWeapon: [5, 9], BasicMagic: [5, 9] },
    },
    {
        name: 'Skeleton Necromancer',
        primarySkills: { DarkMagic: [10, 15], Constitution: [10, 15], Curiosity: [10, 15], BasicMagic: [10, 15] },
        secondarySkills: { Defense: [5, 9], Navigation: [5, 9], Foraging: [5, 9], Charisma: [5, 9] },
    },
    {
        name: 'Goblin Wizard',
        primarySkills: { BasicMagic: [10, 15], Curiosity: [10, 15], Agility: [10, 15], Foraging: [10, 15] },
        secondarySkills: { Navigation: [5, 9], Defense: [5, 9], Bravery: [5, 9], MeleeWeapon: [5, 9] },
    },
    {
        name: 'Orc Berserker',
        primarySkills: { MeleeWeapon: [10, 15], Bravery: [10, 15], Constitution: [10, 15], Defense: [10, 15] },
        secondarySkills: { Agility: [5, 9], Foraging: [5, 9], Navigation: [5, 9], Charisma: [5, 9] },
    },
    {
        name: 'Kitsune Cleric',
        primarySkills: { HolyMagic: [10, 15], Charisma: [10, 15], Agility: [10, 15], Curiosity: [10, 15] },
        secondarySkills: { BasicMagic: [5, 9], Navigation: [5, 9], Bravery: [5, 9], Defense: [5, 9] },
    },
    {
        name: 'Nekomimi Geisha',
        primarySkills: { Charisma: [10, 15], Agility: [10, 15], Curiosity: [10, 15] },
        secondarySkills: { Navigation: [5, 9], BasicMagic: [5, 9], Bravery: [5, 9], Foraging: [5, 9], Defense: [5, 9] },
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
    };
}

/**
 * Instantiate one patron of each archetype. Useful for testing.
 */
export function createOneOfEach(): IPatron[] {
    return ARCHETYPES.map(a => createPatron(a.name));
}
