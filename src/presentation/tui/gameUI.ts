/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Terminal User Interface
 * ═══════════════════════════════════════════════════════════════════════
 * The interactive TUI for testing the core game loop.
 * Player can: post quests, view patrons, assign patrons, run the ticker.
 *
 * This is temporary (Blueprint §9.1) — will be replaced by Svelte5 web.
 * The core engine emits events, the TUI just subscribes and displays.
 * ═══════════════════════════════════════════════════════════════════════
 */

import * as readline from 'readline';
import { createPatron, createOneOfEach, getArchetypeNames } from '../../core/engine/patronFactory';
import { parseQuestText, analyzeQuestVerbosity } from '../../core/engine/questFactory';
import { gameState } from '../../core/engine/gameState';
import { eventBus } from '../../core/engine/eventBus';
import { loreChronicle } from '../../core/engine/loreChronicle';
import { ticker } from '../../core/engine/ticker';
import { resolveQuest } from '../../core/math/probability';
import type { SkillTag, IPatron, IQuest, QuestResolutionResult } from '../../core/types/entity';
import { ALL_SKILL_TAGS } from '../../core/types/entity';
import * as db from '../../infrastructure/db/queries';
import { parseQuestWithLLM } from '../../infrastructure/llm/questParser';
import { renderResolution, renderArrivalNarrative, generatePatronQuest, generateGuardianQuestions, synthesizeLore } from '../../infrastructure/llm/narrativeRenderer';
import { loreGuardian, GUARDIAN_THRESHOLD } from '../../core/engine/loreGuardian';

// ── Colors ──────────────────────────────────────────────────────────────

const C = {
    reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
    gray: '\x1b[90m', white: '\x1b[37m',
};

// ── Config ──────────────────────────────────────────────────────────────

let useLLM = true;        // Toggle LLM quest parsing (default: on)
let useDB = false;        // Toggle Supabase persistence (default: in-memory)
let isGuardianActive = false; // Prevent overlapping triggers

// ── Display Helpers ─────────────────────────────────────────────────────

function banner(): void {
    console.clear();
    console.log(`${C.bright}${C.cyan}`);
    console.log(`  ╔════════════════════════════════════════════════╗`);
    console.log(`  ║           ⚔  THE AINN  ⚔                     ║`);
    console.log(`  ║      An Innkeeper's Management Simulation     ║`);
    console.log(`  ╚════════════════════════════════════════════════╝${C.reset}`);
    console.log('');
}

function showStatus(): void {
    const s = gameState.getSummary();
    const modes = [
        useLLM ? `${C.green}LLM${C.reset}` : `${C.yellow}MOCK${C.reset}`,
        useDB ? `${C.green}DB${C.reset}` : `${C.yellow}MEM${C.reset}`,
    ].join(' │ ');

    console.log(`  ${C.gray}┌─────────────────────────────────────────┐${C.reset}`);
    console.log(`  ${C.gray}│${C.reset} Patrons: ${C.bright}${s.totalPatrons}${C.reset} (${s.idlePatrons} idle, ${s.onQuestPatrons} questing)  ${C.gray}│${C.reset}`);
    console.log(`  ${C.gray}│${C.reset} Quests:  ${s.postedQuests} posted, ${C.green}${s.completedQuests}${C.reset} done, ${C.red}${s.failedQuests}${C.reset} failed  ${C.gray}│${C.reset}`);
    console.log(`  ${C.gray}│${C.reset} Lore:    ${loreChronicle.size} entries                      ${C.gray}│${C.reset}`);
    console.log(`  ${C.gray}│${C.reset} Mode:    ${modes}                     ${C.gray}│${C.reset}`);
    console.log(`  ${C.gray}└─────────────────────────────────────────┘${C.reset}`);
}

