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
import { createPatron } from '../../core/engine/patronFactory';
import { parseQuestText, analyzeQuestVerbosity } from '../../core/engine/questFactory';
import { gameState } from '../../core/engine/gameState';
import { eventBus } from '../../core/engine/eventBus';
import { loreChronicle } from '../../core/engine/loreChronicle';
import { ticker } from '../../core/engine/ticker';
import { resolveQuest } from '../../core/math/probability';
import { syncAdapter } from '../../infrastructure/db/syncAdapter';
import { narrativeWorker } from '../../core/engine/narrativeWorker';
import * as db from '../../infrastructure/db/queries';
import type { SkillTag, IPatron, IQuest, QuestResolutionResult, ItemCategory, EquipmentSlot } from '../../core/types/entity';
import { ALL_SKILL_TAGS } from '../../core/types/entity';
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
let useDB = true;         // Toggle Supabase persistence (default: on)
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
    console.log(`  ${C.gray}│${C.reset} Player:  ${C.bright}${gameState.playerId}${C.reset.padEnd(35)} ${C.gray}│${C.reset}`);
    console.log(`  ${C.gray}│${C.reset} World:   ${C.dim}${gameState.worldId}${C.reset.padEnd(35)} ${C.gray}│${C.reset}`);
    console.log(`  ${C.gray}│${C.reset} Inn:     ${C.dim}${gameState.innId}${C.reset.padEnd(35)} ${C.gray}│${C.reset}`);
    console.log(`  ${C.gray}├─────────────────────────────────────────┤${C.reset}`);
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
    console.log(`    ${C.cyan}5${C.reset} Check/FastForward Quests  ${C.cyan}E${C.reset} Equip Patron`);
    console.log(`    ${C.cyan}G${C.reset} Summon Lore Guardian (${loreChronicle.unacknowledgedEntriesCount}/${GUARDIAN_THRESHOLD})`);
    console.log(`    ${C.cyan}I${C.reset} Populate Inn (All 9) / ${C.cyan}0${C.reset} Exit`);
    console.log('');
}

// ── Equipment Helpers ───────────────────────────────────────────────────

const CATEGORY_TO_SLOT: Record<string, EquipmentSlot | null> = {
    meleeWeapon: 'righthand',
    magicWeapon: 'righthand',
    rangeWeapon: 'righthand',
    shield: 'lefthand',
    lightHeadGear: 'headwear',
    heavyHeadGear: 'headwear',
    lightBodyArmor: 'bodyArmor',
    heavyBodyArmor: 'bodyArmor',
    lightLegGear: 'legwear',
    heavyLegGear: 'legwear',
    lightFootGear: 'footwear',
    heavyFootGear: 'footwear',
    questItem: null,
    consumables: null,
};

const SLOT_ICONS: Record<EquipmentSlot, string> = {
    righthand: '🗡 ',
    lefthand: '🛡 ',
    headwear: '🪖 ',
    bodyArmor: '🥋 ',
    legwear: '🦿 ',
    footwear: '👢 ',
};

const SLOT_LABELS: Record<EquipmentSlot, string> = {
    righthand: 'Right Hand',
    lefthand: 'Left Hand',
    headwear: 'Head',
    bodyArmor: 'Body',
    legwear: 'Legs',
    footwear: 'Feet',
};

function getRarityLabel(r: number): { label: string; color: string } {
    if (r >= 85) return { label: 'Legendary', color: C.magenta };
    if (r >= 60) return { label: 'Rare', color: C.yellow };
    if (r >= 30) return { label: 'Uncommon', color: C.cyan };
    return { label: 'Common', color: C.green };
}

