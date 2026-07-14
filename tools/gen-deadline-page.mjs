#!/usr/bin/env node
// Generates /calculators/quarterly-tax/deadlines/, the deadline guide for the
// quarterly-tax cluster (head queries: "when are quarterly taxes due 2026",
// "estimated tax deadline 2026", "q3 estimated tax deadline").
//
//   node tools/gen-deadline-page.mjs
//
// Standalone: tools/generate.mjs does NOT rebuild this page, and this page's
// sitemap entry lives outside the generated quarterly-tax block so the state
// generator never wipes it. Update DEADLINES and the copy each tax year.
// Per-state exceptions (VA, DE, HI, CA) mirror dueDateNotes in data/states;
// keep them in sync if those files change.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadIndex } from './lib/getStateData.mjs';
import { head, NAV, FOOTER, crumbsHtml, breadcrumbSchema, faqSchema, esc, jsonld } from './lib/template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'calculators', 'quarterly-tax', 'deadlines');
const SITEMAP_PATH = join(ROOT, 'sitemap.xml');
const SITE = 'https://vestlyfi.com';
const URL = `${SITE}/calculators/quarterly-tax/deadlines/`;
const TODAY = new Date().toISOString().slice(0, 10);

// Tax-year-2026 federal schedule. The IRS quarters are unequal on purpose.
const DEADLINES = [
  { q: 'Q1', period: 'January 1 to March 31, 2026', date: '2026-04-15' },
  { q: 'Q2', period: 'April 1 to May 31, 2026', date: '2026-06-15' },
  { q: 'Q3', period: 'June 1 to August 31, 2026', date: '2026-09-15' },
  { q: 'Q4', period: 'September 1 to December 31, 2026', date: '2027-01-15' },
];
// Extra horizon for the client-side countdown after Q4 passes.
const COUNTDOWN_EXTRA = [
  { q: 'Q1 2027', date: '2027-04-15' },
  { q: 'Q2 2027', date: '2027-06-15' },
];

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pretty(iso) {
  const d = new Date(iso + 'T12:00:00');
  return {
    weekday: DAY[d.getDay()],
    long: `${MONTH[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
  };
}

// The page states that no 2026 date needs a weekend shift; fail the build if
// a date edit ever makes that claim false instead of publishing a wrong page.
for (const { date } of DEADLINES) {
  const dow = new Date(date + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) throw new Error(`${date} falls on a weekend; update the copy and shift the date`);
}

const FAQS = [
  { q: 'When are quarterly estimated taxes due in 2026?',
    a: 'Federal estimated payments for tax year 2026 are due April 15, 2026 (Q1), June 15, 2026 (Q2), September 15, 2026 (Q3), and January 15, 2027 (Q4). All four fall on weekdays, so no weekend shifts apply this year.' },
  { q: 'When is the Q3 2026 estimated tax deadline?',
    a: 'Tuesday, September 15, 2026. It covers income you earned from June 1 through August 31, 2026.' },
  { q: 'What happens if I miss a quarterly deadline?',
    a: 'The IRS charges an underpayment penalty that works like interest on the amount you should have paid. It accrues from the missed due date until you pay, so paying as soon as you can beats waiting for the next quarterly date. The rate is set each quarter using the federal short-term rate plus 3 percentage points.' },
  { q: 'What if a due date falls on a weekend or holiday?',
    a: 'The deadline moves to the next business day. None of the 2026 tax-year dates need this shift, but the rule matters in other years.' },
  { q: 'Are state estimated tax deadlines the same as federal?',
    a: 'Usually. Most states copy the federal schedule. The main exceptions: Virginia\'s first payment is due May 1, Delaware\'s first payment is due April 30, Hawaii uses the 20th of each deadline month, and California front-loads payments (30% in April, 40% in June, 30% in January) with no September payment at all.' },
  { q: 'Do I have to pay in four equal installments?',
    a: 'No. Equal quarters are the default, but if your income arrives unevenly you can use the annualized income installment method (IRS Form 2210, Schedule AI) to pay in proportion to when you actually earned it. Safe-harbor totals still apply.' },
  { q: 'When is the first estimated payment for tax year 2027?',
    a: 'April 15, 2027, covering income earned January 1 through March 31, 2027.' },
];

// Mirrors dueDateNotes in data/states/quarterly-tax/{slug}.json.
const STATE_EXCEPTIONS = [
  { slug: 'virginia', name: 'Virginia', note: 'First payment is due May 1, not April 15. The other three dates match federal.' },
  { slug: 'delaware', name: 'Delaware', note: 'First state payment is due April 30. June, September, and January match federal.' },
  { slug: 'hawaii', name: 'Hawaii', note: 'Payments are due on the 20th: April 20, June 20, September 20, and January 20.' },
  { slug: 'california', name: 'California', note: 'Front-loaded schedule: 30% by April 15, 40% by June 15, nothing in September, and the final 30% by January 15.' },
];

function build() {
  const index = loadIndex().slice().sort((a, b) => a.name.localeCompare(b.name));

  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Calculators', href: '/calculators/' },
    { label: 'Quarterly Estimated Tax', href: '/calculators/quarterly-tax/' },
    { label: '2026 Deadlines' },
  ];

  const meta = {
    title: 'Quarterly Estimated Tax Deadlines for 2026 | VestlyFi',
    description: 'All four 2026 estimated tax due dates: April 15, June 15, September 15, and January 15, 2027. Plus weekend rules, penalties, and the states with different deadlines.',
    canonical: URL,
    url: URL,
    ogImage: `${SITE}/og-image.png`,
    noindex: false,
  };

  const jsonLdBlocks = [faqSchema(FAQS), breadcrumbSchema(crumbs)]
    .map((o) => `<script type="application/ld+json">\n${jsonld(o)}\n</script>`).join('\n');

  const rows = DEADLINES.map(({ q, period, date }) => {
    const p = pretty(date);
    return `<tr><td class="qlabel">${q} 2026</td><td>${esc(period)}</td><td>${p.weekday}, ${p.long}</td></tr>`;
  }).join('\n      ');

  const countdownDates = [
    ...DEADLINES.map(({ q, date }) => ({ label: `${q} 2026`, date })),
    ...COUNTDOWN_EXTRA.map(({ q, date }) => ({ label: q, date })),
  ];

  const exceptionCards = STATE_EXCEPTIONS.map((s) =>
    `<a class="related-card" href="/calculators/quarterly-tax/${s.slug}/"><div class="rc-title">${esc(s.name)}</div><div class="rc-hook">${esc(s.note)}</div></a>`
  ).join('\n      ');

  const grid = index.map((st) =>
    `<a href="/calculators/quarterly-tax/${st.slug}/"><span>${esc(st.name)}</span><span class="ab">${esc(st.abbreviation)}</span></a>`
  ).join('\n      ');

  const body = `${NAV}
<style>/* .sched styles the last row as a total; here every row is a peer */
.sched tr:last-child td{font-weight:inherit;color:var(--cream-dim);}</style>
<div class="page">
  ${crumbsHtml(crumbs)}
  <div class="page-tag">Side-Income Tools</div>
  <h1>Quarterly Estimated Tax Deadlines for 2026</h1>
  <p class="intro">Federal estimated payments for tax year 2026 are due <strong>April 15</strong>, <strong>June 15</strong>, and <strong>September 15, 2026</strong>, and <strong>January 15, 2027</strong>. All four land on weekdays this year, so there are no weekend shifts. Here is the full schedule, what each payment covers, what a missed date actually costs, and the four states that march to their own calendar.</p>

  <div class="note-card" id="nextDeadline"><strong>Next up:</strong> the Q3 2026 payment is due Tuesday, September 15, 2026.</div>

  <div class="section">
    <h2>The 2026 federal schedule</h2>
    <table class="sched">
      <tr><th>Payment</th><th>For income earned</th><th>Due date</th></tr>
      ${rows}
    </table>
    <p>Note the uneven quarters: they are an IRS quirk, not a typo. The second "quarter" covers only two months (April and May) and the fourth covers four. If your income is seasonal, that mismatch is exactly what the annualized income method on Form 2210 exists to fix.</p>
  </div>

  <div class="section">
    <h2>What missing a date actually costs</h2>
    <p>There is no flat late fee. Instead, the IRS charges an underpayment penalty that behaves like interest: it accrues daily on the amount you should have paid, from the missed due date until the day you pay. The rate is set quarterly (the federal short-term rate plus 3 percentage points), so the real cost depends on how long you wait, not just how much you missed.</p>
    <p>Two practical consequences. First, pay the moment you notice, not at the next quarterly date; every day matters. Second, the <a href="/calculators/quarterly-tax/">safe-harbor rules</a> can make the penalty disappear entirely: pay at least 90% of this year's tax or 100% of last year's (110% if you earned over $150,000) and you are protected even if you end up owing more in April.</p>
  </div>

  <div class="section">
    <h2>Four states use different dates</h2>
    <p>Most states copy the federal schedule. These four do not:</p>
    <div class="related">
      ${exceptionCards}
    </div>
  </div>

  <div class="section">
    <h2>Know the dates? Now get the amounts</h2>
    <p>The <a href="/calculators/quarterly-tax/">quarterly estimated tax calculator</a> turns your expected income into a per-quarter payment, including self-employment tax and your safe-harbor target. Pick your state for a version with your state's rules and payment portal:</p>
    <div class="state-grid">
      ${grid}
    </div>
  </div>

  <div class="section">
    <h2>Deadline FAQ</h2>
    ${FAQS.map((f) => `<div class="faq-item"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`).join('\n    ')}
  </div>

  <p class="disclaimer">For educational purposes only, not tax advice. Confirm dates with the IRS and your state's tax agency before relying on them.</p>
</div>
${FOOTER}
<script>
(function(){
  var dates=${JSON.stringify(countdownDates)};
  var now=new Date(); now.setHours(0,0,0,0);
  for(var i=0;i<dates.length;i++){
    var d=new Date(dates[i].date+'T23:59:59');
    if(d>=now){
      var days=Math.ceil((d-now)/86400000);
      var p=new Date(dates[i].date+'T12:00:00');
      var names=['January','February','March','April','May','June','July','August','September','October','November','December'];
      var when=days===0?'today':days===1?'tomorrow':days+' days away';
      document.getElementById('nextDeadline').innerHTML='<strong>Next up:</strong> the '+dates[i].label+' payment is due '+names[p.getMonth()]+' '+p.getDate()+', '+p.getFullYear()+' ('+when+').';
      return;
    }
  }
})();
</script>
</body>
</html>`;

  return head({ meta, jsonLdBlocks }) + body;
}

function updateSitemap() {
  let sm = readFileSync(SITEMAP_PATH, 'utf8');
  if (sm.includes(`<loc>${URL}</loc>`)) return false;
  const entry = `  <url>\n    <loc>${URL}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
  // Outside the BEGIN/END quarterly-tax block on purpose; generate.mjs owns that block.
  writeFileSync(SITEMAP_PATH, sm.replace('</urlset>', entry + '</urlset>'));
  return true;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'index.html'), build());
console.log('Wrote /calculators/quarterly-tax/deadlines/index.html');
console.log(updateSitemap() ? 'Sitemap: deadlines URL added.' : 'Sitemap: deadlines URL already present.');