function showMenu(): void {
    console.log(`\n  ${C.bright}Commands:${C.reset}`);
    console.log(`    ${C.cyan}1${C.reset} Post a Quest          ${C.cyan}6${C.reset} View Lore Chronicle`);
    console.log(`    ${C.cyan}2${C.reset} View Patrons          ${C.cyan}7${C.reset} View Inn Ledger`);
    console.log(`    ${C.cyan}3${C.reset} View Quest Board      ${C.cyan}8${C.reset} Summon New Patron`);
    console.log(`    ${C.cyan}4${C.reset} Assign Patron         ${C.cyan}9${C.reset} Toggle LLM/DB`);
    console.log(`    ${C.cyan}5${C.reset} Resolve All Quests    ${C.cyan}G${C.reset} Summon Lore Guardian (${loreChronicle.unacknowledgedEntriesCount}/${GUARDIAN_THRESHOLD})`);
    console.log(`    ${C.cyan}I${C.reset} Populate Inn (All 9) / ${C.cyan}0${C.reset} Exit`);
    console.log('');
}

function printSkills(skills: Record<SkillTag, number>, indent: string = '    '): void {
    const nonZero = ALL_SKILL_TAGS.filter(t => skills[t] > 0)
        .sort((a, b) => skills[b] - skills[a]);
    if (nonZero.length === 0) {
        console.log(`${indent}${C.dim}(no skills)${C.reset}`);
        return;
    }
    const parts = nonZero.map(t => {
        const v = skills[t];
        const c = v >= 10 ? C.green : v >= 5 ? C.yellow : C.red;
        return `${c}${t}:${v}${C.reset}`;
    });
    // Wrap at 80 chars
    let line = indent;
    for (const part of parts) {
        if (line.length > 70) {
            console.log(line);
            line = indent;
        }
        line += part + '  ';
    }
    if (line.trim()) console.log(line);
}

// ── Prompt Helper ───────────────────────────────────────────────────────

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => {
        rl.question(`  ${C.yellow}>${C.reset} ${question}`, answer => {
            resolve(answer.trim());
        });
    });
}

// ── Commands ────────────────────────────────────────────────────────────

async function postQuest(rl: readline.Interface): Promise<void> {
    console.log(`\n  ${C.bright}📜 Post a Quest${C.reset}`);
    console.log(`  ${C.dim}Write your quest. The more lore you add, the more tags (but lower values).${C.reset}`);
    console.log(`  ${C.dim}Terse = specialist job. Verbose = accessible to more patrons.${C.reset}\n`);

    const text = await askQuestion(rl, 'Quest text: ');
    if (!text) return;

    // Analyze verbosity regardless of parser mode
    const verbosity = analyzeQuestVerbosity(text);

    console.log(`\n  ${C.gray}Verbosity: ${(verbosity.verbosityScore * 100).toFixed(0)}% | Words: ${verbosity.wordCount} | Lore: ${verbosity.loreWordCount} | Keywords: ${verbosity.keywordHits}${C.reset}`);

    let quest: IQuest;
    if (useLLM) {
        console.log(`  ${C.dim}Sending to LLM...${C.reset}`);
        quest = await parseQuestWithLLM(text);
    } else {
        quest = parseQuestText(text);
    }

    const tagCount = ALL_SKILL_TAGS.filter(t => quest.requirements[t] > 0).length;
    gameState.addQuest(quest);

    if (useDB) {
        try {
            await db.insertQuest(quest, verbosity.verbosityScore);
        } catch (e) {
            console.log(`  ${C.red}DB write failed: ${(e as Error).message}${C.reset}`);
        }
    }

    console.log(`\n  ${C.green}✓ Quest posted!${C.reset} ${C.cyan}[${quest.type}]${C.reset} D=${quest.difficultyScalar} | T=${quest.resolutionTicks} | ${tagCount} tags`);
    if (quest.itemDetails) {
        const r = quest.itemDetails.rarity;
        const rarityColor = r >= 85 ? C.magenta : r >= 60 ? C.yellow : r >= 30 ? C.cyan : C.green;
        console.log(`    📦 ${quest.itemDetails.quantity}x ${C.bright}${quest.itemDetails.itemName}${C.reset} ${rarityColor}(Rarity: ${r.toFixed(2)})${C.reset}`);
    }
    printSkills(quest.requirements, '    ');
}

