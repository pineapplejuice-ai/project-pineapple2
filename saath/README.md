# Saath

Care for your parents, from wherever you are.

Saath checks on ageing parents in tier-2 India every morning with a short voice call in their
language, sends verified local helpers (Sahayaks) when needed, and keeps siblings in one loop.
Pilot city: Mysuru.

| What | Where |
|---|---|
| MVP scope | [`docs/MVP_SCOPE.md`](docs/MVP_SCOPE.md) |
| Validation plan | [`docs/VALIDATION_PLAN.md`](docs/VALIDATION_PLAN.md) |
| Clickable prototype (source) | `src/` — `app.js` (state + views), `app.css`, `page.html` (shell) |
| Clickable prototype (single file) | `dist/index.html` — built by `node saath/build.js` |
| Prototype video | `video/saath-prototype.mp4` (101 s, 1080p) |
| Video renderer | `video/video.html` drives the same app with a scripted timeline; `node saath/video/render.js <outDir>` |

The prototype runs two phones: **Priya** (daughter, Bengaluru) and **Amma** (Lakshmi, 66, Mysuru),
including the voice-call check-in for basic phones in Kannada, Hindi or English.

**All people, places, prices and medical details are illustrative.** Kannada and Hindi strings
need review by native speakers before any real use.

Fonts in `video/fonts` are from Fontsource (SIL Open Font License).
