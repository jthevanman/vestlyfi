/**
 * Lightweight programmatic page template. Renders a full standalone
 * index.html that reuses VestlyFi's design tokens but a single-column,
 * utility-tier layout (no hero animation, no charts, one client component).
 */
import { SITE } from './copy.mjs';

const GA_ID = 'G-NPZ7QVQQNS';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// JSON-LD safe: prevent </script> breakout.
const jsonld = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');

const CSS = `
:root{
  --navy:#0a0f1e;--navy-mid:#111827;--navy-light:#1a2540;--navy-card:#141d35;
  --gold:#c9a84c;--gold-light:#e8c97a;--gold-dim:rgba(201,168,76,0.13);
  --cream:#f5f0e8;--cream-dim:rgba(245,240,232,0.6);--muted:rgba(245,240,232,0.35);
  --green:#4ade80;--red:#f87171;--amber:#fbbf24;--blue:#60a5fa;
  --border:rgba(201,168,76,0.15);--border-soft:rgba(255,255,255,0.07);
}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--navy);color:var(--cream);font-family:'Outfit',sans-serif;font-weight:300;min-height:100vh;}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 80% 60% at 20% 10%,rgba(201,168,76,0.06) 0%,transparent 60%);pointer-events:none;z-index:0;}
.site-nav{position:sticky;top:0;z-index:50;padding:0 40px;height:64px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-soft);background:rgba(10,15,30,0.85);backdrop-filter:blur(12px);}
.site-nav-logo{font-family:'Exo 2',sans-serif;font-size:1.25rem;color:var(--gold);text-decoration:none;transition:opacity .15s;letter-spacing:0.01em;}
.site-nav-logo:hover{opacity:.8;}
.site-nav-links{display:flex;gap:24px;align-items:center;}
.site-nav-links a{color:var(--muted);text-decoration:none;font-size:0.83rem;transition:color .15s;}
.site-nav-links a:hover{color:var(--cream);}
.site-nav-links a.active{color:var(--cream);}
@media(max-width:600px){.site-nav-links{display:none;}.site-nav{padding:0 20px;}}
.page{position:relative;z-index:1;max-width:720px;margin:0 auto;padding:32px 24px 80px;}
.crumbs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:0.74rem;color:var(--muted);margin-bottom:28px;}
.crumbs a{color:var(--muted);text-decoration:none;transition:color .15s;}
.crumbs a:hover{color:var(--gold);}
.crumbs .sep{opacity:.4;}
.crumbs .current{color:var(--cream-dim);}
.page-tag{font-size:0.68rem;letter-spacing:0.17em;text-transform:uppercase;color:var(--gold);margin-bottom:12px;font-weight:500;}
.page h1{font-family:'Outfit',sans-serif;font-size:clamp(1.7rem,4.6vw,2.4rem);font-weight:400;line-height:1.22;margin-bottom:14px;}
.intro{color:var(--cream-dim);font-size:0.93rem;line-height:1.75;margin-bottom:34px;}
.calc-panel{background:var(--navy-light);border:1px solid var(--border-soft);border-radius:16px;padding:26px;margin-bottom:26px;}
.panel-section-title{font-size:0.68rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--gold);margin-bottom:16px;font-weight:500;}
.divider{height:1px;background:var(--border-soft);margin:22px 0;}
.input-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:end;}
@media(max-width:480px){.input-grid{grid-template-columns:1fr;}}
.input-group{display:flex;flex-direction:column;justify-content:flex-end;}
.input-group label{display:block;font-size:0.73rem;letter-spacing:0.09em;text-transform:uppercase;color:var(--cream-dim);margin-bottom:8px;font-weight:500;}
.input-hint{font-size:0.72rem;color:var(--muted);text-transform:none;letter-spacing:0;font-weight:300;margin-left:4px;}
.input-wrap{position:relative;display:flex;align-items:center;}
.input-prefix{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--gold);font-size:0.9rem;pointer-events:none;font-family:'Outfit',sans-serif;z-index:1;}
input[type="text"],input[type="number"],select{width:100%;background:var(--navy-card);border:1px solid var(--border-soft);border-radius:9px;padding:12px 14px;color:var(--cream);font-family:'Outfit',sans-serif;font-size:0.93rem;font-weight:300;outline:none;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none;appearance:none;}
input:focus,select:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,168,76,0.1);}
input.has-prefix{padding-left:30px;}
input::-webkit-outer-spin-button,input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
select option{background:#111827;}
.calc-btn{width:100%;margin-top:22px;padding:14px;background:linear-gradient(135deg,var(--gold),var(--gold-light));border:none;border-radius:10px;color:var(--navy);font-family:'Outfit',sans-serif;font-weight:500;font-size:0.95rem;cursor:pointer;box-shadow:0 4px 20px rgba(201,168,76,0.28);transition:transform .15s,box-shadow .2s;}
.calc-btn:hover{transform:translateY(-1px);box-shadow:0 6px 26px rgba(201,168,76,0.42);}
.results{display:none;margin-bottom:26px;}
.results.visible{display:block;animation:fadeUp .4s cubic-bezier(.4,0,.2,1) forwards;}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
.result-banner{border-radius:14px;padding:26px;text-align:center;margin-bottom:22px;background:linear-gradient(135deg,rgba(201,168,76,0.08),rgba(201,168,76,0.03));border:1px solid var(--border);}
.result-total{font-family:'Outfit',sans-serif;font-size:clamp(2.2rem,7vw,3.4rem);font-weight:600;line-height:1;color:var(--gold-light);margin-bottom:6px;}
.result-label{font-size:0.85rem;color:var(--cream-dim);}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;}
@media(max-width:460px){.stat-grid{grid-template-columns:1fr;}}
.stat-card{background:var(--navy-light);border:1px solid var(--border-soft);border-radius:12px;padding:16px 18px;}
.stat-label{font-size:0.66rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;font-weight:500;}
.stat-val{font-family:'Outfit',sans-serif;font-size:1.3rem;font-weight:600;}
.stat-val.gold{color:var(--gold-light);}.stat-val.blue{color:var(--blue);}.stat-val.green{color:var(--green);}
.stat-note{font-size:0.72rem;color:var(--muted);margin-top:3px;}
.sched{width:100%;border-collapse:collapse;background:var(--navy-light);border:1px solid var(--border-soft);border-radius:12px;overflow:hidden;margin-bottom:20px;}
.sched th,.sched td{padding:12px 14px;text-align:right;font-size:0.85rem;}
.sched th{font-size:0.64rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border-soft);}
.sched th:first-child,.sched td:first-child{text-align:left;}
.sched td{border-bottom:1px solid var(--border-soft);color:var(--cream-dim);}
.sched tr:last-child td{border-bottom:none;font-weight:500;color:var(--cream);}
.sched .qlabel{color:var(--gold-light);font-weight:500;}
.note-card{background:var(--gold-dim);border:1px solid var(--border);border-radius:12px;padding:16px 18px;font-size:0.83rem;line-height:1.65;color:var(--cream-dim);margin-bottom:6px;}
.note-card strong{color:var(--gold-light);font-weight:500;}
.btn-recalc{width:100%;padding:12px;background:transparent;border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:var(--muted);font-family:'Outfit',sans-serif;font-size:0.82rem;cursor:pointer;transition:all .18s;margin-top:14px;}
.btn-recalc:hover{border-color:rgba(255,255,255,0.2);color:var(--cream-dim);}
.section{margin:44px 0;}
.section h2{font-size:1.15rem;font-weight:400;color:var(--cream);margin-bottom:16px;}
.section p{font-size:0.92rem;color:var(--muted);line-height:1.8;margin-bottom:14px;}
.section p a{color:var(--gold-light);text-decoration:none;border-bottom:1px solid var(--border);}
.section p a:hover{color:var(--gold);}
.faq-item{border-top:1px solid var(--border-soft);padding:18px 0;}
.faq-item:last-child{border-bottom:1px solid var(--border-soft);}
.faq-q{font-size:0.92rem;font-weight:500;color:var(--cream);margin-bottom:8px;line-height:1.5;}
.faq-a{font-size:0.87rem;color:var(--muted);line-height:1.75;}
.related{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
@media(max-width:520px){.related{grid-template-columns:1fr;}}
.related-card{display:block;background:var(--navy-light);border:1px solid var(--border-soft);border-radius:12px;padding:16px 18px;text-decoration:none;transition:all .18s;}
.related-card:hover{border-color:var(--gold);transform:translateY(-1px);}
.related-card .rc-title{font-size:0.9rem;color:var(--gold-light);font-weight:500;margin-bottom:4px;}
.related-card .rc-hook{font-size:0.78rem;color:var(--muted);line-height:1.5;}
.related-group-label{font-size:0.66rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);margin:22px 0 12px;font-weight:500;}
.state-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:8px;}
.state-grid a{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;background:var(--navy-light);border:1px solid var(--border-soft);border-radius:9px;color:var(--cream-dim);text-decoration:none;font-size:0.83rem;transition:all .15s;}
.state-grid a:hover{border-color:var(--gold);color:var(--cream);}
.state-grid a .ab{font-size:0.66rem;color:var(--muted);letter-spacing:0.06em;}
.disclaimer{font-size:0.72rem;color:rgba(245,240,232,0.28);line-height:1.7;margin-top:40px;padding-top:20px;border-top:1px solid var(--border-soft);}
footer{position:relative;z-index:1;border-top:1px solid var(--border-soft);padding:20px 40px;display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;color:var(--muted);}
.footer-links{display:flex;gap:18px;align-items:center;}
.footer-links a{color:var(--muted);text-decoration:none;font-size:0.75rem;transition:color .15s;}
.footer-links a:hover{color:var(--gold);}
@media(max-width:600px){footer{padding:20px;}.page{padding:28px 20px 60px;}}
`;

