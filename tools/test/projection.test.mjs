import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_CLASSES,
  LIABILITY_CLASSES,
  classifyCategory,
  addMonths,
  projectForward,
  findMilestone,
  inferMonthlyContribution,
  latestByCategory,
  buildPositions,
  pendingClassifications,
} from '../../assets/projection.js';

const close = (actual, expected, tol = 0.5) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);

const last = arr => arr[arr.length - 1];

// --- addMonths -------------------------------------------------------------
test('addMonths: rolls over the year boundary', () => {
  assert.equal(addMonths('2026-07', 1), '2026-08');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', 23), '2027-12');
  assert.equal(addMonths('2026-07', 120), '2036-07');
});

// --- classifyCategory ------------------------------------------------------
test('classifyCategory: maps common free-text names to classes', () => {
  assert.equal(classifyCategory('401k / 403b'), 'retirement');
  assert.equal(classifyCategory('My Roth IRA'), 'retirement');
  assert.equal(classifyCategory('Fidelity Brokerage'), 'equity');
  assert.equal(classifyCategory('Ally HYSA'), 'hysa');
  // Ambiguous by nature: "Cash & Savings" is one of the page's default
  // categories and could be either. It guesses hysa; the confirm step is
  // where a user with a checking-heavy balance corrects it to cash.
  assert.equal(classifyCategory('Cash & Savings'), 'hysa');
  assert.equal(classifyCategory('Home'), 'home');
  assert.equal(classifyCategory('2019 Honda Civic'), 'vehicle');
  assert.equal(classifyCategory('Bitcoin'), 'crypto');
});

test('classifyCategory: retirement wins over the generic savings rule', () => {
  // "Retirement Savings" matches both /retirement/ and /savings/; order matters.
  assert.equal(classifyCategory('Retirement Savings'), 'retirement');
});

test('classifyCategory: unknown names fall back to other, never null', () => {
  assert.equal(classifyCategory('Fjord holdings'), 'other');
  assert.equal(classifyCategory('Fjord holdings', 'liability'), 'other_debt');
  assert.equal(classifyCategory(''), 'other');
  assert.equal(classifyCategory(null), 'other');
});

test('classifyCategory: liability names use the liability table', () => {
  assert.equal(classifyCategory('Mortgage', 'liability'), 'mortgage');
  assert.equal(classifyCategory('Chase Credit Card', 'liability'), 'credit_card');
  assert.equal(classifyCategory('Navient', 'liability'), 'student');
});

// --- growth ----------------------------------------------------------------
test('projectForward: $10k equity at 7% nominal compounds to $10,722.90 in 12mo', () => {
  // 10000 * (1 + 0.07/12)^12
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'asset', assetClass: 'equity', value: 10000 }],
    horizonMonths: 12,
  });
  assert.equal(p.length, 12);
  assert.equal(p[0].month, '2026-08');
  assert.equal(last(p).month, '2027-07');
  close(last(p).netWorth, 10722.90);
});

test('projectForward: vehicles depreciate', () => {
  // 20000 * (1 - 0.15/12)^12
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'asset', assetClass: 'vehicle', value: 20000 }],
    horizonMonths: 12,
  });
  close(last(p).netWorth, 17198.10, 1);
  assert.ok(last(p).netWorth < 20000, 'vehicle should lose value');
});

test('projectForward: cash and crypto sit flat', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [
      { type: 'asset', assetClass: 'cash', value: 5000 },
      { type: 'asset', assetClass: 'crypto', value: 3000 },
    ],
    horizonMonths: 60,
  });
  close(last(p).netWorth, 8000);
});

test('projectForward: per-class rate overrides beat the defaults', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'asset', assetClass: 'equity', value: 10000 }],
    assumptions: { rates: { equity: 0 } },
    horizonMonths: 12,
  });
  close(last(p).netWorth, 10000);
});

// --- contributions ---------------------------------------------------------
test('projectForward: contributions split across investable accounts by weight', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [
      { type: 'asset', assetClass: 'equity', value: 3000 },
      { type: 'asset', assetClass: 'retirement', value: 1000 },
    ],
    assumptions: { monthlyContribution: 400, rates: { equity: 0, retirement: 0 } },
    horizonMonths: 1,
  });
  close(p[0].assets, 4400);
});

test('projectForward: contributions skip non-investable assets', () => {
  // A house and a car should not absorb the monthly investment contribution.
  const p = projectForward({
    startMonth: '2026-07',
    positions: [
      { type: 'asset', assetClass: 'home', value: 400000 },
      { type: 'asset', assetClass: 'equity', value: 1000 },
    ],
    assumptions: { monthlyContribution: 500, rates: { home: 0, equity: 0 } },
    horizonMonths: 10,
  });
  close(p[0].assets, 401500);
  close(last(p).assets, 406000);
});

test('projectForward: contributions land somewhere when nothing is investable yet', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'asset', assetClass: 'cash', value: 2000 }],
    assumptions: { monthlyContribution: 100, rates: { equity: 0 } },
    horizonMonths: 12,
  });
  close(last(p).assets, 3200);
});

