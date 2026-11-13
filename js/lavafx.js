// Dark Forest v0.14.1 — living lava (Kyler, 2026-11-12: "make the lava look alive").
// Fully procedural, no image files: two tileable textures built from sine/value noise at startup
// (a molten core with bright veins, and floating basalt crust plates with glowing cracks), slid
// along each lava channel's downhill direction every frame, masked to the lava tiles, with a slow
// brightness pulse, a glow wave rolling out from the crater, dark cooling crust at the edges,
// a heat shimmer, rising embers, and warm light at night. Same approach as the animated water
// (tileable textures + pattern transforms), drawn on top of the baked lava ground.
import { W, D, RG } from './world.js';
import { cv, hash } from './art.js';
const LM = 8, N = 128; // mask px per tile (2 art px per lava pixel), texture size
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// tileable value noise (period per = cells across N)
function tn(x, y, per, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), m = q => ((q % per) + per) % per;
  const a = hash(m(xi), m(yi), s), b = hash(m(xi + 1), m(yi), s), c = hash(m(xi), m(yi + 1), s), d = hash(m(xi + 1), m(yi + 1), s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const MOLTEN = [[96, 10, 0], [150, 24, 0], [196, 44, 0], [236, 84, 4], [255, 128, 16], [255, 176, 40], [255, 214, 80], [255, 240, 160]];
function makeMolten() { const c = cv(N, N), g = c.getContext('2d'), im = g.createImageData(N, N), d = im.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = x / N, v = y / N;
    const wx = tn(u * 4, v * 4, 4, 11) * 1.4, wy = tn(u * 4 + 7, v * 4 + 3, 4, 12) * 1.4; // domain warp so veins meander
    const f = 0.6 * tn(u * 8 + wx, v * 8 + wy, 8, 13) + 0.4 * tn(u * 16 + wx * 2, v * 16 + wy * 2, 16, 14);
    const vein = Math.pow(1 - Math.abs(2 * tn(u * 6 + wx, v * 6 - wy, 6, 15) - 1), 6); // ridged noise = bright molten veins
    const lv = clamp(f * 0.75 + vein * 0.6 - 0.12, 0, 0.999), col = MOLTEN[(lv * MOLTEN.length) | 0], o = (y * N + x) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
  g.putImageData(im, 0, 0); return c; }
function makeCrust() { const c = cv(N, N), g = c.getContext('2d'), im = g.createImageData(N, N), d = im.data, G = 6, cs = N / G, pts = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.15 + hash(i, j, 21) * 0.7) * cs, (j + 0.15 + hash(i, j, 22) * 0.7) * cs, hash(i, j, 23)]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let f1 = 1e9, f2 = 1e9, id = 0;
    for (const [px, py, h] of pts) for (let oy = -N; oy <= N; oy += N) for (let ox = -N; ox <= N; ox += N) { const dd = Math.hypot(x - px - ox, y - py - oy); if (dd < f1) { f2 = f1; f1 = dd; id = h; } else if (dd < f2) f2 = dd; }
    const o = (y * N + x) * 4, edge = f2 - f1, crusted = id < 0.45; // about half the plates are solid crust, the rest open molten
    if (!crusted) { d[o + 3] = 0; continue; }
    if (edge < 1.6) { d[o] = 255; d[o + 1] = 150; d[o + 2] = 30; d[o + 3] = 150; continue; } // glowing crack between plates
    if (edge < 3.2) { d[o] = 120; d[o + 1] = 34; d[o + 2] = 8; d[o + 3] = 220; continue; }  // hot plate rim
    const sp = hash(x, y, 24), sh = 0.8 + 0.4 * tn(x / N * 16, y / N * 16, 16, 25); d[o] = (sp > 0.93 ? 70 : 38) * sh; d[o + 1] = (sp > 0.93 ? 58 : 30) * sh; d[o + 2] = (sp > 0.93 ? 56 : 32) * sh; d[o + 3] = 248; }
  g.putImageData(im, 0, 0); return c; }
