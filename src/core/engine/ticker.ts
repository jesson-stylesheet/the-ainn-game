/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Ticker (The Time Dilation Loop)
 * ═══════════════════════════════════════════════════════════════════════
 * Every real second = TICK_MULTIPLIER in-game seconds.
 * On each tick: check for expired quests → resolve via Sigmoid math.
 */

import { TICK_MULTIPLIER, TICK_INTERVAL_MS } from '../constants';
import { resolveQuest } from '../math/probability';
import { gameState } from './gameState';
import { eventBus } from './eventBus';

class Ticker {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private tickCount = 0;
    private startRealTime = 0;      // When the engine started (real ms)
    private startGameTime = 0;      // The in-game epoch anchor

    /** Current simulated time in milliseconds. */
    get simulatedTime(): number {
        if (this.startRealTime === 0) return Date.now();
        const elapsedReal = Date.now() - this.startRealTime;
        return this.startGameTime + (elapsedReal * TICK_MULTIPLIER);
    }

    /** Start the tick loop. */
    start(initialGameTime?: number): void {
        if (this.intervalId) return; // Already running

        this.startRealTime = Date.now();
        this.startGameTime = initialGameTime ?? Date.now();
        this.tickCount = 0;

        eventBus.emit('engine:started', { startTime: this.startRealTime });

        this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    }

    /** Stop the tick loop. */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            eventBus.emit('engine:stopped', { stopTime: Date.now() });
        }
    }

    /** Is the engine currently running? */
    get isRunning(): boolean {
        return this.intervalId !== null;
    }

    /** Get current tick count. */
    get currentTick(): number {
        return this.tickCount;
    }

    /** Execute a single tick. Can be called manually for testing. */
    tick(): void {
        this.tickCount++;
        const simTime = this.simulatedTime;

        eventBus.emit('tick', { simulatedTime: simTime, tickCount: this.tickCount });

        // Tick all active quests down and get the ones ready to resolve
        const resolvingQuests = gameState.tickActiveQuests();

        for (const quest of resolvingQuests) {
            if (!quest.assignedPatronId) continue;

            const patron = gameState.getPatron(quest.assignedPatronId);
            if (!patron) continue;

            // Resolve through the Probability Engine
            const result = resolveQuest(patron, quest);
            gameState.recordResolution(result);
        }
    }
}

/** Singleton ticker instance. */
export const ticker = new Ticker();
