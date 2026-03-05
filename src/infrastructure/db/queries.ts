/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Database Queries
 * ═══════════════════════════════════════════════════════════════════════
 * All Supabase CRUD operations for patrons, quests, items, lore,
 * resolutions, events, and inn state.
 * The core engine calls these instead of touching the DB directly.
 * 
 * Legacy Note: The database schema was migrated from a tick-based clock
 * to a day-based day cycle. Obsolete columns like current_tick, resolution_ticks,
 * and deadline_timestamp were renamed/converted to current_day, duration_days,
 * and deadline_days.
 */

import { supabase } from './supabaseClient';
import { gameState } from '../../core/engine/gameState';
import { generateEmbedding } from '../llm/openRouterClient';
import type {
    IPatron, IQuest, QuestResolutionResult, SkillVector,
    IItem, ItemCategory, ItemLocation, EquipmentSlot,
} from '../../core/types/entity';
import type {
    ICodexMob, ICodexItem, ICodexCharacter, ICodexFaction,
    ICodexRecipe, ICodexRecipeMaterial
} from '../../core/types/codex';

// ── Row Types (DB shape) ────────────────────────────────────────────────

interface PatronRow {
    id: string;
    name: string;
    archetype: string;
    skills: SkillVector;
    state: string;
    health_status: string;
    arrival_timestamp: number;
    memory_ids: string[];
    event_ids: string[];
    gold: number;
    copper: number;
    stay_duration: number;
    days_remaining: number;
    created_at: string;
    updated_at: string;
}

interface QuestRow {
    id: string;
    original_text: string;
    quest_type: string;
    requirements: SkillVector;
    difficulty_scalar: number;
    duration_days: number;
    assigned_patron_id: string | null;
    posted_by_patron_id: string | null;
    status: string;
    deadline_days: number;
    verbosity_score: number;
    tag_count: number;
    resolution_data: QuestResolutionResult | null;
    item_name: string | null;
    item_category: string | null;
    item_quantity: number | null;
    item_rarity: number | null;
    consumed_items: { itemName: string; quantity: number }[] | null;
    created_at: string;
    updated_at: string;
}

interface LoreRow {
    id: string;
    world_id: string;
    quest_id: string | null;
    patron_id: string | null;
    original_text: string;
    outcome: string | null;
    patron_name: string | null;
    patron_archetype: string | null;
    lore_text: string;
    story_text: string;
    narrative_seed: string | null;
    created_at: string;
}

interface ItemRow {
    id: string;
    name: string;
    category: string;
    rarity: number;
    quantity: number;
    owner_patron_id: string | null;
    equipped_slot: string | null;
    location: string;
    source_quest_id: string | null;
    crafted_by_patron_id: string | null;
    created_at: string;
}

interface ResolutionRow {
    id: string;
    quest_id: string;
    patron_id: string;
    success: boolean;
    probability: number;
    d20_roll: number;
    dot_product: number;
    weakest_tags: string[];
    raw_roll: number;
    equipment_bonus: number;
    created_at: string;
}

