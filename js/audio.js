// Dark Forest v0.13 — procedural audio: calm generative day/night music + UI sound effects.
// No music files, nothing metered: everything is synthesized with WebAudio.
// Music chain: dayBus/nightBus -> soft low-pass -> dry + generated-impulse reverb -> master.
// Day = warm pads + kalimba melody + light birdsong. Night = low soft pads + slow music-box
// bells + gentle crickets + soft wind. No sawtooth, every note has a soft attack (no clicks).
// The context is created on the first user gesture (autoplay rules); all calls no-op until then.
let ctx = null, master = null, dayBus = null, nightBus = null, rainBus = null, music = null;
let muted = false, scheduler = null, nextStep = 0, step = 0, dayFrac = 1, storm = false;
let dayMel = 4, nightMel = 3, cricketG = null, windG = null;
try { muted = localStorage.getItem('df-sound') === 'off'; } catch (_) { /* private mode */ }

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
// day: Fmaj7 – Am7 – Dm9 – Cadd9, 8 steps each (step = 0.75 s -> 6 s per chord)
const DAY_CH = [[53, 57, 60, 64], [57, 60, 64, 67], [50, 57, 60, 64], [48, 55, 62, 64]];
const DAY_PENTA = [72, 74, 76, 79, 81, 84, 86, 88]; // C major pentatonic, kalimba range
const DAY_RHY = [1, 0, 0.5, 0, 0.8, 0, 0.3, 0.4]; // chance of a note on each step of a bar
// night: Am9 – Fmaj7 – Cmaj7 – Em7 (calm, a little mysterious, no harsh minor-second clashes)
const NIGHT_CH = [[45, 52, 59, 60], [41, 48, 52, 57], [48, 52, 55, 59], [40, 47, 50, 55]];
const NIGHT_PENTA = [76, 79, 81, 84, 86, 88, 91]; // A minor pentatonic up high = music box
const STEP = 0.75;

function noiseBuf(sec) { const len = ctx.sampleRate * sec, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return b; }
function loopNoise(dest, type, freq, q) { const s = ctx.createBufferSource(); s.buffer = noiseBuf(3); s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; s.connect(f); f.connect(dest); s.start(); return f; }

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
    // music bus: gentle low-pass, then dry + reverb (impulse = 3.5 s of decaying stereo noise)
    music = ctx.createGain(); music.gain.value = 0.9;
    const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 2600; soft.Q.value = 0.3;
    const rev = ctx.createConvolver(), L = ctx.sampleRate * 3.5, ir = ctx.createBuffer(2, L, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3); }
    rev.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.45; const dry = ctx.createGain(); dry.gain.value = 0.7;
    music.connect(soft); soft.connect(dry); soft.connect(rev); rev.connect(wet); dry.connect(master); wet.connect(master);
    dayBus = ctx.createGain(); dayBus.gain.value = 0.5 * dayFrac; dayBus.connect(music);
    nightBus = ctx.createGain(); nightBus.gain.value = 0.5 * (1 - dayFrac); nightBus.connect(music);
    // night ambience: crickets (narrow band noise, pulsed by a slow LFO) + soft wind (low band noise, slow swell)
    cricketG = ctx.createGain(); cricketG.gain.value = 0; cricketG.connect(nightBus);
    const cAm = ctx.createGain(); cAm.gain.value = 0; loopNoise(cAm, 'bandpass', 4300, 30); cAm.connect(cricketG);
    const pulse = ctx.createOscillator(); pulse.frequency.value = 14; const pd = ctx.createGain(); pd.gain.value = 0.5; pulse.connect(pd); pd.connect(cAm.gain);
    const slow = ctx.createOscillator(); slow.frequency.value = 0.13; const sd = ctx.createGain(); sd.gain.value = 0.35; slow.connect(sd); sd.connect(cAm.gain); pulse.start(); slow.start();
    windG = ctx.createGain(); windG.gain.value = 0.12; windG.connect(nightBus); const wf = loopNoise(windG, 'bandpass', 380, 0.8);
    const wl = ctx.createOscillator(); wl.frequency.value = 0.05; const wd = ctx.createGain(); wd.gain.value = 180; wl.connect(wd); wd.connect(wf.frequency); wl.start();
    rainBus = ctx.createGain(); rainBus.gain.value = 0; rainBus.connect(master);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    src.connect(lp); lp.connect(rainBus); src.start();
    return true;
  } catch (_) { ctx = null; return false; }
}

