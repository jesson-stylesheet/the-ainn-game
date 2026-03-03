/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Event Bus
 * ═══════════════════════════════════════════════════════════════════════
 * Typed PubSub so the core engine can emit serializable events
 * without knowing anything about the UI layer. (Blueprint §9.1)
 */

import { EventEmitter } from 'events';
import type { IPatron, IQuest, QuestResolutionResult, IItem } from '../types/entity';

// ── Event Map ───────────────────────────────────────────────────────────

export interface GameEvents {
    'patron:arrived': { patron: IPatron };
    'patron:departed': { patron: IPatron; reason: string };
    'quest:posted': { quest: IQuest };
    'quest:accepted': { quest: IQuest; patron: IPatron };
    'quest:expired': { quest: IQuest };
    'quest:resolved': { result: QuestResolutionResult; patron: IPatron; quest: IQuest };
    'item:added': { item: IItem };
    'narrative:completed': {
        questId: string;
        patronId: string;
        success: boolean;
        story: string;
        loreEntry: string;
        patronHealth: string;
        injuryDescription?: string;
    };
    'tick': { simulatedTime: number; tickCount: number };
    'engine:started': { startTime: number };
    'engine:stopped': { stopTime: number };
    'lore:guardian_arrived': { recentLore: string };
    'inn:reputation_gained': { amount: number, total: number };
}

export type GameEventName = keyof GameEvents;

// ── Typed Event Bus ─────────────────────────────────────────────────────

class GameEventBus {
    private emitter = new EventEmitter();

    constructor() {
        this.emitter.setMaxListeners(50);
    }

    emit<K extends GameEventName>(event: K, data: GameEvents[K]): void {
        this.emitter.emit(event, data);
    }

    on<K extends GameEventName>(event: K, handler: (data: GameEvents[K]) => void): void {
        this.emitter.on(event, handler);
    }

    off<K extends GameEventName>(event: K, handler: (data: GameEvents[K]) => void): void {
        this.emitter.off(event, handler);
    }

    once<K extends GameEventName>(event: K, handler: (data: GameEvents[K]) => void): void {
        this.emitter.once(event, handler);
    }

    removeAllListeners(): void {
        this.emitter.removeAllListeners();
    }
}

/** Singleton event bus — the nervous system of the engine. */
export const eventBus = new GameEventBus();
