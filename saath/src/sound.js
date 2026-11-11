/* Saath — interface sounds, synthesised with WebAudio (no audio files).
   Same names and recipes as video/audio.py, which renders them for the video. */
(function (g) {
  'use strict';
  let ctx = null, master = null, on = true, ringTimer = null;
  function ensure() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, t, len, gain, type = 'sine', attack = .004) {
    const o = ctx.createOscillator(), a = ctx.createGain();
    o.type = type; o.frequency.value = f;
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(gain, t + attack); a.gain.exponentialRampToValueAtTime(.0001, t + len);
    o.connect(a).connect(master); o.start(t); o.stop(t + len + .05);
  }
  const marimba = (f, t, g = .22) => { tone(f, t, .7, g, 'sine', .002); tone(f * 3.93, t, .14, g * .22, 'sine', .001); tone(f * 9.2, t, .05, g * .06, 'sine', .001); };
  const bell = (f, t, g = .16) => { tone(f, t, 1.5, g, 'sine', .003); tone(f * 2.76, t, .7, g * .3, 'sine', .002); tone(f * 5.4, t, .3, g * .1, 'sine', .002); };
  const N = { D5: 587.33, Fs5: 739.99, A5: 880, B5: 987.77, D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760 };
  const DTMF = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] };
  const SFX = {
    ring: t => { [N.D5, N.Fs5, N.A5, N.Fs5].forEach((f, i) => marimba(f, t + i * .17)); [N.D5, N.Fs5, N.A5, N.B5].forEach((f, i) => marimba(f, t + .8 + i * .17)); },
    connect: t => { tone(1046.5, t, .09, .07); tone(1318.5, t + .1, .12, .07); },
    hangup: t => { tone(659.25, t, .14, .08); tone(523.25, t + .16, .2, .08); },
    notify: t => { bell(N.E6, t); bell(N.A6, t + .12, .12); },
    success: t => { [N.D6, N.Fs6, N.A6].forEach((f, i) => marimba(f, t + i * .08, .17)); },
    tick: t => marimba(N.A5, t, .14),
    help: t => { tone(196, t, .35, .3, 'sine', .002); tone(392, t, .25, .1, 'triangle', .002); },
    alert: t => { for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) { const s = t + r * .8 + i * .19; tone(880, s, .14, .1, 'triangle'); tone(1318.5, s, .14, .06); } },
    resolve: t => { marimba(N.A5, t, .15); marimba(N.D5, t + .15, .15); }
  };
  function startRing() { stopRing(); if (!on || !ensure()) return; const go = () => SFX.ring(ctx.currentTime + .03); go(); ringTimer = setInterval(go, 2700); }
  function stopRing() { if (ringTimer) { clearInterval(ringTimer); ringTimer = null; } }
  function play(name) {
    if (name === 'ring_stop') return stopRing();
    if (!on || !ensure()) return;
    if (name === 'ring_start') return startRing();
    const t = ctx.currentTime + .01;
    if (name.startsWith('dtmf_')) { const p = DTMF[name.slice(5)]; if (p) { tone(p[0], t, .16, .06); tone(p[1], t, .16, .06); } return; }
    if (SFX[name]) SFX[name](t);
  }
  g.SaathSound = { play, unlock: ensure, setOn(v) { on = v; if (!v) stopRing(); }, isOn: () => on, isRinging: () => !!ringTimer };
})(window);
