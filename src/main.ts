/**
 * THE AINN — Entry Point
 * Run: npx ts-node src/main.ts
 */

import { startTUI } from './presentation/tui/gameUI';
import { syncAdapter } from './infrastructure/db/syncAdapter';
import { gameState } from './core/engine/gameState';

async function bootstrap() {
    // 1. UI Start (TUI will handle login and hydration)
    await startTUI();
}

bootstrap().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
