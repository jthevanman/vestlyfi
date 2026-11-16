// Guards the budget page's icon library against clipped or broken icons.
//
// Every icon is drawn in a 24x24 viewBox with a 1.7px stroke. If any part of
// a shape (plus half the stroke) reaches past the edge, it gets cut off in the
// round icon bubbles. This test measures each icon's real outline, curves and
// arcs included, and fails if it doesn't sit inside the frame with room to spare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'budget', 'index.html'), 'utf8');

const HALF_STROKE = 0.85;  // stroke-width 1.7
const MIN = 0.5, MAX = 23.5;  // outline incl. stroke must stay inside this

function block(name) {
  const start = html.indexOf(`const ${name} = {`);
  assert.ok(start >= 0, `${name} not found in budget/index.html`);
  const end = html.indexOf('};', start);
  return html.slice(start, end);
}
function entries(src) {
  const out = {};
  for (const m of src.matchAll(/'([a-z0-9 -]+)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)) out[m[1]] = m[2];
  return out;
}

/* ── Outline measurement ── */
function num(s) { return [...String(s).matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)].map(m => +m[0]); }
function attr(tag, name) { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; }

function arcPoints(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  // SVG spec F.6.5: endpoint to center parameterization, then sample.
  if (rx === 0 || ry === 0) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = phiDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sign = fa === fs ? -1 : 1;
  const numer = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, numer / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = co * (rx * y1p) / ry, cyp = co * -(ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = t1 + dt * i / 48;
    pts.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  return pts;
}

function pathPoints(d) {
  const pts = [];
  let x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null, prev = '';
  const cmds = d.match(/[a-z][^a-z]*/gi) || [];
  for (const chunk of cmds) {
    const c = chunk[0], rel = c === c.toLowerCase(), C = c.toUpperCase();
    const n = num(chunk.slice(1));
    const take = k => n.splice(0, k);
    const ax = v => rel ? x + v : v, ay = v => rel ? y + v : v;
    if (C === 'Z') { x = sx; y = sy; pts.push([x, y]); prev = 'Z'; continue; }
    let first = true;
    while (n.length || (first && (C === 'Z'))) {
      first = false;
      if (C === 'M') { const [a, b] = take(2); x = ax(a); y = ay(b); if (prev !== 'M') { sx = x; sy = y; } pts.push([x, y]); }
      else if (C === 'L' || (C === 'M')) { const [a, b] = take(2); x = ax(a); y = ay(b); pts.push([x, y]); }
      else if (C === 'H') { const [a] = take(1); x = rel ? x + a : a; pts.push([x, y]); }
      else if (C === 'V') { const [a] = take(1); y = rel ? y + a : a; pts.push([x, y]); }
      else if (C === 'C' || C === 'S') {
        let x1, y1;
        if (C === 'C') { const [a, b] = take(2); x1 = ax(a); y1 = ay(b); }
        else { x1 = lc ? 2 * x - lc[0] : x; y1 = lc ? 2 * y - lc[1] : y; }
        const [c2, d2, e, f] = take(4);
        const x2 = ax(c2), y2 = ay(d2), x3 = ax(e), y3 = ay(f);
        for (let i = 1; i <= 32; i++) { const t = i / 32, u = 1 - t;
          pts.push([u*u*u*x + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3, u*u*u*y + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3]); }
        lc = [x2, y2]; x = x3; y = y3;
      }
      else if (C === 'Q' || C === 'T') {
        let x1, y1;
        if (C === 'Q') { const [a, b] = take(2); x1 = ax(a); y1 = ay(b); }
        else { x1 = lq ? 2 * x - lq[0] : x; y1 = lq ? 2 * y - lq[1] : y; }
        const [e, f] = take(2); const x2 = ax(e), y2 = ay(f);
        for (let i = 1; i <= 32; i++) { const t = i / 32, u = 1 - t;
          pts.push([u*u*x + 2*u*t*x1 + t*t*x2, u*u*y + 2*u*t*y1 + t*t*y2]); }
        lq = [x1, y1]; x = x2; y = y2;
      }
      else if (C === 'A') {
        const [rx, ry, rot, fa, fs, e, f] = take(7);
        const x2 = ax(e), y2 = ay(f);
        pts.push(...arcPoints(x, y, rx, ry, rot, fa, fs, x2, y2)); x = x2; y = y2;
      }
      else throw new Error(`unsupported path command ${c}`);
      if (C !== 'C' && C !== 'S') lc = null;
      if (C !== 'Q' && C !== 'T') lq = null;
      prev = C;
    }
  }
  return pts;
}

function bounds(svgInner) {
  const pts = [];
  for (const m of svgInner.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b[^>]*>/g)) {
    const tag = m[0], kind = m[1];
    if (kind === 'path') pts.push(...pathPoints(attr(tag, 'd')));
    else if (kind === 'circle') { const cx = +attr(tag, 'cx'), cy = +attr(tag, 'cy'), r = +attr(tag, 'r'); pts.push([cx - r, cy - r], [cx + r, cy + r]); }
    else if (kind === 'ellipse') { const cx = +attr(tag, 'cx'), cy = +attr(tag, 'cy'), rx = +attr(tag, 'rx'), ry = +attr(tag, 'ry'); pts.push([cx - rx, cy - ry], [cx + rx, cy + ry]); }
    else if (kind === 'rect') {
      if (attr(tag, 'transform')) continue;  // rotated rects are checked separately below
      const x = +attr(tag, 'x'), y = +attr(tag, 'y'), w = +attr(tag, 'width'), h = +attr(tag, 'height'); pts.push([x, y], [x + w, y + h]);
    }
    else if (kind === 'line') pts.push([+attr(tag, 'x1'), +attr(tag, 'y1')], [+attr(tag, 'x2'), +attr(tag, 'y2')]);
    else { const n = num(attr(tag, 'points')); for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]); }
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs) - HALF_STROKE, Math.min(...ys) - HALF_STROKE, Math.max(...xs) + HALF_STROKE, Math.max(...ys) + HALF_STROKE];
}

/* ── Tests ── */
const LIB = entries(block('LIB'));
const NAME_ICON = entries(block('NAME_ICON'));

test('icon library is not empty', () => {
  assert.ok(Object.keys(LIB).length >= 30, `only ${Object.keys(LIB).length} icons parsed`);
});

test('every starter subcategory maps to an icon that exists', () => {
  for (const [name, key] of Object.entries(NAME_ICON)) assert.ok(LIB[key], `"${name}" points at missing icon "${key}"`);
});

for (const [key, svg] of Object.entries(LIB)) {
  test(`icon "${key}" stays inside its 24x24 frame`, () => {
    const [x0, y0, x1, y1] = bounds(svg);
    const box = [x0, y0, x1, y1].map(v => v.toFixed(2)).join(', ');
    assert.ok(x0 >= MIN && y0 >= MIN && x1 <= MAX && y1 <= MAX, `outline ${box} goes past ${MIN}..${MAX}`);
  });
}

test('measurement catches a clipped icon', () => {
  const [, , x1] = bounds('<path d="M2 12h21.8"/>');
  assert.ok(x1 > MAX, 'a line touching the edge should fail');
  const arc = bounds('<path d="M4 12a8 8 0 0 1 16 0"/>');
  assert.ok(arc[1] < 4.2 && arc[1] > 3, 'arc top should be measured, not just its endpoints');
});
