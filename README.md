# PixelNote (web app)

Hide an encrypted note (or small file) inside a PNG, and reveal it with full-screen vanish effects.
Everything runs in the browser: no server code, no network calls, no libraries.

## Run locally
    cd webapp
    python3 -m http.server 8000
    # open http://localhost:8000

## Deploy (static hosting, HTTPS required for encryption APIs)
Upload the folder to Netlify (drag & drop), Vercel, Cloudflare Pages, or GitHub Pages.
Installable as an app (PWA) and works offline after the first visit.

## Notes
- The reveal opens `animation.html` in a new tab. Allow pop-ups for the site if your browser blocks it
  (otherwise a small in-page view is used).
- Images must be shared as files/"documents", not as photos (chat apps recompress and destroy the note).
- Images made with the Chrome extension open here, and vice versa.
