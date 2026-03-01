import { createPatron } from './src/core/engine/patronFactory';
const p1 = createPatron('human', 'warrior');
const p2 = createPatron('kitsune', 'cleric');
const p3 = createPatron('goblin', 'wizard');
console.log("--- P1 ---", p1.archetype, p1.skills);
console.log("--- P2 ---", p2.archetype, p2.skills);
console.log("--- P3 ---", p3.archetype, p3.skills);
