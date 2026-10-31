// Dark Forest v0.2 — procedural pixel-art sprite generator (art scale: 16 art px per tile)
export const P = 16;
export function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function vnoise(x, y, s = 0) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// add a 1px dark outline around all opaque pixels (the reference style)
export function outline(c, col = '#24160f', alphaCut = 100) {
  const g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h), a = d.data, o = new Uint8ClampedArray(a), [r, gg, b] = hex(col);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (a[i + 3] >= alphaCut) continue;
    const op = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && a[(yy * w + xx) * 4 + 3] >= alphaCut;
    if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) { o[i] = r; o[i + 1] = gg; o[i + 2] = b; o[i + 3] = 255; } }
  g.putImageData(new ImageData(o, w, h), 0, 0); return c;
}
const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
// shaded pixel blob (light from top-left), palette dark→light
function blob(g, cx, cy, rx, ry, pal, seed = 0, rough = 0.18, lx = -0.55, ly = -0.75) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny; const edge = 1 + (hash(x, y, seed) - 0.5) * rough * 2;
    if (d > edge) continue; const nz = Math.sqrt(Math.max(0, 1 - d)); let l = (nx * lx + ny * ly + nz * 0.6) * 0.75 + 0.35 + (hash(x, y, seed + 7) - 0.5) * 0.28;
    const i = Math.max(0, Math.min(pal.length - 1, Math.floor(l * pal.length))); R(g, x, y, 1, 1, pal[i]); }
}
const LEAF = ['#1f4d22', '#2e6b2a', '#3f8a32', '#5aa83a', '#7cc44a', '#a6dc62'];
const LEAF2 = ['#24502a', '#336f30', '#468f38', '#62ad40', '#86c94e', '#b0e070'];
const AUT = ['#6b2f14', '#8f441a', '#b85f22', '#d98330', '#eeaa48', '#f8d070'];
const ROCK = ['#3e4150', '#555a6a', '#6f7586', '#8d93a3', '#b2b8c6'];
const FUR = ['#a8968a', '#cbbcae', '#e9dfd2', '#fbf6ee'];
// ---------------- trees ----------------
export function tree(v, kind = 'oak') {
  const c = cv(48, 60), g = c.getContext('2d');
  // trunk + roots
  const T = ['#4a2c18', '#6b4224', '#8a5a32', '#a87444'];
  for (let y = 34; y < 54; y++) { const w = y > 49 ? 8 + (y - 49) : 6; for (let x = 0; x < w; x++) R(g, 24 - (w >> 1) + x, y, 1, 1, T[x < 2 ? 0 : x < w - 2 ? 2 : 1]); }
  R(g, 22, 40, 1, 6, T[0]); R(g, 25, 44, 1, 4, T[3]);
  const pal = kind === 'nut' ? AUT : (v % 2 ? LEAF2 : LEAF);
  const r = (a) => hash(v, a, 911);
  const blobs = [[24, 26, 15, 11], [15 + r(1) * 3, 20, 9, 8], [33 - r(2) * 3, 20, 9, 8], [24, 12 + r(3) * 2, 11, 8], [17, 30, 8, 6], [31, 30, 8, 6], [24, 32, 10, 6]];
  for (let i = 0; i < blobs.length; i++) { const [x, y, rx, ry] = blobs[i]; blob(g, x, y, rx, ry, pal, v * 31 + i, 0.22); }
  if (kind === 'nut') for (let i = 0; i < 7; i++) { const x = 12 + r(10 + i) * 24 | 0, y = 14 + r(20 + i) * 18 | 0; R(g, x, y, 2, 2, '#5a3416'); R(g, x, y, 1, 1, '#8a5a2a'); }
  else for (let i = 0; i < 9; i++) { const x = 12 + r(30 + i) * 24 | 0, y = 10 + r(40 + i) * 22 | 0; R(g, x, y, 1, 1, pal[5]); }
  return outline(c, '#1a2410');
}
export function palm(v) { // v0.19: free in-code jungle palm, same outlined pixel style as tree()
  const c = cv(48, 60), g = c.getContext('2d');
  for (let y = 28; y < 56; y++) { const x = 24 + Math.round(Math.sin((y - 28) / 28 * 1.2) * 3); R(g, x - 2, y, 4, 1, '#6b4224'); R(g, x + 1, y, 1, 1, '#8a5a32'); }
  const frond = (a, len, col) => { for (let i = 0; i < len; i++) { const x = Math.round(24 + Math.cos(a) * i * 1.6), y = Math.round(28 + Math.sin(a) * i * 1.2 + i * i * 0.08); R(g, x, y, 2, 1, col); R(g, x, y + 1, 1, 1, col); } };
  const cols = ['#2e6b2a', '#3f8a32', '#5aa83a', '#7cc44a'];
  for (let i = 0; i < 8; i++) frond(-Math.PI / 2 + (i - 3.5) * 0.45, 14, cols[i % 4]);
  R(g, 22, 26, 5, 3, '#8a5a2a'); return outline(c, '#1a2410');
}
export function deadTree(v) {
  const c = cv(48, 64), g = c.getContext('2d'), rr = a => hash(v, a, 77);
  const C = ['#3a1d14', '#6a3422', '#8a4a2e', '#a8623c'];
  const limb = (x, y, a, len, w, d) => { for (let i = 0; i < len; i++) { a += (rr(d * 13 + i) - 0.5) * 0.35; x += Math.cos(a); y += Math.sin(a); for (let k = 0; k < w; k++) R(g, Math.round(x + k * Math.sin(a)), Math.round(y - k * Math.cos(a)), 1, 1, C[k === 0 ? 3 : k === w - 1 ? 1 : 2]); }
    if (d < 3) { limb(x, y, a - 0.6 - rr(d) * 0.3, len * 0.6, Math.max(1, w - 1), d + 1); limb(x, y, a + 0.5 + rr(d + 5) * 0.3, len * 0.55, Math.max(1, w - 1), d + 1); } };
  for (let y = 40; y < 62; y++) { const w = 5 + (y > 56 ? (y - 56) * 2 : 0); for (let x = 0; x < w; x++) R(g, 24 - (w >> 1) + x, y, 1, 1, C[x === 0 ? 1 : x === w - 1 ? 0 : 2]); }
  limb(24, 42, -Math.PI / 2 - 0.1, 14, 4, 0); limb(23, 48, -Math.PI / 2 - 1.0, 9, 2, 2); limb(26, 46, -Math.PI / 2 + 1.0, 9, 2, 2);
  return outline(c, '#1c0e0a');
}
export function stump() { const c = cv(18, 14), g = c.getContext('2d'); R(g, 4, 4, 10, 8, '#7a4a28'); R(g, 4, 3, 10, 4, '#c8935a'); R(g, 6, 4, 6, 2, '#a87444'); R(g, 8, 4, 2, 1, '#8a5a32'); return outline(c); }
// ---------------- plants & props ----------------
export function bush(berries) { const c = cv(22, 18), g = c.getContext('2d'); blob(g, 11, 10, 9, 6.5, LEAF, berries ? 5 : 6, 0.25); blob(g, 7, 8, 5, 4, LEAF, 8); blob(g, 15, 8, 5, 4, LEAF, 9);
  if (berries) for (let i = 0; i < 8; i++) { const x = 4 + hash(i, 1, 3) * 13 | 0, y = 5 + hash(i, 2, 3) * 9 | 0; R(g, x, y, 2, 2, '#c8203c'); R(g, x, y, 1, 1, '#ff7a8a'); }
  return outline(c, '#17300f'); }
