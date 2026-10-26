// Dark Forest v0.2 — Canvas 2D top-down pixel renderer, camera, touch/mouse input, UI
import { World, W, D } from './world.js';
import { Sim, DAY, TPS } from './sim.js';
import { Renderer } from './render2d.js';

const canvas = document.getElementById('c');
const R = new Renderer(canvas);
let renderScale = Math.min(window.devicePixelRatio || 1, 1.5);
let world, sim;
// ---------- camera (2D): dist = tiles visible vertically ----------
const cam = { tx: 256, tz: 256, dist: 40, pitch: 0, yaw: 0, follow: null, MIN: 6, MAX: 600, get scale() { return innerHeight / this.dist; } };
function applyCam(dt) {
  if (cam.follow) { const e = cam.follow; if (!e.alive) cam.follow = null; else { const k = Math.min(1, dt * 6); cam.tx += ((e.rx ?? e.x) - cam.tx) * k; cam.tz += ((e.rz ?? e.z) - cam.tz) * k; } }
  cam.dist = Math.max(cam.MIN, Math.min(cam.MAX, cam.dist)); cam.tx = Math.max(0, Math.min(W, cam.tx)); cam.tz = Math.max(0, Math.min(D, cam.tz));
}
const toWorld = (sx, sy) => ({ x: cam.tx + (sx - innerWidth / 2) / cam.scale, z: cam.tz + (sy - innerHeight / 2) / cam.scale });
const screenOf = e => [innerWidth / 2 + ((e.rx ?? e.x) - cam.tx) * cam.scale, innerHeight / 2 + ((e.rz ?? e.z) - 0.2 - cam.tz) * cam.scale];
// ---------- input (Pointer Events) ----------
const ptrs = new Map(); let gesture = null, mode = 'select';
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() }); if (ptrs.size === 2) gesture = twoInfo(); });
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 1) { if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) < 8) return; p.moved = true; pan(dx, dy); }
  else if (ptrs.size === 2) { const g = twoInfo(); if (gesture) { zoomAt(gesture.d / Math.max(10, g.d), g.cx, g.cy); pan(g.cx - gesture.cx, g.cy - gesture.cy); } gesture = g; for (const q of ptrs.values()) q.moved = true; }
});
const endPtr = e => { const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId); if (ptrs.size < 2) gesture = null;
  if (!p.moved && e.type === 'pointerup' && performance.now() - p.t < 600 && ptrs.size === 0) tap(e.clientX, e.clientY); };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY); }, { passive: false });
function zoomAt(f, sx, sy) { const before = toWorld(sx, sy); cam.dist = Math.max(cam.MIN, Math.min(cam.MAX, cam.dist * f)); const after = toWorld(sx, sy); if (!cam.follow) { cam.tx += before.x - after.x; cam.tz += before.z - after.z; } }
function twoInfo() { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; }
function pan(dx, dy) { if (cam.follow) { cam.follow = null; updateFollowUI(); } cam.tx -= dx / cam.scale; cam.tz -= dy / cam.scale; }
const keys = new Set(); addEventListener('keydown', e => keys.add(e.key.toLowerCase())); addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function keyMove(dt) { const sp = cam.dist * 0.9 * dt; let fx = 0, fz = 0; if (keys.has('w') || keys.has('arrowup')) fz -= 1; if (keys.has('s') || keys.has('arrowdown')) fz += 1; if (keys.has('a') || keys.has('arrowleft')) fx -= 1; if (keys.has('d') || keys.has('arrowright')) fx += 1;
  if (fx || fz) { if (cam.follow) { cam.follow = null; updateFollowUI(); } cam.tx += fx * sp; cam.tz += fz * sp; } if (keys.has('q') || keys.has('-')) cam.dist *= 1 + dt; if (keys.has('e') || keys.has('=')) cam.dist /= 1 + dt; }
