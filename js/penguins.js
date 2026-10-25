// Penguin minions of 83 Kingsway: night scouts for the vampires, day recruiters for BlackCardU.
// Rules: penguins never enter huts, never kill; vampires never attack them. The mansion has 10 penguin bedrooms (separate from the vampires' rooms).
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
export const BEDROOMS = 10;
const PNAMES = ['Pip', 'Waddles', 'Tux', 'Flipper', 'Nugget', 'Pebble', 'Sleet', 'Biscuit', 'Gus', 'Puddle'];
export const PenguinMixin = {
  penguins() { return this.ents.filter(e => e.kind === 'p' && e.alive); },
  spawnPenguin(x, z, name, from) {
    const e = { id: this.nid++, kind: 'p', name: name || PNAMES[(this.pIdx = (this.pIdx || 0) + 1) - 1] || 'Penguin ' + this.nid, x, z, px: x, pz: z, y: this.w.top(x | 0, z | 0), dir: 0, hp: 60, maxhp: 60,
      act: null, path: null, stuck: 0, pathCool: 0, alive: true, walk: 0, cool: 0, conv: 0, spots: 0, convDay: 0, state: 'resting', from: from || null, scare: 0 };
    this.ents.push(e); this.byId.set(e.id, e); return e;
  },
  initPenguins() { const m = this.w.mansion; for (let i = 0; i < 3; i++) this.spawnPenguin(m.x + this.rnd(-3, 3), m.z + 3 + this.rnd(-1, 1)); this.spawnTumnus(); this.pstats = { slack: 0, caught: 0, snitchSpots: 0, tConv: 0, assignments: 0, conversions: 0, spots: 0, spotKills: 0, shooed: 0, pitches: 0, refusals: 0, perDay: {} }; this.bedsFullLogged = false; },
  spawnTumnus() { const m = this.w.mansion; const e = { id: this.nid++, kind: 'm', name: 'Ian Tumnus', x: m.x + 2, z: m.z + 4, px: m.x + 2, pz: m.z + 4, y: 0, dir: 0, hp: 999, maxhp: 999, act: null, path: null, stuck: 0, pathCool: 0, alive: true, walk: 0, cool: 0, conv: 0, state: 'resting', orders: 'none yet', visit: 0 };
    this.ents.push(e); this.byId.set(e.id, e); this.tumnus = e; return e; },
  tribeNeed(tr) { let s = 0; for (const e of this.members(tr)) { if (e.hunger > 55) s += 2; if (this.rep(e) < -15) s += 2; if (e.fear > 50) s += 1; } for (const e of this.ents) if (e.kind === 't' && e.alive && (e.exile || e.tribe == null) && dist(e.x, e.z, tr.cx, tr.cz) < 40) s += 4; return s + (tr.stock.food < 3 ? 3 : 0); },
  giveOrders(night) { const T = this.tumnus; if (!T || !T.alive) return; const ps = this.penguins(); if (!ps.length) return;
    const full = ps.length >= BEDROOMS, trs = this.tribes.filter(t => t.alive && t.members.size).map(t => [t, this.tribeNeed(t)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const parts = []; ps.forEach((p, i) => { const tr = trs[i % Math.max(1, Math.min(trs.length, night ? trs.length : 2 + (i >> 2)))]; if (!tr) return; const where = night ? this.w.regionAt(tr.cx + this.rnd(-20, 20), tr.cz + this.rnd(-20, 20)).replace(/^the /, '') : tr.name;
      const dbl = night && p.order && p.order.double; p.order = { tr, night, double: dbl, scoutOnly: !night && full, label: dbl ? 'double scouting (punishment)' : night ? 'scout ' + where : (full ? 'scout ' : 'recruit in ') + tr.name }; parts.push(`${p.name} to ${night ? 'the ' + where : tr.name}`); });
    this.pstats.assignments++; T.orders = parts.join(', ');
    if (!night && full) this.log(`Every bedroom at 83 Kingsway is full, so Ian Tumnus switched the penguins to scouting only.`, 'vamp');
    this.log(night ? `Ian Tumnus assigned tonight's scouting: ${parts.join(', ')}.` : `Ian Tumnus handed out the day's assignments: ${parts.join(', ')}.`, 'vamp'); },
  updateM(T) { // the Penguin Manager: not a vampire, unhurt by sun, never enters huts, never attacked
    const t = this.tod, pv = this.prevTod ?? t; this.prevTod = t; const m = this.w.mansion;
    if (pv < 0.27 && t >= 0.27) this.giveOrders(false); if (pv < 0.8 && t >= 0.8) this.giveOrders(true);
    const day = !this.isNight() && t > 0.27 && t < 0.64, pdk = this.day;
    // personally pitch to exiles / refused outcasts with his parcel
    if (day && !T.pitch && T.convDay !== pdk && this.penguins().length < BEDROOMS && (this.pstats.perDay[pdk] || 0) < 2 && this.penguins().length < this.convCap()) {
      let best = null, bd = 90; for (const e of this.ents) if (e.kind === 't' && e.alive && !e.inHut && !e.bcu && !e.hidden && (e.exile || e.tribe == null) && e.tPitchDay !== pdk) { const d = dist(e.x, e.z, T.x, T.z); if (d < bd) { bd = d; best = e; } }
      if (best) { best.tPitchDay = pdk; T.pitch = { e: best, t: 0, walk: 0 }; } }
    if (T.pitch) { const P = T.pitch, e = P.e; if (!e.alive || e.inHut || e.bcu || !day) { T.pitch = null; return; }
      if (dist(T.x, T.z, e.x, e.z) > 1.5) { T.state = 'walking to ' + e.name; if (++P.walk > 1200) T.pitch = null; else this.moveTo(T, e.x, e.z, 0.24, 1.2); return; }
      T.state = 'pitching'; T.dir = Math.atan2(e.x - T.x, e.z - T.z); if (P.t === 0) { e.act = { type: 'listen', p: T, t: 60 }; this.pstats.pitches++; } if (++P.t < 60) return; T.pitch = null;
      if (this.r() < Math.min(0.75, this.pitchChance(e) + 0.3)) { T.conv++; T.convDay = pdk; this.pstats.tConv++; this.pstats.conversions++; this.pstats.perDay[pdk] = (this.pstats.perDay[pdk] || 0) + 1;
        if (e.hidden) this.leaveSpot(e); if (e.tribe != null) { const tr = this.tribes[e.tribe]; tr.members.delete(e.id); e.tribe = null; this.assignHomes(tr); } e.bcu = true; e.exile = false; e.act = { type: 'bcu', t: 0 };
        this.log(`Ian Tumnus handed ${e.name} a brown paper parcel and a BlackCardU brochure. ${e.name} set off for 83 Kingsway.`, 'vamp'); }
      else { this.pstats.refusals++; e.act = null; this.log(`${e.name} turned down Ian Tumnus and his parcel.`, 'social'); } return; }
    // snitching: catch slacking penguins and Thronglets outside at night
    if ((this.tick + T.id) % 8 === 0) { for (const p of this.penguins()) if (p.slack && dist(p.x, p.z, T.x, T.z) < 10) this.catchSlacker(T, p);
      if (this.isNight() && !(T.cool > this.tick)) for (const e of this.ents) { if (e.kind !== 't' || !e.alive || e.inHut || e.bcu || this.safeAt(e.x, e.z) || dist(e.x, e.z, T.x, T.z) > 11) continue; if (e.hidden && this.r() > (1 - e.hidden.conceal) * 0.3) continue;
        const v = this.vamps().filter(v => v.hp > 45 && v.state !== 'retreat').sort((a, b) => dist(a.x, a.z, e.x, e.z) - dist(b.x, b.z, e.x, e.z))[0]; if (!v) break; v.assign = { type: 'hunt', e, fx: 0, fz: 0 }; e.spottedAt = this.tick; T.cool = this.tick + 300; T.snitches = (T.snitches || 0) + 1; T.snitchAt = this.tick; this.pstats.snitchSpots++; v.alert = this.tick;
        this.log(`Ian Tumnus spotted ${e.exile ? 'exile ' : ''}${e.name} ${this.placeName(e.x, e.z)} on his rounds and snitched to ${v.name}.`, 'vamp'); break; } }
    // inspection trip into the field (after every 2 parade loops)
    if (T.insp) { const p = T.insp.p; if (!p.alive || ++T.insp.t > 1100 || dist(p.x, p.z, m.x, m.z) < 10) { T.insp = null; } else { T.state = 'inspecting ' + p.name; if (this.moveTo(T, p.x + 1, p.z, 0.26, 2) || dist(T.x, T.z, p.x, p.z) < 2.5) { if ((T.vt = (T.vt || 0) + 1) > 50) { T.vt = 0; T.insp = null; } } return; } }
    // default: parade the 83 Kingsway grounds in a loop (gardens, gate, perimeter)
    const WP = [[0, 9], [8, 7], [11, 0], [8, -8], [0, -11], [-8, -8], [-11, 0], [-8, 7]]; T.state = 'parading the grounds';
    const wp = WP[(T.wp || 0) % WP.length]; if (this.moveTo(T, m.x + wp[0], m.z + wp[1], 0.17, 1.4) || ++T.wpt > 400) { T.wpt = 0; T.wp = (T.wp || 0) + 1; if (T.wp % WP.length === 0) { T.laps = (T.laps || 0) + 1;
      if (T.laps % 2 === 0) { const ps = this.penguins().filter(p => dist(p.x, p.z, m.x, m.z) > 12 && dist(p.x, p.z, m.x, m.z) < 90); if (ps.length) { T.insp = { p: ps[T.laps / 2 % ps.length | 0], t: 0 }; } } } } },
  catchSlacker(T, p) { const what = p.slack.kind; p.slack = null; T.snitchAt = this.tick; T.caught = (T.caught || 0) + 1; this.pstats.caught++; p.alert = this.tick;
    const v = this.vamps().find(v => v.name === 'Stefan') || this.vamps()[0]; if (v) v.alert = this.tick; const who = v ? v.name : 'the vampires';
    const pun = this.r() < 0.5 ? 'summon' : 'double';
    if (pun === 'summon') { p.summon = { w: 0 }; } else { p.order = { ...(p.order || {}), night: true, double: true, tr: (p.order && p.order.tr) || this.tribes.find(t => t.alive), label: 'double scouting (punishment)' }; p.noSlack = this.tick + 3 * 1200; }
    this.log(`Ian Tumnus caught ${p.name} ${what} ${this.placeName(p.x, p.z)} and snitched to ${who}. ${pun === 'summon' ? `${p.name} was summoned to 83 Kingsway for a scolding and loses tomorrow's outing.` : `${who} ordered ${p.name} to do double scouting tonight.`}`, 'vamp'); },
  nearT(p) { const T = this.tumnus; return T && T.alive && dist(T.x, T.z, p.x, p.z) < 8; },
  convCap() { return Math.min(BEDROOMS, Math.max(3, Math.floor(this.thronglets().length * 0.2))); },
  pitchChance(e) { // well-fed, respected members mostly refuse; exiles, outcasts, hungry, disliked or frightened ones are easier
    const rep = this.rep(e); let c = 0.06;
    if (e.exile || e.tribe == null) c += 0.4; if (e.refusedAll) c += 0.15; if (e.hunger > 55) c += 0.15; if (rep < -15) c += 0.12; if (e.fear > 50) c += 0.05; if (e.tribe != null && this.tribes[e.tribe].stock.food < 3) c += 0.06;
    if (e.hunger < 40 && rep > 15) c *= 0.25; return Math.min(0.55, c * (1.2 - e.traits.loyalty * 0.5)); },
  updateP(p) {
    const m = this.w.mansion, t = this.tod, night = this.isNight(), day = !night && t > 0.27 && t < 0.64;
    if (p.cool > 0) p.cool--; if (night && p.order && p.order.double) p.cool = Math.max(0, p.cool - 1);
    if (p.scare > 0) { p.scare--; p.state = 'returning'; this.moveTo(p, m.x, m.z + 3, 0.28, 2); return; }
    if (p.summon) { p.state = p.summon.at ? 'scolded' : 'summoned'; p.pitch = null; if (!p.summon.at) { if (this.moveTo(p, m.x, m.z + 3, 0.3, 1.5) || dist(p.x, p.z, m.x, m.z + 3) < 2.5 || ++p.summon.w > 900) p.summon.at = this.tick; } else if (this.tick - p.summon.at > 90) { p.grounded = this.day + (t > 0.5 ? 1 : 0); p.noSlack = this.tick + 3 * 1200; p.summon = null; } return; }
    if (p.grounded === this.day && !night) { p.state = 'grounded'; p.pitch = null; this.moveTo(p, m.x + ((p.id % 5) - 2), m.z + 3, 0.2, 1.5); return; }
    if (p.slack) { const S = p.slack; p.state = S.kind; if (S.kind === 'sliding') { const nx = p.x + Math.cos(S.a) * 0.12, nz = p.z + Math.sin(S.a) * 0.12; if (this.passable(p, p.x | 0, p.z | 0, nx | 0, nz | 0)) { p.x = nx; p.z = nz; p.walk += 0.12; p.dir = Math.atan2(Math.cos(S.a), Math.sin(S.a)); } else S.a += 2; }
      if (--S.t <= 0) p.slack = null; return; }
    if ((day || night) && !(p.noSlack > this.tick) && dist(p.x, p.z, m.x, m.z) > 12 && this.r() < 1 / 3000) { let water = false; for (let r = 1; r < 4 && !water; r++) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (this.w.water[(((p.z | 0) + dz) * 512) + (p.x | 0) + dx]) water = true;
      const kind = water ? 'fishing' : this.r() < 0.5 ? 'napping' : 'sliding'; p.slack = { kind, t: 260 + (this.r() * 200 | 0), a: this.rnd(6.28) }; p.pitch = null; this.pstats.slack++; return; }
    if (night) { p.pitch = null;
      // scouting: waddle between regions near the villages, looking for anyone outside
      if (p.sig) { p.state = 'signalling'; if (--p.sig.t <= 0) p.sig = null; return; }
      p.state = 'scouting';
      const vs = this.tribes.filter(tr => tr.alive && tr.members.size);
      if (!p.prowl || dist(p.x, p.z, p.prowl.x, p.prowl.z) < 2 || (p.prowl.t = (p.prowl.t || 0) + 1) > 500) { const tv = (p.order && p.order.night && p.order.tr.alive) ? p.order.tr : vs[(this.r() * vs.length) | 0]; const a = this.rnd(6.28), R = this.rnd(14, 34); p.prowl = tv ? { x: tv.cx + Math.cos(a) * R, z: tv.cz + Math.sin(a) * R } : { x: m.x + this.rnd(-60, 60), z: m.z + this.rnd(-60, 60) }; }
      this.moveTo(p, p.prowl.x, p.prowl.z, 0.22, 1.5);
      if ((this.tick + p.id) % 10 === 0 && p.cool <= 0) for (const e of this.ents) { if (e.kind !== 't' || !e.alive || e.inHut || e.bcu || this.safeAt(e.x, e.z)) continue; const d = dist(e.x, e.z, p.x, p.z); if (d > (this.nearT(p) ? 15 : 12)) continue;
        if (e.hidden && this.r() > (1 - e.hidden.conceal) * (this.nearT(p) ? 0.32 : 0.25) * (this.storm ? 0.5 : 1)) continue; // well hidden: unseen
        const vs2 = this.vamps().filter(v => v.hp > 45 && v.state !== 'retreat' && !(v.assign && v.assign.type === 'hunt' && v.assign.e.alive)); const v = vs2.sort((a, b) => dist(a.x, a.z, e.x, e.z) - dist(b.x, b.z, e.x, e.z))[0] || this.vamps()[0]; if (!v) break;
        v.assign = { type: 'hunt', e, fx: 0, fz: 0 }; e.spottedAt = this.tick; e.spottedBy = p.name; p.spots++; this.pstats.spots++; p.cool = 250; p.sig = { t: 30 };
        this.log(`A penguin, ${p.name}, spotted ${e.exile ? 'exile ' : ''}${e.name} ${this.placeName(e.x, e.z)} and flapped for ${v.name}.`, 'vamp'); break; }
      return; }
    if (!day) { p.pitch = null; p.state = dist(p.x, p.z, m.x, m.z) < 4 ? 'resting' : 'returning'; this.moveTo(p, m.x + ((p.id % 5) - 2), m.z + 3, 0.24, 1.5); return; }
    // recruiting
    const full = this.penguins().length >= BEDROOMS;
    if (full && !this.bedsFullLogged) { this.bedsFullLogged = true; this.log(`Every bedroom at 83 Kingsway is full (${BEDROOMS}/${BEDROOMS}). BlackCardU recruiting is paused.`, 'vamp'); }
    if (!full) this.bedsFullLogged = false;
    const pdk = this.day, today = this.pstats.perDay[pdk] || 0;
    if (full && p.order && p.order.tr && p.order.tr.alive) { p.pitch = null; p.state = 'scouting'; const O = p.order.tr; if (!p.prowl || dist(p.x, p.z, p.prowl.x, p.prowl.z) < 2) { const a = this.rnd(6.28); p.prowl = { x: O.cx + Math.cos(a) * 18, z: O.cz + Math.sin(a) * 18 }; } this.moveTo(p, p.prowl.x, p.prowl.z, 0.2, 1.5); return; }
    if (full || p.convDay === pdk || today >= 2 || this.penguins().length >= this.convCap()) { p.pitch = null; p.state = 'resting'; this.moveTo(p, m.x + ((p.id % 5) - 2), m.z + 3, 0.2, 1.5); return; }
    let P = p.pitch;
    if (P && (!P.e.alive || P.e.inHut || P.e.bcu)) P = p.pitch = null;
    if (!P) { let best = null, bs = -1e9; for (const e of this.ents) { if (e.kind !== 't' || !e.alive || e.inHut || e.bcu || e.pitchedDay === pdk || e.hidden) continue; const s = this.pitchChance(e) * 200 - dist(e.x, e.z, p.x, p.z) / 3 + (p.order && !p.order.night && e.tribe === p.order.tr.id ? 40 : 0); if (s > bs) { bs = s; best = e; } }
      if (!best) { p.state = 'recruiting'; return; } P = p.pitch = { e: best, t: 0 }; best.pitchedDay = pdk; }
    const e = P.e; p.state = 'recruiting';
    if (dist(p.x, p.z, e.x, e.z) > 1.4) { if (++P.walk > 900) p.pitch = null; else this.moveTo(p, e.x, e.z, 0.22, 1.1); P.walk = (P.walk || 0); return; }
    p.state = 'pitching'; p.dir = Math.atan2(e.x - p.x, e.z - p.z); if (P.t === 0) { e.act = { type: 'listen', p, t: 45 }; this.pstats.pitches++; }
    if (++P.t < 45) return;
    p.pitch = null;
    if (e.tribe != null && e.traits.bravery > 0.72 && !e.exile && this.r() < 0.6) { p.scare = 160; this.pstats.shooed++; e.act = null; this.log(`${e.name} shooed ${p.name} the penguin out of ${this.tribes[e.tribe].name}, brochure and all.`, 'social'); return; }
    if (this.r() < this.pitchChance(e) * (this.nearT(p) ? 1.3 : 1)) {
      p.convDay = pdk; p.conv++; this.pstats.conversions++; this.pstats.perDay[pdk] = today + 1;
      if (e.hidden) this.leaveSpot(e); if (e.tribe != null) { const tr = this.tribes[e.tribe]; tr.members.delete(e.id); e.tribe = null; this.assignHomes(tr); }
      e.bcu = true; e.exile = false; e.act = { type: 'bcu', t: 0 };
      this.log(`${e.name} accepted a BlackCardU brochure from ${p.name} and set off for 83 Kingsway.`, 'vamp');
    } else { this.pstats.refusals++; e.act = null; }
  },
  bcuWalk(e) { const m = this.w.mansion, a = e.act; e.state = 'toMansion';
    if (this.moveTo(e, m.x, m.z + 3, 0.22, 1.6) || dist(e.x, e.z, m.x, m.z + 3) < 2.5 || ++a.t > 1500) {
      e.alive = false; e.died = this.tick; e.gone = true; const p = this.spawnPenguin(m.x + this.rnd(-2, 2), m.z + 3, e.name, e.name); p.conv = 0;
      this.log(`${e.name} accepted a BlackCardU brochure and waddled off to 83 Kingsway as a penguin. (${this.penguins().length}/${BEDROOMS} bedrooms)`, 'vamp'); } },
};
