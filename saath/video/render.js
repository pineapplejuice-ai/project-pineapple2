#!/usr/bin/env node
/*
 * Renders saath/video/video.html frame-by-frame (deterministic timeline) and
 * encodes an H.264 MP4 with ffmpeg.
 *
 *   node prototype/render.js [outDir] [--fps 30] [--workers 4] [--frames 0,450,900]
 *
 * --frames renders only the listed frame numbers as PNG stills (for review).
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const outDir = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'saath/video/out');
const fps = Number(opt('--fps', 30));
const workers = Number(opt('--workers', 4));
const stills = opt('--frames', null);
const page = 'file://' + path.resolve(__dirname, 'video.html') + '?render=1';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const framesDir = path.join(outDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const browser = await chromium.launch();
  const newPage = async () => {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await p.goto(page);
    await p.evaluate(() => document.fonts.ready);
    return p;
  };

  if (stills) {
    const p = await newPage();
    for (const f of stills.split(',').map(Number)) {
      await p.evaluate(t => window.renderAt(t), f / fps);
      await p.screenshot({ path: path.join(outDir, `still_${String(f).padStart(5, '0')}.png`) });
    }
    await browser.close();
    return;
  }

  const duration = await (await newPage()).evaluate(() => window.DURATION);
  const total = Math.round(duration * fps);
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async () => {
    const p = await newPage();
    while (next < total) {
      const f = next++;
      await p.evaluate(t => window.renderAt(t), f / fps);
      await p.screenshot({ path: path.join(framesDir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
      if (++done % 300 === 0) console.log(`${done}/${total} frames (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  }));
  // soundtrack: the page recorded every sound cue during its dry run
  const specPage = await newPage();
  const spec = await specPage.evaluate(() => window.AUDIO_SPEC);
  await browser.close();
  const specPath = path.join(outDir, 'audio-spec.json'), wav = path.join(outDir, 'soundtrack.wav');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 1));
  execFileSync('python3', [path.join(__dirname, 'audio.py'), specPath, wav], { stdio: 'inherit' });

  const mp4 = path.join(outDir, 'saath-prototype.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(framesDir, 'f%05d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  console.log('wrote', mp4);
})();
