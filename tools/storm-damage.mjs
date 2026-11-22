// v0.14.4 headless check: god-mode hurricane, tornado, volcano and Wreck village
// smash wall segments AND huts, set the vulnerable state, then repairs restore the ring.
import { World, B, W } from '../js/world.js';
import { Sim, DAY } from '../js/sim.js';
import { STORM, STORM_DMG, VULN, ERUPT, GOD_COOL } from '../js/disasters.js';

const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const ok = (m) => console.log('  ok', m);

function morning(s) {
  let n = 0;
  while (!(s.tod >= 0.28 && s.tod < 0.35) && n < DAY * 2) { s.step(); n++; }
}

function finishWalls(s) {
  for (const tr of s.villages()) {
    if (!tr.wall) tr.wall = { cells: s.ringCells(tr), done: false, level: 0, breached: false };
    const want = 2;
    for (const c of tr.wall.cells) {
      const g = s.w.ground[c.z * W + c.x];
      for (let y = 0; y < want; y++) {
        const b = (c.gate && y === 0) ? B.GATE : B.LOG;
        if (s.w.get(c.x, g + y, c.z) === 0) s.w.set(c.x, g + y, c.z, b);
      }
    }
    tr.wall.done = true; tr.wall.level = 1; tr.wall.breached = false;
    tr.jobs = (tr.jobs || []).filter(j => j.type !== 'wall' && j.type !== 'fort' && j.type !== 'repair');
    tr.repairing = null; tr.dmgCause = null; tr.vulnerableUntil = 0;
  }
}

function waitStormStrike(s, max = STORM.WARN + STORM.hurricane + 40) {
  let n = 0;
  while (s.wx && !s.wx.struck && n < max) { s.step(); n++; }
  return n;
}

function waitRepaired(s, tr, max = DAY * 4) {
  const t0 = s.tick;
  while (tr.wall && tr.wall.breached && s.tick - t0 < max) s.step();
  return s.tick - t0;
}

function clearCool(s) {
  s.godCool = { volcano: 0, storm: 0 };
  if (s.wx) s.endStorm();
  if (s.erupt) { s.erupt = null; s.volcanoErupt = false; s.volcanoWarn = false; }
  s.nextStorm = s.tick + 1e7; s.nextEruption = s.tick + 1e7;
}

console.log('Dark Forest v0.14.4 storm-damage test (seed 42)');
const s = new Sim(new World(42), 42);
s.nextEruption = 1e9; s.nextStorm = 1e9;
// step far enough that tribes exist and huts are placed
for (let i = 0; i < DAY * 3; i++) s.step();
s.nextEruption = 1e9; s.nextStorm = 1e9;
finishWalls(s);
morning(s);
const walled = s.villages().filter(t => t.wall && t.wall.done);
console.log('villages', s.villages().length, 'walled', walled.length, 'day', s.day, 'tod', +s.tod.toFixed(3));
if (walled.length < 2) fail('need at least 2 walled villages');

const results = {};

// --- tornado / hurricane via godDisaster (same path as the God tools buttons) ---
for (const kind of ['tornado', 'hurricane']) {
  clearCool(s); finishWalls(s); morning(s);
  const beforeAll = Object.fromEntries(walled.map(t => [t.id, s.wallHurt(t)]));
  const hutsBeforeAll = Object.fromEntries(walled.map(t => [t.id, t.huts.length]));
  const r = s.godDisaster(kind);
  console.log(`\n== god ${kind} ==`, r.ok ? `${r.target} coastD=${r.coastD}` : r.why);
  if (!r.ok) { fail(`${kind} godDisaster failed: ${r.why}`); continue; }
  const n = waitStormStrike(s);
  const T = s.tribes[r.id];
  const hurt = s.wallHurt(T);
  const before = beforeAll[T.id];
  console.log('  strike after', n, 'ticks; wall', hurt);
  if (hurt.broken < Math.ceil(hurt.cells * 0.7)) fail(`${kind}: only ${hurt.broken}/${hurt.cells} segments broken (want >=70%)`);
  else ok(`${kind} broke ${hurt.broken}/${hurt.cells} segments, missing ${hurt.missing} blocks`);
  if (!hurt.breached) fail(`${kind}: wall.breached not set`); else ok(`${kind} breached`);
  if (!hurt.vulnerable) fail(`${kind}: vulnerable window not set`); else ok(`${kind} vulnerableUntil=${hurt.vulnerableUntil} (delay ${hurt.vulnerableUntil - s.tick} ticks, expect ~${VULN.DELAY})`);
  const hb = hutsBeforeAll[T.id] || 0, ha = T.huts.length, smashed = hb - ha;
  console.log('  huts', hb, '->', ha, 'smashed', smashed);
  if (hb < 1) fail(`${kind}: target had no huts to smash (need buildings in the test village)`);
  else if (smashed < 1) fail(`${kind}: smashed no huts (${ha}/${hb} still standing)`);
  else ok(`${kind} smashed ${smashed}/${hb} huts`);
  if (T.repairing) fail(`${kind}: repairs started during the vulnerable window`); else ok(`${kind} repairs held during vulnerable window`);
  // finish the storm, expire vuln, then let them repair
  while (s.wx) s.step();
  if ((T.vulnerableUntil || 0) > s.tick) s.tick = T.vulnerableUntil; // jump the wait, then tick once
  morning(s);
  s.step();
  if (!T.repairing && !(T.jobs[0] && T.jobs[0].urgent)) fail(`${kind}: repair job did not start after vuln window`);
  else ok(`${kind} repair job started (${(T.jobs[0] && T.jobs[0].total) || (T.repairing && T.repairing.total)} gaps)`);
  const took = waitRepaired(s, T);
  const after = s.wallHurt(T);
  console.log('  repaired after', took, 'ticks; wall', after);
  if (after.breached || after.broken > 2) fail(`${kind}: walls not restored (broken=${after.broken} breached=${after.breached})`);
  else ok(`${kind} walls restored`);
  results[kind] = { target: T.name, broken: hurt.broken, cells: hurt.cells, missing: hurt.missing, vuln: VULN.DELAY, repairedTicks: took };
}

