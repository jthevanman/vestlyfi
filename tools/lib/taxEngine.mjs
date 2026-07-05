/**
 * VestlyFi shared tax engine (tax year 2026).
 *
 * SINGLE SOURCE OF TRUTH. This file is:
 *   1. imported directly by the Node test runner (tools/test/*.test.mjs)
 *   2. read as text and inlined into every generated page (the `export`
 *      keywords are stripped at generate time so the same code runs in the
 *      browser inside an IIFE). Do not add imports to this file.
 *
 * Scope (Phase 1): federal self-employment tax + federal income tax + a
 * state income-tax layer driven by JSON brackets. QBI is intentionally
 * omitted in v1 (noted in the per-state FAQ).
 *
 * All figures below are the official IRS tax-year-2026 inflation-adjusted
 * amounts. Sources are cited in NEEDS_VERIFICATION.md / the data files.
 */

export const FEDERAL_2026 = {
  taxYear: 2026,
  seMultiplier: 0.9235,          // 92.35% of net SE income is subject to SE tax
  ssRate: 0.124,                 // Social Security portion (self-employed pays both halves)
  ssWageBase: 184500,            // 2026 Social Security wage base cap
  medicareRate: 0.029,           // Medicare portion (no cap)
  addlMedicareRate: 0.009,       // Additional Medicare tax
  addlMedicareThreshold: { single: 200000, married: 250000 },
  standardDeduction: { single: 16100, married: 32200 },
  brackets: {
    single: [
      { min: 0, max: 12400, rate: 0.10 },
      { min: 12400, max: 50400, rate: 0.12 },
      { min: 50400, max: 105700, rate: 0.22 },
      { min: 105700, max: 201775, rate: 0.24 },
      { min: 201775, max: 256225, rate: 0.32 },
      { min: 256225, max: 640600, rate: 0.35 },
      { min: 640600, max: null, rate: 0.37 },
    ],
    married: [
      { min: 0, max: 24800, rate: 0.10 },
      { min: 24800, max: 100800, rate: 0.12 },
      { min: 100800, max: 211400, rate: 0.22 },
      { min: 211400, max: 403550, rate: 0.24 },
      { min: 403550, max: 512450, rate: 0.32 },
      { min: 512450, max: 768700, rate: 0.35 },
      { min: 768700, max: null, rate: 0.37 },
    ],
  },
};

/** Federal estimated-tax due dates for tax year 2026. */
export const DUE_DATES_2026 = [
  { label: 'Q1', date: 'April 15, 2026' },
  { label: 'Q2', date: 'June 15, 2026' },
  { label: 'Q3', date: 'September 15, 2026' },
  { label: 'Q4', date: 'January 15, 2027' },
];

/** Equal-quarter weights (federal default). */
export const EQUAL_WEIGHTS = [0.25, 0.25, 0.25, 0.25];

/**
 * Apply a marginal bracket table to an income amount.
 * @param {number} income - taxable income (already after deductions)
 * @param {{min:number,max:number|null,rate:number}[]} brackets
 * @returns {number} tax owed
 */
export function applyBrackets(income, brackets) {
  if (!income || income <= 0 || !Array.isArray(brackets) || brackets.length === 0) return 0;
  let tax = 0;
  for (const b of brackets) {
    if (income <= b.min) break;
    const upper = b.max == null ? income : Math.min(income, b.max);
    tax += (upper - b.min) * b.rate;
  }
  return tax;
}

/**
 * Self-employment tax (Social Security + Medicare), self-employed pays both halves.
 * W-2 wages consume the Social Security wage base first.
 * @param {number} netSEIncome - net self-employment profit
 * @param {'single'|'married'} filingStatus
 * @param {number} [wages=0] - W-2 wages already subject to Social Security
 * @returns {{seTax:number, taxableSE:number, ssPortion:number, medicarePortion:number, halfDeduction:number}}
 */
export function computeSelfEmploymentTax(netSEIncome, filingStatus = 'single', wages = 0) {
  const F = FEDERAL_2026;
  const taxableSE = Math.max(0, (netSEIncome || 0) * F.seMultiplier);
  if (taxableSE <= 0) {
    return { seTax: 0, taxableSE: 0, ssPortion: 0, medicarePortion: 0, halfDeduction: 0 };
  }
  // Social Security applies only up to the wage base, and W-2 wages fill it first.
  const ssRoom = Math.max(0, F.ssWageBase - Math.max(0, wages || 0));
  const ssBase = Math.min(taxableSE, ssRoom);
  const ssPortion = ssBase * F.ssRate;
  const medicarePortion = taxableSE * F.medicareRate;
  const seTax = ssPortion + medicarePortion;
  return {
    seTax,
    taxableSE,
    ssPortion,
    medicarePortion,
    halfDeduction: seTax / 2, // employer-equivalent half is deductible from AGI
  };
}