interface InnStateRow {
    id: string;
    current_day: number;
    gold: number;
    copper: number;
    reputation: number;
    created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════
//  WORLDS & INNS (Multi-Tenancy)
// ═══════════════════════════════════════════════════════════════════════

export async function fetchWorlds(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase.from('worlds').select('id, name').order('created_at', { ascending: true });
    if (error) throw new Error(`Failed to fetch worlds: ${error.message}`);
    return data as { id: string; name: string }[];
}

export async function createWorld(name: string): Promise<string> {
    const { data, error } = await supabase.from('worlds').insert({ name }).select('id').single();
    if (error) throw new Error(`Failed to create world: ${error.message}`);
    return data.id;
}

export async function fetchInns(worldId: string, playerId: string): Promise<{ id: string; name: string; world_id: string }[]> {
    const { data, error } = await supabase
        .from('inns')
        .select('id, name, world_id')
        .eq('world_id', worldId)
        .eq('player_id', playerId)
        .order('created_at', { ascending: true });
    if (error) throw new Error(`Failed to fetch inns: ${error.message}`);
    return data as { id: string; name: string; world_id: string }[];
}

export async function createInn(worldId: string, playerId: string, name: string): Promise<string> {
    const { data, error } = await supabase
        .from('inns')
        .insert({ world_id: worldId, player_id: playerId, name })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create inn: ${error.message}`);
    return data.id;
}

// ═══════════════════════════════════════════════════════════════════════
//  INN STATE
// ═══════════════════════════════════════════════════════════════════════

export interface InnState {
    currentDay: number;
    gold: number;
    copper: number;
    reputation: number;
}

export async function fetchInnState(): Promise<InnState> {
    const { data, error } = await supabase.from('inns').select('*').eq('id', gameState.innId).single();
    if (error) throw new Error(`Failed to fetch inn state: ${error.message}`);
    const row = data as InnStateRow;
    return { currentDay: row.current_day, gold: row.gold, copper: row.copper, reputation: row.reputation };
}

export async function updateInnState(updates: Partial<InnState>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.currentDay !== undefined) dbUpdates.current_day = updates.currentDay;
    if (updates.gold !== undefined) dbUpdates.gold = updates.gold;
    if (updates.copper !== undefined) dbUpdates.copper = updates.copper;
    if (updates.reputation !== undefined) dbUpdates.reputation = updates.reputation;

    const { error } = await supabase.from('inns').update(dbUpdates).eq('id', gameState.innId);
    if (error) throw new Error(`Failed to update inn state: ${error.message}`);
}

/** Get full dashboard stats in a single Postgres call. */
export async function fetchDashboard(): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('get_inn_dashboard', { p_inn_id: gameState.innId });
    if (error) throw new Error(`Failed to fetch dashboard: ${error.message}`);
    return data as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════
//  ITEMS
// ═══════════════════════════════════════════════════════════════════════

export async function insertItem(item: IItem): Promise<void> {
    const { error } = await supabase.from('items').insert({
        id: item.id,
        inn_id: gameState.innId,
        name: item.name,
        category: item.category,
        rarity: item.rarity,
        quantity: item.quantity,
        owner_patron_id: item.ownerPatronId ?? null,
        equipped_slot: item.equippedSlot ?? null,
        location: item.location,
        source_quest_id: item.sourceQuestId ?? null,
        crafted_by_patron_id: item.craftedByPatronId ?? null,
    });
    if (error) throw new Error(`Failed to insert item: ${error.message}`);
}

export async function fetchAllItems(): Promise<IItem[]> {
    const { data, error } = await supabase.from('items').select('*').eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to fetch items: ${error.message}`);
    return (data as ItemRow[]).map(rowToItem);
}

export async function fetchItemsByLocation(location: ItemLocation): Promise<IItem[]> {
    const { data, error } = await supabase.from('items').select('*').eq('inn_id', gameState.innId).eq('location', location);
    if (error) throw new Error(`Failed to fetch items: ${error.message}`);
    return (data as ItemRow[]).map(rowToItem);
}

export async function updateItemLocation(
    id: string,
    ownerPatronId: string | null,
    equippedSlot: EquipmentSlot | null,
    location: ItemLocation,
    quantity?: number
): Promise<void> {
    const updates: Record<string, unknown> = {
        owner_patron_id: ownerPatronId,
        equipped_slot: equippedSlot,
        location,
    };
    if (quantity !== undefined) {
        updates.quantity = quantity;
    }
    const { error } = await supabase.from('items').update(updates).eq('id', id).eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to update item location: ${error.message}`);
}

export async function deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('items').delete().eq('id', id).eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to delete item: ${error.message}`);
}

/** Consumes items directly from the database INN_VAULT, matching the GameState logic. */
export async function consumeInnItemFromDB(itemName: string, quantity: number): Promise<void> {
    const { data: items, error } = await supabase
        .from('items')
        .select('*')
        .eq('inn_id', gameState.innId)
        .eq('location', 'INN_VAULT')
        .ilike('name', itemName); // GameState uses name.toLowerCase() === name.toLowerCase()

    if (error) throw new Error(`Failed to fetch items for consumption: ${error.message}`);

    let needed = quantity;
    for (const item of (items as ItemRow[])) {
        if (needed <= 0) break;
        if (item.quantity <= needed) {
            needed -= item.quantity;
            await deleteItem(item.id);
        } else {
            const newQuantity = item.quantity - needed;
            await supabase.from('items').update({ quantity: newQuantity }).eq('id', item.id).eq('inn_id', gameState.innId);
            needed = 0;
        }
    }
}

function rowToItem(row: ItemRow): IItem {
    return {
        id: row.id,
        name: row.name,
        category: row.category as ItemCategory,
        rarity: row.rarity,
        quantity: row.quantity,
        ownerPatronId: row.owner_patron_id,
        equippedSlot: row.equipped_slot as EquipmentSlot | null,
        location: row.location as ItemLocation,
        sourceQuestId: row.source_quest_id,
        craftedByPatronId: row.crafted_by_patron_id,
    };
}

