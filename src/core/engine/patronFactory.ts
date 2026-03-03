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
import { RACES, JOBS, CHANCES_MATRIX, capitalize, type Race, type Job } from './generationChances';
import { ticker } from './ticker';

// ── Fantasy Name Pools ──────────────────────────────────────────────────

const NAME_PREFIXES: Record<Race, string[]> = {
    human: ['Aldric', 'Bran', 'Cedric', 'Dorin', 'Elara', 'Fiora', 'Gareth', 'Helena'],
    elven: ['Aelindra', 'Caelum', 'Faelith', 'Isilmë', 'Lúthien', 'Nimrodel', 'Thalion', 'Silvan'],
    dwarven: ['Thorin', 'Balin', 'Durin', 'Gimrik', 'Kragg', 'Magni', 'Ulfgar', 'Brunhild'],
    lizardman: ['Skrix', 'Zessik', 'Krath', 'Thazzik', 'Vrix', 'Ssariss', 'Nexik', 'Drazzit'],
    skeleton: ['Morthos', 'Vesper', 'Nyx', 'Grimshaw', 'Cadaver', 'Ossian', 'Revenant', 'Dirge'],
    goblin: ['Snix', 'Blarg', 'Fizzwick', 'Grubnik', 'Narkle', 'Zibble', 'Kneecap', 'Sparky'],
    orc: ['Grokmar', 'Thudgut', 'Bonecrush', 'Skarrg', 'Urghash', 'Mogrul', 'Kragfist', 'Draaga'],
    kitsune: ['Inari', 'Sakuya', 'Tamamo', 'Kuzuha', 'Hoshimi', 'Ayame', 'Tsukiyo', 'Mikaze'],
    nekomimi: ['Mitsuki', 'Hanabi', 'Suzume', 'Kohana', 'Tsubaki', 'Shiori', 'Yukina', 'Aiko'],
};

const NAME_SUFFIXES = [
    'the Bold', 'the Wanderer', 'Ironside', 'Shadowstep',
    'Firebrand', 'the Quiet', 'Blackthorn', 'Stonehand',
    'Moonwhisper', 'the Cunning', 'Stormbreaker', 'the Lost',
];

// ── Job Blueprints ──────────────────────────────────────────────────────

const JOB_BLUEPRINTS: Record<Job, ArchetypeBlueprint> = {
    warrior: {
        name: 'Warrior',
        primarySkills: { MeleeWeapon: [14, 20], Defense: [14, 20], Constitution: [14, 20], Bravery: [14, 20] },
        secondarySkills: { Agility: [6, 12], Charisma: [6, 12], Navigation: [6, 12], Foraging: [6, 12] },
    },
    archer: {
        name: 'Archer',
        primarySkills: { Agility: [14, 20], LongRangeWeapon: [14, 20], Navigation: [14, 20], Foraging: [14, 20] },
        secondarySkills: { Curiosity: [6, 12], Constitution: [6, 12], Defense: [6, 12], BasicMagic: [6, 12] },
    },
    miner: {
        name: 'Miner',
        primarySkills: { Mining: [14, 20], Constitution: [14, 20], Bravery: [14, 20], Defense: [14, 20] },
        secondarySkills: { MeleeWeapon: [6, 12], Navigation: [6, 12], Charisma: [6, 12], Foraging: [6, 12] },
    },
    mechanic: {
        name: 'Mechanic',
        primarySkills: { Curiosity: [14, 20], Agility: [14, 20], Constitution: [14, 20], Defense: [14, 20], Crafting: [14, 20] },
        secondarySkills: { Foraging: [6, 12], Navigation: [6, 12], MeleeWeapon: [6, 12], BasicMagic: [6, 12] },
    },
    necromancer: {
        name: 'Necromancer',
        primarySkills: { DarkMagic: [14, 20], Constitution: [14, 20], Curiosity: [14, 20], BasicMagic: [14, 20] },
        secondarySkills: { Defense: [6, 12], Navigation: [6, 12], Foraging: [6, 12], Charisma: [6, 12], Alchemy: [6, 12] },
    },
    wizard: {
        name: 'Wizard',
        primarySkills: { BasicMagic: [14, 20], Curiosity: [14, 20], Agility: [14, 20], Foraging: [14, 20], Intelligent: [14, 20] },
        secondarySkills: { Navigation: [6, 12], Defense: [6, 12], Bravery: [6, 12], MeleeWeapon: [6, 12] },
    },
    berserker: {
        name: 'Berserker',
        primarySkills: { MeleeWeapon: [14, 20], Bravery: [14, 20], Constitution: [14, 20], Defense: [14, 20] },
        secondarySkills: { Agility: [6, 12], Foraging: [6, 12], Navigation: [6, 12], Charisma: [6, 12] },
    },
    cleric: {
        name: 'Cleric',
        primarySkills: { HolyMagic: [14, 20], Charisma: [14, 20], Agility: [14, 20], Curiosity: [14, 20] },
        secondarySkills: { BasicMagic: [6, 12], Navigation: [6, 12], Bravery: [6, 12], Defense: [6, 12], Dexterity: [6, 12] },
    },
    geisha: {
        name: 'Geisha',
        primarySkills: { Charisma: [14, 20], Agility: [14, 20], Curiosity: [14, 20], Cooking: [14, 20] },
        secondarySkills: { Navigation: [6, 12], BasicMagic: [6, 12], Bravery: [6, 12], Foraging: [6, 12], Defense: [6, 12], Dexterity: [6, 12] },
    },
    bard: {
        name: 'Bard',
        primarySkills: { Charisma: [14, 20], Dexterity: [14, 20] },
        secondarySkills: { Navigation: [6, 12], BasicMagic: [6, 12], Constitution: [6, 12] },
    },
    rogue: {
        name: 'Rogue',
        primarySkills: { Dexterity: [14, 20], Agility: [14, 20] },
        secondarySkills: { MeleeWeapon: [6, 12], Curiosity: [6, 12], Foraging: [6, 12] },
    },
    artisan: {
        name: 'Artisan',
        primarySkills: { Crafting: [14, 20], Dexterity: [14, 20] },
        secondarySkills: { Intelligent: [6, 12], Alchemy: [6, 12], Cooking: [6, 12] },
    },
};

