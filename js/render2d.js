// Dark Forest v0.2 — Canvas 2D top-down pixel renderer (16 art px per tile, chunk-cached ground, y-sorted sprites, light map)
import { W, D, WATER, CH, NC, B, RG, REGION_NAMES } from './world.js';
// v0.10: bat-form sprite hook. null = the code-drawn bigBat() from art.js (shipping default).
// To swap in an image (e.g. a painted bat), set this to its path, e.g. 'assets/bat.png'.
// v0.11: Kyler's approved 2-frame sheet (left half = wings up, right half = wings down). null = code-drawn bigBat().
export const BAT_SPRITE = 'assets/bat-flap.png';
import * as A from './art.js';
import * as K from './kingsway.js';
const { P, cv, hash, vnoise } = A;
const CP = CH * P; // chunk size in art px (512)
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const T = { DIRT: 0, GRASS: 1, SAND: 2, STONE: 3, WATER: 4, FARM: 5, BRICK: 6, BRIDGE: 7 };
const rgb = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
const H2 = h => { const [r, g, b] = A.hex(h); return rgb(r, g, b); };
const PAL = {
  dirt: ['#e9a65e', '#f0b46a', '#f5c27c', '#d9944f', '#c98444'].map(H2),
  sand: ['#ecd194', '#f3dca2', '#f8e8bc', '#dcbc7e'].map(H2),
  grass: ['#5f9e2e', '#73b53a', '#86c443', '#9ad24e', '#4c8a28'].map(H2), gline: H2('#3f7424'),
  wood: ['#3a6a2a', '#4c8030', '#5d9238', '#6ea43f', '#335e26'].map(H2),
  cor: ['#33283f', '#3d2f4c', '#4a395c', '#56436a', '#2a2034'].map(H2), cline: H2('#1f1828'),
  stone: ['#7a7f8c', '#8d93a0', '#a2a8b4', '#5f6470'].map(H2), sline: H2('#4a4e58'),
  brick: ['#5d6478', '#6b7286', '#7b8296', '#474c5f'].map(H2),
  bank: [H2('#7a4a2c'), H2('#5e3820')], foam: [H2('#d8f6f0'), H2('#b8ece8')],
  farm: ['#7a4a2a', '#8f5a34', '#a06a3c', '#5e3820'].map(H2),
};
const WATERC = [[76, 196, 196], [52, 168, 186], [38, 140, 172], [28, 112, 152], [20, 84, 126]];
// scale a packed rgb() colour by f (r in low byte, b in high byte, as rgb() packs it)
const shadeCol = (c, f) => (255 << 24) | (Math.min(255, Math.round((c >> 16 & 255) * f)) << 16) | (Math.min(255, Math.round((c >> 8 & 255) * f)) << 8) | Math.min(255, Math.round((c & 255) * f));
export class Renderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.chunks = new Map(); this.objs = new Map(); this.spr = new Map(); this.parts = []; this.showLabels = true; this.t = 0;
    this.light = cv(8, 8); this.lctx = this.light.getContext('2d'); this.glowC = {};
    for (const [k, c] of Object.entries({ warm: [255, 170, 80], red: [255, 40, 40], cool: [150, 190, 255], green: [200, 255, 120], purple: [190, 110, 255] })) { const g = cv(64, 64), x = g.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(0.35, `rgba(${c},.55)`); gr.addColorStop(1, `rgba(${c},0)`); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); this.glowC[k] = g; }
    this.ripple = this.makeRipple(0); this.ripple2 = this.makeRipple(1); this.fogTex = this.makeFog();
    this.lod = { thronglet: [], stefan: [], penguin: [], tumnus: [], guard: [] }; for (const [n, hs] of [['thronglet', [24, 48, 96, 192]], ['stefan', [32, 64, 128, 256]], ['penguin', [24, 48, 96, 192]], ['tumnus', [24, 48, 96, 192]], ['guard', [24, 48, 96, 192]]]) for (const h of [...hs, 'full']) { const im = new Image(); im.onload = () => { this.lod[n].push(im); this.lod[n].sort((a, b) => a.height - b.height); }; im.src = `assets/${n}${h === 'full' ? '' : '_' + h}.png`; }
    // v0.15: 8-directional idle sprites, cropped to opaque bbox, with LODs. dir = atan2(dx, dz): 0 = south, PI/2 = east, PI = north.
    // v0.21 terrain detail: landmark pictures cut (with Kyler's permission) from his own Grok Imagine reference island (26875_7_647f.jpg), masked to an ellipse so they blend into the ground instead of showing a rectangle. Drawn over the ground in render(), so they appear in both close and far views, under characters.
    this.ref = {}; for (const key of ['volcano', 'jungle', 'snow', 'swamp']) // v0.24: mountain landmark was loaded but never drawn, dropped to save size/memory { const im = new Image(); im.onload = () => { this.ovDirty = true; }; im.src = `assets/ref/${key}.png`; this.ref[key] = im; }
    // v0.22 far map: Kyler's full reference island, pixelated to 1536x1536 (3x3 pixels per game tile, v0.24) so far view is his image, in pixel form, matching the game's pixel terrain instead of a smooth photo that would pop when you zoom in.
    this.refFull = new Image(); this.refFull.onload = () => { this.ovDirty = true; }; this.refFull.src = 'assets/ref/full_4608.jpg'; // v0.24: 4608 = 512 x 9, so each game tile now has 9x9 pixels instead of 1, far map stays sharp when you zoom in — true detail is still capped at the original 1408 image, so x9 is smoother interpolation, not new detail, but blocks shrink from 16 art px to ~2 art px
    this.dirLod = {}; for (const key of ['thronglet', 'guard', 'penguin', 'vampire', 'tumnus', 'bat']) { this.dirLod[key] = {}; for (const d of ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']) { this.dirLod[key][d] = []; for (const h of [24, 48, 96, 192, 'full']) { const im = new Image(); im.onload = () => { this.dirLod[key][d].push(im); this.dirLod[key][d].sort((a, b) => a.height - b.height); }; im.src = `assets/dir/${key}/${d}${h === 'full' ? '' : '_' + h}.png`; } } } }
  pick(n, px) { const L = this.lod[n]; for (const im of L) if (im.height >= px) return im; return L[L.length - 1]; }
  dirFor(e) { const dirs = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']; return dirs[((Math.round((e.dir || 0) / (Math.PI / 4)) % 8) + 8) % 8]; }
  pickDir(key, e, px) { const L = (this.dirLod[key] || {})[this.dirFor(e)] || []; const ready = L.filter(im => im.complete && im.naturalWidth); if (!ready.length) return null; for (const im of ready) if (im.height >= px) return im; return ready[ready.length - 1]; }
  S(key, fn) { let c = this.spr.get(key); if (!c) { c = fn(); this.spr.set(key, c); } return c; }
  makeRipple(v) { const c = cv(64, 64), g = c.getContext('2d'); for (let i = 0; i < 26; i++) { const x = hash(i, v, 3) * 64 | 0, y = hash(i, v, 4) * 64 | 0, w = 3 + hash(i, v, 5) * 6 | 0; g.fillStyle = v ? 'rgba(200,250,250,.55)' : 'rgba(150,230,235,.6)'; g.fillRect(x, y, w, 1); if (w > 5) g.fillRect(x + 1, y - 1, w - 3, 1); } return c; }
  makeFog() { const c = cv(96, 96), g = c.getContext('2d'), d = g.createImageData(96, 96); for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const f = (a, b, s) => { let t = 0; for (const [fr, am] of [[a, 0.6], [b, 0.4]]) { const X = x / 96 * fr, Y = y / 96 * fr; t += am * tileN(X, Y, fr, s); } return t; }; const v = clamp((f(4, 8, 1) - 0.42) * 2.2, 0, 1); const i = (y * 96 + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = v * 255; } g.putImageData(d, 0, 0); return c; }
  // ------------------------------------------------------------------ world setup
  setWorld(world, sim) {
    this.w = world; this.sim = sim; this.chunks.clear(); this.objs.clear(); this.parts = []; this.ovDirty = true; // v0.21: zoomed-out overview must rebuild for a new world, or the old map lingers after a reset
    const m = world.mansion, mx = Math.floor(m.x), mz = Math.floor(m.z); this.M = { cx: mx, cz: mz, x0: mx - 8, x1: mx + 8, z0: mz - 6, z1: mz + 6 };
    const M = this.M; M.px0 = M.x0 - 2; M.px1 = M.x1 + 2; M.pz0 = M.z0 - 2; M.pz1 = M.z1 + 4;
    // per-tile classification
    const n = W * D; this.tt = new Uint8Array(n); this.gs = new Float32Array(n); this.cor = new Float32Array(n);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) this.classify(x, z);
    // haunted scatter + village props
    this.decor = [];
    const r = (i, s) => hash(i, s, world.seed * 13 + 7);
    for (let i = 0; i < 2600; i++) { const a = r(i, 1) * 6.283, d = 21 + r(i, 2) * 26, x = Math.floor(mx + Math.cos(a) * d), z = Math.floor(mz + Math.sin(a) * d), k = z * W + x;
      if (!world.inb(x, z) || world.water[k] || world.stack[k] || this.tt[k] !== T.DIRT && this.tt[k] !== T.GRASS || this.cor[k] < 0.45) continue; if (Math.abs(x - mx) < 2 && z > M.pz1) continue;
      const q = r(i, 3); const t = q < 0.05 ? 'dead' : q < 0.085 ? 'pumpkin' : q < 0.1 ? 'lamp' : q < 0.11 ? 'scarecrow' : q < 0.13 ? 'grave' : null; if (t) this.decor.push({ t, x: x + 0.5, z: z + 0.5, v: i }); }
    // mansion grounds: lamp posts at bridge, skulls & pillars on the platform, iron fence round the moat
    
    for (let i = 0; i < 16; i++) { const side = i < 8 ? -1 : 1, j = i % 8; this.decor.push({ t: 'topiary', x: mx + side * (2.6 + (j % 4) * 0.75 + (j > 3 ? 0.35 : 0)), z: M.z1 + 3.2 + (j > 3 ? 0.7 : 0) + hash(i, 3, 3) * 0.2, v: i }); }
    this.decor.push({ t: 'kingslamp', x: mx + 4.4, z: M.pz1 + 1.6 }); this.decor.push({ t: 'yard', x: mx + 3.2, z: M.pz1 + 2.4 }); for (let i = 0; i < 10; i++) this.decor.push({ t: 'lav', x: mx + 0.5 + (i < 5 ? -1 : 1) * (5.6 + (i % 5) * 0.9), z: M.z1 + 2.4 + hash(i, 5, 5) * 0.8, v: i }); this.decor.push({ t: 'pumpkin', x: mx - 6.5, z: M.z1 + 3.3, v: 1 });
    for (let x = M.px0 - 4; x <= M.px1 + 4; x++) { if (Math.abs(x + 0.5 - (mx)) < 3) continue; this.decor.push({ t: 'fence', x: x + 0.5, z: M.pz1 + 5 }); }
    for (let x = M.px0 - 4; x <= M.px1 + 4; x++) this.decor.push({ t: 'fence', x: x + 0.5, z: M.pz0 - 4 });
    for (const d of world.decor) if (d.t === 'dock') this.decor.push({ t: 'dockpost', x: d.x + 0.2, z: d.z + 1 });
    this.mansionArt = null; this.dirtyAll = true;
  }
  classify(x, z) {
    const w = this.w, k = z * W + x, g = w.ground[k], sb = w.get(x, g - 1, z), M = this.M;
    let t = T.DIRT, gs = 0;
    if (x >= M.px0 && x <= M.px1 && z >= M.pz0 && z <= M.pz1) t = (z > M.z1 + 2 && Math.abs(x - M.cx + 0.5) < 2) ? T.BRIDGE : (z > M.z1 && z <= M.z1 + 2 && Math.abs(x - M.cx + 0.5) < 3) ? T.BRIDGE : T.GRASS;
    else if (x >= M.px0 - 3 && x <= M.px1 + 3 && z >= M.pz0 - 3 && z <= M.pz1 + 3) { t = (Math.abs(x - M.cx + 0.5) < 2 && z > M.pz1) ? T.BRIDGE : T.GRASS; gs = 1.2; }
    else if (w.water[k] || sb === B.WATER) t = T.WATER;
    else if (w.region[k] === RG.MARSH) t = T.DIRT; // v0.21: swamp ground is murky dirt in close-up, not beach sand — the murky palette is in bake()
    else if (sb === B.SAND) t = T.SAND; else if (sb === B.STONE || sb === B.COBBLE || sb === B.MOSS) t = T.STONE; else if (sb === B.FARM) t = T.FARM;
    else if (sb === B.GRASS) { t = T.GRASS; const rg = w.region[k]; gs = 0.3 + 0.8 * vnoise(x / 7, z / 7, 5) + (rg === RG.WOODS ? 0.3 : rg === RG.MEADOW ? 0.1 : 0); for (const tr of this.sim.tribes) { const d = Math.hypot(x - tr.cx, z - tr.cz); if (d < 4) gs -= (4 - d) * 0.25; } }
    const inLawn = x >= M.px0 - 3 && x <= M.px1 + 3 && z >= M.pz0 - 3 && z <= M.pz1 + 3; if (inLawn && t === T.GRASS) gs = 1.2; this.tt[k] = t; this.gs[k] = gs; const dm = Math.hypot(x - M.cx, z - M.cz); this.cor[k] = inLawn ? 0 : clamp((44 - dm) / 14 + (vnoise(x / 6, z / 6, 9) - 0.5) * 0.9, 0, 1);
  }
  // ------------------------------------------------------------------ ground chunk baking
  bake(cx, cz) {
    const w = this.w, c = cv(CP, CP), g = c.getContext('2d'), img = g.createImageData(CP, CP), buf = new Uint32Array(img.data.buffer);
    const x0 = cx * CH, z0 = cz * CH, tt = this.tt, gs = this.gs, cor = this.cor;
    const tget = (x, z) => { x = clamp(x, 0, W - 1); z = clamp(z, 0, D - 1); return z * W + x; };
    const wv = k => tt[k] === T.WATER ? 1 : 0, sv = k => tt[k] === T.STONE ? 1 : 0, sav = k => tt[k] === T.SAND ? 1 : 0, gv = k => tt[k] === T.GRASS ? gs[k] : 0;
    for (let tz = 0; tz < CH; tz++) for (let tx = 0; tx < CH; tx++) {
      const X = x0 + tx, Z = z0 + tz, k = Z * W + X, t = tt[k], h = w.ground[k], hS = w.ground[tget(X, Z + 1)];
      const kk = [tget(X - 1, Z - 1), tget(X, Z - 1), tget(X + 1, Z - 1), tget(X - 1, Z), k, tget(X + 1, Z), tget(X - 1, Z + 1), tget(X, Z + 1), tget(X + 1, Z + 1)];
      const depth = WATER - h, ocean = w.region[k] === RG.SEA;
      for (let py = 0; py < P; py++) for (let px = 0; px < P; px++) {
        const gx = X * P + px, gy = Z * P + py, o = (tz * P + py) * CP + tx * P + px;
        // bilinear sample over the 3x3 neighbourhood
        const fx = (px + 0.5) / P - 0.5, fy = (py + 0.5) / P - 0.5, ix = fx < 0 ? 0 : 1, iy = fy < 0 ? 0 : 1, ux = fx < 0 ? fx + 1 : fx, uy = fy < 0 ? fy + 1 : fy;
        const a = kk[iy * 3 + ix], b = kk[iy * 3 + ix + 1], c2 = kk[(iy + 1) * 3 + ix], d = kk[(iy + 1) * 3 + ix + 1];
        const bil = f => { const A0 = f(a), B0 = f(b), C0 = f(c2), D0 = f(d); return A0 + (B0 - A0) * ux + (C0 - A0) * uy + (A0 - B0 - C0 + D0) * ux * uy; };
        const n1 = vnoise(gx / 7, gy / 7, 1), n2 = vnoise(gx / 2.6, gy / 2.6, 2), hr = hash(gx, gy, 3);
        let col;
        if (t === T.BRICK || t === T.BRIDGE) { const row = gy >> 2, m = (gy & 3) === 3 || ((gx + (row & 1) * 4) & 7) === 0; col = m ? PAL.brick[3] : PAL.brick[hr < 0.15 ? 0 : hr > 0.9 ? 2 : 1];
          if (t === T.BRIDGE) { const wet = vnoise(gx / 5, gy / 5, 31); col = m ? H2('#4a4f5c') : wet > 0.62 ? H2('#9aa6b8') : wet > 0.5 ? H2('#7c8698') : PAL.brick[hr < 0.2 ? 0 : 1]; if (!m && hr > 0.985) col = H2('#d8e4f0'); else if (!m && wet > 0.66 && hr > 0.9) col = H2('#e8b060'); } buf[o] = col; continue; }
        const wf = bil(wv) + (n1 - 0.5) * 0.34 + (n2 - 0.5) * 0.06;
        if (wf > 0.5) {
          if (wf < 0.56 && !ocean) { col = PAL.foam[hr < 0.5 ? 0 : 1]; buf[o] = col; continue; }
          if (wf < 0.54) { col = PAL.foam[0]; buf[o] = col; continue; }
          const dd = clamp((ocean ? 2.5 : 0) + (depth > 0 ? depth * 0.45 : 0.3) + (wf - 0.5) * 2 + (n1 - 0.5) * 0.6, 0, 4.4); const i = Math.floor(dd), f = dd - i, c0 = WATERC[i], c1 = WATERC[Math.min(4, i + 1)];
          const dith = (hr - 0.5) * 0.25; const tt2 = clamp(f + dith, 0, 1);
          buf[o] = (200 << 24) | (Math.round(lerp(c0[2], c1[2], tt2)) << 16) | (Math.round(lerp(c0[1], c1[1], tt2)) << 8) | Math.round(lerp(c0[0], c1[0], tt2)); continue; }
        if (wf > 0.41 && t !== T.SAND && bil(sav) < 0.5) { buf[o] = PAL.bank[wf > 0.46 ? 1 : 0]; continue; }
        const sf = bil(sv) + (n1 - 0.5) * 0.3;
        const cr = cor[k] + (n2 - 0.5) * 0.2;
        if (sf > 0.5) { const row = gy >> 2, cell = hash((gx + (row & 1) * 3) >> 3, row, 6); const m = (gy & 3) === 0 || (((gx + (row & 1) * 3) & 7) === 0);
          col = sf < 0.56 ? PAL.sline : m ? PAL.stone[3] : PAL.stone[cell < 0.3 ? 0 : cell > 0.8 ? 2 : 1]; if (!m && (gy & 3) === 1 && hr < 0.4) col = PAL.stone[2]; if (cr > 0.6 && hr < 0.3) col = PAL.cor[2];
          // v0.17 rock relief: the stone branch used to return one flat grey pattern.
          // Now shade it by height and slope (peaks lighter, steep ground darker, east-facing
          // slope shaded), with dark crack speckle and light boulder highlights, so rocky
          // ground reads as relief instead of a flat texture.
          const hE = w.ground[tget(X + 1, Z)], hW = w.ground[tget(X - 1, Z)], hN = w.ground[tget(X, Z - 1)], slope = Math.abs(hE - hW) + Math.abs(hS - hN);
          let rf = 0.82 + Math.min(0.28, Math.max(0, (h - 16) * 0.02)) - Math.min(0.18, slope * 0.04) + (hE < h ? 0.06 : 0) - (hE > h ? 0.06 : 0);
          if (hr < 0.12) rf *= 0.82; else if (hr > 0.92) rf *= 1.12;
          col = shadeCol(col, rf);
          if (h > 32) col = shadeCol(H2('#e8eef2'), 0.9 + hr * 0.2); // v0.18: tallest peak tops are snowy, like the NW peak in the reference
          if (w.region[k] === RG.VOLCANO) { const vd = Math.hypot(X - w.volcano.x, Z - w.volcano.z); if (w.lava && w.lava[k]) col = hr < 0.15 ? shadeCol(H2('#ffd040'), 0.95) : hr < 0.3 ? shadeCol(H2('#ff5a00'), 0.9 + hr * 0.3) : hr < 0.55 ? shadeCol(H2('#c22a00'), 0.9) : hr < 0.65 ? shadeCol(H2('#ff8a2a'), 0.85) : shadeCol(H2('#2a2628'), 0.9 + hr * 0.2); else if (vd < 10) col = shadeCol(H2('#ff6a1a'), 0.9 + hr * 0.3); else if (vd < 14) col = hr < 0.4 ? shadeCol(H2('#3a2320'), 0.9) : shadeCol(H2('#ff8a2a'), 0.8); else if (hr < 0.08) col = shadeCol(H2('#ff8a2a'), 0.8); else if (hr > 0.92) col = shadeCol(H2('#4a4448'), 0.95); else col = shadeCol(H2('#2a2628'), 0.9 + hr * 0.2); } // v0.19: lava crater + basalt, not grey stone; v0.21: lava flows (molten orange with cooling dark crust), dark crater rim, ash-grey speckle — not one flat black circle
          buf[o] = col; continue; }
        if (t === T.FARM) { const row = py % 4; col = row === 0 ? PAL.farm[3] : row === 1 ? PAL.farm[2] : PAL.farm[hr < 0.3 ? 0 : 1]; if (px === 0 || px === 15) col = PAL.farm[3]; buf[o] = col; continue; }
        const gf = bil(gv) + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.07;
        const sand = bil(sav) + (n1 - 0.5) * 0.3;
        if (gf > 0.5) { const corr = cr > 0.5, wood = w.region[k] === RG.WOODS || w.region[k] === RG.JUNGLE, pl = corr ? PAL.cor : wood ? PAL.wood : PAL.grass;
          if (gf < 0.545) col = corr ? PAL.cline : PAL.gline;
          else { const v = vnoise(gx / 10, gy / 10, 7) * 0.8 + vnoise(gx / 4, gy / 4, 8) * 0.2 + (hr - 0.5) * 0.06; col = pl[v < 0.3 ? 4 : v < 0.45 ? 0 : v < 0.66 ? 1 : v < 0.8 ? 2 : 3]; if (gf < 0.58) col = pl[3]; }
        } else if (sand > 0.5) { const v = n2 + (hr - 0.5) * 0.3; col = PAL.sand[v < 0.3 ? 3 : v < 0.62 ? 0 : v < 0.85 ? 1 : 2]; if (((gy + (gx >> 3)) % 9 === 0) && hr < 0.6) col = PAL.sand[3]; }
        else if (w.region[k] === RG.MARSH) { const v = vnoise(gx / 6, gy / 6, 13) + (hr - 0.5) * 0.12; col = hr < 0.08 ? H2('#6a9a3a') : hr < 0.18 ? H2('#7a9a4a') : v < 0.3 ? H2('#2a4a22') : v < 0.55 ? H2('#3a4a2a') : v < 0.8 ? H2('#4a5a3a') : H2('#7a6a2a'); } // v0.21 swamp: murky mud, green pools, mist, reeds — not brown dirt
        else { const corr = cr > 0.82; if (corr) col = PAL.cor[hr < 0.2 ? 4 : hr < 0.7 ? 1 : 2]; else { const v = vnoise(gx / 6, gy / 6, 13) + (hr - 0.5) * 0.12; col = PAL.dirt[v < 0.25 ? 3 : v < 0.6 ? 0 : v < 0.85 ? 1 : 2];
          // stippled cobble patches (reference look)
          if (vnoise(gx / 40, gy / 40, 11) > 0.6) { const cxl = gx % 5, cyl = gy % 4, ch = hash(gx / 5 | 0, gy / 4 | 0, 12); if (ch < 0.55) { if (cyl === 3 && cxl < 4) col = PAL.dirt[4]; else if (cyl < 3 && cxl < 4) col = cyl === 0 ? PAL.dirt[2] : PAL.dirt[1]; } } } }
        // cliff faces where the ground steps down
        const drop = h - hS; if (drop >= 2 && t !== T.WATER && py >= P - Math.min(6, drop * 2)) { const cc = A.hex(py === P - Math.min(6, drop * 2) ? '#5a3a24' : (px + py) % 4 === 0 ? '#8a5a36' : '#a46e40'); col = rgb(cc[0], cc[1], cc[2]); }
        else if (h > 18) { const f = 1 + Math.min(0.12, (h - 18) * 0.008); const r0 = col & 255, g0 = col >> 8 & 255, b0 = col >> 16 & 255; col = rgb(Math.min(255, r0 * f | 0), Math.min(255, g0 * f | 0), Math.min(255, b0 * f | 0)); }
        buf[o] = col;
      }
    }
    g.putImageData(img, 0, 0);
    // ---- detail scatter ----
    const R = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
    for (let tz = 0; tz < CH; tz++) for (let tx = 0; tx < CH; tx++) {
      const X = x0 + tx, Z = z0 + tz, k = Z * W + X, t = tt[k], ox = tx * P, oy = tz * P, h1 = hash(X, Z, 21), h2 = hash(X, Z, 22), h3 = hash(X, Z, 23), rg = w.region[k], corr = cor[k] > 0.55, stacked = w.stack[k] > 0 || w.get(X, w.ground[k], Z);
      const ax = ox + 2 + (h2 * 11 | 0), ay = oy + 3 + (h3 * 10 | 0);
      if (t === T.GRASS && gs[k] > 0.55 && !stacked) {
        if (corr) { if (h1 < 0.3) g.drawImage(this.S('bram' + (X % 4), () => A.bramble(X % 4)), ox + 1, oy + 2); else if (h1 < 0.5) { R(ax, ay, 1, 3, '#6e3a8a'); R(ax + 2, ay + 1, 1, 2, '#9a5ab8'); } continue; }
        if (h1 < 0.35) { const c1 = rg === RG.WOODS ? '#7aa84a' : '#a8dc5a', c0 = rg === RG.WOODS ? '#2c5a22' : '#4c8a2a'; R(ax, ay, 1, 2, c1); R(ax + 2, ay - 1, 1, 3, c1); R(ax + 4, ay, 1, 2, c1); R(ax, ay + 2, 5, 1, c0); }
        else if (h1 < (rg === RG.MEADOW ? 0.47 : 0.4)) { const fc = ['#ffe24a', '#ffffff', '#ff6a8a', '#8ab8ff', '#ffb04a'][h2 * 5 | 0]; R(ax, ay, 2, 2, fc); R(ax + 1, ay + 1, 1, 1, '#c08a20'); R(ax + 4, ay + 3, 2, 2, fc); R(ax + 1, ay + 2, 1, 2, '#4c8a2a'); }
        else if (rg === RG.WOODS && h1 < 0.47) { R(ax, ay, 2, 1, '#c86a2a'); R(ax + 3, ay + 2, 1, 1, '#a0522a'); R(ax + 5, ay, 2, 1, '#d8a040'); }
      } else if (t === T.DIRT && !stacked) {
        if (corr) { if (h1 < 0.22) g.drawImage(this.S('bram' + (Z % 4), () => A.bramble(Z % 4)), ox + 1, oy + 2); else if (h1 < 0.3) { R(ax, ay, 2, 1, '#e8e4dc'); R(ax + 1, ay + 1, 1, 1, '#9a96a0'); } }
        else if (h1 < 0.07) { if (rg === RG.MARSH) { R(ax, ay, 3, 2, '#5a4a2a'); R(ax, ay + 2, 3, 1, '#3a4a2a'); R(ax, ay, 1, 1, '#7a9a4a'); } else { R(ax, ay, 3, 2, '#d8cfc0'); R(ax, ay + 2, 3, 1, '#8a7a6a'); R(ax, ay, 1, 1, '#fff'); } } // v0.27: no white squares in the swamp — marsh dirt patches are mud/moss, not pale/white
        else if (h1 < 0.12) { R(ax, ay, 2, 1, '#c98444'); R(ax + 3, ay + 1, 1, 1, '#c98444'); }
      } else if (t === T.SAND && !stacked) {
        if (h1 < 0.05) { R(ax, ay, 3, 2, '#f8f0e0'); R(ax + 1, ay + 1, 1, 1, '#e89a8a'); } else if (rg === RG.COAST && h1 < 0.11) { R(ax, ay, 1, 3, '#a8b860'); R(ax + 2, ay - 1, 1, 4, '#8a9a48'); R(ax + 4, ay + 1, 1, 2, '#a8b860'); }
      } else if (t === T.WATER && rg !== RG.SEA && w.ground[k] >= WATER - 3 && tt[tget(X + 1, Z)] === T.WATER && tt[tget(X - 1, Z)] === T.WATER && tt[tget(X, Z + 1)] === T.WATER && tt[tget(X, Z - 1)] === T.WATER) {
        if (h1 < (rg === RG.LAKE || rg === RG.MARSH ? 0.12 : 0.04)) { const lx = ox + 3 + (h2 * 6 | 0), ly = oy + 3 + (h3 * 6 | 0); g.fillStyle = '#2e6a2a'; g.beginPath(); g.ellipse(lx + 3.5, ly + 3, 4, 3, 0, 0, 6.283); g.fill(); g.fillStyle = '#5aa83a'; g.beginPath(); g.ellipse(lx + 3.5, ly + 2.6, 3.4, 2.4, 0, 0.5, 6.0); g.lineTo(lx + 3.5, ly + 2.6); g.fill(); R(lx + 2, ly + 1, 2, 1, '#8ad050'); if (h2 < 0.3) { R(lx + 4, ly + 1, 2, 2, '#ffa0c8'); R(lx + 4, ly + 1, 1, 1, rg === RG.MARSH ? '#7a9a4a' : '#fff'); } } // v0.28: no white in the swamp, even on reed flowers — snow region untouched
        else if (h1 > 0.985) g.drawImage(this.S('wrock', () => A.rocks(3)), ox - 6, oy - 4);
      }
      if (t === T.FARM || w.get(X, w.ground[k], Z) >= B.CROP0 && w.get(X, w.ground[k], Z) <= B.CROP3) { const b = w.get(X, w.ground[k], Z); if (b >= B.CROP0 && b <= B.CROP3) g.drawImage(this.S('crop' + (b - B.CROP0), () => A.crop(b - B.CROP0)), ox, oy - 2); }
    }
    // baked decor from world gen (mushrooms, flowers, docks, ruin floors)
    for (const d of w.decor) { if (d.x < x0 - 6 || d.x >= x0 + CH + 6 || d.z < z0 - 6 || d.z >= z0 + CH + 6) continue; const ox = (d.x - x0) * P, oy = (d.z - z0) * P;
      if (d.t === 'mushroom') for (let i = 0; i < 3; i++) { const mx = ox + 2 + hash(d.x, i, 1) * 10 | 0, my = oy + 4 + hash(d.z, i, 2) * 8 | 0; R(mx + 1, my + 2, 1, 2, '#f0e8d8'); R(mx, my, 3, 2, i ? '#c83a2a' : '#d8a060'); R(mx, my, 1, 1, '#fff'); R(mx - 1, my + 4, 5, 1, '#00000030'); }
      else if (d.t === 'flowers') for (let i = 0; i < 6; i++) { const mx = ox + hash(d.x, i, 3) * 14 | 0, my = oy + hash(d.z, i, 4) * 14 | 0; R(mx, my, 2, 2, ['#ffe24a', '#fff', '#ff8ac0'][i % 3]); }
      else if (d.t === 'dock') { for (let i = 0; i < d.len; i++) { const px = ox + i * P; R(px, oy + 2, P, 12, '#a87444'); for (let y = 0; y < 12; y += 3) R(px, oy + 2 + y, P, 1, '#6b4224'); R(px + 15, oy + 2, 1, 12, '#5e3a1f'); R(px, oy + 14, P, 2, '#00000040'); } R(ox, oy + 2, d.len * P, 1, '#d6a46a'); }
      else if (d.t === 'ruin') { for (let z = -d.hd + 1; z < d.hd; z++) for (let x = -d.hw + 1; x < d.hw; x++) { const fx = ox + x * P, fy = oy + z * P; if (hash(d.x + x, d.z + z, 9) < 0.35) continue; R(fx + 1, fy + 1, 7, 7, '#9aa0ac'); R(fx + 8, fy + 8, 7, 7, '#8d93a0'); R(fx + 8, fy + 1, 7, 7, '#a2a8b4'); R(fx + 1, fy + 8, 7, 7, '#868c98'); R(fx + 1, fy + 8, 14, 1, '#5f6470'); if (hash(d.x + x, d.z + z, 10) < 0.4) R(fx + 3, fy + 3, 4, 2, '#5a8a3a'); } }
      else if (d.t === 'dune') { g.fillStyle = '#fbeec8'; g.beginPath(); g.ellipse(ox + 8, oy + 8, 22, 7, 0, 3.3, 6.1); g.fill(); g.fillStyle = '#dcbc7e'; g.fillRect(ox - 10, oy + 9, 36, 1); }
    }
    return c;
  }
  // ------------------------------------------------------------------ per-chunk object lists
  buildObjs(cx, cz) {
    const w = this.w, out = [], x0 = cx * CH, z0 = cz * CH, wallSet = this.wallSet;
    for (let z = z0; z < z0 + CH; z++) for (let x = x0; x < x0 + CH; x++) {
      const k = z * W + x, g = w.ground[k], b = w.get(x, g, z); if (!b) continue; if (wallSet.has(k)) continue; const tile = this.tt[k], M = this.M;
      if (tile === T.BRICK || x >= M.px0 && x <= M.px1 && z >= M.pz0 && z <= M.pz1) { continue; }
      const h = hash(x, z, 31), haunted = this.cor[k] > 0.5;
      if (b === B.LOG) { let leaf = 0; for (let y = g + 1; y < g + 9; y++) { const q = w.get(x, y, z); if (q === B.LEAVES) { leaf = 1; break; } if (q === B.NUTLEAF) { leaf = 2; break; } }
        if (leaf) out.push({ t: 'tree', x: x + 0.5, z: z + 0.85, v: (h * 6) | 0, nut: leaf === 2, palm: w.region[k] === RG.JUNGLE }); else if (haunted || w.get(x, g + 3, z) === B.LOG) out.push({ t: 'dead', x: x + 0.5, z: z + 0.85, v: (h * 5) | 0 }); else out.push({ t: 'logs', x: x + 0.5, z: z + 0.8 }); continue; }
      if (b === B.BERRY) { out.push({ t: 'bush', x: x + 0.5, z: z + 0.8, berry: true }); continue; }
      if (b === B.BUSH) { out.push({ t: 'bush', x: x + 0.5, z: z + 0.8, berry: false }); continue; }
      if (b === B.NUTLEAF) { out.push({ t: 'nuts', x: x + 0.5, z: z + 0.7 }); continue; }
      if (b === B.REED) { out.push({ t: 'reeds', x: x + 0.5, z: z + 0.9, v: (h * 9) | 0 }); continue; }
      if (b === B.STONE || b === B.MOSS) { if (haunted && b === B.MOSS) out.push({ t: 'grave', x: x + 0.5, z: z + 0.8, v: (h * 7) | 0 }); else out.push({ t: 'rock', x: x + 0.5, z: z + 0.85, v: (h * 4) | 0 }); continue; }
      if (b === B.COBBLE && w.region[k] === RG.RUINS) { out.push({ t: 'ruinwall', x: x + 0.5, z: z + 0.95, v: (h * 9) | 0, hh: w.stack[k] }); continue; }
      if (b === B.TORCH) { out.push({ t: 'torch', x: x + 0.5, z: z + 0.8 }); continue; }
      if (b === B.CHEST) { out.push({ t: 'chest', x: x + 0.5, z: z + 0.8 }); continue; }
      if (b >= B.CROP0 && b <= B.CROP3) continue;
      if (b === B.PLANK || b === B.THATCH || b === B.COBBLE || b === B.DBRICK || b === B.GATE) { let top = b; for (let y = g; y < g + 6; y++) { const q = w.get(x, y, z); if (q) top = q; } out.push({ t: 'block', x: x + 0.5, z: z + 0.95, b: top }); }
    }
    for (const n of w.nodes) if (n.tree && n.x >= x0 && n.x < x0 + CH && n.z >= z0 && n.z < z0 + CH && w.get(n.x, w.ground[n.z * W + n.x], n.z) !== B.LOG) out.push({ t: 'stump', x: n.x + 0.5, z: n.z + 0.8 });
    for (const sp of w.spots) if (sp.x >= x0 && sp.x < x0 + CH && sp.z >= z0 && sp.z < z0 + CH) out.push({ t: 'spot', x: sp.x, z: sp.z + 0.4, sp });
    return out;
  }
  flush(budget = 1e9, all = false) {
    const w = this.w; if (!w) return;
    this.wallSet = new Set(); for (const tr of this.sim.tribes) if (tr.wall) for (const c of tr.wall.cells) this.wallSet.add(c.z * W + c.x);
    if (this.dirtyAll) { this.dirtyAll = false; w.dirty.clear(); }
    for (const key of [...w.dirty]) { w.dirty.delete(key); const [cx, cz] = key.split(',').map(Number); for (let z = cz * CH; z < cz * CH + CH; z++) for (let x = cx * CH; x < cx * CH + CH; x++) this.classify(x, z); this.chunks.delete(key); this.objs.delete(key); }
    if (all) for (let cz = 0; cz < NC; cz++) for (let cx = 0; cx < NC; cx++) { const k = cx + ',' + cz; if (!this.objs.has(k)) this.objs.set(k, this.buildObjs(cx, cz)); }
  }
  chunk(cx, cz, allowBuild) { const k = cx + ',' + cz; let c = this.chunks.get(k); if (c) { this.chunks.delete(k); this.chunks.set(k, c); return c; } if (!allowBuild) return null;
    c = this.bake(cx, cz); this.chunks.set(k, c); while (this.chunks.size > 90) this.chunks.delete(this.chunks.keys().next().value); return c; }
  overview() { if (this.ov && !this.ovDirty) return this.ov; const c = this.ov || cv(W, D), g = c.getContext('2d'), img = g.createImageData(W, D), b = new Uint32Array(img.data.buffer);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { const k = z * W + x, t = this.tt[k], cr = this.cor[k] > 0.55; let col;
      if (t === T.WATER) { const d = clamp((this.w.region[k] === RG.SEA ? 2.5 : 0) + (WATER - this.w.ground[k]) * 0.45, 0, 4); const q = WATERC[Math.round(d)]; col = rgb(q[0], q[1], q[2]); }
      else if (t === T.BRICK || t === T.BRIDGE) col = PAL.brick[1]; else if (t === T.STONE) col = this.w.region[k] === RG.VOLCANO ? (this.w.lava && this.w.lava[k] ? shadeCol(H2('#ff5a00'), 0.95) : Math.hypot(x - this.w.volcano.x, z - this.w.volcano.z) < 10 ? shadeCol(H2('#ff6a1a'), 0.95) : shadeCol(H2('#2a2628'), 0.95)) : (this.w.snow && Math.hypot(x - this.w.snow.x, z - this.w.snow.z) < this.w.snow.R * 0.9) ? shadeCol(H2(hash(x, z, 32) < 0.5 ? '#e8eef2' : '#c8d0d8'), 0.95) : (x > W / 2 && this.w.region[k] === RG.HIGH) ? shadeCol(H2(hash(x, z, 33) < 0.33 ? '#c9b77a' : hash(x, z, 33) < 0.66 ? '#b8a06a' : '#a08a5a'), 0.95) : this.w.ground[k] > 32 ? shadeCol(H2('#e8eef2'), 0.95) : shadeCol(PAL.stone[1], 0.85 + Math.min(0.3, Math.max(0, (this.w.ground[k] - 16) * 0.02))); // v0.17: zoomed-out rock also shaded by height, not one flat grey; v0.18: snowy tops; v0.19: volcano; v0.21: lava flows read as orange channels on the zoomed-out map
      else if (this.w.region[k] === RG.MARSH) col = (() => { const h = hash(x, z, 35); return h < 0.2 ? rgb(42, 74, 58) : h < 0.35 ? rgb(106, 154, 58) : h < 0.5 ? rgb(58, 74, 42) : h < 0.65 ? rgb(74, 90, 58) : rgb(52, 66, 38); })(); // v0.21 reference 2: swamp is murky water / mud / green pools, not tan sand
      else if (t === T.SAND) col = PAL.sand[0]; else if (t === T.FARM) col = PAL.farm[1];
      else if (t === T.GRASS && this.gs[k] + (vnoise(x / 2, z / 2, 1) - 0.5) * 0.5 > 0.5) col = (this.M && x >= this.M.px0 && x <= this.M.px1 && z >= this.M.pz0 && z <= this.M.pz1) ? PAL.cor[2] : cr ? PAL.cor[1] : (() => { const OLIVE = [[106, 138, 58], [122, 154, 69], [90, 122, 48], [138, 154, 74]]; const o = OLIVE[Math.floor(hash(x, z, 31) * 4)]; return rgb(o[0], o[1], o[2]); })();
      else col = cr ? PAL.cor[2] : PAL.dirt[1]; // v0.18: zoomed-out woods get dark tree speckles; v0.19: jungle even darker; v0.21: fixed a bug where this else was inside a comment, so sand/farm/dirt tiles rendered transparent black on the zoomed-out map
      b[k] = col; }
    g.putImageData(img, 0, 0);
    // v0.21: zoomed-out zone pictures — still 1px-per-tile pixel art, no smoothing, but each zone now draws as a picture, not a flat colour patch.
    // Peaks become ridge triangles with snow caps, the volcano becomes a cone with lava flows, forests/jungle become tree-canopy clusters,
    // swamp becomes reed tufts, haunted ground gets dead-tree dots, ruins get broken wall outlines. All deterministic (hash), so the map is stable.
    { const w = this.w, px = (x, y, col) => { if (x >= 0 && y >= 0 && x < W && y < D) { g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); } };
      // tree-canopy clusters in woods and jungle, reed tufts in swamp, dead trees in haunted ground
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { const rg = w.region[z * W + x];
        if (rg === RG.WOODS && hash(x, z, 23) < 0.16) { g.fillStyle = '#2f5a2a'; g.fillRect(x, z, 2, 2); px(x, z - 1, '#4c8030'); px(x + 1, z - 1, '#1e4a22'); } // pine: dark canopy + light top, denser than before
        else if (rg === RG.JUNGLE && hash(x, z, 24) < 0.18) { g.fillStyle = '#1e4a22'; g.fillRect(x, z, 2, 2); px(x - 1, z, '#3a7a2e'); px(x + 2, z, '#5a9a3a'); } // palm: dark cluster + light fronds
        else if (rg === RG.MARSH && hash(x, z, 25) < 0.18) { const h = hash(x, z, 36); if (h < 0.3) { px(x, z, '#4a3a22'); px(x, z - 1, '#6a5a3a'); px(x + 1, z - 1, '#8a9a4a'); } else if (h < 0.55) { px(x, z, '#7a6a2a'); px(x, z - 1, '#8a7a3a'); } else if (h < 0.75) { px(x, z, '#7a9a4a'); px(x + 1, z, '#5a7a3a'); } else { px(x, z, '#2a4a22'); px(x, z - 1, '#3a5a2a'); } } // swamp: dead moss trees (brown trunk + moss), reed clumps, mist patches, dark shrubs
        else if (rg === RG.HAUNT && hash(x, z, 26) < 0.08) { px(x, z, '#1a1220'); px(x, z - 1, '#2a2034'); px(x + 1, z - 1, '#0a0810'); } // dead trees, denser
        else if (rg === RG.MEADOW && hash(x, z, 37) < 0.08) { px(x, z, '#4c7a28'); px(x + 1, z, '#6a9a3a'); } // grass tufts on meadow, like the reference ground texture
        else if (rg === RG.HIGH && hash(x, z, 38) < 0.05) { px(x, z, '#5f6470'); } // rock dots on mountain ground
        else if (rg === RG.LAKE && hash(x, z, 39) < 0.04) { px(x, z, '#7a9a6a'); } // shore reeds around lakes
      }
      // mountain ridges: one triangle per peak, plus two smaller flanking peaks, left side dark, right side light, snow on the tallest
      const tri = (cx, cz, hw, hh, snow, tan) => { for (let dy = 0; dy < hh; dy++) { const half = Math.max(1, Math.round(hw * dy / hh)); for (let dx = -half; dx <= half; dx++) { const left = dx < 0; let col = tan ? (left ? '#a08a5a' : '#c9b77a') : (left ? '#5f6470' : '#a2a8b4'); if (snow && dy < hh * 0.25) col = '#e8eef2'; else if (dy > hh * 0.8) col = tan ? '#8a7a4a' : '#7a7f8c'; px(cx + dx, cz - hh / 2 + dy, col); } } };
      if (w.peaks) for (const p of w.peaks) { const hw = Math.round(p.R * 0.55), hh = Math.round(p.R * 0.7), tan = p.x > W / 2; tri(p.x, p.z, hw, hh, !!p.snowy, tan); tri(p.x - hw, p.z + 2, Math.round(hw * 0.6), Math.round(hh * 0.6), false, tan); tri(p.x + hw, p.z + 2, Math.round(hw * 0.6), Math.round(hh * 0.6), false, tan); tri(p.x - hw * 0.5, p.z - 3, Math.round(hw * 0.45), Math.round(hh * 0.5), !!p.snowy, tan); tri(p.x + hw * 0.5, p.z - 3, Math.round(hw * 0.45), Math.round(hh * 0.5), false, tan); } // v0.21: ranges are 5-peak masses, not a single triangle, like the reference mountains
      // volcano: big cone with a flat lava crater, dark rim, and its lava flows as orange channels
      if (w.volcano) { const vx = Math.round(w.volcano.x), vz = Math.round(w.volcano.z), R = w.volcano.R, hw = Math.round(R * 1.2), hh = Math.round(R * 1.3); for (let dy = 0; dy < hh; dy++) { const half = Math.max(1, Math.round(hw * dy / hh)); for (let dx = -half; dx <= half; dx++) { let col = dx < 0 ? '#2a2628' : '#3a3438'; if (dy > hh * 0.85) col = '#4a4448'; px(vx + dx, vz - hh / 2 + dy, col); } } for (let dx = -6; dx <= 6; dx++) for (let dy = -2; dy <= 2; dy++) px(vx + dx, vz - hh / 2 + dy, '#ff6a1a'); if (w.volcanoFlows) for (const f of w.volcanoFlows) for (let t = R * 0.3; t < R * 1.6; t += 1) { const fx = Math.round(vx + f.ca * t), fz = Math.round(vz + f.sa * t); px(fx, fz, hash(fx, fz, 27) < 0.5 ? '#ff5a00' : '#c22a00'); px(fx, fz + 1, '#7a1a00'); } }
      // v0.21 reference: villages as thatched houses + tan fields, like the reference island — one cluster per living tribe, drawn in the overview so villages read at island view
      if (this.sim && this.sim.tribes) for (const tr of this.sim.tribes) { if (!tr.alive) continue; const vx = Math.round(tr.cx), vz = Math.round(tr.cz); g.fillStyle = '#c9b77a'; g.fillRect(vx - 9, vz - 6, 19, 13); g.fillStyle = '#8a7a4a'; g.fillRect(vx - 9, vz, 19, 1); g.fillRect(vx, vz - 6, 1, 13); for (const [hx, hz] of [[-7, -3], [3, -3], [-2, 3]]) { g.fillStyle = '#e8d8a8'; g.fillRect(vx + hx, vz + hz, 4, 3); g.fillStyle = '#7a5a2a'; g.fillRect(vx + hx - 1, vz + hz - 1, 6, 1); g.fillRect(vx + hx + 1, vz + hz - 2, 2, 1); } }
      // v0.21 reference: haunted centre as a dark castle, not just a purple patch
      if (this.M) { const mx = this.M.cx, mz = this.M.cz; g.fillStyle = '#1a1220'; g.fillRect(mx - 4, mz - 3, 9, 6); g.fillStyle = '#2a2034'; g.fillRect(mx - 1, mz - 6, 1, 3); g.fillRect(mx - 4, mz - 5, 1, 2); g.fillRect(mx + 4, mz - 5, 1, 2); }
      // v0.21 reference: sea texture speckle, like the deep blue textured sea in the reference
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (w.region[z * W + x] === RG.SEA && hash(x, z, 34) < 0.03) px(x, z, '#2a6a8a');
      // ruins: broken wall rectangles
      if (w.decor) for (const d of w.decor) if (d.t === 'ruin') { g.fillStyle = '#6a6258'; g.fillRect(d.x - d.hw, d.z - d.hd, d.hw * 2 + 1, 1); g.fillRect(d.x - d.hw, d.z + d.hd, d.hw * 2 + 1, 1); } }
    this.ov = c; this.ovDirty = false; return c; }
  // ------------------------------------------------------------------ frame
  render(cam, alpha, dt, sel, dpr) {
    const cvs = this.canvas, ctx = this.ctx, w = this.w, sim = this.sim; this.t += dt; const t = this.t;
    const Wd = cvs.width, Hd = cvs.height, s = cam.scale * dpr, k = s / P; // device px per art px
    const ox = Math.round(Wd / 2 - cam.tx * s), oy = Math.round(Hd / 2 - cam.tz * s);
    this.view = { ox, oy, s, dpr };
    const vx0 = (0 - ox) / s, vz0 = (0 - oy) / s, vx1 = (Wd - ox) / s, vz1 = (Hd - oy) / s;
    ctx.imageSmoothingEnabled = false; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#145a80'; ctx.fillRect(0, 0, Wd, Hd);
    ctx.setTransform(k, 0, 0, k, ox, oy);
    const ax0 = vx0 * P, az0 = vz0 * P, aw = (vx1 - vx0) * P, ah = (vz1 - vz0) * P;
    // animated water underlay
    ctx.fillStyle = '#2a8fae'; ctx.fillRect(ax0, az0, aw, ah);
    for (const [rp, sx, sy] of [[this.ripple, 3.5, 1.2], [this.ripple2, -2.4, 2.1]]) { const pat = ctx.createPattern(rp, 'repeat'); pat.setTransform(new DOMMatrix().translateSelf(Math.round(t * sx * 4) % 64, Math.round(Math.sin(t * 0.7) * 3 + t * sy) % 64)); ctx.fillStyle = pat; ctx.fillRect(ax0, az0, aw, ah); }
    // ground
    const cx0 = clamp(Math.floor(vx0 / CH), 0, NC - 1), cx1 = clamp(Math.floor(vx1 / CH), 0, NC - 1), cz0 = clamp(Math.floor(vz0 / CH), 0, NC - 1), cz1 = clamp(Math.floor(vz1 / CH), 0, NC - 1);
    const far = cam.scale < 5.5; let built = 0;
    if (far) { ctx.imageSmoothingEnabled = cam.scale < 2.5; ctx.drawImage(this.overview(), 0, 0, W, D, 0, 0, W * P, D * P); ctx.imageSmoothingEnabled = false;
      // v0.22: far zoom = Kyler's image, crossfading to game terrain as you zoom in. Scale <3: full image. Scale 3-5.5: blend image -> overview. Scale >=5.5: game chunks (close view, handled below). This is why far looks beautiful and close looks like the game, without a hard pop.
      const fullA = cam.scale < 3 ? 1 : cam.scale < 5.5 ? (5.5 - cam.scale) / 2.5 : 0;
      // v0.25 FIX: v0.24 upscaled the far image to 4608 but still cropped source rect 0,0,512,512 — so far view only ever showed the top-left 11% of the image (deep blue sea), stretched over the whole map. Now it draws the full natural size, with smoothing on for the downscale.
      if (fullA > 0 && this.refFull && this.refFull.complete && this.refFull.naturalWidth) { ctx.save(); ctx.globalAlpha = fullA; ctx.imageSmoothingEnabled = true; ctx.drawImage(this.refFull, 0, 0, this.refFull.naturalWidth, this.refFull.naturalHeight, 0, 0, W * P, D * P); ctx.restore(); } }
    else { let missing = false; for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) if (!this.chunks.has(cx + ',' + cz)) missing = true;
      if (missing) ctx.drawImage(this.overview(), 0, 0, W, D, 0, 0, W * P, D * P);
      const budget = this.forceBuild ? 1e9 : 2; this.forceBuild = false; for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { const had = this.chunks.has(cx + ',' + cz), c = this.chunk(cx, cz, built < budget); if (c && !had) built++; if (c) ctx.drawImage(c, cx * CP, cz * CP); } }
    // v0.24 landmarks: photo pictures far/mid only, fading out as you zoom in, so close zoom is clean tile ground, not a stretched photo. Full at scale <=5.5, fade 5.5-12, gone above 12.
    { const landA = cam.scale <= 5.5 ? 1 : cam.scale < 12 ? (12 - cam.scale) / 6.5 : 0;
      const refDraw = (im, cx, cz, wTiles) => { if (!im || !im.complete || !im.naturalWidth || landA <= 0) return; const wPx = wTiles * P, hPx = wPx * im.height / im.width; ctx.save(); ctx.globalAlpha = landA; ctx.imageSmoothingEnabled = false; ctx.drawImage(im, Math.round(cx * P - wPx / 2), Math.round(cz * P - hPx / 2), Math.round(wPx), Math.round(hPx)); ctx.restore(); };
      if (w.volcano) refDraw(this.ref.volcano, w.volcano.x, w.volcano.z, w.volcano.R * 2);
      if (w.jungle) refDraw(this.ref.jungle, w.jungle.x, w.jungle.z, w.jungle.R * 2);
      if (w.snow) refDraw(this.ref.snow, w.snow.x, w.snow.z, w.snow.R * 2);
      if (w.swamp) refDraw(this.ref.swamp, w.swamp.x, w.swamp.z, w.swamp.R * 2); }
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) { const kk = cx + ',' + cz; if (!this.objs.has(kk)) this.objs.set(kk, this.buildObjs(cx, cz)); }
    // ---------- gather drawables ----------
    const night = 1 - sim.dayAmt(), lights = [], list = [], glow = []; this.eyes = []; this.hutTags = [];
    const inV = (x, z, m = 3) => x > vx0 - m && x < vx1 + m && z > vz0 - m && z < vz1 + m + 4;
    for (let cz = Math.max(0, cz0 - 1); cz <= Math.min(NC - 1, cz1 + 1); cz++) for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(NC - 1, cx1 + 1); cx++) { const L = this.objs.get(cx + ',' + cz); if (L) for (const o of L) if (inV(o.x, o.z)) list.push(o); }
    for (const d of this.decor) if (inV(d.x, d.z)) list.push(d);
    if (sim.hideouts) for (const h of sim.hideouts) if (inV(h.x, h.z, 4)) list.push({ t: 'hideout', x: h.x, z: h.z - 0.02, h });
    for (const tr of sim.tribes) { if (!inV(tr.cx, tr.cz, 20)) continue; list.push({ t: 'fire', x: tr.cx - 0.5, z: tr.cz + 2.6, tr });
      list.push({ t: 'well', x: tr.cx + 3, z: tr.cz - 2, tr }); list.push({ t: 'board', x: tr.cx - 3.2, z: tr.cz - 1.2 }); list.push({ t: 'barrel', x: tr.cx + 1.6, z: tr.cz + 1.1 }); list.push({ t: 'barrel', x: tr.cx + 2.3, z: tr.cz + 1.4 });
      for (const h of tr.huts) if (inV(h.x, h.z)) list.push({ t: 'hut', x: h.x + 0.5, z: h.z + 2, h, tr });
      if (tr.wall) for (const c of tr.wall.cells) if (inV(c.x, c.z)) { const g = w.ground[c.z * W + c.x], b0 = w.get(c.x, g, c.z); if (!b0) continue; list.push({ t: c.gate ? 'gate' : 'wall', tr, x: c.x + 0.5, z: c.z + 0.98, c, b0, b1: w.get(c.x, g + 1, c.z), b2: w.get(c.x, g + 2, c.z) }); }
      for (const f of tr.farms) for (const [fx, fz] of f.cells) if (inV(fx, fz)) { for (const [dx, dz, hz] of [[0, -1, 1], [0, 1, 1], [-1, 0, 0], [1, 0, 0]]) { if (f.cells.some(([a, b]) => a === fx + dx && b === fz + dz)) continue; list.push({ t: 'rail', x: fx + 0.5 + dx * 0.5, z: fz + 0.5 + dz * 0.5 + (dz > 0 ? 0.02 : 0), hz }); } }
    }
    const M = this.M; if (inV(M.cx, M.cz, 30)) list.push({ t: 'mansion', x: M.cx, z: M.z1 + 1 });
    for (const e of sim.ents) { if (!e.alive && !(e.died && sim.tick - e.died < 30)) continue; if (e.inMansion) continue; const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha; e.rx = x; e.rz = e.held ? z - 0.75 : z; /* v0.12: held creatures float up */ if (!inV(x, z) || e.inHut) continue; if (e.kind === 'v' && e.state === 'resting' && Math.hypot(x - w.mansion.x, z - w.mansion.z) < 4) continue; if (e.kind === 'p' && e.state === 'resting' && Math.hypot(x - w.mansion.x, z - w.mansion.z - 3) < 4 && sim.isNight() === false && sim.tod > 0.64) continue; list.push({ t: e.kind === 'v' ? 'vamp' : e.kind === 'p' ? 'peng' : e.kind === 'm' ? 'tum' : 'thr', x, z: z + 0.3, e }); }
    if (far) { const keep = new Set(['hut', 'hideout', 'mansion', 'wall', 'gate', 'vamp', 'thr', 'peng', 'tum', 'fire', 'tree', 'dead']); for (let i = list.length - 1; i >= 0; i--) if (!keep.has(list[i].t) || (list[i].t === 'tree' || list[i].t === 'dead') && cam.scale < 3) { list[i] = list[list.length - 1]; list.pop(); } }
    list.sort((a, b) => a.z - b.z);
    // ---------- v0.9: the mansion's shadow (vampire sun-immunity zone), shown by day ----------
    { const da = sim.dayAmt ? sim.dayAmt() : 0; if (da > 0.05 && inV(M.cx, M.cz, 30)) { const m = sim.w.mansion, R = (sim.SHADE_R || 12) * P, cx = m.x * P, cz = m.z * P;
      ctx.save(); const gr = ctx.createRadialGradient(cx, cz, R * 0.55, cx, cz, R); gr.addColorStop(0, `rgba(30,10,40,${0.18 * da})`); gr.addColorStop(0.8, `rgba(45,12,60,${0.32 * da})`); gr.addColorStop(1, 'rgba(40,12,50,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cz, R, 0, 6.283); ctx.fill(); ctx.strokeStyle = `rgba(190,80,210,${0.7 * da})`; ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 4; ctx.beginPath(); ctx.arc(cx, cz, R - 1, 0, 6.283); ctx.stroke(); ctx.restore(); } }
    // ---------- shadows ----------
    ctx.fillStyle = 'rgba(20,30,10,0.28)';
    for (const o of list) { const sh = SH[o.t]; if (!sh || (o.t === 'vamp' && o.e.bat)) continue; ctx.fillStyle = (o.t === 'thr' || o.t === 'vamp' || o.t === 'peng' || o.t === 'tum') ? 'rgba(15,22,8,0.42)' : 'rgba(20,30,10,0.28)'; ctx.beginPath(); ctx.ellipse(o.x * P + sh[2], o.z * P + sh[3], sh[0], sh[1], 0, 0, 6.283); ctx.fill(); }
    // ---------- sprites ----------
    const f3 = ((Math.floor(t * 8) % 3) + 3) % 3, lit = night > 0.45;
    const draw = (c, x, z, ax = 0.5, ay = 1, flip = false, alpha2 = 1) => { const X = Math.round(x * P - c.width * ax), Y = Math.round(z * P - c.height * ay); if (alpha2 !== 1) ctx.globalAlpha = alpha2; if (flip) { ctx.save(); ctx.translate(X + c.width, Y); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0); ctx.restore(); } else ctx.drawImage(c, X, Y); if (alpha2 !== 1) ctx.globalAlpha = 1; };
    for (const o of list) {
      switch (o.t) {
        case 'tree': { const c = o.palm ? this.S('palm' + o.v, () => A.palm(o.v)) : this.S('tree' + o.v + o.nut, () => A.tree(o.v, o.nut ? 'nut' : 'oak')); const sway = Math.round(Math.sin(t * 1.3 + o.x * 0.7 + o.z) * 0.6); draw(c, o.x + sway / P, o.z, 0.5, 0.95); break; }
        case 'hideout': draw(this.S('hide' + o.h.kind + o.h.v, () => A.hideout(o.h.kind, o.h.v)), o.x, o.z, 0.5, 0.9); break;
        case 'dead': draw(this.S('dead' + o.v, () => A.deadTree(o.v)), o.x, o.z, 0.5, 0.97); break;
        case 'stump': draw(this.S('stump', A.stump), o.x, o.z); break;
        case 'logs': draw(this.S('logs', A.logpile), o.x, o.z); break;
        case 'bush': draw(this.S('bush' + o.berry, () => A.bush(o.berry)), o.x, o.z); break;
        case 'nuts': draw(this.S('it_nut', () => A.item('nut')), o.x, o.z); draw(this.S('it_nut', () => A.item('nut')), o.x + 0.25, o.z - 0.1); break;
        case 'reeds': draw(this.S('reed' + ((Math.floor(t * 3 + o.v) % 4)), () => A.reeds(Math.floor(t * 3 + o.v) % 4)), o.x, o.z); break;
        case 'rock': draw(this.S('rock' + o.v, () => A.rocks(o.v)), o.x, o.z); break;
        case 'grave': draw(this.S('grave' + o.v, () => A.gravestone(o.v)), o.x, o.z); break;
        case 'ruinwall': { const c = this.S('ruinw' + (o.v % 3), () => A.palisade('stone', o.v)); const hh = Math.round(c.height * (o.hh > 1 ? 0.85 : 0.5) - (o.v % 3) * 2); ctx.drawImage(c, 0, c.height - hh, c.width, hh, Math.round(o.x * P - c.width / 2), Math.round(o.z * P - hh), c.width, hh); if (o.v % 2) { ctx.fillStyle = '#4a7a3a'; ctx.fillRect(Math.round(o.x * P - 5), Math.round(o.z * P - hh + 2), 5, 3); } break; }
        case 'torch': draw(this.S('torch' + f3, () => A.torch(f3)), o.x, o.z); lights.push([o.x, o.z - 0.9, 5.5, 'warm', 0.9]); glow.push([o.x, o.z - 1.1, 0.9, 'warm']); break;
        case 'chest': draw(this.S('chest', A.chest), o.x, o.z); break;
        case 'block': draw(this.S('blk' + o.b, () => A.construction(o.b)), o.x, o.z); break;
        case 'fire': { draw(this.S('fire' + f3, () => A.campfire(f3)), o.x, o.z, 0.5, 0.85); lights.push([o.x, o.z - 0.3, 8 + Math.sin(t * 9) * 0.4, 'warm', 1]); glow.push([o.x, o.z - 0.4, 1.6, 'warm']); if (Math.random() < dt * 8) this.parts.push({ k: 'ember', x: o.x + (Math.random() - 0.5) * 0.5, z: o.z - 0.5, vx: (Math.random() - 0.5) * 0.3, vz: -0.8, life: 1.2 }); break; }
        case 'well': draw(this.S('well', A.well), o.x, o.z); break;
        case 'board': draw(this.S('board', A.board), o.x, o.z); break;
        case 'barrel': draw(this.S('barrel', A.barrel), o.x, o.z); break;
        case 'rail': { ctx.fillStyle = '#8a5a32'; const X = Math.round(o.x * P), Y = Math.round(o.z * P); if (o.hz) { ctx.fillRect(X - 8, Y - 6, 16, 2); ctx.fillRect(X - 8, Y - 3, 16, 1); ctx.fillStyle = '#5e3a1f'; ctx.fillRect(X - 8, Y - 8, 2, 8); ctx.fillRect(X + 6, Y - 8, 2, 8); } else { ctx.fillRect(X - 1, Y - 14, 2, 16); ctx.fillStyle = '#5e3a1f'; ctx.fillRect(X - 1, Y - 14, 2, 2); } break; }
        case 'hut': { const tick = sim.tick; if (!o.h._st || tick - o.h._t > 50) { o.h._t = tick; let st = false; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const g = w.ground[(o.h.z + dz) * W + o.h.x + dx]; for (let y = 0; y < 4; y++) if (w.get(o.h.x + dx, g + y, o.h.z + dz) === B.COBBLE) st = true; } o.h._st = st ? 2 : 1; }
          const occN = o.h.occ ? o.h.occ.size : 0, hl = lit || occN > 0, col = '#' + o.tr.color.toString(16).padStart(6, '0'), c = this.S(`hut${o.h._st}${col}${hl}`, () => A.hut(o.h._st === 2, col, hl));
          draw(c, o.x, o.z, 0.5, 0.97);
          if (occN && cam.scale > 9) { this.hutTags.push([o.x * P, o.z * P - c.height - 2, occN]); }
          if (Math.random() < dt * 2.2) this.parts.push({ k: 'smoke', x: o.x + 0.62, z: o.z - 3.5, vx: 0.25, vz: -0.35, life: 3.2, ph: Math.random() * 6 });
          if (lit) { lights.push([o.x - 1, o.z - 0.9, 2.6, 'warm', 0.6]); lights.push([o.x + 0.8, o.z - 0.9, 2.6, 'warm', 0.6]); } break; }
        case 'wall': case 'gate': this.drawWall(ctx, o, t); break;
        case 'mansion': this.drawMansion(ctx, lit, lights, glow, t); break;
        case 'pumpkin': draw(this.S('pump' + lit, () => A.pumpkin(lit)), o.x, o.z); if (lit) { lights.push([o.x, o.z - 0.3, 1.8, 'warm', 0.7]); glow.push([o.x, o.z - 0.3, 0.6, 'warm']); } break;
        case 'lamp': draw(this.S('lamp' + lit, () => A.lamp(lit)), o.x, o.z); if (lit) { lights.push([o.x, o.z - 1.9, 4.5, 'warm', 0.85]); glow.push([o.x, o.z - 1.9, 0.8, 'warm']); } break;
        case 'scarecrow': draw(this.S('scare', A.scarecrow), o.x, o.z); if (lit) glow.push([o.x, o.z - 1.6, 0.5, 'warm']); break;
        case 'fence': draw(this.S('fence', A.spikeFence), o.x, o.z); break;
        case 'topiary': draw(this.S('topi' + (o.v % 4), () => K.topiary(o.v % 4)), o.x, o.z); break;
        case 'kingslamp': draw(this.S('klamp' + lit, () => K.kingsLamp(lit)), o.x, o.z); if (lit) { lights.push([o.x, o.z - 3.2, 6, 'warm', 0.95]); glow.push([o.x, o.z - 3.3, 1.1, 'warm']); } break;
        case 'yard': draw(this.S('yard', K.yardSign), o.x, o.z); break;
        case 'lav': draw(this.S('lav' + (o.v % 4), () => K.lavender(o.v % 4)), o.x, o.z); break;
        case 'skull': draw(this.S('skull', A.skull), o.x, o.z); break;
        case 'pillar': draw(this.S('pillar', A.pillar), o.x, o.z); break;
        case 'shelf': draw(this.S('shelf', A.bookshelf), o.x, o.z); break;
        case 'dockpost': break;
        case 'spot': this.drawSpot(ctx, o, draw, t); break;
        case 'thr': this.drawThr(ctx, o, draw, t, sel, glow, lights, night); break;
        case 'vamp': this.drawVamp(ctx, o, draw, t, sel, glow, lights, night); break;
        case 'peng': this.drawPeng(ctx, o, draw, t, night); break;
        case 'tum': this.drawTum(ctx, o, draw, t, night, sim); break;
      }
    }
    // ---------- particles (leaves, embers, fireflies, dust) ----------
    this.particles(ctx, dt, list, night, vx0, vz0, vx1, vz1, glow);
    // ---------- fog ----------
    const reg = w.region[clamp(cam.tz | 0, 0, D - 1) * W + clamp(cam.tx | 0, 0, W - 1)], mansD = Math.hypot(cam.tx - M.cx, cam.tz - M.cz);
    const fogA = clamp(0.05 + night * 0.22 + (sim.tod > 0.18 && sim.tod < 0.3 ? 0.25 : 0) + (reg === RG.MARSH ? 0.3 : 0) + (mansD < 50 ? 0.2 : 0), 0, 0.6);
    if (fogA > 0.02) { ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = fogA; const pat = ctx.createPattern(this.fogTex, 'repeat'); pat.setTransform(new DOMMatrix().scaleSelf(14, 14).translateSelf((t * 0.35) % 96, (t * 0.12) % 96)); ctx.fillStyle = pat; ctx.fillRect(ax0, az0, aw, ah);
      if (mansD < 70) { ctx.globalAlpha = fogA * 0.8; ctx.globalCompositeOperation = 'source-over'; const gr = ctx.createRadialGradient(M.cx * P, M.cz * P, 0, M.cx * P, M.cz * P, 46 * P); gr.addColorStop(0, 'rgba(90,50,130,0.6)'); gr.addColorStop(1, 'rgba(90,50,130,0)'); ctx.fillStyle = gr; ctx.fillRect(ax0, az0, aw, ah); } ctx.restore(); }
    // ---------- light map (multiply) ----------
    this.lighting(ctx, Wd, Hd, ox, oy, s, lights, sim);
    // ---------- additive glows (after grading so they pop) ----------
    ctx.setTransform(k, 0, 0, k, ox, oy); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    for (const [x, z, r, c] of glow) { const a = c === 'red' ? 0.9 : 0.35 + night * 0.45; ctx.globalAlpha = a; const R = r * P; ctx.drawImage(this.glowC[c], x * P - R, z * P - R, R * 2, R * 2); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
    // eyes on top of the grade
    for (const [X, Y, n] of this.hutTags) { const zz = Math.sin(t * 2 + X) * 1.5; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(20,12,6,0.85)';
      const txt = 'zZ ' + n; ctx.strokeText(txt, X, Y + zz); ctx.fillStyle = '#fff2c0'; ctx.fillText(txt, X, Y + zz); }
    for (const [X, Y, VW, fl] of this.eyes) { ctx.fillStyle = '#ff2a2a'; for (const ex of [0.455, 0.51]) ctx.fillRect(X + (ex - 0.5) * VW * fl - 0.5, Y - 0.3, 1, 0.7); }
    // v0.11: village names over each village when zoomed in; a small shield pip over guards
    if (k > 1.2) { ctx.textAlign = 'center'; ctx.font = 'bold 9px "Pixelify Sans", monospace'; for (const tr of sim.tribes) { if (!tr.alive) continue; const X = tr.cx * P, Y = tr.cz * P - 30; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,6,0.85)'; ctx.strokeText(tr.name, X, Y); ctx.fillStyle = '#fff2c0'; ctx.fillText(tr.name, X, Y); } }
    for (const e of sim.ents) if (e.kind === 't' && e.alive && e.guardOf != null && !e.inHut && !e.hidden) { const X = e.x * P, Y = e.z * P - 17; ctx.fillStyle = 'rgba(30,20,10,0.8)'; ctx.fillRect(X - 2.5, Y - 3, 5, 5); ctx.fillStyle = '#c9d4e0'; ctx.fillRect(X - 1.5, Y - 2, 3, 2.5); ctx.fillRect(X - 0.5, Y + 0.5, 1, 1); }
    // ---------- storm: clouds, rain, lightning (concentrated around 83 Kingsway) ----------
    if (sim.storm && night > 0.3) { const I = clamp(1.15 - mansD / 160, 0.35, 1) * Math.min(1, night * 1.5);
      ctx.setTransform(k, 0, 0, k, ox, oy); ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 0.45 * I; ctx.globalCompositeOperation = 'multiply'; const cp = ctx.createPattern(this.fogTex, 'repeat'); cp.setTransform(new DOMMatrix().scaleSelf(22, 22).translateSelf((t * 1.1) % 96, (t * 0.4) % 96)); ctx.fillStyle = cp; ctx.filter = 'none'; ctx.fillRect(ax0, az0, aw, ah); ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(80,90,120,${0.5 * I})`; ctx.fillRect(0, 0, Wd, Hd); ctx.globalCompositeOperation = 'source-over';
      if (!this.rain || this.rain.length < 1) this.rain = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.6 }));
      // v0.19 per-biome precipitation: a rain streak's world position decides what it is.
      // Snow peak = snowflakes (never rain), volcano = ash/embers, jungle = heavier rain,
      // swamp = mist, everywhere else = rain. This is the "it doesn't rain in the snow" fix.
      const wv = this.w, snowD = (wx, wz) => Math.hypot(wx - wv.snow.x, wz - wv.snow.z), volcD = (wx, wz) => Math.hypot(wx - wv.volcano.x, wz - wv.volcano.z);
      ctx.lineWidth = Math.max(1, dpr); const n2 = Math.floor(this.rain.length * I);
      for (let i = 0; i < n2; i++) { const r = this.rain[i]; const spd = r.s; r.y += dt * (1.6 * spd); r.x -= dt * 0.25 * spd; if (r.y > 1) { r.y -= 1; r.x = Math.random() * 1.2; } if (r.x < 0) r.x += 1.2; const X = r.x * Wd, Y = r.y * Hd;
        const wx = cam.tx + (X - Wd / 2) / s, wz = cam.tz + (Y - Hd / 2) / s;
        if (snowD(wx, wz) < 40 && wv.ground[clamp(wz | 0, 0, D - 1) * W + clamp(wx | 0, 0, W - 1)] > 25) { ctx.fillStyle = `rgba(255,255,255,${0.8 * I})`; ctx.fillRect(X, Y, 2 * dpr, 2 * dpr); } // snow, not rain
        else if (volcD(wx, wz) < 45) { ctx.fillStyle = sim.volcanoErupt && hash(i, 7, 1) < 0.3 ? `rgba(255,120,30,${0.9 * I})` : `rgba(120,110,110,${0.7 * I})`; ctx.fillRect(X, Y, 2 * dpr, 2 * dpr); } // ash, embers when erupting
        else if (Math.hypot(wx - wv.jungle.x, wz - wv.jungle.z) < wv.jungle.R) { ctx.strokeStyle = `rgba(190,210,240,${0.75 * I})`; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - 5 * dpr, Y + 22 * dpr * spd); ctx.stroke(); } // jungle downpour
        else if (wv.region[clamp(wz | 0, 0, D - 1) * W + clamp(wx | 0, 0, W - 1)] === RG.MARSH) { /* swamp: mist, not streaks — drawn below */ }
        else { ctx.strokeStyle = `rgba(190,210,240,${0.55 * I})`; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - 5 * dpr, Y + 16 * dpr * spd); ctx.stroke(); } }
      for (let i = 0; i < 8 * I; i++) { const X = Math.random() * Wd, Y = Math.random() * Hd; ctx.fillStyle = 'rgba(200,220,255,.5)'; ctx.fillRect(X, Y, 3 * dpr, dpr); }
      this.flashT = (this.flashT ?? 3) - dt; if (this.flashT < 0) { this.flash = 1; this.flashT = 3 + Math.random() * 6 / I; this.bolt = { x: Math.random() * Wd, seed: Math.random() * 1000 }; }
      if (this.flash > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(170,190,255,${0.55 * this.flash * I})`; ctx.fillRect(0, 0, Wd, Hd); ctx.globalCompositeOperation = 'source-over';
        if (this.flash > 0.6) { ctx.strokeStyle = '#eef4ff'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); let X = this.bolt.x, Y = 0; ctx.moveTo(X, Y); for (let j = 1; j < 12; j++) { X += (hash(j, this.bolt.seed, 1) - 0.5) * 70 * dpr; Y += Hd / 22; ctx.lineTo(X, Y); } ctx.stroke(); }
        this.flash *= Math.pow(0.02, dt); if (this.flash < 0.5 && this.flash > 0.4 && Math.random() < 0.3) this.flash = 0.9; } }
    else this.flash = 0;
    // ---------- v0.19 ambient weather: volcano smoke always, snow over the peak always,
    // swamp mist over BlackCardU Swamp always, eruption glow/embers at night ----------
    { const wv = this.w, VX = ox + wv.volcano.x * s, VY = oy + wv.volcano.z * s, SX = ox + wv.snow.x * s, SY = oy + wv.snow.z * s;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // volcano smoke plume, rising and drifting
      for (let i = 0; i < (sim.volcanoErupt ? 14 : 6); i++) { const ph = (t * 0.25 + i / 6) % 1, Rr = (12 + i * 6 + ph * 40) * (s / 16) * dpr, a = sim.volcanoErupt ? 0.5 - ph * 0.3 : 0.3 - ph * 0.2; ctx.fillStyle = `rgba(60,55,60,${Math.max(0, a)})`; ctx.beginPath(); ctx.arc(VX + Math.sin(t + i) * 8 * dpr + ph * 20 * dpr, VY - ph * 60 * dpr, Math.max(2, Rr), 0, 6.283); ctx.fill(); }
      if (sim.volcanoErupt) { ctx.fillStyle = 'rgba(255,110,20,0.5)'; ctx.beginPath(); ctx.arc(VX, VY, (10 + Math.sin(t * 6) * 3) * (s / 16) * dpr, 0, 6.283); ctx.fill(); for (let i = 0; i < 12; i++) { const a = hash(i, (t | 0) % 10, 5) * 6.283, dd = hash(i, 3, 6) * 30 * (s / 16) * dpr; ctx.fillStyle = 'rgba(255,150,40,0.9)'; ctx.fillRect(VX + Math.cos(a) * dd, VY + Math.sin(a) * dd, 2 * dpr, 2 * dpr); } }
      // snowflakes over the snowy peak, even when it is not storming
      if (SX > -100 && SX < Wd + 100 && SY > -100 && SY < Hd + 100) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 40; i++) { const fx = SX + ((hash(i, 11, 1) * 80 - 40 + t * 6 * (i % 3 - 1)) % 80) * (s / 16) * dpr, fy = SY + ((hash(i, 12, 1) * 80 - 40 + t * 10 * (0.5 + hash(i, 13, 1) * 0.5)) % 80) * (s / 16) * dpr; ctx.fillRect(fx, fy, 2 * dpr, 2 * dpr); } }
      // swamp mist: drifting translucent patches over marsh tiles in view
      ctx.fillStyle = 'rgba(220,230,220,0.08)'; for (let i = 0; i < 6; i++) { const mx = (t * 8 * (i % 2 ? 1 : -1) + i * 200) % (Wd + 200) - 100, my = Hd * (0.2 + i * 0.13); ctx.beginPath(); ctx.ellipse(mx, my, 120 * dpr, 18 * dpr, 0, 0, 6.283); ctx.fill(); } }
    // ---------- overlay: selection, labels ----------
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const e of sim.ents) if (e.held && e.alive && e.rx !== undefined) { // v0.12 grab highlight: ground shadow + pulsing glow ring
      const X = ox + e.rx * s, Yg = oy + (e.rz + 0.75 + 0.42) * s, Y = oy + (e.rz + 0.2) * s, pu = 0.5 + 0.5 * Math.sin(t * 8);
      ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(X, Yg, s * 0.5, s * 0.2, 0, 0, 6.283); ctx.fill();
      const g = ctx.createRadialGradient(X, Y, s * 0.1, X, Y, s * (1.6 + 0.2 * pu)); g.addColorStop(0, 'rgba(255,240,150,.85)'); g.addColorStop(1, 'rgba(255,236,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, s * (1.6 + 0.2 * pu), 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = Math.max(3, s / 8); ctx.beginPath(); ctx.ellipse(X, Yg, s * (0.62 + 0.06 * pu), s * (0.3 + 0.03 * pu), 0, 0, 6.283); ctx.stroke();
      this.label(ctx, '✋ ' + e.name, X, Y - s * (e.kind === 'v' ? 2.1 : 1.4), Math.max(12, Math.min(18, s / 3)) * dpr, '#fff3a0'); }
    if (sel && sel.alive !== undefined && sel.rx !== undefined) { const X = ox + sel.rx * s, Y = oy + (sel.rz + 0.42) * s; ctx.strokeStyle = '#ffe066'; ctx.lineWidth = Math.max(2, s / 12); ctx.setLineDash([s / 5, s / 7]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.ellipse(X, Y, s * 0.55, s * 0.3, 0, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      this.label(ctx, sel.name, X, Y - s * (sel.kind === 'v' ? 2.3 : 1.5), Math.max(11, Math.min(18, s / 3)) * dpr, '#ffe9a8'); }
    if (this.showLabels) this.regionLabels(ctx, ox, oy, s, dpr, cam);
  }
  label(ctx, text, x, y, size, col) { ctx.font = `600 ${size}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(3, size / 4); ctx.strokeStyle = '#1a100a'; ctx.strokeText(text, x, y); ctx.fillStyle = col; ctx.fillText(text, x, y); }
  regionLabels(ctx, ox, oy, s, dpr, cam) {
    if (cam.scale > 26) return; const w = this.w, size = clamp(s * 2.4, 13 * dpr, 30 * dpr), seen = new Set();
    const items = w.regionSeeds.map(r => [r.x, r.z, REGION_NAMES[w.region[clamp(Math.round(r.z), 0, D - 1) * W + clamp(Math.round(r.x), 0, W - 1)]]]); items.push([this.M.cx, this.M.cz - 14, REGION_NAMES[RG.HAUNT]]); if (cam.scale > 5) items.push([this.M.cx, this.M.cz - 9, '83 Kingsway']); if (w.volcano) items.push([w.volcano.x, w.volcano.z - 8, REGION_NAMES[RG.VOLCANO]]); if (w.jungle) items.push([w.jungle.x, w.jungle.z, REGION_NAMES[RG.JUNGLE]]); if (w.snow) items.push([w.snow.x, w.snow.z - 8, 'Walk of Shame']);
    const cs = [[0.5, 0.12], [0.88, 0.5], [0.5, 0.88], [0.12, 0.5]]; for (const [a, b] of cs) items.push([W * a, D * b, REGION_NAMES[RG.COAST]]);
    ctx.font = `${size}px "Jacquard 12", "Pixelify Sans", serif`;
    for (const [x, z, n] of items) { if (n === REGION_NAMES[RG.SEA]) continue; const X = ox + x * s, Y = oy + z * s; if (X < -200 || Y < -50 || X > ctx.canvas.width + 200 || Y > ctx.canvas.height + 50) continue; if (seen.has(n + Math.round(x / 120))) continue; seen.add(n + Math.round(x / 120));
      const txt = n.replace(/^the /, '').replace(/^\w/, c => c.toUpperCase()); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = size / 5; ctx.strokeStyle = 'rgba(26,16,10,.85)'; ctx.strokeText(txt, X, Y); ctx.fillStyle = n === '83 Kingsway' ? '#ffd27a' : n === REGION_NAMES[RG.HAUNT] ? '#e6b8ff' : '#fff0c8'; ctx.fillText(txt, X, Y); }
  }

  wallKind(x, z) { if (x < 0 || z < 0 || x >= W || z >= D) return null; const k = z * W + x; if (!this.wallSet.has(k)) return null; const w = this.w, g = w.ground[k], b0 = w.get(x, g, z); return b0 ? { b0, b1: w.get(x, g + 1, z), b2: w.get(x, g + 2, z) } : null; }
  drawWall(ctx, o, t) {
    // thin, edge-joined walls: palisade ~5px (1/3 tile), stone ~6px with a slim top and short front face
    const x = Math.floor(o.x), z = Math.floor(o.z), me = { b0: o.b0, b1: o.b1, b2: o.b2 }, stone = me.b2 === B.COBBLE;
    const n = this.wallKind(x, z - 1), s2 = this.wallKind(x, z + 1), e = this.wallKind(x + 1, z), wv = this.wallKind(x - 1, z);
    const full = !!me.b1, hgt = !full ? 7 : stone ? 16 : 14, th = stone ? 6 : 5, cx = x * P + 8, cy = z * P + 10, top = cy - hgt;
    const gate = o.t === 'gate', vert = (n || s2) && !(e || wv);
    const C = stone ? { top: '#b9bfca', top2: '#9aa0ac', face: ['#7c8392', '#8a91a0', '#6e7584'], mort: '#4a4f5c', dark: '#3a3e4a', moss: '#5a8a3a' }
      : { top: '#c8935a', top2: '#a8743e', face: ['#8a5a32', '#7a4e2a', '#96643a'], mort: '#4a2c18', dark: '#3a2212', moss: '#4a7a2a' };
    const R = (a, b, c, d, col) => { ctx.fillStyle = col; ctx.fillRect(a, b, c, d); };
    const front = (x0, x1) => { // horizontal run front face + top
      R(x0, top - th + 1, x1 - x0, th - 1, C.top); R(x0, top - th + 1, x1 - x0, 1, '#ffffff30'); R(x0, top, x1 - x0, hgt, C.face[0]); R(x0, cy - 1, x1 - x0, 2, C.dark);
      R(x0, cy + 1, x1 - x0, 2, 'rgba(20,30,10,.28)'); // contact shadow
      if (stone) { for (let yy = top + 3; yy < cy; yy += 4) { R(x0, yy, x1 - x0, 1, C.mort); for (let xx = x0 + (((yy >> 2) & 1) ? 2 : 5); xx < x1; xx += 6) R(xx, yy - 3, 1, 3, C.mort); }
        for (let xx = x0; xx < x1; xx += 2) if (hash(xx, z, 4) < 0.25) R(xx, top + 1 + (hash(xx, z, 5) * (hgt - 3) | 0), 2, 1, C.face[2]);
        if (full) for (let xx = x0 + 1; xx < x1; xx += 6) { R(xx, top - th - 2, 3, 3, C.top); R(xx, top - th - 2, 3, 1, '#d8dde6'); R(xx + 3, top - th - 1, 1, 2, C.mort); }
        if (hash(x, z, 8) < 0.35) R(x0 + 2, top + 2, 3, 2, C.moss); }
      else { for (let xx = x0; xx < x1; xx += 3) { const v = hash(xx, z, 2), hh = (v * 3) | 0; R(xx, top - th + 1 - hh, 3, hgt + th - 1 + hh, C.face[v < 0.33 ? 0 : v < 0.66 ? 1 : 2]); R(xx, top - th + 1 - hh, 3, 1, C.top); R(xx + 1, top - th - hh, 1, 1, C.top2); R(xx + 2, top - th + 1 - hh, 1, hgt + th - 1 + hh, C.mort); }
        R(x0, top + 3, x1 - x0, 1, C.dark); R(x0, top + hgt - 4, x1 - x0, 1, C.dark); }
    };
    const column = (y0, y1) => { // vertical run seen from above: slim top strip with a sliver of east face
      R(cx - th / 2, y0 - hgt, th, y1 - y0, C.top); R(cx + th / 2, y0 - hgt, 1, y1 - y0, C.dark); R(cx - th / 2 - 1, y0 - hgt, 1, y1 - y0, C.mort); R(cx + th / 2 + 1, y0 - hgt + 2, 2, y1 - y0, 'rgba(20,30,10,.25)');
      if (stone) { for (let yy = y0 - hgt; yy < y1 - hgt; yy += 4) R(cx - th / 2, yy, th, 1, C.top2); if (full) for (let yy = y0 - hgt; yy < y1 - hgt; yy += 6) R(cx - th / 2 - 1, yy, th + 2, 2, '#d0d6de'); }
      else for (let yy = y0 - hgt; yy < y1 - hgt; yy += 3) { R(cx - th / 2, yy, th, 1, C.top2); R(cx - 1, yy + 1, 2, 1, C.dark); }
    };
    if (gate) { const gt = this.w.gates.get(z * W + x), open = gt && gt.open > 0;
      if (vert) { column(cy - 8, cy - 5); column(cy + 5, cy + 8); R(cx - 4, cy - 6 - hgt - 6, 8, 4, C.top); R(cx - 4, cy + 5 - hgt - 6, 8, 4, C.top);
        if (!open) { R(cx - 2, cy - 5 - hgt + 2, 4, 10, '#a06a38'); for (let yy = cy - 5 - hgt + 2; yy < cy + 5 - hgt + 2; yy += 2) R(cx - 2, yy, 4, 1, '#6b4224'); } else { R(cx + 2, cy - 5 - hgt + 1, 7, 3, '#a06a38'); R(cx + 2, cy + 3 - hgt, 7, 3, '#a06a38'); } return; }
      // posts
      for (const px of [cx - 8, cx + 6]) { R(px, top - th - 5, 3, hgt + th + 5, stone ? '#6e7584' : '#5e3a1f'); R(px, top - th - 5, 3, 1, C.top); R(px + 1, top - th - 7, 1, 2, stone ? '#9aa0ac' : '#8a5a32'); }
      R(cx - 8, top - th - 6, 17, 2, '#4a2c18'); // lintel
      if (open) { R(cx - 6, cy - 1, 12, 3, 'rgba(0,0,0,.2)'); R(cx - 6, top - th + 1, 2, hgt + th - 2, '#a06a38'); R(cx + 4, top - th + 1, 2, hgt + th - 2, '#a06a38'); }
      else { for (let xx = cx - 5; xx < cx + 6; xx += 2) { R(xx, top - th + 1, 2, hgt + th - 1, xx % 4 ? '#a06a38' : '#8a5a32'); R(xx + 1, top - th + 1, 1, hgt + th - 1, '#6b4224'); } R(cx - 5, top + 2, 11, 1, '#3a2212'); R(cx - 5, cy - 4, 11, 1, '#3a2212'); R(cx - 5, top - th + 1, 11, 1, '#c8935a'); R(cx - 1, top + 5, 2, 2, '#e8c860'); }
      return; }
    const joinN = !!n, joinS = !!s2, joinE = !!e, joinW = !!wv;
    if (joinN) column(cy - 16, cy); if (joinS) column(cy, cy + 16 - 6);
    if (joinE || joinW || !(joinN || joinS)) front(joinW ? x * P : cx - th / 2, joinE ? (x + 1) * P : cx + th / 2);
    else { // bottom-facing end cap of a vertical run
      if (!joinS) { R(cx - th / 2, top, th, hgt, C.face[0]); R(cx - th / 2, cy - 1, th, 2, C.dark); if (stone) for (let yy = top + 3; yy < cy; yy += 4) R(cx - th / 2, yy, th, 1, C.mort); else R(cx - 1, top, 1, hgt, C.mort); }
    }
    // post / pillar at corners & joins
    if ((joinN || joinS) && (joinE || joinW)) { R(cx - th / 2 - 1, top - th - 3, th + 2, hgt + th + 3, stone ? '#8a91a0' : '#6b4224'); R(cx - th / 2 - 1, top - th - 3, th + 2, 2, C.top); R(cx - th / 2 - 1, cy - 1, th + 2, 2, C.dark); }
    if (!full) { R(cx - 3, cy - 3, 2, 2, stone ? '#9aa0ac' : '#a06a38'); }
  }
  drawMansion(ctx, lit, lights, glow, t) {
    if (!this.mansionArt || this.mansionArt.lit !== lit) { this.mansionArt = K.mansion(lit); this.mansionArt.lit = lit; }
    const M = this.M, art = this.mansionArt, X = M.cx * P - 122, Y = (M.z1 + 1) * P - art.base;
    ctx.drawImage(art.canvas, X, Y);
    if (lit) for (const [wx, wy] of art.wins) { const x = (X + wx) / P, z = (Y + wy) / P; lights.push([x, z + 1, 2.2, 'warm', 0.55]); glow.push([x, z, 0.7, 'warm']); }
    lights.push([M.cx, M.z1 + 3, 6, 'purple', 0.5]);
    if (lit && Math.random() < 0.15) this.parts.push({ k: 'bat', x: M.cx + (Math.random() - 0.5) * 6, z: M.cz - 10, vx: (Math.random() - 0.5) * 6, vz: -1 - Math.random() * 2, life: 3 });
  }
  drawSpot(ctx, o, draw, t) {
    const sp = o.sp, k = sp.kind;
    if (k === 'cave') draw(this.S('cave', caveArt), o.x, o.z + 0.2);
    else if (k === 'hollow') draw(this.S('hollow', hollowArt), o.x, o.z);
    else if (k === 'bramble') draw(this.S('thick', thickArt), o.x, o.z);
    else if (k === 'reeds') { for (let i = 0; i < 4; i++) draw(this.S('reed' + ((Math.floor(t * 3) + i) % 4), () => A.reeds((Math.floor(t * 3) + i) % 4)), o.x - 0.6 + i * 0.4, o.z + (i % 2) * 0.2); }
    else if (k === 'treehollow') { ctx.fillStyle = '#1a0e08'; ctx.fillRect(Math.round(o.x * P - 2), Math.round((o.z + 0.05) * P - 14), 4, 5); ctx.fillStyle = '#4a2c18'; ctx.fillRect(Math.round(o.x * P - 3), Math.round((o.z + 0.05) * P - 9), 6, 1); }
    else if (k === 'islet') draw(this.S('tent', tentArt), o.x, o.z);
  }
  drawThr(ctx, o, draw, t, sel, glow, lights, night) {
    // v0.15: 8-directional idle sprite when loaded, else the old single sprite (sliced Ian, whole guard). Procedural hop/squash/sleep/fear still apply.
    const e = o.e, moving = Math.hypot(e.x - e.px, e.z - e.pz) > 0.01, fear = e.fear > 55 && e.state !== 'sleep';
    const sleep = !e.alive || e.state === 'sleep' || (e.state === 'hiding' && !fear);
    const TH = 20, k = this.view.s / P, isGuard = e.guardOf != null && e.alive, dirIm = this.pickDir(isGuard ? 'guard' : 'thronglet', e, TH * k), im = dirIm || this.pick(isGuard ? 'guard' : 'thronglet', TH * k); if (!im) return;
    const iw = im.width, ih = im.height, TW = TH * iw / ih, ph = (e.walk || 0) * 5 * Math.PI / 2 + e.id;
    let x = o.x * P, y = (e.rz + 0.35) * P + 1.5; if (fear) x += Math.sin(t * 70 + e.id) * 0.7;
    const hid = !!e.hidden, alpha = !e.alive ? 0.5 : hid ? 0.6 : 1;
    if (e.swim) { ctx.save(); ctx.beginPath(); ctx.rect(x - TW, y - TH, TW * 2, TH * 0.55); ctx.clip(); ctx.drawImage(im, x - TW / 2, y - TH * 0.8, TW, TH); ctx.restore(); ctx.strokeStyle = 'rgba(220,250,250,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y - TH * 0.25, 6 + Math.sin(t * 6) * 1.2, 2, 0, 0, 6.283); ctx.stroke(); return; }
    let sy = 1, hop = 0, legL = 0, legR = 0, earA = 0.35;
    if (sleep) { } else if (moving) { const sp = Math.sin(ph); hop = Math.abs(sp) * 1; sy = 1 + 0.07 * Math.cos(ph * 2); legL = Math.max(0, sp) * 1.6; legR = Math.max(0, -sp) * 1.6; earA = 1.3; }
    else { sy = 1 + 0.025 * Math.sin(t * 3 + e.id); if (e.state === 'social' || e.state === 'share') hop = Math.max(0, Math.sin(t * 7 + e.id)) * 0.8; }
    if (fear) { sy = 0.93; earA = 0.5; }
    const sx = 1 / Math.sqrt(sy), flip = dirIm ? 1 : (Math.sin(e.dir) < 0 ? -1 : 1);
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y - hop);
    if (sleep) { ctx.translate(0, -2); ctx.rotate(-1.35); ctx.translate(TH * 0.42, 0); }
    ctx.scale(flip * sx, sy);
    if (dirIm || isGuard) { ctx.drawImage(im, -TW / 2, -TH, TW, TH); } else {
    const E = 0.30, Lg = 0.86, d = (sf0, sf1, dy = 0, dx = 0, x0 = 0, x1 = 1) => ctx.drawImage(im, iw * x0, ih * sf0, iw * (x1 - x0), ih * (sf1 - sf0), -TW / 2 + TW * x0 + dx, -TH + TH * sf0 + dy, TW * (x1 - x0), TH * (sf1 - sf0) + 0.02);
    d(E, Lg); d(Lg, 1, -legL, 0, 0, 0.5); d(Lg, 1, -legR, 0, 0.5, 1);
    const N = 4; for (let i = 0; i < N; i++) { const f0 = E * i / N, f1 = E * (i + 1) / N, tip = 1 - (i + 0.5) / N; d(f0, f1 + 0.003, 0, Math.sin(t * 6 + e.id * 1.3 + i * 0.3) * earA * tip * tip); }
    }
    ctx.restore();
    // v0.14: guard sprite already wears helm + sword, so no drawn guardGear on top
    let rk = null; for (const kk in e.inv) if (e.inv[kk] > 0 && (!rk || e.inv[kk] > e.inv[rk])) rk = kk;
    if (rk && e.alive && !sleep) { const ic = this.S('it_' + rk, () => A.item(rk)); ctx.drawImage(ic, x + flip * TW * 0.55 - 3, y - hop - TH * 0.42 - 3, 6, 6); }
    if (!e.alive || this.view.s < 10 * this.view.dpr) return;
    let ic = null; const st = e.state;
    if (hid && e.fear > 30) ic = '!'; else if (sleep) ic = Math.floor(t * 1.2 + e.id) % 3 ? 'z' : null; else if (fear) ic = '!'; else if (st === 'fight' || st === 'steal') ic = 'anger';
    else if ((st === 'share' || st === 'social') && Math.floor(t + e.id) % 3 === 0) ic = 'heart'; else if (e.hunger > 75) ic = 'food'; else if ((st === 'build' || st === 'upgrade' || st === 'repair') && Math.floor(t * 0.7 + e.id) % 2) ic = 'hammer'; else if (e.exile && Math.floor(t * 0.5 + e.id) % 3 === 0) ic = '?';
    if (ic) draw(this.S('bub' + ic, () => A.bubble(ic)), (x + 7) / P, (y - hop - TH - 1) / P + Math.sin(t * 3 + e.id) * 0.04, 0.5, 1);
  }
  drawPeng(ctx, o, draw, t, night) {
    // v0.15: 8-directional idle penguin when loaded, else the old single penguin sprite. Waddle tilt + step bounce still apply.
    const e = o.e, moving = Math.hypot(e.x - e.px, e.z - e.pz) > 0.01, PH = 18, k = this.view.s / P, dirIm = this.pickDir('penguin', e, PH * k), im = dirIm || this.pick('penguin', PH * k); if (!im) return;
    const PW = PH * im.width / im.height, flip = dirIm ? 1 : (Math.sin(e.dir) < 0 ? -1 : 1), ph = (e.walk || 0) * 6 + e.id;
    const x = o.x * P, y = (e.rz + 0.35) * P + 1.5, rot = moving ? Math.sin(ph) * 0.13 : Math.sin(t * 1.6 + e.id) * 0.03, hop = moving ? Math.abs(Math.cos(ph)) * 0.7 : 0;
    const st0 = e.state; ctx.save(); ctx.translate(x, y - hop); if (st0 === 'sliding') { ctx.translate(0, -PW * 0.45); ctx.rotate(flip * 1.45); ctx.translate(0, PH * 0.5); } else if (st0 === 'napping') { ctx.translate(0, -2); ctx.rotate(-1.3); ctx.translate(PH * 0.42, 0); } else ctx.rotate(rot); ctx.scale(flip, 1); ctx.drawImage(im, -PW / 2, -PH, PW, PH); ctx.restore();
    if (this.view.s < 10 * this.view.dpr) return;
    const st = e.state; let ic = null; if (e.fired) ic = Math.floor(t * 1.5) % 2 ? 'anger' : '!'; else if (e.alert && this.sim && this.sim.tick - e.alert < 40) ic = '!'; else if (st === 'napping') ic = Math.floor(t * 1.2 + e.id) % 3 ? 'z' : null; else if (st === 'fishing') ic = 'fish'; else if (st === 'sliding') ic = null; else if (st === 'pitching') ic = Math.floor(t * 1.5) % 2 ? 'book' : 'talk'; else if (st === 'signalling') ic = '!'; else if (st === 'scouting' && Math.floor(t * 0.6 + e.id) % 4 === 0) ic = '?';
    if (ic) draw(this.S('bub' + ic, () => A.bubble(ic)), (x + 6) / P, (y - hop - PH - 1) / P + Math.sin(t * 3 + e.id) * 0.04, 0.5, 1);
  }
  drawTum(ctx, o, draw, t, night, sim) {
    // Ian Tumnus (unique): Kyler's faun art cut out + pixel-quantised; proud strut = bob + slight sway
    // v0.20: 8-directional Pixel Lab idle, like the other characters; falls back to the old single sprite.
    const e = o.e, moving = Math.hypot(e.x - e.px, e.z - e.pz) > 0.01, VH = 23, k = this.view.s / P, dirIm = this.pickDir('tumnus', e, VH * k), im = dirIm || this.pick('tumnus', VH * k); if (!im) return;
    const VW = VH * im.width / im.height, flip = dirIm ? 1 : (Math.sin(e.dir) < 0 ? 1 : -1) /* old Tumnus art faces left natively; directional art faces its direction */, ph = (e.walk || 0) * 4.5 + e.id, x = o.x * P, y = (e.rz + 0.3) * P + 1.5;
    const bob = moving ? Math.abs(Math.sin(ph)) * 0.9 : 0, rot = moving ? Math.sin(ph) * 0.04 : 0;
    ctx.save(); ctx.translate(x, y - bob); ctx.rotate(rot); ctx.scale(flip, 1 + (moving ? 0.015 * Math.cos(ph * 2) : 0.01 * Math.sin(t * 2))); ctx.drawImage(im, -VW / 2, -VH, VW, VH); ctx.restore();
    if (this.view.s < 10 * this.view.dpr) return; const st = e.state || ''; const ic = st === 'pitching' ? (Math.floor(t * 1.5) % 2 ? 'book' : 'talk') : (e.fireAt && sim.tick - e.fireAt < 150) ? 'anger' : (e.snitchAt && sim.tick - e.snitchAt < 40) ? '!' : null;
    if (ic) draw(this.S('bub' + ic, () => A.bubble(ic)), (x + 7) / P, (y - bob - VH - 1) / P + Math.sin(t * 3) * 0.04, 0.5, 1);
  }
  drawVamp(ctx, o, draw, t, sel, glow, lights, night) {
    // Stefan's original sprite for every vampire (exact), with hover bob, flip and slice-warped cape sway
    const e = o.e, moving = Math.hypot(e.x - e.px, e.z - e.pz) > 0.01;
    // v0.10: puff of smoke on transforming into / out of bat form
    for (const at of ['batAt', 'unbatAt']) if (e[at] && e['_p' + at] !== e[at] && this.sim.tick - e[at] < 6) { e['_p' + at] = e[at]; for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 1.4; this.parts.push({ k: 'puff', x: o.x + Math.cos(a) * 0.3, z: e.rz - 1.2 + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.6 - 0.4, life: 1.4 + Math.random() * 1.0, ph: Math.random() * 6 }); } }
    if (e.hideout) { // asleep inside a hideout: two red eyes glinting in the dark mouth + z bubble
      if (Math.floor(t * 0.7 + e.id) % 5) { ctx.fillStyle = '#ff3030'; const X = Math.round(o.x * P) + (e.id % 3) * 2 - 2, Y = Math.round((e.rz - 0.35) * P); ctx.fillRect(X - 2, Y, 1, 1); ctx.fillRect(X + 1, Y, 1, 1); glow.push([o.x, e.rz - 0.35, 0.5, 'red']); }
      if (this.view.s >= 10 * this.view.dpr) draw(this.S('bubz', () => A.bubble('z')), o.x + 0.6, e.rz - 1.2 + Math.sin(t * 2) * 0.05, 0.5, 1); return; }
    if (e.batHome || e.raidFly) { const by = e.rz - 1.6 + Math.sin(t * 6 + e.id) * 0.12;
      // v0.20: 8-directional Pixel Lab bat (red eyes) for bat-form flight; falls back to the flap sheet, then code-drawn.
      const batDir = this.pickDir('bat', e, 34 * this.view.dpr);
      if (batDir) { const bw = 34, bh = bw * batDir.height / batDir.width; ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(o.x * P), Math.round(by * P)); ctx.drawImage(batDir, -Math.round(bw / 2), -Math.round(bh / 2), bw, Math.round(bh)); ctx.restore(); glow.push([o.x, by, 0.6, 'red']); return; }
      if (BAT_SPRITE && !this.batImg) { this.batImg = new Image(); this.batImg.src = BAT_SPRITE; }
      if (this.batImg && this.batImg.complete && this.batImg.naturalWidth) { // 2-frame flap, crisp nearest-neighbour
        const im = this.batImg, fw = im.naturalWidth / 2, fh = im.naturalHeight, f = Math.floor(t * 8 + e.id) % 2, bw = 34, bh = bw * fh / fw, flip = Math.sin(e.dir) < 0 ? -1 : 1;
        ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(o.x * P), Math.round(by * P)); ctx.scale(flip, 1); ctx.drawImage(im, f * fw, 0, fw, fh, -Math.round(bw / 2), -Math.round(bh / 2), bw, Math.round(bh)); ctx.restore(); }
      else { const f = Math.floor(t * 12 + e.id) % 4; draw(this.S('bigbat' + f, () => A.bigBat(f)), o.x, by, 0.5, 0.5); }
      glow.push([o.x, by, 0.6, 'red']); return; }
    if (e.bat) { for (let i = 0; i < 7; i++) { const a = t * 5 + i * 0.9 + e.id, r = 0.4 + (i % 3) * 0.3; draw(this.S('bat' + ((Math.floor(t * 10) + i) % 2), () => A.bat((Math.floor(t * 10) + i) % 2)), o.x + Math.cos(a) * r, e.rz - 1 + Math.sin(a * 1.3) * r * 0.6, 0.5, 0.5); } glow.push([o.x, e.rz - 1, 1.2, 'red']); return; }
    const VH = 22, k = this.view.s / P, dirIm = this.pickDir('vampire', e, VH * k), im = dirIm || this.pick('stefan', VH * k); if (!im) return;
    const iw = im.width, ih = im.height, VW = VH * iw / ih, flip = dirIm ? 1 : (Math.sin(e.dir) < 0 ? -1 : 1);
    const bob = 0, x = o.x * P, y = (e.rz + 0.3) * P + 1.5, amp = moving ? 2.2 : 0.8;
    ctx.save(); ctx.translate(x, y); ctx.scale(flip, 1 + 0.02 * Math.sin(t * 2.4 + e.id));
    if (dirIm) { ctx.drawImage(im, -VW / 2, -VH, VW, VH); } else {
    const N = 14; for (let i = 0; i < N; i++) { const f0 = i / N, f1 = (i + 1) / N, f = (f0 + f1) / 2, w = f > 0.3 ? Math.pow((f - 0.3) / 0.7, 1.6) : 0, off = Math.sin(t * 3.2 - f * 5 + e.id) * amp * w - (moving ? amp * 0.8 * w : 0);
      ctx.drawImage(im, 0, ih * f0, iw, ih * (f1 - f0) + 1, -VW / 2 + off, -VH + VH * f0, VW, VH * (f1 - f0) + 0.05); }
    }
    ctx.restore();
    if (night > 0.3) { for (const ex of [0.455, 0.51]) { const gx = x + (ex - 0.5) * VW * flip; glow.push([gx / P, (y - VH * 0.88) / P, 0.13, 'red']); } lights.push([o.x, e.rz, 1.2, 'red', 0.12]); this.eyes.push([x, y - VH * 0.88, VW, flip]); }
    if (e.alert && this.sim && this.sim.tick - e.alert < 40 && this.view.s >= 10 * this.view.dpr) draw(this.S('bub!', () => A.bubble('!')), (x + 8) / P, (y - VH - 1) / P, 0.5, 1);
    if ((e.state === 'hunting' || e.state === 'searching') && night > 0.3) for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1, r = 1.1; draw(this.S('bat' + ((Math.floor(t * 10) + i) % 2), () => A.bat((Math.floor(t * 10) + i) % 2)), o.x + Math.cos(a) * r, e.rz - 1.9 + Math.sin(a) * 0.4, 0.5, 0.5); }
  }
  particles(ctx, dt, list, night, vx0, vz0, vx1, vz1, glow) {
    const ps = this.parts, area = (vx1 - vx0) * (vz1 - vz0);
    if (night < 0.5 && ps.length < 140 && Math.random() < dt * 6) { const trees = list.filter(o => o.t === 'tree'); if (trees.length) { const tr = trees[Math.random() * trees.length | 0]; ps.push({ k: 'leaf', x: tr.x + (Math.random() - 0.5) * 2, z: tr.z - 2.5, vx: 0.3, vz: 0.35, life: 5, c: tr.nut ? '#e89a3a' : Math.random() < 0.5 ? '#7cc44a' : '#d8b040', ph: Math.random() * 6 }); } }
    if (night > 0.5 && ps.length < 120 && Math.random() < dt * Math.min(30, area / 40)) { const x = vx0 + Math.random() * (vx1 - vx0), z = vz0 + Math.random() * (vz1 - vz0), k = (z | 0) * W + (x | 0); if (this.w.inb(x | 0, z | 0) && (this.tt[k] === T.GRASS || this.tt[k] === T.WATER && this.w.region[k] === RG.MARSH)) ps.push({ k: 'fly', x, z, vx: 0, vz: 0, life: 4 + Math.random() * 4, ph: Math.random() * 6 }); }
    if (night < 0.5 && ps.length < 100 && Math.random() < dt * 3) ps.push({ k: 'dust', x: vx0 + Math.random() * (vx1 - vx0), z: vz0 + Math.random() * (vz1 - vz0), vx: 0.2, vz: -0.05, life: 4, ph: Math.random() * 6 });
    for (let i = ps.length - 1; i >= 0; i--) { const p = ps[i]; p.life -= dt; if (p.life <= 0 || p.x < vx0 - 5 || p.x > vx1 + 5 || p.z < vz0 - 8 || p.z > vz1 + 5) { ps.splice(i, 1); continue; }
      if (p.k === 'leaf') { p.ph += dt * 3; p.x += (p.vx + Math.sin(p.ph) * 0.8) * dt; p.z += p.vz * dt; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x * P), Math.round(p.z * P), Math.sin(p.ph) > 0 ? 2 : 1, 1); }
      else if (p.k === 'fly') { p.ph += dt; p.x += Math.sin(p.ph * 1.7) * dt * 0.6; p.z += Math.cos(p.ph * 1.3) * dt * 0.5; const on = Math.sin(p.ph * 4) > -0.3; if (on) { ctx.fillStyle = '#e8ff8a'; ctx.fillRect(Math.round(p.x * P), Math.round(p.z * P), 1, 1); glow.push([p.x, p.z, 0.35, 'green']); } }
      else if (p.k === 'ember') { p.x += p.vx * dt; p.z += p.vz * dt; ctx.fillStyle = p.life > 0.6 ? '#ffd34a' : '#ff6a1a'; ctx.fillRect(Math.round(p.x * P), Math.round(p.z * P), 1, 1); }
      else if (p.k === 'puff') { p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.96; p.vz *= 0.96; const r = Math.round(2 + (2.4 - p.life) * 2.2); ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 1.2)) * 0.85; ctx.fillStyle = (p.ph > 3) ? '#d8d0e8' : '#a898c0'; ctx.fillRect(Math.round(p.x * P) - r, Math.round(p.z * P) - r + 1, r * 2, r * 2 - 2); ctx.fillRect(Math.round(p.x * P) - r + 1, Math.round(p.z * P) - r, r * 2 - 2, r * 2); ctx.globalAlpha = 1; }
      else if (p.k === 'smoke') { p.ph += dt; p.x += (p.vx + Math.sin(p.ph * 2) * 0.12) * dt; p.z += p.vz * dt; const r = Math.round(1 + (3.2 - p.life) * 1.4); ctx.fillStyle = `rgba(${night > 0.5 ? '120,120,140' : '235,230,220'},${(p.life / 3.2 * 0.55).toFixed(2)})`; ctx.fillRect(Math.round(p.x * P - r), Math.round(p.z * P - r), r * 2, r * 2); }
      else if (p.k === 'dust') { p.ph += dt; p.x += p.vx * dt; p.z += (p.vz + Math.sin(p.ph) * 0.1) * dt; ctx.fillStyle = 'rgba(255,250,220,.5)'; ctx.fillRect(Math.round(p.x * P), Math.round(p.z * P), 1, 1); }
      else if (p.k === 'bat') { p.x += p.vx * dt; p.z += p.vz * dt; p.vx += Math.sin(p.life * 7) * dt * 4; ctx.drawImage(this.S('bat' + (Math.floor(p.life * 10) % 2), () => A.bat(Math.floor(p.life * 10) % 2)), Math.round(p.x * P), Math.round(p.z * P)); }
    }
  }
  lighting(ctx, Wd, Hd, ox, oy, s, lights, sim) {
    const lw = Math.ceil(Wd / 4), lh = Math.ceil(Hd / 4); if (this.light.width !== lw || this.light.height !== lh) { this.light.width = lw; this.light.height = lh; }
    const L = this.lctx, d = sim.dayAmt(), tod = sim.tod; const dusk = Math.max(0, 1 - Math.abs(tod - 0.76) / 0.07), dawn = Math.max(0, 1 - Math.abs(tod - 0.235) / 0.06);
    const night = [64, 78, 150], day = [255, 252, 244], gold = [255, 168, 96], rose = [255, 190, 170];
    let c = [0, 1, 2].map(i => lerp(night[i], day[i], d)); c = c.map((v, i) => lerp(v, gold[i], dusk * 0.6)); c = c.map((v, i) => lerp(v, rose[i], dawn * 0.45));
    L.globalCompositeOperation = 'source-over'; L.fillStyle = `rgb(${c.map(v => v | 0)})`; L.fillRect(0, 0, lw, lh);
    // corruption gloom around the mansion
    const M = this.M, mx = (ox + M.cx * s) / 4, mz = (oy + M.cz * s) / 4, mr = 52 * s / 4; L.globalCompositeOperation = 'multiply'; const gr = L.createRadialGradient(mx, mz, 0, mx, mz, mr); gr.addColorStop(0, 'rgb(170,140,200)'); gr.addColorStop(0.6, 'rgb(210,190,225)'); gr.addColorStop(1, 'rgb(255,255,255)'); L.fillStyle = gr; L.fillRect(0, 0, lw, lh);
    const nt = 1 - d; if (nt > 0.05) { L.globalCompositeOperation = 'lighter'; for (const [x, z, r, col, a] of lights) { const X = (ox + x * s) / 4, Y = (oy + z * s) / 4, R = r * s / 4 * (1 + Math.sin(this.t * 11 + x * 3) * 0.03); if (X < -R || Y < -R || X > lw + R || Y > lh + R) continue; L.globalAlpha = a * Math.min(1, nt * 1.4); L.drawImage(this.glowC[col], X - R, Y - R, R * 2, R * 2); } L.globalAlpha = 1; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.imageSmoothingEnabled = true; ctx.drawImage(this.light, 0, 0, lw * 4, lh * 4); ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  }
}
const SH = { tree: [13, 5, 0, -2], dead: [10, 4, 0, -2], bush: [9, 3.5, 0, -2], rock: [12, 4, 0, -2], hut: [28, 7, 0, -4], thr: [6, 2.2, 0, 1.9], peng: [6.5, 2.2, 0, 1.9], tum: [8, 2.6, 0, 1.6], vamp: [9.5, 2.8, 0, 1.3], well: [12, 4, 0, -2], fire: [10, 3.5, 0, -2], spot: [14, 4, 0, -1], grave: [6, 2, 0, -1], lamp: [5, 2, 0, -1], pillar: [8, 3, 0, -2], logs: [10, 3, 0, -1], scarecrow: [9, 3, 0, -1], chest: [7, 2, 0, -1], barrel: [5, 2, 0, -1] };
function tileN(x, y, per, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), H = (a, b) => hash(((a % per) + per) % per, ((b % per) + per) % per, s);
  const a = H(xi, yi), b = H(xi + 1, yi), c = H(xi, yi + 1), d = H(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function caveArt() { const c = cv(48, 36), g = c.getContext('2d'); const ROCK = ['#3e4150', '#555a6a', '#6f7586', '#8d93a3', '#b2b8c6'];
  const bl = (cx, cy, rx, ry, sd) => { for (let y = 0; y < 36; y++) for (let x = 0; x < 48; x++) { const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny; if (d > 1 + (hash(x, y, sd) - 0.5) * 0.25) continue; const l = (-nx * 0.5 - ny * 0.7 + 0.6) * 0.7 + 0.3 + (hash(x, y, sd + 1) - 0.5) * 0.3; g.fillStyle = ROCK[clamp(Math.floor(l * 5), 0, 4)]; g.fillRect(x, y, 1, 1); } };
  bl(24, 20, 22, 15, 1); bl(12, 24, 10, 10, 2); bl(36, 23, 11, 11, 3); bl(24, 9, 12, 7, 4);
  g.fillStyle = '#0c0a10'; g.beginPath(); g.ellipse(24, 30, 9, 9, 0, Math.PI, 0); g.fill(); g.fillRect(15, 30, 18, 6); g.fillStyle = '#1c1a24'; g.fillRect(17, 33, 14, 3); g.fillStyle = '#4a7a3a'; g.fillRect(8, 12, 5, 2); g.fillRect(33, 7, 4, 2); return A.outline(c, '#15151c'); }
function hollowArt() { const c = cv(38, 18), g = c.getContext('2d'); g.fillStyle = '#6b4224'; g.fillRect(3, 4, 30, 11); g.fillStyle = '#8a5a32'; g.fillRect(3, 4, 30, 3); for (let x = 5; x < 32; x += 4) { g.fillStyle = '#4a2c18'; g.fillRect(x, 8, 2, 1); }
  g.fillStyle = '#c8935a'; g.beginPath(); g.ellipse(32, 9.5, 4, 6, 0, 0, 6.283); g.fill(); g.fillStyle = '#140c08'; g.beginPath(); g.ellipse(32, 9.5, 2.6, 4.4, 0, 0, 6.283); g.fill(); g.fillStyle = '#4a8a3a'; g.fillRect(8, 3, 7, 2); g.fillRect(19, 3, 4, 1); g.fillStyle = '#d8b040'; g.fillRect(12, 2, 2, 1); return A.outline(c); }
function thickArt() { const c = cv(34, 26), g = c.getContext('2d'); const P2 = ['#1c3a1a', '#2a4e24', '#3a6a2e', '#4e8238'];
  for (let i = 0; i < 6; i++) { const cx = 7 + i * 4 + hash(i, 1, 5) * 4, cy = 12 + hash(i, 2, 5) * 7, rx = 7, ry = 6; for (let y = 0; y < 26; y++) for (let x = 0; x < 34; x++) { const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny; if (d > 1 + (hash(x, y, i) - 0.5) * 0.4) continue; g.fillStyle = P2[clamp(Math.floor((-ny * 0.6 - nx * 0.3 + 0.6) * 3 + hash(x, y, 9) * 0.8), 0, 3)]; g.fillRect(x, y, 1, 1); } }
  for (let i = 0; i < 18; i++) { g.fillStyle = i % 3 ? '#9a5ab8' : '#c83a3a'; g.fillRect(3 + hash(i, 3, 5) * 28 | 0, 4 + hash(i, 4, 5) * 18 | 0, 1, 2); } return A.outline(c, '#0e1a0c'); }
function tentArt() { const c = cv(26, 22), g = c.getContext('2d'); for (let y = 0; y < 16; y++) { const w = Math.round(2 + y * 1.3); g.fillStyle = y % 4 === 0 ? '#8a6a3a' : '#b08a4a'; g.fillRect(13 - w / 2, 4 + y, w, 1); } g.fillStyle = '#2a1a10'; g.fillRect(11, 12, 4, 8); g.fillStyle = '#6b4224'; g.fillRect(12, 1, 2, 4); return A.outline(c); }
