import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBrackets,
  computeSelfEmploymentTax,
  estimateQuarterly,
  slidingStandardDeduction,
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

test('estimateQuarterly: federal_taxable_income basis taxes federal taxable income', () => {
  const st = {
    hasStateIncomeTax: true,
    stateTaxBasis: 'federal_taxable_income',
    brackets_single: [{ min: 0, max: null, rate: 0.044 }],
    brackets_married: [{ min: 0, max: null, rate: 0.044 }],
    standardDeduction_single: 0,
    standardDeduction_married: 0,
    quarterlyWeights: null,
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 80000, filingStatus: 'single' }, st);
  // federal taxable = 80000 - halfSE(5651.82) - 16100 = 58248.18 ; *0.044 = 2562.92
  close(r.stateIncomeTax, 2562.92, 1);
});

test('estimateQuarterly: federal_agi basis minus a state exemption', () => {
  const st = {
    hasStateIncomeTax: true,
    stateTaxBasis: 'federal_agi',
    brackets_single: [{ min: 0, max: null, rate: 0.0425 }],
    brackets_married: [{ min: 0, max: null, rate: 0.0425 }],
    standardDeduction_single: 5900,   // Michigan personal exemption
    standardDeduction_married: 11800,
    quarterlyWeights: null,
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 80000, filingStatus: 'single' }, st);
  // federal AGI = 80000 - 5651.82 = 74348.18 ; minus 5900 = 68448.18 ; *0.0425 = 2909.05
  close(r.stateIncomeTax, 2909.05, 1);
});

// --- federalTaxDeduction: Oregon-style cap-phaseout -------------------------
test('federalTaxDeduction cap-phaseout (Oregon): subtracts min(fedTax, cap) below phaseout', () => {
  const or = {
    hasStateIncomeTax: true, stateTaxBasis: 'federal_agi',
    brackets_single: [{ min: 0, max: null, rate: 0.0875 }],
    brackets_married: [{ min: 0, max: null, rate: 0.0875 }],
    standardDeduction_single: 2835, standardDeduction_married: 5670,
    federalTaxDeduction: { mode: 'cap-phaseout', capSingle: 8500, capMarried: 8500, tiers: [{ agiUpTo: 125000, factor: 1 }, { agiUpTo: 145000, factor: 0.5 }, { agiUpTo: null, factor: 0 }] },
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 80000, filingStatus: 'single' }, or);
  // federalAGI 74348.18 (<125k, factor 1); fedIncomeTax ~7526.60 < cap 8500 -> subtract 7526.60
  // base 74348.18 - 2835 - 7526.60 = 63986.58 ; *0.0875 = 5598.83
  close(r.stateIncomeTax, 5598.83, 1);
});

test('federalTaxDeduction cap-phaseout: fully phased out above top AGI tier', () => {
  const or = {
    hasStateIncomeTax: true, stateTaxBasis: 'federal_agi',
    brackets_single: [{ min: 0, max: null, rate: 0.099 }],
    brackets_married: [{ min: 0, max: null, rate: 0.099 }],
    standardDeduction_single: 0, standardDeduction_married: 0,
    federalTaxDeduction: { mode: 'cap-phaseout', capSingle: 8500, capMarried: 8500, tiers: [{ agiUpTo: 145000, factor: 1 }, { agiUpTo: null, factor: 0 }] },
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 300000, filingStatus: 'single' }, or);
  // AGI > 145k -> factor 0 -> no subtraction; base = federalAGI
  close(r.stateIncomeTax, r.federalAGI * 0.099, 1);
});

// --- federalTaxDeduction: Missouri-style percent-of-federal -----------------
test('federalTaxDeduction percent-of-federal (Missouri): min(fedTax*pct, cap)', () => {
  const mo = {
    hasStateIncomeTax: true, stateTaxBasis: 'federal_agi',
    brackets_single: [{ min: 0, max: null, rate: 0.047 }],
    brackets_married: [{ min: 0, max: null, rate: 0.047 }],
    standardDeduction_single: 16100, standardDeduction_married: 32200,
    federalTaxDeduction: { mode: 'percent-of-federal', capSingle: 5000, capMarried: 10000,
      tiers: [{ agiUpTo: 25000, factor: 0.35 }, { agiUpTo: 50000, factor: 0.25 }, { agiUpTo: 100000, factor: 0.15 }, { agiUpTo: 125000, factor: 0.05 }, { agiUpTo: null, factor: 0 }] },
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 80000, filingStatus: 'single' }, mo);
  // AGI 74348.18 -> 15% tier; fedTax 7526.60*0.15 = 1128.99 (< cap) subtracted
  // base 74348.18 - 16100 - 1128.99 = 57119.19 ; *0.047 = 2684.60
  close(r.stateIncomeTax, 2684.60, 1);
});

