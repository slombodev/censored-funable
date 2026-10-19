// Todos los sonidos son sintéticos (Web Audio API), sin archivos externos.
let ctx = null;
let out = null;
let noiseBuffer = null;
let muted = false;
try { muted = localStorage.getItem('censored.muted') === '1'; } catch {}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = muted ? 0 : 0.6;
    out.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, { to, type = 'sine', dur = 0.12, vol = 0.2, at = 0, attack = 0.005 } = {}) {
  const c = audio();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.3, at = 0, filter = 'bandpass', freq = 1000, to, q = 1 } = {}) {
  const c = audio();
  if (!c || muted) return;
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const biquad = c.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(freq, t);
  if (to) biquad.frequency.exponentialRampToValueAtTime(to, t + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(biquad).connect(gain).connect(out);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  click: () => tone(520, { to: 780, type: 'triangle', dur: 0.06, vol: 0.12 }),
  pop: () => tone(320, { to: 960, dur: 0.09, vol: 0.16 }),
  tick: () => tone(1400, { type: 'square', dur: 0.035, vol: 0.07 }),
  error: () => tone(150, { type: 'square', dur: 0.22, vol: 0.12 }),
  vote: () => {
    tone(880, { to: 1320, type: 'triangle', dur: 0.1, vol: 0.14 });
    tone(1320, { type: 'triangle', dur: 0.12, vol: 0.1, at: 0.08 });
  },
  join: () => [523, 659, 784].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.14, vol: 0.13, at: i * 0.07 })),
  submit: () => {
    noise({ dur: 0.12, vol: 0.4, filter: 'lowpass', freq: 900 });
    tone(180, { to: 90, type: 'square', dur: 0.15, vol: 0.12 });
  },
  alarm: () => {
    for (let i = 0; i < 6; i++) tone(i % 2 ? 660 : 880, { type: 'sawtooth', dur: 0.13, vol: 0.12, at: i * 0.15 });
  },
  // Redoble que acelera hasta el momento de quitar la censura.
  drumroll: (seconds = 1.1) => {
    let t = 0;
    let gap = 0.1;
    while (t < seconds) {
      const k = t / seconds;
      noise({ dur: 0.07, vol: 0.18 + k * 0.25, at: t, freq: 220 + k * 200, q: 0.7 });
      tone(85, { type: 'sine', dur: 0.06, vol: 0.1 + k * 0.1, at: t });
      gap = Math.max(0.03, gap * 0.92);
      t += gap;
    }
    tone(110, { to: 330, type: 'sawtooth', dur: seconds, vol: 0.05, attack: seconds * 0.8 });
  },
  // Golpe + cristales + barrido: la censura se rompe.
  shatter: () => {
    noise({ dur: 0.9, vol: 0.55, filter: 'highpass', freq: 3000, to: 500 });
    tone(150, { to: 36, dur: 0.6, vol: 0.6 });
    tone(900, { to: 70, type: 'sawtooth', dur: 0.45, vol: 0.1 });
    for (let i = 0; i < 7; i++) {
      tone(2200 + Math.random() * 2400, { type: 'triangle', dur: 0.08, vol: 0.06, at: 0.04 + i * 0.045 });
    }
  },
  fanfare: () => {
    [523, 659, 784].forEach((f, i) => tone(f, { type: 'square', dur: 0.12, vol: 0.08, at: i * 0.11 }));
    [1047, 1319].forEach((f) => tone(f, { type: 'square', dur: 0.6, vol: 0.07, at: 0.36 }));
  },
};

export function unlockAudio() {
  audio();
}

export const isMuted = () => muted;

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('censored.muted', muted ? '1' : '0'); } catch {}
  if (out) out.gain.value = muted ? 0 : 0.6;
  return muted;
}
