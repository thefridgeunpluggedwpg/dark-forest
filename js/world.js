// Dark Forest v0.2 — voxel-column island world: generation, regions, hiding spots
export const W = 512, D = 512, H = 48, WATER = 11, CH = 32, NC = W / CH;
export const RG = { SEA: 0, COAST: 1, MEADOW: 2, WOODS: 3, MARSH: 4, HIGH: 5, LAKE: 6, RUINS: 7, HAUNT: 8 };
export const REGION_NAMES = ['the Open Sea', 'the Sandy Coast', 'the Meadows', 'the Deep Woods', 'the Reedmarsh', 'the Rocky Highlands', 'Lakeside', 'the Old Ruins', 'the Haunted Heart'];
export const SPOTS = { cave: { conceal: 0.85, cap: 4, label: 'cave' }, hollow: { conceal: 0.7, cap: 2, label: 'hollow log' }, bramble: { conceal: 0.6, cap: 3, label: 'thick bramble' },
  reeds: { conceal: 0.55, cap: 3, label: 'reed bed' }, ruin: { conceal: 0.65, cap: 3, label: 'ruined nook' }, islet: { conceal: 0.9, cap: 5, label: 'lake islet' }, treehollow: { conceal: 0.5, cap: 1, label: 'tree hollow' } };
export const B = { AIR:0,GRASS:1,DIRT:2,STONE:3,SAND:4,WATER:5,LOG:6,LEAVES:7,PLANK:8,COBBLE:9,DBRICK:10,ROOF:11,WINDOW:12,
  BERRY:13,BUSH:14,NUTLEAF:15,REED:16,CROP0:17,CROP1:18,CROP2:19,CROP3:20,TORCH:21,GATE:22,THATCH:23,FARM:24,CHEST:25,MOSS:26 };
// block definitions: tiles [top, side, bottom]; walk = counts as obstacle stack; opaque = culls neighbours
const DEF = [];
function def(id, t, s, b, o = {}) { DEF[id] = { tiles: [t, s ?? t, b ?? t], walk: true, opaque: true, cutout: false, cross: false, glow: 0, ...o }; }
def(B.GRASS,0,1,2); def(B.DIRT,2); def(B.STONE,3); def(B.SAND,4);
def(B.WATER,5,5,5,{walk:false,opaque:false,water:true});
def(B.LOG,7,6,7); def(B.LEAVES,8,8,8,{opaque:false,cutout:true}); def(B.PLANK,9); def(B.COBBLE,10); def(B.DBRICK,11);
def(B.ROOF,12); def(B.WINDOW,13,13,13,{glow:0.9}); def(B.BERRY,14,14,14,{walk:false,opaque:false,cutout:true});
def(B.BUSH,15,15,15,{walk:false,opaque:false,cutout:true}); def(B.NUTLEAF,16,16,16,{opaque:false,cutout:true});
def(B.REED,17,17,17,{walk:false,opaque:false,cross:true});
for (let i = 0; i < 4; i++) def(B.CROP0+i,18+i,18+i,18+i,{walk:false,opaque:false,cross:true});
def(B.TORCH,22,22,22,{walk:false,opaque:false,torch:true,glow:1});
def(B.GATE,23,23,23,{opaque:false,cutout:true}); def(B.THATCH,24); def(B.FARM,25,2,2); def(B.CHEST,27,26,26); def(B.MOSS,28,10,10);
export { DEF };

export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(seed) {
  const perm = new Uint8Array(512), r = mulberry32(seed);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const val = (x, z) => perm[(perm[x & 255] + z) & 511] / 255;
  const sm = t => t * t * (3 - 2 * t);
  const n2 = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = sm(x - xi), zf = sm(z - zi);
    const a = val(xi, zi), b = val(xi + 1, zi), c = val(xi, zi + 1), d = val(xi + 1, zi + 1);
    return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf; };
  return (x, z, oct = 4) => { let s = 0, amp = 1, f = 1, t = 0; for (let o = 0; o < oct; o++) { s += n2(x * f, z * f) * amp; t += amp; amp *= 0.5; f *= 2.03; } return s / t; };
}

