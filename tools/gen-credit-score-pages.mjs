#!/usr/bin/env node
// Generates /house-affordability/{score}-credit-score/ pages for every 10-point
// credit score from 500 to 800, using house-affordability/index.html as the base
// template. Also injects a "by credit score" link section into the hub page and
// adds sitemap entries. Idempotent: safe to re-run after editing the hub page.
//
//   node tools/gen-credit-score-pages.mjs
//
// Structural facts (FHA 500/580 floors, conventional 620, USDA ~640) are stable
// HUD/agency rules. Rates are ESTIMATES (labeled as such on-page) — refresh the
// RATE_ANCHORS below when market rates move materially.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUB_PATH = path.join(ROOT, 'house-affordability', 'index.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const TODAY = new Date().toISOString().slice(0, 10);

const SCORES = [];
for (let s = 500; s <= 800; s += 10) SCORES.push(s);

// Estimated 30-yr fixed rate by score (national-average ballpark, mid-2026).
// Piecewise-linear between anchors. Below 620 assumes FHA pricing.
const RATE_ANCHORS = [
  [500, 7.60], [560, 7.35], [580, 7.25], [600, 7.15], [620, 7.05],
  [640, 6.95], [660, 6.85], [680, 6.75], [700, 6.68], [720, 6.60],
  [740, 6.55], [760, 6.50], [800, 6.45],
];

function rateFor(score) {
  for (let i = 0; i < RATE_ANCHORS.length - 1; i++) {
    const [s0, r0] = RATE_ANCHORS[i];
    const [s1, r1] = RATE_ANCHORS[i + 1];
    if (score >= s0 && score <= s1) {
      return Math.round((r0 + (r1 - r0) * (score - s0) / (s1 - s0)) * 100) / 100;
    }
  }
  return 6.45;
}

// Mirrors the on-page calculator's algorithm exactly (28/36 DTI, tax estimated
// at 1.1%/yr and insurance at 0.5%/yr of an approximated home price), so the
// worked-example numbers match what the live calculator shows for these inputs.
const EXAMPLE = { income: 85000, debts: 400, down: 25000 };

function affordability(ratePct, minDownPct = null) {
  const { income, debts, down } = EXAMPLE;
  const mi = income / 12;
  const r = ratePct / 100 / 12;
  const est = (income * 0.28 / 12 + down * r) / (r + r * 0.015);
  const monthlyTax = est * 0.011 / 12;
  const monthlyIns = est * 0.005 / 12;
  const maxHousing = Math.min(0.28 * mi, 0.36 * mi - debts);
  const availPI = maxHousing - monthlyTax - monthlyIns;
  const f = r / (1 - Math.pow(1 + r, -360));
  let price = (availPI > 0 ? availPI / f : 0) + down;
  let capped = false;
  if (minDownPct && down < price * minDownPct) {
    price = down / minDownPct;
    capped = true;
  }
  const loan = price - down;
  const payment = capped ? loan * f + price * 0.016 / 12 : maxHousing;
  return { price, payment, loan, capped };
}

const rk = n => Math.round(n / 1000) * 1000;
const usd = n => '$' + Math.round(n).toLocaleString('en-US');
const usdK = n => usd(rk(n));

// ── Band content ─────────────────────────────────────────────────────────────

function bandFor(score) {
  if (score < 580) return 'fha10';
  if (score < 620) return 'fha35';
  if (score < 640) return 'convEntry';
  if (score < 660) return 'convUsda';
  if (score < 680) return 'convFair';
  if (score < 700) return 'convGood';
  if (score < 720) return 'primeEntry';
  if (score < 740) return 'prime';
  if (score < 760) return 'primePlus';
  return 'topTier';
}

