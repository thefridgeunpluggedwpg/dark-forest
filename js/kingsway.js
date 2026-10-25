// 83 Kingsway — Stefan's neoclassical colonial house (¾ top-down pixel art), lamp post, topiary, tiny pixel font
import { cv, hash, outline } from './art.js';
const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const GL = { K: '101101110101101', i: '010000010010010', n: '000110101101101', g: '011101011001110', s: '011100010001110', w: '000101101111101', a: '000011101101011', y: '101101011001110', 8: '111101111101111', 3: '111001011001111', G: '111100101101111', o: '000111101101111', b: '100111101101111', l: '110010010010111', Y: '101101010010010', t: '010111010010011', e: '000111111100111' };
export function pixText(g, txt, x, y, col) { for (const ch of txt) { const b = GL[ch]; if (b) for (let i = 0; i < 15; i++) if (b[i] === '1') R(g, x + i % 3, y + (i / 3 | 0), 1, 1, col); x += 4; } }
function window_(g, x, y, w, h, lit, cols = 3, rows = 2) {
  R(g, x - 2, y - 2, w + 4, h + 4, '#f4f6f8'); R(g, x - 2, y + h + 1, w + 4, 2, '#a8aeb8'); R(g, x - 3, y - 4, w + 6, 2, '#ffffff'); R(g, x - 3, y - 2, w + 6, 1, '#9aa0aa');
  if (lit) { R(g, x, y, w, h, '#ffb54a'); R(g, x, y, w, 2, '#ffd27a'); R(g, x + 1, y + h - 3, w - 2, 2, '#ff9a30'); R(g, x, y, 3, h, '#c8743a'); R(g, x + w - 3, y, 3, h, '#c8743a'); R(g, x + 1, y, 1, h, '#a85a2a'); R(g, x + w - 2, y, 1, h, '#a85a2a'); R(g, x + w / 2 - 2 | 0, y + 3, 3, 4, '#e88a3a'); }
  else { R(g, x, y, w, h, '#33404e'); R(g, x, y, w, h / 2 | 0, '#40505f'); R(g, x + 2, y + 1, 2, h - 3, '#6a7e90'); R(g, x, y, 3, h, '#7a8a9a'); R(g, x + w - 3, y, 3, h, '#7a8a9a'); }
  for (let i = 1; i < cols; i++) R(g, x + Math.round(i * w / cols), y, 1, h, '#f4f6f8'); for (let j = 1; j < rows; j++) R(g, x, y + Math.round(j * h / rows), w, 1, '#f4f6f8');
}
function clap(g, x, y, w, h, seed) { for (let yy = y; yy < y + h; yy++) { const r = (yy - y) % 4; R(g, x, yy, w, 1, r === 3 ? '#6a7078' : r === 0 ? '#a6acb4' : '#8e949c'); } for (let i = 0; i < w * h / 50; i++) R(g, x + hash(i, seed, 1) * w | 0, y + hash(i, seed, 2) * h | 0, 1, 1, '#7c828a'); }
function slate(g, x, y, w, h) { R(g, x, y, w, h, '#2e3139'); for (let yy = y; yy < y + h; yy += 3) { R(g, x, yy, w, 1, '#1f2128'); for (let xx = x + ((yy / 3) & 1) * 2; xx < x + w; xx += 4) R(g, xx, yy, 1, 3, '#24262e'); } for (let i = 0; i < w * h / 30; i++) R(g, x + hash(i, y, 3) * w | 0, y + hash(i, x, 4) * h | 0, 2, 1, hash(i, 1, 1) < 0.5 ? '#3c404a' : '#262830'); R(g, x, y, w, 1, '#50545e'); R(g, x, y, 1, h, '#3a3e48'); R(g, x + w - 1, y, 1, h, '#1a1c22'); }
function cornice(g, x, y, w, h) { R(g, x - 4, y, w + 8, h, '#f4f6f8'); R(g, x - 4, y, w + 8, 2, '#ffffff'); R(g, x - 4, y + h - 2, w + 8, 2, '#b8bec8'); for (let xx = x - 2; xx < x + w + 2; xx += 4) R(g, xx, y + h - 5, 2, 3, '#c8ced6'); R(g, x - 2, y + h, w + 4, 2, '#8a909a'); }
export function topiary(v) { const c = cv(16, 15), g = c.getContext('2d'), P = ['#1e4a1e', '#2e6a26', '#3f8a30', '#5aa83c', '#8ad060'];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 16; x++) { const nx = (x - 7.5) / 7.5, ny = (y - 7) / 7; const d = nx * nx + ny * ny; if (d > 1) continue; const l = -nx * 0.45 - ny * 0.6 + 0.5 + (hash(x, y, v) - 0.5) * 0.45; R(g, x, y, 1, 1, P[Math.max(0, Math.min(4, Math.floor(l * 3.2 + 1.2)))]); }
  return outline(c, '#122a12'); }
