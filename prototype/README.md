# FLOWSTATE — concept prototype video

`flowstate-prototype.mp4` (80 s, 1920×1080, 30 fps) walks through the planned app:

1. Journey search (Places autocomplete, current location, recent/saved journeys)
2. Traffic-aware route comparison (alternatives, traffic-on-polyline colouring, freshness)
3. Intelligent stops along the route, ranked by real driving detour
4. Detour comparison (origin → stop → destination vs. baseline)
5. Multi-stop journey with manual reordering
6. Emergency hub (112 via dialer, offline directory, explicit location sharing, hospitals)
7. Cost-control and privacy settings

**This is a concept prototype.** All place names, durations, ratings and numbers are
illustrative — they are not live Google Maps Platform results. The map is original
stylised artwork, not a Google Maps rendering.

## Re-render

```bash
node prototype/render.js prototype/out          # full MP4 → prototype/out/flowstate-prototype.mp4
node prototype/render.js prototype/out --frames 300,900   # PNG stills of specific frames
```

Requires Node, Playwright (Chromium) and ffmpeg. Open `index.html` in a browser to
preview the animation live.
