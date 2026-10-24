// 효과음: 파일 없이 WebAudio 로 만든다. 첫 터치 뒤에 unlock() 해야 소리가 난다 (태블릿 정책).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('htf_muted') === '1'; } catch (_) { /* 무시 */ }

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, { type = 'sine', gain = 0.18, delay = 0, slide = 0 } = {}) {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

const melody = (notes, step = 0.1, opts = {}) => notes.forEach((f, i) => tone(f, 0.2, { type: 'triangle', delay: i * step, ...opts }));

export const sfx = {
  get muted() { return muted; },
  setMuted(v) {
    muted = v;
    try { localStorage.setItem('htf_muted', v ? '1' : '0'); } catch (_) { /* 무시 */ }
  },
  unlock() { audio(); },
  tap() { tone(520, 0.07, { type: 'triangle' }); },
  pop() { tone(400, 0.14, { slide: 500 }); },
  tick() { tone(900, 0.06, { type: 'square', gain: 0.07 }); },
  count(n) { tone(n === 0 ? 1175 : 660, n === 0 ? 0.35 : 0.18, { type: 'triangle', gain: 0.22 }); },
  go() { melody([523, 659, 784, 1047], 0.08, { gain: 0.22 }); },
  shutter() {
    tone(2200, 0.04, { type: 'square', gain: 0.1 });
    tone(1100, 0.07, { type: 'square', gain: 0.1, delay: 0.05 });
  },
  star(i) { tone(660 + i * 110, 0.22, { type: 'triangle', gain: 0.2 }); },
  success() { melody([523, 659, 784, 1047, 1319], 0.09, { gain: 0.22 }); },
  warn() {
    tone(440, 0.14, { type: 'sawtooth', gain: 0.07 });
    tone(440, 0.14, { type: 'sawtooth', gain: 0.07, delay: 0.22 });
  },
  alarm() {
    for (let i = 0; i < 8; i += 1) tone(i % 2 ? 880 : 1040, 0.18, { type: 'square', gain: 0.1, delay: i * 0.22 });
  },
  error() { tone(240, 0.28, { type: 'sawtooth', gain: 0.1, slide: -80 }); },
};
