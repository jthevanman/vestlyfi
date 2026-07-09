#!/usr/bin/env node
// Generates /house-affordability/{N}k-salary/ pages ("how much house can I
// afford on a $60k salary") for 25 salary levels from $30k to $300k, using
// house-affordability/index.html as the base template. Also injects a
// "by salary" link band into the hub page (income-pages:start/end markers)
// and adds sitemap entries. Idempotent: safe to re-run after editing the hub.
//
//   node tools/gen-income-pages.mjs
//
// The 28/36 DTI rule is a stable lending convention. RATE is an ESTIMATE
// (labeled as such on-page) — refresh it when market rates move materially,
// keeping it consistent with RATE_ANCHORS in gen-credit-score-pages.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripBlocks, upsertBlock, BAND_CSS } from './lib/hubBlocks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUB_PATH = path.join(ROOT, 'house-affordability', 'index.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const TODAY = new Date().toISOString().slice(0, 10);

const SALARIES_K = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100, 110, 120, 130, 140, 150, 160, 180, 200, 250, 300];

const RATE = 6.60;  // estimated 30-yr fixed, national-average ballpark, mid-2026
const DEBTS = 400;  // benchmark monthly non-housing debt payments

// Mirrors the on-page calculator's algorithm exactly (28/36 DTI, tax estimated
// at 1.1%/yr and insurance at 0.5%/yr of an approximated home price), so the
// worked-example numbers match what the live calculator shows for these inputs.
function affordability(income, debts, down, ratePct) {
  const mi = income / 12;
  const r = ratePct / 100 / 12;
  const est = (income * 0.28 / 12 + down * r) / (r + r * 0.015);
  const monthlyTax = est * 0.011 / 12;
  const monthlyIns = est * 0.005 / 12;
  const maxHousing = Math.min(0.28 * mi, 0.36 * mi - debts);
  const availPI = maxHousing - monthlyTax - monthlyIns;
  const f = r / (1 - Math.pow(1 + r, -360));
  const price = (availPI > 0 ? availPI / f : 0) + down;
  return { price, payment: maxHousing, loan: price - down };
}

// Down payment (rounded to $1k) that lands at ~`frac` of the resulting max
// price. Fixed-point iteration; contracts because d(price)/d(down) < 1.
function downForFraction(income, frac) {
  let down = income;
  for (let i = 0; i < 60; i++) down = frac * affordability(income, DEBTS, down, RATE).price;
  return Math.round(down / 1000) * 1000;
}

const rk = n => Math.round(n / 1000) * 1000;
const usd = n => '$' + Math.round(n).toLocaleString('en-US');
const usdK = n => usd(rk(n));
const usd5K = n => usd(Math.round(n / 5000) * 5000);

// Price lost per $100/month of debt when the back-end cap binds: 100 / payment factor.
const r = RATE / 100 / 12;
const PRICE_PER_100 = usd(Math.round(100 / (r / (1 - Math.pow(1 + r, -360))) / 100) * 100);

function stats(salary) {
  const k = salary / 1000;
  const art = String(k).startsWith('8') ? 'an' : 'a';
  const s = frac => {
    const down = downForFraction(salary, frac);
    const { price, loan, payment } = affordability(salary, DEBTS, down, RATE);
    return { down, price, loan, payment };
  };
  const s5 = s(0.05), s10 = s(0.10), s20 = s(0.20);
  return {
    salary, k, art, capArt: art === 'an' ? 'An' : 'A',
    short: `$${k}k`, full: usd(salary),
    mi: salary / 12, b28: salary / 12 * 0.28, b36: salary / 12 * 0.36,
    headroom: salary / 12 * 0.08,
    s5, s10, s20,
    rLow: affordability(salary, DEBTS, s10.down, RATE - 1).price,
    rHigh: affordability(salary, DEBTS, s10.down, RATE + 1).price,
  };
}

// ── Band content ─────────────────────────────────────────────────────────────

function bandFor(salary) {
  if (salary < 50000) return 'starter';
  if (salary < 75000) return 'entry';
  if (salary < 100000) return 'core';
  if (salary < 180000) return 'sixfig';
  return 'high';
}

