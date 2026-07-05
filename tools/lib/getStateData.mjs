/**
 * Typed loader for state data. Reads + validates every file up front and
 * throws (failing the build) if any file is invalid.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateState } from './stateSchema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data', 'states');
const CLUSTER_DIR = join(DATA_DIR, 'quarterly-tax');

/** @returns {{slug:string,name:string,abbreviation:string,hasStateIncomeTax:boolean}[]} */
export function loadIndex() {
  return JSON.parse(readFileSync(join(DATA_DIR, 'index.json'), 'utf8'));
}

/** Load + validate every state file. Throws with a combined error report. */
export function loadAllStates() {
  const files = readdirSync(CLUSTER_DIR).filter((f) => f.endsWith('.json'));
  const states = [];
  const errors = [];
  for (const f of files.sort()) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(CLUSTER_DIR, f), 'utf8'));
    } catch (err) {
      errors.push(`[${f}] invalid JSON: ${err.message}`);
      continue;
    }
    const errs = validateState(data);
    if (errs.length) errors.push(...errs.map((e) => e.replace('<file>', f)));
    else states.push(data);
  }
  if (errors.length) {
    throw new Error(
      `State data validation failed (${errors.length} error(s)):\n` +
      errors.map((e) => `  - ${e}`).join('\n'),
    );
  }
  states.sort((a, b) => a.name.localeCompare(b.name));
  return states;
}