// one voice with a soft attack and smooth exponential release (no clicks)
function tone({ freq, t, dur, type = 'sine', gain = 0.15, dest, slide = null, lp = null, atk = 0.01 }) {
  if (!ctx || !dest) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    node.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  } catch (_) { /* never break the game for a note */ }
}
// warm pad: each chord note as two slightly detuned sines + a quiet triangle, slow swell
function pad(notes, t, dest, vol, dur, oct = 0) { for (const m of notes) { const f = mtof(m + oct); tone({ freq: f, t, dur, gain: vol, dest, atk: dur * 0.35 }); tone({ freq: f * 1.004, t, dur, gain: vol * 0.6, dest, atk: dur * 0.4 }); tone({ freq: f * 0.998, t, dur, type: 'triangle', gain: vol * 0.25, dest, atk: dur * 0.4, lp: 700 }); } }
// kalimba / harp pluck: sine + soft partials, fast decay
function pluck(m, t, dest, vol) { const f = mtof(m); tone({ freq: f, t, dur: 1.8, gain: vol, dest, atk: 0.006 }); tone({ freq: f * 2, t, dur: 0.6, gain: vol * 0.25, dest, atk: 0.004 }); tone({ freq: f * 5.4, t, dur: 0.15, gain: vol * 0.05, dest, atk: 0.003 }); }
// music box bell: sine + quiet bright partial, long ring
function bell(m, t, dest, vol) { const f = mtof(m); tone({ freq: f, t, dur: 3.2, gain: vol, dest, atk: 0.008 }); tone({ freq: f * 3, t, dur: 1.2, gain: vol * 0.12, dest, atk: 0.005 }); }
function bird(t, dest, vol) { const f = 2600 + Math.random() * 1200, n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) tone({ freq: f * (1 + i * 0.04), t: t + i * 0.13, dur: 0.1, gain: vol, dest, slide: f * 1.25, atk: 0.02 }); }
const walk = (i, n) => Math.max(0, Math.min(n - 1, i + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0]));

function schedule() {
  if (!ctx) return;
  const ahead = ctx.currentTime + 1.0;
  while (nextStep < ahead) {
    const t = Math.max(nextStep, ctx.currentTime + 0.03), s = step++, bar = (s / 8 | 0), pos = s % 8;
    if (dayFrac > 0.05) { const ch = DAY_CH[bar % 4];
      if (pos === 0) { pad(ch, t, dayBus, 0.022, STEP * 9); tone({ freq: mtof(ch[0] - 12), t, dur: STEP * 8, gain: 0.04, dest: dayBus, atk: 1.5 }); }
      if (bar % 8 !== 7 && Math.random() < DAY_RHY[pos]) { dayMel = walk(dayMel, DAY_PENTA.length); pluck(DAY_PENTA[dayMel], t + (Math.random() - 0.5) * 0.03, dayBus, 0.05); }
      if (Math.random() < 0.06) bird(t + Math.random() * 0.5, dayBus, 0.012);
    }
    if (dayFrac < 0.95 && s % 2 === 0) { const ns = s >> 1, nbar = ns >> 3, npos = ns % 8, ch = NIGHT_CH[nbar % 4]; // night runs at half speed (1.5 s steps)
      if (npos === 0) { pad(ch, t, nightBus, 0.02, STEP * 18, -12); tone({ freq: mtof(ch[0] - 12), t, dur: STEP * 16, gain: 0.05, dest: nightBus, atk: 3 }); }
      if ((npos === 1 || npos === 4 || npos === 6) && Math.random() < 0.6) { nightMel = walk(nightMel, NIGHT_PENTA.length); bell(NIGHT_PENTA[nightMel], t, nightBus, 0.035); }
    }
    nextStep += STEP;
  }
}

