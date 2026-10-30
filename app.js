// The image's LSB plane (R,G,B bits; alpha skipped) is split into two equal, identical-looking slots.
// Each slot is  salt(16) | iv(12) | AES-GCM( padded plaintext ) .  The plaintext is padded with random bytes to a
// fixed size, so slot contents reveal no length. An unused slot is pure random noise. That is what makes a decoy
// undetectable: every slot looks the same whether it holds a real note, a decoy, or nothing.
const OVERHEAD = 16 + 12 + 16; // salt + iv + GCM tag
const LEGACY_FIXED = 1 + 2 + 4; // legacy plaintext header: type, name length, data length
const FIXED = LEGACY_FIXED + 1 + 2 + 2; // v2 adds effect id, visible seconds, animation seconds
const ITERATIONS = 250000;
const TEXT = 0;
const FILE = 1;
// Order matters: ids are stored in the image. New effects are appended so older PixelNote images keep working.
const EFFECTS = ['fire', 'water', 'air', 'glitch', 'fade', 'smoke', 'burst', 'bomb'];
const DEFAULT_SETTINGS = { visibleSeconds: 60, effect: 'fire', animationSeconds: 3 };

const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
const dec = new TextDecoder();
const picked = { hide: null, reveal: null }; // { name, canvas, ctx, img }
let attached = null; // file to hide instead of text
let tab = 'hide';
let clearTimer = 0;
let countdownInterval = 0;
let animationTimer = 0;
let revealed = null; // { name, data } of a revealed file

let toastTimer = 0;
function say(text, isError = false) {
  clearTimeout(toastTimer);
  $('#status').textContent = text;
  $('#status').classList.toggle('err', isError);
  if (text) toastTimer = setTimeout(() => { $('#status').textContent = ''; }, isError ? 9000 : 6000);
}

// ---------- pixels ----------
async function loadPixels(file) {
  const bmp = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; // opaque background: alpha would corrupt LSBs through premultiplication
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { canvas, ctx, img: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

const capacity = (img) => Math.floor((img.width * img.height * 3) / 8);
const slotSize = (img) => Math.floor(capacity(img) / 2);
const plainSize = (img) => slotSize(img) - OVERHEAD;
const room = (img, nameBytes = 0) => plainSize(img) - FIXED - nameBytes; // max data bytes in one slot
const slot = (bit) => Math.floor(bit / 3) * 4 + (bit % 3);

function embed(data, bytes) {
  for (let i = 0; i < bytes.length * 8; i++) {
    const at = slot(i);
    data[at] = (data[at] & 0xfe) | ((bytes[i >> 3] >> (7 - (i & 7))) & 1);
  }
}

function extract(data, start, length) {
  const out = new Uint8Array(length);
  for (let i = 0; i < length * 8; i++) out[i >> 3] |= (data[slot(start * 8 + i)] & 1) << (7 - (i & 7));
  return out;
}

// ---------- crypto + packing ----------
function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function pack(type, name, data, size, settings = DEFAULT_SETTINGS) {
  const nameBytes = enc.encode(name.slice(0, 100));
  const out = randomBytes(size); // random padding fills whatever the content doesn't
  const view = new DataView(out.buffer);
  out[0] = type + 2; // v2 type markers; 0/1 remain readable as legacy payloads
  view.setUint16(1, nameBytes.length);
  view.setUint32(3, data.length);
  out[7] = Math.max(0, EFFECTS.indexOf(settings.effect));
  view.setUint16(8, Math.max(0, Math.min(60, settings.visibleSeconds)));
  view.setUint16(10, Math.max(0, Math.min(60, settings.animationSeconds)));
  out.set(nameBytes, FIXED);
  out.set(data, FIXED + nameBytes.length);
  return out;
}

function unpack(buf) {
  if (buf.length < LEGACY_FIXED) throw new Error('bad payload');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const storedType = buf[0];
  const v2 = storedType === 2 || storedType === 3;
  const type = v2 ? storedType - 2 : storedType;
  const fixed = v2 ? FIXED : LEGACY_FIXED;
  const nameLen = view.getUint16(1);
  if (nameLen > 400 || fixed + nameLen > buf.length) throw new Error('bad name length');
  const dataLenOffset = v2 ? 3 : 3 + nameLen;
  if (dataLenOffset + 4 > buf.length) throw new Error('bad length header');
  const dataLen = view.getUint32(dataLenOffset);
  if (fixed + nameLen + dataLen > buf.length) throw new Error('bad length');
  const settings = v2 ? {
    effect: EFFECTS[buf[7]] || DEFAULT_SETTINGS.effect,
    visibleSeconds: Math.min(60, view.getUint16(8)),
    animationSeconds: Math.min(60, view.getUint16(10)),
  } : { ...DEFAULT_SETTINGS };
  return {
    type,
    name: dec.decode(buf.subarray(fixed, fixed + nameLen)),
    data: buf.slice(fixed + nameLen, fixed + nameLen + dataLen),
    settings,
  };
}

async function seal(pass, plain) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pass, salt), plain));
  const out = new Uint8Array(OVERHEAD + plain.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(cipher, 28);
  return out;
}