const BANDS = {
  starter: {
    intro: S => [
      `Buying a house on ${S.art} ${S.full} salary is possible, but the strategy matters more than at any other income. The standard 28% rule gives you about <strong>${usd(S.b28)}/month</strong> for housing — mortgage, property tax, and insurance together — which supports a home around ${usdK(S.s10.price)} with 10% down at today's rates.`,
      `Two things move the needle most at this income: existing debt (every $100/month of payments below the caps costs roughly ${PRICE_PER_100} of house) and down-payment help. USDA loans offer zero-down financing in eligible rural and suburban-edge areas, and nearly every state's housing finance agency offers assistance grants or forgivable second loans to buyers in this income range — most people who qualify never apply.`,
    ],
    canBuy: S => `Yes, if your debts are low and you're flexible on location. With ${usd(DEBTS)}/month in other debts, 10% down (about ${usd(S.s10.down)}), and a ${RATE.toFixed(2)}% rate, standard 28/36 lending math supports roughly ${usdK(S.s10.price)}. Zero-down USDA loans and state down-payment assistance can close the gap between that number and prices in your area.`,
    tipQ: `What programs help buyers at this income?`,
    tip: S => `Look up your state's housing finance agency (HFA) before talking to a lender. First-time-buyer assistance income limits typically reach well above ${S.full}, the grants or forgivable seconds stack with FHA and USDA loans, and a $10,000 assist raises the benchmark budget above by roughly $10,000 of price — without years of extra saving.`,
  },
  entry: {
    intro: S => [
      `${S.capArt} ${S.full} salary supports a real mortgage — the question is how much and where. The 28% rule gives you about <strong>${usd(S.b28)}/month</strong> for housing, which at a ${RATE.toFixed(2)}% rate translates to roughly ${usdK(S.s10.price)} with 10% down and typical debts. That's a workable house budget in much of the country and a starter-condo budget in expensive metros.`,
      `This is the income band where most first-time buyers live, and the playbook is well-worn: FHA with 3.5% down if savings are thin, conventional with 5–10% down if your credit is 680+, and a hard look at existing debts before you shop — at this income they can eat directly into the price you can pay.`,
    ],
    canBuy: S => `Yes. ${S.capArt} ${S.full} salary clears the income needed for a mortgage in most US markets: roughly ${usdK(S.s10.price)} with 10% down (about ${usd(S.s10.down)}) under standard 28/36 lending math at ${RATE.toFixed(2)}%. The constraint is usually the down payment and local prices, not the salary.`,
    tipQ: `Should I use FHA or conventional at this income?`,
    tip: () => `If your down payment is under 5% or your credit is below about 680, get an FHA quote — its rates barely penalize credit and the 3.5% minimum is the lowest mainstream entry point. With 5–10% down and good credit, conventional usually wins because its PMI cancels automatically at 20% equity while FHA's insurance typically runs for the life of the loan. Quote both and compare the full monthly payment.`,
  },
  core: {
    intro: S => [
      `${S.full} a year is right around the American median household income, and it buys a real house in most of the country: roughly <strong>${usdK(S.s10.price)}</strong> with 10% down at current rates, or ${usdK(S.s20.price)} with 20% down. The 28% rule puts your housing budget at about ${usd(S.b28)}/month.`,
      `The decisions that matter at this income are less about qualifying and more about positioning: how much down payment to bring (20% — about ${usd(S.s20.down)} — eliminates PMI), whether to clear debts first, and not letting a lender's approval ceiling talk you into a payment that leaves no room for everything else in your life.`,
    ],
    canBuy: S => `Comfortably, in most markets. Standard 28/36 lending math on ${S.art} ${S.full} salary with ${usd(DEBTS)}/month of other debts supports roughly ${usdK(S.s10.price)} with 10% down at ${RATE.toFixed(2)}% — above the median US home price. In high-cost coastal metros the same math buys a condo or townhome rather than a detached house.`,
    tipQ: `What's the highest-value move before buying at this income?`,
    tip: S => `Rate shopping. Quotes on the same borrower routinely differ by 0.25–0.5% between lenders, and at this budget a half-point of rate is roughly ${usd(rk(affordability(S.salary, DEBTS, S.s10.down, RATE - 0.5).price - S.s10.price))} of house (or the same house for tens of dollars less per month). Get at least three quotes on the same day and make lenders compete.`,
  },
  sixfig: {
    intro: S => [
      `On ${S.art} ${S.full} salary the bank will approve more house than many people should buy. The 28/36 rule supports about <strong>${usd(S.b28)}/month</strong> of housing — roughly ${usdK(S.s10.price)} with 10% down — and whether that's comfortable depends entirely on what the other 72% of your income needs to cover: retirement, childcare, travel, savings.`,
      `At this income the details that actually move the number are property taxes (the 1.1% national average is baked into the benchmarks below, but ~0.4% in Hawaii versus ~2.2% in New Jersey swings the answer by tens of thousands), existing debts, and how much cash you want left after closing.`,
    ],
    canBuy: S => `Yes, easily in most markets — the useful question is how much you *should* spend. Standard lending math supports roughly ${usdK(S.s10.price)} with 10% down at ${RATE.toFixed(2)}%. Buying below the approval ceiling is what keeps a six-figure income feeling like one after closing.`,
    tipQ: `Should I buy as much house as I'm approved for?`,
    tip: S => `Usually not. Approval math ignores retirement contributions, childcare, and your savings rate — it only caps debt at 36% of gross. A common alternative: cap total housing at 25% of gross (${usd(S.mi * 0.25)}/month here), which trims the benchmark price by roughly 10% and keeps your other financial goals fully funded.`,
  },
  high: {
    intro: S => [
      `${S.capArt} ${S.full} salary supports roughly <strong>${usdK(S.s10.price)}</strong> of house with 10% down under standard 28/36 math — which in most counties pushes the loan into jumbo territory (loans above the conforming limit, roughly $800,000 and up). Jumbo lending is competitive for strong borrowers but underwrites harder: expect reserve requirements and full documentation.`,
      `At this income the affordability question inverts: the bank's ceiling stops being the binding constraint, and the real decisions are cash allocation (a bigger down payment versus keeping capital invested), loan structure (points, term, ARM versus fixed), and property taxes, which at these price points can exceed $1,500/month before the mortgage.`,
    ],
    canBuy: S => `The approval is not in question — 28/36 math supports roughly ${usdK(S.s10.price)} with 10% down at ${RATE.toFixed(2)}%. The design questions are jumbo versus conforming loan size, how much capital to lock into the down payment, and whether points or a shorter term price better for your horizon.`,
    tipQ: `What should high earners optimize when buying?`,
    tip: () => `Loan structure over rate headlines. Compare a 30-year against a 15- or 20-year term (the rate discount beats any credit tier), price out points against your expected time in the home, and if the loan is near the conforming limit, check whether a slightly larger down payment that ducks under it buys a meaningfully better rate.`,
  },
};