/**
 * Full quarterly estimated-tax estimate.
 *
 * @param {Object} input
 * @param {number} input.selfEmploymentIncome - expected net 1099 / SE profit
 * @param {number} [input.w2Income=0] - W-2 wages (for safe harbor context)
 * @param {'single'|'married'} [input.filingStatus='single']
 * @param {number} [input.priorYearTax=0] - prior-year total tax (for safe harbor)
 * @param {Object} stateData - loaded state JSON (may have null brackets)
 * @returns {Object} full result
 */
export function estimateQuarterly(input, stateData) {
  const F = FEDERAL_2026;
  const status = input.filingStatus === 'married' ? 'married' : 'single';
  const seIncome = Math.max(0, num(input.selfEmploymentIncome));
  const w2 = Math.max(0, num(input.w2Income));
  const priorYearTax = Math.max(0, num(input.priorYearTax));

  // 1. Federal self-employment tax
  const se = computeSelfEmploymentTax(seIncome, status, w2);

  // 2. Federal income tax
  const federalAGI = seIncome + w2 - se.halfDeduction;
  const federalTaxable = Math.max(0, federalAGI - F.standardDeduction[status]);
  const federalIncomeTax = applyBrackets(federalTaxable, F.brackets[status]);

  // 3. State income tax (only if the state taxes income and has verified brackets)
  const hasState = !!stateData.hasStateIncomeTax;
  const stateBrackets = status === 'married'
    ? stateData.brackets_married
    : stateData.brackets_single;
  const stateStdDeduction = status === 'married'
    ? num(stateData.standardDeduction_married)
    : num(stateData.standardDeduction_single);
  const stateComputable = hasState && Array.isArray(stateBrackets) && stateBrackets.length > 0;
  // State AGI approximation: SE + W-2 (states generally do not allow the federal
  // 1/2 SE-tax deduction; v1 uses gross to stay conservative, noted in FAQ).
  const stateTaxable = stateComputable
    ? Math.max(0, seIncome + w2 - stateStdDeduction)
    : 0;
  const stateIncomeTax = stateComputable ? applyBrackets(stateTaxable, stateBrackets) : 0;

  // 4. Totals
  const federalTotal = se.seTax + federalIncomeTax;
  const totalAnnual = federalTotal + stateIncomeTax;

  // 5. Safe harbor (federal): lesser of 90% current-year or 100%/110% prior-year
  const priorMultiplier = federalAGI > 150000 ? 1.10 : 1.00;
  const safeHarbor90 = federalTotal * 0.90;
  const safeHarborPrior = priorYearTax > 0 ? priorYearTax * priorMultiplier : null;
  const safeHarborTarget = safeHarborPrior != null
    ? Math.min(safeHarbor90, safeHarborPrior)
    : safeHarbor90;

  // 6. Quarterly splits. Federal is equal quarters; state may be weighted.
  const stateWeights = Array.isArray(stateData.quarterlyWeights) && stateData.quarterlyWeights.length === 4
    ? stateData.quarterlyWeights
    : EQUAL_WEIGHTS;
  const quarters = DUE_DATES_2026.map((d, i) => {
    const fed = federalTotal * EQUAL_WEIGHTS[i];
    const st = stateIncomeTax * stateWeights[i];
    return { label: d.label, date: d.date, federal: fed, state: st, total: fed + st };
  });

  return {
    filingStatus: status,
    inputs: { seIncome, w2, priorYearTax },
    se,
    federalIncomeTax,
    federalAGI,
    federalTaxable,
    federalTotal,
    stateComputable,
    stateIncomeTax,
    stateTaxable,
    totalAnnual,
    effectiveRate: (seIncome + w2) > 0 ? totalAnnual / (seIncome + w2) : 0,
    safeHarbor: {
      current90: safeHarbor90,
      prior: safeHarborPrior,
      priorMultiplier,
      target: safeHarborTarget,
      perQuarter: safeHarborTarget / 4,
    },
    quarters,
    quarterlyWeights: stateWeights,
  };
}

function num(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