// Eligibility status per program: ok | warn | no, plus a short note.
function eligibility(score) {
  return [
    ['FHA', score >= 580 ? 'ok' : 'warn',
      score >= 580 ? '3.5% down (580+ minimum)' : '10% down required (500–579)'],
    ['Conventional', score >= 620 ? 'ok' : 'no',
      score >= 740 ? 'best pricing tiers' : score >= 620 ? 'qualifies (620+ minimum)' : 'not until 620'],
    ['VA', score >= 620 ? 'ok' : 'warn',
      score >= 620 ? 'no official floor; you clear typical overlays' : 'no official floor, but most lenders want 580–620'],
    ['USDA', score >= 640 ? 'ok' : score >= 580 ? 'warn' : 'no',
      score >= 640 ? 'automated approval (640+)' : score >= 580 ? 'manual underwriting only' : 'below typical minimums'],
  ];
}

const BANDS = {
  fha10: {
    desc: s => `Yes, you can buy a house with a ${s} credit score — through an FHA loan with 10% down. See which loans you qualify for, typical rates, and calculate your max home price.`,
    sub: `An FHA loan is your main path at this score — with 10% down instead of the usual 3.5%. The calculator below is prefilled with an estimated rate for this score range. Adjust anything.`,
    intro: s => [
      `Yes — you can still buy a house with a ${s} credit score, but your options narrow to essentially one program: FHA. The FHA insures loans down to a 500 score, but between 500 and 579 it requires at least <strong>10% down</strong> instead of the usual 3.5%. Conventional lenders won't consider applications below 620 at all.`,
      `The bigger obstacle is lender overlays. Even though FHA rules allow a ${s} score, many individual lenders set their own minimum at 580 or 620. Expect to shop harder — smaller banks, credit unions, and FHA-specialist mortgage brokers approve in this range far more often than big national lenders.`,
    ],
    loanNotes: `If you're a veteran, VA loans have no official minimum score, though most VA lenders want at least 580. USDA loans typically need 640 for automated approval. For everyone else, FHA with 10% down is the realistic route at this score.`,
    exampleNote: (ex, loan) => `${ex.capped
      ? `Note the down payment cap: with $25,000 down, FHA's 10% minimum limits this buyer to a ${usdK(ex.price)} home even though their income could support more.`
      : `Keep FHA's 10% floor in mind: with $25,000 down, this buyer can't purchase above $250,000 no matter what their income supports — below 580, your down payment sets a hard price ceiling.`} Every extra dollar you save raises that ceiling by ten. Also budget for FHA mortgage insurance: 1.75% upfront plus about 0.55% per year — roughly ${usd(loan * 0.0055 / 12)}/month extra on this loan, not included in the payment above.`,
    improveTip: `The single highest-value move is getting to 580 — it cuts your required down payment from 10% to 3.5%. Fastest levers: dispute any errors on your reports, get current on every account, and pay revolving balances below 30% of their limits. Recent history counts most, so 6–12 clean months moves the needle.`,
    faqCan: s => `Yes, through an FHA loan. FHA allows scores from 500 to 579 with at least 10% down. Conventional loans require 620, so FHA (or VA if you're a veteran) is the realistic path. Many lenders add their own minimums above FHA's, so expect to apply with several — FHA-specialist brokers and credit unions approve in this range most often.`,
  },
  fha35: {
    desc: s => `Yes, you can buy a house with a ${s} credit score — FHA allows just 3.5% down at 580+. See your loan options, typical rates, and calculate your max home price.`,
    sub: `You've cleared FHA's 580 threshold, so 3.5% down is on the table. The calculator below is prefilled with an estimated rate for this score range. Adjust anything.`,
    intro: s => [
      `A ${s} credit score clears the most important line in mortgage lending: FHA's 580 minimum for <strong>3.5% down</strong>. That means you can buy with a much smaller down payment than the 10% required below 580. Conventional loans are still out of reach — they start at 620 — but FHA at this score is a well-worn, realistic path to homeownership.`,
      `Some lenders overlay stricter minimums (600 or 620) on top of FHA's rules, so if one lender declines you, that's not the final word. Mortgage brokers who specialize in FHA can usually place a ${s}-score file with a lender who'll approve it.`,
    ],
    loanNotes: `VA loans (for veterans) work at this score with most lenders. USDA generally wants 640 for automated approval but allows manual underwriting below that. Conventional unlocks at 620 — worth knowing if you're close.`,
    exampleNote: (ex, loan) => `FHA loans carry mortgage insurance: 1.75% of the loan upfront (usually rolled in) plus about 0.55% per year — roughly ${usd(loan * 0.0055 / 12)}/month extra on this loan, not included in the payment above. It's the price of the low down payment and the credit flexibility.`,
    improveTip: `Getting to 620 unlocks conventional loans, and every 20 points beyond that improves pricing. Pay revolving card balances below 30% of limits (below 10% is even better), don't open new accounts before applying, and let clean payment history accumulate.`,
    faqCan: s => `Yes. A ${s} score clears FHA's 580 minimum for a 3.5% down payment, which is the most common path for buyers in this range. Conventional loans require 620, so FHA (or VA for veterans) is where to focus. Some lenders set their own minimum at 600–620 — if one says no, try an FHA-specialist broker.`,
  },
  convEntry: {
    desc: s => `With a ${s} credit score you qualify for both FHA and conventional loans. Compare your options, see typical rates, and calculate how much house you can afford.`,
    sub: `You qualify for both FHA and conventional loans at this score — the right pick depends on down payment and mortgage insurance. Calculator prefilled with an estimated rate; adjust anything.`,
    intro: s => [
      `A ${s} credit score puts you over the 620 line where <strong>conventional loans</strong> open up — but just barely, which means conventional pricing at this score carries the steepest rate adjustments lenders charge. In practice, many ${s}-score buyers still get a better all-in deal from FHA, whose rates are much less credit-sensitive.`,
      `The right answer usually comes down to mortgage insurance math: conventional PMI is expensive at this score but drops off automatically at 20% equity, while FHA's insurance is cheaper monthly but sticks for the life of the loan if you put less than 10% down. Get quotes for both and compare the full monthly payment, not just the rate.`,
    ],
    loanNotes: `VA loans (for veterans) price well at this score. USDA's automated approval typically starts at 640 — close enough to be worth a short score push if you're buying rural.`,
    exampleNote: () => `With less than 20% down on a conventional loan at this score, expect PMI on the higher end — often $55–80 per month per $100,000 borrowed. That's why comparing an FHA quote side-by-side is worth the extra application.`,
    improveTip: `Conventional pricing improves in 20-point steps: 640, 660, 680 each unlock a cheaper tier. Paying card balances below 30% of limits before your credit pull is the fastest realistic bump.`,
    faqCan: s => `Yes, comfortably. At ${s} you qualify for FHA (3.5% down) and you're past the 620 minimum for conventional loans. Conventional rate adjustments are at their steepest in the low 600s, so compare both — FHA often wins on total monthly cost in this range.`,
  },
  convUsda: {
    desc: s => `A ${s} credit score qualifies you for FHA, conventional, and USDA loans. See typical rates and calculate exactly how much house you can afford.`,
    sub: `Every major loan program is open to you at this score. Calculator prefilled with an estimated rate for this range — adjust anything.`,
    intro: s => [
      `At ${s}, every major loan program is available: FHA at 3.5% down, conventional at 620+, VA if you've served, and — new at this level — <strong>USDA automated approval</strong>, which typically starts at 640 and offers zero-down loans on eligible rural and suburban-edge properties.`,
      `Conventional pricing is still mid-tier at this score, so it pays to compare an FHA quote against a conventional one. The crossover point where conventional clearly wins tends to arrive around 680–700, or sooner with a bigger down payment.`,
    ],
    loanNotes: `If you're buying outside a major metro, check USDA property eligibility — zero down with competitive rates is hard to beat, and this score clears the usual 640 automated-underwriting floor.`,
    exampleNote: () => `With less than 20% down on a conventional loan, PMI at this score typically runs $45–65 per month per $100,000 borrowed — meaningful, but it cancels automatically once you reach 20% equity.`,
    improveTip: `Each 20-point tier (660, 680, 700) buys a slightly better rate and cheaper PMI. Keep card utilization under 30%, avoid new credit before applying, and check all three reports for errors.`,
    faqCan: s => `Yes — all major programs are open. A ${s} score qualifies for FHA, conventional, VA (for veterans), and clears the typical 640 floor for USDA automated approval. The choice usually comes down to down payment size and whether the property qualifies for USDA.`,
  },
  convFair: {
    desc: s => `A ${s} credit score gets you approved for every major mortgage type. See the rate you can expect and calculate how much house you can afford.`,
    sub: `Approval is rarely the question at this score — pricing is. Calculator prefilled with an estimated rate for this range; adjust anything.`,
    intro: s => [
      `A ${s} credit score is solidly in "approvable" territory for every major loan program. The question stops being <em>whether</em> you'll get a mortgage and becomes <em>what you'll pay</em> for it: at ${s} you're two pricing tiers below where conventional rates get genuinely good (740+).`,
      `Practically, that means rate shopping matters more than program shopping here. Quotes on the same conventional loan can vary by 0.25–0.5% between lenders for a mid-600s borrower — a bigger spread than higher-score borrowers see.`,
    ],
    loanNotes: `FHA can still edge out conventional at this score if your down payment is small, because FHA rates barely penalize credit. With 10–20% down, conventional usually wins.`,
    exampleNote: () => `PMI with less than 20% down runs moderately at this score — roughly $40–55 per month per $100,000 borrowed — and cancels at 20% equity.`,
    improveTip: `The 680 and 700 tiers are close. Paying revolving balances down below 10% utilization the month before your credit is pulled is the most reliable quick lift.`,
    faqCan: s => `Yes — every major program approves at ${s}: conventional, FHA, VA, and USDA. Focus your energy on rate shopping across at least three lenders, since pricing spreads are widest for mid-600s borrowers.`,
  },
  convGood: {
    desc: s => `A ${s} credit score qualifies you for every mortgage type at decent rates. See what you'll pay and calculate exactly how much house you can afford.`,
    sub: `A good score — every program open, respectable pricing. Calculator prefilled with an estimated rate for this range; adjust anything.`,
    intro: s => [
      `A ${s} credit score is a good score by any lender's definition. Every program is open, conventional pricing is respectable, and PMI costs start looking reasonable. You're one tier below the 700-club pricing and two below the 740+ tier where rates effectively stop improving.`,
      `At this level the biggest lever on your rate isn't your score — it's <strong>shopping lenders</strong>. Studies consistently show borrowers who get 3–5 quotes save thousands over the loan versus taking the first offer.`,
    ],
    loanNotes: `Conventional is usually the default at this score. FHA only tends to win if your down payment is under 5% and you plan to refinance within a few years.`,
    exampleNote: () => `PMI with less than 20% down is moderate here — roughly $35–50 per month per $100,000 borrowed — and drops off automatically at 20% equity.`,
    improveTip: `Crossing 700, then 720, each shaves a bit more off conventional pricing and PMI. Low utilization and zero new accounts in the 90 days before applying is the playbook.`,
    faqCan: s => `Yes, easily. ${s} is a good score — every program approves, and conventional pricing is respectable. Your rate will improve at the 700 and 720 tiers, but lender shopping will likely save you more than score improvement at this point.`,
  },
  primeEntry: {
    desc: s => `A ${s} credit score gets near-prime mortgage rates on every loan type. See what you'll pay and calculate exactly how much house you can afford.`,
    sub: `Near-prime pricing across the board. Calculator prefilled with an estimated rate for this range; adjust anything.`,
    intro: s => [
      `With a ${s} credit score you're in near-prime territory: approved everywhere, priced within about a quarter point of the best conventional rates, and offered reasonable PMI if you put less than 20% down.`,
      `From here, score improvements buy small rate gains — the 720 and 740 tiers each help a little. The bigger wins are a larger down payment (dropping PMI entirely at 20%) and aggressive lender shopping.`,
    ],
    loanNotes: `Conventional is almost always the right product at this score unless a VA benefit applies — VA pricing beats everything when available.`,
    exampleNote: () => `PMI with less than 20% down is cheap-ish at this score — roughly $30–45 per month per $100,000 borrowed.`,
    improveTip: `740 is the score where conventional pricing effectively maxes out. If you're a month or two of paid-down balances away from it, it can be worth a short wait.`,
    faqCan: s => `Yes — ${s} is a near-prime score. You'll be approved by essentially any lender at rates within roughly a quarter point of the best available. Down payment size and lender shopping now matter more than further score gains.`,
  },
  prime: {
    desc: s => `A ${s} credit score earns prime mortgage pricing. See the rate to expect and calculate exactly how much house you can afford.`,
    sub: `Prime pricing — lenders compete for this score. Calculator prefilled with an estimated rate; adjust anything.`,
    intro: s => [
      `A ${s} credit score is prime. Lenders compete for borrowers at this level, conventional rate adjustments are small, and PMI (if you need it) is inexpensive. Your mortgage rate is now determined mostly by the market, your down payment, and how hard you shop.`,
      `One more tier exists above you — 740+ — where conventional pricing fully maxes out, but the difference is small. Don't delay a purchase you're otherwise ready for just to chase it.`,
    ],
    loanNotes: `Conventional wins at this score in nearly every scenario; FHA no longer makes sense unless a specific underwriting quirk (like a recent credit event) applies.`,
    exampleNote: () => `PMI with less than 20% down is inexpensive here — roughly $25–40 per month per $100,000 borrowed — and cancels at 20% equity.`,
    improveTip: `You're 10–20 points from top-tier pricing. If your card utilization is above 10%, paying it down before the credit pull may bump you over 740.`,
    faqCan: s => `Yes — ${s} is a prime score and every lender wants your business. Rates are near the best available; get at least three quotes and make lenders compete, because pricing spread between lenders now exceeds what score gains would earn you.`,
  },
  primePlus: {
    desc: s => `A ${s} credit score earns near-best mortgage rates. See what top-tier pricing looks like and calculate exactly how much house you can afford.`,
    sub: `Near-best pricing — one small tier from the top. Calculator prefilled with an estimated rate; adjust anything.`,
    intro: s => [
      `A ${s} credit score sits in the second-best conventional pricing tier — within roughly a tenth of a point of the best rates on the market. Approval is automatic everywhere; mortgage insurance, if needed, is at its cheapest.`,
      `At this point your score is done doing work. The remaining levers are down payment size, loan term, buying points (or not), and — above all — competing lenders against each other.`,
    ],
    loanNotes: `Conventional, all day. Consider whether a 15- or 20-year term fits your budget — the rate discount versus a 30-year is larger than any credit tier.`,
    exampleNote: () => `PMI with less than 20% down is at its cheapest at this score — roughly $20–35 per month per $100,000 borrowed.`,
    improveTip: `760 unlocks the final tier, but the gain is marginal. Focus on lender competition and closing-cost negotiation instead.`,
    faqCan: s => `Yes — ${s} earns near-best pricing from every lender. The final 760+ tier is worth a hair more, but lender shopping, points, and loan term will move your rate far more than the last few score points.`,
  },
  topTier: {
    desc: s => `A ${s} credit score earns the best mortgage rates available. See top-tier pricing and calculate exactly how much house you can afford.`,
    sub: `Top-tier credit — the best pricing lenders offer. Calculator prefilled with an estimated rate; adjust anything.`,
    intro: s => [
      `A ${s} credit score is top-tier: 760+ earns the best conventional pricing that exists. No lender prices above this level, so a ${s} and an 850 get identical rate sheets. Your credit work is done.`,
      `That makes your remaining decisions purely financial: how much to put down, whether to buy discount points, what term to choose, and which of several competing lenders actually offers the best all-in deal. Spread between lenders — often 0.25% on the same borrower — is now your entire opportunity.`,
    ],
    loanNotes: `Conventional (or VA if eligible — it still beats everything). Jumbo lenders also court 760+ borrowers with their sharpest pricing if you're above conforming loan limits.`,
    exampleNote: () => `If you put less than 20% down, PMI at this score is as cheap as it gets — roughly $20–30 per month per $100,000 borrowed — though at this tier many buyers structure the loan to avoid it entirely.`,
    improveTip: null,
    faqCan: s => `Yes — and at the best rates offered. 760+ is the top conventional pricing tier; nothing above it prices better. Put your energy into comparing at least three lenders and deciding on points and term.`,
  },
};