// ═══════════════════════════════════════════════════════════════════════
//  PATRONS
// ═══════════════════════════════════════════════════════════════════════

export async function insertPatron(patron: IPatron): Promise<void> {
    const { error } = await supabase.from('patrons').insert({
        id: patron.id,
        inn_id: gameState.innId,
        name: patron.name,
        archetype: patron.archetype,
        skills: patron.skills,
        state: patron.state,
        health_status: patron.healthStatus,
        arrival_timestamp: patron.arrivalTimestamp,
        memory_ids: patron.memoryIds ?? [],
        event_ids: patron.eventIds ?? [],
        gold: patron.gold ?? 0,
        copper: patron.copper ?? 0,
        stay_duration: patron.totalStayDuration,
        days_remaining: patron.daysRemaining,
    });
    if (error) throw new Error(`Failed to insert patron: ${error.message}`);
}

export async function updatePatronState(id: string, state: IPatron['state']): Promise<void> {
    const { error } = await supabase.from('patrons').update({ state }).eq('id', id).eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to update patron state: ${error.message}`);
}

export async function updatePatronHealth(id: string, healthStatus: IPatron['healthStatus']): Promise<void> {
    const { error } = await supabase.from('patrons').update({ health_status: healthStatus }).eq('id', id).eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to update patron health: ${error.message}`);
}

export async function fetchActivePatrons(): Promise<IPatron[]> {
    const { data, error } = await supabase.from('patrons').select('*')
        .eq('inn_id', gameState.innId)
        .in('state', ['IDLE', 'LOUNGING', 'ON_QUEST', 'AWAITING_NARRATIVE']);
    if (error) throw new Error(`Failed to fetch active patrons: ${error.message}`);
    return (data as PatronRow[]).map(rowToPatron);
}

export async function fetchPatronsByState(state: string): Promise<IPatron[]> {
    const { data, error } = await supabase.from('patrons').select('*').eq('inn_id', gameState.innId).eq('state', state);
    if (error) throw new Error(`Failed to fetch patrons: ${error.message}`);
    return (data as PatronRow[]).map(rowToPatron);
}

function rowToPatron(row: PatronRow): IPatron {
    return {
        id: row.id,
        name: row.name,
        archetype: row.archetype,
        skills: row.skills,
        state: row.state as IPatron['state'],
        healthStatus: (row.health_status as IPatron['healthStatus']) ?? 'HEALTHY',
        arrivalTimestamp: row.arrival_timestamp,
        arrivalDay: 1,  // Hydrated patrons default to day 1 (pre-day-cycle era)
        totalStayDuration: row.stay_duration ?? 7,
        daysRemaining: row.days_remaining ?? 7,
        memoryIds: row.memory_ids,
        eventIds: row.event_ids,
        gold: row.gold ?? 0,
        copper: row.copper ?? 0,
        equipment: {
            headwear: null,
            bodyArmor: null,
            legwear: null,
            footwear: null,
            righthand: null,
            lefthand: null,
        },
        inventory: [],
    };
}

/**
 * Fetch one random DEPARTED patron from this inn who can return.
 * Excludes DEAD patrons and patrons whose names are already active in the inn.
 * Returns the full patron row (with original id) or null.
 */
export async function fetchRandomRecurringPatron(
    activePatronNames: string[]
): Promise<{ id: string; name: string; archetype: string } | null> {
    let query = supabase
        .from('patrons')
        .select('id, name, archetype')
        .eq('inn_id', gameState.innId)
        .eq('state', 'DEPARTED')
        .neq('health_status', 'DEAD');

    if (activePatronNames.length > 0) {
        // Exclude patrons whose name matches anyone currently in the inn
        for (const name of activePatronNames) {
            query = query.neq('name', name);
        }
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch recurring patrons: ${error.message}`);
    if (!data || data.length === 0) return null;

    // Pick one at random
    const pick = data[Math.floor(Math.random() * data.length)];
    return { id: pick.id, name: pick.name, archetype: pick.archetype };
}

/**
 * Update an existing patron row when they return to the inn.
 * Re-sets skills, state, stay duration, and arrival timestamp.
 * Equipment is retained — items table references patron by id which stays the same.
 */
export async function upsertReturningPatron(patron: IPatron): Promise<void> {
    const { error } = await supabase
        .from('patrons')
        .update({
            skills: patron.skills,
            state: patron.state,
            health_status: patron.healthStatus,
            arrival_timestamp: patron.arrivalTimestamp,
            stay_duration: patron.totalStayDuration,
            days_remaining: patron.daysRemaining,
        })
        .eq('id', patron.id)
        .eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to upsert returning patron: ${error.message}`);
}

