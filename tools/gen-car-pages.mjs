#!/usr/bin/env node
// Generates the car-affordability cluster: /car-affordability/ (hub calculator)
// plus /car-affordability/{score}-credit-score/ for every 10-point score from
// 500 to 800. Mirrors the house-affordability playbook: real calculator, one
// worked-example page per score, tier-priced APR prefills.
//
//   node tools/gen-car-pages.mjs
//
// APR data: Experian State of the Automotive Finance Market tier averages
// (Q3 2025 / Q1 2026, cross-checked against Bankrate 2026-07-14). Published
// tier averages appear verbatim in the on-page table; per-score prefills are
// ESTIMATES interpolated between tier midpoints and labeled as such. Refresh
// TIER_TABLE and the anchors when Experian publishes new quarters.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { head, NAV, FOOTER, crumbsHtml, breadcrumbSchema, faqSchema, webAppSchema, esc, jsonld } from './lib/template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_ROOT = join(ROOT, 'car-affordability');
const SITEMAP_PATH = join(ROOT, 'sitemap.xml');
const SITE = 'https://vestlyfi.com';
const TODAY = new Date().toISOString().slice(0, 10);

const SCORES = [];
for (let s = 500; s <= 800; s += 10) SCORES.push(s);

// ── Rate data ────────────────────────────────────────────────────────────────

// Experian tier averages (VantageScore 4.0), shown verbatim on-page.
const TIER_TABLE = [
  { key: 'superPrime', name: 'Super prime', range: '781-850', newApr: 4.6, usedApr: 6.8 },
  { key: 'prime', name: 'Prime', range: '661-780', newApr: 6.3, usedApr: 9.4 },
  { key: 'nearPrime', name: 'Near prime', range: '601-660', newApr: 9.6, usedApr: 14.2 },
  { key: 'sub', name: 'Subprime', range: '501-600', newApr: 13.3, usedApr: 19.4 },
  { key: 'deepSub', name: 'Deep subprime', range: '300-500', newApr: 16.0, usedApr: 21.8 },
];

function tierFor(score) {
  if (score <= 500) return TIER_TABLE[4];
  if (score <= 600) return TIER_TABLE[3];
  if (score <= 660) return TIER_TABLE[2];
  if (score <= 780) return TIER_TABLE[1];
  return TIER_TABLE[0];
}

// Per-score estimates: piecewise-linear between tier midpoints, so pages
// within a tier differ the way real risk-based pricing does. Anchors hit the
// published tier averages at each tier's midpoint.
const NEW_ANCHORS = [[500, 16.0], [550, 13.3], [630, 9.6], [720, 6.3], [790, 4.7], [800, 4.6]];
const USED_ANCHORS = [[500, 21.8], [550, 19.4], [630, 14.2], [720, 9.4], [790, 7.0], [800, 6.8]];

function lerp(anchors, score) {
  for (let i = 0; i < anchors.length - 1; i++) {
    const [s0, r0] = anchors[i];
    const [s1, r1] = anchors[i + 1];
    if (score >= s0 && score <= s1) {
      return Math.round((r0 + (r1 - r0) * (score - s0) / (s1 - s0)) * 100) / 100;
    }
  }
  return anchors[anchors.length - 1][1];
}
const estNew = (s) => lerp(NEW_ANCHORS, s);
const estUsed = (s) => lerp(USED_ANCHORS, s);

// ── Affordability math ───────────────────────────────────────────────────────
// Mirrors the client-side calculator exactly (payment share of take-home pay,
// amortized loan, taxes and fees at TAX_FEES of sticker), so worked-example
// numbers match what the live calculator shows for the same inputs.

const TAX_FEES = 0.09; // combined sales tax + title/registration/doc estimate
const EXAMPLE = { takeHome: 4500, down: 3000, trade: 0, term: 60 };