// ── Page assembly ────────────────────────────────────────────────────────────

function replaceOnce(html, needle, replacement) {
  const i = html.indexOf(needle);
  if (i === -1) throw new Error(`Template needle not found: ${needle.slice(0, 60)}…`);
  return html.slice(0, i) + replacement + html.slice(i + needle.length);
}

const EXTRA_CSS = `
  /* credit-score pages */
  .seo-body h2 { font-size:1.15rem; font-weight:500; margin:32px 0 12px; color:var(--cream); }
  .seo-body a { color:var(--gold-light); }
  .elig-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:18px 0 8px; }
  .elig-card { background:var(--navy-light); border:1px solid var(--border-soft); border-radius:10px; padding:14px; }
  .elig-name { font-size:0.72rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--cream-dim); margin-bottom:6px; font-weight:500; }
  .elig-status { font-size:0.95rem; font-weight:500; margin-bottom:4px; }
  .elig-ok { color:var(--green); } .elig-warn { color:var(--amber); } .elig-no { color:var(--red); }
  .elig-note { font-size:0.74rem; color:var(--muted); line-height:1.5; }
  .score-table { width:100%; border-collapse:collapse; margin:16px 0 10px; font-size:0.88rem; }
  .score-table td { padding:10px 8px; border-bottom:1px solid var(--border-soft); color:var(--cream-dim); }
  .score-table td:last-child { text-align:right; color:var(--cream); font-weight:500; white-space:nowrap; }
  .score-chips { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 6px; }
  .score-chip { padding:7px 12px; border-radius:8px; background:var(--navy-mid); border:1px solid var(--border-soft); color:var(--cream-dim); text-decoration:none; font-size:0.8rem; transition:all .15s; }
  a.score-chip:hover { border-color:var(--gold); color:var(--gold-light); }
  .score-chip.current { background:var(--gold-dim); border-color:var(--gold); color:var(--gold-light); }
`;

