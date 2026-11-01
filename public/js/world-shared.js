// 마음 쉼터(3D 교실)가 함께 쓰는 값과 도구: 교실 크기, 반마다 다른 분위기, 엄마·아빠 모습, 계산 도우미
// world.js(화면·조작) · schoolroom.js(교실 장면) · character.js(캐릭터) 가 가져다 쓴다.

// 교실 안쪽 크기(반쪽). 칠판은 앞(-z) 벽, 창문은 왼쪽(-x) 벽. 실제 초등학교 교실보다 조금 넓게 잡아 걸어 다니기 편하게 했다.
export const ROOM = { x: 7, z: 6.2, h: 3.2 };
export const PLAYER_R = 0.32;

// 마음 쉼터 넓히기: 교실 오른쪽 문 밖으로 이어 붙는 공간들 (server/world.js 의 id 와 이어진다)
//  x0~x1, z0~z1: 안쪽 바닥 크기 / y: 바닥 높이 / h: 천장 높이(바닥 기준)
//  복도 hall1·hall2 는 한 줄로 이어지고, 화장실 wc 는 hall2 오른쪽 문 안, 계단 stairs 는 hall2 끝에서 2층 floor2 로 올라간다.
export const ZONES = {
  room: { x0: -ROOM.x, x1: ROOM.x, z0: -ROOM.z, z1: ROOM.z, y: 0, h: ROOM.h },
  hall1: { x0: 7.3, x1: 11, z0: -6.2, z1: 6.2, y: 0, h: 3.2 },
  hall2: { x0: 7.3, x1: 11, z0: 6.2, z1: 15, y: 0, h: 3.2 },
  wc: { x0: 11.3, x1: 17, z0: 8.2, z1: 14.2, y: 0, h: 3.2 },
  stairs: { x0: 7.3, x1: 11, z0: 15, z1: 21.5, y: 0, h: 6.6 },
  floor2: { x0: 7.3, x1: 11, z0: 21.5, z1: 31, y: 3.4, h: 3.2 },
};
export const ZONES_OF = { hall1: ['hall1'], hall2: ['hall2'], wc: ['wc'], stairs: ['stairs', 'floor2'] }; // 산 공간 → 만들어지는 곳
export const STAIRS = { steps: 17, rise: 3.4 };

// 지금 서 있는 곳의 바닥 높이: 계단은 한 칸씩 올라가고, 계단 위는 2층이다
export function floorY(x, z) {
  const S = ZONES.stairs;
  if (x < S.x0 || x > S.x1 || z < S.z0) return 0;
  if (z >= S.z1) return STAIRS.rise;
  const run = (S.z1 - S.z0) / STAIRS.steps;
  const i = Math.min(STAIRS.steps - 1, Math.floor((z - S.z0) / run));
  return ((i + 1) * STAIRS.rise) / STAIRS.steps;
}