// ── Page assembly ────────────────────────────────────────────────────────────

function replaceOnce(html, needle, replacement) {
  const i = html.indexOf(needle);
  if (i === -1) throw new Error(`Template needle not found: ${needle.slice(0, 60)}…`);
  return html.slice(0, i) + replacement + html.slice(i + needle.length);
}

const EXTRA_CSS = `
  /* salary pages */
  .seo-body h2 { font-size:1.15rem; font-weight:500; margin:32px 0 12px; color:var(--cream); }
  .seo-body a { color:var(--gold-light); }
  .score-table { width:100%; border-collapse:collapse; margin:16px 0 10px; font-size:0.88rem; }
  .score-table td { padding:10px 8px; border-bottom:1px solid var(--border-soft); color:var(--cream-dim); }
  .score-table td:last-child { text-align:right; color:var(--cream); font-weight:500; white-space:nowrap; }
  .score-chips { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 6px; }
  .score-chip { padding:7px 12px; border-radius:8px; background:var(--navy-mid); border:1px solid var(--border-soft); color:var(--cream-dim); text-decoration:none; font-size:0.8rem; transition:all .15s; }
  a.score-chip:hover { border-color:var(--gold); color:var(--gold-light); }
  .score-chip.current { background:var(--gold-dim); border-color:var(--gold); color:var(--gold-light); }
`;

