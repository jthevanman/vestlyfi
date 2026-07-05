/**
 * Per-state copy generation. Produces intro, "how it works" body, and FAQ.
 * Copy branches on no-tax vs income-tax so no two pages read identically, and
 * always includes at least two state-unique FAQ items (from uniqueFacts).
 */

const SITE = 'https://vestlyfi.com';

/** @param {import('./stateSchema.mjs').StateData} s */
export function buildCopy(s) {
  const isNoTax = !s.hasStateIncomeTax;
  return {
    h1: `${s.name} Quarterly Estimated Tax Calculator (${s.taxYear})`,
    tag: 'Side-Income Tools',
    intro: isNoTax ? noTaxIntro(s) : incomeTaxIntro(s),
    howTitle: `How quarterly taxes work in ${s.name}`,
    howBody: isNoTax ? noTaxHow(s) : incomeTaxHow(s),
    faqs: buildFaqs(s),
    related: relatedTools(),
  };
}

function incomeTaxIntro(s) {
  const hook = s.uniqueFacts[0];
  return `If you earn 1099 or self-employment income in ${s.name}, the IRS and the state both expect you to pay taxes as you go — in four quarterly installments rather than one April bill. This calculator estimates your ${s.taxYear} quarterly payments across all three pieces: federal self-employment tax, federal income tax, and ${s.name} state income tax. ${hook} Enter your expected net self-employment income, any W-2 wages, and your filing status to see what to send each quarter, your due dates, and how the safe-harbor rules protect you from an underpayment penalty. Everything is an estimate for planning — always confirm with the ${s.stateTaxAgencyName || 'state tax agency'} before you file.`;
}

function noTaxIntro(s) {
  const hook = s.uniqueFacts[0];
  return `Good news for freelancers and gig workers in ${s.name}: ${hook.charAt(0).toLowerCase() + hook.slice(1)} That means your quarterly estimated taxes are federal only — self-employment tax plus federal income tax — with no separate state estimate to file. This calculator estimates your ${s.taxYear} federal quarterly payments so you know exactly what to send the IRS on each due date. Enter your expected net self-employment income, any W-2 wages, and your filing status to see your quarterly amounts, due dates, and how the safe-harbor rules keep you penalty-free. It is an estimate for planning purposes, not tax advice.`;
}

function incomeTaxHow(s) {
  const agency = s.stateTaxAgencyName || `the ${s.name} state tax agency`;
  const threshold = s.stateQuarterlyThreshold != null
    ? `${s.name} generally requires estimated payments once you expect to owe more than $${s.stateQuarterlyThreshold.toLocaleString()} in state tax for the year.`
    : `${s.name} sets its own threshold for when estimated payments become mandatory — check with ${agency} for the current figure.`;
  const weighted = Array.isArray(s.quarterlyWeights)
    ? `Unlike the federal system's equal quarters, ${s.name} weights its installments (${s.quarterlyWeights.map((w) => Math.round(w * 100) + '%').join(' / ')}), so the amount due changes from quarter to quarter.`
    : `${s.name} follows the standard four-installment schedule.`;
  return [
    `Self-employment income has no tax withheld for you, so both the IRS and ${agency} ask you to prepay in quarterly installments. On the federal side you owe self-employment tax (15.3% Social Security and Medicare on 92.35% of your net profit, up to the Social Security wage base) plus federal income tax on your profit after the standard deduction. On top of that, ${s.name} applies its own income tax.`,
    `${threshold} ${s.dueDateNotes || `Payments generally follow the April, June, September, and January schedule.`} ${weighted}`,
    `You avoid an IRS underpayment penalty by hitting a "safe harbor": paying at least 90% of this year's total tax, or 100% of last year's (110% if your income is higher). ${s.selfEmploymentNotes || ''} You can pay online through the ${agency} portal, and the calculator above breaks your total into the federal and ${s.name} pieces so you can send each to the right place.`.trim(),
  ];
}

