/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Headless Server Entry
 * ═══════════════════════════════════════════════════════════════════════
 * Express server exposing the core engine via REST API and Server-Sent 
 * Events (SSE). Runs independently of any UI.
 * 
 * Legacy Note: Previously, the server started a real-time 'ticker.start()'
 * loop. Game time is now entirely player-driven via POST /api/day/advance.
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { eventBus } from '../core/engine/eventBus';
import { dayEngine } from '../core/engine/dayEngine';
import { gameState } from '../core/engine/gameState';
import { syncAdapter } from '../infrastructure/db/syncAdapter';
import { narrativeWorker } from '../core/engine/narrativeWorker';
import { parseQuestWithLLM } from '../infrastructure/llm/questParser';

config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize background workers and adapters
narrativeWorker.init();
syncAdapter.init();

// HYDRATE THE ENGINE (no more ticker.start() — time is player-driven)
syncAdapter.hydrateGameState().then(() => {
    console.log(`✅ Engine hydrated. Day ${gameState.currentDay}. Waiting for player commands.`);
}).catch((e) => {
    console.error('Failed to hydrate game state', e);
});

// ── REST API ────────────────────────────────────────────────────────────

// 1. Get Game State
app.get('/api/state', (req, res) => {
    res.json({
        summary: gameState.getSummary(),
        inn: {
            day: gameState.currentDay,
            gold: gameState.innGold,
            copper: gameState.innCopper,
            reputation: gameState.reputation
        },
        patrons: gameState.getAllPatrons(),
        quests: gameState.getAllQuests(),
        inventory: gameState.getInnInventory(),
    });
});

// 2. Post a Quest
app.post('/api/quests', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Quest text is required' });
        }

        const quest = await parseQuestWithLLM(text, gameState.reputation);
        gameState.addQuest(quest);
        res.status(201).json(quest);
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

// 2.5 Summon Patron
app.post('/api/patrons', async (req, res) => {
    try {
        const { createPatron } = await import('../core/engine/patronFactory');
        const patron = createPatron(undefined, undefined, gameState.reputation);
        gameState.addPatron(patron);
        res.status(201).json(patron);
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

// 3. Assign Patron to Quest
app.post('/api/quests/assign', (req, res) => {
    const { patronId, questId } = req.body;
    if (!patronId || !questId) {
        return res.status(400).json({ error: 'patronId and questId required' });
    }

    const result = gameState.assignPatronToQuest(patronId, questId);
    if (result.ok) {
        res.json({ success: true, message: 'Patron assigned to quest' });
    } else {
        res.status(400).json({ success: false, error: result.error ?? 'Failed to assign patron. Check states and material requirements.' });
    }
});

// 4. Advance Day (the core game loop trigger)
app.post('/api/day/advance', (req, res) => {
    try {
        const summary = dayEngine.advanceDay();
        res.json(summary);
    } catch (e) {
        res.status(500).json({ error: (e as Error).message });
    }
});

// ── SERVER-SENT EVENTS (SSE) ────────────────────────────────────────────
// The Svelte Client subscribes here to receive real-time engine events.

app.get('/api/events', (req, res) => {
    // Standard headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Helper to send typed events
    const sendEvent = (event: string, data: any) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Forward all core events to the client
    const handlers = {
        'patron:arrived': (data: any) => sendEvent('patron:arrived', data),
        'patron:departed': (data: any) => sendEvent('patron:departed', data),
        'quest:posted': (data: any) => sendEvent('quest:posted', data),
        'quest:accepted': (data: any) => sendEvent('quest:accepted', data),
        'quest:resolved': (data: any) => sendEvent('quest:resolved', data),
        'narrative:completed': (data: any) => sendEvent('narrative:completed', data),
        'item:added': (data: any) => sendEvent('item:added', data),
        'day:started': (data: any) => sendEvent('day:started', data),
        'day:ended': (data: any) => sendEvent('day:ended', data),
    };

    // Attach listeners
    Object.entries(handlers).forEach(([event, handler]) => {
        eventBus.on(event as any, handler);
    });

    // Send a polite initial connection event
    sendEvent('connected', { message: 'Connected to The AInn Engine', time: Date.now() });

    // Cleanup on disconnect
    req.on('close', () => {
        Object.entries(handlers).forEach(([event, handler]) => {
            eventBus.off(event as any, handler);
        });
    });
});

// ── Start Server ────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`\n🚀 [Headless Engine] Running on http://localhost:${PORT}`);
    console.log(`📡 [SSE Endpoint] http://localhost:${PORT}/api/events`);
});
