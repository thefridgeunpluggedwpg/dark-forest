// Dark Forest × PixelFX — a few baked pixel art effects (test build).
// Effects and core from PixelFX by Patch (https://github.com/patch-gg/pixelfx, commit a841596), MIT License,
// Copyright (c) Patch; parts adapted from Hugo Duprez's Sprite Fusion VFX (MIT). See js/vendor/pixelfx/LICENSE + NOTICE.md.
// Each effect is simulated ONCE, lazily, into a short strip of cropped canvases; the game just drawImage()s a frame,
// so per-frame cost on phones is the same as any other sprite.
import { createFrame, createFx, composite } from './vendor/pixelfx/core/index.js';
import * as campfire from './vendor/pixelfx/fx/fire/campfire.js';
import * as torch from './vendor/pixelfx/fx/fire/torch.js';
import * as pillar from './vendor/pixelfx/fx/fire/flame-pillar.js';
import * as strike from './vendor/pixelfx/fx/lightning/lightning-strike.js';

// natural white-blue bolt instead of the stock violet, no cyan sparks
const BOLT = ['#1a1f2e', '#2c3a5a', '#4a5f8a', '#7090c0', '#a0c0e8', '#cfe2f8', '#eef6ff', '#ffffff'];
const SPEC = {
  campfire: { mod: campfire, fps: 12, opts: { height: 16 } },
  torch: { mod: torch, fps: 12, opts: {} },
  pillar: { mod: pillar, fps: 12, opts: {} },
  // start at the strike itself: skips the charging floor sigil (too "magic" for a storm)
  strike: { mod: strike, fps: 14, t0: 0.74, t1: 2.3, opts: { palette: BOLT, sparks: ['#ffffff', '#eef4ff', '#c8dcf0', '#90a8c8'] } },
};
const baked = {};
function bake(name) {
  const s = SPEC[name], m = s.mod.meta, [w, h] = m.size, [ox, oy] = m.origin;
  const t0 = s.t0 || 0, t1 = s.t1 ?? m.duration, n = Math.max(1, Math.round((t1 - t0) * s.fps)), dt = (t1 - t0) / n;
  const fx = createFx(s.mod, { x: ox, y: oy, ...s.opts }); if (t0) fx.update(t0);
  const frames = [], f = createFrame(w, h), buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < n; i++) {
    f.color.fill(0); f.light.fill(0); fx.draw(f); composite(f, buf, null, 0.8);
    let x0 = w, y0 = h, x1 = -1, y1 = -1; // crop to what's actually drawn
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[(y * w + x) * 4 + 3] > 6) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) { frames.push(null); fx.update(dt); continue; }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const id = new ImageData(cw, ch); for (let y = 0; y < ch; y++) id.data.set(buf.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * cw * 4);
    c.getContext('2d').putImageData(id, 0, 0); frames.push({ c, dx: x0 - ox, dy: y0 - oy });
    fx.update(dt);
  }
  return (baked[name] = { frames, fps: s.fps, loop: !!m.loop, dur: n / s.fps });
}
export const PFX = {
  on: true,
  get(name) { return baked[name] || bake(name); },
  /** draw effect `name` at art-px (x, y) (its origin = the ground point), at age `age` seconds. false when a one-shot is over. */
  draw(ctx, name, x, y, age, scale = 1, alpha = 1) {
    const b = this.get(name); let i = Math.floor(age * b.fps);
    if (b.loop) i %= b.frames.length; else if (i >= b.frames.length) return false;
    const fr = b.frames[i]; if (!fr) return true;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(fr.c, Math.round(x + fr.dx * scale), Math.round(y + fr.dy * scale), fr.c.width * scale, fr.c.height * scale);
    if (alpha !== 1) ctx.globalAlpha = 1; return true;
  },
};
if (typeof window !== 'undefined') window.PFX = PFX;
