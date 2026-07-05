/**
 * Programmatic page generator.
 *
 *   node tools/generate.mjs
 *
 * - Validates every state data file (throws / non-zero exit on bad data).
 * - Renders 51 state spoke pages + the national hub page.
 * - Rewrites the quarterly-tax block of sitemap.xml (indexable pages only).
 * - Writes NEEDS_VERIFICATION.md.
 * - Prints a summary table of all pages with verification + index status.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAllStates, loadIndex } from './lib/getStateData.mjs';
import { buildCopy } from './lib/copy.mjs';
import { generateStateMetadata, nationalMetadata } from './lib/metadata.mjs';
import { renderStatePage, renderNationalPage } from './lib/template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_ROOT = join(ROOT, 'calculators', 'quarterly-tax');
const SITE = 'https://vestlyfi.com';
const TODAY = '2026-07-05';

const engineSource = readFileSync(join(__dirname, 'lib', 'taxEngine.mjs'), 'utf8');

const NATIONAL_FAQS = [
  { q: 'Who has to pay quarterly estimated taxes?', a: 'Generally anyone who expects to owe $1,000 or more in federal tax on income that has no withholding — freelancers, 1099 contractors, gig workers, landlords, and small-business owners. If all your income is W-2 with enough withholding, you usually do not need to.' },
  { q: 'When are 2026 quarterly taxes due?', a: 'Federal estimated payments are due April 15, 2026, June 15, 2026, September 15, 2026, and January 15, 2027. If a date falls on a weekend or holiday it shifts to the next business day.' },
  { q: 'How do I calculate what I owe each quarter?', a: 'Estimate your annual net self-employment income, add self-employment tax (15.3% on 92.35% of your profit up to the Social Security wage base) and federal income tax on your profit after the standard deduction, then divide by four. The calculator above does this for you.' },
  { q: 'What is the safe harbor rule?', a: 'You avoid an IRS underpayment penalty if you pay at least 90% of the current year\'s tax, or 100% of last year\'s tax (110% if your prior-year income was over $150,000). Paying to the safe harbor protects you even if you end up owing more.' },
  { q: 'Do I owe state estimated taxes too?', a: 'It depends on your state. Nine states have no income tax, so you only pay federal. The rest have their own estimated-tax rules and thresholds — choose your state above for a version that includes them.' },
];

function ensureDir(p) { mkdirSync(p, { recursive: true }); }

function generate() {
  const states = loadAllStates();          // throws on invalid data
  const index = loadIndex().slice().sort((a, b) => a.name.localeCompare(b.name));
  const summary = [];

  // National hub
  const natMeta = nationalMetadata(2026);
  ensureDir(OUT_ROOT);
  writeFileSync(join(OUT_ROOT, 'index.html'),
    renderNationalPage({ meta: natMeta, engineSource, index, faqs: NATIONAL_FAQS }));

  // State spokes
  for (const state of states) {
    const copy = buildCopy(state);
    const meta = generateStateMetadata(state);
    const html = renderStatePage({ state, copy, meta, engineSource });
    const dir = join(OUT_ROOT, state.slug);
    ensureDir(dir);
    writeFileSync(join(dir, 'index.html'), html);
    summary.push({
      name: state.name,
      abbr: state.abbreviation,
      type: state.hasStateIncomeTax ? 'income-tax' : 'no-tax',
      verified: !state.needsVerification,
      indexed: !meta.noindex,
      url: `/calculators/quarterly-tax/${state.slug}/`,
    });
  }

  updateSitemap(summary);
  writeNeedsVerification(states);
  printSummary(summary);
}

function updateSitemap(summary) {
  const path = join(ROOT, 'sitemap.xml');
  let xml = readFileSync(path, 'utf8');

  const indexable = summary.filter((s) => s.indexed);
  const entries = [
    { loc: `${SITE}/calculators/quarterly-tax/`, priority: '0.8' },
    ...indexable.map((s) => ({ loc: `${SITE}${s.url}`, priority: '0.6' })),
  ];
  const block =
    `  <!-- BEGIN quarterly-tax (generated) -->\n` +
    entries.map((e) =>
      `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
    ).join('\n') +
    `\n  <!-- END quarterly-tax (generated) -->`;

  // Replace an existing generated block, else insert before </urlset>.
  const re = /[ \t]*<!-- BEGIN quarterly-tax \(generated\) -->[\s\S]*?<!-- END quarterly-tax \(generated\) -->\n?/;
  if (re.test(xml)) {
    xml = xml.replace(re, block + '\n');
  } else {
    xml = xml.replace(/<\/urlset>/, block + '\n</urlset>');
  }
  writeFileSync(path, xml);
}

function writeNeedsVerification(states) {
  const pending = states.filter((s) => s.needsVerification);
  const lines = [];
  lines.push('# NEEDS_VERIFICATION — Quarterly Estimated Tax by State');
  lines.push('');
  lines.push('Pages listed here ship with `<meta name="robots" content="noindex,follow">` and are');
  lines.push('**excluded from the sitemap** until their data is verified from official state');
  lines.push('sources and their `needsVerification` flag is set to `false`.');
  lines.push('');
  lines.push('Wrong tax numbers are worse than no page. Do not clear a flag until brackets,');
  lines.push('standard deductions, the estimated-payment threshold, and the agency links have');
  lines.push('all been checked against the state tax agency for tax year 2026.');
  lines.push('');
  lines.push(`**${pending.length} of 51 pages pending verification.**`);
  lines.push('');
  lines.push('| State | Abbr | What to verify | Official source to use |');
  lines.push('| --- | --- | --- | --- |');
  for (const s of pending.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`| ${s.name} | ${s.abbreviation} | brackets_single, brackets_married, standard deductions, threshold, agency name + URL, payment portal, quarterly weights | ${s.name} Department of Revenue / Taxation (official .gov) |`);
  }
  lines.push('');
  lines.push('## Known caveats & deferrals (verified pages)');
  lines.push('');
  lines.push('Items flagged during verification that could not be confirmed from an official');
  lines.push('source, or that are modeled as a documented approximation:');
  lines.push('');
  lines.push('- **Idaho — deferred (still noindex).** The official 2026 individual rate was not');
  lines.push('  yet published on tax.idaho.gov (rate schedule only ran through 2025). Do not');
  lines.push('  verify until the 2026 rate is posted.');
  lines.push('- **Massachusetts — deferred (still noindex).** 2026 flat rate (5.0%) and $1,107,750');
  lines.push('  surtax threshold are confirmed, but the official personal-exemption page returned');
  lines.push('  HTTP 403 and MA uses its own gross-income base (not federal AGI). Needs the');
  lines.push('  exemption amount + base rules confirmed before indexing.');
  lines.push('- **Illinois (indexed).** Rate 4.95% and $1,000 threshold confirmed official. The IL');
  lines.push('  personal exemption allowance (~$2,850/person) is NOT modeled, so the estimate runs');
  lines.push('  slightly high; documented in selfEmploymentNotes. Add the exemption to refine.');
  lines.push('- **North Carolina (indexed).** Rate 3.99% confirmed official for 2026. Standard');
  lines.push('  deduction ($12,750 / $25,500) is the latest published (2025) amount; confirm the');
  lines.push('  2026 figure when NCDOR posts it.');
  lines.push('- **Arizona (indexed).** Rate 2.5% confirmed; standard deduction modeled as equal to');
  lines.push('  the federal amount per ADOR guidance ("matches the federal amount"). Confirm the');
  lines.push('  exact 2026 AZ figure when the Form 140 instructions are posted.');
  lines.push('');
  lines.push('## Verification checklist per state');
  lines.push('');
  lines.push('1. Pull 2026 bracket table from the state tax agency (single + married).');
  lines.push('2. Confirm the standard deduction / conformity basis.');
  lines.push('3. Confirm the estimated-payment threshold (dollar amount that triggers the requirement).');
  lines.push('4. Confirm due-date schedule and any weighting (e.g., California 30/40/0/30).');
  lines.push('5. Record 2–3 genuinely state-unique facts.');
  lines.push('6. Set `stateTaxAgencyName`, `stateTaxAgencyUrl`, `statePaymentPortalUrl` (https, official).');
  lines.push('7. Set `needsVerification: false` and `lastVerified` to the date checked.');
  lines.push('8. Re-run `node tools/generate.mjs`.');
  lines.push('');
  writeFileSync(join(ROOT, 'NEEDS_VERIFICATION.md'), lines.join('\n') + '\n');
}

function printSummary(summary) {
  const verified = summary.filter((s) => s.verified).length;
  const indexed = summary.filter((s) => s.indexed).length;
  console.log('\n=== Programmatic build summary: Quarterly Estimated Tax by State ===\n');
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('State', 22) + pad('Type', 12) + pad('Verified', 10) + 'Indexed');
  console.log('-'.repeat(52));
  for (const s of summary.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(pad(s.name, 22) + pad(s.type, 12) + pad(s.verified ? 'yes' : 'NO', 10) + (s.indexed ? 'yes' : 'noindex'));
  }
  console.log('-'.repeat(52));
  console.log(`Total pages: ${summary.length + 1} (51 states + 1 national hub)`);
  console.log(`Verified & indexed: ${indexed}   |   Pending (noindex): ${summary.length - indexed}`);
  console.log(`\nWrote pages to /calculators/quarterly-tax/, updated sitemap.xml, wrote NEEDS_VERIFICATION.md\n`);
}

generate();