async function readNote(img, pass) {
  const size = slotSize(img);
  for (let s = 0; s < 2; s++) {
    const bytes = extract(img.data, s * size, size);
    try {
      const key = await deriveKey(pass, bytes.slice(0, 16));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.subarray(28));
      return unpack(new Uint8Array(plain));
    } catch { /* wrong slot or passphrase: try the next */ }
  }
  return null;
}

// ---------- hide ----------
function strength(p) {
  if (!p) return '';
  const pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(p) ? 26 : 0) + (/\d/.test(p) ? 10 : 0) + (/[^A-Za-z0-9]/.test(p) ? 33 : 0);
  const bits = p.length * Math.log2(pool || 1);
  return bits < 40 ? 'Weak' : bits < 60 ? 'OK' : 'Strong';
}

function updateHints() {
  const level = strength($('#pass-hide').value);
  $('#meter').dataset.level = level;
  $('#meter-bar').dataset.level = level;
  $('#meter').textContent = level === 'Weak' ? 'Weak passphrase: anyone holding the image can try guesses offline. Use 4+ random words.'
    : level ? `Passphrase strength: ${level}` : '';

  const C = 163.36, arc = $('#cap-arc'), p = picked.hide;
  arc.style.strokeDasharray = String(C);
  if (!p) {
    arc.style.strokeDashoffset = String(C);
    $('#cap-pct').textContent = '0%';
    $('#cap').textContent = 'Choose a cover image to see how much fits.';
    $('#capbox').classList.remove('over');
    return;
  }
  const used = attached ? attached.size : enc.encode($('#msg').value).length;
  const limit = room(p.img, attached ? enc.encode(attached.name.slice(0, 100)).length : 0);
  const pct = limit > 0 ? used / limit : 1;
  arc.style.strokeDashoffset = String(C * (1 - Math.min(1, pct)));
  $('#cap-pct').textContent = used > 0 && pct < 0.01 ? '<1%' : `${Math.round(pct * 100)}%`;
  $('#cap').textContent = `${used.toLocaleString()} / ${limit.toLocaleString()} bytes fit in this image`;
  $('#capbox').classList.toggle('over', used > limit);
}

function setAttached(file) {
  attached = file;
  $('#text-box').hidden = !!file;
  $('#chip').hidden = !file;
  $('#chip-name').textContent = file ? `${file.name} (${file.size.toLocaleString()} bytes)` : '';
  updateHints();
}

function download(blob, name) {
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }).click();
}

