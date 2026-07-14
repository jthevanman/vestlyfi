/**
 * Shared scenario definitions + output extraction for the regression snapshot.
 * Used by both the snapshot generator and the regression test so they can never
 * drift apart.
 */
import { estimateQuarterly } from './taxEngine.mjs';

/** Fixed representative scenarios. Do not reorder/remove; snapshot keys depend on order. */
export const SCENARIOS = [
  { selfEmploymentIncome: 80000, filingStatus: 'single' },
  { selfEmploymentIncome: 150000, filingStatus: 'married' },
  { selfEmploymentIncome: 40000, w2Income: 20000, filingStatus: 'single' },
  { selfEmploymentIncome: 250000, filingStatus: 'single', priorYearTax: 40000 },
];

const cents = (n) => Math.round(n * 100) / 100;

/** Extract the locked output fields for one state across all scenarios. */
export function snapshotState(state) {
  return SCENARIOS.map((input) => {
    const r = estimateQuarterly(input, state);
    return {
      stateIncomeTax: cents(r.stateIncomeTax),
      federalIncomeTax: cents(r.federalIncomeTax),
      seTax: cents(r.se.seTax),
      totalAnnual: cents(r.totalAnnual),
      safeHarborTarget: cents(r.safeHarbor.target),
    };
  });
}
