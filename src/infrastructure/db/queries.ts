/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Database Queries
 * ═══════════════════════════════════════════════════════════════════════
 * All Supabase CRUD operations for patrons, quests, items, lore,
 * resolutions, events, and inn state.
 * The core engine calls these instead of touching the DB directly.
 */

import { supabase } from './supabaseClient';
import type {
    IPatron, IQuest, QuestResolutionResult, SkillVector,
    IItem, ItemCategory, ItemLocation, EquipmentSlot,
} from '../../core/types/entity';

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
    created_at: string;
    updated_at: string;
}

interface QuestRow {
    id: string;
    original_text: string;
    quest_type: string;
    requirements: SkillVector;
    difficulty_scalar: number;
    resolution_ticks: number;
    assigned_patron_id: string | null;
    posted_by_patron_id: string | null;
    status: string;
    deadline_timestamp: number;
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
    id: number;
    current_tick: number;
    gold: number;
    copper: number;
    reputation: number;
    created_at: string;
    updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════
//  INN STATE
// ═══════════════════════════════════════════════════════════════════════

export interface InnState {
    currentTick: number;
    gold: number;
    copper: number;
    reputation: number;
}

export async function fetchInnState(): Promise<InnState> {
    const { data, error } = await supabase.from('inn_state').select('*').eq('id', 1).single();
    if (error) throw new Error(`Failed to fetch inn state: ${error.message}`);
    const row = data as InnStateRow;
    return { currentTick: row.current_tick, gold: row.gold, copper: row.copper, reputation: row.reputation };
}

export async function updateInnState(updates: Partial<InnState>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.currentTick !== undefined) dbUpdates.current_tick = updates.currentTick;
    if (updates.gold !== undefined) dbUpdates.gold = updates.gold;
    if (updates.copper !== undefined) dbUpdates.copper = updates.copper;
    if (updates.reputation !== undefined) dbUpdates.reputation = updates.reputation;

    const { error } = await supabase.from('inn_state').update(dbUpdates).eq('id', 1);
    if (error) throw new Error(`Failed to update inn state: ${error.message}`);
}

/** Tick the game clock via Postgres RPC. Returns the new tick value. */
export async function tickGameClock(ticksToAdd: number = 1): Promise<number> {
    const { data, error } = await supabase.rpc('tick_game_clock', { ticks_to_add: ticksToAdd });
    if (error) throw new Error(`Failed to tick game clock: ${error.message}`);
    return data as number;
}

/** Get full dashboard stats in a single Postgres call. */
export async function fetchDashboard(): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('get_inn_dashboard');
    if (error) throw new Error(`Failed to fetch dashboard: ${error.message}`);
    return data as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════
//  ITEMS
// ═══════════════════════════════════════════════════════════════════════