function affordCar(apr, share = 0.10, ex = EXAMPLE) {
  const payment = ex.takeHome * share;
  const r = apr / 100 / 12;
  const f = r / (1 - Math.pow(1 + r, -ex.term));
  const loan = payment / f;
  const otd = loan + ex.down + ex.trade;      // out-the-door budget
  const sticker = otd / (1 + TAX_FEES);        // sticker price supporting it
  const interest = payment * ex.term - loan;
  return { payment, loan, otd, sticker, interest };
}

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const usdK = (n) => '$' + (Math.round(n / 100) * 100).toLocaleString('en-US');

// ── Tier content bands ───────────────────────────────────────────────────────

const BANDS = {
  deepSub: {
    desc: (s) => `A ${s} credit score means deep-subprime car loan rates (about 16% on new). See realistic approval paths and calculate what payment your budget supports.`,
    intro: (s) => [
      `A ${s} credit score sits at the top edge of Experian's deep-subprime tier, the most expensive money in consumer lending. Approval is still possible, but the average new-car rate near this score runs around ${estNew(s)}%, and used-car loans average over 21%. On a long loan, interest at these rates can rival the price of the car itself.`,
      `The playbook at ${s}: bring the biggest down payment you can, keep the loan short, and get quotes from a credit union before any dealership. Be especially wary of buy-here-pay-here lots; their convenience prices in rates and repossession terms that make a bad situation worse. A co-signer with good credit changes everything if you have one available.`,
    ],
    exampleNote: `At these rates the term length is the whole game: stretching to 72 months barely raises what you can afford but roughly doubles the interest you pay. Keep it short, even if that means a cheaper car.`,
    improveTip: `Every tier boundary you cross is a big rate cut: 601 drops the average new-car rate to about 9.6% and 661 drops it to about 6.3%. Six months of on-time payments and lower card balances can move a score in this range faster than at any other level.`,
    faqCan: (s) => `Yes, but expect deep-subprime terms: roughly 16% on new cars and 21% or more on used. Credit unions and co-signers are the two best levers. A larger down payment improves both your approval odds and your rate.`,
  },
  sub: {
    desc: (s) => `A ${s} credit score gets subprime car loan rates (about 13% on new, 19% used). See what that means for your budget and calculate your max car price.`,
    intro: (s) => [
      `A ${s} credit score lands in Experian's subprime tier (501-600), where approvals are routine but pricing is steep: the average new-car loan near this score runs about ${estNew(s)}% and used-car loans average about ${estUsed(s)}%. Lenders will say yes; the question is what the yes costs.`,
      `Two things matter most at ${s}. First, where you apply: credit unions consistently beat dealer-arranged subprime financing, sometimes by several points. Second, the 601 line: crossing into near-prime cuts the average new-car rate from about 13% to under 10%, one of the largest single-boundary drops on the whole scale.`,
    ],
    exampleNote: `A bigger down payment does double duty in this tier: it shrinks the loan and it improves the rate lenders offer, because their loss exposure drops. Even an extra $1,000 down moves both numbers.`,
    improveTip: `The 601 boundary is worth chasing before you buy if you are close: it cuts roughly 3.7 points off the average new-car rate. Pay revolving balances below 30% of their limits and let a few clean months accumulate.`,
    faqCan: (s) => `Yes. Subprime approvals are routine, at average rates around 13% for new cars and 19% for used. Apply at a credit union first, bring as much down payment as you can, and if your score is near 600, consider waiting to cross 601 into near-prime pricing.`,
  },
  nearPrime: {
    desc: (s) => `A ${s} credit score gets near-prime car loan rates (about 10% new, 14% used). Calculate what monthly payment and car price your budget supports.`,
    intro: (s) => [
      `A ${s} credit score puts you in Experian's near-prime tier (601-660): mainstream lenders approve this range every day, and the average new-car loan near this score prices around ${estNew(s)}%, with used cars around ${estUsed(s)}%. You are past the expensive part of the curve but not yet at the pricing lenders advertise.`,
      `The number to know at ${s} is 661. Crossing into the prime tier cuts the average new-car rate by about a third. If you are within 20 or 30 points, a couple of months of low card balances before your application can genuinely change your quote.`,
    ],
    exampleNote: `Near-prime is where rate shopping starts paying real money: quotes on the same borrower can vary by 2 points or more between lenders. Get at least three, and let the dealer beat your credit-union offer instead of anchoring on theirs.`,
    improveTip: `Prime pricing starts at 661. Below-30% card utilization and no new credit applications in the 90 days before you apply are the fastest levers at this level.`,
    faqCan: (s) => `Yes, easily. Near-prime borrowers are approved by mainstream lenders at average rates around 10% for new cars and 14% for used. If you are within reach of 661, improving first is worth real money; otherwise focus on comparing at least three loan offers.`,
  },
  prime: {
    desc: (s) => `A ${s} credit score earns prime car loan rates (about 6-8% new). See what you qualify for and calculate exactly how much car you can afford.`,
    intro: (s) => [
      `A ${s} credit score is prime territory (Experian's 661-780 tier), where the average new-car loan prices around ${estNew(s)}% and used cars around ${estUsed(s)}%. Approval is not in question anywhere; your job is extracting the best offer, because pricing inside this wide tier still varies with where you sit in it.`,
      `Manufacturer promotional financing (the 0% to 2.9% offers in ads) typically wants the upper end of this band, often 700 to 740 and up. If you qualify, a promo APR usually beats any cash rebate on the math; run both through the calculator to check.`,
    ],
    exampleNote: `At prime rates the biggest budget lever is no longer your score, it is the term: 60 months at a prime rate keeps total interest modest, while 72 or 84 months quietly adds thousands and risks owing more than the car is worth mid-loan.`,
    improveTip: `Super-prime pricing starts at 781. The gain from here is real but modest (roughly 1.7 points on average); lender competition will usually move your rate more than score gains will.`,
    faqCan: (s) => `Yes, everywhere. Prime borrowers average around 6-8% on new cars and 9-10% on used. Compare a credit union, your bank, and dealer financing, and check whether you clear the cutoff for any manufacturer promotional APR before taking a rebate instead.`,
  },
  superPrime: {
    desc: (s) => `A ${s} credit score earns super-prime car loan rates, the best available (about 4.6% new). Calculate exactly how much car your budget supports.`,
    intro: (s) => [
      `A ${s} credit score is super prime (781+), the top of Experian's scale. Average pricing here runs about ${estNew(s)}% on new cars and ${estUsed(s)}% on used, and you clear the bar for essentially every manufacturer promotional offer, including the 0% ones.`,
      `Your credit work is done; the remaining wins are in the deal itself. Negotiate the car's price, not the monthly payment, arrange financing before you walk in so the dealer has to beat it, and decide promo-APR-versus-rebate with arithmetic rather than instinct.`,
    ],
    exampleNote: `With rates this low, financing can beat paying cash if your money earns more invested than the loan costs. That is a real choice at 4.6% in a way it never is at 16%.`,
    improveTip: null,
    faqCan: (s) => `Yes, at the best rates offered: about 4.6% average on new cars, lower with promotional financing. Lenders compete for super-prime borrowers, so make them; a pre-arranged credit-union offer is the strongest negotiating tool on the lot.`,
  },
};