async function hide() {
  const p = picked.hide;
  const pass = $('#pass-hide').value;
  const decoyText = $('#decoy-msg').value;
  const decoyPass = $('#decoy-pass').value;
  const useDecoy = decoyText !== '' || decoyPass !== '';

  if (!p) return say('Choose a cover image first.', true);
  if (!attached && !$('#msg').value) return say('Type a message or attach a file.', true);
  if (!pass) return say('Enter a passphrase. Without one the note could be read by anyone.', true);
  if (useDecoy && (!decoyText || !decoyPass)) return say('For a decoy, fill in both the decoy message and its passphrase (or clear both).', true);
  if (useDecoy && decoyPass === pass) return say('The decoy passphrase must be different from the real one.', true);

  const item = attached
    ? { type: FILE, name: attached.name, data: new Uint8Array(await attached.arrayBuffer()) }
    : { type: TEXT, name: '', data: enc.encode($('#msg').value) };
  if (item.data.length > room(p.img, enc.encode(item.name.slice(0, 100)).length)) {
    return say('That does not fit in this image. Use a bigger cover image or a smaller message/file.', true);
  }
  const decoyData = enc.encode(decoyText);
  if (useDecoy && decoyData.length > room(p.img)) return say('The decoy message is too long for this image.', true);

  const settings = {
    visibleSeconds: readVisible(),
    effect: $('#vanish-effect').value,
    animationSeconds: Number($('#animation-duration').value),
  };
  const size = plainSize(p.img);
  const outName = `${p.name.replace(/\.[^.]+$/, '')}-pixelnote.png`;
  const proc = UI.proc;
  proc.open({
    mode: 'hide', title: 'Securing your note', sub: 'Encrypting it and hiding it inside the pixels of your image.', img: p.canvas,
    steps: [
      { label: 'Analyze image', fx: 'scan', T: 900 },
      { label: 'Encrypt', fx: 'pixelate', T: 1100 },
      { label: 'Embed in pixels', fx: 'embed', T: 1500 },
      { label: 'Verify', fx: 'verify', T: 1000 },
      { label: 'Save PNG', fx: 'download', T: 1700 },
    ],
  });
  let blob;
  try {
    await proc.step(0);
    const [real, fake] = await proc.step(1, async () => [
      await seal(pass, pack(item.type, item.name, item.data, size, settings)),
      useDecoy ? await seal(decoyPass, pack(TEXT, '', decoyData, size, settings)) : randomBytes(slotSize(p.img)),
    ]);
    blob = await proc.step(2, async () => {
      const realFirst = crypto.getRandomValues(new Uint8Array(1))[0] & 1; // slot order carries no information
      const payload = randomBytes(capacity(p.img));
      payload.set(realFirst ? real : fake, 0);
      payload.set(realFirst ? fake : real, slotSize(p.img));
      embed(p.img.data, payload);
      p.ctx.putImageData(p.img, 0, 0);
      return p.canvas.convertToBlob({ type: 'image/png' });
    });
    await proc.step(3, async () => { // read the finished PNG back so a broken result is never saved
      const back = await readNote(await loadPixels(blob).then((r) => r.img), pass);
      if (!back || back.data.length !== item.data.length || !back.data.every((b, i) => b === item.data[i])) throw new Error('verify');
    });
    await proc.step(4, async () => download(blob, outName));
  } catch (e) {
    proc.fail(e.message === 'verify'
      ? 'Verification failed, so nothing was saved. Your browser may be altering canvas pixels (privacy/anti-fingerprint settings).'
      : `Unexpected error: ${e.message}`, 'Could not secure the note');
    return;
  }
  proc.finish({
    title: 'Note hidden, verified & saved',
    sub: 'Share the PNG as a file or “document”, never as a normal photo: chat apps re-compress photos and destroy the note.',
    actions: [{ label: 'Download again', run: () => download(blob, outName) }, { label: 'Done', primary: true }],
  });
}

// ---------- reveal ----------
function clearReveal(options = {}) {
  clearTimeout(clearTimer);
  clearInterval(countdownInterval);
  clearTimeout(animationTimer);
  clearTimer = countdownInterval = animationTimer = 0;
  revealed = null;
  $('#out').textContent = '';
  $('#vanish-text').textContent = '';
  $('#vanish-text').className = 'vanish-text';
  $('#vanish-stage').hidden = true;
  $('#countdown').hidden = true;
  $('#pass-reveal').value = '';
  for (const id of ['#out', '#file-out', '#out-actions', '#auto']) $(id).hidden = true;
  if (!options.keepFileName) $('#file-meta').textContent = '';
}

