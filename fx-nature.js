/* Water, Air, Glitch, Colour Burst and Fade effects (same interface as fx-fire.js). */
(() => {
  'use strict';
  const { clamp, lerp, rnd, smooth, noise } = FX;
  const reg = (name, cls) => ((FX.effects = FX.effects || {})[name] = cls);
  const TXT = [244, 247, 255];
  const idleText = (a, st, o = {}) => FX.drawText(a.ctx, a.L, Object.assign({ alpha: st.t < 0 ? st.intro : 1, blur: st.t < 0 ? (1 - st.intro) * 8 : 0, oy: st.t < 0 ? (1 - st.intro) * 14 : 0 }, o));
  const halo = (a, st, alpha) => { if (st.t < 0 && a.L.glowC) { const c = a.ctx; c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * st.intro; c.drawImage(a.L.glowC, a.L.bx, a.L.by, a.L.bw, a.L.bh); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; } };

  // ======================================================================= WATER
  class Water {
    constructor(a) {
      this.a = a; this.drops = []; this.splash = []; this.bubbles = []; this.ripples = []; this.acc = 0; this.bacc = 0; this.dust = null; this.level = 0; this.fix = 0; this.D = 3;
      this.lines = new FX.Lines(a.ctx); this.batch = new FX.Batch(a.ctx); this.initField(); a.L.makeGlow('rgba(90,190,255,0.9)');
    }
    initField() { this.n = Math.ceil(this.a.w / 6) + 2; this.H = new Float32Array(this.n); this.V = new Float32Array(this.n); this.ys = new Float32Array(this.n); }
    resize() { this.initField(); }
    begin(D) {
      const a = this.a, L = a.L; L.resetWork(); this.D = D; this.rel = FX.relWin(D);
      const d = FX.makeDust(L, Math.round(8000 * a.q)); this.dust = new FX.Dust(L, d.list, d.step);
      // Rain washes the message away from the top down.
      this.dust.start((p) => 0.15 + (((p.hy - L.by) / L.bh) * 0.72 + noise(p.hx * 0.02, p.hy * 0.02, 5) * 0.28) * this.rel * 0.9 + Math.random() * 0.05);
    }
    impulse(x, amt) { const i = (x / 6) | 0; for (let k = -2; k <= 2; k++) if (i + k > 0 && i + k < this.n - 1) this.V[i + k] += amt * (1 - Math.abs(k) / 3); }
    surf(x) { return this.a.h - this.level + this.H[clamp((x / 6) | 0, 0, this.n - 1)]; }
    update(dt, st) {
      const a = this.a, w = a.w, h = a.h, env = st.env, time = st.time, D = this.D;
      const fall = Math.min(3.5, D * 0.3);
      this.level = st.t < 0 ? h * 0.03 * st.intro : h * (0.03 + 0.5 * smooth(0, D * 0.55, st.t)) * (1 - smooth(D - fall, D, st.t));
      // Surface waves: fixed-step 1D wave equation, so ripples really travel and bounce.
      this.fix += Math.min(dt, 0.05);
      while (this.fix >= 1 / 60) { this.fix -= 1 / 60; const H = this.H, V = this.V, n = this.n; for (let i = 1; i < n - 1; i++) V[i] += (H[i - 1] + H[i + 1] - 2 * H[i]) * 0.28; for (let i = 1; i < n - 1; i++) { V[i] *= 0.992; H[i] += V[i]; } H[0] = H[1]; H[n - 1] = H[n - 2]; }
      this.acc += dt * 380 * (w / 1920 + 0.25) * a.q * env;
      while (this.acc >= 1) { this.acc--; const vy = rnd(1100, 1700) * a.sc; this.drops.push({ x: rnd(-60, w + 60), y: -20, vy, vx: -vy * 0.07 }); }
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i]; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y >= this.surf(d.x) || d.y > h + 30) {
          if (d.x > 0 && d.x < w) {
            this.impulse(d.x, rnd(1.5, 3.5) * a.sc);
            for (let k = 0, n = 3 + ((Math.random() * 4) | 0); k < n; k++) this.splash.push({ x: d.x, y: d.y, vx: rnd(-150, 150), vy: -rnd(150, 430) * a.sc, age: 0, life: rnd(0.35, 0.7) });
            if (Math.random() < 0.35) this.ripples.push({ x: d.x, y: this.a.h - this.level, r: 3, a: 0.55 });
          }
          this.drops[i] = this.drops[this.drops.length - 1]; this.drops.pop();
        }
      }
      for (let i = this.splash.length - 1; i >= 0; i--) { const s = this.splash[i]; s.age += dt; if (s.age >= s.life) { this.splash[i] = this.splash[this.splash.length - 1]; this.splash.pop(); continue; } s.vy += 1300 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
      for (let i = this.ripples.length - 1; i >= 0; i--) { const r = this.ripples[i]; r.r += 90 * dt; r.a -= 0.9 * dt; r.y = a.h - this.level; if (r.a <= 0) this.ripples.splice(i, 1); }
      this.bacc += dt * 18 * env * a.q;
      while (this.bacc >= 1 && this.level > 40) { this.bacc--; this.bubbles.push({ x: Math.random() * w, y: h - Math.random() * this.level * 0.9, vy: -rnd(60, 140), r: rnd(2, 6) * a.sc, ph: Math.random() * 6 }); }
      this.bacc = Math.min(this.bacc, 3);
      for (let i = this.bubbles.length - 1; i >= 0; i--) { const b = this.bubbles[i]; b.y += b.vy * dt; b.x += Math.sin(time * 3 + b.ph) * 14 * dt; if (b.y <= this.surf(b.x)) this.bubbles.splice(i, 1); }
      if (this.dust) {
        this.dust.advance(st.t, 0.3, (p) => { p.vx = rnd(-12, 12) - 8; p.vy = rnd(0, 40); p.life = 8; });
        const fr = this.dust.free;
        for (let i = fr.length - 1; i >= 0; i--) {
          const p = fr[i]; p.age += dt; p.vy += 900 * dt; p.vx -= 40 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y >= this.surf(p.x) || p.age > p.life) { if (p.y >= this.surf(p.x) && Math.random() < 0.05) this.impulse(p.x, 1.2); fr[i] = fr[fr.length - 1]; fr.pop(); }
        }
      }
    }
    draw(st) {
      const a = this.a, ctx = a.ctx, w = a.w, h = a.h, time = st.time, env = st.env, L = a.L, n = this.n, baseY = h - this.level;
      ctx.fillStyle = `rgba(10,50,110,${0.14 * env})`; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(0, 0, 0, h * 0.7); lg.addColorStop(0, `rgba(70,150,255,${0.12 * env})`); lg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      halo(a, st, 0.35);
      const prog = this.dust ? this.dust.nf / Math.max(1, this.dust.all.length) : 0;
      if (!this.dust || this.dust.nf < this.dust.all.length) {
        idleText(a, st, { dx: (ys) => (ys > baseY ? Math.sin(ys * 0.04 + time * 3) * 3.5 : Math.sin(ys * 0.1 + time * 5) * (0.4 + 1.6 * prog)) });
      }
      // streaks of rain
      const ln = this.lines;
      for (const d of this.drops) ln.add(190, 225, 255, 0.42, d.x, d.y, d.x - d.vx * 0.03, d.y - d.vy * 0.03);
      ln.flush(1.2);
      if (this.dust) {
        const D = this.dust, b = this.batch;
        for (let i = D.nf; i < D.ni; i++) { const p = D.all[i], g = clamp((st.t - (p.rt - 0.3)) / 0.3, 0, 1), c = FX.mix(TXT, [160, 222, 255], g); b.add(c[0], c[1], c[2], 1, p.hx - 0.5, p.hy - 0.5 + g * 2, D.step + 0.8); }
        b.flush();
        for (const p of D.free) ln.add(180, 228, 255, 0.85, p.x, p.y, p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ln.flush(2.4);
        for (const p of D.free) b.add(235, 248, 255, 0.95, p.x - 1, p.y - 1, 2.6);
        b.flush();
      }
      // splashes
      const b = this.batch;
      for (const s of this.splash) b.add(210, 240, 255, 1 - s.age / s.life, s.x, s.y, 2.4);
      b.flush();
      // water body
      if (this.level > 2) {
        const ys = this.ys;
        for (let i = 0; i < n; i++) { const x = i * 6; ys[i] = baseY + this.H[i] + Math.sin(x * 0.012 + time * 1.3) * 3 + Math.sin(x * 0.031 - time * 1.9) * 1.6; }
        const path = () => { ctx.beginPath(); ctx.moveTo(0, ys[0]); for (let i = 1; i < n; i++) ctx.lineTo(i * 6, ys[i]); };
        path(); ctx.lineTo(w + 8, h + 2); ctx.lineTo(0, h + 2); ctx.closePath();
        const g = ctx.createLinearGradient(0, baseY - 10, 0, h); g.addColorStop(0, 'rgba(70,175,255,0.42)'); g.addColorStop(1, 'rgba(4,40,105,0.9)');
        ctx.fillStyle = g; ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        if (this.level > 30) { // caustics: drifting light bands under the surface
          ctx.strokeStyle = 'rgba(150,225,255,0.07)'; ctx.lineWidth = 2.2; ctx.beginPath();
          for (let k = 0; k < 9; k++) { const y0 = baseY + 22 + k * ((this.level - 28) / 9); for (let x = 0; x <= w; x += 20) { const y = y0 + Math.sin(x * 0.018 + time * 1.4 + k * 1.7) * 7 + Math.sin(x * 0.05 - time * 2 + k) * 3; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(200,238,255,0.8)'; ctx.lineWidth = 1.6; path(); ctx.stroke();
        for (const r of this.ripples) { ctx.strokeStyle = `rgba(205,238,255,${r.a})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(r.x, r.y + 1, r.r, r.r * 0.14, 0, 0, FX.TAU); ctx.stroke(); }
        ctx.lineWidth = 1;
        for (const bb of this.bubbles) { ctx.strokeStyle = 'rgba(200,236,255,0.5)'; ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, FX.TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(bb.x - bb.r * 0.4, bb.y - bb.r * 0.5, 1.5, 1.5); }
      }
    }
    dispose() { for (const k of ['drops', 'splash', 'bubbles', 'ripples']) this[k].length = 0; if (this.dust) this.dust.dispose(); this.dust = null; }
  }
  reg('water', Water);

  // ======================================================================= AIR
  class Air {
    constructor(a) {
      this.a = a; this.rib = []; this.motes = []; this.dust = null; this.acc = 0; this.lead = 0.1; this.t = -1; this.rel = 2;
      this.lines = new FX.Lines(a.ctx); this.batch = new FX.Batch(a.ctx); a.L.makeGlow('rgba(190,220,255,0.8)');
      for (let i = 0, n = 140; i < n; i++) this.motes.push({ x: Math.random() * a.w, y: Math.random() * a.h, z: rnd(0.3, 1) });
    }
    begin(D) {
      const a = this.a, L = a.L; L.resetWork(); this.rel = FX.relWin(D);
      const d = FX.makeDust(L, Math.round(9000 * a.q)); this.dust = new FX.Dust(L, d.list, d.step);
      // The gust sweeps left to right; letters tear off as the front reaches them.
      this.dust.start((p) => this.lead + (((p.hx - L.bx) / L.bw) * 0.7 + noise(p.hx * 0.02, p.hy * 0.02, 5) * 0.3) * this.rel * 0.85 + Math.random() * 0.04);
    }
    wind(y, time, out) { const g = this.gust; const n = noise(y * 0.004, time * 0.8, 1); out[0] = (350 + 1000 * g) * (0.7 + 0.6 * n) * this.a.sc; out[1] = (n - 0.5) * 220 - 30 * g; }
    update(dt, st) {
      const a = this.a, w = a.w, h = a.h, time = st.time, env = st.env; this.t = st.t;
      this.gust = st.t < 0 ? 0.12 : 0.25 + 0.75 * smooth(0, 0.4, st.t) * (0.4 + 0.6 * env);
      this.acc += dt * 26 * a.q * (0.15 + env) * (h / 900 + 0.4) * (0.4 + this.gust);
      while (this.acc >= 1) { this.acc--; this.rib.push({ x: -rnd(60, 360), y: rnd(0, h), v: rnd(1100, 2200) * a.sc, len: rnd(180, 520) * a.sc, amp: rnd(6, 22), ph: rnd(0, 6), fr: rnd(0.008, 0.02), al: rnd(0.1, 0.28) }); }
      for (let i = this.rib.length - 1; i >= 0; i--) { const r = this.rib[i]; r.x += r.v * (0.35 + this.gust) * dt; if (r.x - r.len > w + 50) { this.rib[i] = this.rib[this.rib.length - 1]; this.rib.pop(); } }
      const wv = [0, 0];
      for (const m of this.motes) { this.wind(m.y, time, wv); m.x += wv[0] * 0.2 * m.z * dt; m.y += wv[1] * 0.15 * m.z * dt; if (m.x > w + 10) { m.x = -10; m.y = Math.random() * h; } if (m.y < -10) m.y = h + 10; if (m.y > h + 10) m.y = -10; }
      if (this.dust) {
        this.dust.advance(st.t, 0.0, (p) => { p.vx = rnd(150, 500); p.vy = rnd(-120, 40); p.life = rnd(1.6, 3.6); p.k = rnd(1.2, 3); });
        const fr = this.dust.free;
        for (let i = fr.length - 1; i >= 0; i--) {
          const p = fr[i]; p.age += dt;
          if (p.age >= p.life || p.x > w + 80) { fr[i] = fr[fr.length - 1]; fr.pop(); continue; }
          this.wind(p.y, time, wv); const k = 1 - Math.exp(-dt * p.k), tb = noise(p.x * 0.01, p.y * 0.01, time) - 0.5;
          p.vx += (wv[0] - p.vx) * k; p.vy += (wv[1] + tb * 700 - p.vy) * k; p.x += p.vx * dt; p.y += p.vy * dt;
        }
      }
    }
    draw(st) {
      const a = this.a, ctx = a.ctx, w = a.w, h = a.h, time = st.time, L = a.L, env = st.env;
      ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, `rgba(90,120,190,${0.06 * env})`); bg.addColorStop(1, `rgba(40,60,110,${0.08 * env})`); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      halo(a, st, 0.3);
      // text flutters harder as the gust front approaches
      const near = this.dust ? smooth(0, 0.3, st.t) * (1 - this.dust.nf / Math.max(1, this.dust.all.length)) : 0;
      if (!this.dust || this.dust.nf < this.dust.all.length) idleText(a, st, { ox: near * Math.sin(time * 33) * 2, dx: near > 0 ? (ys) => Math.sin(ys * 0.15 + time * 30) * 3.2 * near + near * 5 : null });
      // wind ribbons
      ctx.lineWidth = 1; ctx.lineCap = 'round';
      for (const r of this.rib) {
        const x0 = r.x, x1 = r.x - r.len, g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, 'rgba(210,230,255,0)'); g.addColorStop(0.25, `rgba(210,230,255,${r.al})`); g.addColorStop(1, 'rgba(210,230,255,0)');
        ctx.strokeStyle = g; ctx.beginPath();
        for (let j = 0; j <= 10; j++) { const px = x0 - (r.len * j) / 10, py = r.y + Math.sin(px * r.fr + r.ph + time * 3) * r.amp; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
      }
      const b = this.batch, ln = this.lines;
      for (const m of this.motes) b.add(220, 235, 255, 0.28 * m.z * (0.3 + env), m.x, m.y, 1.5 * m.z + 0.5);
      if (this.dust) {
        const D = this.dust;
        for (let i = D.nf; i < D.ni; i++) { const p = D.all[i]; b.add(244, 247, 255, 1, p.hx - 0.5, p.hy - 0.5, D.step + 0.8); }
        for (const p of D.free) { const u = p.age / p.life, sp = Math.hypot(p.vx, p.vy), len = Math.min(24, sp * 0.02), al = Math.pow(1 - u, 0.8); ln.add(225 - 40 * u, 238 - 20 * u, 255, al, p.x, p.y, p.x - (p.vx / (sp + 1)) * len, p.y - (p.vy / (sp + 1)) * len); }
        b.flush(); ln.flush(1.7);
      } else b.flush();
    }
    dispose() { this.rib.length = this.motes.length = 0; if (this.dust) this.dust.dispose(); this.dust = null; }
  }
  reg('air', Air);

  // ======================================================================= GLITCH
  class Glitch {
    constructor(a) {
      this.a = a; this.dust = null; this.tick = 0; this.bands = []; this.split = 0; this.mosh = []; this.nz = FX.mkCanvas(128, 72); this.nzc = this.nz.getContext('2d'); this.nzimg = this.nzc.createImageData(128, 72); this.nzf = 0;
      this.batch = new FX.Batch(a.ctx);
      const tint = (r, g, b) => { const c = FX.mkCanvas(a.L.tc.width, a.L.tc.height), x = c.getContext('2d'); x.drawImage(a.L.tc, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, c.width, c.height); return c; };
      this.R = tint(255, 0, 70); this.G = tint(0, 255, 140); this.B = tint(40, 120, 255);
      const sl = FX.mkCanvas(2, 3), sx = sl.getContext('2d'); sx.fillStyle = 'rgba(0,0,0,0.3)'; sx.fillRect(0, 0, 2, 1); this.scan = a.ctx.createPattern(sl, 'repeat');
      a.L.makeGlow('rgba(190,110,255,0.9)');
    }
    begin(D) {
      const a = this.a, L = a.L; L.resetWork(); this.rel = FX.relWin(D);
      const d = FX.makeDust(L, Math.round(3200 * a.q)); this.dust = new FX.Dust(L, d.list, d.step);
      this.dust.start((p) => 0.1 + (noise(Math.floor((p.hy - L.by) / 14) * 0.9, 3, 3) * 0.6 + Math.random() * 0.4) * this.rel * 0.9);
    }
    update(dt, st) {
      const a = this.a, L = a.L, env = st.env, time = st.time; this.tick -= dt;
      const hot = st.t < 0 ? (Math.floor(time * 0.7) !== Math.floor(time * 0.7 - dt * 0.7) && Math.random() < 0.5 ? 0.35 : 0.0) : 1;
      if (this.tick <= 0) {
        this.tick = rnd(0.05, 0.11); this.bands = [];
        for (let i = 0, k = Math.round(10 * hot * (0.4 + env)); i < k; i++) this.bands.push({ y: L.by + rnd(0, L.bh), h: rnd(4, 26), dx: rnd(-60, 60) * hot });
        this.split = hot ? rnd(1, 9) * hot * (0.5 + env) : 0; this.mosh = [];
        for (let i = 0, k = Math.round(4 * hot * env); i < k; i++) this.mosh.push({ sx: rnd(0, a.w * 0.8), sy: L.by + rnd(-20, L.bh), sw: rnd(80, 500), sh: rnd(6, 40), dx: rnd(-300, 300) });
        if (FX.Sound && st.t >= 0 && Math.random() < 0.5) FX.Sound.event('glitch');
      }
      if (this.dust) {
        this.dust.advance(st.t, 0.0, (p) => { const an = Math.random() < 0.8 ? (Math.random() < 0.5 ? 0 : Math.PI) : rnd(0, FX.TAU), sp = rnd(120, 1400) * a.sc; p.vx = Math.cos(an) * sp; p.vy = Math.sin(an) * sp * 0.3; p.life = rnd(0.8, 2.6); p.seed = Math.random(); p.col = Math.random() < 0.4 ? 0 : Math.random() < 0.5 ? 1 : 2; });
        const fr = this.dust.free;
        for (let i = fr.length - 1; i >= 0; i--) { const p = fr[i]; p.age += dt; if (p.age >= p.life) { fr[i] = fr[fr.length - 1]; fr.pop(); continue; } const d = Math.exp(-1.8 * dt); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt; }
      }
      if (--this.nzf <= 0) { this.nzf = 3; const d = this.nzimg.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = Math.random() < 0.4 ? 90 : 0; } this.nzc.putImageData(this.nzimg, 0, 0); }
    }
    draw(st) {
      const a = this.a, ctx = a.ctx, w = a.w, h = a.h, L = a.L, time = st.time, env = st.env;
      halo(a, st, 0.3);
      if (!this.dust || this.dust.nf < this.dust.all.length) {
        const bands = this.bands, dx = (ys) => { for (const b of bands) if (ys >= b.y && ys < b.y + b.h) return b.dx; return 0; };
        const al = st.t < 0 ? st.intro : 1;
        if (this.split > 0.5) {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al;
          for (const [c, o] of [[this.R, -this.split], [this.G, 0], [this.B, this.split]]) FX.drawText(ctx, L, { src: c === this.G && L.wc ? L.wc : c, ox: o, dx, alpha: al * 0.9 });
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        } else idleText(a, st, { dx });
      }
      if (this.dust) {
        const D = this.dust, b = this.batch, q4 = 4;
        for (let i = D.nf; i < D.ni; i++) { const p = D.all[i]; b.add(244, 247, 255, 1, p.hx - 0.5, p.hy - 0.5, D.step + 1); }
        const pal = [[0, 255, 220], [255, 40, 190], [244, 247, 255]];
        for (const p of D.free) {
          const u = p.age / p.life; if (((time * 22 + p.seed * 50) | 0) % 4 === 0) continue;
          const c = pal[p.col]; b.add(c[0], c[1], c[2], (1 - u) * 0.95, Math.round(p.x / q4) * q4, Math.round(p.y / q4) * q4, D.step);
        }
        b.flush();
      }
      // data-mosh: copy slices of what is already on screen to displaced positions
      if (this.mosh.length) {
        const cv = a.canvas, d = a.dpr; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
        for (const m of this.mosh) { try { ctx.drawImage(cv, m.sx * d, m.sy * d, m.sw * d, m.sh * d, (m.sx + m.dx) * d, m.sy * d, m.sw * d, m.sh * d); } catch { /* ignore */ } }
        ctx.restore();
      }
      // CRT: scanlines, rolling bar, static
      ctx.fillStyle = this.scan; ctx.globalAlpha = Math.min(1, 0.4 + env * 0.6); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      const by = ((time * 160) % (h + 240)) - 120, bg = ctx.createLinearGradient(0, by, 0, by + 120);
      bg.addColorStop(0, 'rgba(120,200,255,0)'); bg.addColorStop(0.5, `rgba(120,200,255,${0.05 * env})`); bg.addColorStop(1, 'rgba(120,200,255,0)'); ctx.fillStyle = bg; ctx.fillRect(0, by, w, 120);
      ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.06 * (0.3 + env); ctx.drawImage(this.nz, 0, 0, w, h); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'source-over';
    }
    dispose() { this.bands.length = this.mosh.length = 0; for (const c of [this.R, this.G, this.B, this.nz]) if (c) { c.width = 1; c.height = 1; } if (this.dust) this.dust.dispose(); this.dust = null; }
  }
  reg('glitch', Glitch);

  // ======================================================================= COLOUR BURST (Holi)
  const PAL = [[255, 45, 149], [255, 138, 0], [255, 212, 0], [34, 197, 94], [0, 200, 255], [139, 92, 246], [255, 80, 200]];
  const SPOTS = [[0.2, 0.85], [0.8, 0.8], [0.5, 0.52], [0.1, 0.4], [0.9, 0.38], [0.35, 0.15], [0.68, 0.2]];
  class Burst {
    constructor(a) {
      this.a = a; this.parts = []; this.clouds = []; this.bursts = []; this.washes = []; this.dust = null; this.fired = 0; this.motes = [];
      this.dot = PAL.map((c) => FX.glow(c[0], c[1], c[2], 48, 1)); this.cloudSpr = PAL.map((c, i) => FX.puffSprite(c[0], c[1], c[2], 128, i + 11));
      this.batch = new FX.Batch(a.ctx); a.L.makeGlow('rgba(255,120,200,0.8)');
      for (let i = 0; i < 40; i++) this.motes.push({ x: Math.random() * a.w, y: Math.random() * a.h, c: i % PAL.length, ph: Math.random() * 6 });
    }
    begin(D) {
      const a = this.a, L = a.L; L.resetWork(); this.rel = FX.relWin(D);
      const n = clamp(Math.round(3 + this.rel * 0.7), 4, 7), start = [...SPOTS.keys()].sort(() => Math.random() - 0.5);
      this.bursts = Array.from({ length: n }, (_, k) => { const s = SPOTS[start[k]]; return { x: s[0] * a.w, y: s[1] * a.h, t: 0.05 + (k * this.rel * 0.9) / n, c1: (k * 2) % PAL.length, c2: (k * 2 + 3) % PAL.length, done: false }; });
      const d = FX.makeDust(L, Math.round(8000 * a.q)); this.dust = new FX.Dust(L, d.list, d.step);
      this.dust.start((p) => { let best = 0, bd = 1e9; this.bursts.forEach((b, k) => { const dd = Math.hypot(p.hx - b.x, p.hy - b.y) + Math.random() * 180; if (dd < bd) { bd = dd; best = k; } }); p.k = best; const b = this.bursts[best]; return b.t + 0.06 + Math.hypot(p.hx - b.x, p.hy - b.y) / 1800; });
    }
    fire(b) {
      const a = this.a, q = a.q, sc = a.sc; b.done = true; if (FX.Sound) FX.Sound.event('pop');
      for (let i = 0, n = 200 * q; i < n; i++) { const an = rnd(0, FX.TAU), sp = rnd(120, 1100) * Math.pow(Math.random(), 0.7) * sc; this.parts.push({ x: b.x, y: b.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, s: rnd(3, 9) * sc, c: Math.random() < 0.6 ? b.c1 : Math.random() < 0.6 ? b.c2 : (Math.random() * PAL.length) | 0, age: 0, life: rnd(2.2, 4.5) }); }
      for (let i = 0; i < 12; i++) { const an = rnd(0, FX.TAU), sp = rnd(40, 300) * sc; this.clouds.push({ x: b.x, y: b.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, size: rnd(120, 260) * sc, age: 0, life: rnd(2.5, 3.6), c: i % 2 ? b.c1 : b.c2 }); }
      this.washes.push({ x: b.x, y: b.y, c: b.c1, age: 0 });
    }
    update(dt, st) {
      const a = this.a, w = a.w, h = a.h, time = st.time;
      if (this.dust) {
        for (const b of this.bursts) if (!b.done && st.t >= b.t) this.fire(b);
        this.dust.advance(st.t, 0, (p) => { const b = this.bursts[p.k], an = Math.atan2(p.hy - b.y, p.hx - b.x) + rnd(-0.4, 0.4), sp = rnd(250, 900) * a.sc; p.vx = Math.cos(an) * sp; p.vy = Math.sin(an) * sp - 80; p.life = rnd(2, 4); p.c = Math.random() < 0.7 ? b.c1 : b.c2; });
        const fr = this.dust.free;
        for (let i = fr.length - 1; i >= 0; i--) { const p = fr[i]; p.age += dt; if (p.age >= p.life) { fr[i] = fr[fr.length - 1]; fr.pop(); continue; } const d = Math.exp(-2.2 * dt); p.vx = p.vx * d + Math.sin(time + p.hx) * 8 * dt; p.vy = p.vy * d + 90 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      }
      for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.age += dt; if (p.age >= p.life) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; } const d = Math.exp(-3.2 * dt); p.vx = p.vx * d + Math.sin(time * 0.8 + i) * 10 * dt; p.vy = p.vy * d + 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      for (let i = this.clouds.length - 1; i >= 0; i--) { const c = this.clouds[i]; c.age += dt; if (c.age >= c.life) { this.clouds.splice(i, 1); continue; } const d = Math.exp(-2.4 * dt); c.vx *= d; c.vy = c.vy * d + 12 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.size += 90 * dt; }
      for (let i = this.washes.length - 1; i >= 0; i--) { this.washes[i].age += dt; if (this.washes[i].age > 1.6) this.washes.splice(i, 1); }
      for (const m of this.motes) { m.y += Math.sin(time + m.ph) * 8 * dt - 6 * dt; m.x += Math.cos(time * 0.7 + m.ph) * 10 * dt; if (m.y < -5) m.y = h + 5; }
    }
    draw(st) {
      const a = this.a, ctx = a.ctx, w = a.w, h = a.h, L = a.L, time = st.time, env = st.env;
      ctx.globalCompositeOperation = 'lighter';
      for (const wsh of this.washes) { const c = PAL[wsh.c], al = 0.22 * Math.exp(-wsh.age * 2.2), g = ctx.createRadialGradient(wsh.x, wsh.y, 0, wsh.x, wsh.y, Math.max(w, h) * 0.6); g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${al})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
      for (const m of this.motes) { ctx.globalAlpha = 0.25 * (0.3 + env) * (0.6 + 0.4 * Math.sin(time * 2 + m.ph)); ctx.drawImage(this.dot[m.c], m.x - 5, m.y - 5, 10, 10); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      halo(a, st, 0.3);
      if (!this.dust || this.dust.nf < this.dust.all.length) idleText(a, st);
      for (const c of this.clouds) { const u = c.age / c.life; ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.34; ctx.drawImage(this.cloudSpr[c.c], c.x - c.size / 2, c.y - c.size / 2, c.size, c.size); }
      ctx.globalAlpha = 1;
      for (const p of this.parts) { const u = p.age / p.life, s = p.s * (1 + u * 0.4) * 2.2; ctx.globalAlpha = (u < 0.6 ? 0.75 : 0.75 * (1 - (u - 0.6) / 0.4)); ctx.drawImage(this.dot[p.c], p.x - s, p.y - s, s * 2, s * 2); }
      ctx.globalAlpha = 1;
      if (this.dust) {
        const D = this.dust, b = this.batch;
        for (let i = D.nf; i < D.ni; i++) { const p = D.all[i]; b.add(244, 247, 255, 1, p.hx - 0.5, p.hy - 0.5, D.step + 0.8); }
        for (const p of D.free) { const u = p.age / p.life, c = PAL[p.c], f = u < 0.15 ? FX.mix(TXT, c, u / 0.15) : c; b.add(f[0], f[1], f[2], u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35, p.x, p.y, D.step * (1 + u * 0.5)); }
        b.flush();
      }
    }
    dispose() { for (const k of ['parts', 'clouds', 'washes', 'bursts']) this[k].length = 0; if (this.dust) this.dust.dispose(); this.dust = null; }
  }
  reg('burst', Burst);

  // ======================================================================= FADE
  class Fade {
    constructor(a) { this.a = a; this.motes = Array.from({ length: 36 }, () => ({ x: Math.random() * a.w, y: Math.random() * a.h, ph: Math.random() * 6, s: rnd(4, 10) })); this.dot = FX.glow(190, 190, 255, 32, 0.8); this.D = 1; a.L.makeGlow('rgba(170,170,255,0.8)'); }
    begin(D) { this.D = Math.max(0.25, D); }
    update(dt, st) { const h = this.a.h; for (const m of this.motes) { m.y -= (6 + m.s * 2) * dt; m.x += Math.sin(st.time * 0.6 + m.ph) * 8 * dt; if (m.y < -10) m.y = h + 10; } }
    draw(st) {
      const a = this.a, ctx = a.ctx, L = a.L, p = st.t < 0 ? 0 : clamp(st.t / this.D, 0, 1), e = smooth(0, 1, p);
      ctx.globalCompositeOperation = 'lighter';
      for (const m of this.motes) { ctx.globalAlpha = 0.22 * st.env * (0.5 + 0.5 * Math.sin(st.time + m.ph)); ctx.drawImage(this.dot, m.x - m.s, m.y - m.s, m.s * 2, m.s * 2); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      halo(a, st, 0.3);
      if (p < 1) FX.drawText(ctx, L, { src: L.tc, alpha: st.t < 0 ? st.intro : 1 - e, blur: st.t < 0 ? (1 - st.intro) * 8 : e * 18, scale: 1 + e * 0.04, oy: st.t < 0 ? (1 - st.intro) * 14 : 0 });
    }
    dispose() {}
  }
  reg('fade', Fade);
})();
