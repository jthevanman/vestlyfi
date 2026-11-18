/* VestlyFi app menu: the left menu on the signed-in tools (desktop only).
   One file so every page shows the same menu. Usage, inside the page's
   signed-in screen:
     <aside data-vf-nav data-active="budget"></aside>
     <script src="/assets/app-nav.js"></script>
   data-active: dashboard (shown as Home) | networth | budget | debts
   data-theme="navy" on pages that are still in the old navy theme.
   Hidden at 768px and below, where each page keeps its own phone layout.

   Each tracker has a dropdown of quick actions. They are links with a query
   (?update=1, ?add=spent ...) that the tracker page acts on when it loads.
   If you are already on that page and it defines window.VF_ACTIONS[action],
   the action runs in place instead of reloading. */
(function () {
  const W = 232;
  const OPEN_KEY = 'vf_nav_open';
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
.vf-row { position:relative; display:flex; align-items:center; margin:1px 0; }
.vf-item { flex:1; min-width:0; display:flex; align-items:center; gap:11px; height:38px; padding:0 12px; border-radius:999px; color:var(--nv-item); font-size:0.88rem; font-weight:400; text-decoration:none; white-space:nowrap; transition:background .15s, color .15s; }
.vf-row.has-sub .vf-item { padding-right:42px; }
.vf-item:hover { background:var(--nv-hover); color:var(--nv-text); }
.vf-item[aria-current="page"] { background:var(--nv-on); color:var(--nv-text); font-weight:500; }
.vf-item svg { flex:0 0 auto; width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.vf-item[aria-current="page"] svg { color:var(--nv-accent); }
.vf-badge { margin-left:auto; padding:1px 7px; border:1px solid var(--nv-line); border-radius:20px; font-size:0.56rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--nv-dim); font-weight:500; }
.vf-toggle { position:absolute; right:5px; top:5px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:none; border-radius:50%; background:none; color:var(--nv-dim); cursor:pointer; }
.vf-toggle:hover { background:var(--nv-hover); color:var(--nv-text); }
.vf-toggle svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; transition:transform .15s; }
.vf-toggle[aria-expanded="true"] svg { transform:rotate(180deg); }
.vf-sub { display:none; flex-direction:column; margin:2px 0 6px; }
.vf-sub.open { display:flex; }
.vf-sub a { display:flex; align-items:center; gap:9px; height:32px; padding:0 12px 0 41px; border-radius:999px; color:var(--nv-item); font-size:0.82rem; text-decoration:none; white-space:nowrap; }
.vf-sub a:hover { background:var(--nv-hover); color:var(--nv-text); }
.vf-sub a::before { content:''; width:5px; height:5px; border-radius:50%; background:var(--nv-dim); flex:0 0 auto; margin-left:-14px; }
@media (max-width:768px) { .vf-nav { display:none !important; } }
`;
  const I = {
    dashboard:'<rect x="3.5" y="3.5" width="7" height="9" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="15.5" width="7" height="5" rx="2"/>',
    networth:'<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
    budget:'<path d="M18.5 7.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5V9A1.5 1.5 0 0 0 18 7.5H6.5"/><circle cx="15.5" cy="13.5" r="1.2"/>',
    debts:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><line x1="2.5" y1="10" x2="21.5" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
  };
  // [key, label, href, badge, quick actions as [label, action]]
  const NAV = [
    { items:[['dashboard', 'Home', '/dashboard/', 'Beta']] },
    { cap:'Trackers', items:[
      ['networth', 'Net worth', '/net-worth/', null, [['Update values', 'update'], ['Add asset or liability', 'add'], ['Share my net worth', 'share']]],
      ['budget', 'Budget', '/budget/', 'Beta', [['Add spending', 'spent'], ['Add income', 'received'], ['Categories & targets', 'manage']]],
      ['debts', 'Debts', '/debt-tracker/', null, [['Add a debt', 'add'], ['Share my progress', 'share']]],
    ] },
  ];
  // Budget's add actions use its existing ?add= link.
  const actionHref = (href, key, act) => key === 'budget' && (act === 'spent' || act === 'received') ? `${href}?add=${act}` : `${href}?${act}=1`;

  let openSet;
  try { openSet = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || 'null') || []); } catch (e) { openSet = null; }

  if (!document.getElementById('vf-nav-css')) {
    const st = document.createElement('style'); st.id = 'vf-nav-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const CHEV = '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
  document.querySelectorAll('[data-vf-nav]:not(.vf-nav)').forEach(el => {
    const active = el.dataset.active;
    // First visit: the page you're on starts open. After that, your choice sticks.
    const isOpen = key => openSet ? openSet.has(key) : key === active;
    el.classList.add('vf-nav');
    if (el.dataset.theme === 'navy') el.classList.add('navy');
    el.setAttribute('aria-label', 'VestlyFi tools');
    el.innerHTML = '<a class="vf-brand" href="/dashboard/">VestlyFi</a>' + NAV.map(g =>
      (g.cap ? `<div class="vf-cap">${g.cap}</div>` : '') +
      g.items.map(([key, label, href, badge, acts]) => {
        const row = `<div class="vf-row${acts ? ' has-sub' : ''}"><a class="vf-item" href="${href}"${key === active ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${I[key]}</svg><span>${label}</span>${badge ? `<span class="vf-badge">${badge}</span>` : ''}</a>` +
          (acts ? `<button class="vf-toggle" type="button" data-key="${key}" aria-expanded="${isOpen(key)}" aria-controls="vfsub-${key}" aria-label="${label} quick actions">${CHEV}</button>` : '') + '</div>';
        const sub = acts ? `<div class="vf-sub${isOpen(key) ? ' open' : ''}" id="vfsub-${key}">${acts.map(([t, act]) => `<a href="${actionHref(href, key, act)}" data-path="${href}" data-act="${act}">${t}</a>`).join('')}</div>` : '';
        return row + sub;
      }).join('')
    ).join('');

    el.addEventListener('click', e => {
      const tg = e.target.closest('.vf-toggle');
      if (tg) {
        const key = tg.dataset.key, sub = el.querySelector('#vfsub-' + key), open = !sub.classList.contains('open');
        sub.classList.toggle('open', open); tg.setAttribute('aria-expanded', open);
        const now = new Set([...el.querySelectorAll('.vf-toggle[aria-expanded="true"]')].map(b => b.dataset.key));
        try { localStorage.setItem(OPEN_KEY, JSON.stringify([...now])); } catch (err) {}
        return;
      }
      // Already on that tracker: run the action in place.
      const a = e.target.closest('.vf-sub a');
      if (a && a.dataset.path === location.pathname && window.VF_ACTIONS && typeof window.VF_ACTIONS[a.dataset.act] === 'function') {
        e.preventDefault(); window.VF_ACTIONS[a.dataset.act]();
      }
    });
  });
})();