export async function insertItem(item: IItem): Promise<void> {
    const { error } = await supabase.from('items').insert({
        id: item.id,
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
    const { data, error } = await supabase.from('items').select('*');
    if (error) throw new Error(`Failed to fetch items: ${error.message}`);
    return (data as ItemRow[]).map(rowToItem);
}

export async function fetchItemsByLocation(location: ItemLocation): Promise<IItem[]> {
    const { data, error } = await supabase.from('items').select('*').eq('location', location);
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
    const { error } = await supabase.from('items').update(updates).eq('id', id);
    if (error) throw new Error(`Failed to update item location: ${error.message}`);
}

export async function deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete item: ${error.message}`);
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
    });
    if (error) throw new Error(`Failed to insert patron: ${error.message}`);
}

export async function updatePatronState(id: string, state: IPatron['state']): Promise<void> {
    const { error } = await supabase.from('patrons').update({ state }).eq('id', id);
    if (error) throw new Error(`Failed to update patron state: ${error.message}`);
}

export async function updatePatronHealth(id: string, healthStatus: IPatron['healthStatus']): Promise<void> {
    const { error } = await supabase.from('patrons').update({ health_status: healthStatus }).eq('id', id);
    if (error) throw new Error(`Failed to update patron health: ${error.message}`);
}

export async function fetchAllPatrons(): Promise<IPatron[]> {
    const { data, error } = await supabase.from('patrons').select('*');
    if (error) throw new Error(`Failed to fetch patrons: ${error.message}`);
    return (data as PatronRow[]).map(rowToPatron);
}

export async function fetchPatronsByState(state: string): Promise<IPatron[]> {
    const { data, error } = await supabase.from('patrons').select('*').eq('state', state);
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

// ═══════════════════════════════════════════════════════════════════════
//  QUESTS
// ═══════════════════════════════════════════════════════════════════════

export async function insertQuest(quest: IQuest, verbosityScore?: number): Promise<void> {
    const tagCount = Object.values(quest.requirements).filter(v => v > 0).length;
    const { error } = await supabase.from('quests').insert({
        id: quest.id,
        original_text: quest.originalText,
        quest_type: quest.type,
        requirements: quest.requirements,
        difficulty_scalar: quest.difficultyScalar,
        resolution_ticks: quest.resolutionTicks,
        assigned_patron_id: quest.assignedPatronId,
        posted_by_patron_id: quest.postedByPatronId ?? null,
        status: quest.status,
        deadline_timestamp: quest.deadlineTimestamp,
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
    const { error } = await supabase.from('quests').update(update).eq('id', id);
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

export async function fetchExpiredQuests(simulatedTime: number): Promise<IQuest[]> {
    const { data, error } = await supabase
        .from('quests')
        .select('*')
        .eq('status', 'ACCEPTED')
        .lte('deadline_timestamp', simulatedTime);
    if (error) throw new Error(`Failed to fetch expired quests: ${error.message}`);
    return (data as QuestRow[]).map(rowToQuest);
}

export async function fetchAllQuests(): Promise<IQuest[]> {
    const { data, error } = await supabase.from('quests').select('*');
    if (error) throw new Error(`Failed to fetch quests: ${error.message}`);
    return (data as QuestRow[]).map(rowToQuest);
}

export async function fetchQuestsByStatus(status: string): Promise<IQuest[]> {
    const { data, error } = await supabase.from('quests').select('*').eq('status', status);
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
        resolutionTicks: row.resolution_ticks ?? 20,
        assignedPatronId: row.assigned_patron_id,
        postedByPatronId: row.posted_by_patron_id ?? null,
        status: row.status as IQuest['status'],
        deadlineTimestamp: row.deadline_timestamp,
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
}): Promise<void> {
    const { error } = await supabase.from('lore_chronicle').insert({
        quest_id: entry.questId,
        patron_id: entry.patronId ?? null,
        original_text: entry.originalText,
        outcome: entry.outcome ?? null,
        patron_name: entry.patronName ?? null,
        patron_archetype: entry.patronArchetype ?? null,
        lore_text: entry.loreText ?? '',
        story_text: entry.storyText ?? '',
        narrative_seed: entry.narrativeSeed ?? null,
    });
    if (error) throw new Error(`Failed to insert lore: ${error.message}`);
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
        .eq('quest_id', questId);
    if (error) throw new Error(`Failed to update lore: ${error.message}`);
}

export async function fetchRecentLore(count: number): Promise<LoreRow[]> {
    const { data, error } = await supabase
        .from('lore_chronicle')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(count);
    if (error) throw new Error(`Failed to fetch lore: ${error.message}`);
    return data as LoreRow[];
}

// ═══════════════════════════════════════════════════════════════════════
//  EVENT LOG
// ═══════════════════════════════════════════════════════════════════════

/** Log a game event via Postgres RPC (auto-reads current_tick). */
export async function logEvent(
    eventType: string,
    subjectId: string | null,
    subjectType: 'PATRON' | 'QUEST' | 'ITEM' | 'INN' | 'LORE',
    payload: Record<string, unknown> = {},
    gameTick?: number
): Promise<void> {
    const { error } = await supabase.rpc('log_event', {
        p_event_type: eventType,
        p_subject_id: subjectId,
        p_subject_type: subjectType,
        p_payload: payload,
        p_game_tick: gameTick ?? null,
    });
    if (error) throw new Error(`Failed to log event: ${error.message}`);
}

export async function fetchRecentEvents(count: number = 20): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
        .from('event_log')
        .select('*')
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
        p_patron_id: patronId,
        p_gold: gold,
        p_copper: copper,
    });
    if (error) throw new Error(`Failed to transfer gold: ${error.message}`);
}