// (x, z) 가 속한 공간(열린 공간만). 벽 두께나 문턱 위처럼 어디에도 속하지 않으면 가장 가까운 공간을 돌려준다.
export function zoneAt(x, z, unlocked = []) {
  const names = ['room', ...unlocked.flatMap((id) => ZONES_OF[id] || [])];
  let best = 'room';
  let bd = Infinity;
  for (const k of names) {
    const r = ZONES[k];
    const d = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
export const START = { x: -3.0, z: -0.2 }; // 쉼터에 들어서는 자리: 창가 쪽 열린 공간에서 칠판을 바라본다
export const WALK = 3.0;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
export const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// {이름} 은 그 아이의 이름 (세 글자 한국 이름이면 성을 뺀 이름)
export const givenName = (full) => (/^[가-힣]{3}$/.test(full) ? full.slice(1) : full);

// 나: 노란 상의 + 검정 하의
export const PLAYER_LOOK = { skin: '#ffdcc0', hair: '#2a2018', hairStyle: 'short', top: '#ffd23f', bottom: '#1a1b25', bottomStyle: 'pants', glasses: false };

// 엄마·아빠: 부모님이 아이의 교실에 같이 들어올 때의 모습 (아이의 노란 상의·검정 하의와 겹치지 않게)
export const PARENTS = {
  mom: {
    tag: '👩 엄마', tagBg: '#ffe3ee', word: '엄마',
    look: { skin: '#ffd9bf', hair: '#3a2a22', hairStyle: 'long', top: '#f78fb3', bottom: '#4a4e69', bottomStyle: 'skirt', glasses: false },
    hello: (n) => `${n}, 숙제 끝내느라 정말 수고했어 💛`,
  },
  dad: {
    tag: '👨 아빠', tagBg: '#dff0ff', word: '아빠',
    look: { skin: '#f6cfae', hair: '#241b16', hairStyle: 'short', top: '#4d7cc4', bottom: '#2b2d42', bottomStyle: 'pants', glasses: true },
    hello: (n) => `${n}, 오늘도 멋지다! 최고야 👍`,
  },
};
export const PARENT_SCALE = 1.08;
export const TEACHER_SCALE = 1.04;
// 학년이 낮을수록 아이와 친구들이 조금 더 작다
export const KID_SCALE = (grade) => (grade === 1 ? 0.8 : grade >= 5 ? 0.93 : 0.9);
export const FRIEND_SCALE = (grade) => (grade === 1 ? 0.77 : grade >= 5 ? 0.92 : 0.87);

// 아이마다 교실 분위기가 다르다 (server/rooms.js 의 theme): 국화 반은 노랑·하양, 난초 반은 보라·분홍
//  wall 벽 / band 아랫벽 / accent 게시판·장식 포인트색 / stars 천장에 매단 종이별
export const THEMES = {
  default: {
    wall: 0xd3e6dc, band: 0xbcd6c8, accent: 0x6cbf8e, stars: [0xffd9a0, 0xffc2d1, 0xcdeac0, 0xbde0fe],
    rug: ['#ffd6a5', '#ffadad', '#fdffb6', '#caffbf', '#9bf6ff'], petals: null, plaque: '#fff3c4', plaqueInk: '#2b2d42', flower: '🌼',
  },
  chrysanthemum: {
    wall: 0xf3eec9, band: 0xe8d98f, accent: 0xf2b705, stars: [0xffe08a, 0xfff3b0, 0xffd166, 0xfff9d6],
    rug: ['#fff3b0', '#ffe08a', '#ffd23f', '#fff9d6', '#ffc83d'], petals: ['#ffd23f', '#ffe58a', '#fff7cf', '#ffb703'], heart: '#f08a00',
    plaque: '#fff0a8', plaqueInk: '#6b4a00', flower: '🌼',
  },
  orchid: {
    wall: 0xebe1f6, band: 0xd7c4ee, accent: 0xa774d8, stars: [0xe0c3ff, 0xffc2e8, 0xd7ccff, 0xf7d9ff],
    rug: ['#ead7ff', '#d3b4f7', '#f6d1f0', '#f3e8ff', '#c9a0ec'], petals: ['#c77dff', '#e0aaff', '#f3d9ff', '#9d4edd'], heart: '#ffd166',
    plaque: '#ecd8ff', plaqueInk: '#4a2670', flower: '🌸',
  },
};

// 충돌: 방 안쪽으로 가두고, 가구와 겹치면 밀어낸다. 나는 걸어 다니는 친구도 피하고, 친구(NPC)는 가구만 피한다.
//  colliders: 네모 { x, z, hw, hd } 또는 동그라미 { x, z, r } (ref 가 있으면 움직이는 사람의 그룹)
export function resolve(p, colliders, r = PLAYER_R, npcMode = false) {
  if (npcMode) { // 친구와 선생님은 교실 안에만 있는다
    p.x = clamp(p.x, -ROOM.x + 0.6, ROOM.x - 0.6);
    p.z = clamp(p.z, -ROOM.z + 0.7, ROOM.z - 0.55);
  } else { // 나는 벽(충돌 상자)이 막아 준다. 이 범위는 만약을 위한 바깥 울타리
    p.x = clamp(p.x, -ROOM.x - 0.2, 18);
    p.z = clamp(p.z, -ROOM.z - 0.2, 32);
  }
  for (const c of colliders) {
    if (c.r !== undefined) {
      if (c.ref && npcMode) continue; // 친구끼리는 따로 서로 비켜 준다
      const cx = c.ref ? c.ref.position.x : c.x;
      const cz = c.ref ? c.ref.position.z : c.z;
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 1e-4) { p.x = cx + (dx / d) * min; p.z = cz + (dz / d) * min; }
    } else {
      const hx = c.hw + r;
      const hz = c.hd + r;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        if (hx - Math.abs(dx) < hz - Math.abs(dz)) p.x = c.x + Math.sign(dx || 1) * hx;
        else p.z = c.z + Math.sign(dz || 1) * hz;
      }
    }
  }
}

