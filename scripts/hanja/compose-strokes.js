'use strict';
// 획순 데이터(hanzi-writer-data)에 없는 시험용 정자 4자(敎 飮 窓 淸)를 부품 글자를 합쳐 만든다.
//   node scripts/hanja/compose-strokes.js  →  public/data/strokes/<글자>.json
// 비슷한 글자(教 飲 窗 清)의 한쪽 부품은 그대로 두고, 다른 쪽 부품을 정자의 부품 글자 획으로 갈아 끼운다.
// 획 수와 순서는 정자와 같고, 모양은 부품을 알맞은 칸에 맞춰 넣은 근사치다.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'node_modules', 'hanzi-writer-data');
const OUT = path.join(__dirname, '..', '..', 'public', 'data', 'strokes');
const load = (c) => JSON.parse(fs.readFileSync(path.join(SRC, `${c}.json`), 'utf8'));

// SVG 경로(M L Q C Z, 절대좌표)의 모든 좌표 쌍에 변환을 적용한다
function mapPath(d, f) {
  let odd = false;
  let x = 0;
  return d.replace(/([MLQCZ])|(-?\d+(?:\.\d+)?)/g, (tok, cmd, num) => {
    if (cmd) { odd = false; return cmd; }
    const v = Number(num);
    if (!odd) { x = v; odd = true; return null; } // x 는 y 와 함께 한 번에 낸다
    odd = false;
    const [nx, ny] = f(x, v);
    return `${Math.round(nx)} ${Math.round(ny)}`;
  }).replace(/null\s*/g, '').replace(/\s+/g, ' ').trim();
}

function boundsOf(strokes) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const d of strokes) {
    let odd = false;
    let x = 0;
    for (const m of d.matchAll(/(-?\d+(?:\.\d+)?)/g)) {
      const v = Number(m[1]);
      if (!odd) { x = v; odd = true; continue; } // eslint-disable-line no-continue
      odd = false;
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
      b.y0 = Math.min(b.y0, v); b.y1 = Math.max(b.y1, v);
    }
  }
  return b;
}

// 부품 글자의 모든 획을 목표 상자(box)에 꼭 맞게 옮긴다
function fit(char, box) {
  const d = load(char);
  const s = boundsOf(d.strokes);
  const fx = (x) => box.x0 + ((x - s.x0) / (s.x1 - s.x0 || 1)) * (box.x1 - box.x0);
  const fy = (y) => box.y0 + ((y - s.y0) / (s.y1 - s.y0 || 1)) * (box.y1 - box.y0);
  const f = (x, y) => [fx(x), fy(y)];
  return {
    strokes: d.strokes.map((p) => mapPath(p, f)),
    medians: d.medians.map((m) => m.map(([x, y]) => f(x, y).map(Math.round))),
  };
}

const part = (d, idx) => ({ strokes: idx.map((i) => d.strokes[i]), medians: idx.map((i) => d.medians[i]) });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const join = (...parts) => ({
  strokes: parts.flatMap((p) => p.strokes),
  medians: parts.flatMap((p) => p.medians),
});
const sub = (box, fx0, fx1, fy0, fy1) => ({
  x0: box.x0 + (box.x1 - box.x0) * fx0,
  x1: box.x0 + (box.x1 - box.x0) * fx1,
  y0: box.y0 + (box.y1 - box.y0) * fy0,
  y1: box.y0 + (box.y1 - box.y0) * fy1,
});

const recipes = {
  // 淸 = 氵(清의 앞 3획) + 靑 (清의 青 자리에 맞춤)
  淸: () => {
    const base = load('清');
    const right = boundsOf(range(3, 10).map((i) => base.strokes[i]));
    return join(part(base, range(0, 2)), fit('靑', right));
  },
  // 飮 = 食(飲의 飠 자리에 맞춤) + 欠(飲의 뒤 4획)
  飮: () => {
    const base = load('飲');
    const left = boundsOf(range(0, 7).map((i) => base.strokes[i]));
    return join(fit('食', left), part(base, range(8, 11)));
  },
  // 敎 = 爻(위) + 子(아래), 教의 孝 자리에 맞춤 + 攵(教의 뒤 4획)
  敎: () => {
    const base = load('教');
    const left = boundsOf(range(0, 6).map((i) => base.strokes[i]));
    return join(fit('爻', sub(left, 0, 1, 0.5, 1)), fit('子', sub(left, 0.06, 0.94, 0, 0.44)), part(base, range(7, 10)));
  },
  // 窓 = 穴(窗의 앞 5획) + 厶(위) + 心(아래), 窗의 囪 자리에 맞춤
  窓: () => {
    const base = load('窗');
    const low = boundsOf(range(5, 11).map((i) => base.strokes[i]));
    return join(part(base, range(0, 4)), fit('厶', sub(low, 0.3, 0.7, 0.58, 1)), fit('心', sub(low, 0.02, 0.98, 0, 0.5)));
  },
};

fs.mkdirSync(OUT, { recursive: true });
for (const [ch, make] of Object.entries(recipes)) {
  const d = make();
  d.radStrokes = []; // 부수 강조는 쓰지 않는다
  fs.writeFileSync(path.join(OUT, `${ch}.json`), JSON.stringify(d));
  console.log(`${ch}: ${d.strokes.length}획 → public/data/strokes/${ch}.json`);
}
