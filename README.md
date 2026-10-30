<div align="center">

# 🔐 PixelNote

**Hide encrypted notes inside ordinary images — and watch them burn, dissolve or explode after they are read.**

AES-256-GCM encryption · invisible pixel embedding · 8 cinematic vanish effects · 100% offline

`No server` · `No tracking` · `No dependencies` · `Installable (PWA)`

</div>

---

## Table of contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [How to use](#how-to-use)
- [Vanish effects](#vanish-effects)
- [How it works](#how-it-works)
- [Security and privacy](#security-and-privacy)
- [Limits and good practice](#limits-and-good-practice)
- [Deploy](#deploy)
- [Project structure](#project-structure)
- [Browser support](#browser-support)
- [Troubleshooting](#troubleshooting)
- [Migrating from the Chrome extension](#migrating-from-the-chrome-extension)

## What it does

PixelNote encrypts a message (or a small file) with a passphrase and hides it in the pixels of an image you choose.
The result is a normal-looking PNG. Only someone with the PNG **and** the passphrase can read it.
When the message is opened, it appears full-screen for a chosen time and then vanishes with a particle effect.

| | |
|---|---|
| 🔒 **Strong encryption** | AES-256-GCM, key derived with PBKDF2-SHA-256 (250,000 iterations) |
| 🖼️ **Invisible storage** | Ciphertext lives in the least-significant bits of the RGB pixels |
| 🎭 **Deniable decoy** | Optional second note with its own passphrase; nothing shows that it exists |
| 📎 **Text or files** | Hide a message, or any small file (PDF, TXT, DOC…), restored byte for byte |
| ✅ **Self-verifying** | The finished PNG is read back and checked before it is offered for download |
| 🔥 **Vanish effects** | Fire, water, air, smoke, glitch, colour burst, bomb, fade |
| ⚡ **Animated workflow** | Live scan, encrypt, embed, verify and download animations |
| 📴 **Fully offline** | No network requests at all; works without internet after the first load |

## Quick start

```bash
cd webapp
python3 -m http.server 8000
# open http://localhost:8000
```

> Encryption uses the browser's Web Crypto API, which requires **HTTPS or `localhost`**.
> Opening `index.html` by double-click (`file://`) is not supported.

## How to use

### Hide a note

1. Open the **Hide** tab and drop a cover image (or click, or paste with `Ctrl+V`).
2. Type your message, or choose **hide a file instead**.
3. Enter a strong passphrase (the meter shows its strength).
4. Pick a vanish effect, how long the message stays visible, and how long the animation runs.
5. *(Optional)* Add a decoy message with a different passphrase.
6. Click **Encrypt, hide & download PNG** and watch the process. The PNG downloads automatically.

### Reveal a note

1. Open the **Reveal** tab and drop the PixelNote PNG (the original file, not a screenshot).
2. Enter the passphrase and click **Unlock & reveal**.
3. Text opens in a full-screen view with the countdown and chosen effect. Files are offered for download.

### Share it safely

Send the PNG **as a file or "document"**, never as a normal photo. Chat apps (WhatsApp, Instagram, Telegram photo mode)
re-compress photos, which destroys the hidden data.

## Vanish effects

The message is drawn on a canvas and torn into thousands of particles, so letters really burn, wash away, blow off or explode.

| Effect | What you see |
|---|---|
| 🔥 **Fire** | Layered flames climb through the text, letters glow, break into embers and fall as ash, with heat-haze shimmer |
| 💧 **Water** | Rain, splashes, a travelling-wave surface, ripples, caustics and bubbles wash the letters away |
| 🌬️ **Air** | A gust sweeps left to right; letters tear off as streaks in a turbulent wind field |
| 🌫️ **Smoke** | Letters turn into curling, expanding smoke driven by curl-noise flow |
| ⚡ **Glitch** | RGB split, band tearing, data-mosh slices, pixel blocks, scanlines and static |
| 🎨 **Colour burst** | Holi-style powder bursts; the message turns into coloured pigment |
| 💣 **Bomb** | Fuse tremble, flash, shockwave, fireball, debris, sparks and screen shake |
| ✨ **Fade** | A clean blur-and-opacity fade |

**Controls:** visible time (Immediate, 1, 5, 10, 30, 60 s or custom 0–60), animation length (Immediate to 60 s),
intensity (Low / Normal / High), optional synthesised sound (off by default), and a full-screen **Preview** button.
`prefers-reduced-motion` switches everything to a short, gentle fade. Press `Esc` to close the viewer.

## How it works

```
 message ──► pad with random bytes ──► AES-256-GCM ──► 2 equal slots ──► LSB of R,G,B pixels ──► PNG
              (fixed size)             (key = PBKDF2)   (real + decoy/noise)
```

- **Key derivation:** PBKDF2-SHA-256, 250,000 iterations, random 16-byte salt per slot.
- **Encryption:** AES-256-GCM with a random 12-byte IV; the GCM tag authenticates the data.
- **Embedding:** one bit per colour channel (R, G, B; alpha is skipped), so capacity per image is
  `width × height × 3 / 8` bytes in total, split into two equal slots (so about `width × height × 3 / 16` bytes per note).
- **Deniability:** every slot is padded with random bytes to a fixed size, and an unused slot is pure random noise.
  A slot holding the real note, a decoy, or nothing looks identical. Slot order is randomised.
- **Settings inside the image:** the effect, visibility time and animation length are stored *inside* the encrypted payload.
- **Verification:** after embedding, the PNG is decoded again and the note is read back and compared before download.

Rough capacity: a 1920×1080 image holds about 760 KB in total, which is about 380 KB per note (each of the two slots).

## Security and privacy

- Everything runs **locally in your browser**. There is no backend and no analytics; the app makes no network calls.
- The message reaches the full-screen tab through `window.name` on the same origin and is cleared immediately.
  It is never placed in a URL.
- After the vanish, the canvas, particle arrays and text are released.
- The service worker only caches the app's own static files for offline use.

**What PixelNote cannot do:**

- It cannot stop screenshots, screen recordings, copies, or clipboard history.
- It cannot stop someone from opening the original PNG again; strict one-time access needs a trusted server or key-release system.
- Without the passphrase the note cannot be read, but forensic tools may still detect that an image was altered.
- Anyone holding the image can try passphrases offline, so **use a strong passphrase** (4+ random words).
- A forgotten passphrase cannot be recovered.

## Limits and good practice

- Output is always **PNG** (lossless). JPEG, screenshots, resizing and chat-app photo compression destroy the note.
- Transparent areas of the cover image become white.
- Photos with detail (textures, gradients, noise) make better covers than flat colours.
- Larger images hold more data. The capacity ring in the app shows exactly how much fits.
- Hidden files are limited by capacity; very large files need a very large cover image.
- Use a decoy passphrase you can safely hand over if pressured.

## Deploy

PixelNote is a static site, so any static host works. HTTPS is required (all of these provide it).

| Host | How |
|---|---|
| **Netlify** | Drag and drop the `webapp` folder onto app.netlify.com/drop |
| **Cloudflare Pages** | Create a project, upload the folder, no build command |
| **Vercel** | `npx vercel` inside the folder (framework: Other, no build) |
| **GitHub Pages** | Push the folder contents and enable Pages from the branch root |

After the first visit the app works offline and can be installed from the browser's menu ("Install PixelNote").
When you change files, bump `CACHE` in `sw.js` so returning visitors get the update.

## Project structure

```
webapp/
├─ index.html            App shell (Hide / Reveal tabs, forms, process overlay)
├─ style.css             Dark glass UI, animations, responsive layout
├─ app.js                Crypto, embedding, packing, hide/reveal pipelines, UI wiring
├─ fx-ui.js              Animated background and the scan/encrypt/embed/verify/download animation
├─ animation.html        Full-screen viewer for revealed messages
├─ animation.css         Viewer styles
├─ animation.js          Viewer controller (countdown, vanish, completion screen)
├─ fx-core.js            Shared helpers: noise, text-to-particles, batching
├─ fx-fire.js            Fire, bomb and smoke effects
├─ fx-nature.js          Water, air, glitch, colour burst and fade effects
├─ fx-sound.js           Optional Web Audio sound (no audio files)
├─ sw.js                 Service worker (offline cache)
├─ manifest.webmanifest  PWA manifest
└─ icon.svg              App icon
```

## Browser support

Current Chrome, Edge, Firefox and Safari (16.4+) on desktop and mobile. Requires Web Crypto, `OffscreenCanvas`
and Canvas 2D. Allow pop-ups for the site so the full-screen viewer can open; if it is blocked, the app offers an
**Open full-screen message** button or a small in-page view instead.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Nothing could be read" | Wrong passphrase, or the image was re-compressed, resized or screenshotted. Use the original PNG file. |
| "Verification failed" | Your browser may be altering canvas pixels (privacy / anti-fingerprinting mode). Disable it for this site. |
| Encryption error on open | Serve the app over HTTPS or `localhost`; `file://` does not work. |
| Full-screen view does not open | Allow pop-ups for the site, or use the button the app shows. |
| Note lost after sharing | The image was sent as a photo. Send it as a file or "document". |
| No sound | Sound is off by default; enable it in the effect settings and click once on the page. |

## Migrating from the Chrome extension

The web app uses the same payload format as the PixelNote Chrome extension (v2.2). PNGs created by either one open in the
other, and older v2.0/v2.1 images still work.

---

<div align="center">

Built for privacy. A visual effect, not a vault: treat anything you reveal as something that can still be copied.

</div>