/** Update days_remaining for a patron in the DB. */
export async function updatePatronDaysRemaining(id: string, daysRemaining: number): Promise<void> {
    const { error } = await supabase
        .from('patrons')
        .update({ days_remaining: daysRemaining })
        .eq('id', id)
        .eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to update patron days_remaining: ${error.message}`);
}

// ═══════════════════════════════════════════════════════════════════════
//  QUESTS
// ═══════════════════════════════════════════════════════════════════════

export async function insertQuest(quest: IQuest, verbosityScore?: number): Promise<void> {
    const tagCount = Object.values(quest.requirements).filter(v => v > 0).length;
    const { error } = await supabase.from('quests').insert({
        id: quest.id,
        inn_id: gameState.innId,
        original_text: quest.originalText,
        quest_type: quest.type,
        requirements: quest.requirements,
        difficulty_scalar: quest.difficultyScalar,
        duration_days: quest.durationDays,
        assigned_patron_id: quest.assignedPatronId,
        posted_by_patron_id: quest.postedByPatronId ?? null,
        status: quest.status,
        deadline_days: quest.deadlineDays,
        verbosity_score: verbosityScore ?? 0,
        tag_count: tagCount,
        item_name: quest.itemDetails?.itemName ?? null,
        item_category: quest.itemDetails?.category ?? null,
        item_quantity: quest.itemDetails?.quantity ?? null,
        item_rarity: quest.itemDetails?.rarity ?? null,
        consumed_items: quest.consumedItems ?? null,
    });
    if (error) throw new Error(`Failed to insert quest: ${error.message}`);
}

export async function updateQuestStatus(
    id: string,
    status: IQuest['status'],
    resolutionData?: QuestResolutionResult
): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (resolutionData) update.resolution_data = resolutionData;
    const { error } = await supabase.from('quests').update(update).eq('id', id).eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to update quest: ${error.message}`);
}

/** Atomic patron-to-quest assignment via Postgres RPC. */
export async function assignPatronToQuestAtomic(patronId: string, questId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('assign_patron_to_quest', {
        p_patron_id: patronId,
        p_quest_id: questId,
    });
    if (error) throw new Error(`Failed to assign patron: ${error.message}`);
    return data as boolean;
}

export async function fetchExpiredQuests(currentDay: number): Promise<IQuest[]> {
    const { data, error } = await supabase
        .from('quests')
        .select('*')
        .eq('inn_id', gameState.innId)
        .eq('status', 'POSTED')
        .lte('deadline_days', currentDay);
    if (error) throw new Error(`Failed to fetch expired quests: ${error.message}`);
    return (data as QuestRow[]).map(rowToQuest);
}

export async function fetchAllQuests(): Promise<IQuest[]> {
    const { data, error } = await supabase.from('quests').select('*').eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to fetch quests: ${error.message}`);
    return (data as QuestRow[]).map(rowToQuest);
}

export async function fetchQuestsByStatus(status: string): Promise<IQuest[]> {
    const { data, error } = await supabase.from('quests').select('*').eq('inn_id', gameState.innId).eq('status', status);
    if (error) throw new Error(`Failed to fetch quests: ${error.message}`);
    return (data as QuestRow[]).map(rowToQuest);
}

function rowToQuest(row: QuestRow): IQuest {
    const quest: IQuest = {
        id: row.id,
        originalText: row.original_text,
        type: (row.quest_type as IQuest['type']) ?? 'subjugation',
        requirements: row.requirements,
        difficultyScalar: row.difficulty_scalar,
        durationDays: row.duration_days ?? 1,
        assignedPatronId: row.assigned_patron_id,
        postedByPatronId: row.posted_by_patron_id ?? null,
        status: row.status as IQuest['status'],
        deadlineDays: row.deadline_days ?? 3,
    };
    if (row.item_name && row.item_category) {
        quest.itemDetails = {
            itemName: row.item_name,
            category: row.item_category as ItemCategory,
            quantity: row.item_quantity ?? 1,
            rarity: row.item_rarity ?? 0,
        };
    }
    if (row.consumed_items) {
        quest.consumedItems = row.consumed_items;
    }
    return quest;
}

// ═══════════════════════════════════════════════════════════════════════
//  QUEST RESOLUTIONS
// ═══════════════════════════════════════════════════════════════════════

export async function insertResolution(result: QuestResolutionResult, equipmentBonus: number = 0): Promise<void> {
    const { error } = await supabase.from('quest_resolutions').insert({
        quest_id: result.questId,
        inn_id: gameState.innId,
        patron_id: result.patronId,
        success: result.success,
        probability: result.probability,
        d20_roll: result.d20Roll,
        dot_product: result.dotProduct,
        weakest_tags: result.weakestTags,
        raw_roll: result.rawRoll,
        equipment_bonus: equipmentBonus,
    });
    if (error) throw new Error(`Failed to insert resolution: ${error.message}`);
}

export async function fetchResolutionsByPatron(patronId: string): Promise<ResolutionRow[]> {
    const { data, error } = await supabase
        .from('quest_resolutions')
        .select('*')
        .eq('inn_id', gameState.innId)
        .eq('patron_id', patronId)
        .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch resolutions: ${error.message}`);
    return data as ResolutionRow[];
}