export function rocks(v) { const c = cv(30, 22), g = c.getContext('2d'); blob(g, 12, 13, 9, 7, ROCK, v, 0.12); blob(g, 21, 15, 6, 5, ROCK, v + 1, 0.12); blob(g, 8, 17, 4, 3, ROCK, v + 2, 0.1);
  if (v % 2) { blob(g, 12, 9, 5, 2.5, ['#3f6a2a', '#5a8a36', '#78a848'], v + 3, 0.3); } return outline(c, '#1d1f28'); }
export function reeds(f) { const c = cv(16, 24), g = c.getContext('2d'); const st = [[3, 15], [7, 19], [11, 14], [13, 11]];
  st.forEach(([x, h], i) => { const sw = Math.round(Math.sin(f * 1.4 + i) * 1.2); for (let y = 0; y < h; y++) { const xx = x + Math.round(sw * y / h); R(g, xx, 23 - y, 1, 1, y < h - 4 ? (i % 2 ? '#4f8a30' : '#6aa83a') : '#6b3a1e'); if (y >= h - 4) R(g, xx + 1, 23 - y, 1, 1, '#8a5030'); } });
  R(g, 1, 18, 3, 1, '#7cc44a'); R(g, 10, 20, 4, 1, '#7cc44a'); return outline(c, '#1f3018'); }
export function torch(f) { const c = cv(10, 22), g = c.getContext('2d'); R(g, 4, 8, 2, 13, '#6b4224'); R(g, 4, 8, 1, 13, '#8a5a32'); R(g, 3, 7, 4, 2, '#3a3a40');
  const fl = [[3, 1, 4, 6], [3, 0, 4, 7], [2, 2, 5, 5]][((f % 3) + 3) % 3]; R(g, fl[0], fl[1], fl[2], fl[3], '#ff7a1a'); R(g, fl[0] + 1, fl[1] + 2, fl[2] - 2, fl[3] - 2, '#ffd34a'); return outline(c, '#20140c'); }
export function lamp(lit) { const c = cv(12, 36), g = c.getContext('2d'); R(g, 5, 10, 2, 24, '#2c3a3e'); R(g, 5, 10, 1, 24, '#4a6064'); R(g, 3, 33, 6, 2, '#2c3a3e');
  R(g, 3, 3, 6, 7, '#2c3a3e'); R(g, 4, 4, 4, 5, lit ? '#ffd27a' : '#8fb8b0'); R(g, 4, 4, 1, 2, '#fff'); R(g, 2, 2, 8, 1, '#3e5054'); R(g, 5, 0, 2, 2, '#3e5054'); return outline(c, '#101618'); }
export function campfire(f) { const c = cv(22, 22), g = c.getContext('2d');
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283; blob(g, 11 + Math.cos(a) * 7.5, 15 + Math.sin(a) * 4.5, 2.2, 1.8, ROCK, i, 0.05); }
  R(g, 6, 14, 10, 2, '#6b4224'); R(g, 8, 12, 2, 5, '#8a5a32'); R(g, 12, 12, 2, 5, '#5a3a1e');
  const h = [9, 11, 8][f % 3]; for (let y = 0; y < h; y++) { const w = Math.max(1, Math.round((1 - y / h) * 7)); R(g, 11 - (w >> 1) + ((f + y) % 3 === 0 ? 1 : 0), 14 - y, w, 1, y < h * 0.35 ? '#ff6a1a' : y < h * 0.7 ? '#ffa62a' : '#ffe47a'); }
  return outline(c, '#20140c'); }
export function chest() { const c = cv(16, 14), g = c.getContext('2d'); R(g, 2, 4, 12, 8, '#8a5a32'); R(g, 2, 3, 12, 3, '#b07a44'); R(g, 2, 7, 12, 1, '#4a2c18'); R(g, 7, 6, 2, 3, '#e2c060'); R(g, 2, 4, 1, 8, '#5e3a1f'); R(g, 13, 4, 1, 8, '#5e3a1f'); return outline(c); }
export function barrel() { const c = cv(12, 14), g = c.getContext('2d'); R(g, 2, 2, 8, 11, '#9a6236'); R(g, 3, 2, 2, 11, '#b8804a'); R(g, 2, 4, 8, 1, '#4a4650'); R(g, 2, 10, 8, 1, '#4a4650'); R(g, 2, 1, 8, 2, '#c8935a'); R(g, 3, 1, 6, 1, '#7a4a28'); return outline(c); }
export function logpile() { const c = cv(22, 16), g = c.getContext('2d'); for (const [x, y] of [[2, 8], [8, 8], [14, 8], [5, 3], [11, 3]]) { R(g, x, y, 6, 6, '#8a5a32'); R(g, x + 1, y + 1, 4, 4, '#d6a46a'); R(g, x + 2, y + 2, 2, 2, '#a87444'); } return outline(c); }
export function well() { const c = cv(26, 30), g = c.getContext('2d'); R(g, 3, 6, 2, 16, '#6b4224'); R(g, 21, 6, 2, 16, '#6b4224'); R(g, 1, 2, 24, 3, '#b8803c'); R(g, 3, 1, 20, 2, '#e2b04a');
  for (let x = 3; x < 23; x++) for (let y = 16; y < 28; y++) { const k = ((x >> 2) + (y >> 2)) & 1; R(g, x, y, 1, 1, y < 18 ? '#a0a6b4' : (k ? '#7d8392' : '#8d93a3')); } R(g, 6, 15, 14, 3, '#1c3a4a'); R(g, 12, 6, 1, 10, '#a08060'); R(g, 11, 13, 3, 3, '#6b4224'); return outline(c, '#1d1f28'); }
