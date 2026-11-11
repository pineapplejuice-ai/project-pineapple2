# Saath

Care for your parents, from wherever you are.

Saath checks on ageing parents in tier-2 India every morning with a short voice call in their
language, sends verified local helpers (Sahayaks) when needed, and keeps siblings in one loop.
Pilot city: Mysuru.

| What | Where |
|---|---|
| MVP scope | [`docs/MVP_SCOPE.md`](docs/MVP_SCOPE.md) |
| Validation plan | [`docs/VALIDATION_PLAN.md`](docs/VALIDATION_PLAN.md) |
| Clickable prototype (source) | `src/app.js` (shared family state, both phones), `src/app.css`, `src/sound.js` (WebAudio interface sounds), `src/page.html` (two-phone shell with the story guide) |
| Clickable prototype (single file) | `dist/index.html`, built by `node saath/build.js` |
| Prototype video | `video/saath-prototype.mp4` (74 s, 1080p, with sound) |
| Video renderer | `video/video.html` drives the same app with a scripted timeline; `video/audio.py` renders the score and interface sounds from the recorded cues; `node saath/video/render.js <outDir>` builds the MP4 (needs Playwright, ffmpeg, numpy, scipy) |
| Voiceover script | [`video/VOICEOVER.md`](video/VOICEOVER.md) |

The prototype shows both phones side by side: **Amma** (Lakshmi, 66, Mysuru) gets a daily voice
call in Kannada and has a big Help button; **Priya** (her daughter, Bengaluru) sees how her parents
are, books a verified helper for her father's check-up, and is alerted when her mother needs help.
A four-step guide and a hint ring show what to tap next. On a phone, one device is shown at a time
and the guide switches between them.

**All people, places, prices and medical details are illustrative.** Kannada and Hindi strings
need review by native speakers before any real use.

Fonts in `video/fonts` are from Fontsource (SIL Open Font License). The music and sounds are synthesised in code; there are no third-party audio files.