function bandFor(score) {
  if (score <= 500) return BANDS.deepSub;
  if (score <= 600) return BANDS.sub;
  if (score <= 660) return BANDS.nearPrime;
  if (score <= 780) return BANDS.prime;
  return BANDS.superPrime;
}

// ── Shared markup ────────────────────────────────────────────────────────────

const EXTRA_CSS = `<style>
.score-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 6px;}
.score-chips a,.score-chips span{padding:7px 12px;border-radius:8px;background:var(--navy-mid);border:1px solid var(--border-soft);color:var(--cream-dim);text-decoration:none;font-size:0.8rem;transition:all .15s;}
.score-chips a:hover{border-color:var(--gold);color:var(--gold-light);}
.score-chips span{background:var(--gold-dim);border-color:var(--gold);color:var(--gold-light);}
.sched td.hl,.sched .hl td{color:var(--gold-light);font-weight:500;}
.sched tr:last-child td{font-weight:inherit;color:var(--cream-dim);}
.sched tr.hl td{color:var(--gold-light);}
</style>`;

function chipsHtml(current) {
  return `<div class="score-chips">` + SCORES.map((s) => s === current
    ? `<span>${s}</span>`
    : `<a href="/car-affordability/${s}-credit-score/">${s}</a>`
  ).join('') + `</div>`;
}