async function viewPatrons(rl: readline.Interface): Promise<void> {
    const patrons = gameState.getAllPatrons();
    if (patrons.length === 0) {
        console.log(`\n  ${C.dim}The inn is empty. Summon patrons first (8 or I).${C.reset}`);
        return;
    }

    console.log(`\n  ${C.bright}🍺 Patron Roster${C.reset}\n`);
    for (let i = 0; i < patrons.length; i++) {
        const p = patrons[i];
        const stateColor = p.state === 'IDLE' || p.state === 'LOUNGING' ? C.green :
            p.state === 'ON_QUEST' ? C.yellow : C.red;
        const healthColor = p.healthStatus === 'HEALTHY' ? C.green :
            p.healthStatus === 'INJURED' ? C.yellow : C.red;
        console.log(`  ${C.bright}[${i + 1}]${C.reset} ${C.magenta}${p.name}${C.reset} ${C.gray}(${p.archetype})${C.reset} ${stateColor}[${p.state}]${C.reset} ${healthColor}♥${p.healthStatus}${C.reset}`);
    }

    console.log(`\n  ${C.dim}Enter a number to view character sheet, or press Enter to go back.${C.reset}`);
    const input = await askQuestion(rl, '  Inspect # : ');
    if (!input) return;

    const idx = parseInt(input) - 1;
    if (idx < 0 || idx >= patrons.length) {
        console.log(`  ${C.red}Invalid selection.${C.reset}`);
        return;
    }

    printCharacterSheet(patrons[idx]);
}

function printCharacterSheet(p: IPatron): void {
    const healthColor = p.healthStatus === 'HEALTHY' ? C.green :
        p.healthStatus === 'INJURED' ? C.yellow : C.red;
    const stateColor = p.state === 'IDLE' || p.state === 'LOUNGING' ? C.green :
        p.state === 'ON_QUEST' ? C.yellow : C.red;

    console.log(``);
    console.log(`  ${C.gray}╔══════════════════════════════════════════════╗${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  ${C.bright}${C.magenta}⚔  ${p.name.toUpperCase()}${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  ${C.dim}"${p.archetype}"${C.reset}`);
    console.log(`  ${C.gray}╠══════════════════════════════════════════════╣${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  State:  ${stateColor}${p.state}${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  Health: ${healthColor}♥ ${p.healthStatus}${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  Since:  ${C.dim}${new Date(p.arrivalTimestamp).toLocaleString()}${C.reset}`);
    console.log(`  ${C.gray}╠══════════════════════════════════════════════╣${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  ${C.bright}SKILLS${C.reset}`);

    // Sort skills by value descending for the radar display
    const sorted = ALL_SKILL_TAGS
        .map(tag => ({ tag, val: p.skills[tag] }))
        .sort((a, b) => b.val - a.val);

    for (const { tag, val } of sorted) {
        if (val === 0) continue;
        const barLen = Math.min(val, 20);
        const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen);
        const color = val >= 10 ? C.green : val >= 5 ? C.yellow : C.red;
        console.log(`  ${C.gray}║${C.reset}  ${color}${tag.padEnd(16)}${C.reset} ${color}${bar}${C.reset} ${C.bright}${val}${C.reset}`);
    }

    // Show zero skills dimmed
    const zeroSkills = sorted.filter(s => s.val === 0).map(s => s.tag);
    if (zeroSkills.length > 0) {
        console.log(`  ${C.gray}║${C.reset}  ${C.dim}Untrained: ${zeroSkills.join(', ')}${C.reset}`);
    }

    // Quest history from resolved results
    const results = gameState.getResolvedResults().filter(r => r.patronId === p.id);
    const wins = results.filter(r => r.success).length;
    const losses = results.filter(r => !r.success).length;

    console.log(`  ${C.gray}╠══════════════════════════════════════════════╣${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  ${C.bright}QUEST RECORD${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  ${C.green}Wins: ${wins}${C.reset}  ${C.red}Losses: ${losses}${C.reset}  ${C.dim}Total: ${results.length}${C.reset}`);
    if (p.memoryIds && p.memoryIds.length > 0) {
        console.log(`  ${C.gray}║${C.reset}  ${C.cyan}Memories: ${p.memoryIds.length}${C.reset}`);
    }
    console.log(`  ${C.gray}╚══════════════════════════════════════════════╝${C.reset}`);
}

