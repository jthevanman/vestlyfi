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
  // The starting point for a state's tax base varies. `stateTaxBasis` selects it:
  //   'federal_taxable_income' - conforms to federal taxable income (e.g. CO, ID)
  //   'federal_agi'            - starts from federal AGI, then a state exemption/deduction (e.g. MI, IL, NC, AZ)
  //   'state_gross' (default)  - taxes gross earned income directly, minus any state deduction (e.g. PA)
  const basis = stateData.stateTaxBasis || 'state_gross';
  let stateBaseIncome;
  if (basis === 'federal_taxable_income') stateBaseIncome = federalTaxable;
  else if (basis === 'federal_agi') stateBaseIncome = federalAGI;
  else stateBaseIncome = seIncome + w2;

  // Optional state-specific adjustments (all no-ops unless the state opts in, so
  // states without these fields produce byte-identical output to the base model):
  //  - federalTaxDeduction: OR/MO subtract some federal income tax from the base.
  //  - slidingStandardDeduction: WI's standard deduction shrinks as income rises.
  //  - ohioBid: Ohio's Business Income Deduction taxes 1099 income differently.
  const fedTaxDed = federalTaxDeductionAmount(stateData, status, federalAGI, federalIncomeTax);
  const slidingDed = slidingStandardDeduction(stateData, status, federalAGI);
  const effectiveStdDeduction = slidingDed != null ? slidingDed : stateStdDeduction;

  let stateTaxable, stateIncomeTax;
  if (stateComputable && stateData.ohioBid) {
    ({ stateTaxable, stateIncomeTax } = ohioBusinessIncomeTax(stateData, seIncome, w2, status));
  } else {
    stateTaxable = stateComputable
      ? Math.max(0, stateBaseIncome - effectiveStdDeduction - fedTaxDed)
      : 0;
    stateIncomeTax = stateComputable ? applyBrackets(stateTaxable, stateBrackets) : 0;
  }

  // Optional state tax credit that reduces computed tax and phases out with
  // income (e.g. Utah's Taxpayer Tax Credit). No-op unless the state defines it.
  if (stateComputable && stateData.utahTaxpayerCredit) {
    stateIncomeTax = Math.max(0, stateIncomeTax - utahTaxpayerCreditAmount(stateData, status, stateBaseIncome));
  }

  // Optional flat personal-exemption credit subtracted from tax (e.g. Nebraska's
  // $171/exemption credit). Config: personalTaxCredit = { single, married }.
  if (stateComputable && stateData.personalTaxCredit) {
    const pc = stateData.personalTaxCredit;
    stateIncomeTax = Math.max(0, stateIncomeTax - num(status === 'married' ? pc.married : pc.single));
  }

  // Optional alternative-minimum floor: some states set the tax to at least a
  // flat percentage of AGI once AGI exceeds a threshold (e.g. Vermont: for AGI
  // over $150,000, tax is the greater of the schedule tax or 3% of AGI). We use
  // full federal AGI as the base; Vermont subtracts U.S.-obligation interest
  // first, which we don't model, so the floor errs slightly high (conservative).
  // Config: minTaxFloor = { agiThreshold, rate }.
  if (stateComputable && stateData.minTaxFloor && federalAGI > num(stateData.minTaxFloor.agiThreshold)) {
    stateIncomeTax = Math.max(stateIncomeTax, num(stateData.minTaxFloor.rate) * federalAGI);
  }

  // Optional local/county flat surtax on the SAME taxable base as the state tax
  // (e.g. Maryland's county income tax, which every county levies). The rate is
  // editable per user via input.localRate (a fraction); it falls back to the
  // state's default when unset. Folded into stateIncomeTax so it flows through
  // the totals and quarterly splits; MD estimates must cover state + local.
  // Config: localFlatRate = { default }.
  if (stateComputable && stateData.localFlatRate) {
    const localRate = input.localRate != null
      ? Math.max(0, num(input.localRate))
      : num(stateData.localFlatRate.default);
    stateIncomeTax += localRate * stateTaxable;
  }

  // Optional flat contribution levied on NET self-employment income (not taxable
  // income) and remitted with the state return, e.g. Vermont's 0.11% Child Care
  // Contribution (Act 76), which self-employed filers owe on top of income tax.
  // Config: seContribution = { rate }.
  if (stateComputable && stateData.seContribution) {
    stateIncomeTax += num(stateData.seContribution.rate) * seIncome;
  }

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