function startVanish(note) {
  clearInterval(countdownInterval);
  clearTimeout(clearTimer);
  $('#countdown').hidden = true;
  const seconds = note.settings?.animationSeconds ?? DEFAULT_SETTINGS.animationSeconds;
  const effect = note.settings?.effect || DEFAULT_SETTINGS.effect;
  const stage = $('#vanish-stage');
  const text = $('#vanish-text');
  const message = note.type === FILE ? ($('#file-meta').textContent || 'Hidden file') : $('#out').textContent;
  $('#out').hidden = true;
  $('#file-out').hidden = true;
  $('#out-actions').hidden = true;
  stage.hidden = false;
  text.textContent = message;
  text.className = 'vanish-text';
  $('#vanish-caption').textContent = 'Message is disappearing…';
  if (!seconds || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    text.textContent = '';
    $('#vanish-caption').textContent = 'Message vanished';
    clearReveal();
    say('Message vanished. The local reveal view has been cleared.');
    return;
  }
  text.classList.add(effect, 'vanishing');
  text.style.setProperty('--vanish-duration', `${seconds}s`);
  $('#auto').hidden = false;
  $('#auto').textContent = `Vanish animation: ${effect} · ${seconds}s`;
  animationTimer = setTimeout(() => {
    clearReveal();
    say('Message vanished. The local reveal view has been cleared.');
  }, seconds * 1000);
}

function startReadTimer(note) {
  const seconds = Math.max(0, Math.min(60, Number(note.settings?.visibleSeconds ?? DEFAULT_SETTINGS.visibleSeconds)));
  if (seconds === 0) { startVanish(note); return; }
  const deadline = Date.now() + seconds * 1000;
  const update = () => {
    const remaining = Math.max(0, deadline - Date.now());
    $('#countdown').textContent = `⏳ Vanishing in ${(remaining / 1000).toFixed(1)}s`;
    $('#countdown').hidden = false;
    if (remaining <= 0) startVanish(note);
  };
  update();
  countdownInterval = setInterval(update, 100);
  clearTimer = setTimeout(() => startVanish(note), seconds * 1000);
  $('#auto').hidden = false;
  $('#auto').textContent = `This message will vanish after ${seconds} seconds, followed by its selected animation.`;
}

async function reveal() {
  const p = picked.reveal;
  const pass = $('#pass-reveal').value;
  clearReveal();
  if (!p) return say('Choose an image first.', true);
  if (!pass) return say('Enter the passphrase.', true);

  const proc = UI.proc;
  proc.open({
    mode: 'reveal', title: 'Unlocking your note', sub: 'Reading the hidden bits and decrypting them locally.', img: p.canvas,
    steps: [
      { label: 'Read pixels', fx: 'scan', T: 900 },
      { label: 'Decrypt', fx: 'pixelate', T: 1100 },
      { label: 'Unpack', fx: 'extract', T: 1100 },
    ],
  });
  let note;
  try {
    await proc.step(0);
    note = await proc.step(1, () => readNote(p.img, pass));
    if (!note) return proc.fail('Nothing could be read. Wrong passphrase, no hidden note, or the image was re-compressed, resized or screenshotted.', 'Could not unlock');
    await proc.step(2);
  } catch (e) {
    return proc.fail(`Unexpected error: ${e.message}`, 'Could not unlock');
  }

  if (note.type === TEXT) {
    // Text opens in a full-screen tab. The plaintext is handed over in memory only (never in a URL).
    const data = {
      message: dec.decode(note.data),
      effect: note.settings?.effect || DEFAULT_SETTINGS.effect,
      visibleSeconds: note.settings?.visibleSeconds ?? DEFAULT_SETTINGS.visibleSeconds,
      animationSeconds: note.settings?.animationSeconds ?? DEFAULT_SETTINGS.animationSeconds,
      intensity: Number(localStorage.getItem('pn.intensity')) || 1,
      sound: localStorage.getItem('pn.sound') === '1',
    };
    $('#pass-reveal').value = '';
    const showLocal = () => { // small in-page view, used when the full-screen tab cannot open
      proc.close();
      $('#out').textContent = data.message;
      $('#out').hidden = false; $('#out-actions').hidden = false; $('#copy').hidden = false;
      startReadTimer(note);
    };
    if (openImmersive(data)) {
      proc.finish({ title: 'Message unlocked', sub: 'Opened in the full-screen view.', actions: [{ label: 'Close', primary: true }] });
      await UI.sleep(1500);
      if (!proc.el.hidden) proc.close();
      return;
    }
    proc.finish({
      title: 'Message unlocked', sub: 'Your browser blocked the new tab. Open the message with one click.',
      actions: [
        { label: 'Open full-screen message', primary: true, run: () => { if (openImmersive(data)) proc.close(); else showLocal(); } },
        { label: 'Show here instead', run: showLocal },
      ],
    });
    return;
  }

  revealed = note;
  $('#file-meta').textContent = `${note.name || 'hidden file'} (${note.data.length.toLocaleString()} bytes)`;
  proc.finish({
    title: 'File unlocked', sub: `${note.name || 'Hidden file'} was decrypted and is ready to download.`,
    actions: [{
      label: 'Continue', primary: true, run: () => {
        proc.close();
        $('#file-out').hidden = false; $('#out-actions').hidden = false; $('#copy').hidden = true;
        startReadTimer(note);
      },
    }],
  });
}