function viewQuests(): void {
    const quests = gameState.getAllQuests();
    if (quests.length === 0) {
        console.log(`\n  ${C.dim}No quests on the board. Post one first (1).${C.reset}`);
        return;
    }

    console.log(`\n  ${C.bright}📋 Quest Board${C.reset}\n`);
    for (let i = 0; i < quests.length; i++) {
        const q = quests[i];
        const tagCount = ALL_SKILL_TAGS.filter(t => q.requirements[t] > 0).length;
        const statusColor = q.status === 'POSTED' ? C.blue :
            q.status === 'ACCEPTED' ? C.yellow :
                q.status === 'COMPLETED' ? C.green : C.red;

        const assignee = q.assignedPatronId
            ? gameState.getPatron(q.assignedPatronId)?.name ?? 'unknown'
            : 'unassigned';

        console.log(`  ${C.bright}[${i + 1}]${C.reset} ${statusColor}[${q.status}]${C.reset} ${C.cyan}[${q.type}]${C.reset} "${q.originalText}"`);
        let detailLine = `      D=${q.difficultyScalar} | T=${q.resolutionTicks} | ${tagCount} tags | ${C.gray}${assignee}${C.reset}`;
        if (q.itemDetails) {
            const r = q.itemDetails.rarity;
            const rarityColor = r >= 85 ? C.magenta : r >= 60 ? C.yellow : r >= 30 ? C.cyan : C.green;
            detailLine += ` | 📦 ${q.itemDetails.quantity}x ${C.bright}${q.itemDetails.itemName}${C.reset} ${rarityColor}(R:${r.toFixed(1)})${C.reset}`;
        }
        console.log(detailLine);
        printSkills(q.requirements, '      ');
    }
}

async function assignPatron(rl: readline.Interface): Promise<void> {
    const availablePatrons = gameState.getAllPatrons().filter(p => p.state === 'IDLE' || p.state === 'LOUNGING');
    const postedQuests = gameState.getQuestsByStatus('POSTED');

    if (availablePatrons.length === 0) {
        console.log(`\n  ${C.dim}No available patrons.${C.reset}`);
        return;
    }
    if (postedQuests.length === 0) {
        console.log(`\n  ${C.dim}No posted quests to assign.${C.reset}`);
        return;
    }

    console.log(`\n  ${C.bright}Available Patrons:${C.reset}`);
    for (let i = 0; i < availablePatrons.length; i++) {
        const p = availablePatrons[i];
        console.log(`    ${C.cyan}${i + 1}${C.reset}. ${p.name} (${p.archetype})`);
    }

    console.log(`\n  ${C.bright}Posted Quests:${C.reset}`);
    for (let i = 0; i < postedQuests.length; i++) {
        const q = postedQuests[i];
        console.log(`    ${C.cyan}${i + 1}${C.reset}. "${q.originalText.slice(0, 60)}${q.originalText.length > 60 ? '...' : ''}" (D=${q.difficultyScalar})`);
    }

    const pIdx = parseInt(await askQuestion(rl, 'Patron # : ')) - 1;
    const qIdx = parseInt(await askQuestion(rl, 'Quest #  : ')) - 1;

    if (isNaN(pIdx) || isNaN(qIdx) || pIdx < 0 || qIdx < 0 ||
        pIdx >= availablePatrons.length || qIdx >= postedQuests.length) {
        console.log(`  ${C.red}Invalid selection.${C.reset}`);
        return;
    }

    const patron = availablePatrons[pIdx];
    const quest = postedQuests[qIdx];
    const ok = gameState.assignPatronToQuest(patron.id, quest.id);

    if (ok) {
        console.log(`  ${C.green}✓ ${patron.name} accepted "${quest.originalText.slice(0, 40)}..."${C.reset}`);

        if (useDB) {
            try {
                await db.assignPatronToQuestAtomic(patron.id, quest.id);
            } catch (e) {
                console.log(`  ${C.red}DB sync failed: ${(e as Error).message}${C.reset}`);
            }
        }
    } else {
        console.log(`  ${C.red}✗ Assignment failed.${C.reset}`);
    }
}

