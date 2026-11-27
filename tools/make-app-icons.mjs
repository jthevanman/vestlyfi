// Draws every VestlyFi icon: a champagne V on charcoal, the colors of
// /assets/theme.css. Same V as /favicon.svg.
//   - App icons (home screen, installed app) are full bleed: iOS and Android
//     round the corners themselves, and the V sits inside the maskable safe zone.
//   - Browser-tab icons get transparent rounded corners, like favicon.svg.
// Run: node tools/make-app-icons.mjs   (no dependencies)
import fs from 'node:fs';
import zlib from 'node:zlib';

const BG = [0x13, 0x13, 0x13], FG = [0xdc, 0xc3, 0x92];
// The V in a 512 box: two strokes 52 wide with round caps and join.
const SEGS = [[128, 160, 256, 352], [256, 352, 384, 160]], HALF = 26;
const RADIUS = 96;   // corner radius (in the 512 box) for the rounded tab icons

function distToSeg(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
// Inside the rounded square?
function inRounded(px, py) {
  const r = RADIUS, cx = Math.min(Math.max(px, r), 512 - r), cy = Math.min(Math.max(py, r), 512 - r);
  return Math.hypot(px - cx, py - cy) <= r;
}

// RGBA pixels, 4x4 samples per pixel for smooth edges.
function render(n, rounded) {
  const s = 512 / n, rows = [];
  for (let y = 0; y < n; y++) {
    const row = Buffer.alloc(1 + n * 4); // filter byte 0, then RGBA
    for (let x = 0; x < n; x++) {
      let vee = 0, inside = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = (x + (sx + 0.5) / 4) * s, py = (y + (sy + 0.5) / 4) * s;
        const inn = !rounded || inRounded(px, py);
        if (inn) { inside++; if (Math.min(...SEGS.map(g => distToSeg(px, py, g))) <= HALF) vee++; }
      }
      const a = inside ? vee / inside : 0;
      for (let c = 0; c < 3; c++) row[1 + x * 4 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
      row[1 + x * 4 + 3] = Math.round(255 * inside / 16);
    }
    rows.push(row);
  }
  return png(n, n, Buffer.concat(rows));
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// .ico holding PNG images (every current browser and Windows reads these).
function ico(images) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(([n, data]) => {
    const e = Buffer.alloc(16);
    e[0] = n >= 256 ? 0 : n; e[1] = n >= 256 ? 0 : n; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12); offset += data.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...images.map(([, d]) => d)]);
}

const out = (file, data) => { fs.writeFileSync(file, data); console.log('wrote', file); };
// App icons: full bleed.
for (const [n, file] of [[512, 'budget/icon-512.png'], [192, 'budget/icon-192.png'], [180, 'budget/apple-touch-icon.png'],
  [180, 'apple-touch-icon.png'], [192, 'android-chrome-192x192.png'], [512, 'android-chrome-512x512.png'],
  [192, 'web-app-manifest-192x192.png'], [512, 'web-app-manifest-512x512.png']]) out(file, render(n, false));
// Browser-tab icons: rounded.
for (const [n, file] of [[16, 'favicon-16x16.png'], [32, 'favicon-32x32.png'], [96, 'favicon-96x96.png']]) out(file, render(n, true));
out('favicon.ico', ico([48, 32, 16].map(n => [n, render(n, true)])));
out('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" rx="${RADIUS}" fill="#131313"/><path d="M128 160L256 352L384 160" stroke="#dcc392" stroke-width="52" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>\n`);