// Open animation.html and pass the message through window.name (same extension origin; the page clears it at once).
// If that fails, a BroadcastChannel hand-off answers the page's request while this popup is still alive.
function openImmersive(data) {
  let win = null;
  try { win = window.open('animation.html', '_blank'); } catch { /* blocked */ }
  if (win) {
    try { win.name = 'PIXELNOTE:' + JSON.stringify(data); return true; } catch { /* use channel */ }
  }
  if (typeof BroadcastChannel !== 'function') return !!win;
  const ch = new BroadcastChannel('pixelnote-handoff');
  const stop = () => { clearTimeout(timer); ch.close(); };
  const timer = setTimeout(stop, 8000);
  ch.onmessage = (ev) => {
    if (ev.data?.type === 'need') ch.postMessage({ type: 'data', payload: data });
    else if (ev.data?.type === 'got') stop();
  };
  if (!win) { stop(); return false; }
  return true;
}

function readVisible() {
  const v = $('#visible-for').value;
  return v === 'custom' ? Math.max(0, Math.min(60, Math.round(Number($('#visible-custom').value) || 0))) : Number(v);
}

function previewEffect() {
  const q = new URLSearchParams({ demo: $('#vanish-effect').value, d: String($('#animation-duration').value), v: '2', i: localStorage.getItem('pn.intensity') || '1', s: localStorage.getItem('pn.sound') === '1' ? '1' : '0' });
  window.open('animation.html?' + q, '_blank');
}

// ---------- wiring ----------
async function choose(which, file) {
  if (!file?.type.startsWith('image/')) return say('Please choose an image file.', true);
  try {
    const pixels = await loadPixels(file);
    if (which === 'hide' && room(pixels.img) < 16) return say('This image is too small to hold a note. Pick a larger one.', true);
    picked[which] = { name: file.name, ...pixels };
    const w = pixels.img.width, h = pixels.img.height, dz = $(`#drop-${which}`), prev = $(`#prev-${which}`);
    $(`#name-${which}`).textContent = file.name;
    $(`#bar-${which}`).textContent = `${file.name} · ${w}×${h}`;
    $(`#dim-${which}`).textContent = `${w} × ${h} px · ${Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB`;
    $(`#dim-${which}`).classList.add('on');
    $(`#ready-${which}`).textContent = which === 'hide' ? `${Math.round(room(pixels.img) / 1024).toLocaleString()} KB usable per note` : 'Ready to unlock';
    $(`#ready-${which}`).classList.add('on');
    if (prev.dataset.url) URL.revokeObjectURL(prev.dataset.url);
    prev.dataset.url = URL.createObjectURL(file); prev.src = prev.dataset.url; prev.hidden = false;
    dz.classList.remove('scanning'); void dz.offsetWidth; dz.classList.add('has-img', 'scanning');
    setTimeout(() => dz.classList.remove('scanning'), 1900);
    if (which === 'hide') updateHints();
    say('');
  } catch {
    picked[which] = null;
    say('Could not read that image. It may be corrupt or an unsupported format.', true);
  }
}