async function resolveAll(): Promise<void> {
    const accepted = gameState.getQuestsByStatus('ACCEPTED');
    if (accepted.length === 0) {
        console.log(`\n  ${C.dim}No accepted quests to resolve.${C.reset}`);
        return;
    }

    console.log(`\n  ${C.bright}⚔ Resolving ${accepted.length} quest(s)...${C.reset}\n`);

    for (const quest of accepted) {
        if (!quest.assignedPatronId) continue;
        const patron = gameState.getPatron(quest.assignedPatronId);
        if (!patron) continue;

        const result = resolveQuest(patron, quest);
        gameState.recordResolution(result);

        // Display math result
        const sc = result.success ? C.green : C.red;
        const st = result.success ? '✅' : '❌';
        console.log(`  ${st} ${sc}${result.success ? 'SUCCESS' : 'FAILED'}${C.reset} — "${quest.originalText.slice(0, 50)}..."`);
        console.log(`     ${patron.name} | Coverage: ${result.dotProduct} vs D=${quest.difficultyScalar} | d20=${result.d20Roll} | P=${(result.probability * 100).toFixed(1)}%`);

        if (result.weakestTags.length > 0) {
            console.log(`     Weak: ${result.weakestTags.map(t => `${C.red}${t}${C.reset}`).join(', ')}`);
        }

        // LLM: Generate structured resolution (story + lore + health in one call)
        console.log(`\n     ${C.dim}📖 Generating tale...${C.reset}`);
        const resolution = await renderResolution(result, patron, quest);

        // Display the short story
        console.log(`\n     ${C.bright}${C.cyan}══ The Tale ══${C.reset}`);
        const storyLines = wordWrap(resolution.story, 70);
        for (const line of storyLines) {
            console.log(`     ${C.white}${line}${C.reset}`);
        }
        console.log(`     ${C.cyan}══════════════${C.reset}`);

        // Update patron health
        patron.healthStatus = resolution.patron_health;
        if (resolution.patron_health === 'DEAD') {
            patron.state = 'DEAD';
        }
        const healthColor = resolution.patron_health === 'HEALTHY' ? C.green :
            resolution.patron_health === 'INJURED' ? C.yellow : C.red;
        console.log(`     ${healthColor}♥ ${patron.name}: ${resolution.patron_health}${C.reset}${resolution.injury_description ? ` — ${C.dim}${resolution.injury_description}${C.reset}` : ''}`);

        // Record lore
        loreChronicle.recordResolution(quest, patron, result, resolution.lore_entry, resolution.story);
        console.log(`     ${C.gray}📚 Lore: ${resolution.lore_entry.slice(0, 80)}...${C.reset}`);

        // DB sync
        if (useDB) {
            try {
                await db.updateQuestStatus(quest.id, result.success ? 'COMPLETED' : 'FAILED', result);
                await db.updatePatronState(patron.id, resolution.patron_health === 'DEAD' ? 'DEAD' : (result.success ? 'LOUNGING' : 'IDLE'));
                await db.insertLoreEntry({
                    questId: quest.id,
                    originalText: quest.originalText,
                    outcome: result.success ? 'COMPLETED' : 'FAILED',
                    patronName: patron.name,
                    patronArchetype: patron.archetype,
                    narrativeSeed: resolution.lore_entry,
                });
            } catch (e) {
                console.log(`     ${C.red}DB sync: ${(e as Error).message}${C.reset}`);
            }
        }

        console.log('');
    }
}

