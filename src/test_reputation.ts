import { createPatron } from './core/engine/patronFactory';
import { parseQuestOffline } from './infrastructure/llm/questParser';
import { resolveQuest } from './core/math/probability';
import { gameState } from './core/engine/gameState';

async function testReputation() {
    console.log('Testing Reputation Scaling');

    // 1. Create a patron at 0 reputation
    const earlyWarrior = createPatron('human', 'warrior', 0);
    console.log('Early Warrior (0 Rep) Skills:', earlyWarrior.skills.MeleeWeapon, earlyWarrior.skills.Defense, earlyWarrior.skills.Constitution);

    // 2. Play a Subjugation quest and win
    const quest = parseQuestOffline('Slay the mighty dragon of the west', 0);
    quest.difficultyScalar = 35; // Should grant 35 / 5 = 7 rep

    gameState.addQuest(quest);
    gameState.addPatron(earlyWarrior);
    gameState.assignPatronToQuest(earlyWarrior.id, quest.id);

    // Force success for test
    gameState.recordResolution({
        questId: quest.id,
        patronId: earlyWarrior.id,
        success: true,
        probability: 1.0,
        d20Roll: 20,
        dotProduct: 100,
        weakestTags: [],
        rawRoll: 0
    });

    console.log(`Inn Reputation after success (Expected ~7): ${gameState.reputation}`);

    // 3. Create a patron at 200 reputation (simulating late game)
    gameState.setInnState({ reputation: 200 });
    const lateWarrior = createPatron('human', 'warrior', gameState.reputation);
    console.log('Late Warrior (200 Rep) Skills:', lateWarrior.skills.MeleeWeapon, lateWarrior.skills.Defense, lateWarrior.skills.Constitution);

    if (lateWarrior.skills.MeleeWeapon > earlyWarrior.skills.MeleeWeapon) {
        console.log('SUCCESS: Skills scaled up with reputation.');
    } else {
        console.log('FAILED: Skills did not scale up definitively (could be variance, but 200 rep should be visibly higher).');
    }
}

testReputation().catch(console.error);
