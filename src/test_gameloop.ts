/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Core Game Loop Test Harness
 * ═══════════════════════════════════════════════════════════════════════
 * Tests the FULL core loop end-to-end:
 *
 *   1. Patrons arrive (Factory)
 *   2. Player posts a quest (text → mock LLM parser)
 *   3. Player assigns a patron to each quest
 *   4. Time passes (Ticker tick)
 *   5. Quest deadline expires → Probability Engine resolves
 *   6. Results are logged with full mathematical breakdown
 *   7. Lore chronicle accumulates worldbuilding narrative
 *
 * Run: npx ts-node src/test_gameloop.ts
 */

import { createPatron } from './core/engine/patronFactory';
import { parseQuestText, analyzeQuestVerbosity } from './core/engine/questFactory';
import { resolveQuest } from './core/math/probability';
import { gameState } from './core/engine/gameState';
import { eventBus } from './core/engine/eventBus';
import { loreChronicle } from './core/engine/loreChronicle';
import { ticker } from './core/engine/ticker';
import type { SkillTag, IPatron, IQuest, QuestResolutionResult } from './core/types/entity';
import { ALL_SKILL_TAGS } from './core/types/entity';

// ── Pretty Printing ─────────────────────────────────────────────────────

const C = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

function header(text: string): void {
    console.log(`\n${C.bright}${C.cyan}═══════════════════════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bright}${C.cyan}  ${text}${C.reset}`);
    console.log(`${C.bright}${C.cyan}═══════════════════════════════════════════════════════════════${C.reset}`);
}

function subheader(text: string): void {
    console.log(`\n${C.bright}${C.yellow}─── ${text} ───${C.reset}`);
}

function printSkills(label: string, skills: Record<SkillTag, number>): void {
    const nonZero = ALL_SKILL_TAGS.filter(t => skills[t] > 0);
    if (nonZero.length === 0) {
        console.log(`  ${label}: ${C.dim}(all zero)${C.reset}`);
        return;
    }
    const formatted = nonZero
        .sort((a, b) => skills[b] - skills[a])
        .map(t => {
            const v = skills[t];
            const color = v >= 10 ? C.green : v >= 5 ? C.yellow : C.red;
            return `${color}${t}:${v}${C.reset}`;
        })
        .join('  ');
    console.log(`  ${label}: ${formatted}`);
}

function printPatron(p: IPatron, i?: number): void {
    const prefix = i !== undefined ? `[${i + 1}]` : '   ';
    console.log(`${C.bright}${prefix} ${C.magenta}${p.name}${C.reset} ${C.gray}(${p.archetype})${C.reset} [${p.state}]`);
    printSkills('    Skills', p.skills);
}

function printQuest(q: IQuest, i?: number): void {
    const prefix = i !== undefined ? `[${i + 1}]` : '   ';
    const tagCount = ALL_SKILL_TAGS.filter(t => q.requirements[t] > 0).length;
    console.log(`${C.bright}${prefix} ${C.blue}"${q.originalText}"${C.reset}`);
    console.log(`      ${C.gray}D=${q.difficultyScalar}  Tags=${tagCount}${C.reset}`);
    printSkills('    Requires', q.requirements);
}

function printResolution(result: QuestResolutionResult, patron: IPatron, quest: IQuest): void {
    const sc = result.success ? C.green : C.red;
    const st = result.success ? '✅ SUCCESS' : '❌ FAILED';
    console.log(`\n  ${C.bright}${sc}${st}${C.reset}`);
    console.log(`  ${C.gray}Quest:${C.reset}       "${quest.originalText}"`);
    console.log(`  ${C.gray}Patron:${C.reset}      ${patron.name} (${patron.archetype})`);
    console.log(`  ${C.gray}Coverage:${C.reset}    ${result.dotProduct}  ${C.gray}Difficulty:${C.reset} ${quest.difficultyScalar}  ${C.gray}d20:${C.reset} ${result.d20Roll}`);
    console.log(`  ${C.gray}P(Success):${C.reset}  ${(result.probability * 100).toFixed(1)}%  ${C.gray}Fate:${C.reset} ${result.rawRoll.toFixed(4)} ${result.rawRoll <= result.probability ? '≤' : '>'} ${result.probability.toFixed(4)}`);
    if (result.weakestTags.length > 0) {
        console.log(`  ${C.gray}Weak Tags:${C.reset}   ${result.weakestTags.map(t => `${C.red}${t}${C.reset}`).join(', ')}`);
    }
}