function pickEntity(cx, cy) { let best = null, bd = 44; for (const e of sim.ents) { if (!e.alive || e.inHut) continue; const [sx, sy] = screenOf(e); const d = Math.hypot(sx - cx, sy - cy - (e.kind === 'v' ? -cam.scale * 0.6 : e.kind === 'p' ? -cam.scale * 0.4 : e.kind === 'm' ? -cam.scale * 0.6 : 0)); if (d < bd) { bd = d; best = e; } } return best; }
function tap(x, y) {
  if (mode === 'select') { const e = pickEntity(x, y); if (e) select(e, true); else { const h = toWorld(x, y), m = world.mansion; let hut = null; for (const tr of sim.tribes) for (const hh of tr.huts) if (Math.abs(h.x - hh.x - 0.5) < 2 && h.z > hh.z - 2.5 && h.z < hh.z + 2.2) hut = { kind: 'hut', alive: true, h: hh, tr, name: tr.name + ' hut' };
    if (hut) select(hut, false); else if (Math.abs(h.x - m.x) < 10 && h.z > m.z - 12 && h.z < m.z + 10) select({ kind: 'house', alive: true, name: '83 Kingsway' }, false); else select(null); } return; }
  const h = toWorld(x, y); if (!world.inb(h.x | 0, h.z | 0)) return;
  if (mode === 'spawn') { const e = sim.godSpawn(h.x, h.z); select(e, false); }
  else if (mode === 'spawnP') { const e = sim.godPenguin(h.x, h.z); if (e) select(e, false); }
  else if (mode === 'spawnV') { const e = sim.godVampire(h.x, h.z); if (e) select(e, false); }
  else if (mode.startsWith('drop:')) sim.godDrop(mode.slice(5), h.x, h.z);
}
// ---------- UI ----------
const $ = s => document.querySelector(s);
let selected = null;
function select(e, follow) { selected = e; $('#insp').classList.toggle('hidden', !e); if (e && follow) { cam.follow = e; if (cam.dist > 40) cam.dist = 22; } updateFollowUI(); renderInspector(); }
function updateFollowUI() { $('#btnUnfollow').classList.toggle('on', !cam.follow); }
document.querySelectorAll('.panel').forEach(p => { p.querySelector('.tab').onclick = () => p.classList.remove('collapsed'); const c = p.querySelector('.collapse'); if (c) c.onclick = () => p.classList.add('collapsed'); });
$('#hideAll').onclick = () => { $('#ui').classList.toggle('hideall'); $('#hideAll').classList.toggle('on'); };
let speed = 1; function setSpeed(s) { speed = s; document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s)); }
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
const HINTS = { select: 'Tap a creature to follow it. Drag to pan; wheel or pinch to zoom; two fingers to pan.', spawn: 'Tap the ground to place a new Thronglet.', spawnP: 'Tap the ground to place a penguin (max 10 — one per mansion bedroom).', spawnV: 'Tap the ground to summon a vampire. It lives at 83 Kingsway (vampire rooms are separate from the 10 penguin bedrooms). By day it returns home.' };
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach(o => o.classList.toggle('on', o === b)); $('#modeHint').textContent = HINTS[mode] || `Tap the ground to drop ${mode.slice(5)}.`; });
$('#btnTumnus').onclick = () => { if (sim.tumnus && sim.tumnus.alive) select(sim.tumnus, true); };
$('#btnUnfollow').onclick = () => { cam.follow = null; updateFollowUI(); };
$('#btnReset').onclick = () => reset(+$('#seed').value || 1);
$('#btnFull').onclick = async () => { try { if (!document.fullscreenElement) { await (document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) ?? document.documentElement.webkitRequestFullscreen?.()); try { await screen.orientation?.lock?.('landscape'); } catch (_) { } } else await document.exitFullscreen(); } catch (_) { } };
function addLogLine(L) { const d = document.createElement('div'); d.className = 'k-' + L.kind; d.textContent = L.text; const list = $('#logList'); list.prepend(d); while (list.childElementCount > 150) list.lastChild.remove(); }
const fmt = v => (v > 0 ? '+' : '') + v.toFixed(0);
function bar(label, v, c) { return `${label}<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></div>`; }
function renderInspector() {
  const e = selected; if (!e) return; const body = $('#inspBody');
  if (e.kind === 'house') { $('#inspTitle').textContent = '🏚 83 Kingsway'; const vs = sim.vamps().filter(v => v.alive); const home = vs.filter(v => Math.hypot(v.x - world.mansion.x, v.z - world.mansion.z) < 10).length;
    body.innerHTML = `<img src="assets/kingsway.jpg" alt="83 Kingsway" style="width:100%;border:2px solid #5a3a22;border-radius:4px;image-rendering:pixelated"><br>📍 <b>The Haunted Heart</b> · Stefan's old home<br>Vampires: <b>${vs.length}</b> (${home} at home)<br>🐧 Penguin bedrooms: <b>${sim.penguins().length}/10</b> used · BlackCardU converts: ${sim.pstats.conversions}${sim.storm && sim.isNight() ? '<br>⛈ <b>Storm tonight</b> — the rain masks noise; hiders are harder to find.' : ''}<br><i>A light is always on at 83 Kingsway.</i>`; return; }
  if (e.kind === 'hut') { const h = e.h, cap = sim.hutCap(h), occ = [...h.occ].map(id => sim.byId.get(id)).filter(Boolean), own = h.owners.map(id => sim.byId.get(id)).filter(Boolean);
    $('#inspTitle').textContent = '🛖 ' + e.tr.name + ' hut'; body.innerHTML = `📍 <b>${e.tr.name}</b> · ${h.level >= 2 ? 'stone' : 'timber'} hut<br>Inside: <b>${occ.length}/${cap}</b>${occ.length ? ' — ' + occ.map(o => o.name).join(', ') : ''}<br>Sleeps here: ${own.map(o => o.name).join(', ') || '—'}<br>🔒 Safe inside — vampires never enter a hut.`; return; }
  if (!e.alive) { $('#inspTitle').textContent = e.name + ' †'; body.innerHTML = '<i>Deceased.</i>'; return; }
  if (e.kind === 'm') { $('#inspTitle').textContent = '🧣 Ian Tumnus'; body.innerHTML = `<img class="portrait" src="assets/tumnus.png" alt="">📍 <b>${Math.hypot(e.x - world.mansion.x, e.z - world.mansion.z) < 14 ? '83 Kingsway grounds' : world.regionAt(e.x, e.z).replace(/^the /, '')}</b><br>Role: <b>Penguin Manager, BlackCardU</b><br>Doing: <b>${e.state}</b><br>Current orders: ${e.orders}<br>Penguins managed: <b>${sim.penguins().length}</b> (${sim.penguins().length}/10 bedrooms)<br>His conversions: <b>${e.conv}</b> · Penguins caught slacking: <b>${e.caught || 0}</b> · Thronglets snitched: ${e.snitches || 0}<br><i>Not a vampire: unhurt by the sun, never enters huts, has his own room at 83 Kingsway.</i>`; return; }
  if (e.kind === 'p') { $('#inspTitle').textContent = '🐧 ' + e.name; const ST = { napping: 'napping (slacking!)', sliding: 'belly-sliding (slacking!)', fishing: 'fishing (slacking!)', summoned: 'summoned to 83 Kingsway', scolded: 'being scolded', grounded: 'grounded — no outing today', scouting: 'scouting for prey', signalling: 'signalling a vampire', recruiting: 'recruiting for BlackCardU', pitching: 'pitching BlackCardU', returning: 'returning to 83 Kingsway', resting: 'resting at 83 Kingsway' };
    body.innerHTML = `<img class="portrait" src="assets/penguin.png" alt="">📍 <b>${world.regionAt(e.x, e.z).replace(/^the /, '')}</b><br>State: <b>${ST[e.state] || e.state}</b>${e.pitch ? ' → ' + e.pitch.e.name : ''}<br>Conversions: <b>${e.conv}</b> · Prey spotted: ${e.spots}<br>${e.order ? 'Orders: ' + e.order.label + '<br>' : ''}${e.from ? '<i>Once the Thronglet ' + e.from + '.</i><br>' : ''}Bedroom at 83 Kingsway (${sim.penguins().length}/10 used)<br><i>A BlackCardU minion. Never enters huts, never kills.</i>`; return; }
  if (e.kind === 'v') { $('#inspTitle').textContent = '🧛 ' + e.name; body.innerHTML = `<img class="portrait" src="assets/stefan.png" alt="">📍 <b>${Math.hypot(e.x - world.mansion.x, e.z - world.mansion.z) < 14 ? '83 Kingsway · ' : ''}${world.regionAt(e.x, e.z).replace(/^the /, '')}</b>${e.bat ? ' · 🦇 bat form' : ''}<br>${bar('Blood (HP) ' + e.hp.toFixed(0), e.hp / e.maxhp * 100, '#c22')}State: <b>${e.state}</b>${e.assign && e.assign.e && !e.batHome && !e.hideout ? ' → ' + e.assign.e.name : ''}<br>${e.batHome ? '🦇 <b>Bat form, flying home</b>' + (e.homePlan && e.homePlan.h ? ' → ' + e.homePlan.h.name : ' → 83 Kingsway') + '<br>' : e.inMansion ? '🏚️ <b>Resting inside 83 Kingsway</b> until dusk<br>' : e.hideout ? '🪨 <b>Resting in ' + e.hideout.name + '</b> — safe from the sun until dusk<br>' : ''}${e.hideout || e.batHome ? '' : sim.inShade(e.x, e.z) ? (sim.isNight() ? '🌑 In the mansion\'s shadow<br>' : '🛡️ <b>Safe in the mansion\'s shadow</b> — the sun can\'t touch it here<br>') : (!sim.vampNight() && sim.dayAmt() > 0.25 && !e.bat && !e.batHome ? '☀️ <b>Burning in the sun!</b><br>' : '')}Kills: ${e.kills}${e.turned ? '<br><i>A turned Thronglet.</i>' : ''}`; return; }
  const tr = e.tribe != null ? sim.tribes[e.tribe] : null; const rep = sim.rep(e);
  $('#inspTitle').textContent = `🐾 ${e.name}${tr && tr.chief === e.id ? ' 👑' : ''}`;
  const rel = [...e.op.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([id, v]) => { const o = sim.byId.get(id); return o ? `<span style="color:${v < 0 ? '#f88' : '#8f8'}">${o.name} ${fmt(v)}</span>` : ''; }).join(', ');
  let rank = ''; if (tr) { const m = sim.members(tr).map(o => [o, sim.rep(o)]).sort((a, b) => b[1] - a[1]); rank = ` · rank ${m.findIndex(q => q[0] === e) + 1}/${m.length}`; }
  const inv = Object.entries(e.inv).filter(([, v]) => v).map(([k, v]) => `${k}×${v}`).join(' ') || 'empty';
  const hidTxt = e.hidden ? `<br>🫥 Hidden in the <b>${e.hidden.label}</b> (concealment ${(e.hidden.conceal * 100) | 0}%, ${e.hidden.occ.size}/${e.hidden.cap})` : '';
  body.innerHTML = `<img class="portrait" src="assets/thronglet.png" alt="">📍 <b>${Math.hypot(e.x - world.mansion.x, e.z - world.mansion.z) < 14 ? '83 Kingsway · ' : ''}${world.regionAt(e.x, e.z).replace(/^the /, '').replace(/^\w/, c => c.toUpperCase())}</b>${sim.storm && sim.isNight() ? ' · ⛈ storm' : ''}${hidTxt}<br>Knows ${e.known ? e.known.size : 0} hiding spot(s)<br>${tr ? `Tribe: <b style="color:#${tr.color.toString(16).padStart(6, '0')}">${tr.name}</b>${rank}` : e.exile ? '<b style="color:#ffb04a">EXILE</b> — banished, alone' : 'Wanderer'}<br>
  Doing: <b>${e.state}</b> · Reputation: <b style="color:${rep < 0 ? '#f88' : '#8f8'}">${fmt(rep)}</b><br>
  ${bar('HP', e.hp, '#d44')}${bar('Hunger', e.hunger, '#da4')}${bar('Energy', e.energy, '#4ad')}${bar('Fear', e.fear, '#a4d')}
  Traits: greed ${(e.traits.greed * 100) | 0} · loyalty ${(e.traits.loyalty * 100) | 0} · bravery ${(e.traits.bravery * 100) | 0}<br>
  Carrying: ${inv}<br>Bad acts: hoard ${e.bad.hoard}, abandon ${e.bad.abandon}, attack ${e.bad.attack}<br>Opinions: ${rel || '—'}<br>
  <small>Memory: ${e.mem.slice(-3).map(m => m.txt).join('; ') || '—'}</small>`;
}
function updateTop() {
  const t = sim.tod, hh = Math.floor(t * 24), mm = Math.floor((t * 24 - hh) * 60);
  $('#clock').textContent = `${sim.isNight() ? '🌙' : '☀️'} Day ${sim.day} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('#stPop').textContent = '🐾 ' + sim.thronglets().length; $('#stTribes').textContent = '🏕 ' + sim.tribes.filter(t => t.alive).length; $('#stVamps').textContent = '🧛 ' + sim.vamps().length; $('#stPeng').textContent = '🐧 ' + sim.penguins().length + '/10';
}
// ---------- sizing ----------
function resize() { const w = innerWidth, h = innerHeight; canvas.width = Math.round(w * renderScale); canvas.height = Math.round(h * renderScale); }
addEventListener('resize', resize); screen.orientation?.addEventListener?.('change', () => setTimeout(resize, 100));
// ---------- world lifecycle ----------
function reset(seed) {
  world = new World(seed); sim = new Sim(world, seed); sim.onLog = addLogLine; $('#logList').innerHTML = ''; sim.logs.forEach(addLogLine);
  { const ian = sim.thronglets()[0]; if (ian) ian.name = 'Ian'; } R.setWorld(world, sim); R.flush(1e9, true); selected = null; cam.follow = null; $('#insp').classList.add('hidden');
  const t0 = sim.tribes[0]; if (t0) { cam.tx = t0.cx; cam.tz = t0.cz; cam.dist = 34; }
  window.DF.world = world; window.DF.sim = sim;
}
function flushChunks() { R.flush(1e9, true); R.forceBuild = true; }
let acc = 0, last = performance.now(), frames = 0, fpsT = last, fps = 0;
const DT = 1000 / TPS;
// ===== v0.11 mini-map with village names =====
const MM = (() => { const c = document.createElement('canvas'); c.id = 'minimap'; c.width = c.height = 512; document.body.appendChild(c); const g = c.getContext('2d');
  const base = document.createElement('canvas'); base.width = base.height = 256; const bg = base.getContext('2d'); let builtFor = null; const build = () => { builtFor = world; const id = bg.createImageData(256, 256), COL = ['#1d3f5e', '#c9b77a', '#5f8a3a', '#2f5a2a', '#4a5a3a', '#6d7058', '#24507a', '#6a6258', '#3a2f3e'];
  for (let z = 0; z < 256; z++) for (let x = 0; x < 256; x++) { const k = (z * 2) * 512 + x * 2, rg = world.region[k], col = world.water[k] ? (rg === 0 ? '#1d3f5e' : '#2b5f8a') : COL[rg] || '#4a6a3a', n = parseInt(col.slice(1), 16), i = (z * 256 + x) * 4; const sh = ((x * 7 + z * 13) % 5) - 2; id.data[i] = ((n >> 16) & 255) + sh * 3; id.data[i + 1] = ((n >> 8) & 255) + sh * 3; id.data[i + 2] = (n & 255) + sh * 2; id.data[i + 3] = 255; }
  bg.putImageData(id, 0, 0); };
  c.addEventListener('pointerdown', ev => { const r = c.getBoundingClientRect(); cam.follow = null; cam.tx = (ev.clientX - r.left) / r.width * 512; cam.tz = (ev.clientY - r.top) / r.height * 512; ev.stopPropagation(); });
  let lastT = 0; return { draw(now) { if (!world || !sim || now - lastT < 400) return; lastT = now; if (builtFor !== world) build(); g.imageSmoothingEnabled = false; g.drawImage(base, 0, 0, 512, 512); const m = world.mansion;
    g.fillStyle = '#b02030'; g.fillRect(m.x - 6, m.z - 6, 12, 12); g.strokeStyle = '#ffd0d0'; g.lineWidth = 2; g.strokeRect(m.x - 6, m.z - 6, 12, 12);
    for (const v of sim.ents) if (v.kind === 'v' && v.alive && !v.inMansion && !v.hideout) { g.fillStyle = v.batHome ? '#c080ff' : '#ff4040'; g.fillRect(v.x - 3, v.z - 3, 6, 6); }
    for (const e of sim.ents) if (e.kind === 't' && e.alive && e.trade) { g.fillStyle = '#ffe070'; g.beginPath(); g.arc(e.x, e.z, 4, 0, 6.3); g.fill(); }
    g.font = 'bold 22px "Pixelify Sans", monospace, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const tr of sim.tribes) { if (!tr.alive) continue; g.fillStyle = tr.color || '#e8c070'; g.beginPath(); g.arc(tr.cx, tr.cz, 8, 0, 6.3); g.fill(); g.lineWidth = 3; g.strokeStyle = '#1a1208'; g.stroke();
      const y = tr.cz - 12 < 30 ? tr.cz + 36 : tr.cz - 12, x = Math.max(70, Math.min(442, tr.cx)); g.lineWidth = 6; g.strokeStyle = 'rgba(15,10,5,0.9)'; g.strokeText(tr.name, x, y); g.fillStyle = '#fff4d0'; g.fillText(tr.name, x, y); }
    const hw = innerWidth / cam.scale / 2, hh = innerHeight / cam.scale / 2; g.strokeStyle = '#ffe9a8'; g.lineWidth = 3; g.strokeRect(cam.tx - hw, cam.tz - hh, hw * 2, hh * 2); } }; })();
window.MM = MM;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt * 1000 * speed; let n = 0; const maxT = 48; while (acc >= DT && n < maxT) { sim.step(); acc -= DT; n++; } if (n >= maxT) acc = 0;
  R.flush(); keyMove(dt); applyCam(dt);
  R.render(cam, Math.min(1, acc / DT), dt, selected, renderScale); frames++; MM.draw(now);
  if (now - fpsT > 1000) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; $('#stFps').textContent = fps.toFixed(0) + ' fps'; updateTop(); renderInspector(); window.DF.fps = fps; if (!window.DF.lockScale && fps < 32 && renderScale > 1) { renderScale = Math.max(1, renderScale - 0.25); resize(); } }
}
$('#btnLabels').onclick = () => { R.showLabels = !R.showLabels; $('#btnLabels').classList.toggle('on', R.showLabels); };
window.DF = { cam, renderer: R, get speed() { return speed; }, setSpeed, select, flushChunks, setMode: m => document.querySelector(`[data-mode="${m}"]`)?.click(),
  selectedName: () => selected && selected.name, screenOf, fast(n) { for (let i = 0; i < n; i++) sim.step(); }, setScale(s) { renderScale = s; window.DF.lockScale = true; resize(); }, reset };
reset(42); resize(); if (innerHeight < 500) { $('#tools').classList.add('collapsed'); $('#log').classList.add('collapsed'); }
document.fonts?.load?.('16px "Pixelify Sans"'); document.fonts?.load?.('20px "Jacquard 12"');
$('#loading').classList.add('splash'); setTimeout(() => $('#loading').classList.add('gone'), 1400); setTimeout(() => $('#loading').remove(), 2600); requestAnimationFrame(loop); window.DF.ready = true;