export function kingsLamp(lit) { const c = cv(44, 60), g = c.getContext('2d');
  R(g, 19, 14, 3, 44, '#16181c'); R(g, 20, 14, 1, 44, '#30343c'); R(g, 16, 54, 9, 4, '#16181c'); R(g, 17, 52, 7, 2, '#22262c'); R(g, 18, 30, 5, 2, '#16181c');
  R(g, 16, 2, 9, 11, '#16181c'); R(g, 17, 3, 7, 9, lit ? '#ffd780' : '#9aa6b0'); if (lit) { R(g, 18, 4, 5, 6, '#fff2c0'); } R(g, 19, 3, 1, 9, '#16181c'); R(g, 21, 3, 1, 9, '#16181c'); R(g, 15, 1, 11, 2, '#16181c'); R(g, 18, 0, 5, 1, '#16181c'); R(g, 17, 13, 7, 2, '#16181c');
  // "Kingsway" street sign
  R(g, 2, 33, 40, 9, '#1a1c20'); R(g, 3, 34, 38, 7, '#2a4a36'); R(g, 3, 34, 38, 1, '#4a6a56'); pixText(g, 'Kingsway', 6, 35, '#f4f6f0'); R(g, 21, 32, 1, 1, '#16181c');
  return c; }
export function mansion(lit) {
  const c = cv(304, 340), g = c.getContext('2d'), wins = [];
  // ---- side wing (right, set back) ----
  slate(g, 232, 108, 66, 34); cornice(g, 234, 140, 62, 10); clap(g, 234, 152, 62, 132, 2); R(g, 234, 152, 62, 3, '#9aa0aa'); R(g, 294, 152, 2, 132, '#b8bec8');
  window_(g, 262, 170, 18, 26, lit); window_(g, 262, 228, 18, 30, lit); wins.push([271, 183], [271, 243]);
  R(g, 232, 280, 66, 6, '#8a8f98');
  // ivy climbing the wing
  for (let i = 0; i < 520; i++) { const t = hash(i, 9, 9), x = 234 + (hash(i, 7, 7) ** 1.6) * 40 * (1 - t * 0.4) | 0, y = 150 + t * 134 | 0; if (hash(x, y, 3) < 0.5) R(g, x, y, 2, 2, ['#1e4a1e', '#2e6a26', '#3f8a30', '#5aa83c'][i % 4]); }
  for (let y = 160; y < 284; y += 9) R(g, 240 + (Math.sin(y * 0.2) * 4 | 0), y, 1, 6, '#3a2a1a');
  // ---- main block roof (flat, seen from above) with raised section ----
  slate(g, 6, 36, 232, 74); R(g, 6, 106, 232, 4, '#4a505b');
  slate(g, 78, 44, 92, 30); cornice(g, 80, 70, 88, 8); R(g, 80, 78, 88, 14, '#d6dbe2'); clap(g, 80, 78, 88, 14, 5); R(g, 84, 82, 80, 6, lit ? '#7a5a3a' : '#4a5462');
  R(g, 200, 46, 10, 14, '#7a5040'); R(g, 199, 44, 12, 3, '#5a3a2a'); // chimney
  cornice(g, 6, 110, 232, 16);
  // ---- upper storey ----
  clap(g, 6, 128, 232, 70, 1);
  for (const [x, w] of [[14, 18], [48, 26], [94, 24], [126, 24], [168, 26], [208, 18]]) { window_(g, x, 140, w, 32, lit, w > 20 ? 4 : 2, 2); wins.push([x + w / 2, 156]); }
  // balcony (second-floor) floor + balustrade
  R(g, 2, 196, 240, 6, '#eef1f4'); R(g, 2, 202, 240, 3, '#a8aeb8'); R(g, 2, 184, 240, 2, '#ffffff'); for (let x = 4; x < 240; x += 4) R(g, x, 186, 2, 10, '#f4f6f8'); R(g, 2, 195, 240, 1, '#b8bec8');
  // ---- ground floor porch (recessed, shaded) ----
  R(g, 6, 205, 232, 86, '#b9bfc9'); clap(g, 12, 208, 220, 82, 3); R(g, 12, 208, 220, 82, 'rgba(40,50,70,.25)'); R(g, 6, 205, 232, 4, 'rgba(0,0,0,.25)');
  window_(g, 26, 230, 22, 40, lit, 2, 3); window_(g, 196, 230, 22, 40, lit, 2, 3); window_(g, 64, 236, 16, 36, lit, 2, 3); window_(g, 164, 236, 16, 36, lit, 2, 3); wins.push([37, 250], [207, 250], [72, 254], [172, 254]);
  // red door with sidelights and transom, "83" above
  R(g, 100, 232, 44, 58, '#f4f6f8'); R(g, 100, 232, 44, 2, '#ffffff');
  R(g, 103, 244, 6, 44, lit ? '#ffcf70' : '#5a6878'); R(g, 135, 244, 6, 44, lit ? '#ffcf70' : '#5a6878'); for (let y = 248; y < 288; y += 6) { R(g, 103, y, 6, 1, '#f4f6f8'); R(g, 135, y, 6, 1, '#f4f6f8'); }
  R(g, 111, 244, 22, 46, '#8a1414'); R(g, 112, 245, 20, 44, '#b01c1c'); R(g, 114, 248, 7, 16, '#9a1818'); R(g, 123, 248, 7, 16, '#9a1818'); R(g, 114, 268, 7, 18, '#9a1818'); R(g, 123, 268, 7, 18, '#9a1818'); R(g, 112, 245, 20, 1, '#d83a3a'); R(g, 128, 266, 2, 2, '#e8c860');
  R(g, 111, 236, 22, 7, lit ? '#ffd27a' : '#5a6878'); for (let x = 113; x < 132; x += 4) R(g, x, 236, 1, 7, '#f4f6f8');
  R(g, 115, 228, 14, 7, '#f4f6f8'); pixText(g, '83', 117, 229, '#2a2a30');
  for (const sx of [94, 148]) { R(g, sx, 252, 3, 6, '#22262c'); R(g, sx - 1, 250, 5, 2, '#22262c'); R(g, sx, 253, 3, 3, lit ? '#ffd27a' : '#c8b070'); wins.push([sx + 1.5, 254]); }
  R(g, 166, 210, 40, 11, '#c8902a'); R(g, 167, 211, 38, 9, '#1c1a1e'); pixText(g, 'Kingsway', 170, 213, '#f4f0e6'); R(g, 172, 206, 1, 4, '#16181c'); R(g, 200, 206, 1, 4, '#16181c');
  // porch floor
  R(g, 2, 288, 240, 8, '#c8ccd2'); R(g, 2, 288, 240, 1, '#e8ecf0'); R(g, 2, 295, 240, 2, '#7a808a');
  // ---- four tall columns ----
  for (const x of [30, 82, 154, 206]) { R(g, x - 3, 110, 18, 4, '#ffffff'); R(g, x - 2, 114, 16, 4, '#e4e8ee'); for (let yy = 118; yy < 284; yy++) { R(g, x, yy, 12, 1, '#f2f4f7'); R(g, x, yy, 2, 1, '#ffffff'); R(g, x + 9, yy, 3, 1, '#b8bec8'); R(g, x + 5, yy, 1, 1, '#d6dbe2'); }
    R(g, x - 2, 284, 16, 4, '#e4e8ee'); R(g, x - 3, 288, 18, 3, '#c8ccd2'); R(g, x + 12, 120, 3, 166, 'rgba(30,40,60,.18)'); }
  // ---- wide stone steps ----
  for (let i = 0; i < 4; i++) { const w = 64 + i * 14, x = 122 - w / 2, y = 297 + i * 8; R(g, x, y, w, 8, i % 2 ? '#a9aeb6' : '#b8bdc4'); R(g, x, y, w, 1, '#dfe3e8'); R(g, x, y + 7, w, 1, '#6e737c'); for (let k = 0; k < w; k += 9) if (hash(k, i, 5) < 0.5) R(g, x + k, y + 3, 3, 1, '#8e939c'); }
  // shrubs along the foundation + topiary clusters by the steps (baked, back row)
  for (let x = 4; x < 296; x += 9) { if (x > 84 && x < 160) continue; const s = 6 + hash(x, 1, 2) * 4 | 0; g.fillStyle = hash(x, 2, 2) < 0.5 ? '#2e6a26' : '#3f8a30'; g.beginPath(); g.ellipse(x + 4, 293 - (x > 230 ? 8 : 0), s, s * 0.8, 0, 0, 6.283); g.fill(); R(g, x + 1, 288 - s * 0.6 - (x > 230 ? 8 : 0) | 0, 3, 1, '#6ab848'); }
  const cl = outline(c, '#1a1c22'); return { canvas: cl, wins, base: 294 };
}

export function yardSign() { const c = cv(30, 24), g = c.getContext('2d'); R(g, 14, 12, 2, 12, '#4a2c18'); R(g, 1, 1, 28, 13, '#d8e0d0'); R(g, 2, 2, 26, 11, '#2a6a3a'); R(g, 2, 2, 26, 1, '#4a8a5a'); pixText(g, 'Goblin', 3, 2, '#f4f6f0'); pixText(g, 'Yates', 5, 8, '#f4f6f0'); return outline(c, '#101a12'); }
export function lavender(v) { const c = cv(20, 14), g = c.getContext('2d'); for (let i = 0; i < 9; i++) { const x = 2 + hash(i, v, 1) * 16 | 0, h = 6 + hash(i, v, 2) * 6 | 0; R(g, x, 14 - h, 1, h, '#3a6a2a'); for (let y = 14 - h; y < 14 - h + 4; y++) R(g, x - (y & 1), y, 2, 1, hash(i, y, v) < 0.5 ? '#9a6ad8' : '#7a4ab8'); R(g, x, 14 - h - 1, 1, 1, '#c8a0f0'); } return c; }