test('projectForward: contributions stay flat nominal, no inflation escalation', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'asset', assetClass: 'equity', value: 0 }],
    assumptions: { monthlyContribution: 1000, rates: { equity: 0 } },
    horizonMonths: 24,
  });
  close(last(p).assets, 24000);
});

// --- employer match --------------------------------------------------------
test('projectForward: employer match adds salary * pct per year to retirement', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'asset', assetClass: 'retirement', value: 0 }],
    assumptions: { salary: 100000, employerMatchPct: 0.04, rates: { retirement: 0 } },
    horizonMonths: 12,
  });
  close(last(p).assets, 4000);
});

test('projectForward: match goes to retirement, not taxable brokerage', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [
      { type: 'asset', assetClass: 'retirement', value: 1000 },
      { type: 'asset', assetClass: 'equity', value: 1000 },
    ],
    assumptions: { salary: 120000, employerMatchPct: 0.05, rates: { retirement: 0, equity: 0 } },
    horizonMonths: 12,
  });
  // 120000 * 0.05 = 6000/yr, all of it into the retirement bucket.
  close(last(p).assets, 8000);
});

// --- liabilities -----------------------------------------------------------
test('projectForward: a 0% loan amortizes straight down and floors at zero', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'liability', assetClass: 'personal', value: 10000, apr: 0, payment: 1000 }],
    horizonMonths: 12,
  });
  close(p[4].liabilities, 5000);
  close(p[9].liabilities, 0);
  close(last(p).liabilities, 0, 0.001);
  assert.ok(last(p).liabilities >= 0, 'balance must never go negative');
});

test('projectForward: mortgage interest accrues before the payment lands', () => {
  // 300000 @ 6.5%: month 1 interest = 1625, payment 2000 -> 299625
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'liability', assetClass: 'mortgage', value: 300000, apr: 0.065, payment: 2000 }],
    horizonMonths: 1,
  });
  close(p[0].liabilities, 299625);
});

test('projectForward: a payment below the interest holds flat instead of exploding', () => {
  // 5000 @ 22% accrues 91.67/mo; a 50/mo payment never touches principal.
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'liability', assetClass: 'credit_card', value: 5000, apr: 0.22, payment: 50 }],
    horizonMonths: 240,
  });
  close(last(p).liabilities, 5000);
});

test('projectForward: a debt with no payment on file holds flat', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'liability', assetClass: 'other_debt', value: 8000 }],
    horizonMonths: 36,
  });
  close(last(p).liabilities, 8000);
});

test('projectForward: falls back to the class APR when none is supplied', () => {
  const withApr = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'liability', assetClass: 'mortgage', value: 300000, apr: LIABILITY_CLASSES.mortgage.apr, payment: 2000 }],
    horizonMonths: 6,
  });
  const withoutApr = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'liability', assetClass: 'mortgage', value: 300000, payment: 2000 }],
    horizonMonths: 6,
  });
  close(last(withoutApr).liabilities, last(withApr).liabilities, 0.001);
});

// --- combined --------------------------------------------------------------
test('projectForward: net worth = assets - liabilities each month', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [
      { type: 'asset', assetClass: 'equity', value: 50000 },
      { type: 'asset', assetClass: 'home', value: 400000 },
      { type: 'liability', assetClass: 'mortgage', value: 300000, apr: 0.065, payment: 2000 },
    ],
    assumptions: { monthlyContribution: 1500 },
    horizonMonths: 60,
  });
  for (const s of p) close(s.netWorth, s.assets - s.liabilities, 0.001);
  assert.ok(last(p).netWorth > p[0].netWorth, 'net worth should climb here');
});

test('projectForward: empty portfolio still returns a clean series', () => {
  const p = projectForward({ startMonth: '2026-07', positions: [], horizonMonths: 3 });
  assert.equal(p.length, 3);
  assert.deepEqual(p.map(s => s.netWorth), [0, 0, 0]);
});

// --- milestones ------------------------------------------------------------
test('findMilestone: returns the first crossing month, or null', () => {
  const p = projectForward({
    startMonth: '2026-07',
    positions: [{ type: 'asset', assetClass: 'equity', value: 900000 }],
    horizonMonths: 120,
  });
  const hit = findMilestone(p, 1000000);
  assert.ok(hit, 'should cross $1M inside 10 years');
  assert.equal(findMilestone(p, 99000000), null);
});

// --- contribution inference ------------------------------------------------
test('inferMonthlyContribution: median monthly delta, rounded to $50', () => {
  const snaps = [
    { netWorth: 10000 }, { netWorth: 11000 }, { netWorth: 12100 }, { netWorth: 13000 },
  ];
  assert.equal(inferMonthlyContribution(snaps), 1000);
});

test('inferMonthlyContribution: a falling portfolio guesses 0, not a negative', () => {
  const snaps = [{ netWorth: 20000 }, { netWorth: 18000 }, { netWorth: 16000 }];
  assert.equal(inferMonthlyContribution(snaps), 0);
});