// --- slidingStandardDeduction: Wisconsin-style ------------------------------
test('slidingStandardDeduction (Wisconsin): shrinks with income, floors at 0', () => {
  const wi = {
    hasStateIncomeTax: true, stateTaxBasis: 'federal_agi',
    brackets_single: [{ min: 0, max: null, rate: 0.053 }],
    brackets_married: [{ min: 0, max: null, rate: 0.053 }],
    standardDeduction_single: 0, standardDeduction_married: 0,
    slidingStandardDeduction: { single: { base: 12760, phaseoutStart: 19310, rate: 0.12 }, married: { base: 23620, phaseoutStart: 27890, rate: 0.19 } },
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 80000, filingStatus: 'single' }, wi);
  // AGI 74348.18 ; deduction = 12760 - 0.12*(74348.18-19310) = 12760 - 6604.58 = 6155.42
  // base 74348.18 - 6155.42 = 68192.76 ; *0.053 = 3614.22
  close(r.stateIncomeTax, 3614.22, 1);
});

// Wisconsin 2025 sliding standard deduction, MFJ anchor from the official table.
test('slidingStandardDeduction: Wisconsin MFJ at $60k WAGI = $18,823', () => {
  const wi = { slidingStandardDeduction: { single: { base: 13560, phaseoutStart: 19050, rate: 0.12 }, married: { base: 25110, phaseoutStart: 28210, rate: 0.19778 } } };
  assert.equal(Math.round(slidingStandardDeduction(wi, 'married', 60000)), 18823);
});

// --- Ohio Business Income Deduction -----------------------------------------
test('ohioBid: self-employment income under $250k BID owes $0 Ohio tax', () => {
  const oh = {
    hasStateIncomeTax: true,
    brackets_single: [{ min: 0, max: null, rate: 0.0275 }], // present so stateComputable
    brackets_married: [{ min: 0, max: null, rate: 0.0275 }],
    standardDeduction_single: 0, standardDeduction_married: 0,
    ohioBid: { bidThresholdSingle: 250000, bidThresholdMarried: 250000, businessRate: 0.03, nonbusinessExemption: 26050, nonbusinessRate: 0.0275 },
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 90000, filingStatus: 'single' }, oh);
  assert.equal(r.stateIncomeTax, 0); // 90k business income < 250k BID
});

test('ohioBid: business income over $250k taxed at 3%, W-2 at 2.75% over exemption', () => {
  const oh = {
    hasStateIncomeTax: true,
    brackets_single: [{ min: 0, max: null, rate: 0.0275 }],
    brackets_married: [{ min: 0, max: null, rate: 0.0275 }],
    standardDeduction_single: 0, standardDeduction_married: 0,
    ohioBid: { bidThresholdSingle: 250000, bidThresholdMarried: 250000, businessRate: 0.03, nonbusinessExemption: 26050, nonbusinessRate: 0.0275 },
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 300000, w2Income: 50000, filingStatus: 'single' }, oh);
  // business: (300000-250000)*0.03 = 1500 ; nonbusiness: (50000-26050)*0.0275 = 658.625
  close(r.stateIncomeTax, 2158.625, 0.01);
});

// --- Utah Taxpayer Tax Credit -----------------------------------------------
test('utahTaxpayerCredit: flat 4.45% minus phased credit ($80k single)', () => {
  const ut = {
    hasStateIncomeTax: true, stateTaxBasis: 'federal_agi',
    brackets_single: [{ min: 0, max: null, rate: 0.0445 }],
    brackets_married: [{ min: 0, max: null, rate: 0.0445 }],
    standardDeduction_single: 0, standardDeduction_married: 0,
    utahTaxpayerCredit: { creditRate: 0.06, phaseoutRate: 0.013, baseSingle: 18213, baseMarried: 36426, perDependent: 2111 },
  };
  const r = estimateQuarterly({ selfEmploymentIncome: 80000, filingStatus: 'single' }, ut);
  // AGI 74348.18 ; tax 4.45% = 3308.49 ; credit = 0.06*16100 - 0.013*(74348.18-18213)
  //   = 966 - 729.76 = 236.24 ; net = 3072.25
  close(r.stateIncomeTax, 3072.25, 1);
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