export function board() { const c = cv(24, 22), g = c.getContext('2d'); R(g, 3, 8, 2, 14, '#5e3a1f'); R(g, 19, 8, 2, 14, '#5e3a1f'); R(g, 1, 2, 22, 12, '#8a5a32'); R(g, 2, 3, 20, 10, '#6b4224');
  R(g, 4, 4, 6, 4, '#f0e2c0'); R(g, 12, 5, 7, 5, '#e8d6b0'); R(g, 5, 9, 5, 3, '#f0e2c0'); R(g, 6, 5, 3, 1, '#7a6a5a'); R(g, 13, 6, 4, 1, '#7a6a5a'); return outline(c); }
export function gravestone(v) { const c = cv(14, 18), g = c.getContext('2d'); const S = ['#5a6070', '#7a8092', '#9aa0b0'];
  if (v % 2) { R(g, 6, 2, 2, 13, S[1]); R(g, 3, 5, 8, 2, S[1]); R(g, 6, 2, 1, 13, S[2]); } else { R(g, 3, 4, 8, 11, S[1]); R(g, 4, 3, 6, 1, S[1]); R(g, 3, 4, 2, 11, S[2]); R(g, 6, 7, 2, 4, S[0]); R(g, 5, 8, 4, 1, S[0]); }
  R(g, 2, 15, 10, 2, '#4a3a2a'); if (v % 3 === 0) R(g, 8, 12, 3, 3, '#4a7a3a'); return outline(c, '#15151c'); }
export function pumpkin(lit) { const c = cv(16, 14), g = c.getContext('2d'); blob(g, 8, 8, 6.5, 5, ['#8a3a0a', '#c4580e', '#e8781a', '#f8a040'], 3, 0.05); R(g, 7, 1, 2, 3, '#4a6a2a');
  R(g, 5, 9, 1, 2, '#6a2a08'); R(g, 10, 9, 1, 2, '#6a2a08'); R(g, 8, 4, 1, 9, '#a8480c');
  const f = lit ? '#ffe24a' : '#3a1808'; R(g, 4, 6, 2, 2, f); R(g, 10, 6, 2, 2, f); R(g, 5, 10, 6, 1, f); R(g, 6, 11, 1, 1, f); R(g, 9, 11, 1, 1, f); return outline(c, '#2a1206'); }
export function scarecrow() { const c = cv(26, 34), g = c.getContext('2d'); R(g, 12, 10, 2, 24, '#6b4224'); R(g, 3, 13, 20, 2, '#6b4224');
  for (let y = 12; y < 26; y++) { const w = 6 + (y - 12) * 0.6 | 0; R(g, 13 - w, y, w * 2, 1, y % 3 ? '#e8e4dc' : '#c8c4bc'); } R(g, 4, 15, 3, 4, '#d8b860'); R(g, 19, 15, 3, 4, '#d8b860');
  blob(g, 13, 8, 5.5, 4.5, ['#8a3a0a', '#c4580e', '#e8781a', '#f8a040'], 4, 0.05); R(g, 10, 7, 2, 2, '#ffe24a'); R(g, 15, 7, 2, 2, '#ffe24a'); R(g, 11, 10, 5, 1, '#3a1808');
  R(g, 7, 3, 12, 2, '#3a2a3a'); R(g, 10, 0, 6, 3, '#3a2a3a'); R(g, 10, 2, 6, 1, '#7a2a4a'); return outline(c, '#1a0e10'); }
export function spikeFence() { const c = cv(16, 22), g = c.getContext('2d'); R(g, 0, 8, 16, 2, '#2e3e44'); R(g, 0, 16, 16, 2, '#2e3e44');
  for (let x = 1; x < 16; x += 4) { R(g, x, 4, 2, 18, '#3e5258'); R(g, x, 4, 1, 18, '#5a7278'); R(g, x, 2, 2, 2, '#5a7278'); R(g, x, 1, 1, 1, '#8aa0a4'); } return outline(c, '#0e1416'); }
export function skull() { const c = cv(10, 9), g = c.getContext('2d'); R(g, 1, 0, 8, 6, '#e8e4dc'); R(g, 2, 6, 6, 2, '#d0ccc4'); R(g, 2, 2, 2, 2, '#2a2228'); R(g, 6, 2, 2, 2, '#2a2228'); R(g, 4, 5, 2, 1, '#6a6268'); R(g, 3, 7, 1, 1, '#6a6268'); R(g, 5, 7, 1, 1, '#6a6268'); R(g, 1, 0, 3, 1, '#fff'); return outline(c, '#1a1418'); }
export function pillar() { const c = cv(16, 34), g = c.getContext('2d'); R(g, 4, 8, 8, 22, '#8d93a3'); R(g, 4, 8, 2, 22, '#b2b8c6'); R(g, 10, 8, 2, 22, '#6f7586'); R(g, 2, 28, 12, 4, '#6f7586'); R(g, 2, 28, 12, 1, '#b2b8c6');
  R(g, 2, 5, 12, 4, '#9aa0b0'); R(g, 2, 5, 12, 1, '#c8cdd8'); R(g, 4, 1, 8, 4, '#6f7586'); R(g, 5, 0, 6, 2, '#8d93a3'); return outline(c, '#1d1f28'); }
export function bookshelf() { const c = cv(24, 30), g = c.getContext('2d'); R(g, 1, 3, 22, 26, '#5e3a1f'); R(g, 0, 1, 24, 3, '#8a5a32');
  const B = ['#a83a3a', '#3a6aa8', '#3a8a5a', '#c8a03a', '#7a4a9a', '#d8d0c0']; for (let s = 0; s < 3; s++) { let x = 3; while (x < 21) { const w = 2 + (hash(x, s, 5) * 2 | 0), h = 5 + (hash(s, x, 6) * 3 | 0); R(g, x, 6 + s * 8 + (8 - h), w, h, B[hash(x, s, 9) * 6 | 0]); x += w; } R(g, 2, 13 + s * 8, 20, 1, '#3a2414'); }
  return outline(c); }
export function bramble(v) { const c = cv(14, 12), g = c.getContext('2d'); const C = ['#4a2a5e', '#6e3a8a', '#9a5ab8', '#c48ae0'];
  for (let i = 0; i < 5; i++) { const x = 2 + hash(v, i, 1) * 10 | 0, y = 3 + hash(v, i, 2) * 7 | 0; R(g, x, y, 1, 11 - y, C[1]); R(g, x - 1, y + 1, 1, 1, C[2]); R(g, x + 1, y + 2, 1, 1, C[3]); }
  R(g, 3, 9, 8, 2, C[0]); return outline(c, '#1a0c24'); }