/**
 * Amount of federal income tax a state lets you subtract from its tax base.
 * Returns 0 unless the state defines `federalTaxDeduction`.
 *
 * Config: { mode, capSingle, capMarried, tiers:[{agiUpTo, factor}] }
 *   mode 'cap-phaseout'      (Oregon): deduction = min(fedIncomeTax, cap * factor)
 *   mode 'percent-of-federal'(Missouri): deduction = min(fedIncomeTax * factor, cap)
 *   tiers: first entry whose agiUpTo (null = infinity) is >= AGI supplies `factor`.
 */
export function federalTaxDeductionAmount(stateData, status, federalAGI, federalIncomeTax) {
  const c = stateData.federalTaxDeduction;
  if (!c) return 0;
  const cap = num(status === 'married' ? c.capMarried : c.capSingle);
  const factor = tierFactor(c.tiers, federalAGI);
  if (c.mode === 'percent-of-federal') return Math.min(federalIncomeTax * factor, cap);
  return Math.min(federalIncomeTax, cap * factor); // cap-phaseout (default)
}

function tierFactor(tiers, agi) {
  if (!Array.isArray(tiers) || tiers.length === 0) return 1;
  for (const t of tiers) {
    if (t.agiUpTo == null || agi <= t.agiUpTo) return t.factor;
  }
  return 0;
}

/**
 * A standard deduction that shrinks as income rises (e.g. Wisconsin).
 * Returns null unless the state defines `slidingStandardDeduction`.
 * Config: { single:{base, phaseoutStart, rate}, married:{...} }
 *   deduction = clamp(base - rate * max(0, AGI - phaseoutStart), 0, base)
 */
export function slidingStandardDeduction(stateData, status, federalAGI) {
  const c = stateData.slidingStandardDeduction;
  if (!c) return null;
  const p = status === 'married' ? c.married : c.single;
  if (!p) return null;
  const over = Math.max(0, federalAGI - num(p.phaseoutStart));
  const reduced = num(p.base) - num(p.rate) * over;
  return Math.max(num(p.floor), reduced); // floor defaults to 0 when unset (e.g. WI)
}

/**
 * Utah Taxpayer Tax Credit (TC-40). Initial credit = creditRate × (federal
 * standard deduction + perDependent × dependents), reduced by phaseoutRate ×
 * (income over the filing-status base), floored at 0.
 * Config: stateData.utahTaxpayerCredit = { creditRate, phaseoutRate, baseSingle, baseMarried, perDependent }
 */
export function utahTaxpayerCreditAmount(stateData, status, stateBaseIncome, dependents = 0) {
  const c = stateData.utahTaxpayerCredit;
  if (!c) return 0;
  const fedDed = FEDERAL_2026.standardDeduction[status];
  const base = num(status === 'married' ? c.baseMarried : c.baseSingle);
  const initial = num(c.creditRate) * (fedDed + num(c.perDependent) * dependents);
  const phaseout = num(c.phaseoutRate) * Math.max(0, stateBaseIncome - base);
  return Math.max(0, initial - phaseout);
}

/**
 * Ohio Business Income Deduction model. Self-employment (business) income gets
 * the first `bidThreshold` deducted, with the remainder taxed at `businessRate`.
 * W-2 (nonbusiness) income is taxed at `nonbusinessRate` above `nonbusinessExemption`.
 * Config: stateData.ohioBid = { bidThresholdSingle, bidThresholdMarried, businessRate, nonbusinessExemption, nonbusinessRate }
 */
export function ohioBusinessIncomeTax(stateData, seIncome, w2, status = 'single') {
  const p = stateData.ohioBid;
  const bid = num(status === 'married' ? p.bidThresholdMarried : p.bidThresholdSingle);
  const taxableBusiness = Math.max(0, seIncome - bid);
  const taxableNonbusiness = Math.max(0, w2 - num(p.nonbusinessExemption));
  const stateIncomeTax = taxableBusiness * num(p.businessRate) + taxableNonbusiness * num(p.nonbusinessRate);
  return { stateTaxable: taxableBusiness + taxableNonbusiness, stateIncomeTax };
}
