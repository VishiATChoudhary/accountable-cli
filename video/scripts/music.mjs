// Original 120 BPM track synthesized from scratch, timed to the demo (1 bar = 2 s = 60 frames).
// Intro bars 0-3, drop 4-19, breakdown/outro 20-23, ends on a final hit and tail.
import { writeFileSync } from "node:fs";

const SR = 44100, BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4, BARS = 24;
const LEN = Math.ceil((BARS * BAR + 2) * SR);
const L = new Float32Array(LEN), R = new Float32Array(LEN);
const sendL = new Float32Array(LEN), sendR = new Float32Array(LEN);
const duck = new Float32Array(LEN).fill(1);

let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const add = (i, l, r, s = 0) => { if (i < 0 || i >= LEN) return; L[i] += l; R[i] += r; sendL[i] += l * s; sendR[i] += r * s; };

// A minor: Am F C G, voiced close
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const ROOTS = [45, 41, 48, 43];
const chordAt = (bar) => CHORDS[bar % 4];
const rootAt = (bar) => ROOTS[bar % 4];
const drop = (bar) => bar >= 4 && bar < 20;

function kick(t0, gain = 1) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(0.45 * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 45 + 120 * Math.exp(-t * 28);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-t * 7) * gain * 0.9 + (i < 60 ? rnd() * 0.25 * gain : 0);
    add(s0 + i, v, v);
  }
  for (let i = 0; i < 0.3 * SR; i++) { const k = s0 + i; if (k < LEN) duck[k] = Math.min(duck[k], 0.25 + 0.75 * Math.min(1, i / (0.22 * SR))); }
}

function hat(t0, gain, open = false) {
  const s0 = Math.floor(t0 * SR), n = Math.floor((open ? 0.18 : 0.05) * SR);
  let hp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const x = rnd(); hp = 0.92 * (hp + x - prev); prev = x;
    const v = hp * Math.exp(-(i / SR) * (open ? 22 : 70)) * gain;
    add(s0 + i, v * 0.8, v, 0.1);
  }
}

function clap(t0, gain = 0.5) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(0.25 * SR);
  let bp1 = 0, bp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = (t < 0.03 ? (Math.floor(t / 0.01) % 1 === 0 ? Math.exp(-((t % 0.01) * 300)) : 0) : 0) + Math.exp(-t * 18) * 0.8;
    const x = rnd(); bp1 += 0.35 * (x - bp1); bp2 += 0.35 * (bp1 - bp2);
    const v = (bp1 - bp2) * env * gain * 2.2;
    add(s0 + i, v, v, 0.35);
  }
}

function pluck(t0, midi, gain, pan = 0) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(0.4 * SR), f = hz(midi);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, ph = (t * f) % 1;
    const raw = (ph < 0.5 ? 1 : -1) * 0.6 + (2 * ph - 1) * 0.4;
    const cut = 0.04 + 0.5 * Math.exp(-t * 22);
    lp += cut * (raw - lp);
    const v = lp * Math.exp(-t * 9) * gain;
    add(s0 + i, v * (1 - pan) , v * (1 + pan), 0.45);
  }
}

function bassNote(t0, dur, midi, gain) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR), f = hz(midi);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, ph = (t * f) % 1;
    const raw = Math.sin(2 * Math.PI * ph) * 0.8 + (2 * ph - 1) * 0.45;
    lp += (0.08 + 0.15 * Math.exp(-t * 18)) * (raw - lp);
    const env = Math.min(1, t / 0.005) * Math.min(1, (dur - t) / 0.02);
    const v = Math.tanh(lp * 1.8) * env * gain;
    add(s0 + i, v, v);
  }
}

function pad(t0, dur, notes, gain, bright) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const voices = notes.flatMap((m) => [-0.12, 0, 0.11].map((d) => ({ f: hz(m + d), p: Math.abs(rnd()) })));
  let lpL = 0, lpR = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let a = 0, b = 0;
    voices.forEach((v, k) => { const s = 2 * ((t * v.f + v.p) % 1) - 1; if (k % 2) a += s; else b += s; });
    const c = bright(t0 + t);
    lpL += c * (a - lpL); lpR += c * (b - lpR);
    const env = Math.min(1, t / 0.08) * Math.min(1, (dur - t) / 0.08);
    add(s0 + i, lpL * env * gain, lpR * env * gain, 0.5);
  }
}

function noiseSweep(t0, dur, gain, up = true) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, x = rnd();
    const c = up ? 0.01 + 0.6 * u * u : 0.6 * (1 - u) ** 2 + 0.01;
    lp += c * (x - lp);
    const env = up ? u * u : (1 - u) ** 1.5;
    add(s0 + i, lp * env * gain, lp * env * gain * 0.9, 0.4);
  }
}

function boom(t0, gain = 1) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(2.2 * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR; ph += (2 * Math.PI * (38 + 60 * Math.exp(-t * 6))) / SR;
    const v = Math.sin(ph) * Math.exp(-t * 2.2) * gain;
    add(s0 + i, v, v, 0.2);
  }
  noiseSweep(t0, 2, 0.35 * gain, false);
}