// --- Wreck village: park on selected/nearest and smash ---
clearCool(s); finishWalls(s); morning(s);
{
  const T = s.villages().filter(t => t.wall && t.wall.done)[0];
  const wreckHutsBefore = T.huts.length;
  const r = s.godDisaster('wreck', T.id, { x: T.cx, z: T.cz });
  console.log(`\n== god wreck ==`, r.ok ? `${r.target} via ${r.kind}` : r.why);
  if (!r.ok) fail('wreck failed: ' + r.why);
  else {
    if (!s.wx || !s.wx.wreck) fail('wreck did not flag the storm as a wreck strike');
    waitStormStrike(s);
    const hurt = s.wallHurt(s.tribes[r.id]);
    console.log('  wall', hurt);
    if (hurt.broken < Math.ceil(hurt.cells * 0.85)) fail(`wreck: only ${hurt.broken}/${hurt.cells} broken (want >=85%)`);
    else ok(`wreck broke ${hurt.broken}/${hurt.cells} segments`);
    if (!hurt.breached || !hurt.vulnerable) fail('wreck did not leave the village vulnerable');
    else ok('wreck left village breached and vulnerable');
    const wreckSmashed = wreckHutsBefore - s.tribes[r.id].huts.length;
    console.log('  huts', wreckHutsBefore, '->', s.tribes[r.id].huts.length, 'smashed', wreckSmashed);
    if (wreckHutsBefore < 1) fail('wreck: target had no huts');
    else if (wreckSmashed < 1) fail(`wreck: smashed no huts (${s.tribes[r.id].huts.length}/${wreckHutsBefore} still standing)`);
    else ok(`wreck smashed ${wreckSmashed}/${wreckHutsBefore} huts`);
    results.wreck = { target: r.target, kind: r.kind, broken: hurt.broken, cells: hurt.cells, missing: hurt.missing, hutsBefore: wreckHutsBefore, hutsSmashed: wreckSmashed };
  }
}

// --- volcano ---
clearCool(s); finishWalls(s); morning(s);
{
  const hutsBeforeVolc = Object.fromEntries(s.villages().map(t => [t.id, t.huts.length]));
  const r = s.godDisaster('volcano');
  console.log(`\n== god volcano ==`, r.ok ? `R=${r.R} evac=${r.evac}` : r.why);
  if (!r.ok) fail('volcano failed: ' + r.why);
  else {
    // skip the warn phase
    let n = 0; while (s.erupt && s.erupt.phase === 'warn' && n < ERUPT.WARN + 20) { s.step(); n++; }
    const hits = s.villages().map(t => ({ name: t.name, id: t.id, d: Math.hypot(t.cx - r.x, t.cz - r.z), huts: t.huts.length, hutsBefore: hutsBeforeVolc[t.id] || 0, ...s.wallHurt(t) })).filter(h => h.broken > 0 || h.breached || h.hutsBefore > h.huts);
    hits.sort((a, b) => a.d - b.d);
    console.log('  damaged villages', hits.map(h => `${h.name} d=${h.d.toFixed(0)} broken=${h.broken}/${h.cells} miss=${h.missing} vuln=${h.vulnerable}`).join(' | ') || '(none)');
    if (!hits.length) fail('volcano smashed no walls');
    else {
      const near = hits[0];
      if (near.broken < Math.ceil(near.cells * 0.7)) fail(`volcano near crater: only ${near.broken}/${near.cells} broken at ${near.name}`);
      else ok(`volcano wrecked ${near.name} at d=${near.d.toFixed(0)}: ${near.broken}/${near.cells} segments`);
      if (!near.breached || !near.vulnerable) fail('volcano did not set vulnerable/breached');
      else ok('volcano left at least the nearest village vulnerable');
    }
    const hutHits = s.villages().map(t => ({ name: t.name, before: hutsBeforeVolc[t.id] || 0, after: t.huts.length, smashed: (hutsBeforeVolc[t.id] || 0) - t.huts.length })).filter(h => h.smashed > 0);
    console.log('  huts smashed', hutHits.map(h => `${h.name} ${h.before}->${h.after}`).join(' | ') || '(none)');
    if (!hutHits.length) fail('volcano smashed no huts');
    else ok(`volcano smashed huts in ${hutHits.length} village(s)`);
    results.volcano = { evac: r.evac, R: r.R, hits: hits.map(h => ({ name: h.name, d: +h.d.toFixed(1), broken: h.broken, cells: h.cells })), hutHits };
  }
}

console.log('\nSTORM_DMG', JSON.stringify(STORM_DMG));
console.log('VULN', JSON.stringify(VULN));
console.log('RESULTS', JSON.stringify(results, null, 2));
if (process.exitCode) console.log('\nSOME CHECKS FAILED');
else console.log('\nALL CHECKS PASSED');