export function construction(top) { const c = cv(18, 20), g = c.getContext('2d'); const col = { 8: ['#c8935a', '#8a5a32'], 9: ['#a0a6b4', '#6f7586'], 23: ['#f0c45a', '#b8862a'], 6: ['#a87444', '#6b4224'], 10: ['#6b7286', '#474c5f'] }[top] || ['#c8935a', '#8a5a32'];
  R(g, 1, 1, 16, 8, col[0]); R(g, 1, 9, 16, 9, col[1]); R(g, 1, 9, 16, 1, '#00000040'); for (let x = 1; x < 17; x += 5) R(g, x, 10, 1, 8, '#00000030'); return outline(c); }
// ---------------- crops (baked in ground) ----------------
export function crop(stage) { const c = cv(16, 16), g = c.getContext('2d');
  for (let i = 0; i < 3; i++) { const x = 3 + i * 5; if (stage === 0) { R(g, x, 10, 1, 2, '#6aa83a'); R(g, x + 1, 9, 1, 1, '#8ac84a'); }
    else if (stage === 1) { R(g, x, 7, 1, 6, '#4f8a30'); R(g, x - 1, 8, 1, 2, '#7cc44a'); R(g, x + 1, 9, 1, 2, '#7cc44a'); }
    else if (stage === 2) { R(g, x, 3, 1, 10, '#4f8a30'); R(g, x - 1, 5, 1, 4, '#7cc44a'); R(g, x + 1, 6, 1, 4, '#8ad050'); R(g, x, 2, 1, 2, '#a8d860'); }
    else { R(g, x, 4, 1, 9, '#b8962a'); R(g, x - 1, 1, 3, 4, '#f0c84a'); R(g, x, 1, 1, 3, '#fff0a0'); R(g, x + 1, 6, 1, 3, '#d8b03a'); } } return outline(c, '#2a3010', 60); }
// ---------------- buildings ----------------
const THATCH = ['#7a5218', '#a8742a', '#d09a3a', '#e8b84e', '#f6d47a'];
export function hut(stone, color, lit) {
  const c = cv(56, 64), g = c.getContext('2d');
  // walls (front face) y 34..58
  const wx = 6, ww = 44, wy = 34, wh = 24;
  if (!stone) { for (let y = wy; y < wy + wh; y++) { const row = (y - wy) % 5; R(g, wx, y, ww, 1, row === 0 ? '#5e3a1f' : row === 1 ? '#b07a44' : row === 4 ? '#7a4a28' : '#9a6236'); }
    for (let y = wy; y < wy + wh; y += 5) { R(g, wx - 2, y, 3, 5, '#c8935a'); R(g, wx + ww - 1, y, 3, 5, '#c8935a'); R(g, wx - 1, y + 1, 1, 3, '#8a5a32'); R(g, wx + ww, y + 1, 1, 3, '#8a5a32'); } }
  else { for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) { const r = (y - wy) >> 2, off = (r & 1) * 4, m = (y - wy) % 4 === 3 || ((x + off) % 8 === 0); R(g, x, y, 1, 1, m ? '#5d6270' : (hash(x >> 3, r, 4) < 0.3 ? '#8d93a3' : '#a3a9b8')); } R(g, wx, wy, ww, 1, '#c8cdd8'); }
  // door
  R(g, 23, 44, 10, 14, '#3a2414'); R(g, 24, 45, 8, 13, '#6b4224'); R(g, 27, 45, 1, 13, '#4a2c18'); R(g, 30, 51, 1, 2, '#e2c060');
  // windows
  for (const x of [11, 38]) { R(g, x, 42, 8, 7, '#3a2414'); R(g, x + 1, 43, 6, 5, lit ? '#ffc65a' : '#2a4a6a'); R(g, x + 4, 43, 1, 5, '#3a2414'); R(g, x + 1, 45, 6, 1, '#3a2414'); if (!lit) R(g, x + 1, 43, 2, 1, '#7aa8d0'); R(g, x, 49, 8, 1, '#8a5a32'); }
  // thatch roof: overhang, rows
  for (let y = 4; y < 38; y++) { const inset = Math.max(0, 9 - y) * 1.6 | 0; const x0 = 1 + inset, x1 = 55 - inset;
    for (let x = x0; x < x1; x++) { const row = (y - 4) % 6, n = hash(x, y, 12); let k = row === 5 ? 1 : row === 0 ? 3 : 2; if (n < 0.18) k--; if (n > 0.85) k++; if (y > 33) k = Math.min(k, 1) + (row === 5 ? 0 : 1); if (x < x0 + 2) k = Math.max(0, k - 1); if (x > x1 - 3) k = Math.max(0, k - 1); R(g, x, y, 1, 1, THATCH[Math.max(0, Math.min(4, k))]); }
    if ((y - 4) % 6 === 5) for (let x = x0; x < x1; x += 3) R(g, x, y + 1, 1, 1, THATCH[0]); }
  R(g, 10, 4, 36, 2, THATCH[4]); R(g, 1, 36, 54, 2, THATCH[0]);
  if (stone) { R(g, 40, 0, 7, 10, '#6f7586'); R(g, 40, 0, 7, 2, '#b2b8c6'); R(g, 42, 1, 3, 1, '#2a2a30'); }
  // tribe pennant
  R(g, 8, 0, 1, 10, '#4a2c18'); R(g, 9, 1, 6, 4, color); R(g, 9, 4, 4, 1, color); R(g, 9, 1, 6, 1, '#ffffff60');
  return outline(c, '#22140a');
}
export function palisade(kind, v) {
  const c = cv(18, 30), g = c.getContext('2d');
  if (kind === 'wood') { for (let i = 0; i < 3; i++) { const x = 1 + i * 5 + (i ? 1 : 0), top = 5 + (hash(v, i, 3) * 3 | 0); for (let y = top; y < 28; y++) { R(g, x, y, 5, 1, '#8a5a32'); R(g, x, y, 1, 1, '#b07a44'); R(g, x + 4, y, 1, 1, '#5e3a1f'); }
      R(g, x + 1, top - 2, 3, 2, '#a87444'); R(g, x + 2, top - 3, 1, 1, '#c8935a'); } R(g, 1, 12, 16, 2, '#5e3a1f'); R(g, 1, 22, 16, 2, '#5e3a1f'); }
  else { for (let y = 4; y < 28; y++) for (let x = 0; x < 18; x++) { const r = (y - 4) >> 2, m = (y - 4) % 4 === 3 || ((x + (r & 1) * 4) % 8 === 0); R(g, x, y, 1, 1, y < 8 ? '#b2b8c6' : m ? '#5d6270' : (hash(x >> 2, r, v) < 0.25 ? '#7d8392' : '#959bab')); }
    for (let x = 0; x < 18; x += 6) { R(g, x, 0, 4, 4, '#a3a9b8'); R(g, x, 0, 4, 1, '#c8cdd8'); } }
  return outline(c, '#1c140e');
}
export function gate(open, stone) { const c = cv(20, 32), g = c.getContext('2d');
  R(g, 0, 2, 4, 28, stone ? '#8d93a3' : '#6b4224'); R(g, 16, 2, 4, 28, stone ? '#8d93a3' : '#6b4224'); R(g, 0, 0, 20, 4, stone ? '#a3a9b8' : '#8a5a32');
  if (!open) { for (let x = 4; x < 16; x++) R(g, x, 5, 1, 25, x % 3 === 0 ? '#5e3a1f' : '#a87444'); R(g, 4, 10, 12, 2, '#3e3e46'); R(g, 4, 22, 12, 2, '#3e3e46'); R(g, 9, 15, 2, 3, '#e2c060'); }
  else { R(g, 4, 5, 3, 25, '#a87444'); R(g, 13, 5, 3, 25, '#a87444'); R(g, 7, 5, 6, 25, '#00000000'); }
  return outline(c, '#1c140e'); }