function formatCategory(cat: string): string {
    return cat.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
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
        try {
            quest = await parseQuestWithLLM(text, gameState.reputation);
        } catch (e) {
            const errName = (e as Error).message;
            if (errName.startsWith('LEGITIMACY_REJECTED:')) {
                const reason = errName.replace('LEGITIMACY_REJECTED:', '');
                console.log(`\n  ${C.red}✗ Quest Rejected!${C.reset}`);
                console.log(`  ${C.yellow}Innkeeper:${C.reset} "${reason}"`);
                return;
            }
            // If it's a different error, log it and return instead of falling back
            console.log(`  ${C.red}LLM parsing failed: ${errName}${C.reset}`);
            return;
        }
    } else {
        quest = parseQuestText(text, gameState.reputation);
    }

    const tagCount = ALL_SKILL_TAGS.filter(t => quest.requirements[t] > 0).length;
    gameState.addQuest(quest);

    console.log(`\n  ${C.green}✓ Quest posted!${C.reset} ${C.cyan}[${quest.type}]${C.reset} D=${quest.difficultyScalar} | T=${quest.resolutionTicks} | ${tagCount} tags`);
    if (quest.itemDetails) {
        const r = quest.itemDetails.rarity;
        const rarityColor = r >= 85 ? C.magenta : r >= 60 ? C.yellow : r >= 30 ? C.cyan : C.green;
        console.log(`    📦 ${quest.itemDetails.quantity}x ${C.bright}${quest.itemDetails.itemName}${C.reset} ${rarityColor}(Rarity: ${r.toFixed(2)})${C.reset}`);
    }
    if (quest.consumedItems) {
        const matStr = quest.consumedItems.map(c => `${c.quantity}x ${c.itemName}`).join(', ');
        console.log(`    🔨 ${C.red}Requires:${C.reset} ${matStr}`);
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

    console.log(`\n  ${C.dim}Press [E] to Evict this patron, or Enter to go back.${C.reset}`);
    const action = await askQuestion(rl, '  Action : ');
    if (action.toUpperCase() === 'E') {
        const p = patrons[idx];
        if (p.state === 'ON_QUEST') {
            console.log(`  ${C.red}✗ ${p.name} is currently on a quest and cannot be evicted.${C.reset}`);
        } else {
            const confirm = await askQuestion(rl, `  ${C.yellow}Are you sure you want to evict ${p.name}? (y/N): ${C.reset}`);
            if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
                const ok = gameState.evictPatron(p.id);
                if (ok) {
                    console.log(`  ${C.green}✓ ${p.name} has been evicted from the inn.${C.reset}`);
                } else {
                    console.log(`  ${C.red}✗ Failed to evict patron.${C.reset}`);
                }
            }
        }
    }
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

    // ── Equipment ──
    console.log(`  ${C.gray}╠══════════════════════════════════════════════╣${C.reset}`);
    console.log(`  ${C.gray}║${C.reset}  ${C.bright}EQUIPMENT${C.reset}`);

    const slots: EquipmentSlot[] = ['headwear', 'bodyArmor', 'legwear', 'footwear', 'righthand', 'lefthand'];
    let hasAny = false;
    for (const slot of slots) {
        const item = p.equipment[slot];
        const icon = SLOT_ICONS[slot];
        const label = SLOT_LABELS[slot].padEnd(11);
        if (item) {
            hasAny = true;
            const { label: rl, color: rc } = getRarityLabel(item.rarity);
            let suffix = '';
            if (item.craftedByPatronId) {
                const crafter = gameState.getPatron(item.craftedByPatronId);
                const crafterName = crafter ? crafter.name : 'Unknown';
                suffix = ` ${C.magenta}(Crafted by ${crafterName})${C.reset}`;
            }
            console.log(`  ${C.gray}║${C.reset}  ${icon}${C.dim}${label}${C.reset} ${C.bright}${item.name}${C.reset} ${rc}[${rl}]${C.reset}${suffix}`);
        } else {
            console.log(`  ${C.gray}║${C.reset}  ${icon}${C.dim}${label} — empty —${C.reset}`);
        }
    }

    // ── Quest Record ──
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
            const prefix = q.type === 'crafting' ? '✨' : '📦';
            detailLine += ` | ${prefix} ${q.itemDetails.quantity}x ${C.bright}${q.itemDetails.itemName}${C.reset} ${rarityColor}(R:${r.toFixed(1)})${C.reset}`;
        }
        console.log(detailLine);
        if (q.consumedItems) {
            const innInv = gameState.getInnInventory();
            let missingStr: string[] = [];
            for (const req of q.consumedItems) {
                const total = innInv.filter(item => item.name.toLowerCase() === req.itemName.toLowerCase()).reduce((sum, item) => sum + item.quantity, 0);
                if (total < req.quantity) {
                    missingStr.push(`${req.quantity - total}x ${req.itemName}`);
                }
            }
            if (missingStr.length > 0) {
                console.log(`      🔨 ${C.red}Missing:${C.reset} ${missingStr.join(', ')}`);
            } else {
                const matStr = q.consumedItems.map(c => `${c.quantity}x ${c.itemName}`).join(', ');
                console.log(`      🔨 ${C.red}Uses:${C.reset} ${matStr}`);
            }
        }
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

    // Explicit check for crafting material shortages so we can print a good error
    if (quest.type === 'crafting' && quest.consumedItems) {
        const innInv = gameState.getInnInventory();
        let missing = false;
        let missingStr: string[] = [];
        for (const req of quest.consumedItems) {
            const total = innInv.filter(i => i.name.toLowerCase() === req.itemName.toLowerCase()).reduce((sum, i) => sum + i.quantity, 0);
            if (total < req.quantity) {
                missing = true;
                missingStr.push(`${req.quantity - total}x ${req.itemName}`);
            }
        }
        if (missing) {
            console.log(`  ${C.red}✗ Cannot assign: missing crafting materials (${missingStr.join(', ')}).${C.reset}`);
            return;
        }
    }

    const result = gameState.assignPatronToQuest(patron.id, quest.id);

    if (result.ok) {
        console.log(`  ${C.green}✓ ${patron.name} accepted "${quest.originalText.slice(0, 40)}..."${C.reset}`);
    } else {
        console.log(`  ${C.red}✗ Assignment failed: ${result.error}${C.reset}`);
    }
}