function tierTableHtml(highlightKey) {
  const rows = TIER_TABLE.map((t) =>
    `<tr${t.key === highlightKey ? ' class="hl"' : ''}><td>${t.name} (${t.range})</td><td>${t.newApr.toFixed(1)}%</td><td>${t.usedApr.toFixed(1)}%</td></tr>`
  ).join('\n      ');
  return `<table class="sched">
      <tr><th>Credit tier</th><th>Avg new-car APR</th><th>Avg used-car APR</th></tr>
      ${rows}
    </table>
    <p>Source: Experian State of the Automotive Finance Market tier averages (latest published quarters). Tier averages flatten a wide range; within a tier, higher scores price better than lower ones, which is what the per-score estimate above reflects.</p>`;
}

function calcMarkup(apr) {
  return `<div class="calc-panel">
  <div class="panel-section-title">Your Budget</div>
  <div class="input-grid">
    <div class="input-group">
      <label>Monthly Take-Home Pay <span class="input-hint">(after tax)</span></label>
      <div class="input-wrap"><span class="input-prefix">$</span>
        <input type="text" id="takeHome" class="has-prefix" inputmode="numeric" oninput="window.__fmtComma(this)" placeholder="4,500"></div>
    </div>
    <div class="input-group">
      <label>Down Payment</label>
      <div class="input-wrap"><span class="input-prefix">$</span>
        <input type="text" id="downPay" class="has-prefix" inputmode="numeric" oninput="window.__fmtComma(this)" placeholder="3,000"></div>
    </div>
  </div>
  <div class="divider"></div>
  <div class="input-grid">
    <div class="input-group">
      <label>Trade-In Value <span class="input-hint">(optional)</span></label>
      <div class="input-wrap"><span class="input-prefix">$</span>
        <input type="text" id="tradeIn" class="has-prefix" inputmode="numeric" oninput="window.__fmtComma(this)" placeholder="0"></div>
    </div>
    <div class="input-group">
      <label>Loan Term</label>
      <div class="input-wrap"><select id="loanTerm">
        <option value="36">36 months</option>
        <option value="48">48 months</option>
        <option value="60" selected>60 months</option>
        <option value="72">72 months</option>
      </select></div>
    </div>
  </div>
  <div class="divider"></div>
  <div class="input-grid">
    <div class="input-group">
      <label>Loan APR <span class="input-hint">(%, editable)</span></label>
      <div class="input-wrap"><input type="text" id="apr" inputmode="decimal" value="${apr.toFixed(2)}"><span class="input-prefix" style="left:auto;right:14px">%</span></div>
    </div>
    <div class="input-group"><label>&nbsp;</label>
      <div class="input-hint" style="padding-top:14px;line-height:1.5">Prefilled with the estimated average for this page. Your quote may differ; use it if you have one.</div>
    </div>
  </div>
  <button class="calc-btn" onclick="window.__calc()">Show My Car Budget →</button>
</div>

<div class="results" id="results">
  <div class="result-banner">
    <div class="result-total" id="rSticker">$0</div>
    <div class="result-label">Comfortable car budget (sticker price, keeping the payment at 10% of take-home)</div>
  </div>
  <div class="stat-grid" id="statGrid"></div>
  <div class="note-card" id="stretchNote"></div>
  <button class="btn-recalc" onclick="document.getElementById('results').classList.remove('visible');window.scrollTo({top:0,behavior:'smooth'})">← Adjust inputs</button>
</div>`;
}