// 길 찾기: 교실을 작은 칸으로 나누고, 가구에 막힌 칸을 피해 가장 가까운 길을 찾는다 (A*). 친구와 선생님이 쓴다.
export function makeNav(colliders, inflate = 0.34, cell = 0.25) {
  const x0 = -ROOM.x + 0.6;
  const z0 = -ROOM.z + 0.7;
  const W = Math.ceil((ROOM.x * 2 - 1.2) / cell);
  const H = Math.ceil((ROOM.z * 2 - 1.25) / cell);
  const blocked = new Uint8Array(W * H);
  const statics = colliders.filter((c) => !c.ref);
  const wx = (i) => x0 + (i + 0.5) * cell;
  const wz = (j) => z0 + (j + 0.5) * cell;
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const x = wx(i);
      const z = wz(j);
      for (const c of statics) {
        const hit = c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + inflate : Math.abs(x - c.x) < c.hw + inflate && Math.abs(z - c.z) < c.hd + inflate;
        if (hit) { blocked[j * W + i] = 1; break; }
      }
    }
  }
  const ci = (x) => clamp(Math.floor((x - x0) / cell), 0, W - 1);
  const cj = (z) => clamp(Math.floor((z - z0) / cell), 0, H - 1);
  const isFree = (x, z) => !blocked[cj(z) * W + ci(x)];
  // 막힌 칸이면 가장 가까운 빈 칸으로 옮긴다
  function snap(x, z) {
    if (isFree(x, z)) return { x, z };
    const i0 = ci(x);
    const j0 = cj(z);
    for (let r = 1; r < 16; r += 1) {
      let best = null;
      let bd = 1e9;
      for (let dj = -r; dj <= r; dj += 1) {
        for (let di = -r; di <= r; di += 1) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; // eslint-disable-line no-continue
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= W || j >= H || blocked[j * W + i]) continue; // eslint-disable-line no-continue
          const d = Math.hypot(wx(i) - x, wz(j) - z);
          if (d < bd) { bd = d; best = { x: wx(i), z: wz(j) }; }
        }
      }
      if (best) return best;
    }
    return { x, z };
  }
  function see(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (cell * 0.5));
    for (let k = 1; k < n; k += 1) {
      const t = k / n;
      if (!isFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }
  function path(from, to) {
    const a = snap(from.x, from.z);
    const b = snap(to.x, to.z);
    if (see(a, b)) return [{ x: b.x, z: b.z }];
    const N = W * H;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    const start = cj(a.z) * W + ci(a.x);
    const goal = cj(b.z) * W + ci(b.x);
    const hf = (n) => Math.hypot((n % W) - (goal % W), Math.floor(n / W) - Math.floor(goal / W));
    const open = [start];
    g[start] = 0;
    let found = false;
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k += 1) if (g[open[k]] + hf(open[k]) < g[open[bi]] + hf(open[bi])) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (done[cur]) continue; // eslint-disable-line no-continue
      done[cur] = 1;
      if (cur === goal) { found = true; break; }
      const ci0 = cur % W;
      const cj0 = Math.floor(cur / W);
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          if (!di && !dj) continue; // eslint-disable-line no-continue
          const i = ci0 + di;
          const j = cj0 + dj;
          if (i < 0 || j < 0 || i >= W || j >= H) continue; // eslint-disable-line no-continue
          const n = j * W + i;
          if (blocked[n] || done[n]) continue; // eslint-disable-line no-continue
          if (di && dj && (blocked[cj0 * W + i] || blocked[j * W + ci0])) continue; // eslint-disable-line no-continue
          const ng = g[cur] + (di && dj ? 1.414 : 1);
          if (ng < g[n]) { g[n] = ng; came[n] = cur; open.push(n); }
        }
      }
    }
    if (!found) return [{ x: b.x, z: b.z }];
    const cells = [];
    for (let n = goal; n !== -1; n = came[n]) cells.push({ x: wx(n % W), z: wz(Math.floor(n / W)) });
    cells.reverse();
    // 꺾이는 곳만 남기고 곧게 펴기
    const out = [];
    let at = { x: a.x, z: a.z };
    let k = 0;
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = cells.length - 1; m > k; m -= 1) if (see(at, cells[m])) { far = m; break; }
      at = cells[far];
      out.push({ x: at.x, z: at.z });
      k = far;
    }
    out[out.length - 1] = { x: b.x, z: b.z };
    return out;
  }
  return { path, snap, free: isFree };
}