async function checkQuestProgress(rl: readline.Interface): Promise<void> {
    const accepted = gameState.getQuestsByStatus('ACCEPTED');
    if (accepted.length === 0) {
        console.log(`\n  ${C.dim}No quests currently in progress.${C.reset}`);
        return;
    }

    console.log(`\n  ${C.bright}⏳ Active Quest Progress${C.reset}\n`);

    for (const quest of accepted) {
        const patron = quest.assignedPatronId ? gameState.getPatron(quest.assignedPatronId) : null;
        const pName = patron ? patron.name : 'Unknown';

        const maxTicks = 20;
        const remaining = Math.max(0, quest.resolutionTicks);
        const progress = Math.max(0, maxTicks - remaining);

        const filled = Math.round((progress / maxTicks) * 20);
        const empty = Math.max(0, 20 - filled);
        const bar = `${C.green}${'█'.repeat(filled)}${C.dim}${'░'.repeat(empty)}${C.reset}`;

        console.log(`  ${C.cyan}[${quest.type}]${C.reset} "${quest.originalText.slice(0, 40)}..."`);
        console.log(`      ${C.magenta}${pName}${C.reset} | Ticks Left: ${C.bright}${remaining}${C.reset}  [${bar}]`);
    }
    console.log('');

    const answer = await askQuestion(rl, `  ${C.yellow}Fast-forward all active quests to completion? (y/N): ${C.reset}`);
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        let count = 0;
        for (const quest of accepted) {
            quest.resolutionTicks = 0;
            count++;
        }
        console.log(`\n  ${C.green}▶ Fast-forwarded ${count} quest(s). They will resolve on the next tick.${C.reset}`);
        // Force an immediate tick to harvest them right now
        ticker.tick();
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
    console.log(`\n  ${C.bright}💰 Inn Ledger & Stash${C.reset}`);
    console.log(`  ${C.dim}Gold: ${gameState.innGold}g ${gameState.innCopper}c  │  Reputation: ${gameState.reputation}${C.reset}\n`);

    if (inv.length === 0) {
        console.log(`  ${C.dim}The cellar is empty. Complete 'itemRetrieval' quests to gather resources.${C.reset}`);
        return;
    }

    // Sort by highest rarity first
    inv.sort((a, b) => b.rarity - a.rarity);

    for (const item of inv) {
        const { label: rarityLabel, color: rarityColor } = getRarityLabel(item.rarity);
        const catDisplay = formatCategory(item.category);
        const equippable = CATEGORY_TO_SLOT[item.category] !== null;
        const equipTag = equippable ? `${C.cyan}⚔${C.reset}` : `${C.dim}·${C.reset}`;

        let suffix = '';
        if (item.craftedByPatronId) {
            const crafter = gameState.getPatron(item.craftedByPatronId);
            const crafterName = crafter ? crafter.name : 'Unknown';
            suffix = ` ${C.magenta}(Crafted by ${crafterName})${C.reset}`;
        }
        console.log(`  ${equipTag} ${C.bright}${item.quantity}x${C.reset} ${item.name.padEnd(22)} ${C.dim}${catDisplay.padEnd(16)}${C.reset} ${rarityColor}[${rarityLabel}] (R:${item.rarity.toFixed(1)})${C.reset}${suffix}`);
    }
    console.log(`\n  ${C.dim}⚔ = equippable  · = not equippable${C.reset}`);
}

