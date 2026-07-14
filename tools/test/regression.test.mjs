/**
 * Regression guard: recomputes engine outputs for every verified state and
 * asserts they exactly match the committed snapshot (to the cent). This locks
 * live math so an engine refactor cannot silently shift what real users see.
 *
 * If this test fails after an INTENTIONAL change, review the diff, then
 * regenerate with `node tools/gen-snapshot.mjs` and commit the new snapshot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAllStates } from '../lib/getStateData.mjs';
import { snapshotState, SCENARIOS } from '../lib/snapshotScenarios.mjs';
import { slimStateData } from '../lib/template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(
  readFileSync(join(__dirname, 'snapshots', 'verified-states.snapshot.json'), 'utf8'),
);

test('snapshot scenario set is unchanged', () => {
  assert.deepEqual(snapshot.scenarios, SCENARIOS);
});

// The browser only gets the projected STATE_DATA (slimStateData). If that
// projection ever drops a field the engine reads, the live calculator silently
// diverges from the tested engine (e.g. a modifier no-ops). Lock them together.
test('client STATE_DATA projection matches the full engine for every state', () => {
  for (const s of loadAllStates()) {
    assert.deepEqual(
      snapshotState(slimStateData(s)),
      snapshotState(s),
      `${s.slug}: slimStateData projection diverges from full state: a field the engine reads is missing from slimStateData`,
    );
  }
});

test('every verified state matches its locked snapshot outputs', () => {
  const states = loadAllStates().filter((s) => !s.needsVerification);
  const missing = [];
  for (const s of states) {
    const expected = snapshot.states[s.slug];
    if (!expected) { missing.push(s.slug); continue; }
    assert.deepEqual(snapshotState(s), expected, `outputs shifted for ${s.slug}`);
  }
  assert.equal(missing.length, 0, `verified states missing from snapshot (regenerate): ${missing.join(', ')}`);
});

// Explicit hand-checked known-answer anchors ($80k self-employment, single).
// These pin the figures I verified by hand so intent is legible in the test.
const HAND_CHECKED = {
  'new-york': 3417.8,
  iowa: 2825.23,
  virginia: 3514.4,
  minnesota: 3532.29,
  'south-carolina': 2853.19,
  oklahoma: 2993.91,
  'new-jersey': 2906.05,
  kansas: 3348.94,
  utah: 3072.25,
  alabama: 3101.08,
  connecticut: 3339.15,
  arkansas: 2385.59,
  mississippi: 2241.93,
  'west-virginia': 2516.05,
  hawaii: 3846.72,
  'new-mexico': 2328.66,
  nebraska: 2527.38,
  'rhode-island': 2188.06,
  montana: 2839.77,
  'district-of-columbia': 3457.63,
  delaware: 3565.98,
  'north-dakota': 190.58,
  maine: 3367.7,
  maryland: 5591.86,
  vermont: 2534.78,
};
test('hand-checked $80k single state tax anchors', () => {
  const byslug = Object.fromEntries(loadAllStates().map((s) => [s.slug, s]));
  for (const [slug, expected] of Object.entries(HAND_CHECKED)) {
    const s = byslug[slug];
    assert.ok(s && !s.needsVerification, `${slug} should be verified`);
    const r = snapshotState(s)[0]; // scenario 0 = $80k single
    assert.ok(Math.abs(r.stateIncomeTax - expected) < 0.5,
      `${slug} $80k single state tax expected ~${expected}, got ${r.stateIncomeTax}`);
  }
});