function noTaxHow(s) {
  return [
    `Because ${s.name} does not tax personal income, the only quarterly estimated taxes you owe as a self-employed resident are federal. That is still two pieces: self-employment tax — 15.3% for Social Security and Medicare on 92.35% of your net profit, up to the Social Security wage base — and federal income tax on your profit after the standard deduction.`,
    `The IRS asks you to pay these in four installments, generally due April 15, June 15, September 15, and the following January 15. ${s.uniqueFacts[1] || ''}`.trim(),
    `You avoid an IRS underpayment penalty by meeting a "safe harbor": paying at least 90% of this year's tax, or 100% of last year's tax (110% if your income is higher). You can pay online at IRS Direct Pay or through EFTPS. Since there is no ${s.name} return to file, the calculator above shows your federal quarterly amounts only.`,
  ];
}

function buildFaqs(s) {
  const faqs = [];
  if (s.hasStateIncomeTax) {
    faqs.push({
      q: `Do I have to pay quarterly estimated taxes in ${s.name}?`,
      a: `Generally yes, if you expect to owe tax on income that has no withholding (like 1099 or self-employment income). You will owe federal estimated taxes, and ${s.name} expects state estimated payments too${s.stateQuarterlyThreshold != null ? ` once you expect to owe more than $${s.stateQuarterlyThreshold.toLocaleString()} in state tax` : ''}. Use the calculator above to see both.`,
    });
  } else {
    faqs.push({
      q: `Do I have to pay quarterly estimated taxes in ${s.name}?`,
      a: `You still owe federal quarterly estimated taxes on self-employment income, but ${s.name} has no state income tax, so there is no separate state estimate to file. Your quarterly payments go to the IRS only.`,
    });
  }
  faqs.push({
    q: `When are ${s.taxYear} estimated taxes due?`,
    a: `Federal estimated payments for ${s.taxYear} are due April 15, June 15, September 15, and January 15 of the following year. ${s.dueDateNotes || (s.hasStateIncomeTax ? `${s.name} generally follows the same schedule.` : '')}`.trim(),
  });
  faqs.push({
    q: `How much should I set aside for taxes as a 1099 worker in ${s.name}?`,
    a: `A common rule of thumb is 25–30% of your net self-employment income${s.hasStateIncomeTax ? `, and a bit more in ${s.name} because of state income tax` : ` — and in ${s.name} you can stay near the lower end since there is no state income tax`}. The calculator above gives you a far more precise number based on your actual income and filing status.`,
  });
  // At least two state-unique FAQ items, sourced from verified uniqueFacts.
  faqs.push({
    q: `What is unique about estimated taxes in ${s.name}?`,
    a: s.uniqueFacts[0],
  });
  faqs.push({
    q: `Are there other ${s.name}-specific rules I should know?`,
    a: [s.uniqueFacts[1], s.uniqueFacts[2]].filter(Boolean).join(' '),
  });
  faqs.push({
    q: `Does this calculator include the QBI deduction?`,
    a: `Not in this version. The Qualified Business Income (QBI) deduction can reduce your federal taxable income by up to 20% of qualifying business profit, so your real federal tax may be a little lower than shown. We keep the estimate conservative and leave QBI out; factor it in with a tax professional if it applies to you.`,
  });
  return faqs;
}

function relatedTools() {
  // All destinations are real, existing pages to avoid 404 crawl paths.
  return {
    up: [
      { label: 'National Quarterly Estimated Tax Calculator', href: '/calculators/quarterly-tax/', hook: 'The federal-only version and the full 50-state directory.' },
      { label: 'All VestlyFi Calculators', href: '/calculators/', hook: 'Every free money tool in one place.' },
    ],
    lateral: [
      { label: 'How Much House Can I Afford?', href: '/house-affordability/', hook: 'Turn your take-home income into a home budget.' },
      { label: 'Net Worth Tracker', href: '/net-worth/', hook: 'See where your self-employment income is taking you.' },
      { label: 'Retirement Planner', href: '/retirement/', hook: 'A Solo 401(k) or SEP-IRA can cut your quarterly tax.' },
    ],
  };
}

export { SITE };