// ── Race Blueprints ─────────────────────────────────────────────────────

const RACE_BLUEPRINTS: Record<Race, ArchetypeBlueprint> = {
    human: {
        name: 'Human',
        primarySkills: { Curiosity: [6, 12], Navigation: [6, 12] },
        secondarySkills: { Charisma: [3, 8], Foraging: [3, 8], Cooking: [3, 8] },
    },
    elven: {
        name: 'Elven',
        primarySkills: { Intelligent: [6, 12], LongRangeWeapon: [6, 12] },
        secondarySkills: { BasicMagic: [3, 8], Agility: [3, 8], Dexterity: [3, 8] },
    },
    dwarven: {
        name: 'Dwarven',
        primarySkills: { Constitution: [6, 12], Mining: [6, 12] },
        secondarySkills: { Crafting: [3, 8], Bravery: [3, 8], Alchemy: [3, 8] },
    },
    lizardman: {
        name: 'Lizardman',
        primarySkills: { Defense: [6, 12], Fishing: [6, 12] },
        secondarySkills: { MeleeWeapon: [3, 8], Foraging: [3, 8], Agility: [3, 8] },
    },
    skeleton: {
        name: 'Skeleton',
        primarySkills: { DarkMagic: [6, 12], Alchemy: [6, 12] },
        secondarySkills: { Constitution: [3, 8], Defense: [3, 8], Fishing: [3, 8] },
    },
    goblin: {
        name: 'Goblin',
        primarySkills: { Dexterity: [6, 12], Crafting: [6, 12] },
        secondarySkills: { Mining: [3, 8], Agility: [3, 8], DarkMagic: [3, 8] },
    },
    orc: {
        name: 'Orc',
        primarySkills: { Bravery: [6, 12], MeleeWeapon: [6, 12] },
        secondarySkills: { Constitution: [3, 8], Foraging: [3, 8], Defense: [3, 8] },
    },
    kitsune: {
        name: 'Kitsune',
        primarySkills: { HolyMagic: [6, 12], Intelligent: [6, 12] },
        secondarySkills: { Charisma: [3, 8], Navigation: [3, 8], BasicMagic: [3, 8] },
    },
    nekomimi: {
        name: 'Nekomimi',
        primarySkills: { Cooking: [6, 12], Fishing: [6, 12] },
        secondarySkills: { Agility: [3, 8], Charisma: [3, 8], Foraging: [3, 8] },
    },
};

// ── Public API ───────────────────────────────────────────────────────────

/** Returns a random race and job combination based on CSV probabilities */
export function getRandomRaceAndJob(): { race: Race; job: Job } {
    const race = RACES[rollInt(0, RACES.length - 1)];

    // Probability selection based on the chosen race's distribution
    const jobMatrix = CHANCES_MATRIX[race];
    const rand = Math.random(); // 0.0 to 1.0

    let runningSum = 0;
    for (const job of JOBS) {
        runningSum += jobMatrix[job] || 0;
        if (rand <= runningSum) {
            return { race, job };
        }
    }

    // Fallback if matrix sum is imperfect, just pick the first valid job
    for (const job of JOBS) {
        if (jobMatrix[job] > 0) return { race, job };
    }
    return { race, job: JOBS[0] };
}

