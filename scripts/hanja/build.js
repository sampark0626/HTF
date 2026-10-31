'use strict';
// 한문 6급 커리큘럼 만들기: node scripts/hanja/build.js
//  official.json  한국어문회 6급 배정한자 300자 (급수·훈음·부수·획수. 한국어문회 공개 자료를 정리한 것)
//  notes-*.txt    하루 5자 묶음과 글자마다 "외우는 요령"·낱말 예시 (직접 쓴 글)
//  → public/data/hanja6.json (아이 화면이 불러 쓴다). 빠지거나 겹치는 글자가 있으면 오류로 멈춘다.
const fs = require('fs');
const path = require('path');

const here = __dirname;
const out = path.join(here, '..', '..', 'public', 'data', 'hanja6.json');
const official = JSON.parse(fs.readFileSync(path.join(here, 'official.json'), 'utf8'));
const byChar = new Map(official.map((o) => [o.h.normalize('NFC'), o]));

// 하루 5자씩 60일: 8급 10일 → 7급Ⅱ 10일 → 7급 10일 → 6급Ⅱ 15일 → 6급 15일
const LEVELS = [
  { key: '8급', days: 10 },
  { key: '7급Ⅱ', days: 10 },
  { key: '7급', days: 10 },
  { key: '6급Ⅱ', days: 15 },
  { key: '6급', days: 15 },
];
const levelOfDay = (day) => {
  let start = 1;
  for (const l of LEVELS) {
    if (day < start + l.days) return l.key;
    start += l.days;
  }
  return null;
};

// 공식 대표 훈음을 아이가 읽기 쉽게 다듬는다 (괄호 풀이 제거, 여러 훈은 대표 하나 + 나머지는 다른 읽기)
const OVERRIDE = {
  韓: { k: '나라', s: '한' },
  食: { k: '밥', s: '식', alt: [['먹을', '식']] },
  右: { k: '오른쪽', s: '우' },
  漢: { k: '한수', s: '한' },
  主: { k: '임금', s: '주', alt: [['주인', '주']] },
  區: { k: '구분할', s: '구', alt: [['지경', '구']] },
  李: { k: '오얏', s: '리' },
  別: { k: '다를', s: '별', alt: [['나눌', '별']] },
  使: { k: '하여금', s: '사', alt: [['부릴', '사']] },
  反: { k: '돌이킬', s: '반', alt: [['돌아올', '반']] },
  車: { k: '수레', s: '차', alt: [['수레', '거']] },
  金: { k: '쇠', s: '금', alt: [['성', '김']] },
  北: { k: '북녘', s: '북', alt: [['달아날', '배']] },
};
const clean = (t) => t.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)$/, '').trim();

function readingOf(o) {
  const ov = OVERRIDE[o.h];
  if (ov) return { k: ov.k, s: ov.s, alt: ov.alt || [] };
  const [first, ...rest] = o.reads;
  return { k: clean(first[0]), s: clean(first[1]), alt: rest.map(([k, s]) => [clean(k), clean(s)]) };
}

// 노트 읽기
const notes = new Map(); // 글자 → { m, w }
const dayPlan = []; // { day, title, chars }
let cur = null;
for (const file of ['notes-1.txt', 'notes-2.txt', 'notes-3.txt']) {
  const lines = fs.readFileSync(path.join(here, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    if (!line.trim() || line.startsWith('#') && !line.startsWith('##')) return;
    const head = /^## Day (\d+) \| (.+)$/.exec(line);
    if (head) {
      cur = { day: Number(head[1]), title: head[2].trim(), chars: [] };
      dayPlan.push(cur);
      return;
    }
    const parts = line.split(' | ');
    if (parts.length !== 3) throw new Error(`${where}: "글자 | 요령 | 낱말" 형식이 아니에요: ${line}`);
    const h = parts[0].trim().normalize('NFC');
    if (!byChar.has(h)) throw new Error(`${where}: 6급 배정한자가 아니에요: ${h}`);
    if (notes.has(h)) throw new Error(`${where}: 글자가 겹쳐요: ${h}`);
    const words = parts[2].split(';').map((w) => w.trim()).filter(Boolean).map((w) => {
      const f = w.split(':');
      if (f.length !== 3) throw new Error(`${where}: 낱말 형식이 "한자:독음:뜻" 이 아니에요: ${w}`);
      const [word, reading, meaning] = f.map((x) => x.trim());
      if (!word.normalize('NFC').includes(h)) throw new Error(`${where}: 낱말 ${word} 에 ${h} 가 없어요`);
      if ([...word].length !== [...reading].length) throw new Error(`${where}: ${word} 와 독음 ${reading} 의 글자 수가 달라요`);
      return [word.normalize('NFC'), reading, meaning];
    });
    if (!words.length) throw new Error(`${where}: 낱말이 없어요: ${h}`);
    notes.set(h, { m: parts[1].trim(), w: words });
    cur.chars.push(h);
  });
}

// 검증: 60일 × 5자, 300자가 빠짐없이 한 번씩, 급수 순서 일치
const problems = [];
if (dayPlan.length !== 60) problems.push(`하루 묶음이 ${dayPlan.length}개예요 (60개여야 해요)`);
dayPlan.forEach((d, i) => {
  if (d.day !== i + 1) problems.push(`Day ${d.day} 번호가 순서와 달라요 (${i + 1} 이어야 해요)`);
  if (d.chars.length !== 5) problems.push(`Day ${d.day} 는 ${d.chars.length}자예요 (5자여야 해요)`);
  const lv = levelOfDay(d.day);
  for (const h of d.chars) if (byChar.get(h).lv !== lv) problems.push(`Day ${d.day} 의 ${h} 는 ${byChar.get(h).lv} 인데 이 날은 ${lv} 예요`);
});
for (const h of byChar.keys()) if (!notes.has(h)) problems.push(`빠진 글자: ${h}`);
if (notes.size !== 300) problems.push(`글자가 ${notes.size}개예요 (300개여야 해요)`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const days = dayPlan.map((d) => ({
  day: d.day,
  title: d.title,
  level: levelOfDay(d.day),
  chars: d.chars.map((h) => {
    const o = byChar.get(h);
    const n = notes.get(h);
    const r = readingOf(o);
    return { h, k: r.k, s: r.s, alt: r.alt, lv: o.lv, r: o.r, n: o.n, m: n.m, w: n.w };
  }),
}));

let start = 1;
const levels = LEVELS.map((l) => {
  const row = { key: l.key, startDay: start, days: l.days };
  start += l.days;
  return row;
});

fs.writeFileSync(out, JSON.stringify({ version: 1, totalDays: 60, perDay: 5, levels, days }));
console.log(`OK: ${days.length}일 × 5자 = ${notes.size}자 → ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(1)}KB)`);
