// Dark Forest v0.14 — Kyler's field notes (2026-11-12):
//  * new settlements: when a village fills up, settlers found a new village somewhere random on the map; every new
//    village gets a tribe name and the same label as the original 8 (minimap + close-up), with a pop-in when it appears
//  * a minimum of 8 villages: if villages are lost, a big village sends settlers to refound one
//  * Mount Cinderwrath erupts now and then (warning first, then the eruption): villages in its shadow pack up and
//    evacuate to a safe village, then go home when the ash settles
//  * storms: hurricanes along the coast, tornadoes inland. They tear blocks out of village walls; afterwards the
//    Thronglets rush to repair the gaps so the walls are impenetrable again
// Everything here is drawn procedurally by render2d.js (no new art files).
import { W, D, B, RG } from './world.js';
import { REPAIR_DUSK } from './sim.js';
const DAYT = 1200, RING_R = 11;
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
export const MIN_VILLAGES = 8, MAX_VILLAGES = 14, EXTRA_CAP = 12; // extras bud off sporadically up to 12; outcast camps can push the total a little higher
export const ERUPT = { WARN: 160, ERUPT: 720, CLEAR: 320 };
export const GOD_COOL = 150; // v0.14.1 God-menu disaster buttons: ~15 s at 1x after a god-made disaster starts or ends before that button works again (no spamming)
export const COAST_MAX = 60, INLAND_MIN = 80; // tiles from the sea: hurricanes only hit villages this close to the coast, tornadoes only ones this far inland
export const STORM = { WARN: 120, tornado: 300, hurricane: 400 }; // short enough that the repair rush happens in daylight
const NAME_A = ['Ash', 'Bramble', 'Cedar', 'Dew', 'Elm', 'Fox', 'Gorse', 'Heather', 'Ivy', 'Kestrel', 'Linden', 'Maple', 'Nettle', 'Otter', 'Pine', 'Quill', 'Reed', 'Sage', 'Thistle', 'Umber', 'Vale', 'Wren', 'Yarrow', 'Moss', 'Rowan', 'Hazel'];
const NAME_B = ['brook', 'croft', 'dale', 'fold', 'gate', 'haven', 'hollow', 'hurst', 'lea', 'mere', 'moor', 'ridge', 'stead', 'thorpe', 'wick', 'wold', 'ford', 'glen', 'combe', 'den'];

