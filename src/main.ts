/**
 * THE AINN — Entry Point
 * Run: npx ts-node src/main.ts
 */

import { startTUI } from './presentation/tui/gameUI';
import { syncAdapter } from './infrastructure/db/syncAdapter';
import { gameState } from './core/engine/gameState';

async function bootstrap() {
    // 1. Multi-Tenancy Default Registration (TUI Tester)
    gameState.setIdentifiers(
        '00000000-0000-0000-0000-000000000001', // Player
        '00000000-0000-0000-0000-000000000002', // World
        '00000000-0000-0000-0000-000000000003'  // Inn
    );

    // 2. Subsystems Boot
    syncAdapter.init();
    await syncAdapter.hydrateGameState();

    // 3. UI Start
    await startTUI();
}

bootstrap().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