function wordWrap(text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
        if (currentLine.length + word.length + 1 > maxWidth && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = currentLine ? `${currentLine} ${word}` : word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

function viewLore(): void {
    const digest = loreChronicle.toNarrativeDigest();
    console.log(`\n  ${C.bright}📚 Lore Chronicle${C.reset}\n`);
    console.log(`  ${C.dim}${digest}${C.reset}`);
}

function viewLedger(): void {
    const inv = gameState.getInnInventory();
    console.log(`\n  ${C.bright}💰 Inn Ledger & Stash${C.reset}\n`);
    if (inv.length === 0) {
        console.log(`  ${C.dim}The cellar is empty. Complete 'itemRetrieval' quests to gather resources.${C.reset}`);
        return;
    }

    // Sort by highest rarity first
    inv.sort((a, b) => b.rarity - a.rarity);

    for (const item of inv) {
        const r = item.rarity;
        const rarityColor = r >= 85 ? C.magenta : r >= 60 ? C.yellow : r >= 30 ? C.cyan : C.green;
        const rarityLabel = r >= 85 ? 'Legendary' : r >= 60 ? 'Rare' : r >= 30 ? 'Uncommon' : 'Common';

        console.log(`  📦 ${C.bright}${item.quantity}x${C.reset} ${item.name.padEnd(20)} ${rarityColor}[${rarityLabel}] (R:${r.toFixed(1)})${C.reset}`);
    }
}

// ── Lore Guardian Coordinator ───────────────────────────────────────────

async function handleGuardianVisit(rl: readline.Interface, recentLore: string): Promise<void> {
    if (isGuardianActive) return;
    isGuardianActive = true;

    try {
        console.log(`\n  ${C.bright}${C.magenta}✧ ══ THE GUARDIAN OF CHRONICLES HAS ARRIVED ══ ✧${C.reset}`);
        console.log(`  ${C.dim}The air grows still. A celestial figure pores over your recent records...${C.reset}\n`);

        const result = await generateGuardianQuestions(recentLore);

        console.log(`  ${C.magenta}Guardian:${C.reset} "${result.dialogue}"\n`);

        const answers: string[] = [];
        for (let i = 0; i < result.questions.length; i++) {
            const q = result.questions[i];
            console.log(`  ${C.bright}Question ${i + 1}:${C.reset} ${q}`);
            const answer = await askQuestion(rl, 'Your answer (or leave blank to stay silent): ');
            answers.push(answer);
            console.log('');
        }

        console.log(`  ${C.dim}The Guardian nods slowly, their pen weaving light into the parchment...${C.reset}\n`);

        const synthesis = await synthesizeLore(recentLore, result.questions, answers);
        const qAndAText = result.questions.map((q, i) => `Q: ${q}\nA: ${answers[i] || '[Silence]'}`).join('\n\n');

        loreGuardian.finalizeVisit(synthesis, qAndAText);

        console.log(`  ${C.bright}${C.yellow}📜 NEW CHRONICLE SYNTHESIS 📜${C.reset}\n`);
        const wrapped = wordWrap(synthesis, 75);
        wrapped.forEach(line => console.log(`  ${line}`));
        console.log(`\n  ${C.magenta}✧ ════════════════════════════════════════════ ✧${C.reset}\n`);

        if (useDB) {
            try {
                await db.insertLoreEntry({
                    questId: null,
                    originalText: qAndAText,
                    outcome: 'SYNTHESIS',
                    patronName: 'The Chronicle Guardian',
                    patronArchetype: 'Celestial Observer',
                    narrativeSeed: synthesis,
                });
            } catch (e) {
                console.log(`  ${C.red}DB sync failed for Guardian synthesis: ${(e as Error).message}${C.reset}`);
            }
        }
    } catch (error) {
        console.log(`\n  ${C.red}⚠ Guardian visit failed: ${(error as Error).message}${C.reset}`);
        console.log(`  ${C.dim}The Guardian fades into the mist. Perhaps they will return...${C.reset}\n`);
    } finally {
        isGuardianActive = false;
    }
}

// ── Patron Auto-Quest ───────────────────────────────────────────────────

/**
 * When lore > 10 entries and a 50% coin flip succeeds, the arriving
 * patron generates and posts their own quest using the LLM.
 * Can be run manually by enabling the `force` flag.
 */
async function tryPatronAutoQuest(patron: IPatron, force: boolean = false): Promise<void> {
    if (!force) {
        // Guard: need enough world history for meaningful quests
        if (loreChronicle.size < 10) return;

        // 50% chance
        if (Math.random() >= 0.5) return;
    }

    console.log(`\n  ${C.cyan}💬 ${patron.name} scribbles a quest on the board...${C.reset}`);

    try {
        const loreContext = loreChronicle.getRecentLoreContext(5);
        const questText = await generatePatronQuest(patron, loreContext);

        console.log(`  ${C.dim}"${questText}"${C.reset}`);

        // Feed the generated text through the normal quest parser
        const quest = await parseQuestWithLLM(questText);
        quest.postedByPatronId = patron.id;
        gameState.addQuest(quest);

        const tagCount = ALL_SKILL_TAGS.filter(t => quest.requirements[t] > 0).length;
        console.log(`  ${C.green}✓ Patron quest posted!${C.reset} ${C.cyan}[${quest.type}]${C.reset} D=${quest.difficultyScalar} | T=${quest.resolutionTicks} | ${tagCount} tags`);
        if (quest.itemDetails) {
            const r = quest.itemDetails.rarity;
            const rarityColor = r >= 85 ? C.magenta : r >= 60 ? C.yellow : r >= 30 ? C.cyan : C.green;
            console.log(`    📦 ${quest.itemDetails.quantity}x ${C.bright}${quest.itemDetails.itemName}${C.reset} ${rarityColor}(Rarity: ${r.toFixed(2)})${C.reset}`);
        }
        printSkills(quest.requirements, '    ');

        if (useDB) {
            try { await db.insertQuest(quest, 0); } catch (e) {
                console.log(`    ${C.red}DB: ${(e as Error).message}${C.reset}`);
            }
        }
    } catch (error) {
        console.log(`  ${C.red}Auto-quest failed: ${(error as Error).message}${C.reset}`);
    }
}

async function summonPatron(rl: readline.Interface): Promise<void> {
    const archetypes = getArchetypeNames();
    console.log(`\n  ${C.bright}Archetypes:${C.reset}`);
    for (let i = 0; i < archetypes.length; i++) {
        console.log(`    ${C.cyan}${i + 1}${C.reset}. ${archetypes[i]}`);
    }
    console.log(`    ${C.cyan}0${C.reset}. Random`);

    const choiceStr = await askQuestion(rl, 'Choose archetype (add "q" to force quest, e.g. 1q): ');
    const forceQuest = choiceStr.toLowerCase().endsWith('q');
    const choice = parseInt(choiceStr);

    const archetype = choice > 0 && choice <= archetypes.length ? archetypes[choice - 1] : undefined;
    const patron = createPatron(archetype);
    gameState.addPatron(patron);

    if (useDB) {
        try { await db.insertPatron(patron); } catch (e) {
            console.log(`  ${C.red}DB: ${(e as Error).message}${C.reset}`);
        }
    }

    console.log(`\n  ${C.green}✓${C.reset} ${C.magenta}${patron.name}${C.reset} (${patron.archetype}) enters the inn!`);
    printSkills(patron.skills, '    ');

    const narrative = await renderArrivalNarrative(patron);
    console.log(`  ${C.dim}📖 ${narrative}${C.reset}`);

    await tryPatronAutoQuest(patron, forceQuest);
}

async function populateInn(): Promise<void> {
    console.log(`\n  ${C.bright}Summoning one of each archetype...${C.reset}\n`);
    const patrons = createOneOfEach();
    for (const p of patrons) {
        gameState.addPatron(p);
        console.log(`  ${C.green}✓${C.reset} ${C.magenta}${p.name}${C.reset} (${p.archetype})`);

        if (useDB) {
            try { await db.insertPatron(p); } catch (e) {
                console.log(`    ${C.red}DB: ${(e as Error).message}${C.reset}`);
            }
        }

        await tryPatronAutoQuest(p);
    }
    console.log(`\n  ${C.bright}${patrons.length} patrons now in the inn.${C.reset}`);
}

function toggleModes(rl: readline.Interface): Promise<void> {
    return new Promise(async (resolve) => {
        console.log(`\n  ${C.bright}Toggle Modes:${C.reset}`);
        console.log(`    ${C.cyan}1${C.reset}. LLM Quest Parser: ${useLLM ? `${C.green}ON${C.reset}` : `${C.yellow}OFF (mock)${C.reset}`}`);
        console.log(`    ${C.cyan}2${C.reset}. Supabase DB:      ${useDB ? `${C.green}ON${C.reset}` : `${C.yellow}OFF (memory)${C.reset}`}`);
        console.log(`\n  ${C.dim}Note: LLM narration & lore are ALWAYS active at resolution.${C.reset}`);

        const choice = await askQuestion(rl, 'Toggle (1/2): ');
        if (choice === '1') { useLLM = !useLLM; console.log(`  LLM Parser: ${useLLM ? 'ON' : 'OFF'}`); }
        if (choice === '2') { useDB = !useDB; console.log(`  Supabase: ${useDB ? 'ON' : 'OFF'}`); }
        resolve();
    });
}

// ── Main Loop ───────────────────────────────────────────────────────────

export async function startTUI(): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // Subscribe to events for logging
    eventBus.on('patron:arrived', ({ patron }) => {
        // Silently logged — TUI handles display
    });

    eventBus.on('lore:guardian_arrived', ({ recentLore }) => {
        // Since we want to interrupt politely via the TUI, we handle the 
        // trigger explicitly within the loop rather than randomly via the event bus.
    });

    banner();
    console.log(`  ${C.dim}Welcome, Innkeeper. The hearth is cold and the rooms are empty.${C.reset}`);
    console.log(`  ${C.dim}Summon patrons, post quests, and watch the math decide their fate.${C.reset}\n`);

    const loop = async (): Promise<void> => {
        // Auto-trigger Guardian if threshold met
        if (loreChronicle.unacknowledgedEntriesCount >= GUARDIAN_THRESHOLD && !isGuardianActive) {
            const recentLore = loreChronicle.getUnacknowledgedLoreContext();
            await handleGuardianVisit(rl, recentLore);
        }

        showStatus();
        showMenu();

        const choice = await askQuestion(rl, 'Command: ');

        switch (choice.toUpperCase()) {
            case '1': await postQuest(rl); break;
            case '2': await viewPatrons(rl); break;
            case '3': viewQuests(); break;
            case '4': await assignPatron(rl); break;
            case '5': await resolveAll(); break;
            case '6': viewLore(); break;
            case '7': viewLedger(); break;
            case '8': await summonPatron(rl); break;
            case '9': await toggleModes(rl); break;
            case 'G':
                const recentLore = loreChronicle.getUnacknowledgedLoreContext();
                await handleGuardianVisit(rl, recentLore);
                break;
            case 'I': await populateInn(); break;
            case '0':
            case 'exit':
            case 'quit':
                console.log(`\n  ${C.dim}The innkeeper locks the door. The fire dims.${C.reset}\n`);
                rl.close();
                process.exit(0);
            default:
                console.log(`  ${C.red}Unknown command.${C.reset}`);
        }

        // Small pause for readability
        await new Promise(resolve => setTimeout(resolve, 500));
        await loop();
    };

    await loop();
}