// Client-side calculator. Must mirror affordCar() above.
function scriptBlock(saveSlug) {
  return `<script>
(function(){
  var $=function(id){return document.getElementById(id);};
  function parseNum(v){var n=parseFloat(String(v||'').replace(/[^0-9.\\-]/g,''));return isFinite(n)?n:0;}
  function fmtComma(el){var v=el.value.replace(/[^0-9]/g,'');el.value=v?parseInt(v,10).toLocaleString('en-US'):'';}
  function money(n){return '$'+Math.round(n).toLocaleString('en-US');}
  window.__fmtComma=fmtComma;
  var TAX_FEES=${TAX_FEES};
  function budget(takeHome,down,trade,term,apr,share){
    var payment=takeHome*share;
    var r=apr/100/12;
    var f=r>0?r/(1-Math.pow(1+r,-term)):1/term;
    var loan=payment/f;
    var otd=loan+down+trade;
    return {payment:payment,loan:loan,otd:otd,sticker:otd/(1+TAX_FEES),interest:payment*term-loan};
  }
  function calc(){
    var takeHome=parseNum($('takeHome').value);
    var down=parseNum($('downPay').value);
    var trade=parseNum($('tradeIn').value);
    var term=parseInt($('loanTerm').value,10);
    var apr=parseNum($('apr').value);
    if(!takeHome){$('takeHome').focus();return;}
    var c=budget(takeHome,down,trade,term,apr,0.10);
    var s=budget(takeHome,down,trade,term,apr,0.15);
    $('rSticker').textContent=money(c.sticker);
    $('statGrid').innerHTML=
      '<div class="stat-card"><div class="stat-label">Monthly Payment</div><div class="stat-val gold">'+money(c.payment)+'/mo</div><div class="stat-note">10% of take-home pay</div></div>'+
      '<div class="stat-card"><div class="stat-label">Loan Amount</div><div class="stat-val">'+money(c.loan)+'</div><div class="stat-note">'+term+' months at '+apr.toFixed(2)+'%</div></div>'+
      '<div class="stat-card"><div class="stat-label">Total Interest</div><div class="stat-val blue">'+money(c.interest)+'</div><div class="stat-note">over the life of the loan</div></div>'+
      '<div class="stat-card"><div class="stat-label">Out-the-Door Budget</div><div class="stat-val green">'+money(c.otd)+'</div><div class="stat-note">includes ~9% taxes and fees</div></div>';
    $('stretchNote').innerHTML='<strong>Upper limit:</strong> at 15% of take-home ('+money(s.payment)+'/mo) you could stretch to about '+money(s.sticker)+' sticker. Above that, most budgets feel it. Insurance, fuel, and maintenance come on top of the payment.';
    $('results').classList.add('visible');
    $('results').scrollIntoView({behavior:'smooth',block:'nearest'});
    if(window.VestlySave){VestlySave.capture({
      inputs:{takeHome:takeHome,downPayment:down,tradeIn:trade,termMonths:term,apr:apr},
      outputs:{sticker:Math.round(c.sticker),payment:Math.round(c.payment),loan:Math.round(c.loan),totalInterest:Math.round(c.interest),stretchSticker:Math.round(s.sticker)},
      label:money(c.sticker)+' car budget at '+apr.toFixed(2)+'% APR'
    });}
  }
  window.__calc=calc;
  if(window.VestlySave){
    VestlySave.init({
      calculator:${JSON.stringify(saveSlug)},
      saveAnchor:'.result-banner',
      cardAnchor:'.calc-panel',
      applyInputs:function(inp){
        var setMoney=function(id,v){var el=$(id);if(el)el.value=v?Number(v).toLocaleString('en-US'):'';};
        setMoney('takeHome',inp.takeHome);
        setMoney('downPay',inp.downPayment);
        setMoney('tradeIn',inp.tradeIn);
        if(inp.termMonths)$('loanTerm').value=String(inp.termMonths);
        if(inp.apr!=null)$('apr').value=Number(inp.apr).toFixed(2);
        window.__calc();
      }
    });
  }
})();
</script>`;
}

// ── Pages ────────────────────────────────────────────────────────────────────

