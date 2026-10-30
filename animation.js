/* PixelNote full-screen experience: page controller.
   Flow: receive message -> show it with a visibility countdown -> run the chosen vanish effect for the
   configured duration -> wipe the text -> completion screen. Timing uses performance.now() (monotonic). */
(() => {
  'use strict';
  const { clamp, smooth } = FX;
  const $ = (s) => document.querySelector(s);
  const EFFECTS = ['fire', 'water', 'air', 'smoke', 'glitch', 'burst', 'bomb', 'fade'];
  const META = { fire: ['🔥', 'Fire'], water: ['💧', 'Water'], air: ['🌬️', 'Air'], smoke: ['🌫️', 'Smoke'], glitch: ['⚡', 'Glitch'], burst: ['🎨', 'Colour burst'], bomb: ['💣', 'Bomb'], fade: ['✨', 'Fade'] };
  const DEMO = 'Hello from PixelNote ✨\nयह संदेश अब गायब होने वाला है 🔥';
  const RING = 119.4;
  const canvas = $('#fx'), ctx = canvas.getContext('2d');
  const a = { canvas, ctx, w: 0, h: 0, dpr: 1, q: 1, sc: 1, L: null };
  let S = null, resizeTimer = 0;

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function sizeCanvas() {
    a.dpr = Math.min(window.devicePixelRatio || 1, 1.5); a.w = innerWidth; a.h = innerHeight; a.sc = clamp(a.h / 900, 0.6, 1.6);
    canvas.width = Math.round(a.w * a.dpr); canvas.height = Math.round(a.h * a.dpr);
    ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
  }

  // Only accept well-formed settings; the message itself is never logged or placed in a URL.
  function sanitize(d) {
    if (!d || typeof d.message !== 'string') return null;
    const num = (v, lo, hi, def) => (Number.isFinite(+v) ? clamp(+v, lo, hi) : def);
    return { message: d.message.slice(0, 20000), effect: EFFECTS.includes(d.effect) ? d.effect : 'fire', visibleSeconds: num(d.visibleSeconds, 0, 60, 60), animationSeconds: num(d.animationSeconds, 0, 60, 3), intensity: num(d.intensity, 0.4, 1.5, 1), sound: d.sound === true, demo: d.demo === true };
  }

  function cleanup() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    try { S.fx && S.fx.dispose(); } catch { /* ignore */ }
    if (a.L) { a.L.dispose(); a.L = null; }
    FX.Sound.stop(); ctx.clearRect(0, 0, a.w, a.h); S = null;
  }

  function start(cfg) {
    cleanup();
    for (const id of ['#done', '#gallery']) $(id).hidden = true;
    sizeCanvas();
    const name = cfg.effect, effName = reduced() ? 'fade' : name;
    document.body.className = 'fx-' + name;
    a.q = clamp(cfg.intensity * (a.w * a.h > 2.6e6 ? 0.8 : 1), 0.3, 1.5);
    a.L = FX.layoutText(cfg.message, a.w, a.h, a.dpr);
    const now = performance.now();
    S = { cfg, name, effName, fx: new FX.effects[effName](a), phase: 'visible', born: now, last: now, time: 0, ema: 16, qCheck: now + 1500, deadline: now + cfg.visibleSeconds * 1000, vStart: 0, D: 0, raf: 0, vis: cfg.visibleSeconds };
    $('#sr-message').textContent = cfg.message;
    $('#hud').hidden = cfg.visibleSeconds <= 0; $('#vanishNow').hidden = cfg.visibleSeconds <= 0;
    $('#timer').style.opacity = 1;
    S.raf = requestAnimationFrame(frame);
  }

  function beginVanish(now) {
    S.phase = 'vanish'; S.vStart = now;
    let D = S.cfg.animationSeconds; if (D > 0 && reduced()) D = Math.min(D, 0.6);
    S.D = D;
    $('#hud').hidden = true; $('#vanishNow').hidden = true; $('#sr-message').textContent = '';
    if (D <= 0) return false;
    S.cfg.message = ''; // the plaintext now only exists inside the rendered message canvas
    S.fx.begin(D);
    if (S.cfg.sound && !reduced()) { FX.Sound.start(S.name, D); setTimeout(() => { if (S && FX.Sound.blocked()) $('#soundHint').hidden = false; }, 250); }
    return true;
  }

  function finish() {
    const replay = S && S.cfg.demo; cleanup();
    $('#hud').hidden = true; $('#vanishNow').hidden = true; $('#soundHint').hidden = true;
    $('#again').hidden = !replay;
    $('#doneText').textContent = replay ? 'That was only a preview. No real message was involved.' : 'The text was cleared from this page. Nothing was saved or logged.';
    $('#done').hidden = false; $('#close2').focus({ preventScroll: true });
  }

  function frame(now) {
    if (!S) return;
    S.raf = requestAnimationFrame(frame);
    let dt = (now - S.last) / 1000; S.last = now; dt = Math.min(0.05, Math.max(0, dt)); S.time += dt;
    S.ema = S.ema * 0.95 + dt * 1000 * 0.05;
    if (now > S.qCheck) { S.qCheck = now + 1000; if (S.ema > 27 && a.q > 0.4) a.q *= 0.85; }

    if (S.phase === 'visible') {
      const left = S.deadline - now;
      if (left <= 0) { if (!beginVanish(now)) { finish(); return; } }
      else {
        $('#ring').style.strokeDashoffset = String(RING * (1 - left / (S.vis * 1000)));
        $('#count').textContent = `${(left / 1000).toFixed(left < 10000 ? 1 : 0)}s`;
        $('#caption').textContent = 'until this message vanishes';
      }
    }
    let t = -1;
    if (S.phase === 'vanish') { t = (now - S.vStart) / 1000; if (t >= S.D) { finish(); return; } }
    const D = S.D, idle = 0.14, rise = Math.min(1.2, D * 0.25), fall = Math.min(3.5, D * 0.3);
    const env = t < 0 ? idle : (idle + (1 - idle) * smooth(0, rise, t)) * (1 - smooth(D - fall, D, t));
    const st = { t, D, env, time: S.time, intro: S.phase === 'visible' ? smooth(0, 0.8, (now - S.born) / 1000) : 1 };
    ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0); ctx.clearRect(0, 0, a.w, a.h);
    S.fx.update(dt, st); S.fx.draw(st);
  }

  // ---------- controls ----------
  function closeTab() {
    cleanup(); window.close();
    setTimeout(() => { location.replace('index.html'); }, 150); // not opened by script: return to the app
  }
  $('#close').onclick = $('#close2').onclick = closeTab;
  $('#vanishNow').onclick = () => { if (S && S.phase === 'visible') S.deadline = performance.now(); };
  $('#again').onclick = showGallery;
  $('#soundHint').onclick = () => { FX.Sound.resume(); $('#soundHint').hidden = true; };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTab(); FX.Sound.resume(); });
  addEventListener('pointerdown', () => FX.Sound.resume());
  document.addEventListener('visibilitychange', () => { if (S) S.last = performance.now(); });
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      sizeCanvas();
      if (!S) return;
      if (S.phase === 'visible' && S.cfg.message) { // re-flow the message for the new size
        S.fx.dispose(); if (a.L) a.L.dispose(); a.L = FX.layoutText(S.cfg.message, a.w, a.h, a.dpr); S.fx = new FX.effects[S.effName](a);
      } else if (S.fx.resize) S.fx.resize();
    }, 120);
  });

  // ---------- gallery (no message supplied) ----------
  function showGallery() {
    cleanup(); document.body.className = 'fx-fire'; sizeCanvas();
    $('#done').hidden = true; $('#gallery').hidden = false;
  }
  const chips = $('#chips');
  for (const e of EFFECTS) {
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${META[e][0]}</span>${META[e][1]}`;
    b.onclick = () => start({ message: DEMO, effect: e, visibleSeconds: 2, animationSeconds: +$('#gDur').value, intensity: +$('#gInt').value, sound: $('#gSound').checked, demo: true });
    chips.appendChild(b);
  }

  // ---------- boot: take the message from window.name (cleared at once), a same-origin channel, or run a demo ----------
  function boot() {
    const qs = new URLSearchParams(location.search);
    if (qs.has('demo')) {
      const e = qs.get('demo');
      return start(sanitize({ message: DEMO, effect: e, visibleSeconds: qs.get('v') ?? 2, animationSeconds: qs.get('d') ?? 5, intensity: qs.get('i') ?? 1, sound: qs.get('s') === '1', demo: true }));
    }
    try {
      const raw = window.name;
      if (raw && raw.startsWith('PIXELNOTE:')) { window.name = ''; const cfg = sanitize(JSON.parse(raw.slice(10))); if (cfg) return start(cfg); }
    } catch { /* fall through */ }
    if (typeof BroadcastChannel === 'function') {
      const ch = new BroadcastChannel('pixelnote-handoff'); let got = false;
      ch.onmessage = (ev) => { if (ev.data && ev.data.type === 'data' && !got) { const cfg = sanitize(ev.data.payload); if (cfg) { got = true; ch.postMessage({ type: 'got' }); ch.close(); start(cfg); } } };
      ch.postMessage({ type: 'need' });
      setTimeout(() => { if (!got) { ch.close(); showGallery(); } }, 700);
    } else showGallery();
  }
  boot();
})();
