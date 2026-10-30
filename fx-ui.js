/* PixelNote UI effects: animated background + the "process" animation (scan, encrypt, embed, verify, download).
   Pure Canvas 2D, no libraries, no network. */
(() => {
  'use strict';
  const UI = (window.UI = {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const backOut = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 60) : ms));
  UI.sleep = sleep;
  const PAL = ['139,123,255', '53,201,255', '255,107,214', '52,211,153'];

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------------------------------------------------------------- background
  UI.background = () => {
    const c = document.getElementById('bg'); if (!c) return;
    const x = c.getContext('2d'), S = 26; let w = 0, h = 0, dpr = 1, last = performance.now(); const cells = [];
    const size = () => { dpr = Math.min(devicePixelRatio || 1, 1.5); w = innerWidth; h = innerHeight; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener('resize', size);
    addEventListener('pointermove', (e) => { const s = document.documentElement.style; s.setProperty('--mx', e.clientX + 'px'); s.setProperty('--my', e.clientY + 'px'); }, { passive: true });
    if (reduced()) return;
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      x.clearRect(0, 0, w, h);
      if (cells.length < 80 && Math.random() < dt * 36) cells.push({ x: Math.floor(Math.random() * w / S) * S, y: Math.floor(Math.random() * h / S) * S, age: 0, life: rnd(2.2, 5), c: PAL[(Math.random() * 3) | 0] });
      for (let i = cells.length - 1; i >= 0; i--) {
        const p = cells[i]; p.age += dt;
        if (p.age > p.life) { cells.splice(i, 1); continue; }
        x.fillStyle = `rgba(${p.c},${Math.sin(Math.PI * p.age / p.life) * 0.3})`;
        x.fillRect(p.x + 2, p.y + 2, S - 4, S - 4);
      }
    };
    requestAnimationFrame(frame);
  };

  // ---------------------------------------------------------------- process animation
  // fx phases: scan | pixelate | embed | extract | verify | download | done
  UI.Process = class {
    constructor() {
      const $ = (s) => document.querySelector(s);
      this.el = $('#proc'); this.cv = $('#proc-canvas'); this.ctx = this.cv.getContext('2d');
      this.W = 640; this.H = 380; this.dpr = Math.min(devicePixelRatio || 1, 2);
      this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
      this.FR = { w: 400, h: 230 }; this.FR.x = (this.W - this.FR.w) / 2; this.FR.y = 26;
      this.base = document.createElement('canvas'); this.base.width = this.FR.w; this.base.height = this.FR.h;
      this.small = document.createElement('canvas'); this.sctx = this.small.getContext('2d');
      this.noise = this.makeNoise();
      this.stepsEl = $('#proc-steps'); this.bar = $('#proc-bar'); this.titleEl = $('#proc-title'); this.subEl = $('#proc-sub'); this.actEl = $('#proc-actions');
      this.pt = []; this.steps = []; this.fx = 'idle'; this.T = 1; this.t0 = 0; this.last = 0; this.raf = 0;
      this.kind = 'ok'; this.tray = false; this.block = 1; this.b0 = 1; this.spawn = 0; this.mode = 'hide'; this.finished = false;
      this.frame = (now) => {
        this.raf = requestAnimationFrame(this.frame);
        const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
        const t = (now - this.t0) / 1000, p = clamp(t / this.T, 0, 1);
        const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.W, this.H);
        this.update(dt, p); this.draw(ctx, t, p, now / 1000);
      };
      addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.el.hidden && this.finished) this.close(); });
    }

    makeNoise() {
      const c = document.createElement('canvas'); c.width = 100; c.height = 58; const g = c.getContext('2d');
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (Math.random() < 0.55) { g.fillStyle = `rgba(${PAL[(Math.random() * 3) | 0]},${rnd(0.35, 0.95)})`; g.fillRect(x, y, 1, 1); }
      }
      return c;
    }

    // ---- public API -------------------------------------------------
    open({ mode, title, sub, steps, img }) {
      this.mode = mode; this.kind = 'ok'; this.tray = false; this.finished = false; this.pt.length = 0; this.block = 1; this.b0 = 1;
      this.steps = steps; this.titleEl.textContent = title; this.subEl.textContent = sub;
      this.stepsEl.innerHTML = '';
      for (const s of steps) { const li = document.createElement('li'); li.innerHTML = '<i class="ic"></i><span></span>'; li.lastChild.textContent = s.label; this.stepsEl.appendChild(li); s.li = li; }
      this.actEl.innerHTML = ''; this.bar.style.transition = 'none'; this.bar.style.width = '0%'; void this.bar.offsetWidth; this.bar.style.transition = '';
      const { FR } = this, b = this.base.getContext('2d'); b.clearRect(0, 0, FR.w, FR.h);
      const s = Math.max(FR.w / img.width, FR.h / img.height); b.drawImage(img, (FR.w - img.width * s) / 2, (FR.h - img.height * s) / 2, img.width * s, img.height * s);
      this.el.hidden = false; document.body.classList.add('modal');
      this.setFx('scan', (steps[0] ? steps[0].T : 900) / 1000);
      this.last = performance.now(); cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.frame);
    }

    // Run one step: the animation plays for at least s.T ms while the real work runs in parallel.
    async step(i, work) {
      const s = this.steps[i]; s.li.className = 'active';
      if (s.fx === 'download') this.tray = true;
      this.setFx(s.fx, s.T / 1000);
      this.bar.style.width = `${(i / this.steps.length) * 100}%`;
      const [res] = await Promise.all([work ? work() : null, sleep(s.T)]);
      s.li.className = 'done'; this.bar.style.width = `${((i + 1) / this.steps.length) * 100}%`;
      return res;
    }

    finish({ title, sub, actions }) {
      this.kind = 'ok'; this.finished = true; this.setFx('done', 1.1);
      this.titleEl.textContent = title; this.subEl.textContent = sub; this.bar.style.width = '100%'; this.renderActions(actions);
    }

    fail(msg, title) {
      const act = this.steps.find((s) => s.li && s.li.className === 'active'); if (act) act.li.className = 'fail';
      this.kind = 'fail'; this.finished = true; this.tray = false; this.setFx('done', 0.9);
      this.titleEl.textContent = title || 'Something went wrong'; this.subEl.textContent = msg;
      this.renderActions([{ label: 'Close', primary: true }]);
    }

    renderActions(actions) {
      this.actEl.innerHTML = '';
      (actions || []).forEach((a) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (a.primary ? ' primary' : ''); b.textContent = a.label;
        b.onclick = () => (a.run ? a.run() : this.close()); this.actEl.appendChild(b);
      });
      const first = this.actEl.querySelector('.primary') || this.actEl.firstChild; if (first) first.focus({ preventScroll: true });
    }

    close() {
      this.el.hidden = true; cancelAnimationFrame(this.raf); this.raf = 0; this.pt.length = 0; this.finished = false;
      document.body.classList.remove('modal');
    }

    // ---- internals ---------------------------------------------------
    setFx(fx, T) {
      this.fx = fx; this.T = Math.max(0.05, T); this.t0 = performance.now(); this.b0 = this.block; this.spawn = 0;
      if (fx === 'done') this.burst();
    }

    burst() {
      const { W } = this, cx = W / 2, cy = this.kind === 'fail' ? 190 : (this.tray ? 112 : 26 + 115);
      if (this.kind === 'fail') return;
      for (let i = 0; i < 46; i++) { const a = rnd(0, Math.PI * 2), sp = rnd(90, 300); this.pt.push({ k: 'burst', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, age: 0, life: rnd(0.8, 1.5), s: rnd(3, 7), c: PAL[(Math.random() * PAL.length) | 0] }); }
    }

    update(dt, p) {
      const { FR, W } = this;
      if (this.fx === 'embed') {
        this.spawn += dt * 85;
        while (this.spawn >= 1) { this.spawn--; this.pt.push({ k: 'in', sx: Math.random() < 0.5 ? -20 : W + 20, sy: rnd(0, 300), tx: FR.x + rnd(10, FR.w - 10), ty: FR.y + rnd(10, FR.h - 10), age: 0, life: rnd(0.55, 0.95), s: rnd(3, 6), c: PAL[(Math.random() * 2) | 0] }); }
      } else if (this.fx === 'extract') {
        this.spawn += dt * 85;
        while (this.spawn >= 1) { this.spawn--; const sx = FR.x + rnd(10, FR.w - 10), sy = FR.y + rnd(10, FR.h - 10); this.pt.push({ k: 'out', sx, sy, tx: sx + rnd(-90, 130), ty: FR.y - rnd(30, 70), age: 0, life: rnd(0.7, 1.2), s: rnd(3, 6), c: PAL[(Math.random() * 2) | 0] }); }
      }
      for (let i = this.pt.length - 1; i >= 0; i--) {
        const q = this.pt[i]; q.age += dt;
        if (q.age >= q.life) { if (q.k === 'in') this.pt.push({ k: 'flash', x: q.tx, y: q.ty, age: 0, life: 0.35, s: q.s, c: q.c }); this.pt.splice(i, 1); continue; }
        if (q.k === 'burst') { q.vy += 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-1.2 * dt); }
      }
      if (this.pt.length > 600) this.pt.splice(0, this.pt.length - 600);
    }

    curBlock(p) {
      if (this.fx === 'pixelate') return lerp(this.b0, 30, ease(p));
      return lerp(this.b0, 1, easeOut(p));
    }

    drawFrame(ctx, cx, cy, sc, block, t, p) {
      const { FR } = this; ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-FR.w / 2, -FR.h / 2);
      rr(ctx, 0, 0, FR.w, FR.h, 16); ctx.clip();
      if (block <= 1.3) ctx.drawImage(this.base, 0, 0);
      else {
        const sw = Math.ceil(FR.w / block), sh = Math.ceil(FR.h / block);
        if (this.small.width !== sw || this.small.height !== sh) { this.small.width = sw; this.small.height = sh; }
        this.sctx.drawImage(this.base, 0, 0, sw, sh);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(this.small, 0, 0, sw, sh, 0, 0, sw * block, sh * block); ctx.imageSmoothingEnabled = true;
      }
      const fx = this.fx;
      if (fx === 'scan') {
        const y = p * FR.h;
        if (this.mode === 'reveal' && y > 2) { ctx.globalAlpha = 0.6; ctx.imageSmoothingEnabled = false; ctx.drawImage(this.noise, 0, 0, this.noise.width, Math.max(1, y / 4), 0, 0, FR.w, y); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1; }
        ctx.strokeStyle = 'rgba(53,201,255,.16)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let gx = 0; gx <= FR.w; gx += 20) { ctx.moveTo(gx, 0); ctx.lineTo(gx, y); }
        for (let gy = 0; gy <= y; gy += 20) { ctx.moveTo(0, gy); ctx.lineTo(FR.w, gy); }
        ctx.stroke();
        const g = ctx.createLinearGradient(0, y - 48, 0, y); g.addColorStop(0, 'rgba(53,201,255,0)'); g.addColorStop(1, 'rgba(53,201,255,.42)');
        ctx.fillStyle = g; ctx.fillRect(0, y - 48, FR.w, 48);
        ctx.fillStyle = '#b8f3ff'; ctx.shadowColor = '#35c9ff'; ctx.shadowBlur = 14; ctx.fillRect(0, y - 1, FR.w, 2.5); ctx.shadowBlur = 0;
      } else if (fx === 'pixelate') {
        ctx.fillStyle = `rgba(8,10,30,${0.35 * ease(p)})`; ctx.fillRect(0, 0, FR.w, FR.h);
        ctx.font = '600 13px ui-monospace,Menlo,Consolas,monospace'; ctx.textBaseline = 'top';
        for (let col = 0; col < FR.w / 18; col++) {
          const sp = 50 + (col * 37 % 70), off = (col * 91) % 300, yy = ((t * sp + off) % (FR.h + 120)) - 60;
          for (let k = 0; k < 7; k++) {
            const y = yy - k * 15; if (y < -15 || y > FR.h) continue;
            ctx.fillStyle = `rgba(${k === 0 ? '200,250,255' : '53,201,255'},${(1 - k / 7) * 0.8 * ease(Math.min(1, p * 1.6))})`;
            ctx.fillText(((col * 31 + Math.floor((y + t * 40) / 15) * 7) % 3 === 0) ? '1' : '0', col * 18 + 4, y);
          }
        }
      } else if (fx === 'verify') {
        const x = p * FR.w; ctx.fillStyle = 'rgba(52,211,153,.16)'; ctx.fillRect(0, 0, x, FR.h);
        ctx.fillStyle = '#9bffd2'; ctx.shadowColor = '#34d399'; ctx.shadowBlur = 14; ctx.fillRect(x - 1, 0, 2.5, FR.h); ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    badge(ctx, cx, cy, t, ok) {
      const s = backOut(clamp(t / 0.5, 0, 1)); ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
      const g = ctx.createLinearGradient(-34, -34, 34, 34); g.addColorStop(0, ok ? '#34d399' : '#ff7a90'); g.addColorStop(1, ok ? '#35c9ff' : '#ff4a6a');
      ctx.shadowColor = ok ? '#34d399' : '#ff4a6a'; ctx.shadowBlur = 30; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const q = clamp((t - 0.2) / 0.4, 0, 1); ctx.beginPath();
      if (ok) {
        const pts = [[-13, 1], [-4, 10], [14, -9]], a = Math.min(1, q * 2), b = Math.max(0, q * 2 - 1);
        ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(lerp(pts[0][0], pts[1][0], a), lerp(pts[0][1], pts[1][1], a));
        if (b > 0) ctx.lineTo(lerp(pts[1][0], pts[2][0], b), lerp(pts[1][1], pts[2][1], b));
      } else { const d = 11 * q; ctx.moveTo(-d, -d); ctx.lineTo(d, d); ctx.moveTo(d, -d); ctx.lineTo(-d, d); }
      ctx.stroke(); ctx.restore();
    }

    lock(ctx, cx, cy, s, a, lift) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.globalAlpha = a;
      ctx.shadowColor = '#8b7bff'; ctx.shadowBlur = 24;
      ctx.strokeStyle = '#eef1ff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(-14, -2 - lift); ctx.lineTo(-14, -16 - lift); ctx.arc(0, -16 - lift, 14, Math.PI, 0); ctx.lineTo(14, -2 - lift); ctx.stroke();
      const g = ctx.createLinearGradient(-24, 0, 24, 36); g.addColorStop(0, '#8b7bff'); g.addColorStop(1, '#35c9ff');
      ctx.fillStyle = g; rr(ctx, -24, -4, 48, 38, 9); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b0e1a'; ctx.beginPath(); ctx.arc(0, 12, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-2, 14, 4, 10);
      ctx.restore();
    }

    brackets(ctx, color, pulse) {
      const { FR } = this, L = 22, m = 8 + pulse * 3; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.shadowColor = color; ctx.shadowBlur = 10;
      const x0 = FR.x - m, y0 = FR.y - m, x1 = FR.x + FR.w + m, y1 = FR.y + FR.h + m;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
      ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
      ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
      ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
      ctx.stroke(); ctx.restore();
    }

    draw(ctx, t, p, now) {
      const { W, H, FR } = this, fx = this.fx;
      const block = this.curBlock(p); this.block = block;
      const g = ctx.createRadialGradient(W / 2, FR.y + FR.h / 2, 10, W / 2, FR.y + FR.h / 2, 300); g.addColorStop(0, 'rgba(139,123,255,.20)'); g.addColorStop(1, 'rgba(139,123,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const pulse = 0.5 + 0.5 * Math.sin(now * 5);

      if (fx === 'download' || (fx === 'done' && this.tray && this.kind === 'ok')) {
        const e = fx === 'download' ? ease(p) : 1, sc = lerp(1, 0.32, e), cx = W / 2, cy = lerp(FR.y + FR.h / 2, 266, e);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
        rr(ctx, -FR.w / 2 - 16, -FR.h / 2 - 16, FR.w + 32, FR.h + 32, 26); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2 / sc; ctx.stroke();
        ctx.restore();
        this.drawFrame(ctx, cx, cy, sc, 1, t, p);
        ctx.fillStyle = '#35c9ff'; rr(ctx, cx + 28, cy + 24, 34, 16, 8); ctx.fill(); ctx.fillStyle = '#06101c'; ctx.font = '800 10px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PNG', cx + 45, cy + 32.5);
        // tray
        const tw = 280, th = 40, tx = (W - tw) / 2, ty = 322, prog = fx === 'download' ? ease(p) : 1;
        rr(ctx, tx, ty, tw, th, 14); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill(); ctx.strokeStyle = 'rgba(139,123,255,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.save(); rr(ctx, tx + 3, ty + 3, tw - 6, th - 6, 11); ctx.clip();
        const pg = ctx.createLinearGradient(tx, 0, tx + tw, 0); pg.addColorStop(0, 'rgba(139,123,255,.75)'); pg.addColorStop(1, 'rgba(53,201,255,.75)');
        ctx.fillStyle = pg; ctx.fillRect(tx + 3, ty + 3, (tw - 6) * prog, th - 6); ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = '600 12.5px Inter,system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(fx === 'download' ? 'Saving to your device…' : 'Saved to your device', tx + 16, ty + th / 2 + 0.5);
        ctx.textAlign = 'right'; ctx.fillText(`${Math.round(prog * 100)}%`, tx + tw - 16, ty + th / 2 + 0.5);
        if (fx === 'download' && p < 0.8) { // falling chevrons
          for (let k = 0; k < 3; k++) { const yy = 150 + ((now * 90 + k * 40) % 120), al = Math.sin(Math.PI * clamp((yy - 150) / 120, 0, 1)) * 0.5; ctx.strokeStyle = `rgba(53,201,255,${al})`; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(W / 2 - 12, yy); ctx.lineTo(W / 2, yy + 9); ctx.lineTo(W / 2 + 12, yy); ctx.stroke(); }
        }
        if (fx === 'done') this.badge(ctx, W / 2, 112, t, true);
      } else {
        const shake = fx === 'done' && this.kind === 'fail' ? Math.sin(t * 55) * 7 * (1 - p) : 0;
        const cx = W / 2 + shake, cy = FR.y + FR.h / 2;
        this.drawFrame(ctx, cx, cy, 1, block, t, p);
        if (fx === 'pixelate') {
          const lift = this.mode === 'hide' ? (1 - ease(p)) * 9 : ease(p) * 9;
          this.lock(ctx, W / 2, cy - 6, 0.5 + 0.5 * backOut(clamp(p * 1.6, 0, 1)), clamp(p * 2.4, 0, 0.95), lift);
        }
        if (fx === 'verify' && p > 0.55) { const q = (p - 0.55) / 0.45; ctx.save(); ctx.globalAlpha = clamp(q * 2, 0, 1); this.badge(ctx, W / 2, cy, q * 0.55, true); ctx.restore(); }
        if (fx === 'done') {
          ctx.save(); ctx.translate(shake, 0); rr(ctx, FR.x, FR.y, FR.w, FR.h, 16); ctx.fillStyle = this.kind === 'fail' ? 'rgba(60,8,20,.62)' : 'rgba(6,10,28,.55)'; ctx.fill(); ctx.restore();
          this.badge(ctx, cx, cy, t, this.kind === 'ok');
        }
        const col = fx === 'done' ? (this.kind === 'fail' ? '#ff7a90' : '#34d399') : fx === 'verify' ? '#34d399' : '#35c9ff';
        this.brackets(ctx, col, pulse);
        // caption under the frame
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 12.5px Inter,system-ui,sans-serif'; ctx.fillStyle = 'rgba(210,218,245,.8)';
        const cap = { scan: this.mode === 'reveal' ? 'Reading least-significant bits…' : 'Scanning pixels for free capacity…', pixelate: this.mode === 'reveal' ? 'Deriving key · unlocking…' : 'Encrypting · AES-256-GCM · PBKDF2 250k', embed: 'Weaving ciphertext into the pixels…', extract: 'Decrypting and unpacking the note…', verify: 'Reading the note back to verify…', done: this.kind === 'fail' ? 'Stopped' : 'Complete' }[fx];
        if (cap) ctx.fillText(cap, W / 2, FR.y + FR.h + 46);
        if (fx === 'embed' || fx === 'extract') { // progress dots
          const n = 24; for (let i = 0; i < n; i++) { ctx.fillStyle = i / n < p ? 'rgba(53,201,255,.95)' : 'rgba(255,255,255,.14)'; ctx.fillRect(W / 2 - (n * 9) / 2 + i * 9, FR.y + FR.h + 70, 6, 6); }
        }
      }

      // particles
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const q of this.pt) {
        const u = q.age / q.life;
        if (q.k === 'in') { const e = easeOut(u); ctx.fillStyle = `rgba(${q.c},${0.35 + 0.65 * u})`; ctx.fillRect(lerp(q.sx, q.tx, e), lerp(q.sy, q.ty, e), q.s, q.s); }
        else if (q.k === 'out') { const e = easeOut(u); ctx.fillStyle = `rgba(${q.c},${1 - u})`; ctx.fillRect(lerp(q.sx, q.tx, e), lerp(q.sy, q.ty, e), q.s, q.s); }
        else if (q.k === 'flash') { const s = q.s + u * 12; ctx.fillStyle = `rgba(${q.c},${0.7 * (1 - u)})`; ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s); }
        else if (q.k === 'burst') { ctx.fillStyle = `rgba(${q.c},${1 - u})`; ctx.fillRect(q.x, q.y, q.s, q.s); }
      }
      ctx.restore();
    }
  };
})();
