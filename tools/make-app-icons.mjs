// Draws the Budget app icons: a champagne V on Graphite charcoal, full bleed
// (iOS and Android round the corners themselves). Same V as /favicon.svg.
// Run: node tools/make-app-icons.mjs   (no dependencies)
import fs from 'node:fs';
import zlib from 'node:zlib';

const BG = [0x13, 0x13, 0x13], FG = [0xdc, 0xc3, 0x92];
// The V in a 512 box: two strokes 52 wide with round caps and join.
const SEGS = [[128, 160, 256, 352], [256, 352, 384, 160]], HALF = 26;

function distToSeg(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function render(n) {
  const s = 512 / n, rows = [];
  for (let y = 0; y < n; y++) {
    const row = Buffer.alloc(1 + n * 3); // filter byte 0, then RGB
    for (let x = 0; x < n; x++) {
      // 4x4 samples per pixel for smooth edges.
      let cover = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = (x + (sx + 0.5) / 4) * s, py = (y + (sy + 0.5) / 4) * s;
        if (Math.min(...SEGS.map(g => distToSeg(px, py, g))) <= HALF) cover++;
      }
      const a = cover / 16;
      for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(BG[c] + (FG[c] - BG[c]) * a);
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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const [n, file] of [[512, 'budget/icon-512.png'], [192, 'budget/icon-192.png'], [180, 'budget/apple-touch-icon.png']]) {
  fs.writeFileSync(file, render(n));
  console.log('wrote', file);
}