test('inferMonthlyContribution: too little history returns 0', () => {
  assert.equal(inferMonthlyContribution([{ netWorth: 5000 }]), 0);
  assert.equal(inferMonthlyContribution([]), 0);
  assert.equal(inferMonthlyContribution(null), 0);
});

// --- adapters --------------------------------------------------------------
const ENTRIES = [
  { category: 'Roth IRA',  type: 'asset',     date: '2026-01-15', value: 30000 },
  { category: 'Roth IRA',  type: 'asset',     date: '2026-07-01', value: 34000 },
  { category: 'Home',      type: 'asset',     date: '2026-06-10', value: 400000 },
  { category: 'Mortgage',  type: 'liability', date: '2026-06-10', value: 300000 },
];

test('latestByCategory: keeps only the newest entry per category', () => {
  const m = latestByCategory(ENTRIES);
  assert.equal(m.size, 3);
  assert.equal(m.get('asset Roth IRA').value, 34000);
});

// A name is only unique within a type. Live data has a user with a "Silverado"
// asset and a "Silverado" loan; collapsing on the name alone dropped one side.
test('latestByCategory: an asset and a liability may share a name', () => {
  const m = latestByCategory([
    { category: 'Silverado', type: 'asset',     date: '2026-08-02', value: 65000 },
    { category: 'Silverado', type: 'liability', date: '2026-08-02', value: 80000 },
  ]);
  assert.equal(m.size, 2);
  assert.equal(m.get('asset Silverado').value, 65000);
  assert.equal(m.get('liability Silverado').value, 80000);
});

test('buildPositions: uses the stored class over the keyword guess', () => {
  const positions = buildPositions({
    entries: ENTRIES,
    categories: [{ category: 'Home', type: 'asset', asset_class: 'rental', class_confirmed: true }],
  });
  assert.equal(positions.find(p => p.category === 'Home').assetClass, 'rental');
  // Unmapped categories still get a guess so the projection never stalls.
  assert.equal(positions.find(p => p.category === 'Roth IRA').assetClass, 'retirement');
});

test('buildPositions: converts debts.rate from percent to decimal', () => {
  const positions = buildPositions({
    entries: ENTRIES,
    debts: [{ net_worth_category: 'Mortgage', rate: 6.5, min_payment: 1800, extra_payment: 200 }],
  });
  const mortgage = positions.find(p => p.category === 'Mortgage');
  close(mortgage.apr, 0.065, 0.0001);
  close(mortgage.payment, 2000);
});

test('buildPositions: an unlinked liability gets no payment and holds flat', () => {
  const positions = buildPositions({ entries: ENTRIES, debts: [] });
  const mortgage = positions.find(p => p.category === 'Mortgage');
  assert.equal(mortgage.payment, undefined);
  const p = projectForward({ startMonth: '2026-07', positions: [mortgage], horizonMonths: 12 });
  close(last(p).liabilities, 300000);
});

test('buildPositions: end to end from raw rows', () => {
  const positions = buildPositions({
    entries: ENTRIES,
    categories: [
      { category: 'Roth IRA', type: 'asset', asset_class: 'retirement', class_confirmed: true },
      { category: 'Home', type: 'asset', asset_class: 'home', class_confirmed: true },
      { category: 'Mortgage', type: 'liability', asset_class: 'mortgage', class_confirmed: true },
    ],
    debts: [{ net_worth_category: 'Mortgage', rate: 6.5, min_payment: 2000, extra_payment: 0 }],
  });
  const p = projectForward({
    startMonth: '2026-07',
    positions,
    assumptions: { monthlyContribution: 1000 },
    horizonMonths: 12,
  });
  assert.equal(p.length, 12);
  assert.ok(last(p).netWorth > 134000, 'should grow from the 134k starting point');
  assert.ok(last(p).liabilities < 300000, 'mortgage should be paying down');
});

test('pendingClassifications: only unconfirmed categories, biggest first', () => {
  const pending = pendingClassifications(ENTRIES, [
    { category: 'Roth IRA', type: 'asset', asset_class: 'retirement', class_confirmed: true },
  ]);
  assert.deepEqual(pending.map(p => p.category), ['Home', 'Mortgage']);
  assert.equal(pending[0].guess, 'home');
  assert.equal(pending[1].guess, 'mortgage');
});

test('pendingClassifications: everything is pending on first run', () => {
  assert.equal(pendingClassifications(ENTRIES, []).length, 3);
  assert.equal(pendingClassifications([], []).length, 0);
});

// --- table sanity ----------------------------------------------------------
test('every asset class has a label and a numeric nominal rate', () => {
  for (const [key, spec] of Object.entries(ASSET_CLASSES)) {
    assert.ok(spec.label, `${key} needs a label`);
    assert.equal(typeof spec.rate, 'number', `${key} needs a numeric rate`);
  }
  assert.ok(ASSET_CLASSES.other, 'an "other" class is required for the dropdown');
});
