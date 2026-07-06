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
  lines.push('- **Traffic-first batch — now INDEXED (Ohio, Oregon, Missouri, Wisconsin, Georgia):**');
  lines.push('  - **Ohio** — ohioBid model: first $250k of 1099 income deducted, remainder 3%; other');
  lines.push('    income flat 2.75% over $26,050 (2026 HB96). Municipal/school-district taxes not modeled.');
  lines.push('  - **Oregon (taxYearBasis 2025)** — federalTaxDeduction cap-phaseout: $8,500 cap phased out');
  lines.push('    $125k–$145k AGI (official OR-40 Table 4). Portland-area local taxes not modeled.');
  lines.push('  - **Missouri (taxYearBasis 2025)** — verified 2025 rate schedule (0% to $1,313; graduated');
  lines.push('    to a 4.7% top over $9,191); federalTaxDeduction percent-of-federal (35/25/15/5/0%, cap');
  lines.push('    $5k/$10k). 2026 withholding confirms the 4.7% top rate. KC/St. Louis 1% earnings tax not modeled.');
  lines.push('  - **Wisconsin (taxYearBasis 2025)** — brackets derived + cross-checked against the official');
  lines.push('    Tax Computation Worksheet subtraction amounts (Act 15 expanded the 4.4% bracket); the');
  lines.push('    slidingStandardDeduction is fit to the official 2025 std-deduction table (MFJ $60k -> $18,823).');
  lines.push('  - **Georgia** — conflict RESOLVED: HB 463 (signed 5/11/2026) cut the flat rate to 4.99%');
  lines.push('    retroactive to 1/1/2026 (the 5.19% Employer\'s Guide predates it). Std deduction $15k/$30k');
  lines.push('    applies to TY2026; $1,750 tip/overtime exclusion 2026-2028 noted.');
  lines.push('  - **Maryland — INDEXED (taxYearBasis 2025), with a source caveat.** Fixed statutory');
  lines.push('    2%-5.75% brackets + BRFA-2025 top brackets (6.25% >$500k / 6.5% >$1M single; >$600k/>$1.2M');
  lines.push('    joint), capped standard deduction (~$2,700/$5,450). Every county\'s local income tax');
  lines.push('    (2.25%-3.20%) is disclosed but NOT computed. NOTE: marylandtaxes.gov blocks automated');
  lines.push('    fetch (JS page + dead PDF link + redirects), so these rest on stable statute + the');
  lines.push('    provided BRFA change; human should spot-check the std-deduction max and BRFA thresholds.');
  lines.push('- **California — deferred (still noindex).** The FTB blocks automated access (HTTP 403');
  lines.push('  on the tax-rate-schedule page and the 2026 Form 540-ES instructions), and CA typically');
  lines.push('  does not publish inflation-adjusted 2026 brackets until ~August. Needs manual');
  lines.push('  transcription of the full FTB schedule plus the 30/40/0/30 weighting and 1% MHS surtax.');
  lines.push('- **New York — indexed, with a documented limitation.** 2026 brackets transcribed from the');
  lines.push('  official IT-2105-I (2026) instructions. The tax-benefit-recapture supplemental tax above');
  lines.push('  NYAGI $107,650, the MCTMT, and NYC/Yonkers local taxes are NOT modeled (noted on-page);');
  lines.push('  the estimate can run slightly low for high earners in the NYC metro.');
  lines.push('- **Idaho — deferred (still noindex).** The official 2026 individual rate was not');
  lines.push('  yet published on tax.idaho.gov (rate schedule only ran through 2025). Do not');
  lines.push('  verify until the 2026 rate is posted.');
  lines.push('- **Massachusetts — deferred (still noindex).** 2026 flat rate (5.0%) and $1,107,750');
  lines.push('  surtax threshold are confirmed, but the official personal-exemption page returned');
  lines.push('  HTTP 403 and MA uses its own gross-income base (not federal AGI). Needs the');
  lines.push('  exemption amount + base rules confirmed before indexing.');
  lines.push('- **Iowa — indexed, with a documented approximation.** 2026 flat rate 3.8% confirmed by');
  lines.push('  the Oct 2025 IDR press release (authoritative over the stale 3.9% provisions page); the');
  lines.push('  $1,000 estimated-payment threshold is confirmed. Iowa\'s standard deduction was not');
  lines.push('  published in the sources checked and is omitted (estimate runs slightly high); confirm and add it.');
  lines.push('- **Mississippi — rate resolved, still noindex.** DOR\'s own FAQ confirms the structure:');
  lines.push('  first $10,000 of taxable income exempt, remainder taxed at 4.4% (the tax-year-2026 rate).');
  lines.push('  Model as brackets [0–10,000 @ 0%, 10,000+ @ 4.4%]. Still pending: MS standard deduction');
  lines.push('  ($2,300/$4,600 believed) + personal exemption ($6,000/$12,000 believed) + estimated');
  lines.push('  threshold — dor.ms.gov returned a TLS certificate error, so these were not confirmed.');
  lines.push('- **Georgia — genuine official-source conflict, still noindex.** Standard deduction is');
  lines.push('  consistently $15,000/$30,000, but the 2026 RATE conflicts within DOR sources: the 2026');
  lines.push('  Employer\'s Tax Guide summary says withhold at 5.19%, while the DOR standard-deductions');
  lines.push('  page references a 4.99% flat rate. The authoritative 2026 Employer\'s Guide PDF 403s.');
  lines.push('  Do not index until the exact tax-year-2026 rate is confirmed from the rate schedule.');
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
