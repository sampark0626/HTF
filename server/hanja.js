'use strict';
// 한문 6급 과정: 하루 5자 × 60일 = 배정한자 300자. 글자와 요령은 public/data/hanja6.json (scripts/hanja/build.js 로 만든다).
// 서버는 진도(몇 번째 날인지)와 하루 규칙, 시험 날짜에 맞춘 계획, 기록만 맡는다.
const fs = require('fs');
const path = require('path');

const TOTAL_DAYS = 60;
const PER_DAY = 5;
// 8급 · 7급Ⅱ · 7급 · 6급Ⅱ · 6급 새 한자가 시작되는 날 (scripts/hanja/build.js 의 LEVELS 와 같아야 한다)
const LEVEL_STARTS = [1, 11, 21, 31, 46];
const HOMEWORK_TITLE = '📖 한문 6급 · 오늘의 5자';
const MAX_RESULTS = 120; // 한 번에 받는 글자별 결과의 최대 개수

// 한문 과정을 기본으로 켜 둘 아이 (부모님 메뉴에서 아이마다 켜고 끌 수 있다)
const DEFAULT_KIDS = (process.env.HANJA_KIDS ?? '박준선').split(',').map((s) => s.trim()).filter(Boolean);

// 시험 날짜(YYYY-MM-DD): 한문을 기본으로 켜 둔 아이는 이 날짜의 시험을 준비한다. 부모님 메뉴에서 아이마다 바꾸거나 끌 수 있다.
const DEFAULT_EXAM = (process.env.HANJA_EXAM ?? '2026-11-21').trim();

// 배정한자 300자 (모의시험·약한 글자 기록에서 모르는 글자를 걸러 낸다)
let CHARS = new Set();
try {
  const course = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'hanja6.json'), 'utf8'));
  CHARS = new Set(course.days.flatMap((d) => d.chars.map((c) => c.h)));
} catch (err) {
  console.warn('[hanja] 커리큘럼을 읽지 못했어요:', err.message);
}

// 하루는 한국 시간 기준 (서버는 UTC 로 돈다)
const kstDate = (ms = Date.now()) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function enabledFor(user) {
  if (user.hanja_on === 1) return true;
  if (user.hanja_on === 0) return false;
  return DEFAULT_KIDS.includes(user.name);
}

const clampDay = (v) => Math.min(TOTAL_DAYS + 1, Math.max(1, Math.round(Number(v)) || 1));

// 이 아이의 시험 날짜: 정해 둔 것이 있으면 그것(빈 글자면 시험 없음), 없으면 기본값
function examDateOf(user) {
  if (user.hanja_exam === null || user.hanja_exam === undefined) return DEFAULT_KIDS.includes(user.name) && validDate(DEFAULT_EXAM) ? DEFAULT_EXAM : '';
  return validDate(user.hanja_exam) ? user.hanja_exam : '';
}

// 시험까지 계획: 시험 4일 전까지는 남은 수업을 나눠서(하루 1~3개), 마지막 3일은 모의시험으로 마무리한다.
//  phase: study 공부 기간 / final 마무리 3일 / today 시험날. 시험이 지났으면 null.
//  goal: 오늘 순서대로 해야 할 수업 수. 오늘 시작할 때의 남은 수업(left + advToday)을 기준으로 해서 하루 안에서는 바뀌지 않는다.
function examPlan(user, day, advToday, now) {
  const date = examDateOf(user);
  if (!date) return null;
  const dday = daysBetween(kstDate(now), date);
  if (dday < 0) return null;
  const left = Math.max(0, TOTAL_DAYS - (day - 1));
  const phase = dday === 0 ? 'today' : dday <= 3 ? 'final' : 'study';
  let goal = 0;
  if (phase === 'study') goal = left + advToday === 0 ? 0 : Math.min(3, Math.max(1, Math.ceil((left + advToday) / Math.max(1, dday - 3))));
  else if (phase === 'final') goal = 1;
  return { date, dday, phase, goal, left };
}

function publicHanja(user, now = Date.now()) {
  const day = clampDay(user.hanja_day);
  const last = user.hanja_last || '';
  const today = kstDate(now);
  const finished = day > TOTAL_DAYS;
  const advToday = last === today ? Math.max(1, user.hanja_cnt || 0) : 0; // 오늘 순서대로 나아간 수업 수
  const exam = examPlan(user, day, advToday, now);
  const goal = exam ? exam.goal : 1;
  return {
    enabled: enabledFor(user),
    day, // 다음에 공부할 날 (61 이면 60일을 모두 마친 것)
    totalDays: TOTAL_DAYS,
    perDay: PER_DAY,
    started: Boolean(last) || day > 1,
    doneToday: last === today || (user.hanja_alt || '') === today, // 오늘의 한문(숙제)을 끝냈는지: 수업·약한 글자 수업·모의시험 중 하나
    finished,
    learned: Math.min(TOTAL_DAYS, day - 1) * PER_DAY,
    levelStarts: LEVEL_STARTS,
    advToday,
    goal, // 오늘 순서대로 나아갈 수업 수 (시험 계획이 없으면 1)
    canAdvance: !finished && advToday < goal,
    exam,
  };
}

// 오늘의 한문 숙제 이름 (시험 대비 중이면 남은 날을 붙인다)
function homeworkTitle(user, now = Date.now()) {
  const { exam } = publicHanja(user, now);
  return exam ? `📖 한문 · 시험 대비 ${exam.dday === 0 ? 'D-day' : `D-${exam.dday}`}` : HOMEWORK_TITLE;
}

module.exports = {
  TOTAL_DAYS, PER_DAY, LEVEL_STARTS, HOMEWORK_TITLE, MAX_RESULTS, DEFAULT_KIDS, DEFAULT_EXAM, CHARS,
  kstDate, validDate, daysBetween, enabledFor, clampDay, examDateOf, publicHanja, homeworkTitle,
};
