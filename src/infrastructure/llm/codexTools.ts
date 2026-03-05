import type { ToolDefinition, ToolHandlerRegistry } from './openRouterClient';
import * as db from '../db/queries';

export const CODEX_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'search_mob',
            description: 'Search the World Codex for an existing monster, creature, or enemy.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term or partial description to semantically match the mob (RAG query).' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'register_mob',
            description: 'Register a newly discovered monster or enemy into the World Codex.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique name of the mob.' },
                    description: { type: 'string', description: 'Physical appearance, behavior, and lore.' },
                    dangerLevel: { type: 'number', description: 'Estimated combat threat (1-100).' },
                    habitat: { type: 'string', description: 'Where this creature is commonly found.' }
                },
                required: ['name', 'description', 'dangerLevel', 'habitat']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_item',
            description: 'Search the World Codex for an existing item, weapon, or material.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term or partial description to semantically match the item (RAG query).' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'register_item',
            description: 'Register a newly discovered item, weapon, gear, consumable, or crafting material.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique name of the item.' },
                    description: { type: 'string', description: 'Visuals, lore, and usage.' },
                    category: {
                        type: 'string',
                        enum: ['questItem', 'consumables', 'meleeWeapon', 'magicWeapon', 'rangeWeapon', 'shield', 'lightHeadGear', 'heavyHeadGear', 'lightBodyArmor', 'heavyBodyArmor', 'lightLegGear', 'heavyLegGear', 'lightFootGear', 'heavyFootGear'],
                        description: 'Strict item category mapping.'
                    },
                    rarity: { type: 'number', description: 'Rarity score 0-100 (0=Common, 100=Legendary Relic).' }
                },
                required: ['name', 'description', 'category', 'rarity']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_character',
            description: 'Search the World Codex for an NPC or existing Patron.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term or partial description to semantically match the character (RAG query).' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'register_character',
            description: 'Register a non-player character (NPC) native to the world story. Do NOT use this for inn patrons — they are registered automatically.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique name of the character.' },
                    description: { type: 'string', description: 'Appearance, personality, and role.' },
                    characterType: { type: 'string', enum: ['story_npc'], description: 'Always story_npc. Patrons are managed separately.' }
                },
                required: ['name', 'description', 'characterType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_faction',
            description: 'Search for guilds, cults, kingdoms, or organizations.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term or partial description to semantically match the faction (RAG query).' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'register_faction',
            description: 'Register a newly discovered organization or faction.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique name of the faction.' },
                    description: { type: 'string', description: 'Goals, history, and makeup.' },
                    alignment: { type: 'string', description: 'e.g. Lawful Evil, Neutral, etc.' }
                },
                required: ['name', 'description', 'alignment']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_recipe',
            description: 'Search the World Codex for an existing crafting recipe by name or description.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term or partial description to semantically match the recipe (RAG query).' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'register_recipe',
            description: 'Register a newly invented crafting recipe into the World Codex. Only call this if search_recipe returned NOT_FOUND.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique name of the recipe (e.g. "Health Potion", "Iron Sword").' },
                    description: { type: 'string', description: 'How the recipe is crafted and what makes it special.' },
                    craftedItemName: { type: 'string', description: 'The name of the item this recipe produces. Must match an existing codex item.' },
                    materials: {
                        type: 'array',
                        description: 'List of required crafting materials. Each must reference an existing codex item by name.',
                        items: {
                            type: 'object',
                            properties: {
                                itemName: { type: 'string', description: 'Name of the material item (must exist in the codex).' },
                                quantity: { type: 'number', description: 'How many of this material are needed.' }
                            },
                            required: ['itemName', 'quantity']
                        }
                    }
                },
                required: ['name', 'description', 'craftedItemName', 'materials']
            }
        }
    }
];

export const CODEX_SEARCH_TOOLS: ToolDefinition[] = [
    CODEX_TOOLS[0], // search_mob
    CODEX_TOOLS[2], // search_item
    CODEX_TOOLS[4], // search_character
    CODEX_TOOLS[6], // search_faction
    CODEX_TOOLS[8], // search_recipe
];

export const CODEX_FULL_TOOLS = CODEX_TOOLS;

