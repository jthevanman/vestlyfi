/* VestlyFi app menu: the left menu on the signed-in tools (desktop only).
   One file so every page shows the same menu. Usage, inside the page's
   signed-in screen:
     <aside data-vf-nav data-active="budget"></aside>
     <script src="/assets/app-nav.js"></script>
   data-active: dashboard | networth | budget | debts | calculators | coast | retirement | debtpayoff | diagrams
   data-theme="navy" on pages that are still in the old navy theme.
   Hidden at 768px and below, where each page keeps its own phone layout. */
(function () {
  const W = 232;
  const CSS = `
:root { --vf-nav-w:${W}px; }
.vf-shell { display:flex; align-items:flex-start; min-height:100vh; }
.vf-main { flex:1; min-width:0; }
.vf-nav {
  --nv-bg:#0b0b0b; --nv-line:rgba(255,255,255,0.08); --nv-text:#ededed; --nv-item:#b4b4b4; --nv-dim:#8d8d8d;
  --nv-hover:rgba(255,255,255,0.04); --nv-on:#262626; --nv-accent:#dcc392;
  position:sticky; top:0; z-index:40; flex:0 0 var(--vf-nav-w); width:var(--vf-nav-w); height:100vh; overflow-y:auto;
  display:flex; flex-direction:column; padding:0 10px 20px; background:var(--nv-bg); border-right:1px solid var(--nv-line);
  font-family:'Outfit',sans-serif;
}
:root[data-theme="light"] .vf-nav:not(.navy) {
  --nv-bg:#f3f2ef; --nv-line:rgba(0,0,0,0.09); --nv-text:#1b1b1b; --nv-item:#565656; --nv-dim:#7b7b7b;
  --nv-hover:rgba(0,0,0,0.04); --nv-on:#e7e4de; --nv-accent:#1b1b1b;
}
.vf-nav.navy {
  --nv-bg:#0a0f1e; --nv-line:rgba(255,255,255,0.07); --nv-text:#f5f0e8; --nv-item:#b9b6b0; --nv-dim:#7d7c7a;
  --nv-hover:rgba(255,255,255,0.04); --nv-on:#1a2540; --nv-accent:#c9a84c;
}
.vf-nav::-webkit-scrollbar-track { margin:12px 0; }
.vf-brand { display:block; padding:22px 12px 10px; font-family:'Exo 2',sans-serif; font-size:1.15rem; color:var(--nv-accent); text-decoration:none; }
.vf-cap { padding:18px 12px 6px; font-size:0.64rem; letter-spacing:0.12em; text-transform:uppercase; color:var(--nv-dim); }
.vf-item { display:flex; align-items:center; gap:11px; height:38px; padding:0 12px; margin:1px 0; border-radius:999px; color:var(--nv-item); font-size:0.88rem; font-weight:400; text-decoration:none; white-space:nowrap; transition:background .15s, color .15s; }
.vf-item:hover { background:var(--nv-hover); color:var(--nv-text); }
.vf-item[aria-current="page"] { background:var(--nv-on); color:var(--nv-text); font-weight:500; }
.vf-item svg { flex:0 0 auto; width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.vf-item[aria-current="page"] svg { color:var(--nv-accent); }
.vf-badge { margin-left:auto; padding:1px 7px; border:1px solid var(--nv-line); border-radius:20px; font-size:0.56rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--nv-dim); font-weight:500; }
@media (max-width:768px) { .vf-nav { display:none !important; } }
`;
  const I = {
    dashboard:'<rect x="3.5" y="3.5" width="7" height="9" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="15.5" width="7" height="5" rx="2"/>',
    networth:'<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
    budget:'<path d="M18.5 7.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5V9A1.5 1.5 0 0 0 18 7.5H6.5"/><circle cx="15.5" cy="13.5" r="1.2"/>',
    debts:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><line x1="2.5" y1="10" x2="21.5" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
    calculators:'<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><rect x="8" y="5.5" width="8" height="4" rx="1"/><path d="M9 13.5h.01M12 13.5h.01M15 13.5h.01M9 17.5h.01M12 17.5h.01M15 17.5h.01"/>',
    coast:'<path d="M3 18c2 0 2-1.5 4.5-1.5S10 18 12 18s2.5-1.5 4.5-1.5S19 18 21 18"/><path d="M12 3.5v10.5"/><path d="M12 4.5l5.5 8.5H12"/>',
    retirement:'<path d="M3.5 18h17"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 6.5v2M5.8 10l1.4 1.4M18.2 10l-1.4 1.4"/>',
    debtpayoff:'<polyline points="3 7 9 13 13 9 21 17"/><polyline points="15 17 21 17 21 11"/>',
    diagrams:'<circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 12c5 0 5-6 10-6M7 12c5 0 5 6 10 6"/>',
  };
  const NAV = [
    { items:[['dashboard', 'Dashboard', '/dashboard/', 'Beta']] },
    { cap:'Trackers', items:[['networth', 'Net worth', '/net-worth/'], ['budget', 'Budget', '/budget/', 'Beta'], ['debts', 'Debts', '/debt-tracker/']] },
    { cap:'Calculators', items:[['calculators', 'All calculators', '/calculators/'], ['coast', 'Coast FIRE', '/coast-fire/'], ['retirement', 'Retirement', '/retirement/'], ['debtpayoff', 'Debt payoff', '/debt-payoff/'], ['diagrams', 'Diagrams', '/create-a-diagram/']] },
  ];

  if (!document.getElementById('vf-nav-css')) {
    const st = document.createElement('style'); st.id = 'vf-nav-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  document.querySelectorAll('[data-vf-nav]:not(.vf-nav)').forEach(el => {
    const active = el.dataset.active;
    el.classList.add('vf-nav');
    if (el.dataset.theme === 'navy') el.classList.add('navy');
    el.setAttribute('aria-label', 'VestlyFi tools');
    el.innerHTML = '<a class="vf-brand" href="/">VestlyFi</a>' + NAV.map(g =>
      (g.cap ? `<div class="vf-cap">${g.cap}</div>` : '') +
      g.items.map(([key, label, href, badge]) =>
        `<a class="vf-item" href="${href}"${key === active ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${I[key]}</svg><span>${label}</span>${badge ? `<span class="vf-badge">${badge}</span>` : ''}</a>`
      ).join('')
    ).join('');
  });
})();
