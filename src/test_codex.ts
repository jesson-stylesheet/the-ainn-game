import { parseQuestStructured } from './infrastructure/llm/narrativeRenderer';
import { searchCodexMobByName } from './infrastructure/db/queries';
import { supabase } from './infrastructure/db/supabaseClient';

async function runTest() {
    console.log("🧪 Starting World Codex Tool-Calling Integration Test (5 Iterations)...");
    const questText = "There's a vicious Crimson Deathstalker prowling the Eastern Wastes. I need someone to kill it before it reaches the village.";

    let successes = 0;

    for (let i = 1; i <= 5; i++) {
        console.log(`\n\n=== 🔁 ITERATION ${i} ===`);
        console.log(`🗣️ Parsing Quest: "${questText}"`);

        try {
            await parseQuestStructured(questText, "", 50);

            const mob = await searchCodexMobByName('Crimson Deathstalker');
            if (mob && mob.dangerLevel) {
                console.log(`🎉 SUCCESS (Iteration ${i}): Mob found in DB (${mob.dangerLevel} danger).`);
                successes++;
            } else {
                console.log(`❌ FAILURE (Iteration ${i}): Mob absent or lacked details.`);
            }
        } catch (e: any) {
            console.error(`❌ ERROR (Iteration ${i}):`, e.message);
        }

        // Cleanup before next run
        await supabase.from('codex_mobs').delete().ilike('name', '%Crimson Deathstalker%');
    }

    console.log(`\n\n✅ Final Results: ${successes}/5 runs succeeded seamlessly.`);
    if (successes === 5) {
        console.log("LLM proved robust against 8 concurrent tools!");
    } else {
        console.log("LLM got confused. May need a routing agent.");
    }

    process.exit(0);
}

runTest();
