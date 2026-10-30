/* PixelNote FX core: shared helpers for all full-screen vanish effects.
   No network, no external libraries. Everything renders on one Canvas 2D surface. */
(() => {
  'use strict';
  const FX = (window.FX = {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  Object.assign(FX, { clamp, lerp, rnd, smooth, TAU: Math.PI * 2 });

  // ---------- value noise (integer hash, trilinear) ----------
  function hash3(x, y, z) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483629)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  FX.noise = (x, y, z = 0) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const a = lerp(lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v);
    const b = lerp(lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v);
    return lerp(a, b, w);
  };
  // Divergence-free flow from the noise gradient: gives swirling, curling motion for smoke.
  FX.curl = (x, y, z, out) => {
    const e = 0.6;
    out[0] = FX.noise(x, y + e, z) - FX.noise(x, y - e, z);
    out[1] = -(FX.noise(x + e, y, z) - FX.noise(x - e, y, z));
  };

  // How long (seconds) the message needs to fully come apart, scaled to the chosen animation length.
  FX.relWin = (D) => Math.min(D * 0.62, 3 + D * 0.09);

  FX.mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  // ---------- colour ramps ----------
  const FIRE_STOPS = [[0, [255, 250, 225]], [0.18, [255, 214, 110]], [0.4, [255, 140, 30]], [0.7, [210, 45, 8]], [1, [70, 10, 4]]];
  FX.fireColor = (u) => {
    u = clamp(u, 0, 1);
    for (let i = 1; i < FIRE_STOPS.length; i++) {
      if (u <= FIRE_STOPS[i][0]) {
        const [u0, c0] = FIRE_STOPS[i - 1], [u1, c1] = FIRE_STOPS[i];
        const t = (u - u0) / (u1 - u0);
        return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
      }
    }
    return FIRE_STOPS[FIRE_STOPS.length - 1][1];
  };

  FX.radial = (size, stops) => {
    const c = FX.mkCanvas(size, size), g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  };
  // Soft round glow of a single colour.
  FX.glow = (r, g, b, size = 64, core = 1) => FX.radial(size, [[0, `rgba(${r},${g},${b},${core})`], [0.35, `rgba(${r},${g},${b},${core * 0.45})`], [1, `rgba(${r},${g},${b},0)`]]);

  // A set of flame sprites that run white-hot -> yellow -> orange -> deep red as the flame ages.
  FX.flameRamp = (n = 16, size = 96) => Array.from({ length: n }, (_, i) => {
    const [r, g, b] = FX.fireColor(i / (n - 1)).map(Math.round);
    return FX.radial(size, [[0, `rgba(${r},${g},${b},0.95)`], [0.28, `rgba(${r},${g},${b},0.55)`], [0.62, `rgba(${r},${g},${b},0.16)`], [1, `rgba(${r},${g},${b},0)`]]);
  });

  // Organic-looking smoke puff: several overlapping soft blobs in one sprite.
  FX.puffSprite = (r, g, b, size = 128, seed = 1) => {
    const c = FX.mkCanvas(size, size), g2 = c.getContext('2d');
    let s = seed * 9301 + 49297;
    const rr = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 9; i++) {
      const x = size * (0.28 + rr() * 0.44), y = size * (0.28 + rr() * 0.44), rad = size * (0.18 + rr() * 0.2);
      const gr = g2.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${r},${g},${b},0.34)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      g2.fillStyle = gr; g2.fillRect(0, 0, size, size);
    }
    return c;
  };

  // ---------- batched drawing (quantised colours -> few fill calls) ----------
  FX.Batch = class {
    constructor(ctx) { this.ctx = ctx; this.m = new Map(); }
    add(r, g, b, a, x, y, s) {
      const qa = (a * 15 + 0.5) | 0; if (qa <= 0) return;
      r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
      const k = (((r * 31 / 255 + 0.5) | 0) << 19) | (((g * 31 / 255 + 0.5) | 0) << 14) | (((b * 31 / 255 + 0.5) | 0) << 9) | (qa > 15 ? 15 : qa);
      let arr = this.m.get(k); if (!arr) { arr = []; this.m.set(k, arr); }
      arr.push(x, y, s);
    }
    flush() {
      const c = this.ctx;
      for (const [k, arr] of this.m) {
        if (!arr.length) continue;
        c.fillStyle = `rgba(${(((k >> 19) & 31) * 255 / 31) | 0},${(((k >> 14) & 31) * 255 / 31) | 0},${(((k >> 9) & 31) * 255 / 31) | 0},${(k & 15) / 15})`;
        c.beginPath();
        for (let i = 0; i < arr.length; i += 3) c.rect(arr[i], arr[i + 1], arr[i + 2], arr[i + 2]);
        c.fill(); arr.length = 0;
      }
      if (this.m.size > 700) this.m.clear();
    }
  };
  FX.Lines = class {
    constructor(ctx) { this.ctx = ctx; this.m = new Map(); }
    add(r, g, b, a, x1, y1, x2, y2) {
      const qa = (a * 15 + 0.5) | 0; if (qa <= 0) return;
      const k = (((r * 31 / 255 + 0.5) | 0) << 19) | (((g * 31 / 255 + 0.5) | 0) << 14) | (((b * 31 / 255 + 0.5) | 0) << 9) | (qa > 15 ? 15 : qa);
      let arr = this.m.get(k); if (!arr) { arr = []; this.m.set(k, arr); }
      arr.push(x1, y1, x2, y2);
    }
    flush(width = 1.5) {
      const c = this.ctx; c.lineWidth = width; c.lineCap = 'round';
      for (const [k, arr] of this.m) {
        if (!arr.length) continue;
        c.strokeStyle = `rgba(${(((k >> 19) & 31) * 255 / 31) | 0},${(((k >> 14) & 31) * 255 / 31) | 0},${(((k >> 9) & 31) * 255 / 31) | 0},${(k & 15) / 15})`;
        c.beginPath();
        for (let i = 0; i < arr.length; i += 4) { c.moveTo(arr[i], arr[i + 1]); c.lineTo(arr[i + 2], arr[i + 3]); }
        c.stroke(); arr.length = 0;
      }
      if (this.m.size > 700) this.m.clear();
    }
  };

  // ---------- message layout (drawn on a canvas, so it can be torn apart pixel by pixel) ----------
  const FAMILY = '"Segoe UI","Noto Sans Devanagari","Nirmala UI",Inter,system-ui,-apple-system,"Apple Color Emoji","Segoe UI Emoji",sans-serif';
  function wrap(msg, m, maxW, graphemes) {
    const out = [];
    for (const para of msg.split(/\r?\n/)) {
      if (!para.trim()) { out.push(''); continue; }
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (m.measureText(test).width <= maxW) { line = test; continue; }
        if (line) { out.push(line); line = ''; }
        if (m.measureText(word).width <= maxW) { line = word; continue; }
        let chunk = '';
        for (const g of graphemes(word)) {
          if (chunk && m.measureText(chunk + g).width > maxW) { out.push(chunk); chunk = g; } else chunk += g;
        }
        line = chunk;
      }
      out.push(line);
    }
    return out;
  }
  FX.layoutText = (msg, W, H, dpr) => {
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const graphemes = (s) => (seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s));
    const m = FX.mkCanvas(2, 2).getContext('2d');
    const maxW = Math.min(W * 0.86, 1100), maxH = H * 0.5;
    let px = clamp(W * 0.052, 26, 72), lines, lh;
    for (;;) {
      m.font = `700 ${px}px ${FAMILY}`;
      lines = wrap(msg, m, maxW, graphemes); lh = px * 1.28;
      if (lines.length * lh <= maxH || px <= 14) break;
      px = Math.max(14, px - 2);
    }
    if (lines.length > 40) { lines = lines.slice(0, 40); lines[39] += '…'; }
    const wmax = Math.max(10, ...lines.map((l) => m.measureText(l).width));
    const pad = 40, s = Math.min(dpr, 2);
    const bw = Math.ceil(wmax) + pad * 2, bh = Math.ceil(lines.length * lh) + pad * 2;
    const tc = FX.mkCanvas(bw * s, bh * s), g = tc.getContext('2d', { willReadFrequently: true });
    g.scale(s, s); g.font = `700 ${px}px ${FAMILY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const gr = g.createLinearGradient(0, pad, 0, bh - pad);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d6defa');
    g.fillStyle = gr;
    lines.forEach((l, i) => g.fillText(l, bw / 2, pad + lh * (i + 0.5)));
    const L = { tc, bw, bh, s, px, lh, bx: Math.round((W - bw) / 2), by: Math.round((H - bh) / 2 - H * 0.05), wc: null, glowC: null };
    // Working copy: dust cells are erased from it as they detach.
    L.resetWork = () => { L.wc = FX.mkCanvas(tc.width, tc.height); L.wc.getContext('2d').drawImage(tc, 0, 0); };
    L.makeGlow = (color) => {
      const c = FX.mkCanvas(tc.width, tc.height), gg = c.getContext('2d');
      gg.filter = `blur(${Math.round(14 * s)}px)`; gg.drawImage(tc, 0, 0); gg.filter = 'none';
      gg.globalCompositeOperation = 'source-in'; gg.fillStyle = color; gg.fillRect(0, 0, c.width, c.height);
      L.glowC = c;
    };
    L.dispose = () => { for (const c of [tc, L.wc, L.glowC]) if (c) { c.width = 1; c.height = 1; } L.wc = L.glowC = null; };
    return L;
  };

  // Draw the (possibly partly erased) message, optionally sliced for wobble / heat-haze / refraction.
  FX.drawText = (ctx, L, o = {}) => {
    const src = o.src || L.wc || L.tc; if (!src) return;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.blur > 0.3) ctx.filter = `blur(${o.blur.toFixed(1)}px)`;
    ctx.translate(L.bx + (o.ox || 0) + L.bw / 2, L.by + (o.oy || 0) + L.bh / 2);
    if (o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);
    ctx.translate(-L.bw / 2, -L.bh / 2);
    if (!o.dx) ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, L.bw, L.bh);
    else {
      const sh = o.sliceH || 3;
      for (let y = 0; y < L.bh; y += sh) {
        const hh = Math.min(sh, L.bh - y);
        ctx.drawImage(src, 0, y * L.s, src.width, hh * L.s, o.dx(L.by + y, y), y, L.bw, hh);
      }
    }
    ctx.restore();
  };

  // ---------- dust: the message converted to particles ----------
  FX.makeDust = (L, maxCount) => {
    const g = L.tc.getContext('2d', { willReadFrequently: true });
    const W = L.tc.width, H = L.tc.height, d = g.getImageData(0, 0, W, H).data;
    const sample = (step) => {
      const cs = Math.max(1, Math.round(step * L.s)), out = [];
      for (let y = 0; y < H; y += cs) for (let x = 0; x < W; x += cs) {
        const x1 = Math.min(W, x + cs), y1 = Math.min(H, y + cs);
        let r = 0, gg = 0, b = 0, n = 0;
        for (let yy = y; yy < y1; yy++) {
          let i = (yy * W + x) * 4;
          for (let xx = x; xx < x1; xx++, i += 4) if (d[i + 3] > 110) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
        }
        if (n) out.push({ hx: L.bx + x / L.s, hy: L.by + y / L.s, r: (r / n) | 0, g: (gg / n) | 0, b: (b / n) | 0, cs });
      }
      return out;
    };
    let step = 2, list = sample(step);
    if (list.length > maxCount) { step = Math.ceil(step * Math.sqrt(list.length / maxCount)); list = sample(step); }
    return { list, step };
  };

  FX.Dust = class {
    constructor(L, list, step) { this.L = L; this.all = list; this.step = step; this.free = []; this.ni = 0; this.nf = 0; this.cleared = false; }
    start(rtFn) {
      for (const p of this.all) { p.rt = rtFn(p); p.x = p.hx; p.y = p.hy; p.vx = p.vy = 0; p.age = 0; p.life = 2; p.sp = false; }
      this.all.sort((a, b) => a.rt - b.rt); this.ni = this.nf = 0; this.cleared = false; this.free.length = 0;
    }
    // Move particles through intact -> glowing -> free as time passes. Returns nothing; effect gets a callback per release.
    advance(t, gw, onRelease) {
      const n = this.all.length, wc = this.L.wc && this.L.wc.getContext('2d'), s = this.L.s;
      while (this.ni < n && this.all[this.ni].rt - gw <= t) this.ni++;
      while (this.nf < n && this.all[this.nf].rt <= t) {
        const p = this.all[this.nf++];
        if (wc) wc.clearRect((p.hx - this.L.bx) * s - 1, (p.hy - this.L.by) * s - 1, p.cs + 2, p.cs + 2);
        this.free.push(p); onRelease(p);
      }
      if (this.nf >= n && !this.cleared && wc) { wc.clearRect(0, 0, this.L.wc.width, this.L.wc.height); this.cleared = true; }
    }
    get glowing() { return this.all.slice(this.nf, this.ni); }
    dispose() { this.all.length = 0; this.free.length = 0; }
  };

  FX.mix = (c0, c1, t) => [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
})();
