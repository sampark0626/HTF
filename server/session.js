'use strict';
// HTF 세션 시간 계산 (일시정지 = "잠깐 멈춤" 반영). 시각은 모두 ms.
// 종료 시각 = 시작 + 설정한 시간 + 지금까지 멈춰 있던 시간.
// 멈춘 시간은 한 번의 HTF 에서 합쳐서 MAX_PAUSE_MIN(기본 10분)까지만 쓸 수 있다.

const MAX_PAUSE_MS = Math.round((Number(process.env.MAX_PAUSE_MIN) || 10) * 60 * 1000);

const pausedTotal = (s) => Number(s.paused_total || 0);
const baseEnd = (s) => s.started_at + s.duration_sec * 1000 + pausedTotal(s);

// 멈춘 시간을 쓴 만큼(진행 중인 멈춤 포함)
const pauseUsed = (s, now) => pausedTotal(s) + (s.paused_at ? Math.max(0, now - s.paused_at) : 0);
const pauseLeftMs = (s, now) => Math.max(0, MAX_PAUSE_MS - pauseUsed(s, now));

// 멈춘 채로 허용 시간을 넘겼으면 자동으로 다시 흐른다
const needsAutoResume = (s, now) => Boolean(s.paused_at) && now - s.paused_at >= MAX_PAUSE_MS - pausedTotal(s);

const expired = (s, now) => !s.paused_at && baseEnd(s) <= now;

function publicSession(s, now = Date.now()) {
  if (!s) return null;
  const paused = Boolean(s.paused_at);
  return {
    id: s.id,
    startedAt: s.started_at,
    durationSec: s.duration_sec,
    endsAt: paused ? null : baseEnd(s),
    pausedAt: paused ? s.paused_at : null,
    remainingMs: paused ? Math.max(0, baseEnd(s) - s.paused_at) : null,
    pauseLeftMs: pauseLeftMs(s, now),
  };
}

module.exports = { MAX_PAUSE_MS, baseEnd, pauseLeftMs, needsAutoResume, expired, publicSession };