export const CODEX_HANDLERS: ToolHandlerRegistry = {
    search_mob: async (args: { query: string }) => {
        const results = await db.searchCodexMobSemantic(args.query);
        return results.length > 0 ? results : { status: 'NOT_FOUND', message: `No mob matching '${args.query}' exists in the codex.` };
    },
    register_mob: async (args: any) => {
        // Semantic pre-check at 0.75 — catches plurals, synonyms, and rephrased names that
        // slipped past the LLM's own search step (e.g. "Wasps" when "Wasp" is already registered).
        const semQuery = `${args.name} ${args.description ?? ''} habitat:${args.habitat ?? ''}`;
        const similar = await db.searchCodexMobSemantic(semQuery, 0.75, 1);
        if (similar.length > 0) {
            console.log(`[Codex] register_mob blocked — "${args.name}" is semantically similar to existing entry "${similar[0].name}"`);
            return { status: 'ALREADY_EXISTS', message: `A similar mob already exists in the codex.`, existing: similar[0] };
        }
        return await db.insertCodexMob(args);
    },
    search_item: async (args: { query: string }) => {
        const results = await db.searchCodexItemSemantic(args.query);
        return results.length > 0 ? results : { status: 'NOT_FOUND', message: `No item matching '${args.query}' exists in the codex.` };
    },
    register_item: async (args: any) => {
        const semQuery = `${args.name} ${args.description ?? ''} category:${args.category ?? ''}`;
        const similar = await db.searchCodexItemSemantic(semQuery, 0.75, 1);
        if (similar.length > 0) {
            console.log(`[Codex] register_item blocked — "${args.name}" is semantically similar to existing entry "${similar[0].name}"`);
            return { status: 'ALREADY_EXISTS', message: `A similar item already exists in the codex.`, existing: similar[0] };
        }
        return await db.insertCodexItem(args);
    },
    search_character: async (args: { query: string }) => {
        const results = await db.searchCodexCharacterSemantic(args.query);
        return results.length > 0 ? results : { status: 'NOT_FOUND', message: `No character matching '${args.query}' exists in the codex.` };
    },
    register_character: async (args: any) => {
        // Patrons are registered exclusively by the syncAdapter on patron:arrived.
        // The LLM should only register story NPCs.
        if (args.characterType === 'patron') {
            console.log(`[Codex] register_character blocked — patron registration is handled automatically.`);
            return { status: 'REJECTED', message: 'Patron characters are registered automatically when they arrive at the inn. Use story_npc for world characters.' };
        }
        const semQuery = `${args.name} ${args.description ?? ''}`;
        const similar = await db.searchCodexCharacterSemantic(semQuery, 0.75, 1);
        if (similar.length > 0) {
            console.log(`[Codex] register_character blocked — "${args.name}" is semantically similar to existing entry "${similar[0].name}"`);
            return { status: 'ALREADY_EXISTS', message: `A similar character already exists in the codex.`, existing: similar[0] };
        }
        return await db.insertCodexCharacter(args);
    },
    search_faction: async (args: { query: string }) => {
        const results = await db.searchCodexFactionSemantic(args.query);
        return results.length > 0 ? results : { status: 'NOT_FOUND', message: `No faction matching '${args.query}' exists in the codex.` };
    },
    register_faction: async (args: any) => {
        const semQuery = `${args.name} ${args.description ?? ''} alignment:${args.alignment ?? ''}`;
        const similar = await db.searchCodexFactionSemantic(semQuery, 0.75, 1);
        if (similar.length > 0) {
            console.log(`[Codex] register_faction blocked — "${args.name}" is semantically similar to existing entry "${similar[0].name}"`);
            return { status: 'ALREADY_EXISTS', message: `A similar faction already exists in the codex.`, existing: similar[0] };
        }
        return await db.insertCodexFaction(args);
    },
    search_recipe: async (args: { query: string }) => {
        const results = await db.searchCodexRecipeSemantic(args.query);
        if (results.length > 0) {
            // For each recipe, also fetch its materials for the LLM to see
            const enriched = await Promise.all(results.map(async (r) => {
                const mats = await db.fetchRecipeMaterials(r.id!);
                return { ...r, materials: mats };
            }));
            return enriched;
        }
        return { status: 'NOT_FOUND', message: `No recipe matching '${args.query}' exists in the codex.` };
    },
    register_recipe: async (args: any) => {
        // Semantic pre-check
        const semQuery = `${args.name} ${args.description ?? ''}`;
        const similar = await db.searchCodexRecipeSemantic(semQuery, 0.75, 1);
        if (similar.length > 0) {
            console.log(`[Codex] register_recipe blocked — "${args.name}" is semantically similar to existing recipe "${similar[0].name}"`);
            return { status: 'ALREADY_EXISTS', message: `A similar recipe already exists in the codex.`, existing: similar[0] };
        }

        // Resolve craftedItemName → craftedItemId from the codex
        const craftedItem = await db.searchCodexItemByName(args.craftedItemName);
        if (!craftedItem) {
            return { status: 'REJECTED', message: `Crafted item "${args.craftedItemName}" not found in the codex. Register it first with register_item.` };
        }

        // Resolve each material name → materialItemId
        const materials: { materialItemId: string; quantity: number }[] = [];
        for (const mat of args.materials) {
            const item = await db.searchCodexItemByName(mat.itemName);
            if (!item) {
                return { status: 'REJECTED', message: `Material "${mat.itemName}" not found in the codex. Register it first with register_item.` };
            }
            materials.push({ materialItemId: item.id!, quantity: mat.quantity });
        }

        const recipe = await db.insertCodexRecipe(
            { name: args.name, description: args.description, craftedItemId: craftedItem.id! },
            materials.map(m => ({ recipeId: '', materialItemId: m.materialItemId, quantity: m.quantity }))
        );
        return recipe;
    }
};