function renderHub() {
  const url = `${SITE}/car-affordability/`;
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Calculators', href: '/calculators/' },
    { label: 'Car Affordability' },
  ];
  const meta = {
    title: 'How Much Car Can I Afford? | VestlyFi',
    description: 'Free car affordability calculator. Enter your take-home pay, down payment, and rate; see the car price and monthly payment your budget actually supports.',
    canonical: url, url, ogImage: `${SITE}/og-image.png`, noindex: false,
  };
  const ex = affordCar(6.4);
  const faqs = [
    { q: 'How much car can I afford?', a: `A durable rule: keep the loan payment at or below 10% of your monthly take-home pay, with 15% as a hard ceiling. On $4,500 a month take-home, that is a ${usd(ex.payment)} payment, which supports roughly a ${usdK(ex.sticker)} car at average new-car rates with $3,000 down over 60 months. The calculator above runs your exact numbers.` },
    { q: 'What is the 20/4/10 rule for buying a car?', a: 'Put at least 20% down, finance for no more than 4 years, and keep total transportation costs (payment plus insurance and fuel) under 10% of gross income. It is stricter than most people manage; treat it as the conservative benchmark and our 10%-of-take-home rule as the practical one.' },
    { q: 'What credit score do I need to buy a car?', a: 'There is no minimum; auto lending approves nearly every score at some price. What changes is the rate: super-prime borrowers (781+) average about 4.6% on new cars while deep-subprime borrowers pay around 16%. Pick your score below to see what that means for your budget.' },
    { q: 'Should I buy new or used with my credit score?', a: 'Used-car loans carry meaningfully higher rates at every credit tier (roughly 2 to 6 points more), but the car costs less to begin with. The lower your score, the more the rate gap matters; at subprime rates, a cheaper used car with a short loan usually beats a longer loan on a new one.' },
    { q: 'How do taxes and fees affect what I can afford?', a: 'Sales tax, title, registration, and doc fees typically add about 8 to 10% on top of the sticker price. The calculator reserves 9% for them, which is why the out-the-door budget is higher than the sticker budget it reports.' },
    { q: 'Does a longer loan term let me afford more car?', a: 'Barely, and it costs you twice: total interest climbs steeply, and you spend more of the loan underwater (owing more than the car is worth). Going from 60 to 72 months on a typical loan adds only a few thousand dollars of car but adds most of a year of payments that are mostly interest.' },
  ];
  const jsonLdBlocks = [
    webAppSchema(meta, 'Car Affordability Calculator'),
    faqSchema(faqs),
    breadcrumbSchema(crumbs),
  ].map((o) => `<script type="application/ld+json">\n${jsonld(o)}\n</script>`).join('\n');

  const body = `${NAV}
${EXTRA_CSS}
<div class="page">
  ${crumbsHtml(crumbs)}
  <div class="page-tag">Auto Tools</div>
  <h1>How much car can you afford?</h1>
  <p class="intro">Dealers size the loan to the biggest payment you will accept. This calculator works the other way: it starts from your take-home pay, keeps the payment at a livable 10%, and tells you the sticker price that fits, taxes and fees included. Enter your numbers; adjust anything.</p>

  ${calcMarkup(6.4)}

  <div class="section">
    <h2>How the calculator decides</h2>
    <p>The anchor is your monthly payment, not the car price. We cap it at 10% of take-home pay for the headline number (a level most budgets absorb without strain) and show 15% as the stretch ceiling. From the payment, the term, and the rate, we compute the loan the payment supports, add your down payment and trade-in, and reserve about 9% for sales tax, title, and fees. What is left is the sticker price to shop with.</p>
    <p>Insurance, fuel, and maintenance sit on top of the payment, and they are not small: budget several hundred dollars a month for them before deciding the payment feels comfortable.</p>
  </div>

  <div class="section">
    <h2>Your rate depends on your credit score</h2>
    ${tierTableHtml(null)}
    <p>The difference is not cosmetic. The same $450 payment that buys about ${usdK(affordCar(6.3).sticker)} of car at prime rates buys about ${usdK(affordCar(16.0).sticker)} at deep-subprime rates. Pick your score for the exact numbers, the rates to expect, and what improving would buy you:</p>
    ${chipsHtml(null)}
  </div>

  <div class="section">
    <h2>Car Affordability FAQ</h2>
    ${faqs.map((f) => `<div class="faq-item"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`).join('\n    ')}
  </div>

  <div class="section">
    <p>Sizing the other big purchase too? See <a href="/house-affordability/">how much house you can afford</a>, including <a href="/house-affordability/credit-score-to-buy-a-house/">what credit score you need to buy one</a>.</p>
  </div>

  <p class="disclaimer">Estimates for educational purposes only, not financial advice. Rates are tier averages; your quote depends on the lender, the vehicle, and your full credit file.</p>
</div>
${FOOTER}
${scriptBlock('car-affordability')}
</body>
</html>`;

  return head({ meta, jsonLdBlocks }) + body;
}