// ── Equip Patron ────────────────────────────────────────────────────────

async function equipPatron(rl: readline.Interface): Promise<void> {
    // 1. List available patrons (IDLE or LOUNGING)
    const availablePatrons = gameState.getAllPatrons().filter(
        p => p.state === 'IDLE' || p.state === 'LOUNGING'
    );
    if (availablePatrons.length === 0) {
        console.log(`\n  ${C.red}No idle or lounging patrons to equip.${C.reset}`);
        return;
    }

    // 2. List equippable items in the inn vault
    const vaultItems = gameState.getInnInventory().filter(
        item => CATEGORY_TO_SLOT[item.category] !== null && CATEGORY_TO_SLOT[item.category] !== undefined
    );
    if (vaultItems.length === 0) {
        console.log(`\n  ${C.red}No equippable items in the Inn vault.${C.reset}`);
        console.log(`  ${C.dim}Complete 'itemRetrieval' quests for weapons, armor, and shields.${C.reset}`);
        return;
    }

    // Show patrons
    console.log(`\n  ${C.bright}Available Patrons:${C.reset}`);
    availablePatrons.forEach((p, i) => {
        const equipped = Object.values(p.equipment).filter(Boolean).length;
        console.log(`    ${C.cyan}${i + 1}${C.reset}. ${C.bright}${p.name}${C.reset} (${p.archetype}) ${C.dim}[${equipped}/6 slots]${C.reset}`);
    });

    const patronChoice = await askQuestion(rl, '\n  Select patron #: ');
    const pIdx = parseInt(patronChoice) - 1;
    if (isNaN(pIdx) || pIdx < 0 || pIdx >= availablePatrons.length) {
        console.log(`  ${C.red}Invalid selection.${C.reset}`);
        return;
    }
    const patron = availablePatrons[pIdx];

    // Show equippable items
    console.log(`\n  ${C.bright}Inn Vault — Equipment:${C.reset}`);
    vaultItems.forEach((item, i) => {
        const slot = CATEGORY_TO_SLOT[item.category]!;
        const { label: rl, color: rc } = getRarityLabel(item.rarity);
        const catDisplay = formatCategory(item.category);
        const currentOccupant = patron.equipment[slot];
        const conflict = currentOccupant ? ` ${C.yellow}(replaces: ${currentOccupant.name})${C.reset}` : '';

        console.log(`    ${C.cyan}${i + 1}${C.reset}. ${C.bright}${item.name}${C.reset} ${C.dim}${catDisplay}${C.reset} ${rc}[${rl}]${C.reset} → ${SLOT_ICONS[slot]}${SLOT_LABELS[slot]}${conflict}`);
    });

    const itemChoice = await askQuestion(rl, '\n  Select item # (or 0 to cancel): ');
    const iIdx = parseInt(itemChoice) - 1;
    if (isNaN(iIdx) || iIdx < 0 || iIdx >= vaultItems.length) {
        console.log(`  ${C.dim}Cancelled.${C.reset}`);
        return;
    }
    const item = vaultItems[iIdx];
    const slot = CATEGORY_TO_SLOT[item.category]!;

    // Equip it
    const ok = gameState.equipItem(patron.id, item.id, slot);
    if (ok) {
        const { label: rl, color: rc } = getRarityLabel(item.rarity);
        console.log(`\n  ${C.green}✓ ${patron.name} equipped ${rc}${item.name}${C.reset}${C.green} in ${SLOT_LABELS[slot]}.${C.reset}`);
    } else {
        console.log(`  ${C.red}✗ Failed to equip item.${C.reset}`);
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
        const quest = await parseQuestWithLLM(questText, gameState.reputation);
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
    } catch (error) {
        console.log(`  ${C.red}Auto-quest failed: ${(error as Error).message}${C.reset}`);
    }
}