function chipsHtml(currentK) {
  const chips = SALARIES_K.map(k => k === currentK
    ? `<span class="score-chip current">$${k}k</span>`
    : `<a class="score-chip" href="/house-affordability/${k}k-salary/">$${k}k</a>`
  ).join('');
  return `<div class="score-chips">${chips}</div>`;
}

function buildPage(base, salary) {
  const S = stats(salary);
  const band = BANDS[bandFor(salary)];

  const url = `https://vestlyfi.com/house-affordability/${S.k}k-salary/`;
  const title = `How Much House Can I Afford on ${S.art} ${S.full} Salary? | VestlyFi`;
  const desc = `How much house can you afford on ${S.art} ${S.full} salary? Roughly ${usd5K(S.s5.price)}–${usd5K(S.s20.price)} depending on down payment and debts. See the full math and run your own numbers.`;
  const sub = `The calculator is prefilled with ${S.art} ${S.full} income and an estimated ${RATE.toFixed(2)}% rate — add your down payment and debts for your exact number. Worked examples for this salary below.`;

  const debtsBind = DEBTS >= S.headroom;
  const faqs = [
    [`Can I buy a house on ${S.art} ${S.full} salary?`, band.canBuy(S)],
    [`How much house can I afford on ${S.full} a year?`,
      `Under the standard 28/36 lending rule with ${usd(DEBTS)}/month of other debts and a ${RATE.toFixed(2)}% rate: roughly ${usdK(S.s5.price)} with 5% down (${usd(S.s5.down)}), ${usdK(S.s10.price)} with 10% down (${usd(S.s10.down)}), and ${usdK(S.s20.price)} with 20% down (${usd(S.s20.down)}). Fewer debts or a lower rate raise all three numbers — use the calculator above with your own figures.`],
    [`What is the 28/36 rule on ${S.art} ${S.short} salary?`,
      `Keep housing costs (mortgage + property tax + insurance) under 28% of gross monthly income — ${usd(S.b28)}/month on ${S.art} ${S.full} salary — and all debt payments combined under 36% (${usd(S.b36)}/month). Lenders use these caps to size your approval; staying under them is also a reasonable definition of affordable.`],
    [`How much down payment do I need on ${S.art} ${S.short} salary?`,
      `Loan programs, not your salary, set the floor: 3% on some first-time conventional programs, 3.5% for FHA, 0% for VA and USDA. On the benchmark above, 5% down is about ${usd(S.s5.down)}. The salary sets your monthly budget; the down payment decides how much house that budget buys and whether you pay PMI.`],
    [band.tipQ, band.tip(S).replace(/<[^>]+>/g, '')],
  ];

  const faqLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
    })),
  }, null, 2);

  const seoSection = `<!-- SEO CONTENT -->
<div class="seo-section">
  <div class="seo-body">
    ${band.intro(S).map(p => `<p>${p}</p>`).join('\n    ')}

    <h2>Your housing budget on ${S.art} ${S.short} salary</h2>
    <p>Lenders size mortgages with the 28/36 rule: housing costs under 28% of gross monthly income, all debt payments combined under 36%. On ${S.full} a year (${usd(S.mi)}/month gross), that means:</p>
    <table class="score-table">
      <tr><td>Max housing payment (28% front-end)</td><td>${usd(S.b28)}/mo</td></tr>
      <tr><td>Max total debt payments (36% back-end)</td><td>${usd(S.b36)}/mo</td></tr>
      <tr><td>Other-debt headroom before it cuts your house budget</td><td>${usd(S.headroom)}/mo</td></tr>
    </table>

    <h2>How much house that buys at ${RATE.toFixed(2)}%</h2>
    <p>Benchmark buyer: ${usd(DEBTS)}/month of existing debts, 30-year fixed at an estimated ${RATE.toFixed(2)}% (mid-2026 national ballpark), property tax and insurance estimated at 1.1% and 0.5% of the price per year:</p>
    <table class="score-table">
      <tr><td>≈5% down (${usd(S.s5.down)})</td><td>${usdK(S.s5.price)}</td></tr>
      <tr><td>≈10% down (${usd(S.s10.down)})</td><td>${usdK(S.s10.price)}</td></tr>
      <tr><td>≈20% down (${usd(S.s20.down)})</td><td>${usdK(S.s20.price)}</td></tr>
    </table>
    <p>The monthly cost is about ${usd(S.s10.payment)} in every row — the 28/36 cap is what limits you. The down payment decides how much house that budget buys, and at 20% it also drops PMI from the payment.</p>

    <h2>What changes the answer most</h2>
    <p><strong>Debts.</strong> On ${S.art} ${S.short} salary you can carry about ${usd(S.headroom)}/month of non-housing debt before it starts cutting into the housing budget. ${debtsBind
      ? `The benchmark's ${usd(DEBTS)}/month is already past that line — every extra $100/month of payments removes roughly ${PRICE_PER_100} of house, and paying debt off adds it back.`
      : `Stay under that line and debts cost you nothing; cross it and every extra $100/month of payments removes roughly ${PRICE_PER_100} of house.`}</p>
    <p><strong>Rate.</strong> With the same 10%-down benchmark, a ${(RATE - 1).toFixed(2)}% rate supports about ${usdK(S.rLow)} and a ${(RATE + 1).toFixed(2)}% rate about ${usdK(S.rHigh)}. Lender quotes on the same borrower routinely differ by 0.25–0.5%, so shopping at least three lenders is the cheapest rate cut available.</p>
    <p><strong>Location.</strong> The benchmarks assume the ~1.1% national-average property tax. In a 2%+ tax state the same monthly budget buys meaningfully less house; in a low-tax state, more.</p>

    <h2>Every salary, same math</h2>
    <p>Pick your income, or use the <a href="/house-affordability/">main affordability calculator</a> with your exact numbers:</p>
    ${chipsHtml(S.k)}
    <p>Financing is the other half of the answer — see <a href="/house-affordability/#by-credit-score">what your credit score qualifies you for</a>, from 500 to 800.</p>
  </div>
  <div class="faq-section">
    <h2 class="faq-title">Common Questions</h2>
    ${faqs.map(([q, a]) => `<div class="faq-item">
      <div class="faq-q">${q}</div>
      <div class="faq-a">${a}</div>
    </div>`).join('\n    ')}
  </div>
