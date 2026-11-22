// make-meme.mjs — builds meme.png (1024x1024) for the gta6-meme-x-01 entry.
// Node standard library only: node:zlib inflates/deflates the PNG data.
// Scene: left, a skeleton gamer still waiting on a GTA VI loading bar stuck
// at 99% since 2013; right, make.fun's real ghost mark (assets/ghost.png,
// the press kit's mark-1024.png) large in the scene with a bounty payout
// bubble. Top and bottom meme captions in a blocky bitmap font.

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const W = 1024, H = 1024;

// ---------- PNG decode (8-bit, colour types 6 and 2, no interlace) ----------
function decodePng(buf) {
  let pos = 8, idat = [], ihdr = null, plte = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8], colorType = ihdr[9];
  if (bitDepth !== 8 || ihdr[12] !== 0) throw new Error('unsupported PNG format');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 0;
  if (!channels) throw new Error('unsupported colour type ' + colorType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const s = x * channels, d = (y * w + x) * 4;
      if (colorType === 6) { out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = cur[s + 3]; }
      else if (colorType === 2) { out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]; out[d + 3] = 255; }
      else { const p = cur[s] * 3; out[d] = plte[p]; out[d + 1] = plte[p + 1]; out[d + 2] = plte[p + 2]; out[d + 3] = 255; }
    }
    prev = cur;
  }
  return { w, h, data: out };
}

// ---------- PNG encode (RGBA, filter 0) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Canvas ----------
const px = new Uint8Array(W * H * 4);
function setPix(x, y, r, g, b, a) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const ia = a / 255, oa = px[i + 3] / 255;
  const na = ia + oa * (1 - ia);
  if (na <= 0) { px[i + 3] = 0; return; }
  px[i] = Math.round((r * ia + px[i] * oa * (1 - ia)) / na);
  px[i + 1] = Math.round((g * ia + px[i + 1] * oa * (1 - ia)) / na);
  px[i + 2] = Math.round((b * ia + px[i + 2] * oa * (1 - ia)) / na);
  px[i + 3] = Math.round(na * 255);
}
function fillRect(x, y, w, h, col) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setPix(i, j, col[0], col[1], col[2], col[3] ?? 255); }
function roundRect(x, y, w, h, r, col) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const cx = Math.max(x + r - i, 0, i - (x + w - r - 1));
    const cy = Math.max(y + r - j, 0, j - (y + h - r - 1));
    if (cx * cx + cy * cy <= r * r) setPix(i, j, col[0], col[1], col[2], col[3] ?? 255);
  }
}
function circle(cx, cy, r, col) { for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) { const dx = i - cx, dy = j - cy; if (dx * dx + dy * dy <= r * r) setPix(i, j, col[0], col[1], col[2], col[3] ?? 255); } }
function line(x0, y0, x1, y1, thick, col) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    circle(Math.round(x), Math.round(y), Math.floor(thick / 2), col);
  }
}
function blit(img, dx, dy, dw, dh) {
  for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
    const sx = Math.min(img.w - 1, Math.floor(i * img.w / dw));
    const sy = Math.min(img.h - 1, Math.floor(j * img.h / dh));
    const s = (sy * img.w + sx) * 4;
    if (img.data[s + 3] > 0) setPix(dx + i, dy + j, img.data[s], img.data[s + 1], img.data[s + 2], img.data[s + 3]);
  }
}

// ---------- 5x7 bitmap font ----------
const FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01110','10001','10000','10000','10000','10001','01110'], D: ['11100','10010','10001','10001','10001','10010','11100'],
  E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01110','10001','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['01110','00100','00100','00100','00100','00100','01110'], J: ['00111','00010','00010','00010','00010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'], L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'], N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'], R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','10101','01010'], X: ['10001','01010','00100','00100','00100','01010','10001'],
  Y: ['10001','01010','00100','00100','00100','00100','00100'], Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'], '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00110','01000','10000','11111'], '3': ['11111','00010','00100','00010','00001','10001','01110'],
  '4': ['00010','00110','01010','10001','11111','00010','00010'], '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'], '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'], '9': ['01110','10001','10001','01111','00001','00010','01100'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'], ',': ['00000','00000','00000','00000','01100','00100','01000'],
  '+': ['00000','00100','00100','01110','00100','00100','00000'], '$': ['00100','01111','10100','01110','00101','11110','00100'],
  '%': ['11001','11010','00010','00100','01000','01011','10011'], "'": ['00100','00100','01000','00000','00000','00000','00000'],
  '-': ['00000','00000','00000','01110','00000','00000','00000'], ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'], '/': ['00001','00010','00010','00100','01000','01000','10000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};
function textWidth(str, scale) { return str.length * 6 * scale - scale; }
function drawText(str, x, y, scale, col) {
  str = str.toUpperCase();
  for (let n = 0; n < str.length; n++) {
    const glyph = FONT[str[n]] || FONT[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++)
      if (glyph[r][c] === '1') fillRect(x + n * 6 * scale + c * scale, y + r * scale, scale, scale, col);
  }
}
function drawTextOutlined(str, cx, y, scale, col, outline) {
  const x = Math.round(cx - textWidth(str, scale) / 2);
  for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]])
    drawText(str, x + ox * outline, y + oy * outline, scale, [0, 0, 0, 255]);
  drawText(str, x, y, scale, col);
}