async function summonPatron(rl: readline.Interface): Promise<void> {
    const jobs = ['Warrior', 'Archer', 'Miner', 'Mechanic', 'Necromancer', 'Wizard', 'Berserker', 'Cleric', 'Geisha', 'Bard', 'Rogue', 'Artisan'];
    console.log(`\n  ${C.bright}Summon Options:${C.reset}`);
    for (let i = 0; i < jobs.length; i++) {
        console.log(`    ${C.cyan}${i + 1}${C.reset}. Random Race + ${jobs[i]}`);
    }
    console.log(`    ${C.cyan}0${C.reset}. Fully Random (Race & Job via CSV Matrix)`);

    const choiceStr = await askQuestion(rl, 'Choose option (add "q" to force quest, e.g. 1q): ');
    const forceQuest = choiceStr.toLowerCase().endsWith('q');
    const choice = parseInt(choiceStr);

    let patron: ReturnType<typeof createPatron>;
    if (choice > 0 && choice <= jobs.length) {
        // User picked a specific Job, race is still fully random.
        // We need to parse the job string to the type expected by createPatron (lowercase)
        const jobKey = jobs[choice - 1].toLowerCase() as any;
        patron = createPatron(undefined, jobKey, gameState.reputation);
    } else {
        // Fully random
        patron = createPatron(undefined, undefined, gameState.reputation);
    }

    gameState.addPatron(patron);

    console.log(`\n  ${C.green}✓${C.reset} ${C.magenta}${patron.name}${C.reset} (${patron.archetype}) enters the inn!`);
    printSkills(patron.skills, '    ');

    const narrative = await renderArrivalNarrative(patron);
    console.log(`  ${C.dim}📖 ${narrative}${C.reset}`);

    await tryPatronAutoQuest(patron, forceQuest);
}

async function populateInn(): Promise<void> {
    console.log(`\n  ${C.bright}Summoning 9 random patrons using CSV matrix...${C.reset}\n`);
    for (let i = 0; i < 9; i++) {
        const p = createPatron(undefined, undefined, gameState.reputation);
        gameState.addPatron(p);
        console.log(`  ${C.green}✓${C.reset} ${C.magenta}${p.name}${C.reset} (${p.archetype})`);

        await tryPatronAutoQuest(p);
    }
    console.log(`\n  ${C.bright}9 patrons now in the inn.${C.reset}`);
}

function toggleModes(rl: readline.Interface): Promise<void> {
    return new Promise(async (resolve) => {
        console.log(`\n  ${C.bright}Toggle Modes:${C.reset}`);
        console.log(`    ${C.cyan}1${C.reset}. LLM Quest Parser: ${useLLM ? `${C.green}ON${C.reset}` : `${C.yellow}OFF (mock)${C.reset}`}`);
        console.log(`    ${C.cyan}2${C.reset}. Supabase DB:      ${useDB ? `${C.green}ON${C.reset}` : `${C.yellow}OFF (memory)${C.reset}`}`);
        console.log(`\n  ${C.dim}Note: LLM narration & lore are ALWAYS active at resolution.${C.reset}`);

        const choice = await askQuestion(rl, 'Toggle (1/2): ');
        if (choice === '1') { useLLM = !useLLM; console.log(`  LLM Parser: ${useLLM ? 'ON' : 'OFF'}`); }
        if (choice === '2') {
            useDB = !useDB;
            process.env.USE_DB = useDB ? 'true' : 'false';
            console.log(`  Supabase: ${useDB ? 'ON' : 'OFF'}`);
        }
        resolve();
    });
}