async function guarded(button, job) {
  const label = button.innerHTML;
  button.disabled = true;
  button.querySelector('span') ? (button.querySelector('span').textContent = 'Working…') : (button.textContent = 'Working…');
  try { await job(); } catch (e) { say(`Unexpected error: ${e.message}`, true); } finally { button.disabled = false; button.innerHTML = label; }
}

function setTab(name) {
  if (name !== tab && tab === 'reveal') clearReveal();
  tab = name;
  document.querySelector('.tabs').dataset.i = name === 'reveal' ? '1' : '0';
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $('#hide').hidden = name !== 'hide';
  $('#reveal').hidden = name !== 'reveal';
  say('');
}

document.querySelectorAll('[role=tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
for (const which of ['hide', 'reveal']) {
  $(`#f-${which}`).onchange = (e) => { choose(which, e.target.files[0]); e.target.value = ''; };
  const zone = $(`#drop-${which}`);
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = () => zone.classList.remove('over');
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); choose(which, e.dataTransfer.files[0]); };
}
document.querySelectorAll('.eye').forEach((b) => (b.onclick = () => {
  const input = $(`#${b.dataset.for}`);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.textContent = show ? 'Hide' : 'Show';
}));
$('#attach').onclick = () => $('#f-payload').click();
$('#f-payload').onchange = (e) => { if (e.target.files[0]) setAttached(e.target.files[0]); e.target.value = ''; };
$('#chip-x').onclick = () => setAttached(null);
$('#msg').oninput = updateHints;
$('#pass-hide').oninput = updateHints;
$('#go-hide').onclick = (e) => guarded(e.currentTarget, hide);
$('#go-reveal').onclick = (e) => guarded(e.currentTarget, reveal);
$('#clear').onclick = () => { clearReveal(); say(''); };
$('#save').onclick = () => download(new Blob([revealed.data]), revealed.name.replace(/[\\/:*?"<>|]/g, '_') || 'hidden-file');
$('#copy').onclick = async (e) => {
  await navigator.clipboard.writeText($('#out').textContent).catch(() => {});
  e.target.textContent = 'Copied ✓';
  setTimeout(() => (e.target.textContent = 'Copy message'), 1200);
};
window.addEventListener('paste', (e) => {
  const image = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
  if (image) choose(tab, image);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());
setTab('hide');
UI.background();
UI.proc = new UI.Process();
updateHints();

// ---------- effect picker, intensity, sound, preview ----------
function pickEffect(id) {
  $('#vanish-effect').value = id;
  document.querySelectorAll('.fx-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.fx === id)));
}
document.querySelectorAll('.fx-chip').forEach((c) => (c.onclick = () => pickEffect(c.dataset.fx)));
pickEffect($('#vanish-effect').value);
$('#visible-for').onchange = () => { $('#visible-custom').hidden = $('#visible-for').value !== 'custom'; };
$('#intensity').value = localStorage.getItem('pn.intensity') || '1';
$('#intensity').onchange = (e) => localStorage.setItem('pn.intensity', e.target.value);
$('#sound').checked = localStorage.getItem('pn.sound') === '1';
$('#sound').onchange = (e) => localStorage.setItem('pn.sound', e.target.checked ? '1' : '0');
$('#preview').onclick = previewEffect;

// ---------- web app: offline support ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (!window.isSecureContext) say('This page must be served over HTTPS (or localhost): encryption is unavailable otherwise.', true);
