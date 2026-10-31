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

// 마음 쉼터 배경음: 낮고 느린 화음 + 가끔 울리는 맑은 음(펜타토닉). 모두 합성이라 파일이 없다.
let amb = null;
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

function chime(a, bus, freq) {
  const t = a.currentTime;
  const osc = a.createOscillator();
  const over = a.createOscillator();
  const g = a.createGain();
  osc.type = 'sine';
  over.type = 'sine';
  osc.frequency.value = freq;
  over.frequency.value = freq * 2.01;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
  const og = a.createGain();
  og.gain.value = 0.25;
  osc.connect(g);
  over.connect(og).connect(g);
  g.connect(bus);
  osc.start(t);
  over.start(t);
  osc.stop(t + 3.5);
  over.stop(t + 3.5);
}

export const sfx = {
  get muted() { return muted; },
  setMuted(v) {
    muted = v;
    try { localStorage.setItem('htf_muted', v ? '1' : '0'); } catch (_) { /* 무시 */ }
    if (amb && ctx) amb.bus.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, 0.2);
  },
  ambientStart() {
    const a = audio();
    if (!a || amb) return;
    const bus = a.createGain();
    bus.gain.value = 0;
    bus.connect(a.destination);
    bus.gain.setTargetAtTime(muted ? 0 : 1, a.currentTime, 1.5); // 천천히 커진다
    const drones = [[130.81, 0.05], [196.0, 0.035], [329.63, 0.012]].map(([f, v]) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = v;
      o.connect(g).connect(bus);
      o.start();
      return { o, g };
    });
    const lfo = a.createOscillator(); // 화음이 아주 느리게 숨 쉬듯 커졌다 작아진다
    const lg = a.createGain();
    lfo.frequency.value = 0.1;
    lg.gain.value = 0.012;
    lfo.connect(lg);
    drones.forEach((d) => lg.connect(d.g.gain));
    lfo.start();
    const timer = setInterval(() => {
      if (muted) return;
      chime(a, bus, PENTA[Math.floor(Math.random() * PENTA.length)]);
    }, 3200);
    amb = { bus, drones, lfo, timer };
  },
  ambientStop() {
    if (!amb || !ctx) return;
    const { bus, drones, lfo, timer } = amb;
    amb = null;
    clearInterval(timer);
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => {
      drones.forEach((d) => d.o.stop());
      lfo.stop();
      bus.disconnect();
    }, 1800);
  },
  // 마음 별을 얻었을 때: 부드럽게 올라가는 세 음
  twinkle() { melody([1046.5, 1318.5, 1568], 0.11, { gain: 0.14 }); },
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