// ── Login Flow ──────────────────────────────────────────────────────────

async function loginFlow(rl: readline.Interface): Promise<void> {
    console.clear();
    console.log(`${C.bright}${C.cyan}  ╔════════════════════════════════════════════════╗`);
    console.log(`  ║           ⚔  THE AINN  ⚔                     ║`);
    console.log(`  ║      An Innkeeper's Management Simulation     ║`);
    console.log(`  ╚════════════════════════════════════════════════╝${C.reset}\n`);

    // 1. Auto-login as the specific user
    const playerId = '8307544f-4b84-426a-a9c7-ae51438ee777';
    console.log(`  ${C.dim}Logging in as Player: ${playerId}...${C.reset}\n`);

    // 2. World Selection
    let worldId = '';
    const worlds = await db.fetchWorlds();
    if (worlds.length === 0) {
        console.log(`  ${C.yellow}No worlds found. Creating a new world...${C.reset}`);
        const name = await askQuestion(rl, 'Enter new world name: ');
        worldId = await db.createWorld(name || 'New World');
        console.log(`  ${C.green}✓ World created.${C.reset}\n`);
    } else {
        console.log(`  ${C.bright}Available Worlds:${C.reset}`);
        worlds.forEach((w, i) => console.log(`    ${C.cyan}${i + 1}${C.reset}. ${w.name} ${C.dim}(${w.id})${C.reset}`));
        console.log(`    ${C.cyan}N${C.reset}. Create New World`);

        const wChoice = await askQuestion(rl, '\n  Select World: ');
        if (wChoice.toUpperCase() === 'N') {
            const name = await askQuestion(rl, 'Enter new world name: ');
            worldId = await db.createWorld(name || 'New World');
            console.log(`  ${C.green}✓ World created.${C.reset}\n`);
        } else {
            const idx = parseInt(wChoice) - 1;
            if (!isNaN(idx) && idx >= 0 && idx < worlds.length) {
                worldId = worlds[idx].id;
            } else {
                console.log(`  ${C.red}Invalid choice, defaulting to first world.${C.reset}\n`);
                worldId = worlds[0].id;
            }
        }
    }

    // 3. Inn Selection
    let innId = '';
    const inns = await db.fetchInns(worldId, playerId);
    if (inns.length === 0) {
        console.log(`  ${C.yellow}No inns found in this world for your player. Creating a new inn...${C.reset}`);
        const name = await askQuestion(rl, 'Enter new inn name: ');
        innId = await db.createInn(worldId, playerId, name || 'The Rusty Mug');
        console.log(`  ${C.green}✓ Inn created.${C.reset}\n`);
    } else {
        console.log(`  ${C.bright}Your Inns in this World:${C.reset}`);
        inns.forEach((inn, i) => console.log(`    ${C.cyan}${i + 1}${C.reset}. ${inn.name} ${C.dim}(${inn.id})${C.reset}`));
        console.log(`    ${C.cyan}N${C.reset}. Create New Inn`);

        const iChoice = await askQuestion(rl, '\n  Select Inn: ');
        if (iChoice.toUpperCase() === 'N') {
            const name = await askQuestion(rl, 'Enter new inn name: ');
            innId = await db.createInn(worldId, playerId, name || 'The Rusty Mug');
            console.log(`  ${C.green}✓ Inn created.${C.reset}\n`);
        } else {
            const idx = parseInt(iChoice) - 1;
            if (!isNaN(idx) && idx >= 0 && idx < inns.length) {
                innId = inns[idx].id;
            } else {
                console.log(`  ${C.red}Invalid choice, defaulting to first inn.${C.reset}\n`);
                innId = inns[0].id;
            }
        }
    }

    // 4. Set Identifiers
    gameState.setIdentifiers(playerId, worldId, innId);
    console.log(`  ${C.green}✓ Game State Initialized.${C.reset}\n`);
}

