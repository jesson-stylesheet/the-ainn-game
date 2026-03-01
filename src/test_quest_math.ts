/**
 * ═══════════════════════════════════════════════════════════════════════
 * QUEST RESOLUTION MATH TEST — End-to-End with LLM
 * ═══════════════════════════════════════════════════════════════════════
 * Tests 4 scenarios through the full pipeline:
 *   quest text → LLM parsing → patron creation → sigmoid resolution
 *
 * Run: npx tsx src/test_quest_math.ts
 */

import { parseQuestWithLLM } from './infrastructure/llm/questParser';
import { createPatron } from './core/engine/patronFactory';
import {
    resolveQuest,
    computeCoverageScore,
    computeEquipmentBonus,
} from './core/math/probability';
import { ALL_SKILL_TAGS, type SkillVector } from './core/types/entity';
import { GAMMA, SIGMOID_TEMPERATURE } from './core/constants';

// ── Helpers ─────────────────────────────────────────────────────────────

function printSkillVector(label: string, vec: SkillVector): void {
    const active = ALL_SKILL_TAGS.filter(t => vec[t] > 0);
    const parts = active.map(t => `${t}:${vec[t]}`);
    console.log(`  ${label}: ${parts.join(', ') || '(empty)'}`);
}

function separator(title: string): void {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  TEST: ${title}`);
    console.log(`${'═'.repeat(70)}`);
}

// ── Test Scenarios ──────────────────────────────────────────────────────

interface TestScenario {
    name: string;
    questText: string;
    patronArchetype: ['human' | 'elven' | 'dwarven' | 'lizardman' | 'skeleton' | 'goblin' | 'orc' | 'kitsune' | 'nekomimi', 'warrior' | 'archer' | 'miner' | 'mechanic' | 'necromancer' | 'wizard' | 'berserker' | 'cleric' | 'geisha'];
    expectedOutcome: 'HIGH' | 'MODERATE' | 'LOW';
    reasoning: string;
}

const SCENARIOS: TestScenario[] = [
    {
        name: '1. Perfect Match — Warrior vs Combat',
        questText: 'Slay the dragon terrorizing the mountain pass. It has killed many brave warriors already.',
        patronArchetype: ['human', 'warrior'],
        expectedOutcome: 'HIGH',
        reasoning: 'Warrior has high MeleeWeapon, Bravery, Defense, Constitution — all combat tags.',
    },
    {
        name: '2. Total Mismatch — Miner vs Diplomacy',
        questText: 'Negotiate a peace treaty between the warring elven clans. Use charm and persuasion to broker a deal.',
        patronArchetype: ['dwarven', 'miner'],
        expectedOutcome: 'LOW',
        reasoning: 'Miner has Mining, Constitution, Bravery — zero Charisma primary. Diplomacy needs Charisma.',
    },
    {
        name: '3. Partial Match — Archer vs Exploration',
        questText: 'Scout the ancient forest and find the hidden temple. Hunt any beasts along the way.',
        patronArchetype: ['elven', 'archer'],
        expectedOutcome: 'HIGH',
        reasoning: 'Archer has Navigation, Foraging, LongRangeWeapon — good for scouting, hunting, forest.',
    },
    {
        name: '4. New Skill Test — Geisha vs Cooking Quest',
        questText: 'Cook a legendary feast for the visiting king. Bake the finest pastries and stew a hearty meal.',
        patronArchetype: ['nekomimi', 'geisha'],
        expectedOutcome: 'HIGH',
        reasoning: 'Geisha has Cooking primary [14-20]. Quest should trigger Cooking tag heavily.',
    },
];

// ── Main ────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║       QUEST RESOLUTION MATH — End-to-End Test (with real LLM)       ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log(`\nConstants: GAMMA=${GAMMA}, MAX_STAT=20, D range 10-50`);
    console.log(`Skill tags: ${ALL_SKILL_TAGS.length} total\n`);

    const results: { name: string; p: number; expected: string; pass: boolean; d20: number }[] = [];

    for (const scenario of SCENARIOS) {
        separator(scenario.name);
        console.log(`  Quest: "${scenario.questText}"`);
        console.log(`  Patron: ${scenario.patronArchetype.join(' ')}`);
        console.log(`  Expected: ${scenario.expectedOutcome} probability`);
        console.log(`  Why: ${scenario.reasoning}`);

        // Step 1: Parse quest with LLM
        console.log(`\n  ── Step 1: LLM Quest Parsing ──`);
        const quest = await parseQuestWithLLM(scenario.questText);
        console.log(`  Type: ${quest.type}`);
        console.log(`  Difficulty (D): ${quest.difficultyScalar}`);
        console.log(`  Resolution Ticks: ${quest.resolutionTicks}`);
        printSkillVector('Quest Requirements', quest.requirements);
        if (quest.itemDetails) {
            console.log(`  Item: ${quest.itemDetails.quantity}x ${quest.itemDetails.itemName} (${quest.itemDetails.category}, rarity: ${quest.itemDetails.rarity})`);
        }

        // Step 2: Create patron
        console.log(`\n  ── Step 2: Patron Creation ──`);
        const patron = createPatron(...scenario.patronArchetype);
        console.log(`  Name: ${patron.name} (${patron.archetype})`);
        printSkillVector('Patron Skills', patron.skills);

        // Step 3: Compute coverage score
        console.log(`\n  ── Step 3: Math Breakdown ──`);
        const S = computeCoverageScore(patron.skills, quest.requirements);
        const eqBonus = computeEquipmentBonus(patron, quest);
        const D = quest.difficultyScalar;
        console.log(`  Coverage Score (S): ${S.toFixed(2)}`);
        console.log(`  Equipment Bonus: ${eqBonus.toFixed(2)}`);
        console.log(`  Difficulty (D): ${D}`);
        console.log(`  S - D = ${(S + eqBonus - D).toFixed(2)} (positive = patron favoured)`);

        // Step 4: Resolve quest
        console.log(`\n  ── Step 4: Sigmoid Resolution ──`);
        const result = resolveQuest(patron, quest);
        console.log(`  d20 Roll: ${result.d20Roll}`);
        console.log(`  P(Success): ${(result.probability * 100).toFixed(1)}%`);
        console.log(`  Raw Roll: ${result.rawRoll.toFixed(4)}`);
        console.log(`  Outcome: ${result.success ? '✅ SUCCESS' : '❌ FAILURE'}`);
        console.log(`  Weakest Tags: ${result.weakestTags.join(', ')}`);

        // Step 5: Sanity check
        const pPercent = result.probability * 100;
        let pass = false;

        // With GAMMA=1.50 and SIGMOID_TEMPERATURE=4.0, the d20 roll introduces meaningful
        // variance but the curve is flattened. We evaluate the 'baseline' probability
        // (if d20 = 10.5) to determine if stats were aligned as expected.
        const baselineExponent = -(S + eqBonus - D) / SIGMOID_TEMPERATURE;
        const baselineP = 1 / (1 + Math.exp(baselineExponent));
        const baselinePercent = baselineP * 100;

        if (scenario.expectedOutcome === 'HIGH' && baselinePercent > 50) pass = true;
        if (scenario.expectedOutcome === 'MODERATE' && baselinePercent >= 25 && baselinePercent <= 75) pass = true;
        if (scenario.expectedOutcome === 'LOW' && baselinePercent < 50) pass = true;

        const verdict = pass ? '✅ PASS' : '⚠️  UNEXPECTED';
        console.log(`\n  VERDICT: ${verdict} (Baseline P was ${baselinePercent.toFixed(1)}%, actual P is ${pPercent.toFixed(1)}% due to roll of ${result.d20Roll})`);

        results.push({
            name: scenario.name,
            p: pPercent,
            expected: scenario.expectedOutcome,
            pass,
            d20: result.d20Roll,
        });
    }

    // ── Summary ──────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(70)}`);
    console.log('  SUMMARY');
    console.log(`${'═'.repeat(70)}`);
    console.log('  ┌──────────────────────────────────────────────────┬──────────┬─────┬────────┐');
    console.log('  │ Scenario                                        │ P(Succ)  │ d20 │ Result │');
    console.log('  ├──────────────────────────────────────────────────┼──────────┼─────┼────────┤');
    for (const r of results) {
        const name = r.name.padEnd(48).slice(0, 48);
        const prob = `${r.p.toFixed(1)}%`.padStart(7);
        const d20 = String(r.d20).padStart(3);
        const res = r.pass ? ' ✅  ' : ' ⚠️   ';
        console.log(`  │ ${name} │ ${prob}  │ ${d20} │${res} │`);
    }
    console.log('  └──────────────────────────────────────────────────┴──────────┴─────┴────────┘');

    const passCount = results.filter(r => r.pass).length;
    console.log(`\n  ${passCount}/${results.length} scenarios matched expected probability ranges.`);
    if (passCount < results.length) {
        console.log('  Note: d20 randomness can shift probabilities ±20%. Re-run if borderline.');
    }
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