export const DisasterMixin = {
  // ---------- names / events ----------
  tribeName(i) { const used = new Set(this.tribes.map(t => t.name)); if (i < this.villageNames.length && !used.has(this.villageNames[i])) return this.villageNames[i];
    for (const n of this.villageNames) if (!used.has(n)) return n; // unused names left in the shuffled pool
    for (let k = 0; k < 400; k++) { const n = NAME_A[(this.r() * NAME_A.length) | 0] + NAME_B[(this.r() * NAME_B.length) | 0]; if (!used.has(n)) return n; }
    return 'Newhaven ' + i; },
  emit(kind, text, x, z) { const ev = { kind, text, x, z, tick: this.tick }; (this.events || (this.events = [])).push(ev); if (this.events.length > 40) this.events.shift(); if (this.onEvent) this.onEvent(ev); return ev; },
  villages() { return this.tribes.filter(t => t.alive && t.members.size > 0); },
  beds(t) { return t.huts.reduce((a, h) => a + this.hutCap(h), 0); },
  dayTick(day, tod) { return (Math.floor(day) - 1) * DAYT + Math.round(tod * DAYT); },
  // ---------- settlements ----------
  settlePlan() { if (this.day < 2) return; const vil = this.villages(); if (vil.length >= MAX_VILLAGES) return;
    const ok = t => t.alive && !t.outcasts && t.evacuated == null && t.members.size >= 12;
    let donor = null, why = null;
    if (vil.length < MIN_VILLAGES) { donor = this.tribes.filter(ok).sort((a, b) => b.members.size - a.members.size)[0]; why = 'min'; }
    if (!donor && vil.length < EXTRA_CAP) { const full = this.tribes.filter(t => ok(t) && t.huts.length >= 4 && t.members.size >= this.beds(t)); if (full.length && this.r() < 0.3) { donor = full[(this.r() * full.length) | 0]; why = 'full'; } } // a village with every bed taken sometimes buds off a new one
    if (donor) this.foundSettlement(donor, why === 'min' ? 5 : 6, why); },
  settleSite() { for (let k = 0; k < 6; k++) { const s = this.findSite(null, 999); if (!s) continue; if (this.erupt && dist(s.x, s.z, this.erupt.x, this.erupt.z) < this.erupt.R) continue; return s; } return null; },
  foundSettlement(from, n, why) { const site = this.settleSite(); if (!site) return null;
    const go = this.members(from).filter(e => e.kind === 't' && !e.bcu && !e.trade && !e.evac && !e.held && e.guardOf == null && e.id !== from.chief && e.hp > 60).sort((a, b) => b.traits.bravery - a.traits.bravery).slice(0, n);
    if (go.length < 3) return null;
    const tr = this.foundTribe(site.x, site.z, null); tr.settledFrom = from.id;
    for (const k of ['food', 'wood', 'stone']) { const g = Math.max(0, Math.min(Math.floor(from.stock[k] * 0.3), k === 'food' ? 14 : 10)); from.stock[k] -= g; tr.stock[k] += g; }
    for (const e of go) { if (e.inHut) this.leaveHut(e); if (e.hidden) this.leaveSpot(e); e.home = null; e.act = null; e.path = null; this.join(e, tr); }
    tr.chief = go[0].id; this.assignHomes(from); this.assignHomes(tr); this.stats.settlements = (this.stats.settlements || 0) + 1;
    this.log(`🏕 ${go.map(e => e.name).join(', ')} left ${from.name}${why === 'full' ? ', which had run out of room,' : ''} and founded a new village, ${tr.name}, in ${this.w.regionAt(site.x, site.z)}.`, 'tribe');
    this.emit('settle', `🏕 New settlement: ${tr.name}`, tr.cx, tr.cz); return tr; },
  // ---------- scheduler ----------
  disasterTick() {
    if (this.nextEruption == null) { this.nextEruption = this.dayTick(3 + Math.floor(this.r() * 3), 0.3 + this.r() * 0.12); this.nextStorm = this.dayTick(2 + Math.floor(this.r() * 2), 0.24 + this.r() * 0.1); if (Math.abs(this.nextStorm - this.nextEruption) < DAYT * 0.6) this.nextStorm += DAYT; }
    if (!this.erupt && this.tick >= this.nextEruption) { if (this.wx || this.tod > 0.5) this.nextEruption = this.dayTick(this.day + 1, 0.3 + this.r() * 0.12); else this.startEruption(); } // daytime only, so the evacuation is readable
    if (!this.wx && this.tick >= this.nextStorm) { if (this.erupt || this.tod > 0.5) this.nextStorm = this.dayTick(this.day + 1, 0.24 + this.r() * 0.1); else this.startStorm(); }
    if (this.erupt) this.eruptTick();
    if (this.wx) this.stormTick(); },
  // ---------- volcano ----------
  hostFor(x, z, E, not) { const vs = this.villages().filter(t => t !== not && t.evacuated == null && dist(t.cx, t.cz, E.x, E.z) > E.R + 6);
    if (!vs.length) return null; return vs.sort((a, b) => (dist(a.cx, a.cz, x, z) - (a.wall && a.wall.done ? 45 : 0)) - (dist(b.cx, b.cz, x, z) - (b.wall && b.wall.done ? 45 : 0)))[0]; },
  startEruption() { const V = this.w.volcano, vil = this.villages(); const near = vil.map(t => dist(t.cx, t.cz, V.x, V.z)).sort((a, b) => a - b)[0] ?? 140;
    const R = Math.round(Math.max(110, Math.min(175, near + 12)));
    const E = this.erupt = { phase: 'warn', start: this.tick, R, x: V.x, z: V.z, evac: [], n: 0 }; this.stats.eruptions = (this.stats.eruptions || 0) + 1; this.volcanoWarn = true;
    this.log(`⚠ The ground shakes under Mount Cinderwrath and its smoke turns black. Everyone in its shadow must leave — now!`, 'disaster');
    this.emit('erupt-warn', '⚠ Mount Cinderwrath is rumbling — villages nearby are evacuating', V.x, V.z);
    for (const tr of vil) if (dist(tr.cx, tr.cz, V.x, V.z) < R) { const h = this.hostFor(tr.cx, tr.cz, E, tr); tr.evacuated = h ? h.id : -1; E.evac.push(tr.id);
      this.log(`🎒 ${tr.name} packs up and flees Mount Cinderwrath${h ? ` for the safety of ${h.name}` : ''}.`, 'disaster'); }
    for (const e of this.thronglets()) { if (e.bcu || e.held) continue; const tr = e.tribe != null ? this.tribes[e.tribe] : null;
      const mine = tr && E.evac.includes(tr.id), inZone = dist(e.x, e.z, V.x, V.z) < R; if (!mine && !inZone) continue;
      const host = mine && tr.evacuated >= 0 ? this.tribes[tr.evacuated] : this.hostFor(e.x, e.z, E, tr); if (!host) continue;
      if (e.inHut) this.leaveHut(e); if (e.hidden) this.leaveSpot(e);
      if (e.trade) { const T = e.trade, A = this.tribes[T.from], c = T.leg === 'go' ? T.give : T.get; if (A && c && c.n) A.stock[c.k] = (A.stock[c.k] || 0) + c.n; e.trade = null; }
      e.evac = { host: host.id, a: this.r() * 6.283, r: 3 + this.r() * 5, since: this.tick }; e.act = null; e.path = null; E.n++; this.stats.evacuations = (this.stats.evacuations || 0) + 1; } },
  eruptTick() { const E = this.erupt, el = this.tick - E.start;
    if (E.phase === 'warn' && el >= ERUPT.WARN) { E.phase = 'erupt'; this.volcanoErupt = true; this.volcanoWarn = false;
      this.log(`🌋 Mount Cinderwrath ERUPTS! Lava bombs and ash rain down on everything in its shadow.`, 'disaster'); this.emit('erupt', '🌋 Mount Cinderwrath is erupting!', E.x, E.z);
      for (const id of E.evac) { const tr = this.tribes[id]; if (!tr || !tr.alive) continue; for (const f of tr.farms) if (f.stage >= 0) { f.stage = -1; f.timer = 0; this.setCrop(f); }
        if (tr.wall && tr.wall.done) { const cells = tr.wall.cells.filter(c => !c.gate), hit = new Set(); for (let k = 0; k < 5 && cells.length; k++) { const c = cells[(this.r() * cells.length) | 0]; if (hit.has(c)) continue; hit.add(c); this.hitWall(tr, c, 2); }
          if (hit.size) { tr.dmgCause = 'lava bombs'; this.log(`Lava bombs smashed ${hit.size} holes in the empty walls of ${tr.name} and buried its fields in ash.`, 'disaster'); } } } }
    if (E.phase === 'erupt') { this.volcanoErupt = true;
      if (this.tick % 5 === 0) for (const e of this.thronglets()) { if (e.evac || e.inHut || e.held || e.bcu) continue; if (dist(e.x, e.z, E.x, E.z) < E.R * 0.45) { e.fear = 100; e.hp -= 1.2; if (e.hp <= 0) this.die(e, `${e.name}${this.ofV(e)} was buried in ash on the slopes of Mount Cinderwrath.`); } }
      if (el >= ERUPT.WARN + ERUPT.ERUPT) { E.phase = 'clear'; this.volcanoErupt = false; this.log(`The eruption is dying down. Ash drifts over the ${E.evac.length ? 'empty villages' : 'slopes'} as the lava cools.`, 'disaster'); } }
    if (E.phase === 'clear' && el >= ERUPT.WARN + ERUPT.ERUPT + ERUPT.CLEAR) this.endEruption(); },
  endEruption() { const E = this.erupt; if (!E) return; let n = 0;
    for (const e of this.ents) if (e.evac) { e.evac = null; e.pack = false; e.act = null; e.path = null; n++; }
    const names = []; for (const id of E.evac) { const tr = this.tribes[id]; if (!tr) continue; tr.evacuated = null; if (tr.alive && tr.members.size) { names.push(tr.name); if (tr.dmgCause) this.queueRepair(tr, tr.dmgCause); } }
    if (names.length || n) { this.log(`🏠 The ash has settled. ${names.length ? names.join(' and ') + ' head' + (names.length > 1 ? '' : 's') + ' home' : n + ' evacuees head home'} to rebuild.`, 'disaster'); this.emit('erupt-end', `🏠 The ash has settled — ${names.length ? names.join(', ') : 'evacuees'} going home`, E.x, E.z); }
    if (E.god) (this.godCool || (this.godCool = {})).volcano = this.tick + GOD_COOL;
    this.erupt = null; this.volcanoErupt = false; this.volcanoWarn = false;
    this.nextEruption = this.dayTick(this.day + 6 + Math.floor(this.r() * 4), 0.3 + this.r() * 0.12); },
  updateEvac(e) { const H = this.tribes[e.evac.host]; if (!this.erupt || !H || !H.alive) { e.evac = null; e.pack = false; return false; }
    if (e.hunger > 55) { if (this.invFood(e) > 0) { this.takeFood(e); e.hunger = Math.max(0, e.hunger - 40); } else if (H.stock.food > 0 && dist(e.x, e.z, H.cx, H.cz) < RING_R + 2) { H.stock.food--; e.hunger = Math.max(0, e.hunger - 40); } }
    const there = dist(e.x, e.z, H.cx, H.cz) < RING_R - 1.5, tx = H.cx + Math.cos(e.evac.a) * e.evac.r, tz = H.cz + Math.sin(e.evac.a) * e.evac.r;
    if (there && !e.evac.arrived) { e.evac.arrived = this.tick; if (!this.huntLogged.has('ev' + H.id + ':' + e.tribe)) { this.huntLogged.add('ev' + H.id + ':' + e.tribe); this.log(`${e.name}${this.ofV(e)} reached ${H.name} with a pack on ${e.id % 2 ? 'her' : 'his'} back. ${H.name} opens its gates to the refugees.`, 'tribe'); } }
    e.pack = !there; e.state = there ? `sheltering in ${H.name} (evacuated)` : `evacuating to ${H.name}`; e.fear = there ? 0 : 25;
    if (dist(e.x, e.z, tx, tz) > 1.4) this.moveTo(e, tx, tz, there ? 0.16 : 0.3, 1.2);
    return true; },
  // ---------- storms ----------
  coastDist(x, z) { const w = this.w; for (let r = 4; r < 160; r += 4) for (let a = 0; a < 24; a++) { const X = Math.round(x + Math.cos(a / 24 * 6.283) * r), Y = Math.round(z + Math.sin(a / 24 * 6.283) * r); if (X < 0 || Y < 0 || X >= W || Y >= D || w.region[Y * W + X] === RG.SEA) return r; } return 160; },
  startStorm(kind, targetId) { const vil = this.villages().filter(t => t.evacuated == null && t.wall && t.wall.done); const all = vil.length ? vil : this.villages(); if (!all.length) { this.nextStorm = this.tick + DAYT; return; }
    for (const t of all) if (t.coastD == null) t.coastD = this.coastDist(t.cx, t.cz);
    kind = kind || (this.lastStorm === 'tornado' ? (this.r() < 0.7 ? 'hurricane' : 'tornado') : this.lastStorm === 'hurricane' ? (this.r() < 0.7 ? 'tornado' : 'hurricane') : (this.r() < 0.5 ? 'tornado' : 'hurricane'));
    let T = targetId != null ? this.tribes[targetId] : null;
    if (!T) { const srt = all.slice().sort(kind === 'hurricane' ? (a, b) => a.coastD - b.coastD : (a, b) => dist(a.cx, a.cz, 256, 256) - dist(b.cx, b.cz, 256, 256)); T = srt[(this.r() * Math.min(kind === 'hurricane' ? 2 : 3, srt.length)) | 0]; }
    let S;
    if (kind === 'tornado') { let sx = T.cx, sz = T.cz; for (let k = 0; k < 40; k++) { const a = this.r() * 6.283, x = T.cx + Math.cos(a) * 42, z = T.cz + Math.sin(a) * 42; if (x > 10 && z > 10 && x < W - 10 && z < D - 10 && !this.w.water[(z | 0) * W + (x | 0)] && this.w.region[(z | 0) * W + (x | 0)] !== RG.SEA) { sx = x; sz = z; break; } }
      S = { kind, phase: 'warn', start: this.tick, R: 6.5, sx, sz, x: sx, z: sz, tx: T.cx, tz: T.cz, target: T.id, dur: STORM.tornado, hit: {}, seed: this.r() * 100 }; }
    else { const a = Math.atan2(T.cz - 256, T.cx - 256), rad = dist(T.cx, T.cz, 256, 256) + 14, sg = this.r() < 0.5 ? 1 : -1;
      S = { kind, phase: 'warn', start: this.tick, R: 30, rad, a0: a - 0.42 * sg, a1: a + 0.42 * sg, target: T.id, dur: STORM.hurricane, hit: {}, seed: this.r() * 100 }; S.x = 256 + Math.cos(S.a0) * (rad + 30); S.z = 256 + Math.sin(S.a0) * (rad + 30); }
    this.wx = S; this.lastStorm = kind; this.stats.bigStorms = (this.stats.bigStorms || 0) + 1;
    const where = kind === 'hurricane' ? `the coast near ${T.name}` : T.name;
    this.log(kind === 'tornado' ? `⚠ The sky over ${T.name} turns green-black and starts to spin. A tornado is forming!` : `⚠ Dark spiral clouds gather out at sea. A hurricane is heading for ${where}!`, 'disaster');
    this.emit(kind + '-warn', kind === 'tornado' ? `🌪 Tornado warning near ${T.name}!` : `🌀 Hurricane approaching ${where}!`, S.x, S.z); return S; },
  stormTick() { const S = this.wx, el = this.tick - S.start;
    if (S.phase === 'warn') { if (el < STORM.WARN) return; S.phase = 'active'; const T = this.tribes[S.target];
      this.log(S.kind === 'tornado' ? `🌪 A tornado touches down and churns toward ${T ? T.name : 'the villages'}!` : `🌀 The hurricane slams into the coast${T ? ' near ' + T.name : ''}!`, 'disaster');
      this.emit(S.kind, S.kind === 'tornado' ? `🌪 Tornado touching down near ${T ? T.name : 'a village'}!` : `🌀 Hurricane hits the coast${T ? ' near ' + T.name : ''}!`, S.x, S.z); }
    const p = (el - STORM.WARN) / S.dur;
    if (S.kind === 'tornado') { const q = p * 2.5, dx = S.tx - S.sx, dz = S.tz - S.sz, L = Math.hypot(dx, dz) || 1, wob = Math.sin(p * 11 + S.seed) * 3.5; S.x = S.sx + dx * q - dz / L * wob; S.z = S.sz + dz * q + dx / L * wob; }
    else { const a = S.a0 + (S.a1 - S.a0) * p, rr = S.rad + 30 * Math.max(0, 1 - p * 3) + 4 * Math.sin(p * 7 + S.seed); S.x = 256 + Math.cos(a) * rr; S.z = 256 + Math.sin(a) * rr; }
    S.x = Math.max(4, Math.min(W - 4, S.x)); S.z = Math.max(4, Math.min(D - 4, S.z));
    if (this.tick % 4 === 0) { const cap = S.kind === 'tornado' ? 18 : 12, pr = S.kind === 'tornado' ? 0.3 : 0.09, nb = S.kind === 'tornado' ? 2 : 1;
      for (const tr of this.tribes) { if (!tr.alive || !tr.wall || !tr.wall.done || dist(tr.cx, tr.cz, S.x, S.z) > S.R + RING_R + 1) continue; const h = S.hit[tr.id] || 0; if (h >= cap) continue; let n = h;
        for (const c of tr.wall.cells) { if (n >= cap) break; const d = dist(c.x + 0.5, c.z + 0.5, S.x, S.z); if (d > S.R) continue; if (this.r() < pr * (1 - 0.5 * d / S.R) && this.hitWall(tr, c, nb)) n++; }
        if (n > h) { if (!h) this.log(`${S.kind === 'tornado' ? 'The tornado' : 'Hurricane winds'} ${S.kind === 'tornado' ? 'rips through' : 'batter'} the walls of ${tr.name}!`, 'disaster'); S.hit[tr.id] = n; } }
      // once the storm has moved off a village it hit, that village starts repairing straight away (no waiting for the storm to die out)
      for (const id in S.hit) { const tr = this.tribes[+id]; if ((S.rq || (S.rq = {}))[id] || !tr || !tr.alive || tr.evacuated != null || dist(tr.cx, tr.cz, S.x, S.z) < S.R + RING_R + 4) continue; S.rq[id] = 1; this.queueRepair(tr, S.kind); this.emit('repair', `🔨 ${tr.name} rushes out to repair its walls`, tr.cx, tr.cz); }
      for (const e of this.ents) { if (!e.alive || e.held || e.inHut || e.inMansion || e.hideout || e.kind === 'p' || e.kind === 'm') continue; const d = dist(e.x, e.z, S.x, S.z); if (d > S.R + 2) continue;
        if (e.kind === 't') { e.fear = 100; if (!e.evac && (!e.act || e.act.type !== 'flee')) { const a = Math.atan2(e.z - S.z, e.x - S.x); e.act = { type: 'flee', x: e.x + Math.cos(a) * 12, z: e.z + Math.sin(a) * 12, t: 30 }; }
          e.hp -= S.kind === 'tornado' ? 1.4 : 0.4; if (e.hp <= 0) this.die(e, `${e.name}${this.ofV(e)} was swept away by the ${S.kind}.`); } } }
    if (p >= 1) this.endStorm(); },
  endStorm() { const S = this.wx; if (!S) return; const hit = Object.keys(S.hit).map(id => this.tribes[+id]).filter(t => t && t.alive && t.members.size);
    this.log(S.kind === 'tornado' ? `The tornado ropes out and vanishes${hit.length ? `, leaving holes in the walls of ${hit.map(t => t.name).join(' and ')}` : ''}.` : `The hurricane blows itself out at sea${hit.length ? `. ${hit.map(t => t.name).join(' and ')} ${hit.length > 1 ? 'count' : 'counts'} the damage` : ''}.`, 'disaster');
    for (const tr of hit) { if (S.rq && S.rq[tr.id]) continue; if (tr.evacuated != null) { tr.dmgCause = S.kind; continue; } this.queueRepair(tr, S.kind); }
    this.emit(S.kind + '-end', hit.length ? `🔨 ${hit.map(t => t.name).join(', ')} rushing to repair storm damage` : `The ${S.kind} has passed`, S.x, S.z);
    if (S.god) (this.godCool || (this.godCool = {})).storm = this.tick + GOD_COOL;
    this.wx = null; this.nextStorm = this.dayTick(this.day + 3 + Math.floor(this.r() * 3), 0.24 + this.r() * 0.1);
    if (this.erupt) this.nextStorm += DAYT; },
  // knock up to n blocks off the top of a wall cell; the debris is salvaged into the village stock so the repair can start straight away
  hitWall(tr, c, n) { const w = this.w, g = w.ground[c.z * W + c.x]; let did = 0;
    for (let y = g + 3; y >= g && did < n; y--) { const b = w.get(c.x, y, c.z); if (!b || b === B.TORCH) continue; w.set(c.x, y, c.z, 0); did++; if (b === B.COBBLE) tr.stock.stone += 1; else tr.stock.wood += 1; }
    if (did) { this.stats.stormDamage = (this.stats.stormDamage || 0) + did; if (w.stack[c.z * W + c.x] <= 1) { if (!tr.wall.breached) this.stats.stormBreaches = (this.stats.stormBreaches || 0) + 1; tr.wall.breached = true; } (this.fx || (this.fx = [])).push({ k: 'debris', x: c.x + 0.5, z: c.z + 0.5, tick: this.tick }); }
    return did > 0; },
  queueRepair(tr, cause) { tr.dmgCause = null; if (!tr.wall || !tr.wall.done) return; const w = this.w, miss = [], want = tr.wall.level >= 2 ? 3 : 2;
    for (const c of tr.wall.cells) { const g = w.ground[c.z * W + c.x]; for (let y = 0; y < want; y++) if (w.get(c.x, g + y, c.z) === 0) miss.push({ x: c.x, y: g + y, z: c.z, b: y === 2 ? B.COBBLE : c.gate ? B.GATE : B.LOG, cost: y === 2 ? 'stone' : 'wood', gate: c.gate && y === 0 ? true : undefined }); }
    if (!miss.length) return; miss.sort((a, b) => a.y - b.y);
    tr.jobs = tr.jobs.filter(j => j.type !== 'repair'); tr.jobs.unshift({ type: 'repair', blocks: miss, idx: 0, label: 'storm repair', urgent: true, cause, total: miss.length });
    tr.repairing = { since: this.tick, total: miss.length, cause }; this.stats.repairJobs = (this.stats.repairJobs || 0) + 1;
    this.log(`🔨 ${tr.name} rushes to repair its walls after the ${cause} — ${miss.length} gap${miss.length > 1 ? 's' : ''} to fill${this.isNight() || this.tod >= REPAIR_DUSK ? ' at first light' : ' before dusk'}.`, 'build'); },
  // ---------- v0.14.1: God-menu triggers (volcano eruption, hurricane, tornado) ----------
  // Guarded: one eruption and one storm at a time, plus a short cooldown after each start/end, so tapping repeatedly can't stack or break them.
  godDisasterState(kind) { const gc = this.godCool || (this.godCool = {}), key = kind === 'volcano' ? 'volcano' : 'storm';
    if (kind === 'volcano' && this.erupt) return { ready: false, why: `Mount Cinderwrath is already ${this.erupt.phase === 'warn' ? 'rumbling' : this.erupt.phase === 'erupt' ? 'erupting' : 'cooling'}` };
    if (kind !== 'volcano' && this.wx) return { ready: false, why: `A ${this.wx.kind} is already raging` };
    if (!this.villages().length) return { ready: false, why: 'No villages left to hit' };
    const wait = (gc[key] || 0) - this.tick; if (wait > 0) return { ready: false, why: `Recharging (${Math.ceil(wait / 10)}s)`, wait };
    return { ready: true }; },
  godStormTarget(kind, prefId) { const vil = this.villages().filter(t => t.evacuated == null); for (const t of vil) if (t.coastD == null) t.coastD = this.coastDist(t.cx, t.cz);
    const fits = t => kind === 'hurricane' ? t.coastD <= COAST_MAX : t.coastD >= INLAND_MIN;
    const pref = prefId != null ? this.tribes[prefId] : null; if (pref && vil.includes(pref) && fits(pref)) return pref; // the village you have selected, if it suits this storm
    const walled = vil.filter(t => t.wall && t.wall.done), pool0 = (walled.length ? walled : vil), pool = pool0.filter(fits).length ? pool0.filter(fits) : pool0;
    const srt = pool.slice().sort(kind === 'hurricane' ? (a, b) => a.coastD - b.coastD : (a, b) => b.coastD - a.coastD);
    return srt[(this.r() * Math.min(3, srt.length)) | 0] || null; },
  godDisaster(kind, prefId) { const st = this.godDisasterState(kind); if (!st.ready) return { ok: false, why: st.why }; const gc = this.godCool;
    if (kind === 'volcano') { this.startEruption(); gc.volcano = this.tick + GOD_COOL; this.erupt.god = true; this.stats.godDisasters = (this.stats.godDisasters || 0) + 1;
      this.log(`🌋 A god's hand woke Mount Cinderwrath.`, 'god'); return { ok: true, x: this.erupt.x, z: this.erupt.z, R: this.erupt.R, evac: this.erupt.evac.length }; }
    if (kind !== 'hurricane' && kind !== 'tornado') return { ok: false, why: 'Unknown disaster' };
    const T = this.godStormTarget(kind, prefId); if (!T) return { ok: false, why: 'No village for the storm to hit' };
    const S = this.startStorm(kind, T.id); if (!S) return { ok: false, why: 'The sky would not turn' }; S.god = true; gc.storm = this.tick + GOD_COOL; this.stats.godDisasters = (this.stats.godDisasters || 0) + 1;
    this.log(kind === 'tornado' ? `🌪 A god's hand spun up a tornado over ${T.name}.` : `🌀 A god's hand stirred a hurricane off the coast near ${T.name}.`, 'god');
    return { ok: true, target: T.name, id: T.id, x: T.cx, z: T.cz, coastD: T.coastD }; },
  // debug / test hooks (used by the headless tests and handy from the console)
  forceEruption() { if (this.erupt) return this.erupt; if (this.wx) this.wx = null; this.startEruption(); return this.erupt; },
  forceStorm(kind, targetId) { if (this.wx) return this.wx; this.startStorm(kind, targetId); return this.wx; },
  forceSettlement(fromId) { const from = fromId != null ? this.tribes[fromId] : this.villages().sort((a, b) => b.members.size - a.members.size)[0]; return from ? this.foundSettlement(from, 5, 'full') : null; },
};
