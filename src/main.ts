/**
 * THE AINN — Entry Point
 * Run: npx ts-node src/main.ts
 */

import { startTUI } from './presentation/tui/gameUI';

startTUI().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