</div>

<footer>`;

  let html = base;
  html = replaceOnce(html, '<title>How Much House Can I Afford? | VestlyFi</title>', `<title>${title}</title>`);
  html = replaceOnce(html,
    '<meta name="description" content="Find out how much house you can afford based on your income, debts, and down payment. See your max home price, monthly payment, and debt-to-income ratio instantly.">',
    `<meta name="description" content="${desc}">`);
  html = replaceOnce(html, '<link rel="canonical" href="https://vestlyfi.com/house-affordability/">', `<link rel="canonical" href="${url}">`);
  html = replaceOnce(html, '<meta property="og:url" content="https://vestlyfi.com/house-affordability/">', `<meta property="og:url" content="${url}">`);
  html = replaceOnce(html, '<meta property="og:title" content="How Much House Can I Afford? | VestlyFi">', `<meta property="og:title" content="${title}">`);
  html = replaceOnce(html,
    '<meta property="og:description" content="Find out how much house you can afford based on your income, debts, and down payment. See your max home price, monthly payment, and debt-to-income ratio instantly.">',
    `<meta property="og:description" content="${desc}">`);
  html = replaceOnce(html, '<meta name="twitter:title" content="How Much House Can I Afford? | VestlyFi">', `<meta name="twitter:title" content="${title}">`);
  html = replaceOnce(html,
    '<meta name="twitter:description" content="Find out how much house you can afford based on your income, debts, and down payment. See your max home price, monthly payment, and debt-to-income ratio instantly.">',
    `<meta name="twitter:description" content="${desc}">`);

  // Swap the FAQPage JSON-LD block.
  const ldStart = html.indexOf('<script type="application/ld+json">');
  const ldEnd = html.indexOf('</script>', ldStart);
  if (ldStart === -1 || ldEnd === -1) throw new Error('JSON-LD block not found');
  html = html.slice(0, ldStart) + `<script type="application/ld+json">\n${faqLd}\n` + html.slice(ldEnd);

  html = replaceOnce(html, '</style>', EXTRA_CSS + '</style>');
  html = replaceOnce(html, '<div class="page-tag">Home Affordability</div>',
    `<div class="page-tag"><a href="/house-affordability/" style="color:inherit;text-decoration:none;">Home Affordability</a> · ${S.short} Salary</div>`);
  html = replaceOnce(html, '<h1>How much house can <em>you afford?</em></h1>',
    `<h1>How much house can you afford on ${S.art} <em>${S.short} salary?</em></h1>`);
  html = replaceOnce(html,
    '<p class="sub">Banks approve loans based on your debt-to-income ratio. This calculator shows what they\'ll offer — and what you can actually live comfortably with.</p>',
    `<p class="sub">${sub}</p>`);
  html = replaceOnce(html,
    '<input type="text" id="grossIncome" class="has-prefix" oninput="fmtComma(this); checkBtn()">',
    `<input type="text" id="grossIncome" class="has-prefix" oninput="fmtComma(this); checkBtn()" value="${salary.toLocaleString('en-US')}">`);
  html = replaceOnce(html,
    '<input type="number" id="mortgageRate" min="1" max="20" step="0.1" class="has-suffix" oninput="checkBtn()" value="6">',
    `<input type="number" id="mortgageRate" min="1" max="20" step="0.01" class="has-suffix" oninput="checkBtn()" value="${RATE.toFixed(2)}">`);

  // Replace the whole SEO section (through the <footer> open tag).
  const seoStart = html.indexOf('<!-- SEO CONTENT -->');
  const footerStart = html.indexOf('<footer>', seoStart);
  if (seoStart === -1 || footerStart === -1) throw new Error('SEO section bounds not found');
  html = html.slice(0, seoStart) + seoSection + html.slice(footerStart + '<footer>'.length);

  return html;
}

// ── Hub + sitemap injection (idempotent) ─────────────────────────────────────

function hubBand() {
  const chips = SALARIES_K.map(k =>
    `<a href="/house-affordability/${k}k-salary/">$${k}k</a>`).join('');
  return `<!-- income-pages:start -->