// ---------------- Stefan's mansion ----------------
export function mansion(lit) {
  const Wd = 304, Hd = 300, c = cv(Wd, Hd), g = c.getContext('2d'), base = Hd - 6, wins = [];
  const WALL = ['#6e7286', '#8f93a8', '#b3b7c8', '#cfd2de'], ROOF = ['#1c2233', '#2c3548', '#3e4a63', '#56637f', '#71809e'];
  const shingle = (x0, y0, w, h, peak) => { for (let y = 0; y < h; y++) { const inset = peak ? Math.round((1 - y / h) * w / 2) : 0; for (let x = inset; x < w - inset; x++) { const row = y % 5, sc = (x + (Math.floor(y / 5) % 2) * 3) % 6; let k = row === 4 ? 1 : (sc === 0 ? 1 : 2) + (row === 0 ? 1 : 0); if (x < inset + 2) k = 0; if (x > w - inset - 3) k = 1; if (hash(x, y, 33) > 0.92) k = 3; R(g, x0 + x, y0 + y, 1, 1, ROOF[k]); } } };
  const wall = (x0, y0, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = y >> 2, m = y % 4 === 3 || ((x + (r & 1) * 5) % 10 === 0); R(g, x0 + x, y0 + y, 1, 1, m ? WALL[0] : (x < 2 ? WALL[3] : hash(x >> 2, r, 8) < 0.2 ? WALL[1] : WALL[2])); } R(g, x0, y0, w, 2, WALL[3]); };
  const win = (x, y, w, h) => { R(g, x - 1, y - 3, w + 2, h + 4, '#1c2233'); for (let i = 0; i < 3; i++) R(g, x + i, y - 2 + (i === 0 ? 1 : 0), w - i * 2, 1, '#1c2233');
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) R(g, x + xx, y + yy, 1, 1, lit ? (yy < 2 ? '#ffd27a' : '#ff9a3a') : (yy < h / 2 ? '#7ec4ff' : '#3a78c8')); R(g, x + (w >> 1), y, 1, h, '#1c2233'); R(g, x, y + (h >> 1), w, 1, '#1c2233'); if (!lit) R(g, x + 1, y + 1, 1, 2, '#e8f6ff'); R(g, x - 2, y + h, w + 4, 2, WALL[1]); wins.push([x + w / 2, y + h / 2]); };
  // main body
  const bx = 40, bw = 224; wall(bx, base - 92, bw, 92);
  shingle(bx - 6, base - 160, bw + 12, 70, false); R(g, bx - 6, base - 92, bw + 12, 3, ROOF[0]);
  // gables
  for (const [gx, gw] of [[bx + 20, 56], [bx + bw - 76, 56], [bx + 74, 76]]) { shingle(gx - 4, base - 196 + (gw > 60 ? -20 : 0), gw + 8, 70 + (gw > 60 ? 20 : 0), true); }
  wall(bx + 84, base - 130, 56, 40); win(bx + 104, base - 122, 16, 20);
  // windows on facade
  for (const x of [bx + 14, bx + 44, bx + 160, bx + 190]) { win(x, base - 80, 14, 22); win(x, base - 42, 14, 20); }
  // ivy
  for (let i = 0; i < 160; i++) { const x = bx + (hash(i, 1, 44) < 0.5 ? hash(i, 2, 44) * 30 : bw - hash(i, 3, 44) * 34) | 0, y = base - 4 - hash(i, 4, 44) * 70 | 0; R(g, x, y, 2, 2, ['#2e5a2a', '#3f7a32', '#21401f'][i % 3]); }
  // door + steps
  const dx = bx + bw / 2 - 14; R(g, dx - 4, base - 48, 36, 48, '#1c2233'); for (let i = 0; i < 6; i++) R(g, dx - 4 + i, base - 54 + i, 36 - i * 2, 1, '#1c2233');
  R(g, dx, base - 44, 28, 44, '#2a3a6a'); R(g, dx + 13, base - 44, 2, 44, '#141c38'); for (let y = base - 40; y < base; y += 8) { R(g, dx + 2, y, 9, 1, '#3e5a9a'); R(g, dx + 17, y, 9, 1, '#3e5a9a'); } R(g, dx + 10, base - 22, 2, 3, '#e2c060'); R(g, dx + 16, base - 22, 2, 3, '#e2c060');
  R(g, dx - 8, base - 2, 44, 3, '#8f93a8'); R(g, dx - 12, base + 1, 52, 3, '#6e7286');
  // towers
  for (const [tx, tall] of [[0, 1], [Wd - 44, 1]]) { wall(tx + 2, base - 150 - tall * 20, 40, 150 + tall * 20); for (let y = base - 140; y < base - 20; y += 40) win(tx + 15, y, 12, 18);
    for (let y = 0; y < 76; y++) { const w = Math.round(4 + (y / 76) * 44); for (let x = 0; x < w; x++) R(g, tx + 22 - w / 2 + x, base - 246 - tall * 20 + y + 2, 1, 1, ROOF[x < 2 ? 0 : x > w - 3 ? 1 : ((y >> 2) + (x >> 2)) % 3 ? 2 : 3]); }
    R(g, tx + 21, base - 252 - tall * 20, 2, 8, '#3e4a63'); R(g, tx + 18, base - 249 - tall * 20, 8, 2, '#3e4a63'); }
  // central spire
  for (let y = 0; y < 60; y++) { const w = Math.round(2 + y / 60 * 18); for (let x = 0; x < w; x++) R(g, Wd / 2 - w / 2 + x, base - 270 + y, 1, 1, ROOF[x < 1 ? 0 : x > w - 2 ? 1 : 2]); }
  R(g, Wd / 2 - 1, base - 282, 2, 14, '#3e4a63'); win(Wd / 2 - 4, base - 212, 8, 12);
  return { canvas: outline(c, '#0e1018'), wins, base };
}
// ---------------- creatures ----------------
export function thronglet(color, pose, f) {
  const c = cv(18, 20), g = c.getContext('2d'); const hop = pose === 'walk' ? [0, 2, 3, 1][f % 4] : pose === 'idle' ? (f % 2) : 0;
  const by = 13 - hop, sq = pose === 'sleep' ? 0.7 : (pose === 'idle' && f % 2 ? 0.94 : 1);
  if (pose !== 'sleep') { const fa = pose === 'walk' ? f % 2 : 0; R(g, 5 + fa, 17 - hop * 0 , 3, 2, '#3a2a22'); R(g, 10 - fa, 17, 3, 2, '#3a2a22'); }
  R(g, 4, by - 7, 2, 3, FUR[2]); R(g, 12, by - 7, 2, 3, FUR[2]); R(g, 4, by - 8, 1, 1, '#f0b0b8'); // ears
  blob(g, 9, by - (pose === 'sleep' ? -2 : 0), 6.2, 5.4 * sq, FUR, 21 + f, 0.22);
  R(g, 5, by + 2, 8, 1, color); R(g, 6, by + 3, 6, 1, color); R(g, 11, by + 3, 2, 2, color); // scarf
  const ey = by - 3 + (pose === 'sleep' ? 3 : 0);
  if (pose === 'sleep') { R(g, 6, ey, 2, 1, '#2a1a1a'); R(g, 11, ey, 2, 1, '#2a1a1a'); }
  else if (pose === 'fear') { R(g, 5, ey - 1, 3, 3, '#ffffff'); R(g, 11, ey - 1, 3, 3, '#ffffff'); R(g, 6, ey, 1, 1, '#111'); R(g, 12, ey, 1, 1, '#111'); R(g, 8, ey + 3, 2, 1, '#6a2a2a'); R(g, 15, ey - 3, 1, 2, '#7ac8ff'); }
  else if (pose === 'happy') { for (const ex of [6, 11]) { R(g, ex, ey, 1, 1, '#151018'); R(g, ex + 1, ey - 1, 1, 1, '#151018'); R(g, ex + 2, ey, 1, 1, '#151018'); } R(g, 8, ey + 2, 3, 1, '#6a2a2a'); R(g, 9, ey + 3, 1, 1, '#e86a7a'); R(g, 5, ey + 2, 2, 1, '#f4a0a8'); R(g, 12, ey + 2, 2, 1, '#f4a0a8'); }
  else if (pose === 'sad') { R(g, 6, ey, 2, 2, '#151018'); R(g, 11, ey, 2, 2, '#151018'); R(g, 5, ey - 2, 3, 1, '#7a5a4a'); R(g, 11, ey - 2, 3, 1, '#7a5a4a'); R(g, 8, ey + 3, 3, 1, '#4a2a2a'); R(g, 7, ey + 2, 1, 1, '#4a2a2a'); R(g, 11, ey + 2, 1, 1, '#4a2a2a'); R(g, 6, ey + 2, 1, 2, '#7ac8ff'); }
  else if (f % 4 === 3 && pose === 'idle') { R(g, 6, ey + 1, 2, 1, '#151018'); R(g, 11, ey + 1, 2, 1, '#151018'); R(g, 9, ey + 2, 1, 1, '#6a2a2a'); }
  else { R(g, 6, ey - 1, 2, 3, '#151018'); R(g, 11, ey - 1, 2, 3, '#151018'); R(g, 6, ey - 1, 1, 1, '#ffffff'); R(g, 11, ey - 1, 1, 1, '#ffffff'); R(g, 7, ey + 1, 1, 1, '#4a3a5a'); R(g, 12, ey + 1, 1, 1, '#4a3a5a'); R(g, 5, ey + 2, 1, 1, '#f4a0a8'); R(g, 13, ey + 2, 1, 1, '#f4a0a8'); R(g, 8, ey + 2, 1, 1, '#6a2a2a'); R(g, 10, ey + 2, 1, 1, '#6a2a2a'); R(g, 9, ey + 3, 1, 1, '#6a2a2a'); }
  if (pose === 'walk') { const sw = [0, 1, 0, -1][f % 4]; R(g, 2, by + sw, 2, 2, FUR[1]); R(g, 14, by - sw, 2, 2, FUR[1]); } else if (pose !== 'sleep') { R(g, 2, by + 1, 2, 2, FUR[1]); R(g, 14, by + 1, 2, 2, FUR[1]); }
  if (pose !== 'sleep') R(g, 15, by + 4, 2, 1, FUR[0]);
  return outline(c, '#3a2a2a');
}
// v0.13: guard gear — steel helm with a red plume, spear and shield, drawn over Ian's thronglet sprite
// so a guard reads at a glance. (x, y) = sprite centre-bottom in art px, w/h = sprite size, flip = facing.
export function guardGear(g, x, y, w, h, flip) {
  const R2 = (xx, yy, ww, hh, c) => { g.fillStyle = c; g.fillRect(xx, yy, ww, hh); };
  const hx = Math.round(x - 4), hy = Math.round(y - h + 1);
  R2(hx, hy, 8, 3, '#8d93a3'); R2(hx, hy, 8, 1, '#d8dde6'); R2(hx, hy + 3, 8, 1, '#5d6270'); // steel helm
  R2(hx + 3, hy - 2, 2, 2, '#c8203c'); // red plume
  const sx = Math.round(x + flip * (w / 2 + 1)); // spear, on the facing side
  R2(sx - 1, y - h - 4, 2, h + 3, '#6b4224'); R2(sx - 1, y - h - 6, 2, 3, '#c8cdd8'); R2(sx - 2, y - h - 6, 4, 1, '#eef2f6');
  const qx = Math.round(x - flip * (w / 2 + 2)); // shield, on the other side
  R2(qx - 2, y - h + 7, 4, 6, '#7a4a2a'); R2(qx - 2, y - h + 7, 4, 1, '#a87444'); R2(qx - 1, y - h + 9, 2, 2, '#c9d4e0');
}
export function vampire(f, stefan, moving) {
  const c = cv(22, 30), g = c.getContext('2d'); const fl = moving ? f % 2 : 0;
  // cape (back)
  for (let y = 9; y < 28; y++) { const w = Math.round(6 + (y - 9) * 0.38 + (fl && y > 18 ? 1 : 0)); R(g, 11 - w, y, w * 2, 1, '#16101c'); R(g, 11 - w, y, 1, 1, '#8a1020'); R(g, 10 + w, y, 1, 1, '#8a1020'); }
  R(g, 11 - 4, 27, 8, 1, '#16101c');
  // body
  R(g, 8, 10, 6, 15, '#2a2234'); R(g, 10, 10, 2, 8, '#d8d0dc'); R(g, 10, 12, 2, 1, '#8a1020'); R(g, 9, 25, 2, 3, '#111'); R(g, 12, 25, 2, 3, '#111');
  // collar
  R(g, 5, 7, 3, 5, '#8a1020'); R(g, 14, 7, 3, 5, '#8a1020'); R(g, 5, 7, 1, 5, '#c42030'); if (stefan) { R(g, 10, 11, 2, 2, '#e2c060'); }
  // head
  blob(g, 11, 5, 4, 4.3, ['#a89aae', '#cfc4d4', '#e8e0ea', '#f6f2f8'], 5, 0.05); R(g, 7, 0, 8, 3, '#141018'); R(g, 7, 3, 1, 3, '#141018'); R(g, 14, 3, 1, 3, '#141018'); R(g, 10, 3, 2, 1, '#141018');
  R(g, 8, 5, 2, 1, '#ff2a2a'); R(g, 12, 5, 2, 1, '#ff2a2a'); R(g, 10, 8, 2, 1, '#5a2030'); R(g, 10, 9, 1, 1, '#fff');
  return outline(c, '#08060a');
}
export function bat(f) { const c = cv(11, 6), g = c.getContext('2d'); R(g, 4, 2, 3, 3, '#1a1420'); if (f % 2) { R(g, 0, 0, 4, 2, '#2a2030'); R(g, 7, 0, 4, 2, '#2a2030'); } else { R(g, 0, 3, 4, 2, '#2a2030'); R(g, 7, 3, 4, 2, '#2a2030'); } R(g, 4, 3, 1, 1, '#ff3030'); R(g, 6, 3, 1, 1, '#ff3030'); return c; }
export function bubble(icon) { const c = cv(13, 13), g = c.getContext('2d'); R(g, 1, 0, 11, 10, '#fff8ec'); R(g, 0, 1, 13, 8, '#fff8ec'); R(g, 4, 10, 3, 1, '#fff8ec'); R(g, 4, 11, 1, 1, '#fff8ec');
  const I = { '!': () => { R(g, 6, 2, 2, 4, '#d02020'); R(g, 6, 7, 2, 1, '#d02020'); }, 'z': () => { R(g, 3, 2, 5, 1, '#3a6ad0'); R(g, 6, 3, 1, 1, '#3a6ad0'); R(g, 5, 4, 1, 1, '#3a6ad0'); R(g, 4, 5, 1, 1, '#3a6ad0'); R(g, 3, 6, 5, 1, '#3a6ad0'); R(g, 9, 4, 2, 1, '#8aa8f0'); R(g, 10, 5, 1, 1, '#8aa8f0'); R(g, 9, 6, 2, 1, '#8aa8f0'); },
    'heart': () => { R(g, 3, 2, 3, 2, '#e02a5a'); R(g, 7, 2, 3, 2, '#e02a5a'); R(g, 3, 4, 7, 2, '#e02a5a'); R(g, 4, 6, 5, 1, '#e02a5a'); R(g, 5, 7, 3, 1, '#e02a5a'); R(g, 4, 2, 1, 1, '#ff9ab0'); },
    'food': () => { R(g, 4, 4, 3, 3, '#c8203c'); R(g, 7, 3, 3, 3, '#c8203c'); R(g, 5, 2, 1, 2, '#4a8a2a'); R(g, 4, 4, 1, 1, '#ff8a9a'); },
    '?': () => { R(g, 4, 2, 5, 1, '#7a5a3a'); R(g, 8, 3, 1, 2, '#7a5a3a'); R(g, 6, 5, 2, 1, '#7a5a3a'); R(g, 6, 7, 2, 1, '#7a5a3a'); },
    'anger': () => { R(g, 3, 2, 2, 2, '#d02020'); R(g, 8, 2, 2, 2, '#d02020'); R(g, 3, 6, 2, 2, '#d02020'); R(g, 8, 6, 2, 2, '#d02020'); R(g, 5, 4, 3, 1, '#d02020'); },
    'fish': () => { R(g, 3, 4, 6, 3, '#4a8ad0'); R(g, 9, 3, 2, 5, '#4a8ad0'); R(g, 4, 5, 1, 1, '#10202a'); R(g, 5, 6, 3, 1, '#9ad0ff'); },
    'book': () => { R(g, 3, 2, 7, 7, '#15151c'); R(g, 4, 3, 5, 5, '#24242e'); R(g, 5, 4, 3, 3, '#c8c8d0'); R(g, 9, 2, 1, 7, '#e8e0d0'); },
    'talk': () => { R(g, 3, 4, 1, 1, '#3a3a48'); R(g, 6, 4, 1, 1, '#3a3a48'); R(g, 9, 4, 1, 1, '#3a3a48'); },
    'hammer': () => { R(g, 3, 2, 6, 3, '#7a7e8a'); R(g, 5, 5, 2, 4, '#8a5a32'); },
    'skull': () => { R(g, 4, 2, 5, 4, '#555'); R(g, 5, 6, 3, 2, '#555'); R(g, 5, 3, 1, 1, '#fff'); R(g, 7, 3, 1, 1, '#fff'); } };
  (I[icon] || (() => { }))(); return outline(c, '#3a2a2a');
}
export function item(type) { const c = cv(10, 10), g = c.getContext('2d');
  const D = { berry: () => { R(g, 2, 3, 3, 3, '#c8203c'); R(g, 5, 4, 3, 3, '#a81830'); R(g, 3, 6, 3, 3, '#d8304c'); R(g, 3, 3, 1, 1, '#ff9aaa'); }, nut: () => { R(g, 2, 3, 6, 5, '#8a5a2a'); R(g, 3, 2, 4, 2, '#5a3416'); R(g, 3, 4, 2, 1, '#c8935a'); },
    crop: () => { R(g, 4, 1, 2, 8, '#d8b03a'); R(g, 2, 2, 2, 4, '#f0c84a'); R(g, 6, 2, 2, 4, '#f0c84a'); }, wood: () => { R(g, 1, 3, 8, 4, '#8a5a32'); R(g, 1, 3, 8, 1, '#b07a44'); R(g, 7, 3, 2, 4, '#d6a46a'); },
    stone: () => { R(g, 2, 3, 6, 5, '#8d93a3'); R(g, 2, 3, 3, 2, '#b2b8c6'); R(g, 6, 6, 2, 2, '#6f7586'); }, reed: () => { R(g, 3, 1, 1, 8, '#6aa83a'); R(g, 5, 2, 1, 7, '#7cc44a'); R(g, 3, 1, 1, 2, '#6b3a1e'); R(g, 5, 2, 1, 2, '#6b3a1e'); } };
  (D[type] || D.wood)(); return outline(c, '#24160f'); }
