// Dark Forest v0.2 — simulation (fixed 10 Hz tick): Thronglets, tribes, reputation, vampires
import { W, D, H, B, DEF, RG, mulberry32 } from './world.js';
import { PenguinMixin, BEDROOMS } from './penguins.js';
export { BEDROOMS };
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
export const DAY = 1200, TPS = 10;
const FOOD = ['berry', 'nut', 'crop'];
const TRIBE_NAMES = ['Mossbrook', 'Oakhollow', 'Fernreach', 'Ashgrove', 'Thornwick', 'Emberfall', 'Briarden', 'Duskmere', 'Willowend', 'Cinderpine'];
const TRIBE_COLORS = [0x6fc3ff, 0xffb04a, 0x9be26a, 0xe27adf, 0xfff06a, 0xff6a6a, 0x6affd8, 0xc0a0ff, 0xffffff, 0xa0ff40];
const VAMP_NAMES = ['Stefan', 'Vlad', 'Carmilla', 'Lucian', 'Mircea', 'Elisabeta', 'Dracul', 'Ilona', 'Radu', 'Mina', 'Bathory', 'Anca'];
export const VAMP_CAP = 12;
export const BAT_SPEED = 2.6;
export const SHADE_R = 12; // v0.9: the mansion's shadow — vampires are sun-immune within this radius of 83 Kingsway's centre
const HUT_SLOTS = 8, RING_R = 11;
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