// ── Main Loop ───────────────────────────────────────────────────────────

export async function startTUI(): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // Ensure backend adapters see DB as enabled by default in TUI
    if (useDB) process.env.USE_DB = 'true';

    // Run Login Flow
    if (useDB) {
        try {
            await loginFlow(rl);
        } catch (e) {
            console.error(`\n  ${C.red}Failed to initialize game state from DB: ${(e as Error).message}${C.reset}`);
            console.log(`  ${C.yellow}Falling back to mock identifiers...${C.reset}\n`);
            gameState.setIdentifiers(
                '8307544f-4b84-426a-a9c7-ae51438ee777',
                '00000000-0000-0000-0000-000000000002',
                '00000000-0000-0000-0000-000000000003'
            );
        }
    } else {
        gameState.setIdentifiers(
            '8307544f-4b84-426a-a9c7-ae51438ee777',
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000003'
        );
    }

    // Initialize background LLM and DB workers
    narrativeWorker.init();
    syncAdapter.init();

    // Hydrate state from DB if enabled
    if (useDB) {
        await syncAdapter.hydrateGameState();
    }

    // Start the game loop automatically
    ticker.start();

    // Subscribe to events for logging
    eventBus.on('patron:arrived', ({ patron }) => {
        // Silently logged — TUI handles display
    });

    eventBus.on('lore:guardian_arrived', ({ recentLore }) => {
        // Since we want to interrupt politely via the TUI, we handle the 
        // trigger explicitly within the loop rather than randomly via the event bus.
    });

    // Wire up events that would previously happen inside resolveAll
    eventBus.on('quest:resolved', ({ result, patron, quest }) => {
        const sc = result.success ? C.green : C.red;
        const st = result.success ? '✅' : '❌';
        console.log(`\n  ${st} ${sc}${result.success ? 'SUCCESS' : 'FAILED'}${C.reset} — "${quest.originalText.slice(0, 50)}..."`);
        console.log(`     ${patron.name} | Coverage: ${result.dotProduct} vs D=${quest.difficultyScalar} | d20=${result.d20Roll} | P=${(result.probability * 100).toFixed(1)}%`);
        if (result.weakestTags.length > 0) {
            console.log(`     Weak: ${result.weakestTags.map(t => `${C.red}${t}${C.reset}`).join(', ')}`);
        }
        console.log(`     ${C.dim}📖 Generating tale in background...${C.reset}\n`);
        rl.prompt(true);
    });

    eventBus.on('narrative:completed', (data) => {
        const patronName = gameState.getPatron(data.patronId)?.name || 'Unknown';
        console.log(`\n     ${C.bright}${C.cyan}══ The Tale of ${patronName} ══${C.reset}`);
        const storyLines = wordWrap(data.story, 70);
        for (const line of storyLines) {
            console.log(`     ${C.white}${line}${C.reset}`);
        }
        console.log(`     ${C.cyan}═══════════════════════════════${C.reset}`);

        const healthColor = data.patronHealth === 'HEALTHY' ? C.green :
            data.patronHealth === 'INJURED' ? C.yellow : C.red;

        console.log(`     ${healthColor}♥ ${patronName}: ${data.patronHealth}${C.reset}${data.injuryDescription ? ` — ${C.dim}${data.injuryDescription}${C.reset}` : ''}`);
        console.log(`     ${C.gray}📚 Lore: ${data.loreEntry.slice(0, 80)}...${C.reset}\n`);
        rl.prompt(true);
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
            case '5': await checkQuestProgress(rl); break;
            case '6': viewLore(); break;
            case '7': viewLedger(); break;
            case '8': await summonPatron(rl); break;
            case '9': await toggleModes(rl); break;
            case 'G':
                const recentLore = loreChronicle.getUnacknowledgedLoreContext();
                await handleGuardianVisit(rl, recentLore);
                break;
            case 'E': await equipPatron(rl); break;
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