function startScheduler() {
  if (scheduler || !ctx) return;
  nextStep = ctx.currentTime + 0.1; step = 0;
  scheduler = setInterval(schedule, 250);
}

// v0.31 file SFX (SFXMint, CC0-1.0, no credit required, assets/sfx/*.mp3): try the real
// recording first, fall back to the procedural tone if the file is missing or blocked.
// Music stays procedural — Kyler has not handed over Suno tracks yet, so day/night
// tracks are NOT replaced, only the short SFX are.
function playFile(url, fallback) {
  try {
    const a = new Audio(url); a.volume = muted ? 0 : 0.6;
    const p = a.play(); if (p && p.catch) p.catch(() => fallback());
    a.addEventListener('error', fallback, { once: true });
  } catch (_) { fallback(); }
}

export const audio = {
  get muted() { return muted; },
  unlock() { if (!ensure()) return; if (ctx.state === 'suspended') ctx.resume().catch(() => {}); startScheduler(); },
  setMuted(m) { muted = !!m; try { localStorage.setItem('df-sound', muted ? 'off' : 'on'); } catch (_) {} if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.1); },
  toggle() { this.setMuted(!muted); return !muted; },
  // dayFrac: 0 (deep night) .. 1 (midday), from sim.dayAmt(); storm: boolean
  setMood(frac, isStorm) {
    dayFrac = Math.max(0, Math.min(1, frac || 0)); storm = !!isStorm;
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      // smooth equal-power crossfade, 3 s time constant
      dayBus.gain.setTargetAtTime(0.5 * Math.sin(dayFrac * Math.PI / 2), t, 3);
      nightBus.gain.setTargetAtTime(0.5 * Math.cos(dayFrac * Math.PI / 2), t, 3);
      cricketG.gain.setTargetAtTime(storm ? 0 : 0.05 * (1 - dayFrac), t, 3);
      rainBus.gain.setTargetAtTime(storm && dayFrac < 0.6 ? 0.045 : 0, t, 2);
    } catch (_) {}
  },
  debug() { return ctx ? { state: ctx.state, day: +dayBus.gain.value.toFixed(3), night: +nightBus.gain.value.toFixed(3), dayFrac } : null; },
  // --- sound effects (file first, procedural fallback) ---
  select() { if (!ensure()) return; if (ctx.state === 'suspended') return; const t = ctx.currentTime;
    playFile('assets/sfx/ui-click-40.mp3', () => {
      tone({ freq: 659.25, t, dur: 0.08, type: 'triangle', gain: 0.14, dest: master });
      tone({ freq: 880, t: t + 0.06, dur: 0.1, type: 'triangle', gain: 0.12, dest: master }); }); },
  pickup() { if (!ensure()) return; if (ctx.state === 'suspended') return; const t = ctx.currentTime; // the pick-up sound: a quick rising chime
    playFile('assets/sfx/retro-game-coin-52.mp3', () => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, t: t + i * 0.055, dur: 0.16, type: 'triangle', gain: 0.16, dest: master })); }); },
  drop() { if (!ensure()) return; if (ctx.state === 'suspended') return; const t = ctx.currentTime;
    playFile('assets/sfx/impact-thud-65.mp3', () => {
      tone({ freq: 150, t, dur: 0.13, type: 'sine', gain: 0.22, dest: master, slide: 65 });
      tone({ freq: 392, t: t + 0.05, dur: 0.07, type: 'triangle', gain: 0.08, dest: master }); }); },
  place() { if (!ensure()) return; if (ctx.state === 'suspended') return; const t = ctx.currentTime;
    playFile('assets/sfx/feedback-confirm-57.mp3', () => {
      tone({ freq: 220, t, dur: 0.1, type: 'sine', gain: 0.12, dest: master, slide: 110 }); }); },
};
