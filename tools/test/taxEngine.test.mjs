import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBrackets,
  computeSelfEmploymentTax,
  estimateQuarterly,
  FEDERAL_2026,
} from '../lib/taxEngine.mjs';

const close = (actual, expected, tol = 0.5) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);

// --- applyBrackets: hand-computed federal single @ $100k taxable ------------
test('applyBrackets: federal single $100k taxable = $16,712', () => {
  // 10%*12400 + 12%*38000 + 22%*49600 = 1240 + 4560 + 10912
  close(applyBrackets(100000, FEDERAL_2026.brackets.single), 16712);
});

test('applyBrackets: zero / negative income = 0', () => {
  assert.equal(applyBrackets(0, FEDERAL_2026.brackets.single), 0);
  assert.equal(applyBrackets(-5000, FEDERAL_2026.brackets.single), 0);
});

test('applyBrackets: empty bracket table (no-tax state) = 0', () => {
  assert.equal(applyBrackets(100000, []), 0);
});

// --- SE tax: 92.35% multiplier + both halves --------------------------------
test('SE tax: $100k net SE, single, no wages', () => {
  const r = computeSelfEmploymentTax(100000, 'single', 0);
  // taxableSE 92350 -> SS 92350*0.124=11451.40 + Medicare 92350*0.029=2678.15
  close(r.taxableSE, 92350);
  close(r.seTax, 14129.55);
  close(r.halfDeduction, 7064.775);
});

test('SE tax: Social Security wage base caps the SS portion', () => {
  const r = computeSelfEmploymentTax(250000, 'single', 0);
  // taxableSE 230875 > 184500 base -> SS = 184500*0.124=22878 ; Medicare=230875*0.029
  close(r.ssPortion, 22878);
  close(r.medicarePortion, 6695.375);
  close(r.seTax, 29573.375);
});

test('SE tax: W-2 wages consume the SS wage base first', () => {
  const r = computeSelfEmploymentTax(50000, 'single', 180000);
  // ssRoom = 184500-180000 = 4500 ; SS = 4500*0.124=558 ; Medicare=46175*0.029
  close(r.ssPortion, 558);
  close(r.seTax, 558 + 46175 * 0.029);
});

// --- Full estimate: CA (state noindex, brackets present) --------------------
// Uses a real flat-tax layer (Colorado 4.4%) for a deterministic state number.
test('estimateQuarterly: Colorado flat 4.4% state layer', () => {
  const co = {
    hasStateIncomeTax: true,
    brackets_single: [{ min: 0, max: null, rate: 0.044 }],
    brackets_married: [{ min: 0, max: null, rate: 0.044 }],
    standardDeduction_single: 16100,
    standardDeduction_married: 32200,
    quarterlyWeights: null,
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 80000, filingStatus: 'single' }, co);
  // state taxable = 80000 - 16100 = 63900 ; *0.044 = 2811.60
  close(r.stateIncomeTax, 2811.6);
  assert.ok(r.stateComputable);
  // federal SE + income should be positive and total = fed + state
  close(r.totalAnnual, r.federalTotal + r.stateIncomeTax);
});

// --- No-tax state (Texas): federal only -------------------------------------
test('estimateQuarterly: Texas (no state income tax) = federal only', () => {
  const tx = {
    hasStateIncomeTax: false,
    brackets_single: [],
    brackets_married: [],
    standardDeduction_single: null,
    standardDeduction_married: null,
    quarterlyWeights: null,
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 80000, filingStatus: 'single' }, tx);
  assert.equal(r.stateComputable, false);
  assert.equal(r.stateIncomeTax, 0);
  close(r.totalAnnual, r.federalTotal);
});

// --- Weighted quarters (California 30/40/0/30) ------------------------------
test('estimateQuarterly: weighted state quarters sum to the annual state tax', () => {
  const ca = {
    hasStateIncomeTax: true,
    brackets_single: [{ min: 0, max: null, rate: 0.05 }],
    brackets_married: [{ min: 0, max: null, rate: 0.05 }],
    standardDeduction_single: 5700,
    standardDeduction_married: 11400,
    quarterlyWeights: [0.30, 0.40, 0, 0.30],
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 90000, filingStatus: 'single' }, ca);
  const stateSum = r.quarters.reduce((a, q) => a + q.state, 0);
  close(stateSum, r.stateIncomeTax);
  assert.equal(r.quarters[2].state, 0); // Q3 has no state installment
  // Federal remains equal quarters
  close(r.quarters[0].federal, r.federalTotal * 0.25);
});

// --- Safe harbor ------------------------------------------------------------
test('estimateQuarterly: 110% prior-year safe harbor when AGI > $150k', () => {
  const tx = { hasStateIncomeTax: false, brackets_single: [], brackets_married: [], standardDeduction_single: null, standardDeduction_married: null };
  const r = estimateQuarterly(
    { selfEmploymentIncome: 250000, filingStatus: 'single', priorYearTax: 40000 },
    tx,
  );
  assert.equal(r.safeHarbor.priorMultiplier, 1.10);
  // target is the lesser of 90% current and 110% prior
  close(r.safeHarbor.target, Math.min(r.federalTotal * 0.9, 44000));
});
