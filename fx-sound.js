/* Optional sound, synthesised with Web Audio (no audio files, no network). Off unless the user enables it. */
(() => {
  'use strict';
  const S = (FX.Sound = {});
  let ac = null, master = null, timer = 0, on = false, nbuf = null;

  const noise = () => {
    if (nbuf) return nbuf;
    nbuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = nbuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // brown-ish noise
    return nbuf;
  };
  const loop = (filterType, freq, q, gain) => {
    const src = ac.createBufferSource(); src.buffer = noise(); src.loop = true;
    const f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = gain; src.connect(f).connect(g).connect(master); src.start();
    return { src, f, g };
  };
  const burst = (type, freq, dur, gain, q = 1) => {
    if (!on) return;
    const src = ac.createBufferSource(); src.buffer = noise(); const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(), t = ac.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(master); src.start(t, Math.random(), dur + 0.05);
  };
  const tone = (type, f0, f1, dur, gain) => {
    if (!on) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  };

  S.start = (effect, D) => {
    S.stop();
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0;
      master.connect(ac.destination); on = true; if (ac.state === 'suspended') ac.resume().catch(() => {});
      const t = ac.currentTime, fall = Math.min(3, D * 0.3);
      master.gain.linearRampToValueAtTime(0.55, t + 0.15); master.gain.setValueAtTime(0.55, t + Math.max(0.2, D - fall)); master.gain.linearRampToValueAtTime(0, t + D);
      if (effect === 'fire') { loop('lowpass', 900, 0.7, 0.35); timer = setInterval(() => burst('highpass', 1800 + Math.random() * 3000, 0.03 + Math.random() * 0.05, 0.25 + Math.random() * 0.3), 70); }
      else if (effect === 'water') { loop('bandpass', 1400, 0.5, 0.22); timer = setInterval(() => { if (Math.random() < 0.6) tone('sine', 700 + Math.random() * 600, 220, 0.07, 0.12); }, 90); }
      else if (effect === 'air') { const l = loop('bandpass', 400, 0.8, 0.5); l.f.frequency.setValueAtTime(300, t); l.f.frequency.linearRampToValueAtTime(1300, t + Math.min(2, D / 2)); l.f.frequency.linearRampToValueAtTime(350, t + D); }
      else if (effect === 'smoke') { loop('lowpass', 450, 0.5, 0.25); loop('highpass', 3500, 0.5, 0.03); }
      else if (effect === 'glitch') { timer = setInterval(() => { burst('bandpass', 400 + Math.random() * 4000, 0.04, 0.4, 4); if (Math.random() < 0.5) tone('square', 80 + Math.random() * 900, 60, 0.04, 0.07); }, 85); }
      else if (effect === 'fade') { loop('lowpass', 300, 0.5, 0.12); }
      else if (effect === 'bomb') { let n = 0; timer = setInterval(() => { if (n++ < 6) tone('square', 1100, 1100, 0.02, 0.05); }, 110); }
    } catch { on = false; }
  };
  S.event = (name) => {
    if (!on) return;
    if (name === 'boom') { burst('lowpass', 500, 1.4, 1.4); tone('sine', 110, 28, 1.1, 1.2); burst('highpass', 1200, 0.25, 0.5); }
    else if (name === 'pop') { burst('lowpass', 900, 0.18, 0.9); tone('sine', 220, 70, 0.12, 0.35); }
    else if (name === 'glitch') { tone('sawtooth', 1200, 100, 0.05, 0.05); }
  };
  S.resume = () => { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); };
  S.blocked = () => !!ac && ac.state === 'suspended';
  S.stop = () => {
    on = false; clearInterval(timer); timer = 0;
    if (ac) { const c = ac; ac = null; master = null; nbuf = null; setTimeout(() => c.close().catch(() => {}), 150); }
  };
})();