${BAND_CSS}
<div class="link-band" id="by-salary">
  <h2>How much house can you afford on your salary?</h2>
  <p>Worked examples for every income from $30k to $300k — your monthly budget under the 28/36 rule and the home price it supports at three down payments:</p>
  <div class="band-chips">${chips}</div>
</div>
<!-- income-pages:end -->
`;
}

function updateHub() {
  const hub = fs.readFileSync(HUB_PATH, 'utf8');
  fs.writeFileSync(HUB_PATH, upsertBlock(hub, 'income-pages', hubBand()));
}

function updateSitemap() {
  let sm = fs.readFileSync(SITEMAP_PATH, 'utf8');
  let added = 0;
  for (const k of SALARIES_K) {
    const loc = `https://vestlyfi.com/house-affordability/${k}k-salary/`;
    if (sm.includes(`<loc>${loc}</loc>`)) continue;
    const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    sm = sm.replace('</urlset>', entry + '</urlset>');
    added++;
  }
  fs.writeFileSync(SITEMAP_PATH, sm);
  return added;
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Strip all injected hub blocks so salary pages never inherit them.
const base = stripBlocks(fs.readFileSync(HUB_PATH, 'utf8'));

for (const k of SALARIES_K) {
  const dir = path.join(ROOT, 'house-affordability', `${k}k-salary`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildPage(base, k * 1000));
}
console.log(`Generated ${SALARIES_K.length} salary pages.`);

updateHub();
console.log('Hub page: by-salary link band upserted.');

const added = updateSitemap();
console.log(`Sitemap: ${added} new URLs added.`);
