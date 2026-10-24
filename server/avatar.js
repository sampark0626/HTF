'use strict';
// 캐릭터는 파츠 번호 3개로 저장한다: { animal, color, acc }
// 파츠 개수는 public/js/avatar.js 의 목록 길이와 같아야 한다.
const LIMITS = { animal: 12, color: 8, acc: 10 };

function sanitizeAvatar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const n = Number(raw[key]);
    if (!Number.isInteger(n) || n < 0 || n >= max) return null;
    out[key] = n;
  }
  return out;
}

function defaultAvatar(index) {
  return { animal: index % LIMITS.animal, color: index % LIMITS.color, acc: 0 };
}

function parseAvatar(text, index) {
  try {
    return sanitizeAvatar(JSON.parse(text)) || defaultAvatar(index);
  } catch (_) {
    return defaultAvatar(index);
  }
}

module.exports = { sanitizeAvatar, defaultAvatar, parseAvatar };