function head({ meta, jsonLdBlocks }) {
  const robots = meta.noindex
    ? `<meta name="robots" content="noindex,follow">`
    : `<meta name="robots" content="index,follow">`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
${robots}
<link rel="canonical" href="${esc(meta.canonical)}">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Exo+2:wght@600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(meta.url)}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:site_name" content="VestlyFi">
<meta property="og:image" content="${esc(meta.ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.title)}">
<meta name="twitter:description" content="${esc(meta.description)}">
<meta name="twitter:image" content="${esc(meta.ogImage)}">
${jsonLdBlocks}
<style>${CSS}</style>
</head>
<body>`;
}

const NAV = `<nav class="site-nav">
  <a class="site-nav-logo" href="/">VestlyFi</a>
  <div class="site-nav-links">
    <a href="/">Home</a>
    <a href="/calculators/" class="active">Calculators</a>
    <a href="/create-a-diagram/">Diagrams</a>
    <a href="/net-worth/">Net Worth</a>
    <a href="/account/">Account</a>
  </div>
</nav>`;

const FOOTER = `<footer>
  <span>© 2026 VestlyFi</span>
  <div class="footer-links">
    <a href="/calculators/">Calculators</a>
    <a href="/privacy/">Privacy</a>
  </div>
</footer>`;

function crumbsHtml(items) {
  return `<div class="crumbs">` + items.map((c, i) => {
    const sep = i > 0 ? `<span class="sep">/</span>` : '';
    return sep + (c.href
      ? `<a href="${esc(c.href)}">${esc(c.label)}</a>`
      : `<span class="current">${esc(c.label)}</span>`);
  }).join('') + `</div>`;
}

function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: c.href.startsWith('http') ? c.href : SITE + c.href } : {}),
    })),
  };
}

function faqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function webAppSchema(meta, name) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name,
    url: meta.url,
    description: meta.description,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    provider: { '@type': 'Organization', name: 'VestlyFi', url: SITE + '/' },
  };
}

/** The client-side calculator UI wiring (runs after the inlined engine). */
const CALC_UI = `
(function(){
  var $=function(id){return document.getElementById(id);};
  function parseNum(v){var n=parseFloat(String(v||'').replace(/[^0-9.\\-]/g,''));return isFinite(n)?n:0;}
  function fmtComma(el){var v=el.value.replace(/[^0-9]/g,'');el.value=v?parseInt(v,10).toLocaleString('en-US'):'';}
  function money(n){return '$'+Math.round(n).toLocaleString('en-US');}
  window.__fmtComma=fmtComma;
  function calc(){
    var input={
      selfEmploymentIncome:parseNum($('seIncome').value),
      w2Income:parseNum($('w2Income').value),
      filingStatus:$('filingStatus').value,
      priorYearTax:parseNum($('priorTax').value)
    };
    var r=estimateQuarterly(input,STATE_DATA);
    var hasState=STATE_DATA.hasStateIncomeTax;
    var stateReady=r.stateComputable;
    // banner
    $('rTotal').textContent=money(r.totalAnnual);
    // stats
    var stateStat = !hasState ? '<div class="stat-card"><div class="stat-label">'+STATE_NAME+' State Tax</div><div class="stat-val green">$0</div><div class="stat-note">No state income tax</div></div>'
      : (stateReady ? '<div class="stat-card"><div class="stat-label">'+STATE_NAME+' State Tax</div><div class="stat-val gold">'+money(r.stateIncomeTax)+'</div></div>'
        : '<div class="stat-card"><div class="stat-label">'+STATE_NAME+' State Tax</div><div class="stat-val">—</div><div class="stat-note">Rates pending verification</div></div>');
    $('statGrid').innerHTML=
      '<div class="stat-card"><div class="stat-label">Federal SE Tax</div><div class="stat-val blue">'+money(r.se.seTax)+'</div><div class="stat-note">Social Security + Medicare</div></div>'+
      '<div class="stat-card"><div class="stat-label">Federal Income Tax</div><div class="stat-val blue">'+money(r.federalIncomeTax)+'</div></div>'+
      stateStat+
      '<div class="stat-card"><div class="stat-label">Effective Tax Rate</div><div class="stat-val gold">'+(r.effectiveRate*100).toFixed(1)+'%</div><div class="stat-note">of gross income</div></div>';
    // schedule
    var showState = hasState && stateReady;
    var head='<tr><th>Quarter</th><th>Due date</th><th>Federal</th>'+(showState?'<th>'+STATE_ABBR+' State</th>':'')+'<th>Total</th></tr>';
    var rows=r.quarters.map(function(q){
      return '<tr><td class="qlabel">'+q.label+'</td><td>'+q.date+'</td><td>'+money(q.federal)+'</td>'+(showState?'<td>'+money(q.state)+'</td>':'')+'<td>'+money(q.total)+'</td></tr>';
    }).join('');
    $('sched').innerHTML=head+rows;
    // safe harbor
    var sh=r.safeHarbor;
    var shText='<strong>Safe harbor:</strong> To avoid an IRS underpayment penalty, pay at least '+money(sh.target)+' in federal estimates for the year (about '+money(sh.perQuarter)+' per quarter). '+
      (sh.prior!=null?'That is the lesser of 90% of this year\\'s tax and '+Math.round(sh.priorMultiplier*100)+'% of your prior-year tax.':'Enter your prior-year tax for a more precise safe-harbor target.');
    $('safeHarbor').innerHTML=shText;
    $('results').classList.add('visible');
    $('results').scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.__calc=calc;
})();
`;

function calcMarkup(stateName) {
  return `<div class="calc-panel">
  <div class="panel-section-title">Your Income</div>
  <div class="input-grid">
    <div class="input-group">
      <label>Self-Employment / 1099 Income</label>
      <div class="input-wrap"><span class="input-prefix">$</span>
        <input type="text" id="seIncome" class="has-prefix" inputmode="numeric" oninput="window.__fmtComma(this)" placeholder="60,000"></div>
    </div>
    <div class="input-group">
      <label>W-2 Income <span class="input-hint">(optional)</span></label>
      <div class="input-wrap"><span class="input-prefix">$</span>
        <input type="text" id="w2Income" class="has-prefix" inputmode="numeric" oninput="window.__fmtComma(this)" placeholder="0"></div>
    </div>
  </div>
  <div class="divider"></div>
  <div class="input-grid">
    <div class="input-group">
      <label>Filing Status</label>
      <div class="input-wrap"><select id="filingStatus">
        <option value="single">Single</option>
        <option value="married">Married filing jointly</option>
      </select></div>
    </div>
    <div class="input-group">
      <label>Prior-Year Total Tax <span class="input-hint">(optional)</span></label>
      <div class="input-wrap"><span class="input-prefix">$</span>
        <input type="text" id="priorTax" class="has-prefix" inputmode="numeric" oninput="window.__fmtComma(this)" placeholder="0"></div>
    </div>
  </div>
  <button class="calc-btn" onclick="window.__calc()">Estimate My Quarterly Taxes →</button>
</div>

<div class="results" id="results">
  <div class="result-banner">
    <div class="result-total" id="rTotal">$0</div>
    <div class="result-label">Estimated ${esc(stateName)} tax for 2026, split across four quarters</div>
  </div>
  <div class="stat-grid" id="statGrid"></div>
  <div class="panel-section-title">Quarterly Payment Schedule</div>
  <table class="sched" id="sched"></table>
  <div class="note-card" id="safeHarbor"></div>
  <button class="btn-recalc" onclick="document.getElementById('results').classList.remove('visible');window.scrollTo({top:0,behavior:'smooth'})">← Adjust inputs</button>
</div>`;
}

function scriptBlock({ engineSource, stateData, stateName, stateAbbr }) {
  const clean = engineSource.replace(/^export\s+/gm, '');
  return `<script>
(function(){
${clean}
var STATE_DATA=${jsonld(stateData)};
var STATE_NAME=${JSON.stringify(stateName)};
var STATE_ABBR=${JSON.stringify(stateAbbr)};
${CALC_UI}
})();
</script>`;
}

/**
 * Render one state spoke page.
 */
export function renderStatePage({ state, copy, meta, engineSource }) {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Calculators', href: '/calculators/' },
    { label: 'Quarterly Estimated Tax', href: '/calculators/quarterly-tax/' },
    { label: state.name },
  ];
  const jsonLdBlocks = [
    webAppSchema(meta, `${state.name} Quarterly Estimated Tax Calculator`),
    faqSchema(copy.faqs),
    breadcrumbSchema(crumbs),
  ].map((o) => `<script type="application/ld+json">\n${jsonld(o)}\n</script>`).join('\n');

  const stateDataSlim = {
    hasStateIncomeTax: state.hasStateIncomeTax,
    brackets_single: state.brackets_single,
    brackets_married: state.brackets_married,
    standardDeduction_single: state.standardDeduction_single,
    standardDeduction_married: state.standardDeduction_married,
    quarterlyWeights: state.quarterlyWeights,
  };

  const relatedHtml = `
  <div class="related-group-label">Go up a level</div>
  <div class="related">
    ${copy.related.up.map(linkCard).join('')}
  </div>
  <div class="related-group-label">More money tools</div>
  <div class="related">
    ${copy.related.lateral.map(linkCard).join('')}
  </div>`;

  const agencyLink = state.stateTaxAgencyUrl
    ? ` You can pay online at the <a href="${esc(state.stateTaxAgencyUrl)}" target="_blank" rel="noopener">${esc(state.stateTaxAgencyName)}</a>${state.statePaymentPortalUrl ? ` (<a href="${esc(state.statePaymentPortalUrl)}" target="_blank" rel="noopener">payment portal</a>)` : ''}.`
    : '';

  const body = `${NAV}
<div class="page">
  ${crumbsHtml(crumbs)}
  <div class="page-tag">${esc(copy.tag)}</div>
  <h1>${esc(copy.h1)}</h1>
  <p class="intro">${esc(copy.intro)}</p>

  ${calcMarkup(state.name)}

  <div class="section">
    <h2>${esc(copy.howTitle)}</h2>
    ${copy.howBody.map((p, i) => `<p>${esc(p)}${i === copy.howBody.length - 1 ? agencyLink : ''}</p>`).join('\n    ')}
  </div>

  <div class="section">
    <h2>${esc(state.name)} Estimated Tax FAQ</h2>
    ${copy.faqs.map((f) => `<div class="faq-item"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`).join('\n    ')}
  </div>

  <div class="section">
    <h2>Related calculators</h2>
    ${relatedHtml}
  </div>

  <p class="disclaimer">For educational purposes only — not tax advice. Tax rules change and individual situations vary; confirm figures with a tax professional and the ${esc(state.stateTaxAgencyName || 'IRS')} before filing. State tax data last verified ${esc(state.lastVerified || 'pending')}.</p>
</div>
${FOOTER}
${scriptBlock({ engineSource, stateData: stateDataSlim, stateName: state.name, stateAbbr: state.abbreviation })}
</body>
</html>`;

  return head({ meta, jsonLdBlocks }) + body;
}

/**
 * Render the national hub page (federal-only calculator + 51-link By State grid).
 */
export function renderNationalPage({ meta, engineSource, index, faqs }) {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Calculators', href: '/calculators/' },
    { label: 'Quarterly Estimated Tax' },
  ];
  const jsonLdBlocks = [
    webAppSchema(meta, 'Quarterly Estimated Tax Calculator'),
    faqSchema(faqs),
    breadcrumbSchema(crumbs),
  ].map((o) => `<script type="application/ld+json">\n${jsonld(o)}\n</script>`).join('\n');

  const federalOnly = {
    hasStateIncomeTax: false,
    brackets_single: [], brackets_married: [],
    standardDeduction_single: null, standardDeduction_married: null,
    quarterlyWeights: null,
  };

  const grid = index.map((st) =>
    `<a href="/calculators/quarterly-tax/${st.slug}/"><span>${esc(st.name)}</span><span class="ab">${esc(st.abbreviation)}</span></a>`
  ).join('\n      ');

  const body = `${NAV}
<div class="page">
  ${crumbsHtml(crumbs)}
  <div class="page-tag">Side-Income Tools</div>
  <h1>Quarterly Estimated Tax Calculator (2026)</h1>
  <p class="intro">If you freelance, run a business, or earn 1099 income, the IRS wants its taxes four times a year — not once in April. This calculator estimates your 2026 federal quarterly payments, including self-employment tax and federal income tax, and shows your due dates and safe-harbor targets. Pick your state below to add state income tax to the estimate.</p>

  ${calcMarkup('federal')}

  <div class="section">
    <h2>Find your state</h2>
    <p>State income tax changes what you owe each quarter. Choose your state for a version of this calculator that includes your state's rules, thresholds, and payment portal.</p>
    <div class="state-grid">
      ${grid}
    </div>
  </div>

  <div class="section">
    <h2>Quarterly Estimated Tax FAQ</h2>
    ${faqs.map((f) => `<div class="faq-item"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`).join('\n    ')}
  </div>

  <p class="disclaimer">For educational purposes only — not tax advice. Confirm figures with a tax professional and the IRS before filing.</p>
</div>
${FOOTER}
${scriptBlock({ engineSource, stateData: federalOnly, stateName: 'Federal', stateAbbr: 'US' })}
</body>
</html>`;

  return head({ meta, jsonLdBlocks }) + body;
}

function linkCard(t) {
  return `<a class="related-card" href="${esc(t.href)}"><div class="rc-title">${esc(t.label)}</div><div class="rc-hook">${esc(t.hook)}</div></a>`;
}