for (let bar = 0; bar < BARS; bar++) {
  const t = bar * BAR, ch = chordAt(bar), root = rootAt(bar);
  const intro = bar < 4, outro = bar >= 20;
  // pad, filter opening through the intro
  pad(t, BAR, ch, drop(bar) ? 0.055 : 0.07, (x) => intro ? 0.01 + 0.05 * (x / (4 * BAR)) ** 2 : outro ? 0.03 : 0.06);
  // arp: 16ths, chord tones climbing over two octaves
  const arp = [...ch, ...ch.map((m) => m + 12), ch[0] + 24, ...ch.map((m) => m + 12).reverse()];
  for (let s = 0; s < 16; s++) {
    if (outro && bar === 23 && s > 0) break;
    const g = intro ? 0.05 + 0.1 * (bar / 4 + s / 64) : outro ? 0.09 * (1 - (bar - 20) / 4) : 0.13;
    pluck(t + (s * BEAT) / 4, arp[s % arp.length] + 12, g, s % 2 ? 0.35 : -0.35);
  }
  if (drop(bar)) {
    for (let b = 0; b < 4; b++) {
      kick(t + b * BEAT);
      hat(t + b * BEAT + BEAT / 2, 0.22, b === 3 && bar % 2 === 1);
      hat(t + b * BEAT + BEAT / 4, 0.07); hat(t + b * BEAT + (3 * BEAT) / 4, 0.07);
      if (b % 2) clap(t + b * BEAT);
      // offbeat bass with octave pops
      bassNote(t + b * BEAT + BEAT / 2, BEAT / 2 - 0.02, root - 12 + (b === 3 ? 12 : 0), 0.32);
      bassNote(t + b * BEAT + (3 * BEAT) / 4, BEAT / 4 - 0.02, root - 12, 0.22);
    }
    if (bar % 4 === 3) for (let k = 0; k < 4; k++) clap(t + 3 * BEAT + (k * BEAT) / 4, 0.18 + k * 0.05);
  } else if (intro && bar >= 2) {
    for (let b = 0; b < 4; b++) hat(t + b * BEAT + BEAT / 2, 0.05 + 0.05 * (bar - 2));
  } else if (outro && bar < 23) {
    kick(t, 0.7);
    bassNote(t, BAR * 0.9, root - 12, 0.2);
  }
}
noiseSweep(2 * BAR, 2 * BAR, 0.5);   // riser into the drop
boom(4 * BAR, 1);
noiseSweep(19 * BAR, BAR, 0.35);     // riser into the outro
boom(20 * BAR, 0.8);
boom(23 * BAR, 0.9);                 // final hit
pad(23 * BAR, BAR + 1.5, [57, 64, 69, 72], 0.08, () => 0.04);

// reverb: 4 combs + 2 allpasses (Schroeder), stereo-offset
function reverb(src, offs) {
  const out = new Float32Array(LEN);
  for (const [d, g] of [[1557, 0.84], [1617, 0.83], [1491, 0.85], [1422, 0.84]]) {
    const n = d + offs, buf = new Float32Array(n); let idx = 0, lp = 0;
    for (let i = 0; i < LEN; i++) { const y = buf[idx]; lp += 0.3 * (y - lp); buf[idx] = src[i] + lp * g; idx = (idx + 1) % n; out[i] += y * 0.25; }
  }
  for (const d of [225, 556]) {
    const buf = new Float32Array(d + offs); let idx = 0;
    for (let i = 0; i < LEN; i++) { const b = buf[idx]; const y = -out[i] + b; buf[idx] = out[i] + b * 0.5; idx = (idx + 1) % buf.length; out[i] = y; }
  }
  return out;
}
// ping-pong delay (dotted eighth) on the send too
const dly = Math.floor(BEAT * 0.75 * SR), dL = new Float32Array(LEN), dR = new Float32Array(LEN);
for (let i = dly; i < LEN; i++) { dL[i] = sendR[i - dly] * 0.35 + dR[i - dly] * 0.45; dR[i] = sendL[i - dly] * 0.35 + dL[i - dly] * 0.45; }
const rvL = reverb(sendL, 0), rvR = reverb(sendR, 23);

let peak = 0;
const mix = new Float32Array(LEN * 2);
for (let i = 0; i < LEN; i++) {
  const d = duck[i];
  // sidechain: everything but the kick is ducked; approximate by ducking the wet + pad bus as a whole
  const l = L[i] * (0.55 + 0.45 * d) + (rvL[i] * 0.5 + dL[i] * 0.4) * d;
  const r = R[i] * (0.55 + 0.45 * d) + (rvR[i] * 0.5 + dR[i] * 0.4) * d;
  mix[2 * i] = l; mix[2 * i + 1] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const fadeStart = LEN - 0.6 * SR;
const buf = Buffer.alloc(44 + LEN * 4);
const g = 0.95 / peak;
for (let i = 0; i < LEN; i++) {
  const f = i > fadeStart ? 1 - (i - fadeStart) / (LEN - fadeStart) : 1;
  for (let c = 0; c < 2; c++) {
    const v = Math.tanh(mix[2 * i + c] * g * 1.3) / Math.tanh(1.3) * f;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + (2 * i + c) * 2);
  }
}
buf.write("RIFF", 0); buf.writeUInt32LE(36 + LEN * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(LEN * 4, 40);
writeFileSync(process.argv[2] ?? "music.wav", buf);
console.log(`wrote ${(LEN / SR).toFixed(1)}s`);