// ---------- Scene ----------
const INK = [16, 14, 24, 255], BONE = [232, 230, 223, 255], GREY = [150, 152, 170, 255];
const MAGENTA = [199, 36, 142, 255], CYAN = [64, 200, 220, 255], GOLD = [245, 197, 66, 255], WHITE = [255, 255, 255, 255];

// Background: dark room, lighter at the top, floor at the bottom.
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r = Math.round(18 + 22 * t), g = Math.round(18 + 10 * t), b = Math.round(38 + 30 * t);
  fillRect(0, y, W, 1, [r, g, b, 255]);
}
fillRect(0, 806, W, 218, [10, 9, 18, 255]);
line(0, 806, W, 806, 4, [70, 66, 96, 255]);
// Centre divider between the waiting side and the paid side.
fillRect(508, 208, 8, 598, [70, 66, 96, 255]);

// Top caption.
drawTextOutlined('13 YEARS WAITING', 512, 30, 9, WHITE, 5);
drawTextOutlined('FOR GTA VI', 512, 122, 9, GOLD, 5);

// --- Left: the TV with the endless loading bar ---
roundRect(52, 226, 420, 238, 14, [8, 8, 14, 255]);
roundRect(52, 226, 420, 238, 14, INK);
fillRect(66, 240, 392, 210, [20, 26, 44, 255]);
drawTextOutlined('GTA VI', 262, 262, 9, WHITE, 4);
// Loading bar stuck at 99 percent.
fillRect(96, 356, 332, 30, [40, 44, 66, 255]);
fillRect(100, 360, 318, 22, CYAN);
fillRect(422, 360, 6, 22, [40, 44, 66, 255]);
drawTextOutlined('LOADING 99%', 262, 402, 5, [200, 205, 220, 255], 3);
drawTextOutlined('EST. 2013', 262, 478, 5, GREY, 3);
// Cobwebs in the TV corners.
for (const [cx, cy, dx, dy] of [[66, 240, 1, 1], [458, 240, -1, 1]]) {
  for (let k = 1; k <= 4; k++) line(cx, cy, cx + dx * k * 18, cy, 2, [190, 190, 200, 160]);
  for (let k = 1; k <= 4; k++) line(cx, cy, cx, cy + dy * k * 18, 2, [190, 190, 200, 160]);
  for (let k = 1; k <= 3; k++) line(cx + dx * k * 18, cy + dy * (4 - k) * 6, cx + dx * (4 - k) * 6, cy + dy * k * 18, 2, [190, 190, 200, 140]);
}

// --- Left: skeleton in a gaming chair, controller in hand ---
roundRect(140, 540, 250, 250, 26, [46, 50, 78, 255]);       // chair back
roundRect(140, 540, 250, 250, 26, [46, 50, 78, 255]);
fillRect(126, 756, 278, 34, [34, 38, 60, 255]);              // chair seat
circle(265, 588, 50, BONE);                                  // skull
fillRect(232, 612, 66, 38, BONE);                            // jaw
circle(246, 584, 11, INK); circle(284, 584, 11, INK);        // eye sockets
fillRect(260, 600, 10, 14, INK);                              // nose
for (let k = 0; k < 4; k++) fillRect(240 + k * 15, 622, 3, 24, [120, 118, 110, 255]); // teeth
line(265, 650, 265, 742, 16, BONE);                          // spine
for (let k = 0; k < 3; k++) fillRect(214 + k * 6, 668 + k * 24, 102 - k * 12, 9, BONE); // ribs
line(232, 662, 188, 726, 15, BONE); line(298, 662, 342, 726, 15, BONE); // arms
circle(188, 730, 12, BONE); circle(342, 730, 12, BONE);      // hands
roundRect(172, 722, 186, 58, 24, [14, 14, 20, 255]);         // controller
circle(206, 751, 9, MAGENTA); circle(324, 751, 9, CYAN);
fillRect(238, 744, 26, 8, [90, 92, 110, 255]); fillRect(247, 735, 8, 26, [90, 92, 110, 255]);
line(238, 762, 214, 800, 14, BONE); line(292, 762, 316, 800, 14, BONE); // legs to the floor

// --- Right: the make.fun ghost, large, with its payout bubble ---
const ghost = decodePng(readFileSync(join(HERE, 'assets', 'ghost.png')));
blit(ghost, 548, 232, 424, 424);
// Notification bubble under the ghost: black rim, white face, two clean lines.
roundRect(535, 673, 450, 128, 24, INK);
roundRect(540, 678, 440, 118, 22, WHITE);
drawText('BOUNTY WON', 566, 694, 6, INK);
drawText('+$500', 566, 744, 7, MAGENTA);
drawText('MAKE.FUN', 788, 752, 4, INK);

// Bottom caption.
drawTextOutlined('MY AGENT ALREADY', 512, 830, 9, WHITE, 5);
drawTextOutlined('GOT PAID ON MAKE.FUN', 512, 922, 8, MAGENTA, 5);

writeFileSync(join(HERE, 'meme.png'), encodePng(W, H, px));
console.log('meme.png written');