// ═══════════════════════════════════════════════════════════════════════
//  LORE CHRONICLE
// ═══════════════════════════════════════════════════════════════════════

export async function insertLoreEntry(entry: {
    questId: string | null;
    patronId?: string | null;
    originalText: string;
    outcome?: 'COMPLETED' | 'FAILED' | 'SYNTHESIS';
    patronName?: string;
    patronArchetype?: string;
    loreText?: string;
    storyText?: string;
    narrativeSeed?: string;
    gameDay?: number;
}): Promise<void> {
    const { error } = await supabase.from('lore_chronicle').insert({
        quest_id: entry.questId,
        world_id: gameState.worldId,
        inn_id: gameState.innId,
        patron_id: entry.patronId ?? null,
        original_text: entry.originalText,
        outcome: entry.outcome ?? null,
        patron_name: entry.patronName ?? null,
        patron_archetype: entry.patronArchetype ?? null,
        lore_text: entry.loreText ?? '',
        story_text: entry.storyText ?? '',
        narrative_seed: entry.narrativeSeed ?? null,
        game_day: entry.gameDay ?? gameState.currentDay,
    });
    if (error) throw new Error(`Failed to insert lore: ${error.message}`);
}

/**
 * Delete ALL lore entries for the current inn.
 * Called by the DBSyncAdapter after a Guardian synthesis so the synthesis
 * becomes the sole canonical entry that seeds the next Guardian cycle.
 * Scoped to inn_id (not world_id) so other inns' lore is preserved.
 */