// ---------- procedural pixel-art atlas (8x8 tiles of 16px) ----------
export function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = mulberry32(1337);
  const px = (tx, ty, x, y, col) => { g.fillStyle = col; g.fillRect(tx * 16 + x, ty * 16 + y, 1, 1); };
  const rgb = (a, j = 0) => { const k = (r() - 0.5) * j; return `rgb(${a[0] + k | 0},${a[1] + k | 0},${a[2] + k | 0})`; };
  const fill = (t, base, jit, fn) => { const tx = t % 8, ty = (t / 8) | 0; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const o = fn ? fn(x, y) : null; if (o === 'clear') continue; px(tx, ty, x, y, o ? rgb(o, jit) : rgb(base, jit)); } };
  fill(0, [62, 112, 44], 26);
  fill(1, [104, 76, 52], 22, (x, y) => y < 3 + ((x * 7) % 3) ? [62, 112, 44] : null);
  fill(2, [104, 76, 52], 24);
  fill(3, [118, 118, 122], 26, (x, y) => (r() < 0.08 ? [90, 90, 96] : null));
  fill(4, [206, 190, 132], 18);
  fill(5, [40, 78, 140], 16, (x, y) => ((x + y * 3) % 11 === 0 ? [80, 120, 180] : null));
  fill(6, [92, 66, 40], 14, (x) => (x % 4 === 0 ? [64, 46, 28] : null));
  fill(7, [140, 108, 66], 10, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d > 7 ? [92, 66, 40] : ((d | 0) % 3 === 0 ? [112, 84, 50] : null); });
  fill(8, [34, 82, 34], 30, () => (r() < 0.18 ? 'clear' : null));
  fill(9, [168, 128, 78], 14, (x, y) => (y % 4 === 3 ? [118, 86, 50] : (x === ((y >> 2) * 5) % 16 ? [118, 86, 50] : null)));
  fill(10, [112, 112, 112], 22, (x, y) => ((y % 5 === 4) || ((x + (y / 5 | 0) * 6) % 8 === 0) ? [70, 70, 72] : null));
  fill(11, [46, 38, 48], 10, (x, y) => ((y % 4 === 3) || ((x + (y >> 2) * 4) % 8 === 0) ? [24, 18, 26] : null));
  fill(12, [52, 44, 64], 10, (x, y) => (y % 4 === 0 ? [30, 24, 40] : null));
  fill(13, [170, 20, 30], 30, (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7 ? [30, 22, 30] : null));
  fill(14, [40, 96, 40], 26, (x, y) => (r() < 0.12 ? [210, 30, 60] : (r() < 0.08 ? 'clear' : null)));
  fill(15, [52, 84, 40], 26, () => (r() < 0.1 ? 'clear' : null));
  fill(16, [44, 90, 30], 26, (x, y) => (r() < 0.1 ? [150, 100, 40] : (r() < 0.15 ? 'clear' : null)));
  const cross = (t, stem, tip, h) => fill(t, [0, 0, 0], 20, (x, y) => { const on = (x % 5 === 2 || x % 7 === 4) && y >= 16 - h; return on ? (y < 16 - h + 3 ? tip : stem) : 'clear'; });
  cross(17, [90, 140, 60], [120, 90, 50], 15);
  cross(18, [80, 160, 60], [80, 160, 60], 4); cross(19, [80, 160, 60], [100, 170, 60], 8);
  cross(20, [100, 150, 50], [200, 180, 60], 12); cross(21, [150, 140, 50], [230, 200, 70], 15);
  fill(22, [0, 0, 0], 10, (x, y) => (x >= 6 && x <= 9 ? (y < 4 ? [255, 200, 80] : [110, 80, 40]) : 'clear'));
  fill(23, [70, 50, 30], 12, (x, y) => (x % 4 === 0 || y === 2 || y === 13 ? (y === 2 || y === 13 ? [60, 60, 64] : [96, 68, 40]) : 'clear'));
  fill(24, [196, 166, 80], 30, (x, y) => ((x + y) % 3 === 0 ? [150, 120, 50] : null));
  fill(25, [86, 58, 36], 14, (x, y) => (y % 4 < 2 ? [64, 42, 26] : null));
  fill(26, [130, 92, 46], 14, (x, y) => (y === 5 || y === 6 ? [60, 60, 64] : (x === 0 || x === 15 ? [90, 60, 30] : null)));
  fill(27, [150, 110, 60], 14, (x, y) => (x === 0 || x === 15 || y === 0 || y === 15 ? [90, 60, 30] : null));
  fill(28, [96, 112, 88], 22, (x, y) => (r() < 0.3 ? [60, 100, 50] : null));
  return c;
}