export class LavaFX {
  constructor() { this.w = null; this.embers = []; this.lights = []; }
  setup(w) { this.w = w; this.ok = false; if (!w.lava) return; const V = w.volcano; let x0 = 1e9, z0 = 1e9, x1 = -1, z1 = -1; const tiles = [];
    const lav = this.isLava = new Uint8Array(W * D); for (let k = 0; k < W * D; k++) if (w.lava[k] || (w.region[k] === RG.VOLCANO && Math.hypot(k % W + 0.5 - V.x, ((k / W) | 0) + 0.5 - V.z) < 10)) { lav[k] = 1; /* flows + the crater pool */ const x = k % W, z = (k / W) | 0; tiles.push(k); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!tiles.length) return; x0 = Math.max(0, x0 - 1); z0 = Math.max(0, z0 - 1); x1 = Math.min(W - 1, x1 + 1); z1 = Math.min(D - 1, z1 + 1);
    const bw = x1 - x0 + 1, bh = z1 - z0 + 1; this.b = { x0, z0, x1, z1, bw, bh }; this.tiles = tiles;
    // groups: crater pool (slow swirl) + 8 downhill directions; each group's texture slides its own way
    const NG = 9, gm = [], ga = []; for (let i = 0; i < NG; i++) { const c = cv(bw * LM, bh * LM); gm.push(c); ga.push({ n: 0, x0: 1e9, z0: 1e9, x1: -1, z1: -1, a: i < 8 ? i / 8 * 6.283 : 0 }); }
    const isL = (x, z) => x >= 0 && z >= 0 && x < W && z < D && lav[z * W + x];
    const mg = gm.map(c => { const g = c.getContext('2d'); return { g, im: g.createImageData(c.width, c.height) }; });
    const edge = cv(bw * LM, bh * LM), eg = edge.getContext('2d'), ei = eg.createImageData(edge.width, edge.height);
    for (const k of tiles) { const x = k % W, z = (k / W) | 0, dx = x + 0.5 - V.x, dz = z + 0.5 - V.z, dd = Math.hypot(dx, dz);
      const gi = dd < 11 ? 8 : (((Math.round(Math.atan2(dz, dx) / 6.283 * 8) % 8) + 8) % 8), G = ga[gi]; G.n++; G.x0 = Math.min(G.x0, x); G.z0 = Math.min(G.z0, z); G.x1 = Math.max(G.x1, x); G.z1 = Math.max(G.z1, z);
      const nL = !isL(x - 1, z), nR = !isL(x + 1, z), nU = !isL(x, z - 1), nD = !isL(x, z + 1), M = mg[gi].im.data;
      for (let py = 0; py < LM; py++) for (let px = 0; px < LM; px++) { const gx = (x - x0) * LM + px, gy = (z - z0) * LM + py, o = (gy * bw * LM + gx) * 4;
        let ed = 99; if (nL) ed = Math.min(ed, px + 0.5); if (nR) ed = Math.min(ed, LM - px - 0.5); if (nU) ed = Math.min(ed, py + 0.5); if (nD) ed = Math.min(ed, LM - py - 0.5);
        const jag = hash(gx >> 1, gy >> 1, 31) * 1.4; if (ed < jag * 0.6) continue; // ragged rim: the baked basalt shows through
        M[o + 3] = 255; const ea = ed < 1 + jag ? 170 : ed < 2.2 + jag ? 70 : 0; if (ea) { ei.data[o] = 34; ei.data[o + 1] = 26; ei.data[o + 2] = 28; ei.data[o + 3] = ea; } } }
    mg.forEach((m, i) => m.g.putImageData(m.im, 0, 0)); eg.putImageData(ei, 0, 0);
    this.gm = gm; this.ga = ga; this.edge = edge; this.molten = makeMolten(); this.crust = makeCrust(); this.buf = cv(16, 16); this.tmp = cv(16, 16); this.embers = []; this.ok = true; }
  // ctx is in art px (P per tile). vx0..vz1 = visible tile rect. alpha fades it with zoom.
  draw(ctx, t, dt, P, vx0, vz0, vx1, vz1, alpha, night, erupting) { this.lights = []; if (!this.ok || alpha <= 0.01) return; const b = this.b;
    const X0 = Math.max(b.x0, Math.floor(vx0) - 1), Z0 = Math.max(b.z0, Math.floor(vz0) - 1), X1 = Math.min(b.x1, Math.ceil(vx1) + 1), Z1 = Math.min(b.z1, Math.ceil(vz1) + 1); if (X1 < X0 || Z1 < Z0) { this.embers.length = 0; return; }
    const vw = (X1 - X0 + 1) * LM, vh = (Z1 - Z0 + 1) * LM, sx = (X0 - b.x0) * LM, sz = (Z0 - b.z0) * LM;
    const buf = this.buf, tmp = this.tmp; if (buf.width !== vw || buf.height !== vh) { buf.width = tmp.width = vw; buf.height = tmp.height = vh; }
    const bg = buf.getContext('2d'), tg = tmp.getContext('2d'); bg.imageSmoothingEnabled = tg.imageSmoothingEnabled = false; bg.globalCompositeOperation = 'source-over'; bg.clearRect(0, 0, vw, vh);
    const sp = erupting ? 2.2 : 1; let any = false;
    for (let i = 0; i < this.ga.length; i++) { const G = this.ga[i]; if (!G.n || G.x1 < X0 || G.x0 > X1 || G.z1 < Z0 || G.z0 > Z1) continue; any = true;
      tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, vw, vh);
      // texture coordinates are pinned to the world (X0/Z0 offset) so they don't swim when the camera pans
      const fx = i < 8 ? Math.cos(G.a) : 0, fz = i < 8 ? Math.sin(G.a) : 0, wob = i < 8 ? 0 : 1;
      const mx = -sx - (b.x0 - 0) * LM + fx * t * 5 * sp + wob * Math.sin(t * 0.35) * 10, mz = -sz - b.z0 * LM + fz * t * 5 * sp + wob * Math.cos(t * 0.3) * 10;
      const pm = tg.createPattern(this.molten, 'repeat'); pm.setTransform(new DOMMatrix().translateSelf(mx % N, mz % N)); tg.fillStyle = pm; tg.fillRect(0, 0, vw, vh);
      const pm2 = tg.createPattern(this.molten, 'repeat'); pm2.setTransform(new DOMMatrix().translateSelf((mx * 0.6 + 37) % N, (mz * 0.6 + 71) % N)); tg.globalAlpha = 0.35 + 0.15 * Math.sin(t * 1.3 + i); tg.fillStyle = pm2; tg.fillRect(0, 0, vw, vh); tg.globalAlpha = 1; // second, slower layer: veins shift and boil
      const pc = tg.createPattern(this.crust, 'repeat'); pc.setTransform(new DOMMatrix().translateSelf((mx * 0.55) % N, (mz * 0.55) % N)); tg.fillStyle = pc; tg.fillRect(0, 0, vw, vh); // crust plates drift slower than the melt
      tg.globalCompositeOperation = 'destination-in'; tg.drawImage(this.gm[i], sx, sz, vw, vh, 0, 0, vw, vh);
      bg.drawImage(tmp, 0, 0); }
    if (!any) { this.embers.length = 0; return; }
    // brightness pulse + a glow wave rolling down from the crater, cooling crust at the rims
    bg.globalCompositeOperation = 'source-atop';
    const pulse = (erupting ? 0.16 : 0.07) + (erupting ? 0.1 : 0.06) * Math.sin(t * (erupting ? 3.1 : 1.6)); bg.fillStyle = `rgba(255,190,70,${pulse.toFixed(3)})`; bg.fillRect(0, 0, vw, vh);
    { const V = this.w.volcano, cx = (V.x - X0) * LM, cz = (V.z - Z0) * LM, per = 70 * LM, r = (t * 7 * sp * LM) % per;
      for (const rr of [r, r + per * 0.5]) { const R0 = rr % per, gr = bg.createRadialGradient(cx, cz, Math.max(0, R0 - 6 * LM), cx, cz, R0 + 6 * LM); gr.addColorStop(0, 'rgba(255,230,120,0)'); gr.addColorStop(0.5, `rgba(255,220,110,${erupting ? 0.32 : 0.2})`); gr.addColorStop(1, 'rgba(255,230,120,0)'); bg.fillStyle = gr; bg.fillRect(0, 0, vw, vh); } }
    bg.drawImage(this.edge, sx, sz, vw, vh, 0, 0, vw, vh); bg.globalCompositeOperation = 'source-over';
    const s = P / LM, ox = X0 * P, oz = Z0 * P; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha; ctx.drawImage(buf, ox, oz, vw * s, vh * s);
    // heat shimmer: a faint copy, wobbling a pixel or two
    ctx.globalAlpha = alpha * 0.15; ctx.drawImage(buf, ox + Math.sin(t * 2.3) * 1.5, oz + Math.cos(t * 1.9) * 1.5, vw * s, vh * s);
    // embers
    const vis = []; for (const k of this.tiles) { const x = k % W, z = (k / W) | 0; if (x >= X0 && x <= X1 && z >= Z0 && z <= Z1) vis.push(k); }
    const rate = Math.min(60, vis.length * 0.04) * (erupting ? 3 : 1); let nNew = rate * dt; while (nNew > 0 && this.embers.length < 160 && vis.length) { if (nNew < 1 && Math.random() > nNew) break; nNew--; const k = vis[(Math.random() * vis.length) | 0];
      this.embers.push({ x: k % W + Math.random(), z: ((k / W) | 0) + Math.random(), vx: (Math.random() - 0.5) * 0.4, vz: -0.4 - Math.random() * 0.9, life: 0, T: 0.8 + Math.random() * 1.8, ph: Math.random() * 6.28 }); }
    for (let i = this.embers.length - 1; i >= 0; i--) { const e = this.embers[i]; e.life += dt; if (e.life >= e.T) { this.embers.splice(i, 1); continue; } e.x += (e.vx + Math.sin(e.ph + e.life * 4) * 0.25) * dt; e.z += e.vz * dt; const f = e.life / e.T;
      ctx.globalAlpha = alpha * (1 - f) * (0.7 + 0.3 * Math.sin(e.life * 20 + e.ph)); ctx.fillStyle = f < 0.3 ? '#fff0a0' : f < 0.65 ? '#ffa030' : '#c2400a'; const sz2 = f < 0.4 ? 2 : 1; ctx.fillRect(Math.round(e.x * P), Math.round(e.z * P), sz2, sz2); }
    ctx.restore();
    // warm light at night: one soft light per 5x5 block of visible lava
    if (night > 0.05) { const seen = new Set(); for (const k of vis) { const x = k % W, z = (k / W) | 0, key = (x / 5 | 0) + ',' + (z / 5 | 0); if (seen.has(key)) continue; seen.add(key); this.lights.push([x + 0.5, z + 0.5, 4.2, 'warm', 0.42 + 0.08 * Math.sin(t * 1.6 + x)]); if (this.lights.length > 48) break; } }
  }
}