// ── Main ─────────────────────────────────────────────────────────────────

function main(): void {
    header('THE AINN — CORE GAME LOOP TEST');

    // ═══ PHASE 1: VERBOSITY SCALING DEMO ════════════════════════════════

    subheader('Phase 1: Verbosity Scaling — The Core Mechanic');

    console.log(`\n  ${C.bright}The same task, different verbosity levels:${C.reset}\n`);

    const verbosityTests = [
        {
            label: 'TERSE',
            text: 'Fish 2 salmon in the river',
        },
        {
            label: 'MODERATE',
            text: 'Travel to the forest river and fish for salmon before the storm arrives',
        },
        {
            label: 'VERBOSE',
            text: 'Deep beneath the ancient emerald forest, where the river of whispered sorrows meets the forgotten temple ruins, the village elders seek a brave and curious soul to navigate the treacherous swamp path and fish the legendary golden salmon that has eluded hunters for generations',
        },
    ];

    for (const { label, text } of verbosityTests) {
        const analysis = analyzeQuestVerbosity(text);
        const quest = parseQuestText(text);
        const tagCount = ALL_SKILL_TAGS.filter(t => quest.requirements[t] > 0).length;
        const totalValue = ALL_SKILL_TAGS.reduce((sum, t) => sum + quest.requirements[t], 0);

        console.log(`  ${C.bright}${C.cyan}[${label}]${C.reset} ${C.dim}${text}${C.reset}`);
        console.log(`    Words: ${analysis.wordCount}  Lore: ${analysis.loreWordCount}  Keywords: ${analysis.keywordHits}`);
        console.log(`    Verbosity: ${C.yellow}${(analysis.verbosityScore * 100).toFixed(0)}%${C.reset}  Scale: ${analysis.scalingFactor.toFixed(2)}`);
        console.log(`    Tags: ${C.bright}${tagCount}${C.reset}  Total Value: ${C.bright}${totalValue}${C.reset}  Avg/Tag: ${(totalValue / tagCount).toFixed(1)}`);
        printSkills('    Skills', quest.requirements);
        console.log('');
    }

    // ═══ PHASE 2: PATRON GENERATION ═════════════════════════════════════

    subheader('Phase 2: Patron Generation (All 9 Archetypes)');

    const patrons = [];
    for (let i = 0; i < 9; i++) {
        patrons.push(createPatron(undefined, undefined, gameState.reputation));
    }
    for (let i = 0; i < patrons.length; i++) {
        printPatron(patrons[i], i);
        gameState.addPatron(patrons[i]);
    }

    // ═══ PHASE 3: QUEST POSTING (Player Input) ══════════════════════════

    subheader('Phase 3: Quest Board — Player Posts Quests');

    const questTexts = [
        'Slay the dragon in the mountain cave',
        'Mine ore from the deep tunnels',
        'Through the shadowy depths of the ancient forgotten dungeon, where whispered legends tell of a cursed treasure guarded by undead skeleton warriors, we seek a brave soul to navigate the dark halls and purify the holy relic that was once lost to dark magic',
        'Fish salmon',
        'Negotiate peace with the orc warlord in the village tavern',
        'Hunt spiders in the swamp forest',
    ];

    const quests: IQuest[] = [];
    for (let i = 0; i < questTexts.length; i++) {
        const quest = parseQuestText(questTexts[i]);
        quest.deadlineTimestamp = Date.now() - 1000; // Already expired for testing
        quests.push(quest);
        gameState.addQuest(quest);
        printQuest(quest, i);
    }

    // ═══ PHASE 4: ASSIGNMENT ════════════════════════════════════════════

    subheader('Phase 4: Assignment');

    const assignments: [number, number][] = [
        [0, 0],   // Human Warrior → Slay dragon
        [2, 1],   // Dwarven Miner → Mine ore
        [4, 2],   // Skeleton Necromancer → Verbose dungeon quest
        [8, 3],   // Nekomimi Geisha → Fish salmon (bad fit!)
        [7, 4],   // Kitsune Cleric → Negotiate peace
        [6, 5],   // Orc Berserker → Hunt spiders
    ];

    for (const [pi, qi] of assignments) {
        const patron = patrons[pi];
        const quest = quests[qi];
        const ok = gameState.assignPatronToQuest(patron.id, quest.id);
        console.log(`  ${ok ? `${C.green}✓` : `${C.red}✗`}${C.reset} ${patron.name} → "${quest.originalText.slice(0, 50)}..."`);
    }

    // ═══ PHASE 5: RESOLUTION ════════════════════════════════════════════

    subheader('Phase 5: The Ticker Resolves');

    eventBus.on('quest:resolved', ({ result, patron, quest }) => {
        printResolution(result, patron, quest);
        // In test mode, use fallback lore text (no LLM)
        const fallbackLore = `${patron.name} ${result.success ? 'completed' : 'failed'} "${quest.originalText}".`;
        const fallbackStory = '';
        loreChronicle.recordResolution(quest, patron, result, fallbackLore, fallbackStory);
    });

    ticker.tick();

    // ═══ PHASE 6: INN STATUS ════════════════════════════════════════════

    subheader('Phase 6: Inn Status');

    const s = gameState.getSummary();
    console.log(`  Patrons: ${s.totalPatrons} total, ${s.idlePatrons} idle`);
    console.log(`  Quests:  ${s.completedQuests} ${C.green}completed${C.reset}, ${s.failedQuests} ${C.red}failed${C.reset}`);

    // ═══ PHASE 7: LORE CHRONICLE ════════════════════════════════════════

    subheader('Phase 7: Lore Chronicle (Worldbuilding Digest)');

    console.log(`\n  ${C.dim}${loreChronicle.toNarrativeDigest()}${C.reset}`);

    // ═══ PHASE 8: PROBABILITY COMPARISON ════════════════════════════════

    subheader('Phase 8: Probability — Nekomimi Geisha vs Dwarven Miner (Mining)');

    const miningQuest = parseQuestText('Mine ore');
    const geisha = createPatron('nekomimi', 'geisha', gameState.reputation);
    const miner = createPatron('dwarven', 'miner', gameState.reputation);

    console.log(`\n  Quest: "${miningQuest.originalText}" (D=${miningQuest.difficultyScalar})`);
    printSkills('  Reqs', miningQuest.requirements);
    console.log(`\n  ${C.magenta}${geisha.name}${C.reset} (${geisha.archetype}):`);
    printSkills('  Skills', geisha.skills);
    console.log(`  ${C.magenta}${miner.name}${C.reset} (${miner.archetype}):`);
    printSkills('  Skills', miner.skills);

    let gW = 0, mW = 0;
    const N = 100;
    for (let i = 0; i < N; i++) {
        if (resolveQuest(geisha, miningQuest).success) gW++;
        if (resolveQuest(miner, miningQuest).success) mW++;
    }

    console.log(`\n  ${C.bright}${N}-Trial Results:${C.reset}`);
    console.log(`    ${geisha.archetype}:  ${C.yellow}${gW}/${N}${C.reset} (${(gW / N * 100).toFixed(1)}%)`);
    console.log(`    ${miner.archetype}: ${C.green}${mW}/${N}${C.reset} (${(mW / N * 100).toFixed(1)}%)`);

    header('ALL TESTS COMPLETE');
}

main();
