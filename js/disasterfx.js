// Dark Forest v0.14 — procedural visuals for js/disasters.js (no image files): eruption danger ring, lava bombs and ash,
// tornado funnel, hurricane spiral, wall debris / repair dust, evacuee packs, and village name tags (pop-in for new settlements).
import { P, cv } from './art.js';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function blob(col) { const c = cv(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.45, `rgba(${col},0.6)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; }
const easeBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export const DisasterFX = {
  // world-space pass (call with the world transform already set)
  disasterWorld(ctx, sim, V) { const { t, dt, k, inView } = V; this.dfx = this.dfx || []; this.bombs = this.bombs || [];
    if (!this.blobD) { this.blobD = blob('46,48,56'); this.blobL = blob('226,230,236'); this.blobA = blob('120,110,104'); this.blobO = blob('255,140,50'); }
    // --- sim fx queue: wall debris + repair dust ---
    if (this._fxSim !== sim) { this._fxSim = sim; this._fxTick = sim.tick; this.dfx.length = 0; this.bombs.length = 0; }
    if (sim.fx) { for (const f of sim.fx) { if (f.tick <= (this._fxTick || -1)) continue; if (!inView(f.x, f.z, 4)) continue;
        const n = f.k === 'debris' ? 10 : 6; for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = f.k === 'debris' ? 2 + Math.random() * 4 : 0.6 + Math.random(); this.dfx.push({ k: f.k, x: f.x, z: f.z - 0.4, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.5 - (f.k === 'debris' ? 2.5 : 0.6), life: f.k === 'debris' ? 1.1 : 0.9, c: f.k === 'debris' ? (Math.random() < 0.5 ? '#8a5a32' : '#5e3a1f') : 'rgba(225,205,160,0.8)' }); } }
      if (sim.fx.length) this._fxTick = sim.fx[sim.fx.length - 1].tick; }
    // --- volcano: danger ring, lava bombs ---
    const E = sim.erupt;
    if (E) { const el = sim.tick - E.start, warn = E.phase === 'warn', fade = E.phase === 'clear' ? 0.45 : 1, X = E.x * P, Z = E.z * P, R = E.R * P;
      ctx.save(); const gr = ctx.createRadialGradient(X, Z, R * 0.2, X, Z, R); gr.addColorStop(0, `rgba(255,90,20,${0.10 * fade})`); gr.addColorStop(0.85, `rgba(255,120,40,${0.07 * fade})`); gr.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Z, R, 0, 6.283); ctx.fill();
      ctx.lineWidth = 3 / k; ctx.setLineDash([14 / k, 9 / k]); ctx.lineDashOffset = -t * 30 / k; ctx.strokeStyle = `rgba(255,${warn ? 200 : 120},40,${(warn ? 0.55 + 0.4 * Math.sin(t * 7) : 0.75) * fade})`; ctx.beginPath(); ctx.arc(X, Z, R, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      if (E.phase === 'erupt' && Math.random() < dt * 9) { const a = Math.random() * 6.283, d = (0.12 + Math.random() * 0.5) * E.R; this.bombs.push({ x0: E.x, z0: E.z - 2, x1: E.x + Math.cos(a) * d, z1: E.z + Math.sin(a) * d, T: 1.1 + Math.random() * 1.2, t: 0, h: 6 + d * 0.25 }); }
      if (warn && Math.random() < dt * 3) { const a = Math.random() * 6.283; this.dfx.push({ k: 'ash', x: E.x + Math.cos(a) * 3, z: E.z - 3 + Math.sin(a), vx: (Math.random() - 0.5) * 2, vz: -2.5, life: 2.5, c: 'rgba(40,36,38,0.7)' }); } }
    for (let i = this.bombs.length - 1; i >= 0; i--) { const b = this.bombs[i]; b.t += dt; const f = b.t / b.T; if (f >= 1) { this.bombs.splice(i, 1); if (inView(b.x1, b.z1, 6)) { for (let j = 0; j < 8; j++) { const a = Math.random() * 6.283; this.dfx.push({ k: 'lava', x: b.x1, z: b.z1, vx: Math.cos(a) * 3, vz: Math.sin(a) * 1.5 - 2, life: 0.8, c: j % 2 ? '#ffd34a' : '#ff5a10' }); } this.dfx.push({ k: 'scorch', x: b.x1, z: b.z1, vx: 0, vz: 0, life: 2.5 }); } continue; }
      const x = b.x0 + (b.x1 - b.x0) * f, z = b.z0 + (b.z1 - b.z0) * f - Math.sin(f * Math.PI) * b.h; if (!inView(x, z, 8)) continue;
      const gs = Math.max(16, 12 / k), cs = Math.max(3, 3.5 / k); ctx.globalAlpha = 0.55; ctx.drawImage(this.blobO, x * P - gs / 2, z * P - gs / 2, gs, gs); ctx.globalAlpha = 1; ctx.fillStyle = '#ffe08a'; ctx.fillRect(x * P - cs / 2, z * P - cs / 2, cs, cs); ctx.fillStyle = '#ff6a1a'; ctx.fillRect(Math.round(x * P) - 2, Math.round(z * P), 1, 1);
      if (Math.random() < 0.6) this.dfx.push({ k: 'trail', x, z, vx: 0, vz: 0.3, life: 0.5, c: 'rgba(90,80,80,0.5)' }); }
    // --- storms ---
    const S = sim.wx;
    if (S) { const el = sim.tick - S.start, X = S.x * P, Z = S.z * P;
      if (S.phase === 'warn') { const g = clamp(el / 150, 0, 1), RR = (S.kind === 'tornado' ? 9 : 26) * P * (0.4 + 0.6 * g);
        ctx.save(); for (let i = 0; i < 26; i++) { const a = t * (S.kind === 'tornado' ? 1.6 : 0.5) + i * 0.97, r = RR * (0.15 + 0.85 * hsh(i, 3)), sz = RR * (0.35 + 0.3 * hsh(i, 5)); ctx.globalAlpha = 0.42 * g; ctx.drawImage(this.blobD, X + Math.cos(a) * r - sz, Z - (S.kind === 'tornado' ? 5 * P : 0) + Math.sin(a) * r * 0.6 - sz, sz * 2, sz * 2); } ctx.restore(); }
      else if (S.kind === 'tornado') this.tornado(ctx, X, Z, t, S);
      else this.hurricane(ctx, X, Z, t, S, inView); }
    // --- particles ---
    for (let i = this.dfx.length - 1; i >= 0; i--) { const p = this.dfx[i]; p.life -= dt; if (p.life <= 0) { this.dfx.splice(i, 1); continue; }
      if (p.k === 'scorch') { ctx.globalAlpha = clamp(p.life / 2.5, 0, 1) * 0.8; ctx.drawImage(this.blobO, p.x * P - 7, p.z * P - 4, 14, 8); ctx.globalAlpha = 1; continue; }
      p.x += p.vx * dt; p.z += p.vz * dt; if (p.k === 'debris' || p.k === 'lava') p.vz += 6 * dt; else if (p.k === 'repair') { p.vx *= 0.95; p.vz *= 0.95; }
      if (p.k === 'repair') { const r = Math.round(2 + (0.9 - p.life) * 4); ctx.globalAlpha = clamp(p.life, 0, 1) * 0.7; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x * P) - r, Math.round(p.z * P) - r, r * 2, r * 2 - 1); ctx.globalAlpha = 1; }
      else { ctx.fillStyle = p.c; const s2 = p.k === 'debris' ? 2 : p.k === 'ash' ? 3 : 1; ctx.fillRect(Math.round(p.x * P), Math.round(p.z * P), s2, s2); } }
    if (this.dfx.length > 600) this.dfx.splice(0, this.dfx.length - 600); },
  tornado(ctx, X, Z, t, S) { const H = 7 * P, N = 22; ctx.save();
    ctx.fillStyle = 'rgba(30,26,20,0.3)'; ctx.beginPath(); ctx.ellipse(X, Z + 2, 2.8 * P, 0.9 * P, 0, 0, 6.283); ctx.fill();
    for (let i = 0; i < 16; i++) { const a = t * 5 + i * 0.8, r = (1.2 + (i % 4) * 0.45) * P; ctx.globalAlpha = 0.45; ctx.drawImage(this.blobA, X + Math.cos(a) * r - 12, Z + Math.sin(a) * r * 0.35 - 7, 24, 14); }
    const sw = f => Math.sin(t * 2.6 + f * 3.5 + S.seed) * f * 0.9 * P, wd = f => (0.3 + f * f * 2.3) * P;
    // body: solid silhouette with a lit right side and a shadowed left side
    ctx.globalAlpha = 0.92; ctx.beginPath(); for (let i = 0; i <= N; i++) { const f = i / N; ctx.lineTo(X + sw(f) + wd(f), Z - f * H); } for (let i = N; i >= 0; i--) { const f = i / N; ctx.lineTo(X + sw(f) - wd(f), Z - f * H); } ctx.closePath();
    const g = ctx.createLinearGradient(X - 2.6 * P, 0, X + 2.6 * P, 0); g.addColorStop(0, '#3e3a36'); g.addColorStop(0.45, '#6a655e'); g.addColorStop(0.7, '#8c867c'); g.addColorStop(1, '#5a554f'); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(28,24,20,0.8)'; ctx.lineWidth = 1; ctx.stroke(); ctx.clip();
    // spinning bands
    ctx.globalAlpha = 0.5; for (let i = 0; i < N; i++) { const f = i / N, y = Z - f * H, w = wd(f), ph = ((t * 2.2 + i * 0.23) % 1); ctx.fillStyle = '#b4ada2'; ctx.fillRect(Math.round(X + sw(f) - w + ph * 2 * w), Math.round(y - 2), Math.max(1, Math.round(w * 0.25)), 2); ctx.fillStyle = '#2e2a26'; ctx.fillRect(Math.round(X + sw(f) - w + ((ph + 0.5) % 1) * 2 * w), Math.round(y - 3), 1, 3); }
    ctx.restore(); ctx.save();
    for (let i = 0; i < 10; i++) { const a = t * 1.2 + i * 0.63, r = (1.5 + hsh(i, 9) * 2.5) * P; ctx.globalAlpha = 0.55; ctx.drawImage(i % 3 ? this.blobA : this.blobD, X + sw(1) + Math.cos(a) * r - 2.5 * P, Z - H + Math.sin(a) * r * 0.3 - 1.6 * P, 5 * P, 3.2 * P); }
    ctx.globalAlpha = 1; for (let j = 0; j < 30; j++) { const f = (j % 10) / 10, a = t * (7 - f * 3) + j * 2.4, r = wd(f) + 3 + (j % 3) * 2; const px = X + sw(f) + Math.cos(a) * r, front = Math.sin(a) > 0; if (!front && j % 2) continue; ctx.fillStyle = j % 3 ? '#5e3a1f' : j % 2 ? '#3a5a2a' : '#8a6a4a'; ctx.fillRect(Math.round(px), Math.round(Z - f * H * 0.85 + Math.sin(a) * 2), j % 4 ? 2 : 3, 2); }
    ctx.restore(); },
  hurricane(ctx, X, Z, t, S, inView) { const R = S.R * P; ctx.save();
    const gr = ctx.createRadialGradient(X, Z, 0, X, Z, R * 1.15); gr.addColorStop(0, 'rgba(30,40,60,0.10)'); gr.addColorStop(0.7, 'rgba(30,40,60,0.22)'); gr.addColorStop(1, 'rgba(30,40,60,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X, Z, R * 1.15, 0, 6.283); ctx.fill();
    const rot = -t * 0.55 + S.seed; for (let arm = 0; arm < 4; arm++) for (let j = 0; j < 34; j++) { const f = j / 33, a = rot + arm * Math.PI / 2 + f * 3.4, r = (0.1 + f * 0.95) * R, sz = (1.6 + f * 5.5) * P;
      ctx.globalAlpha = 0.3 * (1 - f * 0.45); ctx.drawImage(arm % 2 ? this.blobL : this.blobD, X + Math.cos(a) * r - sz, Z + Math.sin(a) * r - sz, sz * 2, sz * 2); }
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#18202c'; ctx.beginPath(); ctx.arc(X, Z, 0.07 * R, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.strokeStyle = '#c8d4e8'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 140; i++) { const a = hsh(i, 1) * 6.283, r = Math.sqrt(hsh(i, 2)) * R, ph = (t * 1.4 + hsh(i, 3)) % 1, x = X + Math.cos(a) * r - ph * 10, y = Z + Math.sin(a) * r + ph * 24; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); } ctx.stroke();
    ctx.restore(); },
  // evacuee's pack (drawn after the Thronglet sprite)
  pack(ctx, x, y, TW, TH, side) { const w = Math.max(5, Math.round(TW * 0.55)), h = Math.round(w * 0.9), px = Math.round(x - side * TW * 0.42 - w / 2), py = Math.round(y - TH * 0.62);
    ctx.fillStyle = '#2a1a0c'; ctx.fillRect(px - 1, py - 1, w + 2, h + 2); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(px, py, w, h); ctx.fillStyle = '#b07a3a'; ctx.fillRect(px, py, w, 1); ctx.fillStyle = '#5e3a1f'; ctx.fillRect(px + (w >> 1), py + 1, 1, h - 1);
    ctx.fillStyle = '#2a1a0c'; ctx.fillRect(px - 2, py - 3, w + 4, 3); ctx.fillStyle = '#d8c8a0'; ctx.fillRect(px - 1, py - 2, w + 2, 1); },
  // close-up village name tags (same font as before: bold 9px Pixelify Sans) + status line
  villageTags(ctx, sim) { ctx.textAlign = 'center';
    const hosting = {}; for (const e of sim.ents) if (e.alive && e.evac) hosting[e.evac.host] = (hosting[e.evac.host] || 0) + 1;
    for (const tr of sim.tribes) { if (!tr.alive) continue; const X = tr.cx * P, Y = tr.cz * P - 30; let sc = 1;
      if (tr.id >= 8) { if (tr._seenT == null) tr._seenT = this.t; const a = this.t - tr._seenT; sc = a < 0.8 ? Math.max(0.05, easeBack(a / 0.8)) : 1; }
      ctx.save(); ctx.translate(X, Y); ctx.scale(sc, sc); ctx.font = 'bold 9px "Pixelify Sans", monospace'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,6,0.85)'; ctx.strokeText(tr.name, 0, 0); ctx.fillStyle = '#fff2c0'; ctx.fillText(tr.name, 0, 0);
      let sub = null, col = '#ffd27a'; const job = tr.jobs[0];
      if (tr.evacuated != null) { sub = 'evacuated — volcano'; col = '#ffb070'; }
      else if (job && job.urgent) { sub = `repairing walls ${job.idx}/${job.blocks.length}`; col = '#ffe08a'; }
      else if (hosting[tr.id]) { sub = `sheltering ${hosting[tr.id]} evacuees`; col = '#bfe3ff'; }
      else if (tr.id >= 8 && sim.tick - (tr.bornAt || 0) < 2400) { sub = tr.outcasts ? 'new outcast camp' : 'new settlement'; }
      if (sub) { ctx.font = 'bold 6px "Pixelify Sans", monospace'; ctx.lineWidth = 2.5; ctx.strokeText(sub, 0, 8); ctx.fillStyle = col; ctx.fillText(sub, 0, 8);
        if (job && job.urgent && tr.evacuated == null) { const w = 34, f = job.idx / Math.max(1, job.blocks.length); ctx.fillStyle = 'rgba(20,12,6,0.85)'; ctx.fillRect(-w / 2 - 1, 11, w + 2, 4); ctx.fillStyle = '#e8b04a'; ctx.fillRect(-w / 2, 12, Math.round(w * f), 2); } }
      ctx.restore(); } },
  // far zoom: a brand-new settlement's name pops up over it (same Pixelify Sans pill as the minimap labels), then settles into the minimap
  farNewLabels(ctx, sim, ox, oy, s, dpr) { for (const tr of sim.tribes) { if (!tr.alive || tr.id < 8 || sim.tick - (tr.bornAt || 0) > 1800) continue; if (tr._farT == null) tr._farT = this.t; const a = this.t - tr._farT, sc = a < 0.8 ? Math.max(0.05, easeBack(a / 0.8)) : 1;
      const X = ox + tr.cx * s, Y = oy + tr.cz * s - 16 * dpr; if (X < -100 || Y < -40 || X > ctx.canvas.width + 100 || Y > ctx.canvas.height + 40) continue; const fs = 13 * dpr;
      ctx.save(); ctx.translate(X, Y); ctx.scale(sc, sc); ctx.font = `bold ${fs}px "Pixelify Sans", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const w = ctx.measureText(tr.name).width + fs * 0.8, h = fs * 1.35;
      ctx.fillStyle = 'rgba(18,12,6,0.85)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, h / 2) : ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); ctx.fillStyle = '#fff4d0'; ctx.fillText(tr.name, 0, 1);
      ctx.font = `bold ${Math.round(fs * 0.62)}px "Pixelify Sans", monospace`; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(18,12,6,0.9)'; ctx.strokeText('new settlement', 0, h * 0.95); ctx.fillStyle = '#ffd27a'; ctx.fillText('new settlement', 0, h * 0.95);
      ctx.fillStyle = '#' + tr.color.toString(16).padStart(6, '0'); ctx.beginPath(); ctx.arc(0, 16 * dpr, 4 * dpr, 0, 6.283); ctx.fill(); ctx.restore(); } },
  // screen-space ash fall + gloom when the camera is inside the eruption zone
  ashScreen(ctx, sim, cam, Wd, Hd, dpr, dt) { const E = sim.erupt; if (!E || E.phase === 'warn') return; const d = Math.hypot(cam.tx - E.x, cam.tz - E.z); if (d > E.R * 1.05) return; const I = clamp(1.15 - d / E.R, 0.25, 1) * (E.phase === 'clear' ? 0.5 : 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(150,120,105,${0.45 * I})`; ctx.fillRect(0, 0, Wd, Hd); ctx.globalCompositeOperation = 'source-over';
    if (!this.ash) this.ash = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 0.7 }));
    const n = Math.floor(this.ash.length * I); for (let i = 0; i < n; i++) { const a = this.ash[i]; a.y += dt * 0.09 * a.s; a.x += dt * 0.03 * Math.sin(this.t + i); if (a.y > 1) { a.y -= 1; a.x = Math.random(); } ctx.fillStyle = i % 7 === 0 && E.phase === 'erupt' ? 'rgba(255,130,40,0.85)' : 'rgba(70,66,66,0.7)'; ctx.fillRect(a.x * Wd, a.y * Hd, 2 * dpr, 2 * dpr); } },
};
