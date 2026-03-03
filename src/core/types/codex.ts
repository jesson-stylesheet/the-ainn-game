import { ItemCategory } from './entity';

export interface ICodexMob {
    id?: string;               // UUID (optional for new inserts)
    name: string;
    description: string;
    dangerLevel: number;
    habitat: string;
    discoveredAt?: number | string;
}

export interface ICodexItem {
    id?: string;
    name: string;
    description: string;
    category: ItemCategory;
    rarity: number;
    discoveredAt?: number | string;
}

export type CodexCharacterType = 'patron' | 'story_npc';

export interface ICodexCharacter {
    id?: string;
    name: string;
    description: string;
    characterType: CodexCharacterType;
    patronId?: string | null;  // UUID linking to active patron DB if applicable
    discoveredAt?: number | string;
}

export interface ICodexFaction {
    id?: string;
    name: string;
    description: string;
    alignment: string;
    discoveredAt?: number | string;
}

export interface ICodexRecipe {
    id?: string;
    name: string;
    craftedItemId: string;     // UUID of the ICodexItem this crafts
    description?: string | null;
    discoveredAt?: number | string;
}

export interface ICodexRecipeMaterial {
    recipeId: string;
    materialItemId: string;
    quantity: number;
}
