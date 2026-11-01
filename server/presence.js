'use strict';
// 교실에 지금 누가 있는지: 아이와 부모님이 같은 교실에서 서로를 볼 수 있게 위치만 잠깐 기억한다.
// 서버 메모리에만 두고(저장하지 않는다), 몇 초 동안 소식이 없으면 사라진다. 서버가 하나일 때 쓰는 가벼운 방식이다.
const TTL_MS = 6000; // 이만큼 소식이 없으면 교실을 나간 것으로 본다
const SAY_MS = 6000; // 부모님이 한 말은 이만큼 보인다
const MAX_PER_ROOM = 6;
const KINDS = ['kid', 'mom', 'dad'];
// 교실과 복도·화장실·2층까지 (public/js/world-shared.js 의 ZONES 를 다 덮는다)
const BOUNDS = { x0: -9, x1: 20, z0: -8, z1: 34 };

const rooms = new Map(); // 교실(아이 이름) → Map(참가자 id → 정보)

const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0;
};

function sweep(room, now) {
  const m = rooms.get(room);
  if (!m) return null;
  for (const [id, p] of m) if (now - p.seen > TTL_MS) m.delete(id);
  if (!m.size) { rooms.delete(room); return null; }
  return m;
}

// 내 위치를 알리고, 같은 교실의 다른 사람들을 돌려 받는다
function sync(room, id, kind, body, now = Date.now()) {
  if (!KINDS.includes(kind)) return [];
  let m = sweep(room, now);
  if (!m) { m = new Map(); rooms.set(room, m); }
  const prev = m.get(id);
  if (!prev && m.size >= MAX_PER_ROOM) return list(room, id, now);
  const say = typeof body.say === 'string' ? body.say.trim().slice(0, 40) : '';
  const me = {
    id,
    kind,
    x: num(body.x, BOUNDS.x0, BOUNDS.x1),
    z: num(body.z, BOUNDS.z0, BOUNDS.z1),
    ry: num(body.ry, -10, 10),
    mv: num(body.mv, 0, 1),
    say: prev ? prev.say : '',
    sayAt: prev ? prev.sayAt : 0,
    seen: now,
  };
  if (say) { me.say = say; me.sayAt = now; }
  m.set(id, me);
  return list(room, id, now);
}

// id 말고 이 교실에 있는 다른 사람들
function list(room, exceptId, now = Date.now()) {
  const m = sweep(room, now);
  if (!m) return [];
  return [...m.values()]
    .filter((p) => p.id !== exceptId)
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      x: p.x,
      z: p.z,
      ry: p.ry,
      mv: p.mv,
      say: now - p.sayAt < SAY_MS ? p.say : '',
      sayAt: p.sayAt,
    }));
}

function leave(room, id) {
  const m = rooms.get(room);
  if (!m) return;
  m.delete(id);
  if (!m.size) rooms.delete(room);
}

module.exports = { sync, list, leave, KINDS, TTL_MS };