// v0.10 vampire daytime hideouts (not buildings: caves, hollow logs, crypt hollows). 40x30 px.
export function hideout(kind, v) {
  const c = cv(40, 30), g = c.getContext('2d'), rr = a => hash(v, a, 91);
  if (kind === 'cave') {
    const RK = ['#2b2d38', '#3e4150', '#555a6a', '#6f7586', '#8d93a3'];
    for (let y = 6; y < 29; y++) { const hw = Math.round(17 * Math.sqrt(1 - Math.pow((29 - y) / 23, 2))); for (let x = 20 - hw; x < 20 + hw; x++) { const e = Math.min(x - (20 - hw), 20 + hw - 1 - x, y - 6); const n = rr(x * 31 + y) ; R(g, x, y, 1, 1, RK[Math.max(0, Math.min(4, (e < 1 ? 1 : y < 14 ? 3 : 2) + (n > 0.82 ? 1 : n < 0.15 ? -1 : 0)))]); } }
    for (let y = 15; y < 29; y++) { const hw = Math.round(7 * Math.sqrt(Math.max(0, 1 - Math.pow((29 - y) / 14, 2)))); R(g, 20 - hw, y, hw * 2, 1, y < 17 ? '#1a1a22' : '#07060b'); }
    R(g, 13, 27, 14, 2, '#07060b'); R(g, 6, 9, 3, 1, '#b2b8c6'); R(g, 24, 8, 4, 1, '#b2b8c6'); R(g, 31, 13, 2, 1, '#8d93a3');
    for (let i = 0; i < 5; i++) R(g, 3 + i * 8 + (rr(i) * 4 | 0), 27, 2, 2, '#3f6b2a');
  } else if (kind === 'log') {
    const BK = ['#2a160e', '#4a2a18', '#6a3d22', '#8a5530', '#a8703f'];
    for (let y = 12; y < 27; y++) for (let x = 3; x < 36; x++) { const ry = (y - 19.5) / 7.5; if (Math.abs(ry) > 1) continue; const sh = ry < -0.5 ? 4 : ry < 0.1 ? 3 : ry < 0.6 ? 2 : 1; R(g, x, y, 1, 1, BK[(rr(x * 7 + y * 3) > 0.9 ? sh - 1 : sh)]); }
    for (let x = 5; x < 34; x += 4) R(g, x, 14 + (x % 3), 2, 1, '#2a160e');
    for (let y = 12; y < 27; y++) { const ry = (y - 19.5) / 7.5, hw = Math.round(5 * Math.sqrt(Math.max(0, 1 - ry * ry))); R(g, 4 - (hw >> 1), y, hw, 1, '#c08850'); }
    for (let y = 14; y < 25; y++) { const ry = (y - 19.5) / 5.5, hw = Math.round(3 * Math.sqrt(Math.max(0, 1 - ry * ry))); R(g, 4 - (hw >> 1), y, hw, 1, '#07060b'); }
    R(g, 8, 26, 26, 2, 'rgba(10,14,6,0.5)'); R(g, 20, 9, 2, 3, '#3f6b2a'); R(g, 19, 8, 4, 1, '#5aa83a'); R(g, 28, 10, 1, 2, '#5aa83a');
  } else { // crypt hollow: a sunken stone slab half-buried in the earth, dark gap beneath
    const ST = ['#26242e', '#3a3844', '#4d4a58', '#64606f', '#8a8696'];
    R(g, 4, 24, 32, 4, '#2a1f17'); R(g, 5, 23, 30, 1, '#3a2b20');
    for (let y = 10; y < 24; y++) for (let x = 6; x < 34; x++) { const e = Math.min(x - 6, 33 - x, y - 10); const n = rr(x * 13 + y * 5); R(g, x, y, 1, 1, ST[Math.max(0, Math.min(4, (e < 1 ? 4 : y < 13 ? 3 : 2) - (n > 0.88 ? 1 : 0)))]); }
    R(g, 12, 17, 16, 7, '#07060b'); R(g, 12, 16, 16, 1, '#26242e'); R(g, 19, 11, 2, 5, '#8a8696'); R(g, 17, 12, 6, 2, '#8a8696');
    R(g, 7, 21, 2, 1, '#3f6b2a'); R(g, 30, 13, 3, 1, '#3f6b2a'); R(g, 31, 22, 2, 2, '#5aa83a');
  }
  return c;
}
// v0.10 bat form: a big vampire bat (26x16), 4 flap frames
export function bigBat(f) {
  const c = cv(39, 24), g = c.getContext('2d'), D0 = '#120c18', D1 = '#2c1c38', D2 = '#4a3058', M = '#7a4a82'; g.scale(1.5, 1.5);
  const lift = [-4, -1, 2, -1][f % 4];
  // wings: drawn as stepped membranes from body to tips
  for (const s of [-1, 1]) for (let i = 0; i < 10; i++) { const x = 13 + s * (2 + i), y0 = 6 + Math.round(lift * i / 9) - (i > 6 ? 1 : 0), h = Math.max(1, 5 - Math.floor(i / 2.5)); R(g, x, y0, 1, h, i % 3 === 2 ? D0 : D1); if (h > 2) R(g, x, y0 + 1, 1, 1, D2); if (i === 9) R(g, x, y0 - 1, 1, 1, D0); }
  for (const s of [-1, 1]) { R(g, 13 + s * 5, 6 + Math.round(lift * 4 / 9), 1, 3, M); R(g, 13 + s * 8, 6 + Math.round(lift * 7 / 9), 1, 2, M); }
  R(g, 11, 5, 4, 6, D0); R(g, 12, 6, 2, 4, D2); R(g, 11, 3, 1, 2, D0); R(g, 14, 3, 1, 2, D0); R(g, 11, 4, 4, 2, D0);
  R(g, 11, 5, 1, 1, '#ff3030'); R(g, 14, 5, 1, 1, '#ff3030'); R(g, 12, 7, 1, 1, '#e8e0f0'); R(g, 13, 7, 1, 1, '#e8e0f0');
  R(g, 12, 11, 1, 1, D0); R(g, 13, 11, 1, 1, D0);
  return c;
}
