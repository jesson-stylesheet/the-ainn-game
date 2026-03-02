/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Headless Server Entry
 * ═══════════════════════════════════════════════════════════════════════
 * Express server exposing the core engine via REST API and Server-Sent 
 * Events (SSE). Runs independently of any UI.
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { eventBus } from '../core/engine/eventBus';
import { ticker } from '../core/engine/ticker';
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

// START THE ENGINE
ticker.start();

// ── REST API ────────────────────────────────────────────────────────────

// 1. Get Game State
app.get('/api/state', (req, res) => {
    res.json({
        summary: gameState.getSummary(),
        inn: {
            tick: gameState.currentTick,
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

        const quest = await parseQuestWithLLM(text);
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
        const patron = createPatron();
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

    const success = gameState.assignPatronToQuest(patronId, questId);
    if (success) {
        res.json({ success: true, message: 'Patron assigned to quest' });
    } else {
        res.status(400).json({ success: false, error: 'Failed to assign patron. Check states and material requirements.' });
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
        // Filter ticks to 1 per second if TICK_MULTIPLIER is fast, to avoid spam? 
        // For now, emit them all so client sees the smooth clock.
        'tick': (data: any) => sendEvent('tick', data),
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
