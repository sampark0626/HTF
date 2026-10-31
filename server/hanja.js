'use strict';
// 한문 6급 과정: 하루 5자 × 60일 = 배정한자 300자. 글자와 요령은 public/data/hanja6.json (scripts/hanja/build.js 로 만든다).
// 서버는 진도(몇 번째 날인지)와 하루 한 번 규칙, 기록만 맡는다.

const TOTAL_DAYS = 60;
const PER_DAY = 5;
// 8급 · 7급Ⅱ · 7급 · 6급Ⅱ · 6급 새 한자가 시작되는 날 (scripts/hanja/build.js 의 LEVELS 와 같아야 한다)
const LEVEL_STARTS = [1, 11, 21, 31, 46];
const HOMEWORK_TITLE = '📖 한문 6급 · 오늘의 5자';

// 한문 과정을 기본으로 켜 둘 아이 (부모님 메뉴에서 아이마다 켜고 끌 수 있다)
const DEFAULT_KIDS = (process.env.HANJA_KIDS ?? '박준선').split(',').map((s) => s.trim()).filter(Boolean);

// 하루는 한국 시간 기준 (서버는 UTC 로 돈다)
const kstDate = (ms = Date.now()) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

function enabledFor(user) {
  if (user.hanja_on === 1) return true;
  if (user.hanja_on === 0) return false;
  return DEFAULT_KIDS.includes(user.name);
}

const clampDay = (v) => Math.min(TOTAL_DAYS + 1, Math.max(1, Math.round(Number(v)) || 1));

function publicHanja(user, now = Date.now()) {
  const day = clampDay(user.hanja_day);
  const last = user.hanja_last || '';
  return {
    enabled: enabledFor(user),
    day, // 다음에 공부할 날 (61 이면 60일을 모두 마친 것)
    totalDays: TOTAL_DAYS,
    perDay: PER_DAY,
    started: Boolean(last) || day > 1,
    doneToday: last === kstDate(now),
    finished: day > TOTAL_DAYS,
    learned: Math.min(TOTAL_DAYS, day - 1) * PER_DAY,
    levelStarts: LEVEL_STARTS,
  };
}

module.exports = { TOTAL_DAYS, PER_DAY, LEVEL_STARTS, HOMEWORK_TITLE, DEFAULT_KIDS, kstDate, enabledFor, clampDay, publicHanja };