/** Returns all available archetype names. */
export function getArchetypeNames(): string[] {
    const names: string[] = [];
    for (const race of RACES) {
        for (const job of JOBS) {
            names.push(`${capitalize(race)} ${JOB_BLUEPRINTS[job].name}`);
        }
    }
    return names;
}

/** Returns a random archetype blueprint. */
export function getRandomArchetype(): ArchetypeBlueprint {
    const { job } = getRandomRaceAndJob();
    return JOB_BLUEPRINTS[job];
}

/** Returns a specific archetype blueprint by name. */
export function getArchetypeByName(name: string): ArchetypeBlueprint | undefined {
    // This function now needs to parse the name to find the job
    // Assuming name format "Race JobName"
    const parts = name.split(' ');
    if (parts.length < 2) return undefined;

    const jobName = parts[parts.length - 1]; // Last part is the job name
    const jobKey = JOBS.find(j => JOB_BLUEPRINTS[j].name === jobName);

    if (jobKey) {
        return JOB_BLUEPRINTS[jobKey];
    }
    return undefined;
}

/**
 * Generate a random patron name for a given race.
 */
function generatePatronName(race: Race): string {
    const prefixes = NAME_PREFIXES[race] ?? ['Unknown'];
    const prefix = prefixes[rollInt(0, prefixes.length - 1)];
    const suffix = NAME_SUFFIXES[rollInt(0, NAME_SUFFIXES.length - 1)];
    return `${prefix} ${suffix}`;
}

/**
 * Build a SkillVector by combining a Race blueprint and a Job blueprint.
 * Primary and Secondary skills get base rolls within their range, scaled by reputation.
 * All non-zero stats then receive [-2, +2] variance, clamped to [1, 20].
 * Omitted stats remain exactly 0.
 */
function buildSkillVector(raceBp: ArchetypeBlueprint, jobBp: ArchetypeBlueprint, reputation: number = 0): SkillVector {
    const vector = createEmptySkillVector();

    // Scale goes from 0.4 at 0 reputation to 1.0 at 200 reputation.
    // Caps at 1.2 at 266+ rep to allow max stats even with bad variance.
    const scale = Math.min(1.2, 0.4 + (reputation / 200) * 0.6);

    // Helper to add rolls to the vector
    const applyRolls = (skills: Partial<Record<SkillTag, [number, number]>>) => {
        for (const [tag, [min, max]] of Object.entries(skills)) {
            const skillTag = tag as SkillTag;
            const scaledMin = Math.max(1, Math.round(min * scale));
            const scaledMax = Math.max(scaledMin, Math.round(max * scale));
            vector[skillTag] = (vector[skillTag] || 0) + rollInt(scaledMin, scaledMax);
        }
    };

    // Roll base stats from both blueprints
    applyRolls(jobBp.primarySkills);
    applyRolls(jobBp.secondarySkills);
    applyRolls(raceBp.primarySkills);
    applyRolls(raceBp.secondarySkills);

    // Apply [-2, +2] RNG variance to all non-zero stats, clamp to [1, 20]
    for (const tag of Object.keys(vector) as SkillTag[]) {
        if (vector[tag] > 0) {
            const variance = rollInt(STAT_VARIANCE[0], STAT_VARIANCE[1]);
            vector[tag] = clamp(vector[tag] + variance, MIN_STAT, MAX_STAT);
        }
    }

    return vector;
}

/**
 * Instantiate a new patron. If specific race/job are omitted,
 * they are generated randomly based on the probability matrix.
 */
export function createPatron(race?: Race, job?: Job, innReputation: number = 0): IPatron {
    let finalRace = race;
    let finalJob = job;

    if (!finalRace || !finalJob) {
        const randoms = getRandomRaceAndJob();
        finalRace = finalRace ?? randoms.race;
        finalJob = finalJob ?? randoms.job;
    }

    const jobBlueprint = JOB_BLUEPRINTS[finalJob];
    const raceBlueprint = RACE_BLUEPRINTS[finalRace];
    const archetypeName = `${capitalize(finalRace)} ${jobBlueprint.name}`;

    return {
        id: generateUUID(),
        name: generatePatronName(finalRace),
        archetype: archetypeName,
        skills: buildSkillVector(raceBlueprint, jobBlueprint, innReputation),
        state: 'IDLE',
        healthStatus: 'HEALTHY',
        arrivalTimestamp: ticker.simulatedTime,
        equipment: createEmptyEquipment(),
        inventory: [],
        gold: 0,
        copper: 0,
    };
}

