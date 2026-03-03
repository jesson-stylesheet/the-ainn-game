/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Narrative Renderer (Orchestrator)
 * ═══════════════════════════════════════════════════════════════════════
 * Thin orchestrator that wires prompts + schemas → LLM calls.
 * All prompts live in ./prompts/, all schemas in ./schemas/.
 */

import { chatCompletionStructured, chatCompletion } from './openRouterClient';
import type { IPatron, IQuest, QuestResolutionResult, PatronHealthStatus } from '../../core/types/entity';
import { ALL_SKILL_TAGS } from '../../core/types/entity';
import { loreChronicle } from '../../core/engine/loreChronicle';
import { CODEX_TOOLS, CODEX_HANDLERS } from './codexTools';
import { searchCodexMobSemantic, searchCodexItemSemantic, searchCodexFactionSemantic } from '../db/queries';

// ── Centralized imports ────────────────────────────────────────────────
import { RESOLUTION_SYSTEM_PROMPT, getQuestParserSystemPrompt, ARRIVAL_SYSTEM_PROMPT, ITEM_DEDUP_SYSTEM_PROMPT, PATRON_QUEST_GEN_SYSTEM_PROMPT, GUARDIAN_QUESTION_PROMPT, GUARDIAN_SYNTHESIS_PROMPT, CODEX_SYNC_SYSTEM_PROMPT } from './prompts/systemPrompts';
import { RESOLUTION_SCHEMA, QUEST_PARSE_SCHEMA, ITEM_DEDUP_SCHEMA, GUARDIAN_QUESTION_SCHEMA } from './schemas/jsonSchemas';
import type { ResolutionNarrative, QuestParseResult, ItemDedupResult, GuardianQuestionResult } from './schemas/responseTypes';
import { getSkillBudgetForReputation } from '../../core/engine/utils';

// Re-export types so consumers don't need to change their imports
export type { ResolutionNarrative, QuestParseResult, ItemDedupResult, GuardianQuestionResult };

// ── Quest Resolution Narrative ──────────────────────────────────────────

/**
 * Generate the full resolution narrative using structured output.
 * Returns: story, lore entry, and patron health status.
 */