function renderScorePage(score) {
  const band = bandFor(score);
  const tier = tierFor(score);
  const apr = estNew(score);
  const url = `${SITE}/car-affordability/${score}-credit-score/`;
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Calculators', href: '/calculators/' },
    { label: 'Car Affordability', href: '/car-affordability/' },
    { label: `${score} Credit Score` },
  ];
  const meta = {
    title: `How Much Car Can I Afford With a ${score} Credit Score? | VestlyFi`,
    description: band.desc(score),
    canonical: url, url, ogImage: `${SITE}/og-image.png`, noindex: false,
  };

  const ex = affordCar(apr);
  const best = affordCar(estNew(800));
  const monthlyCost = Math.round((affordCar(apr).interest - best.interest) / EXAMPLE.term / 5) * 5;

  const faqs = [
    { q: `Can I get a car loan with a ${score} credit score?`, a: band.faqCan(score) },
    { q: `What interest rate can I expect on a car loan with a ${score} credit score?`, a: `Roughly ${apr.toFixed(2)}% on a new car and ${estUsed(score).toFixed(2)}% on a used one, estimated from Experian's ${tier.name.toLowerCase()} tier averages (${tier.newApr.toFixed(1)}% new, ${tier.usedApr.toFixed(1)}% used for scores ${tier.range}). Individual quotes vary widely in this tier, so compare at least three lenders.` },
    { q: `How much car can I afford with a ${score} credit score?`, a: `Your income decides more than the score does. As a benchmark: with $4,500 a month take-home, $3,000 down, and a 60-month loan at an estimated ${apr.toFixed(2)}%, keeping the payment at 10% of take-home supports about a ${usdK(ex.sticker)} car. The same buyer with super-prime credit could afford about ${usdK(best.sticker)}. Use the calculator above with your own numbers.` },
    { q: `Is a ${score} credit score good enough to buy a car?`, a: `Approval is rarely the obstacle at any score; auto lenders price risk rather than decline it. At ${score} the real question is the rate. ${tier.name} pricing applies (scores ${tier.range}), and the calculator shows what that does to your budget.` },
  ];
  if (band.improveTip) faqs.push({ q: 'Should I improve my credit before buying a car?', a: band.improveTip });

  const jsonLdBlocks = [
    webAppSchema(meta, `Car Affordability Calculator (${score} Credit Score)`),
    faqSchema(faqs),
    breadcrumbSchema(crumbs),
  ].map((o) => `<script type="application/ld+json">\n${jsonld(o)}\n</script>`).join('\n');

  const improveHtml = band.improveTip ? `
  <div class="section">
    <h2>What improving your score would buy you</h2>
    <p>${band.improveTip} At super-prime rates the benchmark buyer above affords about <strong>${usdK(best.sticker)}</strong> instead of ${usdK(ex.sticker)}, and pays about ${usd(monthlyCost)}/month less in interest for the same loan size.</p>
  </div>` : '';

  const body = `${NAV}
${EXTRA_CSS}
<div class="page">
  ${crumbsHtml(crumbs)}
  <div class="page-tag"><a href="/car-affordability/" style="color:inherit;text-decoration:none;">Car Affordability</a> · ${score} Credit Score</div>
  <h1>How much car can you afford with a ${score} credit score?</h1>
  <p class="intro">The calculator is prefilled with an estimated ${apr.toFixed(2)}% APR for a new-car loan at a ${score} score (${tier.name.toLowerCase()} tier). Enter your take-home pay and down payment; adjust anything, including the rate if you already have a quote.</p>

  ${calcMarkup(apr)}

  <div class="section">
    <h2>What a ${score} credit score means for a car loan</h2>
    ${band.intro(score).map((p) => `<p>${p}</p>`).join('\n    ')}
  </div>

  <div class="section">
    <h2>Average car loan rates by credit tier</h2>
    ${tierTableHtml(tier.key)}
  </div>

  <div class="section">
    <h2>The numbers at ${score}: a worked example</h2>
    <p>Take a buyer with $4,500 a month in take-home pay, $3,000 down, no trade-in, on a 60-month loan, keeping the payment at 10% of take-home (${usd(ex.payment)}/month):</p>
    <table class="sched">
      <tr><td>Estimated new-car APR at ${score}</td><td>${apr.toFixed(2)}%</td></tr>
      <tr><td>Loan amount the payment supports</td><td>${usd(ex.loan)}</td></tr>
      <tr><td>Car budget (sticker, after ~9% taxes and fees)</td><td>${usdK(ex.sticker)}</td></tr>
      <tr><td>Total interest over 60 months</td><td>${usd(ex.interest)}</td></tr>
      <tr><td>Same buyer with super-prime credit</td><td>${usdK(best.sticker)} (interest ${usd(best.interest)})</td></tr>
    </table>
    <p>${band.exampleNote}</p>
  </div>
${improveHtml}
  <div class="section">
    <h2>Every credit score, same math</h2>
    <p>Rates step down at 601, 661, and 781. Pick your exact score, or use the <a href="/car-affordability/">main car affordability calculator</a> if credit is not your constraint:</p>
    ${chipsHtml(score)}
    <p>Cars are the smaller half of the credit question. See <a href="/house-affordability/${score}-credit-score/">how much house you can afford with a ${score} credit score</a>, and <a href="/house-affordability/credit-score-to-buy-a-house/">what credit score you need to buy a house</a>.</p>
  </div>

  <div class="section">
    <h2>Common Questions</h2>
    ${faqs.map((f) => `<div class="faq-item"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`).join('\n    ')}
  </div>

  <p class="disclaimer">Estimates for educational purposes only, not financial advice. Rates are interpolated from Experian tier averages; your quote depends on the lender, the vehicle, and your full credit file.</p>
</div>
${FOOTER}
${scriptBlock(`car-affordability/${score}-credit-score`)}
</body>
</html>`;

  let html = head({ meta, jsonLdBlocks }) + body;
  if (score === 800) {
    html = html.replace(/\b(a|A) (<em>)?800\b/g, (_, a, em) => `${a}n ${em || ''}800`);
  }
  return html;
}

// ── Sitemap ──────────────────────────────────────────────────────────────────

function updateSitemap() {
  let sm = readFileSync(SITEMAP_PATH, 'utf8');
  let added = 0;
  const entries = [
    { loc: `${SITE}/car-affordability/`, priority: '0.8' },
    ...SCORES.map((s) => ({ loc: `${SITE}/car-affordability/${s}-credit-score/`, priority: '0.7' })),
  ];
  for (const { loc, priority } of entries) {
    if (sm.includes(`<loc>${loc}</loc>`)) continue;
    const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
    sm = sm.replace('</urlset>', entry + '</urlset>');
    added++;
  }
  writeFileSync(SITEMAP_PATH, sm);
  return added;
}

// ── Main ─────────────────────────────────────────────────────────────────────

mkdirSync(OUT_ROOT, { recursive: true });
writeFileSync(join(OUT_ROOT, 'index.html'), renderHub());
for (const score of SCORES) {
  const dir = join(OUT_ROOT, `${score}-credit-score`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderScorePage(score));
}
console.log(`Generated car-affordability hub + ${SCORES.length} score pages.`);
console.log(`Sitemap: ${updateSitemap()} new URLs added.`);
