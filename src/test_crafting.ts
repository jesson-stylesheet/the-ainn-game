/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Crafting Quest Deterministic Test
 * ═══════════════════════════════════════════════════════════════════════
 * Tests the full crafting flow with forced 100% success:
 *   1. Seed the inn vault with crafting materials
 *   2. Post a crafting quest
 *   3. Assign a patron
 *   4. Verify materials are consumed
 *   5. Force a successful resolution
 *   6. Verify the crafted item appears with correct attribution
 *
 * Run:  npx tsx src/test_crafting.ts
 */

import { gameState } from './core/engine/gameState';
import { generateUUID } from './core/engine/utils';
import type { IPatron, IQuest, IItem, SkillVector, QuestResolutionResult } from './core/types/entity';
import { createEmptyEquipment } from './core/types/entity';

// ── Helpers ─────────────────────────────────────────────────────────────

const C = {
    green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', dim: '\x1b[2m', bright: '\x1b[1m',
    reset: '\x1b[0m', magenta: '\x1b[35m',
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
    if (condition) {
        console.log(`  ${C.green}✓ PASS${C.reset} ${label}`);
        passed++;
    } else {
        console.log(`  ${C.red}✗ FAIL${C.reset} ${label}${detail ? ` — ${detail}` : ''}`);
        failed++;
    }
}

function separator(title: string) {
    console.log(`\n${C.cyan}${'═'.repeat(60)}${C.reset}`);
    console.log(`${C.bright}  ${title}${C.reset}`);
    console.log(`${C.cyan}${'═'.repeat(60)}${C.reset}\n`);
}

// ── Test Data ───────────────────────────────────────────────────────────

function createTestPatron(): IPatron {
    const skills: SkillVector = {
        Bravery: 10, Defense: 10, Charisma: 5, Constitution: 10,
        MeleeWeapon: 12, LongRangeWeapon: 5, Agility: 8, Navigation: 6,
        Cooking: 4, Foraging: 3, Fishing: 3, Curiosity: 5,
        BasicMagic: 3, DarkMagic: 2, HolyMagic: 2,
        Mining: 6, Crafting: 20, Intelligent: 8, Dexterity: 15, Alchemy: 4,
    };
    return {
        id: generateUUID(),
        name: 'Testforge the Crafter',
        archetype: 'Dwarven Mechanic',
        skills,
        state: 'IDLE',
        healthStatus: 'HEALTHY',
        arrivalTimestamp: Date.now(),
        equipment: createEmptyEquipment(),
        inventory: [],
        gold: 50,
        copper: 0,
    };
}

function createIronOre(qty: number): IItem {
    return {
        id: generateUUID(),
        name: 'Iron Ore',
        category: 'questItem',
        rarity: 25,
        quantity: qty,
        ownerPatronId: null,
        equippedSlot: null,
        location: 'INN_VAULT',
        sourceQuestId: null,
        craftedByPatronId: null,
    };
}

function createCoal(qty: number): IItem {
    return {
        id: generateUUID(),
        name: 'Coal',
        category: 'consumables',
        rarity: 15,
        quantity: qty,
        ownerPatronId: null,
        equippedSlot: null,
        location: 'INN_VAULT',
        sourceQuestId: null,
        craftedByPatronId: null,
    };
}

function createCraftingQuest(consumedItems: { itemName: string; quantity: number }[]): IQuest {
    return {
        id: generateUUID(),
        originalText: 'Forge an Iron Sword from raw materials',
        type: 'crafting',
        requirements: { Crafting: 18, Dexterity: 12 } as SkillVector,
        difficultyScalar: 15,
        resolutionTicks: 1,
        assignedPatronId: null,
        postedByPatronId: null,
        status: 'POSTED',
        deadlineTimestamp: Date.now() + 60_000,
        itemDetails: {
            itemName: 'Iron Sword',
            category: 'meleeWeapon',
            quantity: 1,
            rarity: 40,
        },
        consumedItems,
    };
}

// ── Tests ───────────────────────────────────────────────────────────────

function runTests() {
    separator('TEST 1: Material Consumption on Assignment');
    {
        // Setup: Add patron, items, and quest
        const patron = createTestPatron();
        gameState.addPatron(patron);

        const ore = createIronOre(5);
        const coal = createCoal(3);
        gameState.addItem(ore);
        gameState.addItem(coal);

        const quest = createCraftingQuest([
            { itemName: 'Iron Ore', quantity: 3 },
            { itemName: 'Coal', quantity: 2 },
        ]);
        gameState.addQuest(quest);

        // Before assignment — snapshot inventory
        const invBefore = gameState.getInnInventory();
        const oreBefore = invBefore.filter(i => i.name.toLowerCase() === 'iron ore').reduce((s, i) => s + i.quantity, 0);
        const coalBefore = invBefore.filter(i => i.name.toLowerCase() === 'coal').reduce((s, i) => s + i.quantity, 0);
        console.log(`  ${C.dim}Before: ${oreBefore}x Iron Ore, ${coalBefore}x Coal${C.reset}`);

        assert(oreBefore === 5, 'Pre-assign: 5x Iron Ore in vault');
        assert(coalBefore === 3, 'Pre-assign: 3x Coal in vault');

        // Assign patron to quest
        const assignResult = gameState.assignPatronToQuest(patron.id, quest.id);
        assert(assignResult === true, 'Assignment succeeded');

        // After assignment — check consumption
        const invAfter = gameState.getInnInventory();
        const oreAfter = invAfter.filter(i => i.name.toLowerCase() === 'iron ore').reduce((s, i) => s + i.quantity, 0);
        const coalAfter = invAfter.filter(i => i.name.toLowerCase() === 'coal').reduce((s, i) => s + i.quantity, 0);
        console.log(`  ${C.dim}After:  ${oreAfter}x Iron Ore, ${coalAfter}x Coal${C.reset}`);

        assert(oreAfter === 2, `Iron Ore consumed: 5 - 3 = 2 (got ${oreAfter})`);
        assert(coalAfter === 1, `Coal consumed: 3 - 2 = 1 (got ${coalAfter})`);

        // Patron should be ON_QUEST
        const p = gameState.getPatron(patron.id);
        assert(p?.state === 'ON_QUEST', `Patron state is ON_QUEST (got ${p?.state})`);
    }

    separator('TEST 2: Case-Insensitive Material Matching');
    {
        const patron2 = createTestPatron();
        patron2.name = 'Caseless Crafter';
        gameState.addPatron(patron2);

        // Add items with mixed-case names
        const mixedOre: IItem = {
            id: generateUUID(), name: 'iron ore', category: 'questItem',
            rarity: 25, quantity: 5, ownerPatronId: null, equippedSlot: null,
            location: 'INN_VAULT', sourceQuestId: null, craftedByPatronId: null,
        };
        gameState.addItem(mixedOre);

        // Quest requires "Iron Ore" (title case), vault has "iron ore" (lowercase)
        const quest2 = createCraftingQuest([{ itemName: 'Iron Ore', quantity: 3 }]);
        gameState.addQuest(quest2);

        const result = gameState.assignPatronToQuest(patron2.id, quest2.id);
        assert(result === true, 'Case-insensitive assignment succeeded ("Iron Ore" matched "iron ore")');

        const remaining = gameState.getInnInventory()
            .filter(i => i.name.toLowerCase() === 'iron ore')
            .reduce((s, i) => s + i.quantity, 0);
        // We had 2 left from test 1 + 5 from this test = 7 total, consumed 3 → 4
        assert(remaining === 4, `Case-insensitive consumption: expected 4 remaining (got ${remaining})`);
    }

    separator('TEST 3: Insufficient Materials Rejects Assignment');
    {
        const patron3 = createTestPatron();
        patron3.name = 'Unlucky Crafter';
        gameState.addPatron(patron3);

        // Quest requires 100x Iron Ore — way more than we have
        const quest3 = createCraftingQuest([{ itemName: 'Iron Ore', quantity: 100 }]);
        gameState.addQuest(quest3);

        const result = gameState.assignPatronToQuest(patron3.id, quest3.id);
        assert(result === false, 'Assignment rejected: insufficient materials');

        const p = gameState.getPatron(patron3.id);
        assert(p?.state === 'IDLE', `Patron remains IDLE when materials insufficient (got ${p?.state})`);
    }

    separator('TEST 4: Forced SUCCESS — Crafted Item Deposit');
    {
        const patron4 = createTestPatron();
        patron4.name = 'Mastersmith';
        gameState.addPatron(patron4);

        // Add enough materials
        gameState.addItem(createIronOre(5));
        gameState.addItem(createCoal(3));

        const quest4 = createCraftingQuest([
            { itemName: 'Iron Ore', quantity: 3 },
            { itemName: 'Coal', quantity: 2 },
        ]);
        gameState.addQuest(quest4);

        // Assign (will consume materials)
        gameState.assignPatronToQuest(patron4.id, quest4.id);

        // Count items before resolution
        const itemCountBefore = gameState.getInnInventory().length;

        // Force a 100% success resolution result
        const forcedResult: QuestResolutionResult = {
            questId: quest4.id,
            patronId: patron4.id,
            success: true,
            probability: 1.0,
            d20Roll: 20,
            dotProduct: 50,
            weakestTags: [],
            rawRoll: 0.01,
        };

        gameState.recordResolution(forcedResult);

        // Check the crafted item appeared
        const innInv = gameState.getInnInventory();
        const craftedItems = innInv.filter(i => i.name === 'Iron Sword');
        assert(craftedItems.length === 1, `Crafted "Iron Sword" deposited in vault (found ${craftedItems.length})`);

        if (craftedItems.length > 0) {
            const sword = craftedItems[0];
            assert(sword.category === 'meleeWeapon', `Category = meleeWeapon (got ${sword.category})`);
            assert(sword.rarity === 40, `Rarity = 40 (got ${sword.rarity})`);
            assert(sword.quantity === 1, `Quantity = 1 (got ${sword.quantity})`);
            assert(sword.location === 'INN_VAULT', `Location = INN_VAULT (got ${sword.location})`);
            assert(sword.craftedByPatronId === patron4.id, `craftedByPatronId matches patron (got ${sword.craftedByPatronId})`);
            assert(sword.sourceQuestId === quest4.id, `sourceQuestId matches quest (got ${sword.sourceQuestId})`);
            console.log(`\n  ${C.magenta}🔨 Crafted Item: "${sword.name}" (Crafted by ${patron4.name})${C.reset}`);
            console.log(`     Category: ${sword.category} | Rarity: ${sword.rarity} | Qty: ${sword.quantity}`);
        }

        // Quest should be COMPLETED
        const q = gameState.getQuest(quest4.id);
        assert(q?.status === 'COMPLETED', `Quest status = COMPLETED (got ${q?.status})`);

        // Patron should be LOUNGING after success
        const p = gameState.getPatron(patron4.id);
        assert(p?.state === 'LOUNGING', `Patron state = LOUNGING after success (got ${p?.state})`);
    }

    separator('TEST 5: Forced FAILURE — No Crafted Item');
    {
        const patron5 = createTestPatron();
        patron5.name = 'Fumbles McDropforge';
        gameState.addPatron(patron5);

        gameState.addItem(createIronOre(5));

        const quest5 = createCraftingQuest([{ itemName: 'Iron Ore', quantity: 3 }]);
        gameState.addQuest(quest5);

        gameState.assignPatronToQuest(patron5.id, quest5.id);

        // Force a FAILURE
        const failedResult: QuestResolutionResult = {
            questId: quest5.id,
            patronId: patron5.id,
            success: false,
            probability: 0.3,
            d20Roll: 3,
            dotProduct: 10,
            weakestTags: ['Dexterity'],
            rawRoll: 0.99,
        };

        const swordsBefore = gameState.getInnInventory().filter(i => i.name === 'Iron Sword').length;
        gameState.recordResolution(failedResult);
        const swordsAfter = gameState.getInnInventory().filter(i => i.name === 'Iron Sword').length;

        assert(swordsAfter === swordsBefore, `No new Iron Sword on failure (before: ${swordsBefore}, after: ${swordsAfter})`);

        const q = gameState.getQuest(quest5.id);
        assert(q?.status === 'FAILED', `Quest status = FAILED (got ${q?.status})`);

        // Materials should STILL be consumed (they were consumed on assignment, not refunded)
        const oreRemaining = gameState.getInnInventory()
            .filter(i => i.name.toLowerCase() === 'iron ore')
            .reduce((s, i) => s + i.quantity, 0);
        console.log(`  ${C.dim}Iron Ore remaining after failed craft: ${oreRemaining}${C.reset}`);
    }

    // ── Summary ─────────────────────────────────────────────────────────

    separator('RESULTS');
    console.log(`  ${C.green}Passed: ${passed}${C.reset}`);
    console.log(`  ${failed > 0 ? C.red : C.dim}Failed: ${failed}${C.reset}`);
    console.log();

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