export class World {
  constructor(seed) {
    this.seed = seed; this.data = new Uint8Array(W * H * D);
    this.ground = new Uint8Array(W * D); this.stack = new Uint8Array(W * D); this.water = new Uint8Array(W * D);
    this.dirty = new Set(); this.torches = new Map(); this.nodes = []; this.nodeAt = new Map(); this.gates = new Map();
    this.rng = mulberry32(seed * 7919 + 13);
    this.gen();
  }
  idx(x, y, z) { return (y * D + z) * W + x; }
  get(x, y, z) { if (x < 0 || z < 0 || x >= W || z >= D || y < 0 || y >= H) return 0; return this.data[(y * D + z) * W + x]; }
  top(x, z) { const k = z * W + x; return this.ground[k] + this.stack[k]; }
  inb(x, z) { return x >= 0 && z >= 0 && x < W && z < D; }
  recalcStack(x, z) { const k = z * W + x; let s = 0, g = this.ground[k]; while (g + s < H) { const b = this.get(x, g + s, z); if (!b || !DEF[b].walk) break; s++; } this.stack[k] = s; }
  set(x, y, z, b, quiet) {
    if (x < 0 || z < 0 || x >= W || z >= D || y < 0 || y >= H) return;
    const i = this.idx(x, y, z), old = this.data[i]; if (old === b) return;
    this.data[i] = b;
    if (quiet) return;
    this.recalcStack(x, z);
    const cx = x >> 5, cz = z >> 5; this.dirty.add(cx + ',' + cz);
    if ((x & 31) === 0 && cx > 0) this.dirty.add((cx - 1) + ',' + cz); if ((x & 31) === 31 && cx < NC - 1) this.dirty.add((cx + 1) + ',' + cz);
    if ((z & 31) === 0 && cz > 0) this.dirty.add(cx + ',' + (cz - 1)); if ((z & 31) === 31 && cz < NC - 1) this.dirty.add(cx + ',' + (cz + 1));
    if (b === B.TORCH || old === B.TORCH) {
      const key = x + ',' + y + ',' + z; if (b === B.TORCH) this.torches.set(key, [x + 0.5, y + 0.6, z + 0.5]); else this.torches.delete(key);
      for (let ax = (x - 9) >> 5; ax <= (x + 9) >> 5; ax++) for (let az = (z - 9) >> 5; az <= (z + 9) >> 5; az++) if (ax >= 0 && az >= 0 && ax < NC && az < NC) this.dirty.add(ax + ',' + az);
    }
  }
  addNode(type, x, z, amt, blocks, extra = {}) {
    const n = { id: this.nodes.length, type, x, z, amt, max: amt, timer: 0, blocks, ...extra }; this.nodes.push(n); this.nodeAt.set(z * W + x, n); return n;
  }
  gen() {
    const n = makeNoise(this.seed), n2 = makeNoise(this.seed + 99), n3 = makeNoise(this.seed + 7), n4 = makeNoise(this.seed + 313), r = this.rng;
    const hm = new Float32Array(W * D), MX = W >> 1, MZ = D >> 1, IR = W * 0.46;
    // ---- regions: Haunted Heart at the centre, the rest as warped Voronoi cells around it ----
    const kinds = [RG.MEADOW, RG.WOODS, RG.MARSH, RG.HIGH, RG.LAKE, RG.MEADOW, RG.RUINS, RG.WOODS, RG.HIGH, RG.MEADOW];
    for (let i = kinds.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    const a0 = r() * 6.283; this.regionSeeds = kinds.map((k, i) => { const a = a0 + i / kinds.length * 6.283 + (r() - 0.5) * 0.3, d = IR * (0.42 + r() * 0.22); return { k, x: MX + Math.cos(a) * d, z: MZ + Math.sin(a) * d }; });
    this.region = new Uint8Array(W * D); this.coast = new Float32Array(W * D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const k = z * W + x, wx = x + (n4(x * 0.02, z * 0.02, 3) - 0.5) * 70, wz = z + (n4(x * 0.02 + 40, z * 0.02 + 40, 3) - 0.5) * 70;
      // island mask (warped radial falloff)
      const dx = (x - MX) / IR, dz = (z - MZ) / IR, rr = Math.hypot(dx, dz) + (n2(x * 0.012, z * 0.012, 4) - 0.5) * 0.45;
      const land = 1 - Math.min(1, Math.max(0, (rr - 0.84) / 0.2)); this.coast[k] = land;
      let best = 0, bd = 1e9; for (const s of this.regionSeeds) { const d = Math.hypot(wx - s.x, wz - s.z); if (d < bd) { bd = d; best = s.k; } }
      if (Math.hypot(wx - MX, wz - MZ) < IR * 0.2) best = RG.HAUNT;
      const e = n(x * 0.008, z * 0.008, 5); let h = 13 + Math.pow(e, 1.3) * 16;
      if (best === RG.HIGH) h += 6 + Math.pow(n3(x * 0.02, z * 0.02, 4), 1.5) * 26;
      if (best === RG.MARSH) { h = WATER + 0.6 + (n3(x * 0.05, z * 0.05, 3) - 0.45) * 5; }
      if (best === RG.MEADOW) h = 14 + (h - 14) * 0.5;
      h = WATER - 6 + (h - (WATER - 6)) * Math.min(1, land * 1.6); if (land < 0.35) h = Math.min(h, WATER - 1 - (0.35 - land) * 20);
      if (land >= 0.35 && land < 0.52) { best = RG.COAST; h = Math.min(h, WATER + 1 + (land - 0.35) * 14 + n3(x * 0.06, z * 0.06, 2) * 3); }
      if (land < 0.35) best = RG.SEA;
      hm[k] = h; this.region[k] = best;
    }
    // lake: carve a bowl with an islet around each lake seed
    this.lakes = [];
    for (const s of this.regionSeeds) if (s.k === RG.LAKE) { const R = 24; this.lakes.push({ x: Math.round(s.x), z: Math.round(s.z), R });
      for (let z = -R - 6; z <= R + 6; z++) for (let x = -R - 6; x <= R + 6; x++) { const X = Math.round(s.x) + x, Z = Math.round(s.z) + z; if (!this.inb(X, Z)) continue; const k = Z * W + X, d = Math.hypot(x, z) + (n3(X * 0.08, Z * 0.08, 2) - 0.5) * 8;
        if (d < R) hm[k] = d < 3.2 ? WATER + 1.5 : WATER - 1 - Math.min(5, (R - d) * 0.4); else if (d < R + 6) hm[k] = Math.min(hm[k], WATER + 1 + (d - R) * 0.6); } }
    const mh = Math.max(WATER + 4, Math.round(hm[MZ * W + MX])); this.mansionY = Math.min(Math.max(mh, 16), 22);
    for (let z = MZ - 40; z < MZ + 40; z++) for (let x = MX - 40; x < MX + 40; x++) { const d = Math.hypot(x - MX, z - MZ); if (d < 38) { const t = d < 22 ? 1 : 1 - (d - 22) / 16; const s = t * t * (3 - 2 * t); hm[z * W + x] = hm[z * W + x] * (1 - s) + this.mansionY * s; } }
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const k = z * W + x; const h = Math.max(2, Math.min(42, Math.round(hm[k]))), rg = this.region[k];
      const sl = Math.abs((hm[k + 1] ?? hm[k]) - (hm[k - 1] ?? hm[k])) + Math.abs((hm[k + W] ?? hm[k]) - (hm[k - W] ?? hm[k]));
      for (let y = 0; y < h; y++) {
        let b = B.STONE; if (y >= h - 3) b = B.DIRT; if (y === h - 1) b = h <= WATER + 1 || rg === RG.COAST ? B.SAND : (sl > 4.5 || h > 31 || (rg === RG.HIGH && h > 27) ? B.STONE : B.GRASS);
        this.data[this.idx(x, y, z)] = b;
      }
      for (let y = h; y < WATER; y++) this.data[this.idx(x, y, z)] = B.WATER;
      this.ground[k] = h; if (h < WATER) this.water[k] = 1;
    }
    // ---- features per region ----
    this.spots = []; this.decor = [];
    const near = (x, z, b, rad) => { for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) { const g = this.ground[(z + dz) * W + x + dx]; if (this.get(x + dx, g, z + dz) === b) return true; } return false; };
    const spotNear = (x, z, d) => this.spots.some(s => Math.abs(s.x - x) < d && Math.abs(s.z - z) < d);
    for (let z = 4; z < D - 4; z++) for (let x = 4; x < W - 4; x++) {
      const k = z * W + x, g = this.ground[k], topb = this.get(x, g - 1, z), rg = this.region[k];
      if (Math.hypot(x - MX, z - MZ) < 24 || this.water[k]) continue;
      const wet = this.water[k + 1] || this.water[k - 1] || this.water[k + W] || this.water[k - W];
      const rr = r();
      if (wet && (topb === B.SAND || rg === RG.MARSH) && rg !== RG.COAST && rr < (rg === RG.MARSH ? 0.6 : 0.4)) { if (rg === RG.MARSH && r() < 0.03 && !spotNear(x, z, 9)) this.addSpot("reeds", x, z); this.data[this.idx(x, g, z)] = B.REED; this.addNode('reed', x, z, 3, [[x, g, z]], { regrow: 500 });
        if (rg === RG.MARSH && r() < 0.05 && !spotNear(x, z, 9)) this.addSpot('reeds', x, z); continue; }
      if (topb === B.SAND) { if (rg === RG.COAST && rr < 0.004) this.decor.push({ t: 'dune', x, z }); continue; }
      if (topb === B.STONE) { if (rr < 0.012) this.outcrop(x, z, g); else if (rg === RG.HIGH && rr > 0.9965 && !spotNear(x, z, 14)) this.cave(x, z, g); continue; }
      if (topb !== B.GRASS) continue;
      const f = n3(x * 0.03, z * 0.03, 3);
      const dens = { [RG.WOODS]: 0.16, [RG.MEADOW]: 0.025, [RG.MARSH]: 0.02, [RG.HIGH]: 0.03, [RG.LAKE]: 0.05, [RG.RUINS]: 0.05, [RG.HAUNT]: 0.03 }[rg] || 0.04;
      const berry = { [RG.MEADOW]: 0.012, [RG.LAKE]: 0.006, [RG.WOODS]: 0.003 }[rg] || 0.0015;
      if (rr < dens * Math.max(0.15, f - 0.2) * 2.4 && !near(x, z, B.LOG, 2)) { if (rg === RG.HAUNT) { this.deadTree(x, z, g); continue; }
        this.tree(x, z, g, r() < (rg === RG.WOODS ? 0.32 : 0.1)); if (rg === RG.WOODS && r() < 0.03 && !spotNear(x, z, 10)) this.addSpot('hollow', x, z + 1); else if ((rg === RG.WOODS || rg === RG.MEADOW) && r() < 0.012 && !spotNear(x, z, 12)) this.addSpot('treehollow', x, z); }
      else if (rr > 1 - berry) { this.data[this.idx(x, g, z)] = B.BERRY; this.addNode('berry', x, z, 5, [[x, g, z]], { regrow: 700 }); }
      else if (rr > 0.5 && rr < 0.5 + (rg === RG.HIGH ? 0.012 : 0.0015)) this.outcrop(x, z, g);
      else if (rg === RG.HIGH && rr > 0.6 && rr < 0.6006 && !spotNear(x, z, 16)) this.cave(x, z, g);
      else if (rg === RG.WOODS && rr > 0.7 && rr < 0.7006 && !spotNear(x, z, 12)) this.addSpot('hollow', x, z);
      else if ((rg === RG.WOODS || rg === RG.HAUNT) && rr > 0.8 && rr < 0.8008 && !spotNear(x, z, 12)) this.addSpot('bramble', x, z);
      else if (rg === RG.WOODS && rr > 0.3 && rr < 0.31) this.decor.push({ t: 'mushroom', x, z });
      else if (rg === RG.MEADOW && rr > 0.3 && rr < 0.3012) this.decor.push({ t: 'flowers', x, z });
    }
    // ruins: crumbling stone rectangles with nooks
    for (const s of this.regionSeeds) if (s.k === RG.RUINS) for (let i = 0; i < 9; i++) {
      const cx = Math.round(s.x + (r() - 0.5) * 50), cz = Math.round(s.z + (r() - 0.5) * 50), hw = 2 + (r() * 3 | 0), hd = 2 + (r() * 3 | 0); if (!this.inb(cx - 6, cz - 6) || !this.inb(cx + 6, cz + 6)) continue; if (this.water[cz * W + cx]) continue;
      for (let z = cz - hd; z <= cz + hd; z++) for (let x = cx - hw; x <= cx + hw; x++) { if (!(x === cx - hw || x === cx + hw || z === cz - hd || z === cz + hd)) continue; if (r() < 0.3 || this.water[z * W + x]) continue; const g = this.ground[z * W + x]; const hh = 1 + (r() < 0.5 ? 1 : 0);
        for (let y = 0; y < hh; y++) this.data[this.idx(x, g + y, z)] = r() < 0.25 ? B.MOSS : B.COBBLE; }
      this.decor.push({ t: 'ruin', x: cx, z: cz, hw, hd }); this.addSpot('ruin', cx, cz);
    }
    // lake islet + dock
    for (const L of this.lakes) { this.addSpot('islet', L.x, L.z); let dx = 0; while (this.water[L.z * W + L.x + 4 + dx] && dx < 40) dx++; this.decor.push({ t: 'dock', x: L.x + 4 + dx, z: L.z, len: 5 }); }
    // thick brambles near the haunted heart
    for (let i = 0; i < 6; i++) { const a = r() * 6.283, d = 30 + r() * 14, x = Math.round(MX + Math.cos(a) * d), z = Math.round(MZ + Math.sin(a) * d); if (!this.water[z * W + x]) this.addSpot('bramble', x, z); }
    this.buildMansion(MX, MZ);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) this.recalcStack(x, z);
    for (let cz = 0; cz < NC; cz++) for (let cx = 0; cx < NC; cx++) this.dirty.add(cx + ',' + cz);
  }
  regionAt(x, z) { x |= 0; z |= 0; if (!this.inb(x, z)) return 'the Open Sea'; return REGION_NAMES[this.region[z * W + x]]; }
  addSpot(kind, x, z) { const S = SPOTS[kind]; if (!this.inb(x, z)) return; const sp = { id: this.spots.length, kind, x: x + 0.5, z: z + 0.5, conceal: S.conceal, cap: S.cap, label: S.label, region: this.regionAt(x, z), occ: new Set() }; this.spots.push(sp); return sp; }
  cave(x, z, g) { this.addSpot('cave', x, z); for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0]]) { const X = x + dx, Z = z + dz, gg = this.ground[Z * W + X]; for (let y = 0; y < 2; y++) if (this.get(X, gg + y, Z) === 0) this.data[this.idx(X, gg + y, Z)] = B.STONE; } }
  deadTree(x, z, g) { for (let y = 0; y < 4; y++) this.data[this.idx(x, g + y, z)] = B.LOG; this.addNode('wood', x, z, 4, [[x, g, z], [x, g + 1, z], [x, g + 2, z], [x, g + 3, z]], { dead: false, deadTree: true }); }
  tree(x, z, g, nut) {
    const r = this.rng, h = 4 + (r() * 3 | 0), blocks = [];
    for (let y = 0; y < h; y++) { this.data[this.idx(x, g + y, z)] = B.LOG; blocks.push([x, g + y, z]); }
    const L = nut ? B.NUTLEAF : B.LEAVES;
    for (let dy = -2; dy <= 1; dy++) { const rad = dy >= 0 ? 1 : 2; for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      if (Math.abs(dx) === rad && Math.abs(dz) === rad && r() < 0.6) continue; const yy = g + h + dy; if (yy >= H) continue;
      if (this.get(x + dx, yy, z + dz) === 0) { this.data[this.idx(x + dx, yy, z + dz)] = L; blocks.push([x + dx, yy, z + dz]); } } }
    if (g + h + 2 < H) { this.data[this.idx(x, g + h + 2, z)] = L; blocks.push([x, g + h + 2, z]); }
    this.addNode(nut ? 'nut' : 'wood', x, z, nut ? 6 : 6, blocks, { wood: 6, tree: true, regrow: nut ? 900 : 0 });
  }
  outcrop(x, z, g) {
    const r = this.rng, blocks = [];
    for (let i = 0; i < 6; i++) { const dx = (r() * 3 | 0) - 1, dz = (r() * 3 | 0) - 1, xx = x + dx, zz = z + dz; const gg = this.ground[zz * W + xx];
      let y = gg; while (this.get(xx, y, zz) === B.STONE) y++; if (y > gg + 2 || this.get(xx, y, zz) !== 0) continue; this.data[this.idx(xx, y, zz)] = r() < 0.2 ? B.MOSS : B.STONE; blocks.push([xx, y, zz]); }
    if (blocks.length) this.addNode('stone', x, z, 12, blocks);
  }
  buildMansion(cx, cz) {
    const y0 = this.mansionY, s = (x, y, z, b) => { if (y < H) this.data[this.idx(x, y, z)] = b; };
    const x0 = cx - 8, x1 = cx + 8, z0 = cz - 6, z1 = cz + 6;
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let z = z0 - 2; z <= z1 + 4; z++) s(x, y0 - 1, z, B.DBRICK);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      if (!edge) continue;
      for (let y = 0; y < 7; y++) {
        const door = z === z1 && (x === cx || x === cx - 1) && y < 3;
        if (door) continue;
        const win = (y === 2 || y === 3 || y === 5) && ((x - x0) % 3 === 1 || (z - z0) % 3 === 1) && !(x === x0 && z === z0);
        s(x, y0 + y, z, win ? B.WINDOW : B.DBRICK);
      }
    }
    for (let i = 0; i < 6; i++) for (let x = x0 + i; x <= x1 - i; x++) for (let z = z0 + i; z <= z1 - i; z++) if (x === x0 + i || x === x1 - i || z === z0 + i || z === z1 - i || i === 5) s(x, y0 + 7 + i, z, B.ROOF);
    const tower = (tx, tz, h) => { for (let y = 0; y < h; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) s(tx + dx, y0 + y, tz + dz, (y % 4 === 2 && !(dx && dz)) ? B.WINDOW : B.DBRICK);
      s(tx, y0 + h, tz, B.ROOF); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) s(tx + dx, y0 + h, tz + dz, B.ROOF); s(tx, y0 + h + 1, tz, B.ROOF); s(tx, y0 + h + 2, tz, B.ROOF); s(tx, y0 + h + 3, tz, B.WINDOW); };
    tower(x0, z0, 13); tower(x1, z0, 13); tower(x0, z1, 11); tower(x1, z1, 11);
    for (let y = 12; y < 20; y++) s(cx, y0 + y, cz, y > 17 ? B.WINDOW : B.ROOF);
    // graveyard + dead trees
    const r = this.rng;
    for (let i = 0; i < 18; i++) { const a = r() * Math.PI * 2, d = 11 + r() * 6; const x = Math.round(cx + Math.cos(a) * d), z = Math.round(cz + Math.sin(a) * d) ; if (z <= z1 + 1 && z >= z0 - 1 && x >= x0 - 1 && x <= x1 + 1) continue; if (Math.abs(x - cx) < 2 && z > z1) continue; const g = this.ground[z * W + x];
      if (r() < 0.7) s(x, g, z, B.MOSS); else { for (let y = 0; y < 4; y++) s(x, g + y, z, B.LOG); s(x + 1, g + 3, z, B.LOG); } }
    for (const [tx, tz] of [[cx - 2, z1 + 2], [cx + 1, z1 + 2]]) { s(tx, y0, tz, B.DBRICK); s(tx, y0 + 1, tz, B.TORCH); this.torches.set(tx + ',' + (y0 + 1) + ',' + tz, [tx + .5, y0 + 1.6, tz + .5]); }
    this.mansion = { x: cx + 0.5, z: cz + 0.5, door: { x: cx, z: z1 + 2 } };
  }

}
// face table: corners [x,y,z,u,v, t1x,t1y,t1z, t2x,t2y,t2z] — winding fixed up below so normals face outward
const FACES = (() => {
  const out = [];
  const dirs = [[1, 0, 0, 0.8], [-1, 0, 0, 0.8], [0, 1, 0, 1], [0, -1, 0, 0.5], [0, 0, 1, 0.66], [0, 0, -1, 0.66]];
  for (const [nx, ny, nz, shade] of dirs) {
    const ax = nx ? 0 : ny ? 1 : 2; const ta = ax === 1 ? [0, 2] : ax === 0 ? [2, 1] : [0, 1];
    let cs = [[0, 0], [0, 1], [1, 1], [1, 0]].map(([a, b]) => { const p = [0, 0, 0]; p[ax] = (nx + ny + nz) > 0 ? 1 : 0; p[ta[0]] = a; p[ta[1]] = b;
      const t1 = [0, 0, 0], t2 = [0, 0, 0]; t1[ta[0]] = a ? 1 : -1; t2[ta[1]] = b ? 1 : -1; return [p[0], p[1], p[2], a, b, ...t1, ...t2]; });
    const e1 = [0, 1, 2].map(i => cs[1][i] - cs[0][i]), e2 = [0, 1, 2].map(i => cs[2][i] - cs[0][i]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * nx + cr[1] * ny + cr[2] * nz < 0) cs = [cs[0], cs[3], cs[2], cs[1]];
    out.push({ n: [nx, ny, nz], c: cs, shade });
  }
  return out;
})();
