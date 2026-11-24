#!/usr/bin/env node
// Navy -> charcoal, for the public pages (calculators, homepage, guides).
//
// These pages are always charcoal (no light mode), so every navy-theme
// color is swapped for its charcoal equivalent in place: the :root color
// names, the page's own styles, inline style="" and script-drawn charts.
// The values match /assets/theme.css (dark).
//
//   node tools/retheme-charcoal.mjs <file.html|file.mjs> ...
//
// Also safe on generator sources (tools/*.mjs) whose templates carry the
// same colors. Running it twice changes nothing the second time.
import fs from 'node:fs';

// Solid text color for a translucent cream, as it looks on a charcoal panel.
const creamOn = a => { const v = Math.round(19 + (237 - 19) * a); const h = v.toString(16).padStart(2, '0'); return `#${h}${h}${h}`; };

const HEX = {
  // backgrounds
  '#0a0f1e':'#0b0b0b', '#080c1a':'#0b0b0b', '#080e1d':'#0b0b0b', '#0e1530':'#1b1b1b', '#0d1426':'#131313', '#0d1526':'#131313',
  '#111827':'#1b1b1b', '#131c2e':'#1b1b1b', '#141d35':'#131313', '#1a2540':'#262626', '#1e2a47':'#262626', '#162036':'#1b1b1b',
  '#8899aa':'#8d8d8d',
  // gold -> champagne, cream -> neutral white
  '#c9a84c':'#dcc392', '#e8c97a':'#ecd9b2', '#b8963e':'#c9ae7a', '#f5f0e8':'#ededed',
  // greens, reds, accents
  '#4caf7d':'#5cc28e', '#4ade80':'#5cc28e', '#6fc99a':'#7fd3a6', '#2d9960':'#3f9a6c',
  '#e05c5c':'#e8706a', '#f87171':'#e8706a', '#ea7b74':'#ef8f89', '#22c55e':'#5cc28e', '#ef4444':'#e8706a',
  '#60a5fa':'#7aa7ff', '#a78bfa':'#b39af5', '#fbbf24':'#e3a857',
};
const RGB = [
  [/rgba\(\s*201\s*,\s*168\s*,\s*76\s*,/g, 'rgba(220,195,146,'],
  [/rgba\(\s*10\s*,\s*15\s*,\s*30\s*,/g, 'rgba(11,11,11,'],
  [/rgba\(\s*20\s*,\s*29\s*,\s*53\s*,/g, 'rgba(19,19,19,'],
  [/rgba\(\s*26\s*,\s*37\s*,\s*64\s*,/g, 'rgba(38,38,38,'],
  [/rgba\(\s*232\s*,\s*201\s*,\s*122\s*,/g, 'rgba(236,217,178,'],
  [/rgba\(\s*(?:76\s*,\s*175\s*,\s*125|74\s*,\s*222\s*,\s*128)\s*,/g, 'rgba(92,194,142,'],
  [/rgba\(\s*(?:224\s*,\s*92\s*,\s*92|248\s*,\s*113\s*,\s*113)\s*,/g, 'rgba(232,112,106,'],
];

export function retheme(src) {
  let s = src;
  s = s.replace(/#[0-9a-fA-F]{6}\b/g, h => HEX[h.toLowerCase()] || h);
  for (const [re, to] of RGB) s = s.replace(re, to);
  // Cream at 30%+ is text: make it a solid grey so it stays crisp. Fainter cream is a hairline or fill; keep it translucent.
  s = s.replace(/rgba\(\s*245\s*,\s*240\s*,\s*232\s*,\s*([0-9.]+)\s*\)/g, (m, a) => Number(a) >= 0.3 ? creamOn(Number(a)) : `rgba(237,237,237,${a})`);
  // Body text at weight 300 looks soft on dark; 400 like the trackers.
  s = s.replace(/(\bbody\s*\{[^}]*?font-weight:\s*)300/, '$1400');
  return s;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1].endsWith('retheme-charcoal.mjs')) {
  for (const f of process.argv.slice(2)) {
    const before = fs.readFileSync(f, 'utf8'), after = retheme(before);
    if (after !== before) { fs.writeFileSync(f, after); console.log('rethemed', f); } else console.log('unchanged', f);
  }
}
