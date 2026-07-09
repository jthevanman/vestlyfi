// Link bands injected into house-affordability/index.html by the programmatic
// page generators, delimited by <!-- <name>:start/end --> markers. Every
// generator that uses the hub as its base template must strip ALL of these
// before building child pages, so no page inherits another cluster's band.
export const HUB_BLOCK_NAMES = ['credit-score-pages', 'income-pages'];

export function stripBlocks(html, names = HUB_BLOCK_NAMES) {
  for (const name of names) {
    const S = `<!-- ${name}:start -->`;
    const E = `<!-- ${name}:end -->`;
    while (html.includes(S)) {
      const s = html.indexOf(S);
      const e = html.indexOf(E) + E.length;
      html = html.slice(0, s) + html.slice(e).replace(/^\s*\n/, '');
    }
  }
  return html;
}

// Replaces (or first inserts) the named band immediately before <footer>.
export function upsertBlock(html, name, blockHtml) {
  html = stripBlocks(html, [name]);
  const i = html.indexOf('<footer>');
  if (i === -1) throw new Error('Hub <footer> not found');
  return html.slice(0, i) + blockHtml + '\n' + html.slice(i);
}

// Scoped CSS for the bands; identical for every cluster, injected with the
// first band on the page only (the rule set is idempotent to duplicate, but
// each band ships its own copy inside its markers so strip/re-inject stays
// self-contained).
export const BAND_CSS = `<style>
  .link-band { position:relative; z-index:1; max-width:720px; margin:0 auto; padding:0 24px 48px; }
  .link-band h2 { font-size:1.05rem; font-weight:500; color:var(--cream); margin-bottom:8px; }
  .link-band p { font-size:0.88rem; color:var(--muted); line-height:1.7; margin-bottom:14px; }
  .link-band .band-chips { display:flex; flex-wrap:wrap; gap:8px; }
  .link-band .band-chips a { padding:7px 12px; border-radius:8px; background:var(--navy-mid); border:1px solid var(--border-soft); color:var(--cream-dim); text-decoration:none; font-size:0.8rem; transition:all .15s; }
  .link-band .band-chips a:hover { border-color:var(--gold); color:var(--gold-light); }
</style>`;
