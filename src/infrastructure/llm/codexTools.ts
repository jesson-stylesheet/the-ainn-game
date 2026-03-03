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
            description: 'Register a non-player character (NPC) native to the world story.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Unique name of the character.' },
                    description: { type: 'string', description: 'Appearance, personality, and role.' },
                    characterType: { type: 'string', enum: ['patron', 'story_npc'] }
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
    }
];

export const CODEX_HANDLERS: ToolHandlerRegistry = {
    search_mob: async (args: { query: string }) => {
        const results = await db.searchCodexMobSemantic(args.query);
        return results.length > 0 ? results : { status: 'NOT_FOUND', message: `No mob matching '${args.query}' exists in the codex.` };
    },
    register_mob: async (args: any) => {
        return await db.insertCodexMob(args);
    },
    search_item: async (args: { query: string }) => {
        const results = await db.searchCodexItemSemantic(args.query);
        return results.length > 0 ? results : { status: 'NOT_FOUND', message: `No item matching '${args.query}' exists in the codex.` };
    },
    register_item: async (args: any) => {
        return await db.insertCodexItem(args);
    },
    search_character: async (args: { query: string }) => {
        const results = await db.searchCodexCharacterSemantic(args.query);
        return results.length > 0 ? results : { status: 'NOT_FOUND', message: `No character matching '${args.query}' exists in the codex.` };
    },
    register_character: async (args: any) => {
        return await db.insertCodexCharacter(args);
    },
    search_faction: async (args: { query: string }) => {
        const results = await db.searchCodexFactionSemantic(args.query);
        return results.length > 0 ? results : { status: 'NOT_FOUND', message: `No faction matching '${args.query}' exists in the codex.` };
    },
    register_faction: async (args: any) => {
        return await db.insertCodexFaction(args);
    }
};
