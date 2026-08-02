/**
 * VestlyFi net worth projection engine.
 *
 * SINGLE SOURCE OF TRUTH for forward-looking net worth math. This file is:
 *   1. imported directly by the Node test runner (tools/test/projection.test.mjs)
 *   2. loaded by /net-worth/ via <script type="module">, which hangs the
 *      exports on window.VestlyProject for the page's classic script to use
 *
 * Pure functions only. No DOM, no Supabase, no imports.
 *
 * CONVENTION: everything here is NOMINAL. Rates are nominal returns and the
 * monthly contribution is a flat nominal dollar amount that does not escalate.
 * Projected balances are therefore future dollars, not today's dollars. Do not
 * mix a real rate into this table without converting the whole model.
 */

/** Nominal annual growth rates by asset class. */
export const ASSET_CLASSES = {
  cash:        { label: 'Cash & checking',          rate:  0.00 },
  hysa:        { label: 'HYSA / money market',      rate:  0.04 },
  bonds:       { label: 'CDs, bonds & treasuries',  rate:  0.04 },
  equity:      { label: 'Stocks & index funds',     rate:  0.07, investable: true },
  retirement:  { label: 'Retirement (401k / IRA)',  rate:  0.07, investable: true, matchEligible: true },
  targetdate:  { label: 'Target-date / balanced',   rate:  0.06, investable: true },
  education:   { label: '529 / education',          rate:  0.06 },
  // HSA sitting in cash earns nothing. Users who invest theirs should pick
  // the equity class instead, which is why this is not investable by default.
  hsa:         { label: 'HSA',                      rate:  0.00 },
  home:        { label: 'Primary home',             rate:  0.04 },
  rental:      { label: 'Rental property',          rate:  0.04 },
  vehicle:     { label: 'Vehicle',                  rate: -0.15 },
  crypto:      { label: 'Crypto',                   rate:  0.00 },
  business:    { label: 'Business equity',          rate:  0.00 },
  collectible: { label: 'Collectibles & metals',    rate:  0.00 },
  other:       { label: 'Other',                    rate:  0.00 },
};

/**
 * Liability classes. `apr` is only a fallback for when the debt tracker has no
 * real APR on file. `amortizes: false` means we hold the balance flat rather
 * than inventing a payoff date we cannot defend.
 */
export const LIABILITY_CLASSES = {
  mortgage:    { label: 'Mortgage',        apr: 0.065, amortizes: true },
  heloc:       { label: 'HELOC',           apr: 0.085, amortizes: true },
  auto:        { label: 'Auto loan',       apr: 0.075, amortizes: true },
  student:     { label: 'Student loan',    apr: 0.055, amortizes: true },
  personal:    { label: 'Personal loan',   apr: 0.120, amortizes: true },
  credit_card: { label: 'Credit card',     apr: 0.220, amortizes: true, revolving: true },
  other_debt:  { label: 'Other debt',      apr: 0.000, amortizes: false },
};

/** Ordered keyword rules for guessing a class from a free-text category name. */
const ASSET_RULES = [
  [/\b(401|403|457|tsp|ira|roth|pension|retirement)\b/i, 'retirement'],
  [/target.?date|lifecycle|balanced fund/i,              'targetdate'],
  [/\b529\b|college|education savings/i,                 'education'],
  [/\bhsa\b|health savings/i,                            'hsa'],
  [/brokerage|stock|equit|index fund|etf|mutual fund|vanguard|fidelity|schwab/i, 'equity'],
  [/hysa|high.?yield|money market|\bmmf\b|savings/i,     'hysa'],
  [/\bcd\b|certificate of deposit|bond|treasur|\bt.?bill/i, 'bonds'],
  [/checking|\bcash\b|wallet|venmo/i,                    'cash'],
  [/rental|investment propert|duplex|airbnb/i,           'rental'],
  [/home|house|condo|primary residence|real estate|propert/i, 'home'],
  [/\bcar\b|truck|vehicle|auto\b|motorcycle|\brv\b|boat/i, 'vehicle'],
  [/crypto|bitcoin|\bbtc\b|ethereum|\beth\b|coinbase/i,  'crypto'],
  [/business|\bllc\b|equity stake|private stock|startup/i, 'business'],
  [/collectib|jewelry|art\b|gold|silver|metal|watch/i,   'collectible'],
];

