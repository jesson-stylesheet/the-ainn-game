/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Database Queries
 * ═══════════════════════════════════════════════════════════════════════
 * All Supabase CRUD operations for patrons, quests, and lore.
 * The core engine calls these instead of touching the DB directly.
 */

import { supabase } from './supabaseClient';
import type { IPatron, IQuest, QuestResolutionResult, SkillVector, IItem, ItemCategory, EquipmentSlot } from '../../core/types/entity';

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
}

interface QuestRow {
    id: string;
    original_text: string;
    quest_type: string;
    requirements: SkillVector;
    difficulty_scalar: number;
    resolution_ticks: number;
    assigned_patron_id: string | null;
    status: string;
    deadline_timestamp: number;
    verbosity_score: number;
    tag_count: number;
    resolution_data: QuestResolutionResult | null;
    item_name: string | null;
    item_category: string | null;
    item_quantity: number | null;
    item_rarity: number | null;
}

interface LoreRow {
    id: string;
    quest_id: string | null;
    original_text: string;
    outcome: string | null;
    patron_name: string | null;
    patron_archetype: string | null;
    narrative_seed: string | null;
}

interface ItemRow {
    id: string;
    name: string;
    category: string;
    rarity: number;
    quantity: number;
    owner_patron_id: string | null;
    equipped_slot: string | null;
}

// ── Item Queries ────────────────────────────────────────────────────────

export async function insertItem(item: IItem): Promise<void> {
    const { error } = await supabase.from('items').insert({
        id: item.id,
        name: item.name,
        category: item.category,
        rarity: item.rarity,
        quantity: item.quantity,
        owner_patron_id: item.ownerPatronId ?? null,
        equipped_slot: item.equippedSlot ?? null,
    });
    if (error) throw new Error(`Failed to insert item: ${error.message}`);
}

export async function fetchAllItems(): Promise<IItem[]> {
    const { data, error } = await supabase.from('items').select('*');
    if (error) throw new Error(`Failed to fetch items: ${error.message}`);
    return (data as ItemRow[]).map(rowToItem);
}

export async function updateItemLocation(
    id: string,
    ownerPatronId: string | null,
    equippedSlot: EquipmentSlot | null,
    quantity?: number
): Promise<void> {
    const updates: any = {
        owner_patron_id: ownerPatronId,
        equipped_slot: equippedSlot,
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
    };
}

// ── Patron Queries ──────────────────────────────────────────────────────

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
    });
    if (error) throw new Error(`Failed to insert patron: ${error.message}`);
}

export async function updatePatronState(id: string, state: IPatron['state']): Promise<void> {
    const { error } = await supabase.from('patrons').update({ state }).eq('id', id);
    if (error) throw new Error(`Failed to update patron state: ${error.message}`);
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

// ── Quest Queries ───────────────────────────────────────────────────────

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
        status: quest.status,
        deadline_timestamp: quest.deadlineTimestamp,
        verbosity_score: verbosityScore ?? 0,
        tag_count: tagCount,
        item_name: quest.itemDetails?.itemName ?? null,
        item_category: quest.itemDetails?.category ?? null,
        item_quantity: quest.itemDetails?.quantity ?? null,
        item_rarity: quest.itemDetails?.rarity ?? null,
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

export async function assignPatronToQuest(patronId: string, questId: string): Promise<void> {
    const { error } = await supabase.from('quests').update({
        assigned_patron_id: patronId,
        status: 'ACCEPTED',
    }).eq('id', questId);
    if (error) throw new Error(`Failed to assign patron: ${error.message}`);
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
        resolutionTicks: row.resolution_ticks ?? 20, // default if older row without ticks
        assignedPatronId: row.assigned_patron_id,
        postedByPatronId: null, // DB quests are player-posted
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
    return quest;
}

// ── Lore Chronicle Queries ──────────────────────────────────────────────

export async function insertLoreEntry(entry: {
    questId: string | null;
    originalText: string;
    outcome?: 'COMPLETED' | 'FAILED' | 'SYNTHESIS';
    patronName?: string;
    patronArchetype?: string;
    narrativeSeed?: string;
}): Promise<void> {
    const { error } = await supabase.from('lore_chronicle').insert({
        quest_id: entry.questId,
        original_text: entry.originalText,
        outcome: entry.outcome ?? null,
        patron_name: entry.patronName ?? null,
        patron_archetype: entry.patronArchetype ?? null,
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