export class Sim {
  constructor(world, seed) {
    this.w = world; this.seed = seed; this.r = mulberry32(seed * 31 + 5);
    this.tick = Math.round(DAY * 0.28); this.ents = []; this.byId = new Map(); this.nid = 1; this.tribes = []; this.logs = [];
    this.stats = { hoards: 0, excoms: 0, attacks: 0, kills: 0, wallBlocks: 0, huts: 0, breaches: 0, turned: 0, births: 0, deaths: 0, shares: 0, thefts: 0, founded: 0, abandons: 0 };
    this.usedNames = new Set(); this.vampIdx = 0; this.onLog = null; this.huntLogged = new Set();
    this.astarBuf = { g: new Float32Array(W * D), came: new Int32Array(W * D), stamp: new Uint32Array(W * D), s: 0 };
    this.genHideouts();
    for (let t = 0; t < 4; t++) {
      const site = this.findSite(null); if (!site) continue;
      const tr = this.foundTribe(site.x, site.z, null);
      for (let i = 0; i < 7; i++) { const e = this.spawnThronglet(site.x + (this.r() - .5) * 6, site.z + (this.r() - .5) * 6); this.join(e, tr); }
      this.log(`The ${tr.name} tribe gathered around a fire in the glade.`, 'tribe');
    }
    this.initPenguins();
  }
  // ---------- time ----------
  get day() { return Math.floor(this.tick / DAY) + 1; }
  get tod() { return (this.tick % DAY) / DAY; }
  // v0.8 vampire threat: grows with the days, eases off when the island is nearly empty (no extinction)
  threat() { return Math.min(1, Math.max(0, (this.day - 1) / 24)); }
  // v0.10 coven appetite: a nightly kill budget that shrinks as the Thronglets thin out, so the forest never empties
  nightKey() { return this.tod > 0.5 ? this.day : this.day - 1; }
  killBudget() { const n = this.thronglets().length; return n < 28 ? 0 : Math.max(1, Math.min(10, Math.round((n - 30) / 2.5))); }
  sated() { return (this.nightKills && this.nightKills.k === this.nightKey() ? this.nightKills.n : 0) >= this.killBudget(); }
  ease() { const n = this.thronglets().length; return n < 14 ? 0.25 : n < 24 ? 0.55 : n < 34 ? 0.8 : 1; }
  vampName() { if (this.vampIdx < VAMP_NAMES.length) return VAMP_NAMES[this.vampIdx++]; const used = new Set(this.vamps().map(v => v.name)); for (let k = 2; k < 20; k++) for (const n of VAMP_NAMES.slice(1)) { const c = n + ' ' + ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(8, k - 2)]; if (!used.has(c)) return c; } return 'Vampire ' + this.nid; }
  get SHADE_R() { return SHADE_R; }
  inShade(x, z) { const m = this.w.mansion; return dist(x, z, m.x, m.z) < SHADE_R; }
  vampNight() { const t = this.tod; return t < 0.22 || t > 0.72; } // vampires leave right at dusk
  isNight() { const t = this.tod; return t < 0.22 || t > 0.78; }
  dayAmt() { const t = this.tod, s = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); }; return s(0.18, 0.3, t) * (1 - s(0.7, 0.82, t)); }
  stamp() { return (this.isNight() ? 'Night ' : 'Day ') + this.day; }
  log(text, kind = 'info') { const L = { tick: this.tick, text: `${this.stamp()}: ${text}`, kind }; this.logs.push(L); if (this.logs.length > 400) this.logs.shift(); this.onLog && this.onLog(L); }
  rnd(a = 1, b) { return b === undefined ? this.r() * a : a + this.r() * (b - a); }
  // ---------- names ----------
  name() { const A = 'MTPZNBKRLGFWDSHV', V = ['i', 'o', 'a', 'u', 'e', 'oo', 'ee', 'y'], E = ['b', 'k', 'p', 'n', 'm', 't', 'g', 'x', 'z', 'ff', 'll', 'sh', ''];
    for (let i = 0; i < 40; i++) { const n = A[this.rnd(A.length) | 0] + V[this.rnd(V.length) | 0] + E[this.rnd(E.length) | 0] + (i > 20 ? (i | 0) : ''); if (!this.usedNames.has(n) && n.length > 1) { this.usedNames.add(n); return n; } } return 'T' + this.nid; }
  // ---------- spawning ----------
  spawnThronglet(x, z, traits) {
    x = Math.max(2, Math.min(W - 3, x)); z = Math.max(2, Math.min(D - 3, z));
    const r = this.r;
    const e = { id: this.nid++, kind: 't', name: this.name(), x, z, px: x, pz: z, y: this.w.top(x | 0, z | 0), dir: r() * 6.28, hp: 100, hunger: 20 + r() * 20, energy: 80, fear: 0,
      inv: { berry: 0, nut: 0, crop: 0, wood: 0, stone: 0, reed: 0 }, traits: traits || { greed: Math.pow(r(), 1.6), loyalty: r(), bravery: r(), social: r() },
      tribe: null, exile: false, op: new Map(), mem: [], bad: { hoard: 0, abandon: 0, attack: 0 }, act: null, path: null, stuck: 0, pathCool: 0, born: this.tick, state: 'idle', home: null, alive: true, walk: 0, cool: 0 };
    if (!traits && r() < 0.18) e.traits.greed = 0.8 + r() * 0.2; // a few natural hoarders
    this.ents.push(e); this.byId.set(e.id, e); return e;
  }
  spawnVampire(x, z, name, turned) {
    const e = { id: this.nid++, kind: 'v', name: name || this.vampName(), x, z, px: x, pz: z, y: this.w.top(x | 0, z | 0), dir: 0, hp: 150, maxhp: 150,
      act: null, path: null, stuck: 0, pathCool: 0, alive: true, walk: 0, cool: 0, kills: 0, turned: !!turned, assign: null, wait: 0, state: 'resting' };
    if (e.name === 'Stefan') { e.hp = e.maxhp = 220; } e.hp = e.maxhp = Math.round(e.maxhp * (1 + 0.7 * this.threat()));
    this.ents.push(e); this.byId.set(e.id, e); return e;
  }
  vamps() { return this.ents.filter(e => e.kind === 'v' && e.alive); }
  thronglets() { return this.ents.filter(e => e.kind === 't' && e.alive); }
  // ---------- tribes ----------
  // v0.10: vampire daytime hideouts — caves, hollow logs, crypt hollows scattered through the forest. Not buildings; Thronglets never use them.
  genHideouts() { const w = this.w, rr = mulberry32(this.seed * 977 + 13), m = w.mansion, KINDS = ['cave', 'log', 'crypt'], LBL = { cave: 'a cave', log: 'a hollow log', crypt: 'a crypt hollow' }; this.hideouts = [];
    const N = 6, cell = (W - 40) / N;
    for (let gz = 0; gz < N; gz++) for (let gx = 0; gx < N; gx++) { for (let t = 0; t < 30; t++) { const x = Math.round(20 + (gx + 0.15 + rr() * 0.7) * cell), z = Math.round(20 + (gz + 0.15 + rr() * 0.7) * cell), k = z * W + x;
        if (w.water[k] || w.water[k + 1] || w.water[k + W] || dist(x, z, m.x, m.z) < 28) continue; const rg = w.region[k]; if (rg === RG.SEA || rg === RG.COAST) continue;
        const kind = rg === RG.HAUNT ? 'crypt' : KINDS[(rr() * 3) | 0], h = { id: this.hideouts.length, x: x + 0.5, z: z + 0.9, kind, v: (rr() * 1000) | 0, occ: new Set(), cap: 2 }; h.name = `${LBL[kind]} in ${w.regionAt(x, z)}`; this.hideouts.push(h); break; } } }
  hideoutFor(v) { let best = null, bd = 1e9; for (const h of this.hideouts) { if (h.occ.size >= h.cap && !h.occ.has(v.id)) continue; const d = dist(v.x, v.z, h.x, h.z); if (d < bd) { bd = d; best = h; } } return best; }
  leaveHideout(v) { if (v.hideout) { v.hideout.occ.delete(v.id); v.hideout = null; } }
  findSite(near, maxD = 999) {
    const w = this.w;
    for (let tries = 0; tries < 600; tries++) {
      let x, z;
      if (near && tries < 400) { const a = this.rnd(6.28), d = this.rnd(10, maxD); x = Math.round(near.x + Math.cos(a) * d); z = Math.round(near.z + Math.sin(a) * d); }
      else { x = 24 + (this.rnd(W - 48) | 0); z = 24 + (this.rnd(D - 48) | 0); }
      if (x < 16 || z < 16 || x > W - 17 || z > D - 17) continue;
      if (dist(x, z, w.mansion.x, w.mansion.z) < 42) continue;
      { const rg = w.region[z * W + x]; if (rg === RG.SEA || rg === RG.COAST || rg === RG.HAUNT || rg === RG.MARSH || (tries < 350 && rg !== RG.MEADOW && rg !== RG.LAKE && rg !== RG.WOODS)) continue; }
      if (this.tribes.some(t => t.alive && dist(x, z, t.cx, t.cz) < 34)) continue;
      if (this.hideouts && this.hideouts.some(h => dist(x, z, h.x, h.z) < 20)) continue;
      const g0 = w.ground[z * W + x]; let ok = true, var_ = 0;
      for (let dz = -13; dz <= 13 && ok; dz += 2) for (let dx = -13; dx <= 13; dx += 2) { const k = (z + dz) * W + x + dx; if (w.water[k]) { ok = false; break; } var_ = Math.max(var_, Math.abs(w.ground[k] - g0)); }
      if (!ok || var_ > (tries > 300 ? 6 : 3)) continue;
      return { x, z };
    }
    return null;
  }
  foundTribe(x, z, founders) {
    const i = this.tribes.length, w = this.w;
    const tr = { id: i, name: TRIBE_NAMES[i % TRIBE_NAMES.length] + (i >= TRIBE_NAMES.length ? ' II' : ''), color: TRIBE_COLORS[i % TRIBE_COLORS.length], cx: x + 0.5, cz: z + 0.5, x, z,
      stock: { food: 6, wood: 0, stone: 0, reed: 0 }, huts: [], farms: [], jobs: [], wall: null, members: new Set(), chief: null, founded: this.day, alive: true, outcasts: !!founders };
    this.tribes.push(tr); this.stats.founded++;
    // clear the glade: chop trees / remove outcrops inside the future ring
    for (const n of w.nodes) if (n.amt > 0 && dist(n.x, n.z, x, z) < RING_R + 2) { if (n.type === 'wood' || n.type === 'nut') tr.stock.wood += 3; if (n.type === 'stone') tr.stock.stone += 4; this.depleteNode(n, true); }
    const g = w.ground[z * W + x]; w.set(x, g, z, B.CHEST); w.set(x + 1, g, z, B.TORCH);
    tr.chest = { x, z };
    return tr;
  }
  join(e, tr) { if (e.tribe != null) this.tribes[e.tribe].members.delete(e.id); e.tribe = tr.id; e.exile = false; tr.members.add(e.id); if (!tr.chief) tr.chief = e.id; }
  members(tr) { const out = []; for (const id of tr.members) { const e = this.byId.get(id); if (e && e.alive) out.push(e); } return out; }
  rep(e) { if (e.tribe == null) return 0; const m = this.members(this.tribes[e.tribe]); let s = 0, n = 0; for (const o of m) if (o !== e) { s += o.op.get(e.id) || 0; n++; } return n ? s / n : 0; }
  opAdd(o, id, d) { o.op.set(id, Math.max(-100, Math.min(100, (o.op.get(id) || 0) + d))); }
  witness(actor, kind, delta, rad = 13, victim) {
    const seen = [];
    for (const o of this.ents) { if (o.kind !== 't' || !o.alive || o === actor) continue; if (dist(o.x, o.z, actor.x, actor.z) > rad) continue;
      const f = delta < 0 ? 0.6 + o.traits.loyalty * 0.8 : 1; this.opAdd(o, actor.id, delta * f * (o === victim ? 2 : 1)); o.mem.push({ t: this.tick, txt: `${kind}: ${actor.name}` }); if (o.mem.length > 12) o.mem.shift(); seen.push(o); }
    return seen;
  }
  // ---------- resource nodes ----------
  depleteNode(n, silent) {
    const w = this.w; n.amt = 0; n.timer = n.regrow || 0;
    if (n.type === 'berry') { for (const [x, y, z] of n.blocks) w.set(x, y, z, B.BUSH); }
    else if (n.type === 'reed' || n.type === 'stone' || n.type === 'wood' || n.type === 'pile' || (n.type === 'nut' && silent)) { for (const [x, y, z] of n.blocks) w.set(x, y, z, 0); n.dead = !n.regrow || silent || n.type === 'stone'; if (n.type === 'nut') n.dead = true; }
  }
  regrowNode(n) {
    const w = this.w; n.amt = n.max;
    if (n.type === 'berry') for (const [x, y, z] of n.blocks) w.set(x, y, z, B.BERRY);
    if (n.type === 'reed') for (const [x, y, z] of n.blocks) w.set(x, y, z, B.REED);
  }
  nearestNode(e, types, maxD = 90) {
    let best = null, bd = maxD;
    for (const n of this.w.nodes) { if (n.amt <= 0 || n.dead || !types.includes(n.type)) continue; const d = Math.abs(n.x - e.x) + Math.abs(n.z - e.z); if (d < bd) { if (n.claim && n.claim !== e.id && this.byId.get(n.claim)?.alive && this.r() < 0.7) continue; bd = d; best = n; } }
    return best;
  }
  // ---------- passability & movement ----------
  passable(e, fx, fz, x, z) {
    const w = this.w; if (!w.inb(x, z)) return false; const k = z * W + x;
    if (w.water[k]) return false;
    const g = w.gates.get(k);
    if (g) {
      const tr = this.tribes[g.tribe];
      if (e.kind === 'p' || e.kind === 'm') return g.open > 0 || !tr.alive || !this.isNight();
      if (e.kind === 't') { if (e.banishing || e.tribe === g.tribe || (!this.isNight() && !(e.exTribe === g.tribe))) { g.open = 14; return true; } return false; }
      return g.open > 0 || !tr.alive;
    }
    if (w.stack[k] > 1) return false;
    if (w.top(x, z) - w.top(fx, fz) > 1) return false;
    return true;
  }
  standY(x, z) { const k = z * W + x; return this.w.gates.has(k) ? this.w.ground[k] : this.w.top(x, z); }
  astar(e, tx, tz, cap = 7000) {
    const w = this.w, buf = this.astarBuf, sx = e.x | 0, sz = e.z | 0; tx |= 0; tz |= 0;
    if (++buf.s > 4e9) buf.s = 1; const st = buf.s, G = buf.g, C = buf.came, S = buf.stamp;
    const heap = [], push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const s0 = sz * W + sx; S[s0] = st; G[s0] = 0; C[s0] = -1; push(0, s0);
    let n = 0, best = s0, bh = 1e9; const goal = tz * W + tx;
    while (heap.length && n++ < cap) {
      const [, k] = pop(); const x = k % W, z = (k / W) | 0;
      const h = Math.abs(x - tx) + Math.abs(z - tz); if (h < bh) { bh = h; best = k; } if (k === goal || h <= 1) { best = k; break; }
      for (let d = 0; d < 8; d++) {
        const dx = [1, -1, 0, 0, 1, 1, -1, -1][d], dz = [0, 0, 1, -1, 1, -1, 1, -1][d], nx = x + dx, nz = z + dz;
        if (!this.passable(e, x, z, nx, nz)) continue;
        if (d >= 4 && (!this.passable(e, x, z, x + dx, z) || !this.passable(e, x, z, x, z + dz))) continue;
        const nk = nz * W + nx, ng = G[k] + (d >= 4 ? 1.414 : 1);
        if (S[nk] === st && G[nk] <= ng) continue; S[nk] = st; G[nk] = ng; C[nk] = k; push(ng + Math.hypot(nx - tx, nz - tz) * 1.2, nk);
      }
    }
    const path = []; let k = best; while (k !== -1 && k !== s0 && path.length < 2000) { path.push(k); k = C[k]; } path.reverse(); return path;
  }
  moveTo(e, tx, tz, speed, arrive = 0.7) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < arrive) { e.path = null; return true; }
    const tkey = ((tz | 0) * W + (tx | 0));
    if (e.pathKey !== tkey) { e.path = null; e.pathKey = tkey; }
    let gx = tx, gz = tz;
    if (e.path && e.path.length) { const p = e.path[0]; gx = p % W + 0.5; gz = ((p / W) | 0) + 0.5; while (e.path && Math.hypot(gx - e.x, gz - e.z) < speed + 0.35) { e.path.shift(); if (!e.path.length) { e.path = null; gx = tx; gz = tz; break; } const q = e.path[0]; gx = q % W + 0.5; gz = ((q / W) | 0) + 0.5; } }
    let ax = gx - e.x, az = gz - e.z; const ad = Math.hypot(ax, az) || 1; ax /= ad; az /= ad;
    const step = Math.min(speed, ad + 0.01), cx = e.x | 0, cz = e.z | 0;
    const angs = e.path ? [0, 0.5, -0.5] : [0, 0.6 * (e.det || 1), -0.6 * (e.det || 1), 1.2 * (e.det || 1), -1.2 * (e.det || 1), 1.9, -1.9];
    for (const a of angs) {
      const ca = Math.cos(a), sa = Math.sin(a), vx = ax * ca - az * sa, vz = ax * sa + az * ca;
      const nx = e.x + vx * step, nz = e.z + vz * step, ncx = nx | 0, ncz = nz | 0;
      if ((ncx === cx && ncz === cz) || this.passable(e, cx, cz, ncx, ncz)) {
        if (ncx !== cx && ncz !== cz && !(this.passable(e, cx, cz, ncx, cz) && this.passable(e, cx, cz, cx, ncz))) continue;
        e.x = nx; e.z = nz; e.dir = Math.atan2(vx, vz); e.walk += step; if (a !== 0) { e.stuck++; } else e.stuck = Math.max(0, e.stuck - 1);
        if (e.stuck > 14 && !e.path && e.pathCool <= 0) this.plan(e, tx, tz);
        return false;
      }
    }
    e.stuck += 3; e.det = -(e.det || 1);
    if (e.pathCool <= 0) this.plan(e, tx, tz);
    return false;
  }
  plan(e, tx, tz) { e.path = this.astar(e, tx, tz); e.pathCool = 25; e.stuck = 0; if (!e.path.length) e.path = null; }
  insideRing(tr, x, z) { return dist(x, z, tr.cx, tr.cz) < RING_R - 0.6; }
  safeAt(x, z) { for (const tr of this.tribes) if (tr.alive && tr.wall && tr.wall.done && !tr.wall.breached && this.insideRing(tr, x, z)) return tr; return null; }
  // ---------- planning (tribe level) ----------
  hutBlueprint(tr, slot) {
    const w = this.w, a = slot / HUT_SLOTS * Math.PI * 2 + tr.id; const hx = Math.round(tr.x + Math.cos(a) * 6), hz = Math.round(tr.z + Math.sin(a) * 6);
    const ddx = tr.x - hx, ddz = tr.z - hz; const door = Math.abs(ddx) > Math.abs(ddz) ? [Math.sign(ddx), 0] : [0, Math.sign(ddz)];
    const blocks = []; let maxg = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) maxg = Math.max(maxg, w.ground[(hz + dz) * W + hx + dx]);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; if (dx === door[0] && dz === door[1]) continue; const g = w.ground[(hz + dz) * W + hx + dx];
      for (let y = g; y < maxg + 2; y++) blocks.push({ x: hx + dx, y, z: hz + dz, b: B.PLANK, cost: 'wood' }); }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) blocks.push({ x: hx + dx, y: maxg + 2, z: hz + dz, b: B.THATCH, cost: 'reed|wood' });
    blocks.push({ x: hx, y: maxg + 3, z: hz, b: B.THATCH, cost: 'reed|wood' });
    const hut = { x: hx, z: hz, door: { x: hx + 0.5, z: hz + 2.25 }, inside: { x: hx + 0.5, z: hz + 0.5 }, level: 0, owners: [], slot, doorDir: door, occ: new Set() };
    return { type: 'hut', hut, blocks, idx: 0, label: 'hut' };
  }
  ringCells(tr) {
    const cells = new Map();
    for (let dz = -RING_R - 1; dz <= RING_R + 1; dz++) for (let dx = -RING_R - 1; dx <= RING_R + 1; dx++) { const d = Math.hypot(dx, dz); if (d >= RING_R - 0.5 && d < RING_R + 0.5) cells.set((tr.z + dz) * W + tr.x + dx, [tr.x + dx, tr.z + dz]); }
    for (const [k, [x, z]] of [...cells]) for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const dk = (z + ez) * W + x + ex; if (cells.has(dk) && !cells.has(z * W + x + ex) && !cells.has((z + ez) * W + x)) cells.set(z * W + x + ex, [x + ex, z]); }
    const out = [...cells.values()].map(([x, z]) => ({ x, z, a: Math.atan2(z + 0.5 - tr.cz, x + 0.5 - tr.cx), gate: false }));
    const gateAngs = [-Math.PI / 2 + tr.id * 0.7, Math.PI / 2 + tr.id * 0.7].map(a => Math.atan2(Math.sin(a), Math.cos(a)));
    for (const c of out) for (const ga of gateAngs) { let d = Math.abs(c.a - ga); d = Math.min(d, 6.283 - d); if (d < 1.3 / RING_R) c.gate = ga; }
    const start = this.rnd(-3, 3); out.sort((p, q) => ((p.a - start + 12.566) % 6.283) - ((q.a - start + 12.566) % 6.283));
    return out;
  }
  wallJob(tr, level) {
    const w = this.w, blocks = [];
    for (const c of tr.wall.cells) { const g = w.ground[c.z * W + c.x];
      if (c.gate) { if (level === 1) { blocks.push({ x: c.x, y: g, z: c.z, b: B.GATE, cost: 'wood', gate: true }); blocks.push({ x: c.x, y: g + 1, z: c.z, b: B.GATE, cost: 'wood' }); } else blocks.push({ x: c.x, y: g + 2, z: c.z, b: B.COBBLE, cost: 'stone' }); continue; }
      if (level === 1) { blocks.push({ x: c.x, y: g, z: c.z, b: B.LOG, cost: 'wood' }); blocks.push({ x: c.x, y: g + 1, z: c.z, b: B.LOG, cost: 'wood' }); }
      else blocks.push({ x: c.x, y: g + 2, z: c.z, b: B.COBBLE, cost: 'stone' });
    }
    if (level === 2) for (const c of tr.wall.cells) if (c.gate) { const g = w.ground[c.z * W + c.x]; const ix = Math.round(c.x + (tr.cx - c.x) / RING_R * 1.5), iz = Math.round(c.z + (tr.cz - c.z) / RING_R * 1.5); blocks.push({ x: ix, y: w.ground[iz * W + ix], z: iz, b: B.TORCH, cost: 'wood', soft: true }); }
    return { type: level === 1 ? 'wall' : 'fort', blocks, idx: 0, label: level === 1 ? 'palisade' : 'stone fortification' };
  }
  planTribe(tr) {
    const m = this.members(tr), n = m.length; if (!n) { if (tr.alive) { tr.alive = false; this.log(`The ${tr.name} tribe has perished. Its huts stand empty.`, 'death'); } return; }
    if (tr.jobs.length > 1) return;
    const has = t => tr.jobs.some(j => j.type === t);
    // repair breaches first
    if (tr.wall && tr.wall.done) {
      const miss = []; for (const c of tr.wall.cells) { const g = this.w.ground[c.z * W + c.x]; for (let y = 0; y < 2; y++) if (this.w.get(c.x, g + y, c.z) === 0) miss.push({ x: c.x, y: g + y, z: c.z, b: c.gate ? B.GATE : B.LOG, cost: 'wood' }); }
      if (miss.length && !has('repair')) { tr.jobs.unshift({ type: 'repair', blocks: miss, idx: 0, label: 'wall repair' }); return; }
      if (!miss.length && tr.wall.breached) { tr.wall.breached = false; this.log(`${tr.name} patched the breach in its wall.`, 'build'); }
    }
    const huts = tr.huts.length + tr.jobs.filter(j => j.type === 'hut').length;
    const farms = tr.farms.length + (has('farm') ? 1 : 0);
    if (huts < 1) { tr.jobs.push(this.hutBlueprint(tr, tr.huts.length + (has('hut') ? 1 : 0))); return; }
    if (huts < Math.min(HUT_SLOTS, Math.ceil((n + 1) / 3)) && (huts < 2 || tr.huts.reduce((a, h) => a + this.hutCap(h), 0) < n + 1) && !has('hut')) { tr.jobs.push(this.hutBlueprint(tr, this.freeSlot(tr))); return; }
    if (farms < 2 && !has('farm')) { tr.jobs.push(this.farmJob(tr)); return; }
    if (!tr.wall && this.day >= 2 && tr.huts.length >= 2) { tr.wall = { cells: this.ringCells(tr), done: false, level: 0, breached: false }; tr.jobs.push(this.wallJob(tr, 1)); this.log(`${tr.name} began raising a palisade around its village square.`, 'build'); return; }
    if (huts < Math.min(HUT_SLOTS, Math.ceil(n / 3)) && !has('hut')) { tr.jobs.push(this.hutBlueprint(tr, this.freeSlot(tr))); return; }
    if (farms < Math.min(6, Math.ceil(n / 3)) && !has('farm')) { tr.jobs.push(this.farmJob(tr)); return; }
    if (tr.wall && tr.wall.done && tr.wall.level === 1 && this.day >= 4 && !has('fort')) { tr.jobs.push(this.wallJob(tr, 2)); this.log(`${tr.name} started fortifying its palisade with stone.`, 'build'); return; }
    const up = tr.huts.find(h => h.level === 1); if (up && tr.wall && tr.wall.done && tr.stock.stone > 6 && !has('upgrade')) { tr.jobs.push(this.upgradeJob(tr, up)); return; }
  }
  freeSlot(tr) { const used = new Set([...tr.huts.map(h => h.slot), ...tr.jobs.filter(j => j.type === 'hut').map(j => j.hut.slot)]); for (let i = 0; i < HUT_SLOTS; i++) { const s = (i * 3) % HUT_SLOTS; if (!used.has(s)) return s; } return 0; }
  farmJob(tr) {
    const w = this.w; const blocks = [];
    for (let t = 0; t < 40 && blocks.length < 4; t++) {
      const a = this.rnd(6.28), d = this.rnd(7.5, 9); const x = Math.round(tr.x + Math.cos(a) * d), z = Math.round(tr.z + Math.sin(a) * d);
      if (tr.huts.some(h => Math.abs(h.x - x) < 3 && Math.abs(h.z - z) < 3) || tr.jobs.some(j => j.hut && Math.abs(j.hut.x - x) < 3 && Math.abs(j.hut.z - z) < 3)) continue;
      if (tr.farms.some(f => Math.abs(f.x - x) < 2 && Math.abs(f.z - z) < 2)) continue;
      const g = w.ground[z * W + x]; if (w.stack[z * W + x] || w.water[z * W + x]) continue;
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) blocks.push({ x: x + dx, y: g - 1, z: z + dz, b: B.FARM, cost: null, farm: true });
    }
    return { type: 'farm', blocks, idx: 0, label: 'crop field' };
  }
  upgradeJob(tr, hut) {
    const blocks = []; const w = this.w;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let y = 0; y < 6; y++) { const gy = w.ground[(hut.z + dz) * W + hut.x + dx] + y; if (w.get(hut.x + dx, gy, hut.z + dz) === B.PLANK) blocks.push({ x: hut.x + dx, y: gy, z: hut.z + dz, b: B.COBBLE, cost: 'stone' }); }
    const tx = hut.x + hut.doorDir[0] * 2 + hut.doorDir[1], tz = hut.z + hut.doorDir[1] * 2 + hut.doorDir[0];
    blocks.push({ x: tx, y: w.ground[tz * W + tx], z: tz, b: B.TORCH, cost: 'wood', soft: true });
    return { type: 'upgrade', hut, blocks, idx: 0, label: 'hut upgrade' };
  }
  placeJobBlock(tr, job, e) {
    const bl = job.blocks[job.idx]; let cost = bl.cost;
    if (cost === 'reed|wood') cost = tr.stock.reed > 0 ? 'reed' : 'wood';
    if (cost && tr.stock[cost] < 1) return cost;
    if (cost) tr.stock[cost]--;
    const w = this.w;
    if (bl.soft && w.stack[bl.z * W + bl.x] > 0) { } else w.set(bl.x, bl.y, bl.z, bl.b);
    if (bl.gate) w.gates.set(bl.z * W + bl.x, { tribe: tr.id, open: 0, x: bl.x, z: bl.z });
    if (bl.farm) { const f = tr.farms.find(f => Math.abs(f.x - bl.x) <= 1 && Math.abs(f.z - bl.z) <= 1 && f.cells.length < 4); if (f) f.cells.push([bl.x, bl.z]); else tr.farms.push({ x: bl.x, z: bl.z, cells: [[bl.x, bl.z]], stage: -1, timer: 0 }); }
    if (job.type === 'wall' || job.type === 'repair' || job.type === 'fort') this.stats.wallBlocks++;
    job.idx++;
    if (job.idx >= job.blocks.length) this.finishJob(tr, job, e);
    return null;
  }
  finishJob(tr, job, e) {
    tr.jobs.splice(tr.jobs.indexOf(job), 1);
    if (job.type === 'hut') { job.hut.level = 1; tr.huts.push(job.hut); this.stats.huts++; this.log(`${e.name} finished a new hut in ${tr.name} (${tr.huts.length} huts).`, 'build'); this.assignHomes(tr); }
    if (job.type === 'wall') { tr.wall.done = true; tr.wall.level = 1; this.log(`${tr.name} closed its palisade ring! The square is safe at night — while the gates hold.`, 'build'); }
    if (job.type === 'fort') { tr.wall.level = 2; this.log(`${tr.name} crowned its walls with stone and lit torches at the gates.`, 'build'); }
    if (job.type === 'upgrade') { job.hut.level = 2; this.log(`${e.name} rebuilt a ${tr.name} hut in stone.`, 'build'); }
    if (job.type === 'farm') this.log(`${e.name} tilled a new crop field for ${tr.name}.`, 'build');
  }
  hutCap(h) { return h.level >= 2 ? 4 : 3; }
  assignHomes(tr) { const m = this.members(tr); tr.huts.forEach(h => h.owners = []); let hi = 0;
    for (const e of m) { while (hi < tr.huts.length && tr.huts[hi].owners.length >= this.hutCap(tr.huts[hi])) hi++; const h = tr.huts[hi]; if (!h) { e.home = null; continue; } h.owners.push(e.id); e.home = h; }
    for (const h of tr.huts) for (const id of [...h.occ]) { const o = this.byId.get(id); if (!o || !o.alive || o.tribe !== tr.id) { h.occ.delete(id); if (o) this.leaveHut(o); } } }
  enterHut(e, h) { h.occ.add(e.id); e.inHut = h; e.x = h.door.x; e.z = h.door.z; e.path = null; e.act = { type: 'inHut', h }; }
  leaveHut(e, flee) { const h = e.inHut; if (!h) return; h.occ.delete(e.id); e.inHut = null; e.x = h.door.x + (this.r() - .5); e.z = h.door.z + (this.r() - .5); e.px = e.x; e.pz = e.z; e.act = flee ? { type: 'flee', x: e.x + this.rnd(-10, 10), z: e.z + this.rnd(-10, 10), t: 30 } : null; }
  // ---------- main tick ----------
  step() {
    const prevT = this.tod; this.tick++; const t = this.tod;
    for (const e of this.ents) { e.px = e.x; e.pz = e.z; }
    const cross = th => prevT < th && t >= th;
    if (cross(0.665)) this.retreat();
    if (cross(0.72)) this.dusk();
    if (cross(0.79)) this.nightfall();
    if (cross(0.24)) this.dawn();
    for (const g of this.w.gates.values()) if (g.open > 0) g.open--;
    if (this.tick % 60 === 0) for (const tr of this.tribes) if (tr.alive) this.planTribe(tr);
    if (this.tick % 20 === 0) this.updateNodesAndFarms();
    if (this.tick % 10 === 0) this.vampPlan();
    for (const e of this.ents) { if (!e.alive) continue; if (e.pathCool > 0) e.pathCool--; if (e.kind === 't') this.updateT(e); else if (e.kind === 'p') this.updateP(e); else if (e.kind === 'm') this.updateM(e); else this.updateV(e); e.y = this.standY(e.x | 0, e.z | 0); }
    // soft separation so crowds don't stack on one spot
    if (this.tick % 2 === 0) { const grid = new Map(); for (const e of this.ents) { if (!e.alive || e.kind !== 't') continue; const k = ((e.z | 0) >> 1) * 256 + ((e.x | 0) >> 1); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(e); }
      for (const a of grid.values()) for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { const p = a[i], q = a[j], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.55) { const ux = d > 0.001 ? dx / d : 1, uz = d > 0.001 ? dz / d : 0, push = (0.55 - d) * 0.5;
          for (const [e, sg] of [[q, 1], [p, -1]]) { const nx = e.x + ux * push * sg, nz = e.z + uz * push * sg; if (((nx | 0) === (e.x | 0) && (nz | 0) === (e.z | 0)) || this.passable(e, e.x | 0, e.z | 0, nx | 0, nz | 0)) { e.x = nx; e.z = nz; } } } } }
    if (this.tick % 100 === 0) { this.ents = this.ents.filter(e => e.alive || this.tick - e.died < 300); }
  }
  updateNodesAndFarms() {
    for (const n of this.w.nodes) if (n.amt <= 0 && !n.dead && n.timer > 0) { n.timer -= 20; if (n.timer <= 0) this.regrowNode(n); }
    const day = !this.isNight();
    for (const tr of this.tribes) for (const f of tr.farms) if (f.stage >= 0 && f.stage < 3 && day) { f.timer += 20; if (f.timer > 260) { f.timer = 0; f.stage++; this.setCrop(f); } }
  }
  setCrop(f) { for (const [x, z] of f.cells) { const g = this.w.ground[z * W + x]; this.w.set(x, g, z, f.stage < 0 ? 0 : B.CROP0 + f.stage); } }
  dusk() {
    for (const tr of this.tribes) {
      if (!tr.alive || this.day < 2) continue; const m = this.members(tr); if (m.length < 4) continue;
      let worst = null, wr = 1e9; for (const e of m) { const r = this.rep(e); if (r < wr) { wr = r; worst = e; } }
      if (worst && wr < -30) {
        const why = Object.entries(worst.bad).sort((a, b) => b[1] - a[1])[0];
        const reason = { hoard: 'hoarding food', abandon: 'abandoning tribemates to the dark', attack: 'attacking a tribe member' }[why[0]] || 'bad faith';
        tr.members.delete(worst.id); worst.exTribe = tr.id; worst.tribe = null; worst.exile = true; worst.banishing = true; worst.home = null; worst.exiledDay = this.day; worst.exReason = why[0]; worst.exRep = wr; worst.asked = new Set([tr.id]); worst.refusedAll = false; this.leaveHut(worst); worst.act = null;
        this.stats.excoms++; this.assignHomes(tr);
        this.log(`The ${tr.name} tribe voted to cast out ${worst.name} for ${reason} (reputation ${wr.toFixed(0)}). ${worst.name} is driven past the gate as night falls.`, 'exile');
      }
    }
  }
  retreat() {
    for (const tr of this.tribes) { if (!tr.alive) continue; const m = this.members(tr); if (!m.length) continue; let strag = [];
      for (const e of m) { if (e.inHut || e.banishing) continue; const busy = e.act && (e.act.type === 'harvest' || e.act.type === 'build');
        if (busy && (e.traits.bravery > 0.72 || e.traits.greed > 0.82) && this.r() < 0.35) { strag.push(e); continue; }
        if (!e.act || !['eat', 'eatStock', 'fight', 'flee', 'goHut'].includes(e.act.type)) e.act = null; }
      const cap = tr.huts.reduce((s, h) => s + this.hutCap(h), 0);
      this.log(`As the light failed, ${tr.name} called its people home${tr.huts.length ? ` — ${Math.min(cap, m.length)} beds in ${tr.huts.length} hut${tr.huts.length > 1 ? 's' : ''}` : ''}${tr.wall && tr.wall.done ? ' and the gates were barred' : ''}.${strag.length ? ` ${strag[0].name} stayed out to finish ${strag[0].act.type === 'build' ? 'building' : 'a harvest'}.` : ''}`, 'tribe'); }
  }
  shelterCount() { let inHut = 0, inWalls = 0, hidden = 0, out = 0; for (const e of this.thronglets()) { if (e.tribe == null) continue; if (e.inHut) inHut++; else if (this.safeAt(e.x, e.z)) inWalls++; else if (e.hidden) hidden++; else out++; } return { inHut, inWalls, hidden, out }; }
  nightfall() {
    const vs = this.vamps(); const want = Math.max(1, Math.round(Math.min(VAMP_CAP, 1 + Math.floor((this.day - 1) / 2) + Math.floor(this.day / 6)) * this.ease()));
    const arrivals = Math.min(this.day >= 10 ? 2 : 1, want - vs.length, VAMP_CAP - vs.length);
    for (let k = 0; k < arrivals; k++) { const m = this.w.mansion; const v = this.spawnVampire(m.x + this.rnd(-2, 2), m.z + this.rnd(-2, 2));
      this.log(v.name === 'Stefan' ? `The red door of 83 Kingsway creaks open. Stefan, the vampire, wakes hungry.` : `${v.name} arrives at 83 Kingsway to hunt beside Stefan.`, 'vamp'); }
    this.huntLogged.clear(); { const c = this.shelterCount(); (this.nightStats = this.nightStats || []).push({ day: this.day, ...c, kills0: this.stats.kills, deaths0: this.stats.deaths }); }
    this.storm = this.day >= 2 && this.r() < 0.4; if (this.storm) { this.stats.storms = (this.stats.storms || 0) + 1; this.log(`A storm breaks over 83 Kingsway. Rain hammers the island and masks every whimper — hiding will be easier tonight.`, 'hide'); }
  }
  dawn() {
    for (const e of this.thronglets()) { e.lockedOut = false; e.ateEve = false; }
    if (this.vamps().some(v => v.name === 'Stefan' && v.alive)) this.log(`At dawn, Stefan retreated to 83 Kingsway${this.storm ? ' as the storm blew itself out' : ''}.`, 'vamp'); this.storm = false;
    for (const tr of this.tribes) {
      if (!tr.alive) continue; const m = this.members(tr); if (!m.length) continue;
      let chief = null, cs = -1e9; for (const e of m) { const s = this.rep(e) + e.traits.bravery * 10 + Math.min(10, (this.tick - e.born) / DAY * 2); if (s > cs) { cs = s; chief = e; } }
      if (chief && chief.id !== tr.chief) { tr.chief = chief.id; this.log(`${chief.name} is now the most respected voice in ${tr.name}.`, 'tribe'); }
      let births = 0; const pop = this.thronglets().length;
      while (births < 2 && tr.stock.food >= m.length * 2 + 6 && m.length + births < tr.huts.reduce((a, h) => a + this.hutCap(h), 0) && pop + births < 160) {
        const a = m[this.rnd(m.length) | 0], b = m.length > 1 ? m.filter(o => o !== a)[this.rnd(m.length - 1) | 0] : a; const mut = k => Math.max(0, Math.min(1, (a.traits[k] + b.traits[k]) / 2 + (this.r() - 0.5) * 0.3));
        const c = this.spawnThronglet(tr.cx + this.rnd(-2, 2), tr.cz + this.rnd(-2, 2), { greed: mut('greed'), loyalty: mut('loyalty'), bravery: mut('bravery'), social: mut('social') });
        this.join(c, tr); tr.stock.food -= 6; births++; this.stats.births++; this.assignHomes(tr);
        this.log(`A new Thronglet, ${c.name}, was born in ${tr.name} (child of ${a.name} & ${b.name}).`, 'birth');
      }
    }
  }
  // ---------- Thronglet AI ----------
  invFood(e) { return e.inv.berry + e.inv.nut + e.inv.crop; }
  invMat(e) { return e.inv.wood + e.inv.stone + e.inv.reed; }
  takeFood(e) { for (const k of FOOD) if (e.inv[k] > 0) { e.inv[k]--; return true; } return false; }
  nearestVamp(e, rad) { let best = null, bd = rad; for (const v of this.ents) { if (v.kind !== 'v' || !v.alive || /^resting/.test(v.state) || v.batHome) continue; const d = dist(v.x, v.z, e.x, e.z); if (d < bd) { bd = d; best = v; } } return best; }
  allies(e, rad) { let n = 0; if (e.tribe == null) return 0; for (const o of this.ents) if (o !== e && o.alive && o.kind === 't' && o.tribe === e.tribe && dist(o.x, o.z, e.x, e.z) < rad) n++; return n; }
  die(e, cause, killer) {
    if (e.kind === 'v' && e.name === 'Stefan') { e.hp = Math.max(e.hp, 1); return; } // Stefan is immortal
    if (e.hidden) this.leaveSpot(e); if (e.inHut) { e.inHut.occ.delete(e.id); e.inHut = null; }
    e.alive = false; e.died = this.tick; this.stats.deaths++;
    if (e.tribe != null) { const tr = this.tribes[e.tribe]; tr.members.delete(e.id); this.assignHomes(tr); }
    if (e.kind === 't') { this.dropAll(e); }
    if (killer) { killer.kills++; this.stats.kills++; if (killer.kind === 'v') { const k = this.nightKey(); if (!this.nightKills || this.nightKills.k !== k) this.nightKills = { k, n: 0 }; this.nightKills.n++; } if (e.spottedAt && this.tick - e.spottedAt < 900) { this.pstats.spotKills++; } }
    this.log(cause, 'death');
  }
  dropAll(e) { }
  updateT(e) {
    e.hunger += 0.026 * (e.exile ? 1.2 : 1) * (e.inHut || e.state === 'sleep' ? 0.5 : 1); e.energy -= this.isNight() ? 0.02 : 0.03; e.fear = Math.max(0, e.fear - 0.3);
    if (e.hunger >= 100) { e.hunger = 100; e.hp -= 0.06; if (e.hp <= 0) return this.die(e, `${e.name} starved to death${e.exile ? ', alone in the forest' : ''}.`); }
    if (e.hp < 100 && e.hunger < 60) e.hp = Math.min(100, e.hp + 0.02);
    if (e.cool > 0) e.cool--;
    // threat check (staggered)
    if (e.hidden && (this.tick + e.id) % 4 === 0) { const v = this.nearestVamp(e, 9); if (v) e.fear = Math.min(100, e.fear + 3 + 8 * (1 - e.hidden.conceal) + (e.traits.bravery < 0.3 ? 4 : 0)); }
    if ((this.tick + e.id) % 4 === 0 && !e.banishing && !e.bcu && !e.hidden && !e.inHut) {
      const v = this.nearestVamp(e, 9);
      if (v) {
        e.fear = Math.min(100, e.fear + 15);
        const al = this.allies(e, 6);
        if (false) { /* v0.10: Thronglets are prey — they never fight vampires, only flee or hide */ }
        else if (!e.act || e.act.type !== 'flee') {
          // abandoning a tribemate who is being attacked?
          if (e.tribe != null) for (const o of this.ents) if (o.kind === 't' && o.alive && o !== e && o.tribe === e.tribe && o.attackedBy && this.tick - o.attackedAt < 20 && dist(o.x, o.z, e.x, e.z) < 7 && e.traits.bravery < 0.45) {
            e.bad.abandon++; this.stats.abandons++; this.opAdd(o, e.id, -30); this.witness(e, 'abandon', -10, 10, o);
            if (!this.huntLogged.has('ab' + e.id)) { this.huntLogged.add('ab' + e.id); this.log(`${e.name} fled and left ${o.name} to ${o.attackedBy}.`, 'social'); } break; }
          if (e.home && !e.lockedOut && e.tribe != null && (this.isNight() || this.tod > 0.6)) { if (!e.act || e.act.type !== 'goHut') e.act = { type: 'goHut', h: e.home, run: true }; } else {
          const home = this.homePoint(e); const safeHome = home && this.safeAt(home.x, home.z);
          let fx, fz; if (safeHome && dist(home.x, home.z, e.x, e.z) > 2) { fx = home.x; fz = home.z; } else { const a = Math.atan2(e.z - v.z, e.x - v.x); fx = e.x + Math.cos(a) * 12; fz = e.z + Math.sin(a) * 12; }
          e.act = { type: 'flee', x: fx, z: fz, t: 25 };
          }
        }
      }
    }
    if (!e.act) this.decide(e);
    if (e.act) this.exec(e);
  }
  homePoint(e) { if (e.tribe == null) return null; const tr = this.tribes[e.tribe]; if (e.home) return e.home.inside; return { x: tr.cx + ((e.id * 7) % 5) - 2, z: tr.cz + ((e.id * 3) % 5) - 2 }; }
  decide(e) {
    const tr = e.tribe != null ? this.tribes[e.tribe] : null, t = this.tod, night = this.isNight();
    if (e.banishing) { const ex = this.tribes[e.exTribe]; const a = Math.atan2(e.z - ex.cz, e.x - ex.cx) || this.rnd(6); e.act = { type: 'banish', x: ex.cx + Math.cos(a) * (RING_R + 6), z: ex.cz + Math.sin(a) * (RING_R + 6) }; return; }
    if (e.hunger > 55) {
      if (this.invFood(e) > 0) { e.act = { type: 'eat', t: 8 }; return; }
      if (tr && tr.stock.food > 0) { e.act = { type: 'eatStock' }; return; }
      // hungry and greedy with weak loyalty: rob a tribemate
      if (tr && e.hunger > 80 && e.traits.greed > 0.7 && e.traits.loyalty < 0.45) { const v = this.members(tr).find(o => o !== e && this.invFood(o) > 0 && dist(o.x, o.z, e.x, e.z) < 25); if (v) { e.act = { type: 'steal', o: v }; return; } }
    }
    if (!tr) return this.decideLoner(e);
    if (night || t >= 0.655) {
      if (e.hunger > 30 && tr.stock.food > 0 && !e.ateEve && dist(e.x, e.z, tr.cx, tr.cz) < 22) { e.ateEve = true; e.act = { type: 'eatStock' }; return; }
      if (e.home && !e.lockedOut) { e.act = { type: 'goHut', h: e.home }; return; }
      if (!this.safeAt(tr.cx, tr.cz) && night) { const sp = this.pickSpot(e, 30); if (sp) { e.act = { type: 'seekSpot', sp }; return; } }
      const h = this.homePoint(e); if (night && dist(h.x, h.z, e.x, e.z) > 35) { const sp = this.pickSpot(e, 25); if (sp) { e.act = { type: 'seekSpot', sp }; return; } } e.act = { type: 'home', x: h.x, z: h.z }; return; }
    if (e.energy < 15) { const h = this.homePoint(e); e.act = { type: 'home', x: h.x, z: h.z, nap: true }; return; }
    // share with the hungry
    if (this.invFood(e) >= 1 && e.traits.greed < 0.5) { const o = this.members(tr).find(o => o !== e && o.hunger > 50 && this.invFood(o) === 0 && dist(o.x, o.z, e.x, e.z) < 20); if (o) { e.act = { type: 'share', o }; return; } }
    if (this.invFood(e) + this.invMat(e) >= 6) { e.act = { type: 'deposit' }; return; }
    const n = tr.members.size, opts = [];
    const job = tr.jobs[0];
    const foodNeed = tr.stock.food < n * 3 ? 60 : tr.stock.food < n * 6 ? 30 : 8;
    opts.push(['forage', foodNeed + this.rnd(15)]);
    const ripe = tr.farms.find(f => f.stage === 3 || f.stage === -1);
    if (ripe) opts.push(['farm', 45 + this.rnd(15), ripe]);
    if (job) {
      let need = job.blocks[job.idx].cost; if (need === 'reed|wood') need = tr.stock.reed > 0 ? 'reed' : 'wood';
      if (!need || tr.stock[need] >= 1) opts.push(['build', 55 + this.rnd(20), job]); else opts.push(['gather', 50 + this.rnd(20), need]);
      if (need === 'wood' && tr.stock.wood < 3) opts.push(['gather', 45, 'wood']);
    }
    if (tr.stock.stone < 8 && this.day >= 2) opts.push(['gather', 25 + this.rnd(10), 'stone']);
    if (tr.stock.reed < 4) opts.push(['gather', 18 + this.rnd(10), 'reed']);
    opts.push(['social', 10 + e.traits.social * 25 * this.rnd(1)]);
    opts.sort((a, b) => b[1] - a[1]); const [type, , arg] = opts[0];
    if (type === 'forage') { const nd = this.nearestNode(e, ['berry', 'nut']); if (nd) { nd.claim = e.id; e.act = { type: 'harvest', n: nd, kind: nd.type }; } else e.act = { type: 'wander', x: e.x + this.rnd(-20, 20), z: e.z + this.rnd(-20, 20), t: 60 }; }
    else if (type === 'gather') { const nd = this.nearestNode(e, [arg === 'wood' ? 'wood' : arg], 120) || (arg === 'wood' ? this.nearestNode(e, ['nut'], 120) : null); if (nd) { nd.claim = e.id; e.act = { type: 'harvest', n: nd, kind: arg }; } else e.act = { type: 'wander', x: e.x + this.rnd(-25, 25), z: e.z + this.rnd(-25, 25), t: 60 }; }
    else if (type === 'build') e.act = { type: 'build', job: arg };
    else if (type === 'farm') e.act = { type: 'farm', f: arg };
    else { const m = this.members(tr).filter(o => o !== e); const o = m[this.rnd(m.length) | 0]; if (o) e.act = { type: 'social', o, t: 30 }; else e.act = { type: 'wander', x: tr.cx + this.rnd(-6, 6), z: tr.cz + this.rnd(-6, 6), t: 40 }; }
  }
  decideLoner(e) {
    const night = this.isNight();
    // exiles must find a new tribe that will take them in; ask one at a time, by day
    if (e.exile && !e.refusedAll) {
      const left = this.tribes.filter(t => t.alive && t.members.size && !e.asked.has(t.id)).sort((a, b) => dist(a.cx, a.cz, e.x, e.z) - dist(b.cx, b.cz, e.x, e.z));
      if (!left.length) { e.refusedAll = true; this.stats.trueOutcasts = (this.stats.trueOutcasts || 0) + 1; this.log(`Every tribe has turned ${e.name} away. ${e.name} is a true outcast now and must hide in the wilds each night.`, 'exile'); }
      else if (!night && this.tod < 0.62) { e.act = { type: 'petition', tr: left[0] }; return; }
    }
    // join an existing tribe if a wanderer (not an exile) and near one by day
    if (!e.exile && !night) { const tr = this.tribes.filter(t => t.alive).sort((a, b) => dist(a.cx, a.cz, e.x, e.z) - dist(b.cx, b.cz, e.x, e.z))[0]; if (tr && dist(tr.cx, tr.cz, e.x, e.z) < 60) { this.join(e, tr); this.assignHomes(tr); this.log(`The wanderer ${e.name} was welcomed into ${tr.name}.`, 'tribe'); return; } }
    if (!night) this.learnSpots(e);
    if (!night && (!e.exile || (e.refusedAll && this.day - (e.exiledDay || 0) >= 2 && this.r() < 0.02))) {
      const mates = this.ents.filter(o => o !== e && o.alive && o.kind === 't' && o.tribe == null && dist(o.x, o.z, e.x, e.z) < 14);
      if (mates.length || (e.traits.bravery > 0.45 && this.day - (e.exiledDay || 0) >= 1)) {
        const site = this.findSite(e, 50);
        if (site) { const tr = this.foundTribe(site.x, site.z, true); this.join(e, tr); for (const o of mates) this.join(o, tr); e.op.clear(); this.assignHomes(tr);
          this.log(mates.length ? `${e.name} and ${mates.map(o => o.name).join(', ')} founded ${tr.name}, a tribe of outcasts.` : `Exiled ${e.name} survived the night and founded a new tribe: ${tr.name}.`, 'tribe'); return; }
      }
    }
    if (e.hunger > 40 || this.invFood(e) < 3) { const nd = this.nearestNode(e, ['berry', 'nut']); if (nd) { e.act = { type: 'harvest', n: nd, kind: nd.type, loner: true }; return; } }
    if (night || this.tod > 0.72) { const sp = this.pickSpot(e, 80); if (sp) { e.act = { type: 'seekSpot', sp }; return; } e.act = { type: 'hide', t: 60 }; return; }
    e.act = { type: 'wander', x: e.x + this.rnd(-25, 25), z: e.z + this.rnd(-25, 25), t: 80 };
  }
  exec(e) {
    const a = e.act, sp = 0.2 * (e.hp < 40 ? 0.7 : 1), tr = e.tribe != null ? this.tribes[e.tribe] : null;
    e.state = a.type;
    switch (a.type) {
      case 'flee': if (this.moveTo(e, a.x, a.z, 0.3) || --a.t <= 0) e.act = null; break;
      case 'listen': e.dir = Math.atan2(a.p.x - e.x, a.p.z - e.z); if (--a.t <= -5 || !a.p.alive) e.act = null; break;
      case 'bcu': this.bcuWalk(e); break;
      case 'banish': if (this.moveTo(e, a.x, a.z, 0.24, 1.2) || (e.stuckT = (e.stuckT || 0) + 1) > 400) { e.banishing = false; e.stuckT = 0; e.act = null; } break;
      case 'eat': if (--a.t <= 0) { if (this.takeFood(e)) { e.hunger = Math.max(0, e.hunger - 40); } e.act = null; } break;
      case 'eatStock': if (!tr) { e.act = null; break; } if (this.moveTo(e, tr.cx, tr.cz + 1, sp, 1.6) || dist(e.x, e.z, tr.cx, tr.cz + 1) < 3.2 || (a.t = (a.t || 0) + 1) > 120) { while (tr.stock.food > 0 && e.hunger > 25) { tr.stock.food--; e.hunger = Math.max(0, e.hunger - 40); } e.act = null; } break;
      case 'harvest': {
        const n = a.n; if (n.amt <= 0 || n.dead) { e.act = null; break; }
        if (this.moveTo(e, n.x + 0.5, n.z + 0.5, sp, 1.4)) {
          if (e.cool > 0) break; e.cool = 3;
          const k = a.kind === 'wood' ? 'wood' : n.type === 'nut' && a.kind === 'nut' ? 'nut' : n.type; n.amt--; e.inv[k === 'nut' || k === 'berry' || k === 'wood' || k === 'stone' || k === 'reed' ? k : 'berry']++;
          if (n.amt <= 0) { if (n.type === 'nut' && a.kind !== 'wood') { n.timer = 900; } else this.depleteNode(n); }
          const carry = this.invFood(e) + this.invMat(e);
          if (n.amt <= 0 || carry >= 10) { e.act = null; if (a.loner && e.hunger > 40) e.act = { type: 'eat', t: 6 }; }
        }
        break; }
      case 'deposit': {
        if (!tr) { e.act = null; break; }
        if (this.moveTo(e, tr.cx + 0.5, tr.cz + 0.5, sp, 1.8)) {
          const food = this.invFood(e), n = tr.members.size;
          for (const k of ['wood', 'stone', 'reed']) { tr.stock[k] += e.inv[k]; e.inv[k] = 0; }
          if (food >= 3 && tr.stock.food < n * 4 && e.traits.greed > 0.6 && this.r() < e.traits.greed * 0.95) {
            const keep = food, kind = e.inv.berry >= e.inv.nut ? 'berries' : 'nuts'; e.hoard = (e.hoard || 0) + keep;
            e.bad.hoard++; this.stats.hoards++; const seen = this.witness(e, 'hoard', -14, 14);
            if (seen.length && e.hoard >= 4 && e.hoardLogDay !== this.day && (e.hoardLogDay = this.day)) this.log(`${e.name} hoarded ${e.hoard} ${kind} while ${tr.name}'s stores ran low; ${seen.slice(0, 2).map(o => o.name).join(' and ')} saw it.`, 'social');
            e.inv.berry = Math.min(e.inv.berry, 6); e.inv.nut = Math.min(e.inv.nut, 6);
          } else { tr.stock.food += food; e.inv.berry = e.inv.nut = e.inv.crop = 0; if (food >= 3) this.witness(e, 'gave', +1.5, 8); e.hoard = 0; }
          e.act = null;
        }
        break; }
      case 'build': {
        const job = a.job; if (!tr || !tr.jobs.includes(job) || job.idx >= job.blocks.length) { e.act = null; break; }
        const bl = job.blocks[job.idx];
        if (this.moveTo(e, bl.x + 0.5, bl.z + 0.5, sp, 2.2)) { if (e.cool > 0) break; e.cool = 2; const miss = this.placeJobBlock(tr, job, e); if (miss) e.act = null; }
        break; }
      case 'farm': {
        const f = a.f; if (!tr) { e.act = null; break; }
        if (this.moveTo(e, f.x + 1, f.z + 1, sp, 1.8)) {
          if (f.stage === -1) { f.stage = 0; f.timer = 0; this.setCrop(f); }
          else if (f.stage === 3) { f.stage = -1; this.setCrop(f); e.inv.crop += 6; this.witness(e, 'harvest', +1, 8); }
          e.act = { type: 'deposit' };
        }
        break; }
      case 'share': {
        const o = a.o; if (!o.alive || this.invFood(e) === 0) { e.act = null; break; }
        if (this.moveTo(e, o.x, o.z, sp, 1.4)) { let g = 0; while (this.invFood(e) > 0 && g < 3) { this.takeFood(e); o.inv.berry++; g++; }
          this.opAdd(o, e.id, 22); this.witness(e, 'share', +7, 12); this.stats.shares++;
          if (this.r() < 0.35) this.log(`${e.name} shared food with a starving ${o.name}.`, 'good'); e.act = null; }
        break; }
      case 'steal': {
        const o = a.o; if (!o.alive || this.invFood(o) === 0) { e.act = null; break; }
        if (this.moveTo(e, o.x, o.z, sp * 1.2, 1.2)) { let g = 0; while (this.invFood(o) > 0 && g < 4) { this.takeFood(o); e.inv.berry++; g++; }
          o.hp -= 15; e.bad.attack++; this.stats.thefts++; this.opAdd(o, e.id, -60); const seen = this.witness(e, 'attack', -26, 12, o);
          this.log(`${e.name} struck ${o.name} and took ${g} food${seen.length > 1 ? `; ${seen.filter(s => s !== o).slice(0, 2).map(s => s.name).join(' and ')} witnessed it` : ''}.`, 'social');
          if (o.hp <= 0) this.die(o, `${o.name} died from ${e.name}'s blows.`);
          e.act = { type: 'eat', t: 6 }; }
        break; }
      case 'social': {
        const o = a.o; if (!o.alive) { e.act = null; break; }
        if (this.moveTo(e, o.x, o.z, sp, 1.6)) { if (--a.t <= 0) {
          this.opAdd(e, o.id, 2); this.opAdd(o, e.id, 2);
          // gossip: pass on a strong opinion of a third party, weighted by trust
          let bestId = null, bv = 0; for (const [id, v] of e.op) if (id !== o.id && Math.abs(v) > Math.abs(bv)) { bv = v; bestId = id; }
          if (bestId != null) { const trust = ((o.op.get(e.id) || 0) + 100) / 200; const cur = o.op.get(bestId) || 0; this.opAdd(o, bestId, (bv - cur) * 0.3 * trust);
            const tgt = this.byId.get(bestId); if (tgt && bv < -40 && this.r() < 0.12) this.log(`${e.name} whispered to ${o.name} about ${tgt.name}'s ${tgt.bad.hoard >= tgt.bad.attack ? 'hoarding' : 'violence'}.`, 'social'); }
          e.act = null; } }
        else if (--a.t < -120) e.act = null;
        break; }
      case 'home': {
        if (this.moveTo(e, a.x, a.z, sp, 0.8)) { e.state = 'sleep'; e.energy = Math.min(100, e.energy + 0.25); if (!this.isNight() && this.tod < 0.7 && (!a.nap || e.energy > 80)) e.act = null; else if ((this.tick + e.id) % 50 === 0) e.act = null; }
        break; }
      case 'seekSpot': { const sp = a.sp; if (this.dayAmt() > 0.6 && this.tod < 0.7) { e.act = null; break; }
        if (sp.occ.size >= sp.cap && !sp.occ.has(e.id)) { e.act = null; a.sp.full = this.tick; break; }
        const d = dist(e.x, e.z, sp.x, sp.z); let arrived;
        if (sp.kind === 'islet' && (d < 30 && (a.swim || this.w.water[(e.z | 0) * W + (e.x | 0)] || (e.stuck > 20)))) { a.swim = true; e.swim = d > 3; const k = Math.min(0.13, d); e.x += (sp.x - e.x) / d * k; e.z += (sp.z - e.z) / d * k; e.dir = Math.atan2(sp.x - e.x, sp.z - e.z); e.walk += k; arrived = d < 1.2; }
        else arrived = this.moveTo(e, sp.x, sp.z, 0.22, 1.0);
        if ((a.t = (a.t || 0) + 1) > 1400) { e.act = null; break; }
        if (arrived && e.attackedAt && this.tick - e.attackedAt < 12 && this.nearestVamp(e, 2.2)) { /* v0.10: fangs already in — no slipping into a hiding spot mid-bite */ }
        else if (arrived) { e.swim = false; sp.occ.add(e.id); e.hidden = sp; this.knowSpot(e, sp); e.act = { type: 'hiding', sp }; e.nearMiss = null;
          if (e.exile || e.tribe == null || !this.huntLogged.has('hid' + e.id)) { this.huntLogged.add('hid' + e.id); if (e.exile || e.tribe == null || this.r() < 0.4) this.log(`${e.exile ? 'Exile ' : e.tribe != null ? 'Straggler ' : ''}${e.name} hid in the ${sp.label} in ${sp.region}${sp.occ.size > 1 ? ` (${sp.occ.size} huddled there)` : ''}.`, 'hide'); } }
        break; }
      case 'hiding': { const sp = a.sp; e.state = 'hiding'; e.energy = Math.min(100, e.energy + 0.12);
        if (!this.isNight() && this.tod > 0.25 && this.tod < 0.7) { this.leaveSpot(e);
          if (e.nearMiss) { const m = e.nearMiss; this.log(`${e.exile ? 'Exile ' : ''}${e.name} hid in the ${sp.label} in ${sp.region}; ${m.v} passed within ${NUM[m.d] || m.d} steps and never saw ${e.id % 2 ? 'her' : 'him'}.`, 'hide'); this.stats.nearMisses = (this.stats.nearMisses || 0) + 1; }
          this.stats.hidSurvived = (this.stats.hidSurvived || 0) + 1; e.nearMiss = null; e.act = null; }
        break; }
      case 'goHut': { const h = a.h; if (!tr || !tr.huts.includes(h)) { e.lockedOut = true; e.act = null; break; }
        if (this.moveTo(e, h.door.x, h.door.z, sp * (a.run ? 1.5 : 1.15), 1.6) || dist(e.x, e.z, h.door.x, h.door.z) < 2.6) {
          if (h.occ.size >= this.hutCap(h)) { e.lockedOut = true; e.act = null; if (this.isNight()) { this.stats.lockedOut = (this.stats.lockedOut || 0) + 1; if (!this.huntLogged.has('lo' + e.id)) { this.huntLogged.add('lo' + e.id); this.log(`${e.name} reached a full ${tr.name} hut and was locked out — ${tr.wall && tr.wall.done ? 'huddling by the fire' : 'looking for somewhere to hide'}.`, 'hide'); } } break; }
          if (this.isNight() && h.occ.size && this.tod > 0.84 && this.tod < 0.97 && !this.huntLogged.has('late' + tr.id)) { this.huntLogged.add('late' + tr.id); this.log(`${e.name} came running in from the dark and pounded on a ${tr.name} door until it opened.`, 'hide'); }
          this.enterHut(e, h); }
        else if ((a.t = (a.t || 0) + 1) > 900) e.act = null;
        break; }
      case 'inHut': { e.state = 'inHut'; e.energy = Math.min(100, e.energy + 0.25); if (e.hp < 100) e.hp = Math.min(100, e.hp + 0.03);
        if (!e.inHut) { e.act = null; break; }
        if (!this.isNight() && this.tod > 0.25 && this.tod < 0.7) { this.leaveHut(e); e.lockedOut = false; e.ateEve = false; }
        break; }
      case 'petition': { const T = a.tr; if (!T.alive || this.isNight()) { e.act = null; break; }
        if (!e.toldOut) e.toldOut = new Set(); if (!e.toldOut.has(T.id)) { e.toldOut.add(T.id); this.log(`Exile ${e.name} set out for ${T.name} to beg for a place among them.`, 'exile'); }
        if (this.moveTo(e, T.cx + 0.5, T.cz + 2, 0.22, 2.5) || (e.stuck > 60 && dist(e.x, e.z, T.cx, T.cz) < RING_R + 3)) {
          e.asked.add(T.id); this.stats.petitions = (this.stats.petitions || 0) + 1; const m = this.members(T); let op = 0; for (const o of m) op += o.op.get(e.id) || 0; op = m.length ? op / m.length : 0;
          const beds = T.huts.reduce((q, h) => q + this.hutCap(h), 0) - m.length, food = T.stock.food / Math.max(1, m.length);
          const reasonPen = { hoard: 30, attack: 25, abandon: 15 }[e.exReason] || 10;
          const score = 28 + op + (e.exRep || 0) * 0.35 - reasonPen + (beds > 0 ? 12 : T.wall && T.wall.done ? -4 : -14) + (food >= 3 ? 10 : food >= 1 ? 0 : -15) + (e.traits.bravery - 0.5) * 10 + this.rnd(-10, 10);
          const why = { hoard: 'a hoarder', attack: 'violent', abandon: 'one who abandons others', fired: 'a fired penguin' }[e.exReason] || 'cast out';
          if (score > 0) { this.join(e, T); e.exile = false; e.banishing = false; e.refusedAll = false; e.home = null; this.assignHomes(T); this.stats.adopted = (this.stats.adopted || 0) + 1; e.act = null;
            this.log(`${T.name} took in exile ${e.name}${beds > 0 ? ' and gave ' + (e.id % 2 ? 'her' : 'him') + ' a bed' : ''}. ${e.name} is safe again.`, 'tribe'); }
          else { this.stats.refused = (this.stats.refused || 0) + 1; e.act = null;
            this.log(`${T.name} turned exile ${e.name} away${beds <= 0 ? ': no beds to spare' : food < 1 ? ': their stores are thin' : `; word had reached them that ${e.name} was ${why}`}.`, 'exile'); }
        } else if ((a.t = (a.t || 0) + 1) > 1500) e.act = null;
        break; }
      case 'hide': e.state = 'hide'; e.energy = Math.min(100, e.energy + 0.15); if (--a.t <= 0) e.act = null; break;
      case 'wander': if (this.moveTo(e, a.x, a.z, sp * 0.8) || --a.t <= 0) e.act = null; break;
      case 'fight': e.act = null; break; // removed in v0.10
      default: e.act = null;
    }
  }
  // ---------- Vampire AI ----------
  vampPlan() {
    if (!this.vampNight()) return;
    const vs = this.vamps().filter(v => v.hp > 45 && v.state !== 'retreat'); if (!vs.length) return;
    this.detectHidden(vs);
    const targets = this.thronglets().filter(e => !e.bcu && !e.inHut && !this.safeAt(e.x, e.z) && !e.hidden && !(e.swim && e.act && e.act.sp && dist(e.x, e.z, e.act.sp.x, e.act.sp.z) < 8));
    const leader = vs.find(v => v.name === 'Stefan') || vs[0];
    const np = vs.length >= 10 ? 4 : vs.length >= 7 ? 3 : vs.length >= 4 ? 2 : 1; const packs = Array.from({ length: np }, (_, k) => vs.filter((_, i) => i % np === k));
    const taken = new Set();
    const walled = this.tribes.some(t => t.alive && t.wall && t.wall.done);
    for (const [pi, pack] of packs.entries()) {
      const L = pack.includes(leader) ? leader : pack[0];
      let best = null, bs = -1e9;
      { const cur = L.assign && L.assign.type === 'hunt' && L.assign.e; if (cur && cur.alive && !cur.inHut && !cur.hidden && !this.safeAt(cur.x, cur.z) && !taken.has(cur.id) && dist(L.x, L.z, cur.x, cur.z) < 40) best = cur; }
      const siege = pi >= 1 && walled && (this.day % 2 === 0 || this.day >= 10);
      if (!siege && !best) for (const e of targets) { if (taken.has(e.id)) continue; let nearAlly = 30; for (const o of this.ents) if (o !== e && o.alive && o.kind === 't' && dist(o.x, o.z, e.x, e.z) < nearAlly) nearAlly = dist(o.x, o.z, e.x, e.z);
        const s = nearAlly * 1.5 + (e.exile || e.tribe == null ? 15 : 0) + (100 - e.hp) * 0.05 - dist(L.x, L.z, e.x, e.z) / 2.5; if (s > bs) { bs = s; best = e; } }
      if (best) {
        taken.add(best.id);
        const ax = best.x - L.x, az = best.z - L.z, ad = Math.hypot(ax, az) || 1;
        pack.forEach((v, i) => { const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * (1 + (i >> 1));
          v.assign = { type: 'hunt', e: best, fx: -az / ad * 6 * side, fz: ax / ad * 6 * side }; });
        if (!this.huntLogged.has('h' + best.id) && this.tick - (this.lastStalkLog || 0) > 150) { this.huntLogged.add('h' + best.id); this.lastStalkLog = this.tick;
          const names = pack.map(v => v.name); this.log(`${names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) + ' are flanking' : names[0] + ' is stalking'} ${best.exile ? 'exile ' : ''}${best.name} ${this.placeName(best.x, best.z)}.`, 'vamp'); }
      } else {
        // everyone is behind walls: pin the gates of the weakest village, and try to breach
        const villages = this.tribes.filter(t => t.alive && t.wall && t.wall.done && t.huts.some(h => !h.occ.size));
        const tv = villages.sort((a, b) => a.wall.level - b.wall.level || dist(a.cx, a.cz, L.x, L.z) - dist(b.cx, b.cz, L.x, L.z))[0];
        if (!tv || pi === 0) { // nobody to catch outside: circle the edge of a sleeping village, waiting for a door to open
          const vs2 = this.tribes.filter(t => t.alive && t.members.size).sort((a, b) => dist(a.cx, a.cz, L.x, L.z) - dist(b.cx, b.cz, L.x, L.z)); const tv2 = vs2[(pi + this.day) % Math.max(1, Math.min(2, vs2.length))]; if (!tv2) continue;
          pack.forEach((v, i) => { if (!v.assign || v.assign.type !== 'stalk' || v.assign.tr !== tv2) v.assign = { type: 'stalk', tr: tv2, a: this.rnd(6.28) + i * 1.3 }; });
          if (!this.huntLogged.has('st' + tv2.id)) { this.huntLogged.add('st' + tv2.id); this.log(`${pack.map(v => v.name).join(' and ')} circle${pack.length > 1 ? '' : 's'} the edge of ${tv2.name}. Every door is shut; ${pack.length > 1 ? 'they wait' : 'he waits'} for someone to step outside.`, 'vamp'); }
          continue; }
        const gates = tv.wall.cells.filter(c => c.gate);
        pack.forEach((v, i) => { const g = gates[(i * 3) % gates.length]; const ox = g.x + 0.5 - tv.cx, oz = g.z + 0.5 - tv.cz, od = Math.hypot(ox, oz);
          if (!v.assign || v.assign.type !== 'pin' || v.assign.tr !== tv) v.assign = { type: 'pin', tr: tv, g, x: g.x + 0.5 + ox / od * 2, z: g.z + 0.5 + oz / od * 2, wait: 0 }; });
        if (!this.huntLogged.has('pin' + tv.id)) { this.huntLogged.add('pin' + tv.id); this.log(`${pack.map(v => v.name).join(' and ')} pinned the gates of ${tv.name}, waiting for someone to open them.`, 'vamp'); }
      }
    }
  }
  placeName(x, z) {
    const w = this.w; for (const tr of this.tribes) if (tr.alive && dist(x, z, tr.cx, tr.cz) < RING_R + 8) return `outside the walls of ${tr.name}`;
    if (dist(x, z, w.mansion.x, w.mansion.z) < 30) return 'in the shadow of 83 Kingsway';
    for (const sp of w.spots) if (dist(x, z, sp.x, sp.z) < 4) return `by the ${sp.label} in ${sp.region}`;
    for (let r = 1; r < 5; r++) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const k = ((z | 0) + dz) * W + (x | 0) + dx; if (w.water[k]) return `by the water in ${w.regionAt(x, z)}`; }
    return 'in ' + w.regionAt(x, z);
  }
  // ---------- hiding spots ----------
  knowSpot(e, sp) { if (!e.known) e.known = new Set(); if (!e.known.has(sp.id)) { e.known.add(sp.id); e.mem.push({ t: this.tick, txt: `knows the ${sp.label} in ${sp.region}` }); if (e.mem.length > 12) e.mem.shift(); } }
  learnSpots(e) {
    if ((this.tick + e.id) % 40) return;
    for (const sp of this.w.spots) if (Math.abs(sp.x - e.x) < 9 && Math.abs(sp.z - e.z) < 9) this.knowSpot(e, sp);
    // exiles share what they know
    for (const o of this.ents) { if (o === e || !o.alive || o.kind !== 't' || o.tribe != null || !o.known || dist(o.x, o.z, e.x, e.z) > 5) continue;
      const add = [...o.known].filter(id => !e.known || !e.known.has(id)); if (!add.length) continue; for (const id of add) this.knowSpot(e, this.w.spots[id]);
      this.opAdd(e, o.id, 12); this.opAdd(o, e.id, 8); const sp = this.w.spots[add[0]];
      if (!this.huntLogged.has('sh' + o.id + '-' + e.id)) { this.huntLogged.add('sh' + o.id + '-' + e.id); this.log(`${o.exile ? 'Exile ' : ''}${o.name} showed ${e.name} the ${sp.label} in ${sp.region}${add.length > 1 ? ` and ${add.length - 1} other hiding place${add.length > 2 ? 's' : ''}` : ''}.`, 'hide'); } }
  }
  pickSpot(e, maxD) {
    let best = null, bs = -1e9;
    for (const sp of this.w.spots) { if (sp.occ.size >= sp.cap || (sp.full && this.tick - sp.full < 100)) continue; const d = dist(sp.x, sp.z, e.x, e.z), known = e.known && e.known.has(sp.id); if (d > (known ? maxD * 2 : maxD)) continue;
      const s = sp.conceal * 50 - d * 0.7 + (known ? 18 : 0) - sp.occ.size * 4; if (s > bs) { bs = s; best = sp; } }
    return best;
  }
  leaveSpot(e) { if (e.hidden) e.hidden.occ.delete(e.id); e.hidden = null; }
  detectHidden(vs) {
    for (const e of this.ents) { if (!e.alive || e.kind !== 't' || !e.hidden) continue; const sp = e.hidden;
      for (const v of vs) { const d = dist(v.x, v.z, e.x, e.z), DR = 8 + 4 * this.threat(); if (d > DR) continue;
        const noise = 0.25 + (e.fear > 60 ? 0.45 : e.fear > 30 ? 0.2 : 0) + (sp.occ.size > 2 ? 0.15 : 0);
        const p = (1 - sp.conceal) * (1 - d / DR) * noise * (this.storm ? 0.55 : 1) * 1.6;
        if (this.r() < p) { this.leaveSpot(e); e.act = { type: 'flee', x: e.x + this.rnd(-10, 10), z: e.z + this.rnd(-10, 10), t: 25 }; this.stats.found = (this.stats.found || 0) + 1;
          this.log(`${v.name} heard ${e.fear > 60 ? 'the panicked breathing of ' : 'a rustle — '}${e.exile ? 'exile ' : ''}${e.name}, flushed from the ${sp.label} in ${sp.region}!`, 'vamp'); v.assign = { type: 'hunt', e, fx: 0, fz: 0 }; for (const o of vs) if (o !== v && !(o.assign && o.assign.type === 'hunt' && o.assign.e.alive) && dist(o.x, o.z, e.x, e.z) < 30) o.assign = { type: 'hunt', e, fx: this.rnd(-6, 6), fz: this.rnd(-6, 6) }; break; }
        if (d < 3.6 && (!e.nearMiss || d < e.nearMiss.d)) e.nearMiss = { v: v.name, d: Math.max(1, Math.round(d)) };
      } }
  }
  // v0.10 bat form: near dawn a vampire bursts into a bat and flies straight home, over terrain and walls. Bats never hunt or bite.
  batFly(v, tx, tz) { if (!v.batHome) { v.batHome = true; v.batAt = this.tick; v.assign = null; this.stats.batForms = (this.stats.batForms || 0) + 1; if (!v.batLogged || v.batLogged !== this.day) { v.batLogged = this.day; this.log(`${v.name} sensed the coming dawn and burst into a bat in a puff of smoke.`, 'vamp'); } }
    v.bat = true; const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz) || 1, k = Math.min(BAT_SPEED, d); v.x += dx / d * k; v.z += dz / d * k; v.dir = Math.atan2(dx, dz); v.walk += k; v.path = null; v.stuck = 0; return d <= BAT_SPEED; }
  unBat(v) { if (v.batHome) { v.batHome = false; v.unbatAt = this.tick; } v.bat = false; }
  sunBurn(v) { if (v.name === 'Stefan') { if (!v.batHome) v.state = 'returning'; return false; } // immortal: no burn, he just hurries for shelter
    v.hp -= 0.6; if (v.hp <= 0) { this.die(v, `${v.name} was caught by the sunrise and burned to ash.`); return true; } return false; }
  fly(v, tx, tz, sp) { const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz) || 1, k = Math.min(sp, d); const nx = v.x + dx / d * k, nz = v.z + dz / d * k;
    if (this.safeAt(nx, nz) && !this.safeAt(v.x, v.z)) { v.bat = false; return this.moveTo(v, tx, tz, 0.4); }
    v.bat = true; v.x = Math.max(1, Math.min(W - 2, nx)); v.z = Math.max(1, Math.min(D - 2, nz)); v.dir = Math.atan2(dx, dz); v.walk += k; v.path = null; return d < 1; }
  updateV(v) {
    const m = this.w.mansion, tod = this.tod, night = this.vampNight() && !(tod > 0.15 + 0.04 * this.threat() && tod < 0.5);
    if (v.cool > 0) v.cool--;
    if (night && (v.hideout || (v.homePlan && v.homePlan.h))) { if (v.hideout) this.log(`${v.name} slipped out of ${v.hideout.name} as dusk fell.`, 'vamp'); if (v.homePlan && v.homePlan.h) v.homePlan.h.occ.delete(v.id); this.leaveHideout(v); v.homePlan = null; }
    if (!night || v.hp < 45 || v.state === 'retreat') {
      if (v.hp < 45 && night && v.state !== 'retreat') { v.state = 'retreat'; this.log(`${v.name}, wounded, fled back to 83 Kingsway.`, 'fight'); }
      if (night && v.hideout) this.leaveHideout(v);
      const shade = this.inShade(v.x, v.z), dawn = !night && this.dayAmt() > 0.02;
      // dawn plan: the mansion if reachable before the sun bites, else the nearest free hideout
      if (!night && !v.hideout && !shade && !v.homePlan) { const t = this.tod, left = Math.max(0, ((t < 0.5 ? 0.215 : 1.215) - t) * DAY), reach = left * BAT_SPEED * 0.9;
        const dm = dist(v.x, v.z, m.x, m.z) - SHADE_R; const h = this.hideoutFor(v); v.homePlan = (dm <= reach || !h || dist(v.x, v.z, h.x, h.z) > dm) ? { m: true } : { h }; if (v.homePlan.h) { v.homePlan.h.occ.add(v.id); } }
      if (night) v.homePlan = null;
      const H = v.homePlan && v.homePlan.h;
      if (H && !v.hideout) { const d = dist(v.x, v.z, H.x, H.z); if (d > 0.6) { this.batFly(v, H.x, H.z); v.state = 'bat form, flying to ' + H.name;
          if (dawn && !v.rushLogged) { v.rushLogged = this.day; this.log(`Dawn caught ${v.name} far from 83 Kingsway — racing for ${H.name}.`, 'vamp'); }
          if (this.dayAmt() > 0.25) this.sunBurn(v); return; }
        this.unBat(v); v.hideout = H; v.x = H.x; v.z = H.z; this.log(`${v.name} crawled into ${H.name} to sleep out the day.`, 'vamp'); }
      if (v.hideout) { this.unBat(v); v.state = 'resting in ' + v.hideout.name; v.bat = false; v.hp = Math.min(v.maxhp, v.hp + 0.15); return; }
      const home = dist(v.x, v.z, m.x, m.z) < 3 || (shade && !night && v.hp >= 45 && v.state !== 'retreat') || (shade && dawn);
      if (!home) { if (!night) { this.batFly(v, m.x, m.z + 4); v.state = 'bat form, flying home'; } else if (dist(v.x, v.z, m.x, m.z) > 14) this.fly(v, m.x, m.z, 1.6); else { v.bat = false; this.moveTo(v, m.x, m.z, 0.42, 1.5); }
        if (dawn && !v.rushLogged) { v.rushLogged = this.day; this.log(`Dawn caught ${v.name} out — rushing for the shadow of 83 Kingsway.`, 'vamp'); }
        if (this.dayAmt() > 0.25 && !shade) { if (this.sunBurn(v)) return; } if (!v.batHome) v.state = v.state === 'retreat' ? 'retreat' : 'returning'; }
      else { this.unBat(v); if (v.rushLogged && v.rushLogged === this.day && !v.shadeLogged) { v.shadeLogged = this.day; this.log(`${v.name} reached the mansion's shadow — safe from the sun.`, 'vamp'); }
        v.bat = false; v.state = shade && !night && dist(v.x, v.z, m.x, m.z) >= 3 ? 'loitering' : 'resting'; v.hp = Math.min(v.maxhp, v.hp + 0.15);
        if (!night && (this.tick + v.id) % 400 === 0) { const a = this.rnd(6.28), r = 4 + this.rnd(SHADE_R - 5.5); v.loiter = { x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r }; }
        if (!night && v.loiter && this.inShade(v.loiter.x, v.loiter.z)) { if (this.moveTo(v, v.loiter.x, v.loiter.z, 0.12, 0.8)) v.loiter = null; }
        if (v.hp > v.maxhp * 0.8 && night) v.state = 'prowl'; }
      return;
    }
    if (v.batHome) this.unBat(v);
    if (v.state === 'resting' || /^resting in/.test(v.state)) v.state = 'prowl';
    // v0.10 opportunism: an exposed Thronglet close by beats any distant plan (pins, sieges, far targets);
    // anything wandering onto the 83 Kingsway grounds is sensed by the whole coven (up to 90 tiles)
    const onTurf = e => dist(e.x, e.z, this.w.mansion.x, this.w.mansion.z) < 34; // trespassers on the 83 Kingsway grounds are always fair game
    if (this.sated() && v.assign && v.assign.type === 'hunt' && !onTurf(v.assign.e)) { v.assign = null; if (!v.satedLog || v.satedLog !== this.nightKey()) { v.satedLog = this.nightKey(); } }
    const full = this.sated(); if ((this.tick + v.id) % 3 === 0) { const R = full ? 0 : 14 + 8 * this.threat(), cur = v.assign && v.assign.type === 'hunt' && v.assign.e.alive ? dist(v.x, v.z, v.assign.e.x, v.assign.e.z) : 1e9; let best = null, bsc = 1e9;
      for (const e of this.ents) { if (e.kind !== 't' || !e.alive || e.inHut || e.hidden) continue; const d = dist(v.x, v.z, e.x, e.z), turf = cur > 8 && onTurf(e) && d < 90, crowd = this.ents.reduce((n, o) => n + (o.kind === 'v' && o !== v && o.alive && o.assign && o.assign.e === e ? 1 : 0), 0), sc = d + crowd * 25 - (turf ? 1000 : 0); if ((d < R || turf) && (turf || d < cur * 0.6) && sc < bsc && !this.safeAt(e.x, e.z)) { bsc = sc; best = e; } }
      if (best && !(v.assign && v.assign.e === best)) { v.assign = { type: 'hunt', e: best, fx: 0, fz: 0 }; if (best.state !== 'flee') { best.fear = Math.max(best.fear || 0, 60); } } }
    const as = v.assign;
    if (as && as.type === 'hunt' && as.e.inHut) { v.assign = null; return; }
    if (as && as.type === 'hunt' && as.e.alive && as.e.hidden) { v.search = { x: as.e.x, z: as.e.z, t: 220, who: as.e.name }; v.assign = null; }
    if (as && as.type === 'hunt' && as.e.alive && !as.e.hidden && !this.safeAt(as.e.x, as.e.z)) {
      const e = as.e, d = dist(v.x, v.z, e.x, e.z); v.state = 'hunting';
      let tx = e.x, tz = e.z; if ((as.fx || as.fz) && d > 4) { tx += as.fx; tz += as.fz; if (dist(v.x, v.z, tx, tz) < 2.5) { as.fx = as.fz = 0; } }
      // v0.10 chase: lunge at close range, bat-hop over anything that blocks the path
      let caught = false;
      if (d < 3.2) { v.bat = false; const k = Math.min(d, 0.85); v.x += (e.x - v.x) / (d || 1) * k; v.z += (e.z - v.z) / (d || 1) * k; v.dir = Math.atan2(e.x - v.x, e.z - v.z); v.walk += k; v.path = null; caught = dist(v.x, v.z, e.x, e.z) < 1.3; if (!v.lunged || this.tick - v.lunged > 60) { v.lunged = this.tick; } }
      else if (d > 10 || v.stuck > 6 || v.chaseBat > 0) { if (v.stuck > 6) { v.chaseBat = 25; v.stuck = 0; } if (v.chaseBat > 0) v.chaseBat--; this.fly(v, tx, tz, d > 18 ? 1.4 + 0.3 * this.threat() : 0.9); }
      else { v.bat = false; this.moveTo(v, tx, tz, 0.55 + 0.12 * this.threat() * this.ease(), 1.0); }
      if (caught) {
        if (v.cool > 0) return; v.cool = 4;
        e.hp -= (40 + 20 * this.threat()) * (0.5 + 0.5 * this.ease()); e.fear = 100; e.attackedBy = v.name; e.attackedAt = this.tick; this.stats.attacks++;
        const pack = this.vamps().filter(o => dist(o.x, o.z, e.x, e.z) < 5);
        if (!this.huntLogged.has('a' + e.id)) { this.huntLogged.add('a' + e.id); this.log(pack.length > 1 ? `${pack.map(o => o.name).join(' and ')} cornered ${e.exile ? 'exile ' : ''}${e.name} ${this.placeName(e.x, e.z)}.` : `${v.name} sank fangs into ${e.exile ? 'exile ' : ''}${e.name} ${this.placeName(e.x, e.z)}.`, 'vamp'); }
        if (e.hp <= 0) { this.die(e, `${e.name}${e.exile ? ', the exile,' : ''} was drained by ${v.name}.`, v);
          if (this.r() < (this.thronglets().length > 30 ? 0.22 : 0.06) && this.vamps().length < VAMP_CAP) { const nv = this.spawnVampire(e.x, e.z, e.name + ' the Turned', true); nv.state = 'prowl'; this.stats.turned++; this.log(`${e.name} rose again with red eyes — ${nv.name} now hunts with Stefan.`, 'vamp'); }
          v.assign = null; }
      }
      return;
    }
    if (as && as.type === 'stalk') { const T = as.tr; v.state = 'stalking'; as.a += 0.004; const R = RING_R + 4.5, tx = T.cx + Math.cos(as.a) * R, tz = T.cz + Math.sin(as.a) * R;
      if (dist(v.x, v.z, tx, tz) > 18) this.fly(v, tx, tz, 1.0); else { v.bat = false; if (this.moveTo(v, tx, tz, 0.22, 1.5)) as.a += 0.05; }
      return; }
    if (as && as.type === 'pin') {
      v.state = 'pinning';
      const g = as.g, k = g.z * W + g.x, gate = this.w.gates.get(k);
      if (gate && gate.open > 0 && dist(v.x, v.z, g.x + .5, g.z + .5) < 4) { this.moveTo(v, as.tr.cx, as.tr.cz, 0.34, 1); if (!as.slipped) { as.slipped = true; as.tr.wall.breached = true; this.log(`A gate of ${as.tr.name} swung open — ${v.name} slipped inside the walls!`, 'vamp'); } return; }
      if (as.slipped && this.insideRing(as.tr, v.x, v.z)) { v.assign = null; return; }
      if (this.moveTo(v, as.x, as.z, 0.3, 1.2)) {
        if (++as.wait > Math.max(20, 70 - 50 * this.threat())) { // breach: tear at the nearest wall block
          let best = null, bd = 4; const gatesOk = this.day >= 3; for (const c of as.tr.wall.cells) { if (c.gate && !gatesOk) continue; const d = dist(c.x + .5, c.z + .5, v.x, v.z); if (d < bd) { bd = d; best = c; } }
          if (best && v.cool <= 0) { v.cool = Math.round((as.tr.wall.level >= 2 ? 40 : 22) * (1 - 0.5 * this.threat())); if (best.gate) { this.stats.gateHits = (this.stats.gateHits || 0) + 1; if (!as.gateLogged) { as.gateLogged = true; this.log(`${v.name} is battering the gate of ${as.tr.name}!`, 'vamp'); } } const gy = this.w.ground[best.z * W + best.x]; for (let y = gy + 3; y >= gy; y--) { if (this.w.get(best.x, y, best.z)) { this.w.set(best.x, y, best.z, 0); break; } }
            if (this.w.stack[best.z * W + best.x] <= 1 && !as.tr.wall.breached) { as.tr.wall.breached = true; this.stats.breaches++; this.log(`${v.name} tore a breach in the ${as.tr.name} wall!`, 'vamp'); v.assign = null; } }
        }
      }
      return;
    }
    v.state = 'prowl';
    if (v.search && v.search.t-- > 0) { v.state = 'searching'; const S = v.search; if (!v.prowl || dist(v.x, v.z, v.prowl.x, v.prowl.z) < 1.5 || this.tick % 60 === 0) v.prowl = { x: S.x + this.rnd(-5, 5), z: S.z + this.rnd(-5, 5) };
      if (!S.logged && dist(v.x, v.z, S.x, S.z) < 6) { S.logged = true; this.log(`${v.name} circles ${this.placeName(S.x, S.z)}, sniffing for ${S.who}.`, 'vamp'); }
      this.moveTo(v, v.prowl.x, v.prowl.z, 0.24); return; }
    if (!v.prowl || dist(v.x, v.z, v.prowl.x, v.prowl.z) < 2 || this.tick % 300 === 0) v.prowl = { x: Math.max(20, Math.min(W - 20, m.x + this.rnd(-170, 170))), z: Math.max(20, Math.min(D - 20, m.z + this.rnd(-170, 170))) };
    if (dist(v.x, v.z, v.prowl.x, v.prowl.z) > 25) this.fly(v, v.prowl.x, v.prowl.z, 0.9); else { v.bat = false; this.moveTo(v, v.prowl.x, v.prowl.z, 0.26); }
  }
  // ---------- god tools ----------
  godPenguin(x, z) { if (this.penguins().length >= BEDROOMS) { this.log(`Every bedroom at 83 Kingsway is full — no room for another penguin.`, 'god'); return null; } const p = this.spawnPenguin(x, z); this.log(`A god placed a penguin, ${p.name}, ${this.placeName(x, z)}.`, 'god'); return p; }
  godDrop(type, x, z) {
    const w = this.w; x |= 0; z |= 0; if (!w.inb(x, z) || w.water[z * W + x]) return false;
    const g = w.top(x, z); let blocks = [];
    if (type === 'berry') { w.set(x, g, z, B.BERRY); blocks = [[x, g, z]]; w.addNode('berry', x, z, 10, blocks, { regrow: 700 }); }
    else if (type === 'nut') { w.set(x, g, z, B.NUTLEAF); blocks = [[x, g, z]]; w.addNode('nut', x, z, 10, blocks, { regrow: 0, pile: true }); }
    else if (type === 'reed') { w.set(x, g, z, B.REED); blocks = [[x, g, z]]; w.addNode('reed', x, z, 6, blocks, { regrow: 500 }); }
    else if (type === 'stone') { w.set(x, g, z, B.STONE); blocks = [[x, g, z]]; w.addNode('stone', x, z, 12, blocks); }
    else if (type === 'wood') { w.set(x, g, z, B.LOG); blocks = [[x, g, z]]; w.addNode('wood', x, z, 10, blocks); }
    this.log(`A god's hand dropped ${type === 'berry' ? 'berries' : type === 'nut' ? 'nuts' : type === 'reed' ? 'reeds' : type} ${this.placeName(x, z)}.`, 'god');
    return true;
  }
  godVampire(x, z) { const m = this.w.mansion; if (this.vamps().length >= VAMP_CAP) { this.log(`Every vampire room at 83 Kingsway is taken — no room for another vampire.`, 'god'); return null; }
    if (x == null || !this.w.inb(x | 0, z | 0) || this.w.water[(z | 0) * W + (x | 0)]) { x = m.x + this.rnd(-2, 2); z = m.z + this.rnd(-2, 2); }
    const v = this.spawnVampire(x, z); v.godMade = true; v.state = this.isNight() ? 'prowl' : 'returning'; v.alert = this.tick;
    this.log(`A god summoned a vampire, ${v.name}, ${this.placeName(x, z)}. ${v.name} takes a room at 83 Kingsway beside Stefan.`, 'god'); return v; }
  godSpawn(x, z) { const e = this.spawnThronglet(x, z); this.log(`A god placed a new Thronglet, ${e.name}, ${this.placeName(x, z)}.`, 'god'); return e; }
}

Object.assign(Sim.prototype, PenguinMixin);