function chipsHtml(current) {
  const chips = SCORES.map(s => s === current
    ? `<span class="score-chip current">${s}</span>`
    : `<a class="score-chip" href="/house-affordability/${s}-credit-score/">${s}</a>`
  ).join('');
  return `<div class="score-chips">${chips}</div>`;
}

const ELIG_LABEL = { ok: '✓ Eligible', warn: '◈ Limited', no: '✕ Not yet' };

function buildPage(base, score) {
  const band = BANDS[bandFor(score)];
  const rate = rateFor(score);
  const minDown = score < 580 ? 0.10 : null;
  const ex = affordability(rate, minDown);
  const ex760 = affordability(rateFor(760));
  const delta760 = rk(ex760.price) - rk(ex.price);

  const url = `https://vestlyfi.com/house-affordability/${score}-credit-score/`;
  const title = `How Much House Can I Afford With a ${score} Credit Score? | VestlyFi`;
  const desc = band.desc(score);

  const faqs = [
    [`Can I buy a house with a ${score} credit score?`, band.faqCan(score)],
    [`What kind of mortgage can I get with a ${score} credit score?`,
      eligibility(score).map(([name, st, note]) => `${name}: ${st === 'ok' ? 'yes' : st === 'warn' ? 'limited' : 'no'} — ${note}.`).join(' ')
      + ` These minimums are program rules; individual lenders can set stricter ones.`],
    [`What mortgage rate can I expect with a ${score} credit score?`,
      `Roughly ${rate.toFixed(2)}% on a 30-year fixed as a mid-2026 national estimate, though your actual rate depends on the lender, loan type, down payment, and market conditions on the day you lock. Borrowers in this range see wide pricing spreads between lenders, so compare at least three quotes.`],
    [`How much house can I afford with a ${score} credit score?`,
      `Income and debts matter more than the score itself. As a benchmark: a buyer earning $85,000 a year with $400/month in other debts and $25,000 down could afford roughly ${usdK(ex.price)} at a ${score} score (estimated ${rate.toFixed(2)}% rate)${delta760 > 0 ? `, versus about ${usdK(ex760.price)} with a 760+ score` : ''}. Use the calculator above with your own numbers.`],
  ];
  if (band.improveTip) {
    faqs.push([`How can I improve my credit score before buying?`, band.improveTip.replace(/<[^>]+>/g, '')]);
  }

  const faqLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
    })),
  }, null, 2);

  const eligCards = eligibility(score).map(([name, st, note]) => `
      <div class="elig-card">
        <div class="elig-name">${name}</div>
        <div class="elig-status elig-${st}">${ELIG_LABEL[st]}</div>
        <div class="elig-note">${note}</div>
      </div>`).join('');

  const boostTarget = Math.min(score + 40, 760);
  let boostHtml = '';
  if (score < 760) {
    const boostRate = rateFor(boostTarget);
    const boost = affordability(boostRate, boostTarget < 580 ? 0.10 : null);
    const gain = rk(boost.price) - rk(ex.price);
    boostHtml = `
    <h2>What improving your score would buy you</h2>
    <p>At a <a href="/house-affordability/${boostTarget}-credit-score/">${boostTarget} score</a> (estimated ${boostRate.toFixed(2)}%), the same buyer could afford about <strong>${usdK(boost.price)}</strong>${gain > 0 ? ` — ${usd(gain)} more house for the same income and monthly budget` : ''}. ${band.improveTip}</p>`;
  }

  const seoSection = `<!-- SEO CONTENT -->
<div class="seo-section">
  <div class="seo-body">
    ${band.intro(score).map(p => `<p>${p}</p>`).join('\n    ')}

    <h2>What loans can you get with a ${score} credit score?</h2>
    <div class="elig-grid">${eligCards}
    </div>
    <p>${band.loanNotes}</p>

    <h2>The numbers at ${score}: a worked example</h2>
    <p>Take a buyer earning $85,000 a year, with $400/month in existing debt and $25,000 saved for a down payment, on a 30-year loan:</p>
    <table class="score-table">
      <tr><td>Estimated rate at a ${score} score</td><td>${rate.toFixed(2)}%</td></tr>
      <tr><td>Max home price (bank approval estimate)</td><td>${usdK(ex.price)}</td></tr>
      <tr><td>Estimated monthly payment (P&amp;I + tax + insurance)</td><td>${usd(Math.round(ex.payment / 10) * 10)}/mo</td></tr>
      <tr><td>Same buyer with a 760+ score</td><td>${usdK(ex760.price)}</td></tr>
      ${delta760 > 0 ? `<tr><td>Buying power cost of a ${score} score</td><td>−${usd(delta760)}</td></tr>` : `<tr><td>Buying power cost of a ${score} score</td><td>none — top tier</td></tr>`}
    </table>
    <p>${band.exampleNote(ex, ex.loan)}</p>
${boostHtml}
    <h2>Every credit score, same math</h2>
    <p>Rules and pricing change at 580, 620, 640, and every 20 points beyond. Pick your exact score, or use the <a href="/house-affordability/">main affordability calculator</a> if credit isn't your constraint:</p>
    ${chipsHtml(score)}
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
    `<div class="page-tag"><a href="/house-affordability/" style="color:inherit;text-decoration:none;">Home Affordability</a> · ${score} Credit Score</div>`);
  html = replaceOnce(html, '<h1>How much house can <em>you afford?</em></h1>',
    `<h1>How much house can you afford with a <em>${score} credit score?</em></h1>`);
  html = replaceOnce(html,
    '<p class="sub">Banks approve loans based on your debt-to-income ratio. This calculator shows what they\'ll offer — and what you can actually live comfortably with.</p>',
    `<p class="sub">${band.sub}</p>`);
  html = replaceOnce(html,
    '<input type="number" id="mortgageRate" min="1" max="20" step="0.1" class="has-suffix" oninput="checkBtn()" value="6">',
    `<input type="number" id="mortgageRate" min="1" max="20" step="0.01" class="has-suffix" oninput="checkBtn()" value="${rate.toFixed(2)}">`);

  // Replace the whole SEO section (through the <footer> open tag).
  const seoStart = html.indexOf('<!-- SEO CONTENT -->');
  const footerStart = html.indexOf('<footer>', seoStart);
  if (seoStart === -1 || footerStart === -1) throw new Error('SEO section bounds not found');
  html = html.slice(0, seoStart) + seoSection + html.slice(footerStart + '<footer>'.length);

  if (score === 800) {
    html = html.replace(/\b(a|A) (<em>)?800\b/g, (_, a, em) => `${a}n ${em || ''}800`);
  }

  return html;
}

// ── Hub + sitemap injection (idempotent) ─────────────────────────────────────

const HUB_START = '<!-- credit-score-pages:start -->';
const HUB_END = '<!-- credit-score-pages:end -->';

// The credit-score pages are intentionally NOT linked from the hub (or any
// user-facing navigation). They are search-landing pages only: discovered via
// sitemap.xml and the cross-links the score pages carry between themselves.
// This function strips any previously injected hub link block.
function updateHub() {
  let hub = fs.readFileSync(HUB_PATH, 'utf8');
  if (!hub.includes(HUB_START)) return false;
  const s = hub.indexOf(HUB_START);
  const e = hub.indexOf(HUB_END) + HUB_END.length;
  hub = hub.slice(0, s) + hub.slice(e).replace(/^\s*\n/, '');
  fs.writeFileSync(HUB_PATH, hub);
  return true;
}

function updateSitemap() {
  let sm = fs.readFileSync(SITEMAP_PATH, 'utf8');
  let added = 0;
  for (const score of SCORES) {
    const loc = `https://vestlyfi.com/house-affordability/${score}-credit-score/`;
    if (sm.includes(`<loc>${loc}</loc>`)) continue;
    const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    sm = sm.replace('</urlset>', entry + '</urlset>');
    added++;
  }
  fs.writeFileSync(SITEMAP_PATH, sm);
  return added;
}

// ── Main ─────────────────────────────────────────────────────────────────────

let base = fs.readFileSync(HUB_PATH, 'utf8');
// Strip any previously injected hub block so score pages never inherit it.
if (base.includes(HUB_START)) {
  const s = base.indexOf(HUB_START);
  const e = base.indexOf(HUB_END) + HUB_END.length;
  base = base.slice(0, s) + base.slice(e).replace(/^\s*\n/, '');
}

for (const score of SCORES) {
  const dir = path.join(ROOT, 'house-affordability', `${score}-credit-score`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildPage(base, score));
}
console.log(`Generated ${SCORES.length} credit-score pages.`);

console.log(updateHub()
  ? 'Hub page link section removed (score pages are sitemap-only by design).'
  : 'Hub page clean — no score-page links present.');

const added = updateSitemap();
console.log(`Sitemap: ${added} new URLs added.`);
