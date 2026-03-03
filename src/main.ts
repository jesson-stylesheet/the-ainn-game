/**
 * THE AINN — Entry Point
 * Run: npx ts-node src/main.ts
 */

import { startTUI } from './presentation/tui/gameUI';
import { syncAdapter } from './infrastructure/db/syncAdapter';

async function bootstrap() {
    syncAdapter.init();
    await syncAdapter.hydrateGameState();
    await startTUI();
}

bootstrap().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
