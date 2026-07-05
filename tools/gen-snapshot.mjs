/**
 * Regenerates the regression snapshot of engine outputs for every currently
 * VERIFIED (indexed) state. Run this ONLY when you have intentionally added a
 * verified state or deliberately changed the math — never to paper over an
 * unexpected diff. The regression test (tools/test/regression.test.mjs) compares
 * the live engine against this file and never writes it.
 *
 *   node tools/gen-snapshot.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAllStates } from './lib/getStateData.mjs';
import { SCENARIOS, snapshotState } from './lib/snapshotScenarios.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'test', 'snapshots', 'verified-states.snapshot.json');

const states = loadAllStates().filter((s) => !s.needsVerification);
const snapshot = {
  note: 'Locked engine outputs for verified/indexed states. Regenerate ONLY via tools/gen-snapshot.mjs after an intentional change.',
  scenarios: SCENARIOS,
  states: {},
};
for (const s of states) snapshot.states[s.slug] = snapshotState(s);

writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Wrote snapshot for ${states.length} verified states -> ${OUT}`);