export async function deleteInnLoreEntries(): Promise<void> {
    const { error } = await supabase
        .from('lore_chronicle')
        .delete()
        .eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to delete inn lore entries: ${error.message}`);
}

export async function updateLoreOutcome(
    questId: string,
    outcome: 'COMPLETED' | 'FAILED',
    patronName: string,
    patronArchetype: string
): Promise<void> {
    const { error } = await supabase
        .from('lore_chronicle')
        .update({ outcome, patron_name: patronName, patron_archetype: patronArchetype })
        .eq('quest_id', questId)
        .eq('inn_id', gameState.innId);
    if (error) throw new Error(`Failed to update lore: ${error.message}`);
}

export async function fetchAllLoreEntries(): Promise<LoreRow[]> {
    const { data, error } = await supabase
        .from('lore_chronicle')
        .select('*')
        .eq('inn_id', gameState.innId)
        .order('created_at', { ascending: true }); // Chronological for hydration
    if (error) throw new Error(`Failed to fetch all lore: ${error.message}`);
    return data as LoreRow[];
}

// ═══════════════════════════════════════════════════════════════════════
//  EVENT LOG
// ═══════════════════════════════════════════════════════════════════════

/** Log a game event via Postgres RPC. */
export async function logEvent(
    eventType: string,
    subjectId: string | null,
    subjectType: 'PATRON' | 'QUEST' | 'ITEM' | 'INN' | 'LORE',
    payload: Record<string, unknown> = {},
    gameDay?: number
): Promise<void> {
    const { error } = await supabase.rpc('log_event', {
        p_inn_id: gameState.innId,
        p_event_type: eventType,
        p_subject_id: subjectId,
        p_subject_type: subjectType,
        p_payload: payload,
        p_game_day: gameDay ?? null,
    });
    if (error) throw new Error(`Failed to log event: ${error.message}`);
}

// ═══════════════════════════════════════════════════════════════════════
//  WORLD CODEX
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reduces common English plural forms to their singular root, word by word.
 * Conservative: only handles the most reliable patterns to avoid mangling
 * uncommon fantasy nouns. Applied inside sanitizeName() so both insert
 * and lookup always operate on the same canonical singular form.
 *
 * Examples: Wasps→Wasp  Wolves→Wolf  Elves→Elf  Witches→Witch  Foxes→Fox
 */
function singularizeWord(word: string): string {
    if (word.length < 4) return word;
    const lower = word.toLowerCase();
    // ves → f  (Wolves→Wolf, Elves→Elf)
    if (lower.endsWith('ves') && word.length >= 5) return word.slice(0, -3) + 'f';
    // es with sibilant/affricate stem  (Witches→Witch, Foxes→Fox, Bushes→Bush, Classes→Class)
    if (lower.endsWith('es') && word.length >= 5) {
        const stem = word.slice(0, -2);
        if (/(?:sh|ch|x|ss)$/i.test(stem)) return stem;
    }
    // Generic trailing-s  (Wasps→Wasp, Spiders→Spider, Goblins→Goblin)
    if (lower.endsWith('s') && !lower.endsWith('ss') && word.length >= 4) return word.slice(0, -1);
    return word;
}

/**
 * Normalizes entity names to prevent duplicates from typos, casing, and plurals.
 * e.g., " crimson   DEATHstalkers " -> "Crimson Deathstalker"
 */
function sanitizeName(name: string): string {
    if (!name) return name;
    return name
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(w => singularizeWord(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join(' ');
}

export async function insertCodexMob(mob: ICodexMob): Promise<ICodexMob> {
    const cleanName = sanitizeName(mob.name);

    // Check if it already exists to prevent duplicate key errors and gracefully return the existing entry
    const existing = await searchCodexMobByName(cleanName);
    if (existing) return existing;

    const embedText = `${cleanName}: ${mob.description} (Danger: ${mob.dangerLevel}, Habitat: ${mob.habitat})`;
    const embedding = await generateEmbedding(embedText, 'google/gemini-embedding-001', 1536);

    const { data, error } = await supabase.from('codex_mobs').insert({
        id: mob.id, world_id: gameState.worldId, name: cleanName, description: mob.description,
        danger_level: mob.dangerLevel, habitat: mob.habitat, embedding
    }).select().single();
    if (error) throw new Error(`Failed to insert codex mob: ${error.message}`);
    return { ...mob, name: cleanName, id: data.id, discoveredAt: data.discovered_at };
}

export async function searchCodexMobByName(nameQuery: string): Promise<ICodexMob | null> {
    const cleanQuery = sanitizeName(nameQuery);
    const { data, error } = await supabase.from('codex_mobs').select('*').eq('world_id', gameState.worldId).ilike('name', `%${cleanQuery}%`).limit(1).maybeSingle();
    if (error) throw new Error(`Failed to search codex mob: ${error.message}`);
    if (!data) return null;
    return { id: data.id, name: data.name, description: data.description, dangerLevel: data.danger_level, habitat: data.habitat, discoveredAt: data.discovered_at };
}

export async function searchCodexMobSemantic(query: string, matchThreshold: number = 0.7, matchCount: number = 3): Promise<ICodexMob[]> {
    const embedding = await generateEmbedding(query, 'google/gemini-embedding-001', 1536);
    const { data, error } = await supabase.rpc('match_codex_mobs', {
        query_embedding: embedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        p_world_id: gameState.worldId
    });
    if (error) throw new Error(`Failed to semantic search mobs: ${error.message}`);
    return (data as any[]).map(row => ({
        id: row.id, name: row.name, description: row.description, dangerLevel: row.danger_level, habitat: row.habitat, discoveredAt: row.discovered_at
    }));
}

export async function insertCodexItem(item: ICodexItem): Promise<ICodexItem> {
    const cleanName = sanitizeName(item.name);

    const existing = await searchCodexItemByName(cleanName);
    if (existing) return existing;

    const embedText = `${cleanName}: ${item.description} (Category: ${item.category}, Rarity: ${item.rarity})`;
    const embedding = await generateEmbedding(embedText, 'google/gemini-embedding-001', 1536);

    const { data, error } = await supabase.from('codex_items').insert({
        id: item.id, world_id: gameState.worldId, name: cleanName, description: item.description,
        category: item.category, rarity: item.rarity, embedding
    }).select().single();
    if (error) throw new Error(`Failed to insert codex item: ${error.message}`);
    return { ...item, name: cleanName, id: data.id, discoveredAt: data.discovered_at };
}

export async function searchCodexItemByName(nameQuery: string): Promise<ICodexItem | null> {
    const cleanQuery = sanitizeName(nameQuery);
    const { data, error } = await supabase.from('codex_items').select('*').eq('world_id', gameState.worldId).ilike('name', `%${cleanQuery}%`).limit(1).maybeSingle();
    if (error) throw new Error(`Failed to search codex item: ${error.message}`);
    if (!data) return null;
    return { id: data.id, name: data.name, description: data.description, category: data.category as ItemCategory, rarity: data.rarity, discoveredAt: data.discovered_at };
}

export async function searchCodexItemSemantic(query: string, matchThreshold: number = 0.7, matchCount: number = 3): Promise<ICodexItem[]> {
    const embedding = await generateEmbedding(query, 'google/gemini-embedding-001', 1536);
    const { data, error } = await supabase.rpc('match_codex_items', {
        query_embedding: embedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        p_world_id: gameState.worldId
    });
    if (error) throw new Error(`Failed to semantic search items: ${error.message}`);
    return (data as any[]).map(row => ({
        id: row.id, name: row.name, description: row.description, category: row.category as ItemCategory, rarity: row.rarity, discoveredAt: row.discovered_at
    }));
}

export async function insertCodexCharacter(character: ICodexCharacter): Promise<ICodexCharacter> {
    const cleanName = sanitizeName(character.name);

    // Fast path: exact/partial name match
    const existing = await searchCodexCharacterByName(cleanName);
    if (existing) return existing;

    // Semantic guard: if this entry has NO patronId it came from lore-sync (not a real patron
    // arriving at the inn). Check at 0.75 similarity to catch epithet variants of already-registered
    // patrons/NPCs (e.g. "The Old Man" matching canonical "Aldric Blackthorn" who is a patron).
    if (!character.patronId) {
        const semQuery = `${cleanName} ${character.description}`;
        const semanticMatches = await searchCodexCharacterSemantic(semQuery, 0.75, 1);
        if (semanticMatches.length > 0) {
            console.log(`[Codex] Skipping duplicate character "${cleanName}" — semantically matches existing entry "${semanticMatches[0].name}"`);
            return semanticMatches[0];
        }
    }

    const embedText = `${cleanName}: ${character.description} (Type: ${character.characterType})`;
    const embedding = await generateEmbedding(embedText, 'google/gemini-embedding-001', 1536);

    const { data, error } = await supabase.from('codex_characters').insert({
        id: character.id, world_id: gameState.worldId, name: cleanName, description: character.description,
        character_type: character.characterType, patron_id: character.patronId, embedding
    }).select().single();
    if (error) throw new Error(`Failed to insert codex character: ${error.message}`);
    return { ...character, name: cleanName, id: data.id, discoveredAt: data.discovered_at };
}

export async function searchCodexCharacterByName(nameQuery: string): Promise<ICodexCharacter | null> {
    const cleanQuery = sanitizeName(nameQuery);
    const { data, error } = await supabase.from('codex_characters').select('*').eq('world_id', gameState.worldId).ilike('name', `%${cleanQuery}%`).limit(1).maybeSingle();
    if (error) throw new Error(`Failed to search codex character: ${error.message}`);
    if (!data) return null;
    return { id: data.id, name: data.name, description: data.description, characterType: data.character_type, patronId: data.patron_id, discoveredAt: data.discovered_at };
}

export async function searchCodexCharacterSemantic(query: string, matchThreshold: number = 0.7, matchCount: number = 3): Promise<ICodexCharacter[]> {
    const embedding = await generateEmbedding(query, 'google/gemini-embedding-001', 1536);
    const { data, error } = await supabase.rpc('match_codex_characters', {
        query_embedding: embedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        p_world_id: gameState.worldId
    });
    if (error) throw new Error(`Failed to semantic search characters: ${error.message}`);
    return (data as any[]).map(row => ({
        id: row.id, name: row.name, description: row.description, characterType: row.character_type, patronId: row.patron_id, discoveredAt: row.discovered_at
    }));
}

export async function insertCodexFaction(faction: ICodexFaction): Promise<ICodexFaction> {
    const cleanName = sanitizeName(faction.name);

    const existing = await searchCodexFactionByName(cleanName);
    if (existing) return existing;

    const embedText = `${cleanName}: ${faction.description} (Alignment: ${faction.alignment})`;
    const embedding = await generateEmbedding(embedText, 'google/gemini-embedding-001', 1536);

    const { data, error } = await supabase.from('codex_factions').insert({
        id: faction.id, world_id: gameState.worldId, name: cleanName, description: faction.description, alignment: faction.alignment, embedding
    }).select().single();
    if (error) throw new Error(`Failed to insert codex faction: ${error.message}`);
    return { ...faction, name: cleanName, id: data.id, discoveredAt: data.discovered_at };
}

export async function searchCodexFactionByName(nameQuery: string): Promise<ICodexFaction | null> {
    const cleanQuery = sanitizeName(nameQuery);
    const { data, error } = await supabase.from('codex_factions').select('*').eq('world_id', gameState.worldId).ilike('name', `%${cleanQuery}%`).limit(1).maybeSingle();
    if (error) throw new Error(`Failed to search codex faction: ${error.message}`);
    if (!data) return null;
    return { id: data.id, name: data.name, description: data.description, alignment: data.alignment, discoveredAt: data.discovered_at };
}

export async function searchCodexFactionSemantic(query: string, matchThreshold: number = 0.7, matchCount: number = 3): Promise<ICodexFaction[]> {
    const embedding = await generateEmbedding(query, 'google/gemini-embedding-001', 1536);
    const { data, error } = await supabase.rpc('match_codex_factions', {
        query_embedding: embedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        p_world_id: gameState.worldId
    });
    if (error) throw new Error(`Failed to semantic search factions: ${error.message}`);
    return (data as any[]).map(row => ({
        id: row.id, name: row.name, description: row.description, alignment: row.alignment, discoveredAt: row.discovered_at
    }));
}

export async function insertCodexRecipe(recipe: ICodexRecipe, materials: ICodexRecipeMaterial[]): Promise<ICodexRecipe> {
    const cleanName = sanitizeName(recipe.name);

    const existing = await searchCodexRecipeByName(cleanName);
    if (existing) return existing;

    const embedText = `${cleanName}: ${recipe.description}`;
    const embedding = await generateEmbedding(embedText, 'google/gemini-embedding-001', 1536);

    const { data, error } = await supabase.from('codex_recipes').insert({
        id: recipe.id, world_id: gameState.worldId, name: cleanName, description: recipe.description, crafted_item_id: recipe.craftedItemId, embedding
    }).select().single();
    if (error) throw new Error(`Failed to insert codex recipe: ${error.message}`);

    // Insert materials
    if (materials.length > 0) {
        const materialRows = materials.map(m => ({
            recipe_id: data.id,
            material_item_id: m.materialItemId,
            quantity: m.quantity
        }));
        const { error: matError } = await supabase.from('codex_recipe_materials').insert(materialRows); // No world_id needed, cascaded via recipe_id
        if (matError) throw new Error(`Failed to insert codex recipe materials: ${matError.message}`);
    }

    return { ...recipe, name: cleanName, id: data.id, discoveredAt: data.discovered_at };
}

export async function searchCodexRecipeByName(nameQuery: string): Promise<ICodexRecipe | null> {
    const cleanQuery = sanitizeName(nameQuery);
    const { data, error } = await supabase.from('codex_recipes').select('*').eq('world_id', gameState.worldId).ilike('name', `%${cleanQuery}%`).limit(1).maybeSingle();
    if (error) throw new Error(`Failed to search codex recipe: ${error.message}`);
    if (!data) return null;
    return { id: data.id, name: data.name, description: data.description, craftedItemId: data.crafted_item_id, discoveredAt: data.discovered_at };
}

export async function searchCodexRecipeSemantic(query: string, matchThreshold: number = 0.7, matchCount: number = 3): Promise<ICodexRecipe[]> {
    const embedding = await generateEmbedding(query, 'google/gemini-embedding-001', 1536);
    const { data, error } = await supabase.rpc('match_codex_recipes', {
        query_embedding: embedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        p_world_id: gameState.worldId
    });
    if (error) throw new Error(`Failed to semantic search recipes: ${error.message}`);
    return (data as any[]).map(row => ({
        id: row.id, name: row.name, description: row.description, craftedItemId: row.crafted_item_id, discoveredAt: row.discovered_at
    }));
}

export async function fetchRecentEvents(count: number = 20): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
        .from('event_log')
        .select('*')
        .eq('inn_id', gameState.innId)
        .order('created_at', { ascending: false })
        .limit(count);
    if (error) throw new Error(`Failed to fetch events: ${error.message}`);
    return data as Record<string, unknown>[];
}

// ═══════════════════════════════════════════════════════════════════════
//  ECONOMY (RPC wrappers)
// ═══════════════════════════════════════════════════════════════════════

/** Transfer gold between inn and patron. Positive = inn→patron. */
export async function transferGold(patronId: string, gold: number, copper: number = 0): Promise<void> {
    const { error } = await supabase.rpc('transfer_gold', {
        p_inn_id: gameState.innId,
        p_patron_id: patronId,
        p_gold: gold,
        p_copper: copper,
    });
    if (error) throw new Error(`Failed to transfer gold: ${error.message}`);
}
