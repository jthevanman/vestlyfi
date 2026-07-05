/**
 * Seeds data/states/index.json and data/states/quarterly-tax/<slug>.json.
 *
 * Idempotent: it will NOT overwrite an existing per-state file, so human
 * verification edits (real brackets, cleared needsVerification flags) are
 * never clobbered by a re-run. Delete a file to regenerate it from seed.
 *
 *   node tools/seed-states.mjs
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data', 'states');
const CLUSTER_DIR = join(DATA_DIR, 'quarterly-tax');

// 50 states + DC. hasTax=false for the 9 that do not tax earned/SE income.
const STATES = [
  ['alabama', 'Alabama', 'AL', true],
  ['alaska', 'Alaska', 'AK', false],
  ['arizona', 'Arizona', 'AZ', true],
  ['arkansas', 'Arkansas', 'AR', true],
  ['california', 'California', 'CA', true],
  ['colorado', 'Colorado', 'CO', true],
  ['connecticut', 'Connecticut', 'CT', true],
  ['delaware', 'Delaware', 'DE', true],
  ['district-of-columbia', 'District of Columbia', 'DC', true],
  ['florida', 'Florida', 'FL', false],
  ['georgia', 'Georgia', 'GA', true],
  ['hawaii', 'Hawaii', 'HI', true],
  ['idaho', 'Idaho', 'ID', true],
  ['illinois', 'Illinois', 'IL', true],
  ['indiana', 'Indiana', 'IN', true],
  ['iowa', 'Iowa', 'IA', true],
  ['kansas', 'Kansas', 'KS', true],
  ['kentucky', 'Kentucky', 'KY', true],
  ['louisiana', 'Louisiana', 'LA', true],
  ['maine', 'Maine', 'ME', true],
  ['maryland', 'Maryland', 'MD', true],
  ['massachusetts', 'Massachusetts', 'MA', true],
  ['michigan', 'Michigan', 'MI', true],
  ['minnesota', 'Minnesota', 'MN', true],
  ['mississippi', 'Mississippi', 'MS', true],
  ['missouri', 'Missouri', 'MO', true],
  ['montana', 'Montana', 'MT', true],
  ['nebraska', 'Nebraska', 'NE', true],
  ['nevada', 'Nevada', 'NV', false],
  ['new-hampshire', 'New Hampshire', 'NH', false],
  ['new-jersey', 'New Jersey', 'NJ', true],
  ['new-mexico', 'New Mexico', 'NM', true],
  ['new-york', 'New York', 'NY', true],
  ['north-carolina', 'North Carolina', 'NC', true],
  ['north-dakota', 'North Dakota', 'ND', true],
  ['ohio', 'Ohio', 'OH', true],
  ['oklahoma', 'Oklahoma', 'OK', true],
  ['oregon', 'Oregon', 'OR', true],
  ['pennsylvania', 'Pennsylvania', 'PA', true],
  ['rhode-island', 'Rhode Island', 'RI', true],
  ['south-carolina', 'South Carolina', 'SC', true],
  ['south-dakota', 'South Dakota', 'SD', false],
  ['tennessee', 'Tennessee', 'TN', false],
  ['texas', 'Texas', 'TX', false],
  ['utah', 'Utah', 'UT', true],
  ['vermont', 'Vermont', 'VT', true],
  ['virginia', 'Virginia', 'VA', true],
  ['washington', 'Washington', 'WA', false],
  ['west-virginia', 'West Virginia', 'WV', true],
  ['wisconsin', 'Wisconsin', 'WI', true],
  ['wyoming', 'Wyoming', 'WY', false],
];

// Per-state unique facts for the 9 no-income-tax states (verified, indexable).
const NO_TAX_FACTS = {
  AK: [
    'Alaska has no state income tax, so on your self-employment income you only owe federal quarterly estimated taxes.',
    'Alaska also has no statewide sales tax — but your Permanent Fund Dividend is still federally taxable.',
  ],
  FL: [
    'Florida has no state income tax, so freelancers and 1099 workers only make federal quarterly payments.',
    'There is no Florida estimated-tax form to file — everything flows through the IRS Form 1040-ES.',
  ],
  NV: [
    'Nevada has no state income tax, so your only quarterly estimated payments are federal.',
    'Nevada funds itself largely through sales and gaming taxes rather than an income tax.',
  ],
  NH: [
    'New Hampshire does not tax earned or self-employment income, so 1099 income owes only federal quarterly taxes.',
    "New Hampshire's old Interest & Dividends tax was fully repealed effective 2025, removing its last income-style tax.",
  ],
  SD: [
    'South Dakota has no state income tax, so self-employed residents only owe federal quarterly estimates.',
    'There is no South Dakota estimated-tax return to file.',
  ],
  TN: [
    'Tennessee has no state income tax, so your quarterly estimated payments are federal only.',
    "Tennessee's Hall Tax on interest and dividends was fully repealed in 2021.",
  ],
  TX: [
    'Texas has no state income tax, so freelancers and gig workers only make federal quarterly payments.',
    'There is no Texas state estimated-tax form — you file IRS Form 1040-ES only.',
  ],
  WA: [
    'Washington has no tax on wages or self-employment income, so 1099 earners owe only federal quarterly taxes.',
    'Washington does levy a 7% capital-gains excise tax on large investment gains, but that does not apply to earned or self-employment income.',
  ],
  WY: [
    'Wyoming has no state income tax, so self-employed residents make only federal quarterly payments.',
    'There is no Wyoming estimated-tax return to file.',
  ],
};

function noTaxState(slug, name, abbr) {
  return {
    slug, name, abbreviation: abbr,
    hasStateIncomeTax: false,
    taxYear: 2026,
    brackets_single: [],
    brackets_married: [],
    standardDeduction_single: null,
    standardDeduction_married: null,
    hasQuarterlyRequirement: false,
    stateQuarterlyThreshold: null,
    stateTaxAgencyName: 'Internal Revenue Service (federal only)',
    stateTaxAgencyUrl: 'https://www.irs.gov/',
    statePaymentPortalUrl: 'https://www.irs.gov/payments',
    quarterlyWeights: null,
    dueDateNotes: 'Federal estimated payments are due April 15, June 15, September 15, and the following January 15.',
    selfEmploymentNotes: `${name} does not tax personal income, so your quarterly estimates cover federal self-employment and income tax only.`,
    uniqueFacts: NO_TAX_FACTS[abbr],
    needsVerification: false,
    lastVerified: '2026-07-05',
  };
}

// Verified income-tax example: Colorado (flat 4.4%).
function colorado() {
  return {
    slug: 'colorado', name: 'Colorado', abbreviation: 'CO',
    hasStateIncomeTax: true,
    taxYear: 2026,
    brackets_single: [{ min: 0, max: null, rate: 0.044 }],
    brackets_married: [{ min: 0, max: null, rate: 0.044 }],
    // Colorado starts from federal taxable income, so the federal standard
    // deduction effectively applies before the flat rate (see notes).
    standardDeduction_single: 16100,
    standardDeduction_married: 32200,
    hasQuarterlyRequirement: true,
    stateQuarterlyThreshold: 1000,
    stateTaxAgencyName: 'Colorado Department of Revenue',
    stateTaxAgencyUrl: 'https://tax.colorado.gov/',
    statePaymentPortalUrl: 'https://tax.colorado.gov/individual-estimated-income-tax',
    quarterlyWeights: null,
    dueDateNotes: 'Colorado follows the federal schedule: April 15, June 15, September 15, and January 15.',
    selfEmploymentNotes: 'Colorado taxes your federal taxable income at a flat 4.4%, so this estimate applies the federal standard deduction before the state rate.',
    uniqueFacts: [
      'Colorado has a flat 4.4% income tax, so your effective state rate is the same at every income level.',
      'Colorado only requires estimated payments if you expect to owe more than $1,000 in state tax for the year.',
      "Colorado's flat rate is protected by TABOR, which can trigger temporary rate reductions in state surplus years.",
    ],
    needsVerification: false,
    lastVerified: '2026-07-05',
  };
}

// Stub for income-tax states pending human verification (ships noindex).
function stubState(slug, name, abbr) {
  return {
    slug, name, abbreviation: abbr,
    hasStateIncomeTax: true,
    taxYear: 2026,
    brackets_single: null,
    brackets_married: null,
    standardDeduction_single: null,
    standardDeduction_married: null,
    hasQuarterlyRequirement: true,
    stateQuarterlyThreshold: null,
    stateTaxAgencyName: null,
    stateTaxAgencyUrl: null,
    statePaymentPortalUrl: null,
    quarterlyWeights: null,
    dueDateNotes: '',
    selfEmploymentNotes: '',
    uniqueFacts: [
      `${name} levies a state income tax that applies to self-employment income in addition to your federal quarterly payments.`,
      `${name} bracket and agency data is pending verification from official sources before this page is indexed.`,
    ],
    needsVerification: true,
    lastVerified: null,
  };
}

// --- write files ------------------------------------------------------------
mkdirSync(CLUSTER_DIR, { recursive: true });

const index = [];
let created = 0, skipped = 0;
for (const [slug, name, abbr, hasTax] of STATES) {
  index.push({ slug, name, abbreviation: abbr, hasStateIncomeTax: hasTax });
  const file = join(CLUSTER_DIR, `${slug}.json`);
  if (existsSync(file)) { skipped++; continue; }
  let data;
  if (!hasTax) data = noTaxState(slug, name, abbr);
  else if (abbr === 'CO') data = colorado();
  else data = stubState(slug, name, abbr);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  created++;
}

// index.json can always be rewritten (derived, not hand-edited).
writeFileSync(join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');

console.log(`Seeded ${STATES.length} states: ${created} created, ${skipped} preserved. index.json written.`);