const LIABILITY_RULES = [
  [/heloc|home equity line/i,                    'heloc'],
  [/mortgage|home loan/i,                        'mortgage'],
  [/auto|car loan|vehicle loan|truck/i,          'auto'],
  [/student|sallie|navient|nelnet/i,             'student'],
  [/credit card|\bvisa\b|mastercard|amex|discover/i, 'credit_card'],
  [/personal loan|\bloan\b/i,                    'personal'],
];

/**
 * Guess an asset/liability class from a user-typed category name.
 * Returns 'other' / 'other_debt' when nothing matches, never null, so the
 * caller always has something to show in a confirmation step.
 */
export function classifyCategory(name, type = 'asset') {
  const rules = type === 'liability' ? LIABILITY_RULES : ASSET_RULES;
  const str = String(name || '');
  for (const [pattern, key] of rules) {
    if (pattern.test(str)) return key;
  }
  return type === 'liability' ? 'other_debt' : 'other';
}

/** '2026-07' + 1 -> '2026-08'. Handles year rollover. */
export function addMonths(month, n) {
  const [y, m] = String(month).split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Split a monthly dollar amount across positions in proportion to their
 * current balances. Falls back to an even split when every target is at zero,
 * so a brand new investor's first contributions still land somewhere.
 */
function allocate(amount, targets) {
  const out = new Map();
  if (amount <= 0 || !targets.length) return out;
  const total = targets.reduce((s, p) => s + p.value, 0);
  for (const p of targets) {
    out.set(p, total > 0 ? amount * (p.value / total) : amount / targets.length);
  }
  return out;
}

/**
 * Step one liability forward a month.
 *
 * Interest accrues first, then the payment lands. A payment that does not
 * cover the interest holds the balance flat instead of growing it: a runaway
 * credit card is a real thing, but projecting one to infinity tells the user
 * nothing useful and wrecks the chart's y-axis.
 */
function stepLiability(balance, apr, payment, amortizes) {
  if (!amortizes || !(payment > 0)) return balance;
  const interest = balance * (apr / 12);
  if (payment <= interest) return balance;
  return Math.max(0, balance + interest - payment);
}

/**
 * Project balances forward month by month.
 *
 * @param {object}   opts
 * @param {string}   opts.startMonth     'YYYY-MM' of the last actual snapshot
 * @param {Array}    opts.positions      [{category, type, assetClass, value, apr?, payment?}]
 * @param {object}   [opts.assumptions]  {monthlyContribution, salary, employerMatchPct, rates}
 * @param {number}   [opts.horizonMonths=120]
 * @returns {Array}  [{month, assets, liabilities, netWorth, projected: true}]
 *                   starting the month AFTER startMonth
 */
export function projectForward({ startMonth, positions = [], assumptions = {}, horizonMonths = 120 }) {
  const {
    monthlyContribution = 0,
    salary = 0,
    employerMatchPct = 0,
    rates = {},
  } = assumptions;

  // Work on copies so callers can re-run with different assumptions.
  const assets = [], liabilities = [];
  for (const p of positions) {
    const value = Number(p.value) || 0;
    if (p.type === 'liability') {
      const spec = LIABILITY_CLASSES[p.assetClass] || LIABILITY_CLASSES.other_debt;
      liabilities.push({
        value,
        apr: p.apr != null ? Number(p.apr) : spec.apr,
        payment: Number(p.payment) || 0,
        amortizes: spec.amortizes,
      });
    } else {
      const spec = ASSET_CLASSES[p.assetClass] || ASSET_CLASSES.other;
      const rate = rates[p.assetClass] != null ? rates[p.assetClass] : spec.rate;
      assets.push({ value, rate, investable: !!spec.investable, matchEligible: !!spec.matchEligible });
    }
  }

  // Contributions go to investable accounts. If the user has none yet, stand
  // one up so the money they told us about does not silently vanish.
  let investable = assets.filter(a => a.investable);
  if (monthlyContribution > 0 && !investable.length) {
    const synthetic = { value: 0, rate: ASSET_CLASSES.equity.rate, investable: true, matchEligible: true };
    assets.push(synthetic);
    investable = [synthetic];
  }
  const matchTargets = assets.filter(a => a.matchEligible);
  const monthlyMatch = (Number(salary) || 0) * (Number(employerMatchPct) || 0) / 12;

  const out = [];
  for (let i = 1; i <= horizonMonths; i++) {
    // Growth first, then this month's deposits, so a contribution does not
    // earn a full month of return on the day it lands.
    for (const a of assets) a.value *= 1 + a.rate / 12;

    const contribSplit = allocate(monthlyContribution, investable);
    for (const [pos, amt] of contribSplit) pos.value += amt;

    const matchSplit = allocate(monthlyMatch, matchTargets.length ? matchTargets : investable);
    for (const [pos, amt] of matchSplit) pos.value += amt;

    for (const l of liabilities) l.value = stepLiability(l.value, l.apr, l.payment, l.amortizes);

    const totalA = assets.reduce((s, a) => s + Math.max(0, a.value), 0);
    const totalL = liabilities.reduce((s, l) => s + l.value, 0);
    out.push({ month: addMonths(startMonth, i), assets: totalA, liabilities: totalL, netWorth: totalA - totalL, projected: true });
  }
  return out;
}

/**
 * First month the projection crosses a target net worth, or null if it never
 * does inside the horizon. Drives the "on track for $1M by ..." stat.
 */
export function findMilestone(projected, target) {
  for (const s of projected) {
    if (s.netWorth >= target) return s.month;
  }
  return null;
}

/**
 * Collapse the raw entry log to the latest observation per category.
 * Mirrors the carry-forward rule in buildMonthlySnapshots(): a category holds
 * its last logged value until a newer entry replaces it.
 *
 * Keyed on type+category. A name is only unique within a type: a user can own a
 * "Silverado" and owe a "Silverado" loan, and collapsing on the name alone drops
 * one of the two. Callers that need the bare name read it off the entry.
 */
export function latestByCategory(entries = []) {
  const out = new Map();
  for (const e of entries) {
    const key = `${e.type} ${e.category}`;
    const prev = out.get(key);
    if (!prev || String(e.date) > String(prev.date)) out.set(key, e);
  }
  return out;
}

/**
 * Turn the tracker's raw tables into the positions array projectForward wants.
 *
 * @param {Array} entries     net_worth_entries rows
 * @param {Array} categories  net_worth_categories rows (may be empty on first run)
 * @param {Array} debts       debts rows, for real APR and payment on linked liabilities
 *
 * NOTE ON UNITS: debts.rate is stored as a PERCENT (6.5), while this engine
 * works in decimals (0.065). The conversion happens here so the engine never
 * has to guess which convention it was handed.
 */
export function buildPositions({ entries = [], categories = [], debts = [] }) {
  const classByCategory = new Map(categories.map(c => [`${c.type} ${c.category}`, c.asset_class]));
  const debtByCategory = new Map();
  for (const d of debts) {
    if (d.net_worth_category) debtByCategory.set(d.net_worth_category, d);
  }

  const positions = [];
  for (const entry of latestByCategory(entries).values()) {
    const category = entry.category;
    const type = entry.type === 'liability' ? 'liability' : 'asset';
    const assetClass = classByCategory.get(`${type} ${category}`) || classifyCategory(category, type);
    const pos = { category, type, assetClass, value: Number(entry.value) || 0 };

    if (type === 'liability') {
      const debt = debtByCategory.get(category);
      if (debt) {
        pos.apr = (Number(debt.rate) || 0) / 100;
        pos.payment = (Number(debt.min_payment) || 0) + (Number(debt.extra_payment) || 0);
      }
    }
    positions.push(pos);
  }
  return positions;
}

/**
 * Categories that have no confirmed class yet, with a guess attached. This is
 * what the confirm step renders. Guesses are never written to the database
 * until the user accepts them.
 */
export function pendingClassifications(entries = [], categories = []) {
  const confirmed = new Set(categories.filter(c => c.class_confirmed).map(c => `${c.type} ${c.category}`));
  const out = [];
  for (const entry of latestByCategory(entries).values()) {
    const category = entry.category;
    const type = entry.type === 'liability' ? 'liability' : 'asset';
    if (confirmed.has(`${type} ${category}`)) continue;
    const existing = categories.find(c => c.category === category && c.type === type);
    out.push({
      category,
      type,
      value: Number(entry.value) || 0,
      guess: existing ? existing.asset_class : classifyCategory(category, type),
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

/**
 * Median month-over-month net worth change, used to PREFILL the contribution
 * field. This is a guess shown to the user for editing, never a value to
 * persist on their behalf.
 */
export function inferMonthlyContribution(snapshots, lookback = 12) {
  if (!snapshots || snapshots.length < 2) return 0;
  const recent = snapshots.slice(-(lookback + 1));
  const deltas = [];
  for (let i = 1; i < recent.length; i++) deltas.push(recent[i].netWorth - recent[i - 1].netWorth);
  if (!deltas.length) return 0;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  return Math.max(0, Math.round(median / 50) * 50);
}
