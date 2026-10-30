/* Fire, Bomb and Smoke effects. Each effect has: begin(D) / update(dt, st) / draw(st) / dispose().
   st = { t: seconds since vanish started (-1 while the message is still readable), D, env: 0..1, time, intro } */
(() => {
  'use strict';
  const { clamp, lerp, rnd, smooth, noise } = FX;
  const reg = (name, cls) => ((FX.effects = FX.effects || {})[name] = cls);
  const TXT = [244, 247, 255];

  // ======================================================================= FIRE
  class Fire {
    constructor(a) {
      this.a = a; this.flames = []; this.sparks = []; this.acc = 0; this.sacc = 0; this.dust = null;
      this.ramp = FX.flameRamp(16, 96); this.spark = FX.glow(255, 190, 90, 48, 1);
      this.batch = new FX.Batch(a.ctx); this.flick = 1; this.burnP = 0;
      a.L.makeGlow('rgba(255,120,40,0.9)');
    }
    begin(D) {
      const a = this.a, L = a.L; L.resetWork();
      const d = FX.makeDust(L, Math.round(9000 * a.q)); this.dust = new FX.Dust(L, d.list, d.step);
      this.rel = FX.relWin(D);
      // Fire climbs from the bottom of the message to the top, with a ragged, noisy front.
      this.dust.start((p) => 0.15 + (((L.by + L.bh - p.hy) / L.bh) * 0.72 + noise(p.hx * 0.02, p.hy * 0.02, 3) * 0.28) * this.rel * 0.9 + Math.random() * 0.05);
    }
    release(p) {
      p.life = rnd(1.2, 3.4); p.vx = rnd(-35, 35); p.vy = -rnd(30, 150); p.sp = Math.random() < 0.05;
      if (Math.random() < 0.16 * this.a.q) this.flames.push({ x: p.x, y: p.y, vx: 0, vy: -rnd(60, 180), age: 0, life: rnd(0.5, 1), size: rnd(26, 60) * this.a.sc });
    }
    update(dt, st) {
      const a = this.a, w = a.w, h = a.h, time = st.time, env = st.env;
      this.flick = 0.85 + 0.15 * noise(time * 7, 0, 1) + 0.05 * Math.sin(time * 23);
      const hs = 0.35 + 0.65 * (this.rel ? smooth(0, this.rel * 0.9, st.t) : 0);
      this.acc += dt * 520 * (w / 1920 + 0.25) * a.q * env;
      while (this.acc >= 1) {
        this.acc--;
        const x = Math.random() * w, ci = noise(x * 0.004, time * 0.6, 2);
        if (Math.random() > 0.3 + 0.7 * ci) continue;
        this.flames.push({ x, y: h + 20, vx: rnd(-40, 40), vy: -(h * (0.28 + 0.55 * ci) + rnd(0, h * 0.2)) * hs, age: 0, life: rnd(0.9, 1.7), size: rnd(70, 170) * a.sc });
      }
      this.sacc += dt * 90 * (w / 1920 + 0.3) * a.q * env;
      while (this.sacc >= 1) { this.sacc--; this.sparks.push({ x: Math.random() * w, y: h - Math.random() * h * 0.15, vx: rnd(-60, 60), vy: -rnd(80, 300), age: 0, life: rnd(2, 5), size: rnd(5, 12) * a.sc, seed: Math.random() * 10 }); }

      if (this.dust) {
        this.dust.advance(st.t, 0.35, (p) => this.release(p));
        const fr = this.dust.free;
        for (let i = fr.length - 1; i >= 0; i--) {
          const p = fr[i]; p.age += dt;
          if (p.age >= p.life) { fr[i] = fr[fr.length - 1]; fr.pop(); continue; }
          const u = p.age / p.life, n = noise(p.x * 0.012, p.y * 0.012, time * 0.7);
          p.vx += ((n - 0.5) * 420 + 40) * dt; p.vy += (-90 * (1 - u) + 30 * u) * dt;
          const dr = Math.exp(-0.8 * dt); p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt;
        }
        this.burnP = this.dust.nf / Math.max(1, this.dust.all.length);
      }
      for (let i = this.flames.length - 1; i >= 0; i--) {
        const f = this.flames[i]; f.age += dt;
        if (f.age >= f.life) { this.flames[i] = this.flames[this.flames.length - 1]; this.flames.pop(); continue; }
        const n = noise(f.x * 0.006, f.y * 0.004 - time * 1.6, time * 0.4);
        f.vx += (n - 0.5) * 1400 * dt; f.vx *= Math.exp(-1.2 * dt); f.vy -= 120 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      }
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i]; s.age += dt;
        if (s.age >= s.life || s.y < -20) { this.sparks[i] = this.sparks[this.sparks.length - 1]; this.sparks.pop(); continue; }
        const n = noise(s.x * 0.01, s.y * 0.01, time * 0.8 + s.seed); s.vx += (n - 0.5) * 500 * dt; s.vx *= Math.exp(-0.5 * dt); s.x += s.vx * dt; s.y += s.vy * dt;
      }
    }
    draw(st) {
      const a = this.a, ctx = a.ctx, w = a.w, h = a.h, env = st.env, time = st.time;
      // Warm light thrown up from the flames.
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(w / 2, h * 1.05, 0, w / 2, h * 1.05, Math.max(w, h) * 0.8);
      gr.addColorStop(0, `rgba(255,120,30,${0.42 * env * this.flick})`); gr.addColorStop(0.5, `rgba(200,50,10,${0.16 * env * this.flick})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      // Message: heat-haze shimmer grows as the fire takes hold.
      const amp = 0.6 + 3 * this.burnP + (st.t >= 0 ? 1.5 : 0);
      if (st.t < 0 && this.a.L.glowC) { ctx.globalAlpha = 0.35 * st.intro; ctx.drawImage(a.L.glowC, a.L.bx, a.L.by, a.L.bw, a.L.bh); ctx.globalAlpha = 1; }
      ctx.globalCompositeOperation = 'source-over';
      FX.drawText(ctx, a.L, { alpha: st.t < 0 ? st.intro : 1, blur: st.t < 0 ? (1 - st.intro) * 8 : 0, oy: st.t < 0 ? (1 - st.intro) * 14 : 0, dx: (ys) => Math.sin(ys * 0.045 + time * 9) * amp * (0.6 + 0.4 * noise(ys * 0.02, time, 1)) });
      const b = this.batch;
      if (this.dust) {
        const D = this.dust, t = st.t;
        for (let i = D.nf; i < D.ni; i++) {  // glowing edge: text heats up before it lets go
          const p = D.all[i], g = clamp((t - (p.rt - 0.35)) / 0.35, 0, 1);
          const c = g < 0.5 ? FX.mix(TXT, [255, 160, 50], g * 2) : FX.mix([255, 160, 50], [255, 235, 180], (g - 0.5) * 2);
          b.add(c[0], c[1], c[2], 1, p.hx - 0.5, p.hy - 0.5, D.step + 1);
        }
        for (const p of D.free) {
          const u = p.age / p.life, hot = u < 0.55;
          const c = hot ? FX.fireColor((u / 0.55) * 0.8) : FX.mix([120, 40, 20], [78, 72, 74], (u - 0.55) / 0.45);
          const al = hot ? 1 : 1 - (u - 0.55) / 0.45, sz = D.step * (1 - 0.5 * u) + 0.4;
          b.add(c[0], c[1], c[2], al * 0.95, p.x, p.y, sz);
        }
        b.flush();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of D.free) if (p.sp) { const u = p.age / p.life, s = 14 * a.sc * (1 - u) * (0.7 + 0.3 * Math.sin(time * 30 + p.seed)); if (s > 1) { ctx.globalAlpha = 0.8 * (1 - u); ctx.drawImage(this.spark, p.x - s, p.y - s, s * 2, s * 2); } }
        ctx.globalAlpha = 1;
      }
      // Flames (additive so overlaps burn white-hot).
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.flames) {
        const u = f.age / f.life, sw = f.size * (1 - u * 0.55) * 0.8, sh = f.size * (1 + 0.2 * (1 - u));
        ctx.globalAlpha = (u < 0.1 ? u / 0.1 : 1) * Math.pow(1 - u, 1.3) * 0.75;
        ctx.drawImage(this.ramp[Math.min(15, (u * 16) | 0)], f.x - sw / 2, f.y - sh * 0.65, sw, sh);
      }
      for (const s of this.sparks) {
        const u = s.age / s.life, fl = 0.6 + 0.4 * Math.sin(time * 18 + s.seed * 7), z = s.size * (1 - u * 0.5) * fl;
        ctx.globalAlpha = (1 - u) * 0.9; ctx.drawImage(this.spark, s.x - z, s.y - z, z * 2, z * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    dispose() { this.flames.length = this.sparks.length = 0; if (this.dust) this.dust.dispose(); this.dust = null; }
  }
  reg('fire', Fire);

  // ======================================================================= BOMB
  class Bomb {
    constructor(a) {
      this.a = a; this.dust = null; this.boomed = false; this.age = 0; this.fire = []; this.puffs = []; this.debris = []; this.sparks = []; this.rings = [];
      this.ramp = FX.flameRamp(16, 96); this.batch = new FX.Batch(a.ctx); this.lines = new FX.Lines(a.ctx);
      this.smokeRamp = Array.from({ length: 8 }, (_, i) => { const c = FX.mix([255, 150, 70], [105, 106, 116], clamp(i / 5, 0, 1)); return FX.puffSprite(c[0] | 0, c[1] | 0, c[2] | 0, 128, i + 3); });
      this.spark = FX.glow(255, 200, 110, 48, 1); this.flash = 0; this.shake = 0; this.idleSp = []; this.acc = 0;
      a.L.makeGlow('rgba(255,90,60,0.8)');
    }
    begin(D) {
      const a = this.a, L = a.L; L.resetWork();
      this.D = D; this.tB = Math.min(0.75, D * 0.2); this.ex = L.bx + L.bw / 2; this.ey = L.by + L.bh / 2;
      this.ws = 1100 * a.sc; this.sh = 1;
      const d = FX.makeDust(L, Math.round(8000 * a.q)); this.dust = new FX.Dust(L, d.list, d.step);
      this.dust.start((p) => this.tB + Math.hypot(p.hx - this.ex, p.hy - this.ey) / this.ws + Math.random() * 0.03);
    }
    explode() {
      const a = this.a, sc = a.sc, ex = this.ex, ey = this.ey, q = a.q; this.boomed = true; this.age = 0; this.flash = 1; this.shake = 1;
      if (FX.Sound) FX.Sound.event('boom');
      for (let i = 0, n = 140 * q; i < n; i++) { const an = rnd(0, FX.TAU), sp = rnd(60, 620) * Math.pow(Math.random(), 0.6) * sc; this.fire.push({ x: ex + Math.cos(an) * rnd(0, 40), y: ey + Math.sin(an) * rnd(0, 40), vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.9, age: 0, life: rnd(0.7, 1.5) * Math.min(1, 0.5 + this.D * 0.3), size: rnd(90, 260) * sc }); }
      for (let i = 0, n = 110 * q; i < n; i++) { const an = rnd(0, FX.TAU), sp = rnd(20, 380) * sc; this.puffs.push({ x: ex, y: ey, vx: Math.cos(an) * sp * 0.6, vy: Math.sin(an) * sp * 0.4 - rnd(20, 120), size: rnd(110, 300) * sc, age: 0, life: rnd(2.5, 5.5) * Math.min(1, 0.4 + this.D * 0.2), al: rnd(0.07, 0.17), rot: rnd(0, 6) }); }
      for (let i = 0, n = 64 * q; i < n; i++) { const an = rnd(0, FX.TAU), sp = rnd(300, 1250) * sc, k = 3 + ((Math.random() * 3) | 0); this.debris.push({ x: ex, y: ey, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 250, rot: rnd(0, 6), vr: rnd(-12, 12), s: rnd(4, 14) * sc, v: Array.from({ length: k }, (_, j) => [Math.cos(j / k * FX.TAU) * rnd(0.5, 1), Math.sin(j / k * FX.TAU) * rnd(0.5, 1)]), age: 0, life: rnd(1.4, 2.8) }); }
      for (let i = 0, n = 260 * q; i < n; i++) { const an = rnd(0, FX.TAU), sp = rnd(400, 1600) * sc; this.sparks.push({ x: ex, y: ey, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, age: 0, life: rnd(0.5, 1.7) }); }
      const R = Math.max(a.w, a.h) * 1.15;
      this.rings.push({ r: 10, v: this.ws * 1.15, R, w: 70 * sc, a: 1 }, { r: 0, v: this.ws * 0.62, R: R * 0.8, w: 120 * sc, a: 0.55 });
    }
    update(dt, st) {
      const a = this.a, time = st.time;
      if (!this.dust) { // idle: a faint ember trickle so the page feels alive
        this.acc += dt * 8 * st.env * a.q;
        while (this.acc >= 1) { this.acc--; this.idleSp.push({ x: Math.random() * a.w, y: a.h + 10, vy: -rnd(40, 120), age: 0, life: rnd(2, 4) }); }
        for (let i = this.idleSp.length - 1; i >= 0; i--) { const s = this.idleSp[i]; s.age += dt; s.y += s.vy * dt; s.x += Math.sin(time * 2 + i) * 12 * dt; if (s.age > s.life) this.idleSp.splice(i, 1); }
        return;
      }
      if (!this.boomed && st.t >= this.tB) this.explode();
      if (this.boomed) {
        this.age += dt; this.flash = Math.max(0, 1 - this.age / 0.22); this.shake = Math.pow(Math.max(0, 1 - this.age / 0.9), 2);
        for (const r of this.rings) { r.r += r.v * dt; r.v *= Math.exp(-0.5 * dt); r.a *= Math.exp(-0.9 * dt); }
        this.rings = this.rings.filter((r) => r.r < r.R + 100 && r.a > 0.02);
        const env = st.env;
        for (let i = this.fire.length - 1; i >= 0; i--) { const f = this.fire[i]; f.age += dt; if (f.age >= f.life) { this.fire[i] = this.fire[this.fire.length - 1]; this.fire.pop(); continue; } const d = Math.exp(-2.2 * dt); f.vx *= d; f.vy = f.vy * d - 60 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
        for (let i = this.puffs.length - 1; i >= 0; i--) { const p = this.puffs[i]; p.age += dt; if (p.age >= p.life) { this.puffs[i] = this.puffs[this.puffs.length - 1]; this.puffs.pop(); continue; } const d = Math.exp(-0.9 * dt); p.vx *= d; p.vy = p.vy * d - 25 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.size += 26 * dt; }
        for (let i = this.debris.length - 1; i >= 0; i--) { const p = this.debris[i]; p.age += dt; if (p.age >= p.life) { this.debris[i] = this.debris[this.debris.length - 1]; this.debris.pop(); continue; } p.vy += 1400 * dt; p.vx *= Math.exp(-0.5 * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
        for (let i = this.sparks.length - 1; i >= 0; i--) { const p = this.sparks[i]; p.age += dt; if (p.age >= p.life) { this.sparks[i] = this.sparks[this.sparks.length - 1]; this.sparks.pop(); continue; } const d = Math.exp(-1.5 * dt); p.vx *= d; p.vy = p.vy * d + 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        // Smoke keeps boiling off the crater while the animation is still running.
        if (env > 0.25 && Math.random() < dt * 14 * a.q) this.puffs.push({ x: this.ex + rnd(-90, 90), y: this.ey + rnd(0, 60), vx: rnd(-20, 20), vy: -rnd(30, 90), size: rnd(110, 220) * a.sc, age: 0, life: rnd(2.5, 4), al: rnd(0.05, 0.1), rot: rnd(0, 6) });
      }
      this.dust.advance(st.t, 0.0, (p) => {
        const an = Math.atan2(p.hy - this.ey, p.hx - this.ex) + rnd(-0.25, 0.25), d = Math.hypot(p.hx - this.ex, p.hy - this.ey), sp = rnd(450, 1300) * a.sc * (1 - clamp(d / 900, 0, 0.5));
        p.vx = Math.cos(an) * sp; p.vy = Math.sin(an) * sp - rnd(0, 150); p.life = rnd(1.2, 3); p.sp = Math.random() < 0.04;
      });
      const fr = this.dust.free;
      for (let i = fr.length - 1; i >= 0; i--) {
        const p = fr[i]; p.age += dt;
        if (p.age >= p.life) { fr[i] = fr[fr.length - 1]; fr.pop(); continue; }
        const d = Math.exp(-1.4 * dt); p.vx *= d; p.vy = p.vy * d + 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    draw(st) {
      const a = this.a, ctx = a.ctx, w = a.w, h = a.h, time = st.time, L = a.L, sc = a.sc;
      ctx.save();
      if (this.boomed && this.shake > 0.01) { const A = 22 * sc * this.shake; ctx.translate((noise(time * 40, 0, 4) - 0.5) * 2 * A, (noise(time * 40, 9, 5) - 0.5) * 2 * A); }
      // Fuse: message trembles and the edges glow red while it waits to blow.
      const pre = this.dust && !this.boomed ? smooth(0, this.tB, st.t) : 0;
      if (st.t < 0 || pre > 0) {
        if (L.glowC) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (st.t < 0 ? 0.25 * st.intro : 0.25 + 0.5 * pre * (0.6 + 0.4 * Math.sin(time * 40))); ctx.drawImage(L.glowC, L.bx, L.by, L.bw, L.bh); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      }
      if (st.t < 0 || !this.boomed || this.dust.nf < this.dust.all.length) {
        FX.drawText(ctx, L, { alpha: st.t < 0 ? st.intro : 1, blur: st.t < 0 ? (1 - st.intro) * 8 : 0, oy: st.t < 0 ? (1 - st.intro) * 14 : 0, ox: pre * (noise(time * 50, 1, 2) - 0.5) * 6, dx: pre > 0 ? () => (Math.random() - 0.5) * 5 * pre : null });
      }
      if (st.t < 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffb06a'; for (const s of this.idleSp) { ctx.globalAlpha = 0.6 * (1 - s.age / s.life); ctx.fillRect(s.x, s.y, 2, 2); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; return ctx.restore(); }
      if (this.boomed) {
        // lingering glow of the explosion
        ctx.globalCompositeOperation = 'lighter';
        const gl = Math.exp(-this.age * 1.3) * 0.45, g2 = ctx.createRadialGradient(this.ex, this.ey, 0, this.ex, this.ey, Math.max(w, h) * 0.6);
        g2.addColorStop(0, `rgba(255,150,60,${gl})`); g2.addColorStop(0.5, `rgba(180,50,10,${gl * 0.4})`); g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2; ctx.fillRect(-40, -40, w + 80, h + 80);
        for (const r of this.rings) {
          const gr = ctx.createRadialGradient(this.ex, this.ey, Math.max(0, r.r - r.w), this.ex, this.ey, r.r + 22);
          gr.addColorStop(0, 'rgba(255,170,90,0)'); gr.addColorStop(0.75, `rgba(255,190,110,${0.16 * r.a})`); gr.addColorStop(0.93, `rgba(255,245,228,${0.5 * r.a})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
          ctx.fillStyle = gr; ctx.fillRect(-40, -40, w + 80, h + 80);
        }
        ctx.globalCompositeOperation = 'source-over';
        for (const p of this.puffs) { const u = p.age / p.life, i = Math.min(7, ((p.age / 1.1) * 7) | 0); ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, u * 1.15)) * p.al * 1.8; const s = p.size; ctx.drawImage(this.smokeRamp[i], p.x - s / 2, p.y - s / 2, s, s); }
        ctx.globalAlpha = 1;
        // dust of the message
        const b = this.batch, D = this.dust;
        for (const p of D.free) { const u = p.age / p.life, hot = u < 0.5, c = hot ? FX.fireColor(u / 0.5 * 0.75) : FX.mix([130, 50, 25], [70, 66, 68], (u - 0.5) / 0.5); b.add(c[0], c[1], c[2], hot ? 1 : 1 - (u - 0.5) / 0.5, p.x, p.y, D.step * (1 - 0.4 * u) + 0.4); }
        b.flush();
        ctx.globalCompositeOperation = 'lighter';
        for (const f of this.fire) { const u = f.age / f.life, s = f.size * (0.5 + 0.7 * u); ctx.globalAlpha = (u < 0.08 ? u / 0.08 : 1) * Math.pow(1 - u, 1.2) * 0.8; ctx.drawImage(this.ramp[Math.min(15, (u * 16) | 0)], f.x - s / 2, f.y - s / 2, s, s); }
        ctx.globalAlpha = 1;
        const ln = this.lines;
        for (const p of this.sparks) { const u = p.age / p.life, c = FX.fireColor(u * 0.6); ln.add(c[0], c[1], c[2], 1 - u, p.x, p.y, p.x - p.vx * 0.03, p.y - p.vy * 0.03); }
        ln.flush(1.6);
        ctx.globalCompositeOperation = 'source-over';
        for (const p of this.debris) {
          const u = p.age / p.life, cr = Math.cos(p.rot), sr = Math.sin(p.rot);
          ctx.beginPath(); p.v.forEach(([vx, vy], j) => { const x = p.x + (vx * cr - vy * sr) * p.s, y = p.y + (vx * sr + vy * cr) * p.s; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
          ctx.globalAlpha = 1 - u * u; ctx.fillStyle = '#17120f'; ctx.fill();
          if (p.age < 0.7) { ctx.strokeStyle = `rgba(255,${(150 - p.age * 150) | 0},40,${1 - p.age / 0.7})`; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
        if (this.flash > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,236,205,${0.8 * Math.pow(this.flash, 1.5)})`; ctx.fillRect(-40, -40, w + 80, h + 80); ctx.globalCompositeOperation = 'source-over'; }
      }
      ctx.restore();
    }
    dispose() { for (const k of ['fire', 'puffs', 'debris', 'sparks', 'rings', 'idleSp']) this[k].length = 0; if (this.dust) this.dust.dispose(); this.dust = null; }
  }
  reg('bomb', Bomb);

  // ======================================================================= SMOKE
  class Smoke {
    constructor(a) {
      this.a = a; this.puffs = []; this.wisps = []; this.dust = null; this.acc = 0; this.v = [0, 0];
      this.sprites = [1, 2, 3, 4].map((i) => FX.puffSprite(214, 220, 232, 128, i * 5));
      this.batch = new FX.Batch(a.ctx); a.L.makeGlow('rgba(170,180,215,0.8)');
    }
    begin(D) {
      const a = this.a, L = a.L; L.resetWork();
      const d = FX.makeDust(L, Math.round(7000 * a.q)); this.dust = new FX.Dust(L, d.list, d.step);
      this.rel = FX.relWin(D);
      // Mist eats the message in organic patches rather than in a straight sweep.
      this.dust.start((p) => 0.1 + (noise(p.hx * 0.012, p.hy * 0.012, 7) * 0.65 + Math.random() * 0.35) * this.rel * 0.9);
      this.n = 0;
    }
    addPuff(x, y, big) {
      this.puffs.push({ x, y, vx: rnd(-15, 15), vy: -rnd(15, 55), size: (big ? rnd(200, 420) : rnd(40, 120)) * this.a.sc, grow: (big ? rnd(30, 70) : rnd(40, 110)) * this.a.sc, age: 0, life: big ? rnd(5, 9) : rnd(2.2, 4.5), al: big ? rnd(0.05, 0.1) : rnd(0.1, 0.2), spr: (Math.random() * 4) | 0, seed: Math.random() * 20 });
    }
    update(dt, st) {
      const a = this.a, w = a.w, h = a.h, time = st.time, env = st.env, v = this.v;
      this.acc += dt * 3.2 * a.q * env * (w / 1920 + 0.3);
      while (this.acc >= 1) { this.acc--; this.addPuff(Math.random() * w, h + 60, true); }
      if (this.dust) {
        this.dust.advance(st.t, 0.0, (p) => {
          this.n++;
          p.life = rnd(1.4, 3.2); p.vx = rnd(-10, 10); p.vy = -rnd(10, 40);
          if (this.n % 11 === 0 && this.puffs.length < 520 * a.q) this.addPuff(p.x, p.y, false);
        });
        const fr = this.dust.free;
        for (let i = fr.length - 1; i >= 0; i--) {
          const p = fr[i]; p.age += dt;
          if (p.age >= p.life) { fr[i] = fr[fr.length - 1]; fr.pop(); continue; }
          FX.curl(p.x * 0.006, p.y * 0.006, time * 0.25, v);
          p.vx += (v[0] * 900 - p.vx) * dt * 1.4; p.vy += (v[1] * 900 - 60 - p.vy) * dt * 1.4; p.x += p.vx * dt; p.y += p.vy * dt;
        }
      }
      for (let i = this.puffs.length - 1; i >= 0; i--) {
        const p = this.puffs[i]; p.age += dt;
        if (p.age >= p.life) { this.puffs[i] = this.puffs[this.puffs.length - 1]; this.puffs.pop(); continue; }
        FX.curl(p.x * 0.003, p.y * 0.003, time * 0.15 + p.seed, v);
        p.vx += (v[0] * 520 - p.vx) * dt * 0.9; p.vy += (v[1] * 520 - 34 - p.vy) * dt * 0.9; p.x += p.vx * dt; p.y += p.vy * dt; p.size += p.grow * dt;
      }
    }
    draw(st) {
      const a = this.a, ctx = a.ctx, w = a.w, h = a.h, L = a.L;
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(0, h, 0, h * 0.2); gr.addColorStop(0, `rgba(110,125,175,${0.12 * st.env})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      if (st.t < 0 && L.glowC) { ctx.globalAlpha = 0.3 * st.intro; ctx.drawImage(L.glowC, L.bx, L.by, L.bw, L.bh); ctx.globalAlpha = 1; }
      ctx.globalCompositeOperation = 'source-over';
      const soft = this.dust ? smooth(0, this.rel * 0.9, st.t) : 0;
      if (!this.dust || this.dust.nf < this.dust.all.length) FX.drawText(ctx, L, { alpha: st.t < 0 ? st.intro : 1 - soft * 0.25, blur: st.t < 0 ? (1 - st.intro) * 8 : soft * 2.5, oy: st.t < 0 ? (1 - st.intro) * 14 : -soft * 10 });
      for (const p of this.puffs) { const u = p.age / p.life; ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, u * 1.05)) * p.al * 1.6; const s = p.size; ctx.drawImage(this.sprites[p.spr], p.x - s / 2, p.y - s / 2, s, s); }
      ctx.globalAlpha = 1;
      if (this.dust) {
        const b = this.batch, D = this.dust;
        for (let i = D.nf; i < D.ni; i++) { const p = D.all[i]; b.add(244, 247, 255, 1, p.hx - 0.5, p.hy - 0.5, D.step + 1); }
        for (const p of D.free) { const u = p.age / p.life; b.add(205 + 30 * u, 212 + 25 * u, 232, (1 - u) * 0.8, p.x, p.y, D.step * (1 + u * 0.9)); }
        b.flush();
      }
    }
    dispose() { this.puffs.length = this.wisps.length = 0; if (this.dust) this.dust.dispose(); this.dust = null; }
  }
  reg('smoke', Smoke);
})();
