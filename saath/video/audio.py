#!/usr/bin/env python3
"""
Saath — soundtrack for the prototype video.

Reads the cue list recorded by video.html (every tap, keypad tone, notification, payment,
alert …) and renders a stereo WAV:
  * score: soft felt-piano phrases in raga Mohanam (D E F# A B) over a tanpura drone (Sa–Pa),
    with a quieter, tense passage while Amma's alert is open and a resolving outro
  * interface sounds: the same recipes as src/sound.js
Everything is synthesised here; no samples or external audio.

usage: python3 audio.py spec.json out.wav
"""
import json, sys
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

SR = 48000
rng = np.random.default_rng(7)

def hz(n):  # note name -> Hz (A4 = 440)
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    name, octv = n[:-1], int(n[-1])
    return 440.0 * 2 ** ((names[name] + 12 * (octv - 4)) / 12)

def lowpass(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)

def bandpass(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)

def add(buf, x, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[1] or i + len(x) <= 0:
        return
    j = min(buf.shape[1], i + len(x))
    seg = x[: j - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:j] += seg * l * 1.414
    buf[1, i:j] += seg * r * 1.414

def tt(d):
    return np.arange(int(d * SR)) / SR

# ---------------- instruments ----------------
def piano(f, dur=3.2, vel=0.5):
    t = tt(dur); out = np.zeros_like(t); B = 0.00022
    for k in range(1, 12):
        fk = k * f * np.sqrt(1 + B * k * k)
        if fk > 7000: break
        amp = vel / k ** 1.7
        tau = 2.6 / k ** 0.75 * (260 / f) ** 0.35
        out += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    out *= np.minimum(1, t / 0.008)
    thump = lowpass(rng.normal(0, 1, len(t)) * np.exp(-t / 0.01), 900) * 0.03 * vel
    out = lowpass(out + thump, 3800)
    out[-int(.25 * SR):] *= np.linspace(1, 0, int(.25 * SR))
    return out

def tanpura(f, dur=4.6, vel=0.5):
    t = tt(dur); out = np.zeros_like(t)
    for k in range(1, 26):
        if k * f > 6000: break
        centre = 2.5 + 7.0 * t / dur                          # the "jawari" shimmer climbs the harmonics
        w = 0.35 + 0.65 * np.exp(-((k - centre) ** 2) / 10)
        out += (vel / k ** 0.85) * w * np.sin(2 * np.pi * k * f * t * (1 + 0.0004 * rng.normal()) + rng.uniform(0, 6.28))
    env = np.minimum(1, t / 0.02) * np.exp(-t / 3.2)
    return lowpass(out * env, 4500)

def pad(freqs, dur, vel=0.2):
    t = tt(dur); out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            out += np.sin(2 * np.pi * f * (1 + det / 100) * t + rng.uniform(0, 6.28))
    out *= vel / (3 * len(freqs))
    env = np.minimum(1, t / 3.0) * np.minimum(1, (dur - t) / 3.0)
    return lowpass(out * env, 1800)

def sine(f, d, g, attack=0.004, tau=None, kind='sine'):
    t = tt(d); ph = 2 * np.pi * f * t
    x = np.sin(ph) if kind == 'sine' else (2 / np.pi) * np.arcsin(np.sin(ph))
    env = np.minimum(1, t / attack) * (np.exp(-t / tau) if tau else np.minimum(1, (d - t) / 0.02))
    return x * env * g

def mix(*xs):
    out = np.zeros(max(len(x) for x in xs))
    for x in xs: out[:len(x)] += x
    return out

def marimba(f, g=0.22):
    return mix(sine(f, .7, g, .002, .18), sine(f * 3.93, .2, g * .22, .001, .04), sine(f * 9.2, .08, g * .06, .001, .015))

def bell(f, g=0.16):
    return mix(sine(f, 1.6, g, .003, .45), sine(f * 2.76, .8, g * .3, .002, .2), sine(f * 5.4, .4, g * .1, .002, .08))

DTMF = {'1': (697, 1209), '2': (697, 1336), '3': (697, 1477), '4': (770, 1209), '5': (770, 1336), '6': (770, 1477),
        '7': (852, 1209), '8': (852, 1336), '9': (852, 1477), '*': (941, 1209), '0': (941, 1336), '#': (941, 1477)}

def sfx(name):
    """returns list of (offset, signal, gain, pan)"""
    N = {k: hz(k) for k in ('D5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6')}
    if name == 'ring':
        seq = [('D5', 0), ('F#5', .17), ('A5', .34), ('F#5', .51), ('D5', .8), ('F#5', .97), ('A5', 1.14), ('B5', 1.31)]
        return [(o, marimba(N[n]), 1, -0.35) for n, o in seq]
    if name == 'connect': return [(0, sine(1046.5, .09, .07), 1, -.3), (.1, sine(1318.5, .12, .07), 1, -.3)]
    if name == 'hangup': return [(0, sine(659.25, .14, .08), 1, -.3), (.16, sine(523.25, .2, .08), 1, -.3)]
    if name.startswith('dtmf_'):
        a, b = DTMF.get(name[5:], (697, 1209)); return [(0, sine(a, .16, .06) + sine(b, .16, .06), 1, -.35)]
    if name == 'notify': return [(0, bell(N['E6']), 1, .35), (.12, bell(N['A6'], .12), 1, .35)]
    if name == 'success': return [(i * .08, marimba(f, .17), 1, .3) for i, f in enumerate((N['D6'], N['F#6'], N['A6']))]
    if name == 'tick': return [(0, marimba(N['A5'], .13), 1, .3)]
    if name == 'help': return [(0, sine(196, .4, .3, .002, .12), 1, -.35), (0, sine(392, .3, .1, .002, .08, 'tri'), 1, -.35)]
    if name == 'alert':
        out = []
        for r in range(2):
            for i in range(3):
                s = r * .8 + i * .19
                out += [(s, sine(880, .14, .09, .004, None, 'tri') + sine(1318.5, .14, .05), 1, .35)]
        return out
    if name == 'resolve': return [(0, marimba(N['A5'], .15), 1, .3), (.15, marimba(N['D5'], .15), 1, .3)]
    if name == 'tap':
        t = tt(.03); x = bandpass(rng.normal(0, 1, len(t)), 1500, 5000) * np.exp(-t / .004) * .05
        return [(0, x, 1, 0)]
    if name == 'whoosh':
        d = 1.1; t = tt(d); n = rng.normal(0, 1, len(t))
        lo = bandpass(n, 300, 900) * np.sin(np.pi * t / d) ** 2 * (1 - t / d)
        hi = bandpass(n, 1200, 3500) * np.sin(np.pi * t / d) ** 2 * (t / d)
        x = (lo + hi) * .05
        return [(0, x, 1, 0)]
    return []

# ---------------- score ----------------
def score(dur, sec):
    mus = np.zeros((2, int(dur * SR) + SR * 4))
    beat = 60 / 68
    # tanpura drone through the whole film: Pa, Sa', Sa', Sa
    cyc = 4 * beat
    t = 0.3
    while t < dur - 1:
        for i, n in enumerate(('A2', 'D3', 'D3', 'D2')):
            add(mus, tanpura(hz(n)), t + i * beat, (.03, .03, .03, .022)[i], pan=(-.25, .15, .2, -.1)[i])
        t += cyc
    # warm pad under the calm sections
    add(mus, pad([hz('D3'), hz('A3'), hz('E4')], sec['tense'] - 3.0), 3.0, .5)
    add(mus, pad([hz('D3'), hz('A3'), hz('F#4')], dur - sec['resolve'] + 1), sec['resolve'], .45)
    # felt piano: Mohanam phrases, one gentle figure per bar
    bars = [['D3', 'A3', 'D4', 'F#4', 'A4', 'F#4'], ['B2', 'F#3', 'B3', 'D4', 'E4', 'D4'],
            ['E3', 'B3', 'E4', 'F#4', 'B4', 'A4'], ['A2', 'E3', 'A3', 'B3', 'D4', 'E4']]
    tops = ['F#5', 'E5', 'D5', 'B4', 'A4', 'B4', 'D5', 'E5']
    bar = 4 * beat
    t, b = sec['main'], 0
    while t < sec['tense'] - .4:
        fig = bars[b % 4]
        for i, n in enumerate(fig):
            add(mus, piano(hz(n), vel=.55 if i == 0 else .32), t + i * beat * .66, .5, pan=-.2 + .08 * i)
        if b % 2 == 1:
            add(mus, piano(hz(tops[(b // 2) % len(tops)]), 3.6, .3), t + 2 * beat, .5, pan=.25)
        t += bar; b += 1
    # intro: two single notes
    add(mus, piano(hz('A4'), 3.5, .35), .6, .5); add(mus, piano(hz('D5'), 3.5, .3), 1.9, .5, .2)
    # tense passage: piano drops out, a slow low pulse like a held breath
    t = sec['tense'] + .4
    while t < sec['resolve'] - .2:
        add(mus, mix(sine(110, .6, .5, .01, .14), sine(220, .4, .12, .01, .08)), t, .5); add(mus, mix(sine(110, .6, .35, .01, .14), sine(220, .4, .08, .01, .08)), t + .3, .45)
        t += 1.2
    # resolution and outro
    res = [('D3', 0), ('A3', .4), ('D4', .8), ('F#4', 1.2), ('A4', 1.6), ('F#5', 2.4), ('E5', 3.6), ('D5', 4.8)]
    for n, o in res:
        add(mus, piano(hz(n), 4.5, .4 if hz(n) < 500 else .33), sec['resolve'] + .3 + o, .5, pan=.1)
    end = sec['outro'] + .6
    for i, n in enumerate(('D2', 'A2', 'D3', 'F#3', 'A3', 'D4', 'F#4', 'A4')):
        add(mus, piano(hz(n), 6.0, .38), end + i * .05, .45, pan=-.3 + .08 * i)
    add(mus, piano(hz('D5'), 6.0, .28), end + 1.6, .45, .3)
    # reverb
    ir_t = tt(2.6)
    ir = np.stack([rng.normal(0, 1, len(ir_t)) * np.exp(-ir_t / .75) for _ in range(2)])
    ir = np.stack([lowpass(ir[0], 5000), lowpass(ir[1], 5000)]); ir /= np.abs(ir).sum(axis=1, keepdims=True) ** .5 * 18
    wet = np.stack([fftconvolve(mus[c], ir[c])[: mus.shape[1]] for c in range(2)])
    mus = mus * .78 + wet * .9
    hp = butter(2, 90, 'high', fs=SR, output='sos')
    mus = np.stack([sosfilt(hp, mus[0]), sosfilt(hp, mus[1])])
    # fades
    n = mus.shape[1]; tl = np.arange(n) / SR
    mus *= np.clip(tl / 2.5, 0, 1) * np.clip((dur + .5 - tl) / 3.0, 0, 1)
    return mus

def main(spec_path, out_path):
    spec = json.load(open(spec_path))
    dur, sec = spec['duration'], spec['sections']
    music = score(dur, sec)
    fx = np.zeros_like(music)
    ring_on = None
    cues = sorted(spec['cues'], key=lambda c: c['at'])
    ring_stop_times = [c['at'] for c in cues if c['name'] == 'ring_stop']
    for c in cues:
        name, at = c['name'], c['at']
        if name == 'ring_start':
            stop = min([s for s in ring_stop_times if s > at] or [dur])
            t = at
            while t < stop - .2:
                for o, x, g, p in sfx('ring'):
                    if t + o < stop: add(fx, x, t + o, g * .9, p)
                t += 2.7
            continue
        if name == 'ring_stop':
            continue
        for o, x, g, p in sfx(name):
            add(fx, x, at + o, g, p)
    # duck the score a little under interface sounds
    env = np.abs(fx).max(axis=0)
    env = np.convolve(env, np.ones(int(.12 * SR)) / int(.12 * SR), mode='same')
    duck = 1 - np.clip(env * 4, 0, .35)
    out = music * .5 * duck + fx * 1.5
    out = out[:, : int(dur * SR)]
    out /= max(1e-6, np.abs(out).max()) / 0.95
    out = np.tanh(out * 1.2) / np.tanh(1.2) * 0.89     # gentle soft clip
    pcm = (out.T * 32767).astype('<i2')
    import wave
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('wrote', out_path, f'{dur:.1f}s', len(cues), 'cues')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