export async function renderResolution(
    result: QuestResolutionResult,
    patron: IPatron,
    quest: IQuest
): Promise<ResolutionNarrative> {
    const prompt = `Narrate this quest outcome:

QUEST: "${quest.originalText}"
PATRON: ${patron.name} (${patron.archetype}) [currently ${patron.healthStatus}]
OUTCOME: ${result.success ? 'SUCCESS' : 'FAILURE'}

MATH:
- Coverage: ${result.dotProduct} vs Difficulty: ${quest.difficultyScalar}
- d20: ${result.d20Roll}/20
- P(Success): ${(result.probability * 100).toFixed(1)}%
- Fate: ${result.rawRoll.toFixed(3)} ${result.success ? '≤' : '>'} ${result.probability.toFixed(3)}
- Weak Skills: ${result.weakestTags.length > 0 ? result.weakestTags.join(', ') : 'None (Perfectly Qualified)'}
- Top Patron Skills: ${getTopSkills(patron, 4)}`;

    try {
        return await chatCompletionStructured<ResolutionNarrative>(
            [
                { role: 'system', content: RESOLUTION_SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            RESOLUTION_SCHEMA,
            {
                model: 'google/gemini-3-flash-preview',
                temperature: 0.8,
                maxTokens: 600,
                tools: CODEX_TOOLS,
                toolHandlers: CODEX_HANDLERS,
                tool_choice: 'auto'
            }
        );
    } catch (error) {
        console.warn(`⚠ Structured resolution failed, using fallback:`, (error as Error).message);
        return generateFallbackResolution(result, patron, quest);
    }
}

// ── Quest Parsing ───────────────────────────────────────────────────────

/**
 * Parse quest text using the LLM with structured output.
 */
export async function parseQuestStructured(text: string, inventoryContext: string = '', innReputation: number = 0): Promise<QuestParseResult> {
    const contextStr = inventoryContext ? `\n\nINN INVENTORY (for crafting quests MUST USE):\n${inventoryContext}` : '';
    const { minBudget, maxBudget } = getSkillBudgetForReputation(innReputation);
    return chatCompletionStructured<QuestParseResult>(
        [
            { role: 'system', content: getQuestParserSystemPrompt(minBudget, maxBudget) },
            { role: 'user', content: `Parse this quest:\n\n"${text}"${contextStr}` },
        ],
        QUEST_PARSE_SCHEMA,
        {
            model: 'google/gemini-2.5-flash',
            temperature: 0.2,
            maxTokens: 512,
            tools: CODEX_TOOLS,
            toolHandlers: CODEX_HANDLERS,
            tool_choice: 'auto'
        }
    );
}

// ── Item Deduplication ──────────────────────────────────────────────────

/**
 * Check if a new item name matches an existing item in the inventory.
 * Returns the canonical (deduplicated) name to use.
 * Skips the LLM call if inventory is empty (nothing to compare against).
 */
export async function deduplicateItemName(
    newItemName: string,
    existingItems: string[]
): Promise<{ canonicalName: string; wasDeduped: boolean; reasoning: string }> {
    // Nothing to compare against — the new name IS the canonical name
    if (existingItems.length === 0) {
        return { canonicalName: newItemName, wasDeduped: false, reasoning: 'First item in inventory.' };
    }

    try {
        const result = await chatCompletionStructured<ItemDedupResult>(
            [
                { role: 'system', content: ITEM_DEDUP_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `NEW ITEM: "${newItemName}"\n\nEXISTING INVENTORY:\n${existingItems.map((name, i) => `${i + 1}. "${name}"`).join('\n')}`,
                },
            ],
            ITEM_DEDUP_SCHEMA,
            { model: 'google/gemini-2.5-flash', temperature: 0.1, maxTokens: 256 }
        );

        return {
            canonicalName: result.isMatch ? result.canonicalName : newItemName,
            wasDeduped: result.isMatch,
            reasoning: result.reasoning,
        };
    } catch (error) {
        console.warn(`⚠ Item dedup LLM failed, using raw name:`, (error as Error).message);
        return { canonicalName: newItemName, wasDeduped: false, reasoning: 'LLM dedup failed, using raw name.' };
    }
}

// ── Patron Quest Generation ─────────────────────────────────────────────

/**
 * Generate quest text as if the patron is writing it.
 * Uses the patron's character sheet + world lore as context.
 * Returns raw quest text that feeds into the normal quest parser.
 */
export async function generatePatronQuest(
    patron: IPatron,
    loreContext: string
): Promise<string> {
    const topSkills = Object.entries(patron.skills)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');

    let codexContext = '';
    try {
        // Perform RAG lookups based on the patron's archetype and top skills
        const ragQuery = `${patron.archetype} preparing for work involving ${topSkills}`;

        const [mobs, items, factions] = await Promise.all([
            searchCodexMobSemantic(ragQuery, 0.4, 2),
            searchCodexItemSemantic(ragQuery, 0.4, 2),
            searchCodexFactionSemantic(ragQuery, 0.4, 1)
        ]);

        if (mobs.length > 0) codexContext += `\nKNOWN MOBS (Threats, bounties):\n` + mobs.map(m => `- ${m.name}: ${m.description} (Danger: ${m.dangerLevel})`).join('\n');
        if (items.length > 0) codexContext += `\nKNOWN ITEMS (Relics, loot, materials):\n` + items.map(i => `- ${i.name}: ${i.description} (Rarity: ${i.rarity})`).join('\n');
        if (factions.length > 0) codexContext += `\nKNOWN FACTIONS (Employers, enemies):\n` + factions.map(f => `- ${f.name}: ${f.description}`).join('\n');
    } catch (e) {
        console.warn(`⚠ RAG Codex search failed during quest generation, proceeding without it:`, (e as Error).message);
    }

    const userPrompt = `PATRON CHARACTER SHEET:
Name: ${patron.name}
Archetype: ${patron.archetype}
Health: ${patron.healthStatus}
Top Skills: ${topSkills}

RECENT WORLD LORE:
${loreContext || 'The inn has just opened. No tales yet.'}
${codexContext ? `\nRELEVANT WORLD CODEX ENTITIES (Incorporate these into the quest if suitable):\n${codexContext}` : ''}

Write a quest that this patron would post on the board.`;

    try {
        return await chatCompletion(
            [
                { role: 'system', content: PATRON_QUEST_GEN_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            { model: 'google/gemini-3-flash-preview', temperature: 0.85, maxTokens: 256 }
        );
    } catch {
        // Fallback: generic quest based on archetype
        return `${patron.name} needs assistance. Seek them out at the inn.`;
    }
}

// ── Patron Arrival ──────────────────────────────────────────────────────

/**
 * Generate a narrative for a patron arriving at the inn.
 * (Free-form text — no schema needed for flavor text.)
 */
export async function renderArrivalNarrative(patron: IPatron): Promise<string> {
    try {
        // Build a full character card for the LLM
        const allSkills = ALL_SKILL_TAGS
            .filter(t => patron.skills[t] > 0)
            .map(t => `${t}:${patron.skills[t]}`)
            .join(', ');
        const visitStatus = patron.memoryIds && patron.memoryIds.length > 0 ? 'RETURNING patron' : 'First visit';

        return await chatCompletion(
            [
                { role: 'system', content: ARRIVAL_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `CHARACTER CARD:\nName: ${patron.name}\nArchetype: ${patron.archetype}\nHealth: ${patron.healthStatus}\nTop Skills: ${getTopSkills(patron, 3)}\nAll Skills: ${allSkills}\nVisit: ${visitStatus}`,
                },
            ],
            { temperature: 0.9, maxTokens: 200 }
        );
    } catch {
        return `${patron.name} the ${patron.archetype} pushes through the door and surveys the room.`;
    }
}

// ── Lore Chronicle Guardian ─────────────────────────────────────────────

/**
 * Have the Guardian analyze recent lore and generate 3 questions.
 */
export async function generateGuardianQuestions(recentLore: string): Promise<GuardianQuestionResult> {
    const defaultResponse: GuardianQuestionResult = {
        dialogue: "The winds of fate shift. Speak to me.",
        questions: ["What do you make of the recent whispers?", "Have you noticed any strange patterns?", "Where do these threads lead next?"]
    };

    if (!recentLore || recentLore.trim() === '') {
        return defaultResponse;
    }

    try {
        return await chatCompletionStructured<GuardianQuestionResult>(
            [
                { role: 'system', content: GUARDIAN_QUESTION_PROMPT },
                { role: 'user', content: `RECENT LORE:\n\n${recentLore}` },
            ],
            GUARDIAN_QUESTION_SCHEMA,
            {
                model: 'google/gemini-3-flash-preview',
                temperature: 0.8,
                maxTokens: 400,
                tools: CODEX_TOOLS,
                toolHandlers: CODEX_HANDLERS,
                tool_choice: 'auto'
            } // Slight bump in temp for creativity
        );
    } catch (error) {
        console.warn(`⚠ Guardian questions failed, using fallback:`, (error as Error).message);
        return defaultResponse;
    }
}

/**
 * Have the Guardian synthesize a new lore entry based on the player's answers.
 */
export async function synthesizeLore(recentLore: string, questions: string[], answers: string[]): Promise<string> {
    const fallbackText = "The Guardian nods slowly. 'The threads weave together.' They disappear into the ether.";

    if (questions.length !== answers.length) {
        console.warn(`⚠ synthesizeLore: mismatched questions/answers length`);
    }

    const qnaPairs = questions.map((q, i) => `Q: ${q}\nA (Innkeeper): ${answers[i] || 'Silence.'}`).join('\n\n');

    const priorSynthesis = loreChronicle.getLastSynthesis();
    const priorContext = priorSynthesis
        ? `\n\nPRIOR GUARDIAN SYNTHESIS (build upon this):\n${priorSynthesis}`
        : '';

    const prompt = `RECENT LORE:\n${recentLore}\n\nGUARDIAN'S QUESTIONS & INNKEEPER'S ANSWERS:\n${qnaPairs}${priorContext}`;

    try {
        return await chatCompletion(
            [
                { role: 'system', content: GUARDIAN_SYNTHESIS_PROMPT },
                { role: 'user', content: prompt },
            ],
            {
                model: 'google/gemini-3-flash-preview',
                temperature: 0.9,
                maxTokens: 500,
                tools: CODEX_TOOLS,
                toolHandlers: CODEX_HANDLERS,
                tool_choice: 'auto'
            }
        );
    } catch (error) {
        console.warn(`⚠ Guardian synthesis failed, using fallback:`, (error as Error).message);
        return fallbackText;
    }
}

// ── World Codex Synchroniser ──────────────────────────────────────────────

/**
 * Passively scans new lore entries and uses tools to register new entities (RAG).
 * This runs in the background and uses gemini-2.5-flash for speed/structure.
 */
export async function syncCodexFromLore(loreEntry: string): Promise<void> {
    if (!loreEntry || loreEntry.trim() === '') return;

    try {
        await chatCompletion(
            [
                { role: 'system', content: CODEX_SYNC_SYSTEM_PROMPT },
                { role: 'user', content: `RECENT LORE ENTRY:\n\n"${loreEntry}"\n\nExtract and register any notable new entities using your tools.` }
            ],
            {
                model: 'google/gemini-2.5-flash',
                temperature: 0.1, // Low temperature for factual extraction
                maxTokens: 500,
                tools: CODEX_TOOLS,
                toolHandlers: CODEX_HANDLERS,
                tool_choice: 'auto'
            }
        );
    } catch (error) {
        console.warn(`⚠ Codex Sync failed:`, (error as Error).message);
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function getTopSkills(patron: IPatron, count: number): string {
    return Object.entries(patron.skills)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, count)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
}

function generateFallbackResolution(
    result: QuestResolutionResult,
    patron: IPatron,
    quest: IQuest
): ResolutionNarrative {
    const weakTag = result.weakestTags[0] ?? 'preparation';

    // Determine health from math
    let patron_health: PatronHealthStatus = 'HEALTHY';
    let injury_description = '';

    if (!result.success) {
        if (result.probability < 0.05 && result.d20Roll <= 3) {
            patron_health = 'DEAD';
            injury_description = `Killed attempting "${quest.originalText}". Their ${weakTag} was fatally inadequate.`;
        } else if (result.probability < 0.4) {
            patron_health = 'INJURED';
            injury_description = `Wounded during "${quest.originalText}". Their ${weakTag} left them exposed.`;
        }
    }

    const story = result.success
        ? `${patron.name} set out on "${quest.originalText}". Their ${weakTag} nearly cost them everything, but when the d20 landed on ${result.d20Roll}, fortune tipped the scales. The ${patron.archetype} returned to The AInn bruised but victorious.`
        : `${patron.name} took on "${quest.originalText}" with more courage than sense. Their ${weakTag} was the undoing. The d20 showed ${result.d20Roll}. With only a ${(result.probability * 100).toFixed(0)}% chance, the math was never on their side. They returned to The AInn in silence.`;

    const lore_entry = result.success
        ? `${patron.name} the ${patron.archetype} completed "${quest.originalText}" against the odds. The inn's reputation grows.`
        : `${patron.name} the ${patron.archetype} failed "${quest.originalText}". Their lack of ${weakTag} proved decisive.`;

    return { story, lore_entry, patron_health, injury_description };
}
