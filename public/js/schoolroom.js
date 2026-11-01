// 마음 쉼터의 교실 장면: 매원초등학교 교실처럼 꾸민다
//  - 앞쪽 하얀 칠판·TV·알림판·시계, 왼쪽 창문(블라인드)과 나무 수납장, 뒤쪽 사물함과 책장
//  - 책상마다 투명 칸막이, 초록색 의자, 책가방, 하얀 타일 바닥과 형광등 천장
//  - 선생님과 친구들은 스스로 걸어 다니고(길 찾기), 토끼와 마음 미션 자리는 그대로 있다
import {
  ROOM, START, THEMES, PLAYER_LOOK, PARENTS, PARENT_SCALE, TEACHER_SCALE, KID_SCALE, FRIEND_SCALE,
  clamp, damp, angleDelta, rand, pick, givenName, resolve, makeNav, floorY,
} from './world-shared.js';
import { toolbox, characterKit, bake, disposeCharacter } from './character.js';
import { buildHalls } from './schoolhall.js';

// 둥근 네모 길
const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};
const FONT = (px) => `700 ${px}px Jua, "Malgun Gothic", sans-serif`;

// ────────────────────────────────────────────────────────────────
// 장면: 교실, 가구, 친구와 선생님, 토끼, 빛과 먼지
//  world: { catalog, unlocked, stars } 마음 쉼터 넓히기에서 열린 공간 (없으면 교실만)
export function buildScene(T, { user, emoji, npcs, room, self, world = null }) {
  const wInfo = world || { catalog: [], unlocked: [], stars: 0 };
  const scene = new T.Scene();
  scene.background = new T.Color(0xd6ecff);
  scene.fog = new T.Fog(0xd6ecff, 30, 130);
  const camera = new T.PerspectiveCamera(52, 1.6, 0.1, 220);
  const colliders = [];
  const tb = toolbox(T);
  const { M, canvasTex, track } = tb;
  const kit = characterKit(T, tb);
  const theme = THEMES[room?.theme] || THEMES.default;
  const grade = room?.grade || 0;
  const school = room?.school || '';
  const place = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };
  const box = (w, h, d, color, x, y, z, parent = scene, opts) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), M(color, opts));
    parent.add(place(m, x, y, z));
    return m;
  };
  const solid = (x, z, hw, hd) => colliders.push({ x, z, hw, hd });
  const vmat = M('#ffffff', { vertexColors: true });
  const BG = new Map();
  const bg = (w, h, d) => { const k = `${w}|${h}|${d}`; if (!BG.has(k)) BG.set(k, new T.BoxGeometry(w, h, d)); return BG.get(k); };
  const cyl = (rt, rb, h, seg = 10) => new T.CylinderGeometry(rt, rb, h, seg);
  // 그림 한 장을 벽·가구 앞면에 붙인다 (lit: 빛을 받는 재질 / 아니면 밝은 그대로)
  const panel = (tex, w, h, x, y, z, ry = 0, lit = false, opts = {}) => {
    const mat = track(lit ? new T.MeshLambertMaterial({ map: tex, ...opts }) : new T.MeshBasicMaterial({ map: tex, ...opts }));
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  };
  const bakedMesh = (items, parent, x, y, z, ry = 0) => {
    const m = new T.Mesh(bake(T, items), vmat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    return m;
  };

  const softDot = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });

  // 우리 반 꽃(국화/난초)을 그린다: 문패, 화분, 러그, 창가 화단에 쓴다
  function drawFlower(g, cx, cy, s) {
    const pc = theme.petals;
    if (!pc) return;
    g.save();
    g.translate(cx, cy);
    const petal = (ang, rx, ry, dist, color) => {
      g.save();
      g.rotate(ang);
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(0, -dist, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(43,45,66,.35)';
      g.lineWidth = Math.max(1, s * 0.03);
      g.stroke();
      g.restore();
    };
    if (room.theme === 'orchid') {
      // 호접란: 위의 큰 꽃잎 둘, 아래의 가는 꽃잎 둘, 가운데 입술과 꽃술
      petal(-1.25, s * 0.48, s * 0.4, s * 0.38, pc[1]);
      petal(1.25, s * 0.48, s * 0.4, s * 0.38, pc[1]);
      petal(0, s * 0.28, s * 0.4, s * 0.52, pc[0]);
      petal(2.55, s * 0.24, s * 0.46, s * 0.42, pc[0]);
      petal(-2.55, s * 0.24, s * 0.46, s * 0.42, pc[0]);
      g.fillStyle = pc[3];
      g.beginPath(); g.ellipse(0, s * 0.18, s * 0.17, s * 0.24, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd166';
      g.beginPath(); g.arc(0, -s * 0.05, s * 0.1, 0, Math.PI * 2); g.fill();
    } else {
      // 국화: 가는 꽃잎이 겹겹이
      [[26, 0.82, 0.13, 0.5, pc[3]], [20, 0.66, 0.12, 0.4, pc[0]], [14, 0.46, 0.11, 0.28, pc[1]], [9, 0.28, 0.1, 0.16, pc[2]]].forEach(([n, len, wd, dist, color], li) => {
        for (let i = 0; i < n; i += 1) petal((i / n) * Math.PI * 2 + li * 0.2, s * wd, s * len * 0.5, s * dist, color);
      });
      g.fillStyle = theme.heart;
      g.beginPath(); g.arc(0, 0, s * 0.1, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  const flowerMap = theme.petals ? canvasTex(128, 128, (g) => drawFlower(g, 64, 64, 58)) : null;
  const flowerSprite = (size) => {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: flowerMap, transparent: true, depthWrite: false }));
    sp.scale.set(size, size, 1);
    return sp;
  };
  const flowerDecal = (x, y, z, ry, size, rot = 0) => {
    const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: flowerMap, transparent: true, depthWrite: false }));
    m.position.set(x, y, z);
    m.rotation.set(0, ry, rot);
    scene.add(m);
    return m;
  };

  // ── 빛: 하얀 형광등 + 창으로 들어오는 햇빛 ──
  scene.add(new T.HemisphereLight(0xffffff, 0xd9cdb8, 2.3));
  const sun = new T.DirectionalLight(0xfff4dc, 1.7);
  sun.position.set(-12, 9, 3);
  scene.add(sun);
  const fill = new T.DirectionalLight(0xfff8ee, 0.8); // 반대쪽 벽과 복도 벽도 환하게
  fill.position.set(12, 7, -3);
  scene.add(fill);
  for (const [x, z] of [[-3.5, -2.5], [2.2, -3], [3.6, 2.4], [-3, 3.6], [1, 0.3]]) {
    const l = new T.PointLight(0xfff3e0, 8, 12, 2);
    l.position.set(x, 3.0, z);
    scene.add(l);
  }

  // ── 바닥(연한 타일)·천장(흰 천장판과 형광등) ──
  const floorTex = canvasTex(256, 256, (g, w, h) => {
    const tones = ['#ece8df', '#e6e2d8', '#eae6dc', '#e8e4da'];
    for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) { g.fillStyle = tones[i * 2 + j]; g.fillRect(i * 128, j * 128, 128, 128); }
    for (let k = 0; k < 1100; k += 1) {
      g.fillStyle = k % 2 ? 'rgba(150,140,125,.13)' : 'rgba(255,255,255,.4)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = 'rgba(165,155,140,.55)';
    g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(0, 127, w, 2); g.fillRect(127, 0, 2, h);
  }, [(ROOM.x * 2) / 1.2, (ROOM.z * 2) / 1.2]);
  const floor = new T.Mesh(new T.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), track(new T.MeshLambertMaterial({ map: floorTex })));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceilTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#f7f7f3'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 260; k += 1) { g.fillStyle = 'rgba(190,190,180,.18)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#d9d9d0'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  }, [(ROOM.x * 2) / 0.6, (ROOM.z * 2) / 0.6]);
  // 천장은 스스로 밝은 재질: 천장 가까이 있는 불빛이 한가운데만 번쩍이게 비추지 않도록
  const ceil = new T.Mesh(new T.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), track(new T.MeshBasicMaterial({ map: ceilTex, color: 0xf2f1ec })));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.h;
  scene.add(ceil);
  for (const x of [-4.2, 0.4, 4.6]) {
    for (const z of [-3.6, 0.9, 4.2]) {
      box(1.25, 0.05, 0.62, '#ffffff', x, ROOM.h - 0.03, z, scene, { emissive: 0xfffbf0, emissiveIntensity: 0.95 });
      box(1.33, 0.03, 0.7, '#cfd2d6', x, ROOM.h - 0.015, z);
    }
  }

  // ── 벽 (왼쪽은 창문), 아랫벽, 걸레받이 ──
  const WALL = theme.wall;
  const BAND = theme.band;
  const WZ = ROOM.z * 2;
  // 오른쪽 벽: 복도로 나가는 문 자리(DZ ± 0.6)를 비워 둔다
  const DZ = 4.7;
  for (const [a, b] of [[-ROOM.z, DZ - 0.6], [DZ + 0.6, ROOM.z]]) {
    box(0.3, ROOM.h, b - a, WALL, ROOM.x + 0.15, ROOM.h / 2, (a + b) / 2);
    solid(ROOM.x + 0.15, (a + b) / 2, 0.15, (b - a) / 2);
  }
  box(0.3, ROOM.h - 2.2, 1.2, WALL, ROOM.x + 0.15, (ROOM.h + 2.2) / 2, DZ);
  // 나머지 벽도 충돌 상자: 걸어 나가지 못한다
  solid(-ROOM.x - 0.15, 0, 0.15, ROOM.z);
  solid(0, -ROOM.z - 0.15, ROOM.x, 0.15);
  solid(0, ROOM.z + 0.15, ROOM.x, 0.15);
  box(ROOM.x * 2, ROOM.h, 0.3, WALL, 0, ROOM.h / 2, -ROOM.z - 0.15);
  box(ROOM.x * 2, ROOM.h, 0.3, WALL, 0, ROOM.h / 2, ROOM.z + 0.15);
  box(0.3, 0.95, WZ, WALL, -ROOM.x - 0.15, 0.475, 0);
  box(0.3, ROOM.h - 2.55, WZ, WALL, -ROOM.x - 0.15, (ROOM.h + 2.55) / 2, 0);
  for (const [z0, z1] of [[-ROOM.z, -5.4], [-2.4, -1.5], [1.5, 2.4], [5.4, ROOM.z]]) {
    box(0.3, 1.6, z1 - z0, WALL, -ROOM.x - 0.15, 1.75, (z0 + z1) / 2);
  }
  for (const [a, b] of [[-ROOM.z, DZ - 0.6], [DZ + 0.6, ROOM.z]]) {
    box(0.05, 0.95, b - a, BAND, ROOM.x - 0.02, 0.475, (a + b) / 2);
    box(0.06, 0.12, b - a, '#b7b2a6', ROOM.x - 0.03, 0.06, (a + b) / 2);
  }
  box(ROOM.x * 2, 0.95, 0.05, BAND, 0, 0.475, -ROOM.z + 0.02);
  box(ROOM.x * 2, 0.95, 0.05, BAND, 0, 0.475, ROOM.z - 0.02);
  box(ROOM.x * 2, 0.12, 0.06, '#b7b2a6', 0, 0.06, -ROOM.z + 0.03);
  box(ROOM.x * 2, 0.12, 0.06, '#b7b2a6', 0, 0.06, ROOM.z - 0.03);

  // 창문틀(하얀 알루미늄), 블라인드, 창 아래 나무 수납장
  const WIN = [-3.9, 0, 3.9];
  const frameItems = [];
  const FR = '#f3f4f5';
  for (const zc of WIN) {
    frameItems.push(
      { g: bg(0.1, 0.07, 3.04), p: [0, 2.53, zc], c: FR },
      { g: bg(0.14, 0.05, 3.1), p: [0.02, 0.97, zc], c: FR },
      { g: bg(0.1, 0.04, 3.0), p: [0, 1.75, zc], c: FR },
      { g: bg(0.1, 1.6, 0.07), p: [0, 1.75, zc - 1.5], c: FR },
      { g: bg(0.1, 1.6, 0.07), p: [0, 1.75, zc + 1.5], c: FR },
      { g: bg(0.08, 1.6, 0.05), p: [0, 1.75, zc - 0.5], c: FR },
      { g: bg(0.08, 1.6, 0.05), p: [0, 1.75, zc + 0.5], c: FR },
      { g: bg(0.05, 0.05, 0.1), p: [0.06, 1.7, zc - 0.42], c: '#9aa3ad' },
      { g: bg(0.05, 0.05, 0.1), p: [0.06, 1.7, zc + 0.42], c: '#9aa3ad' }
    );
  }
  bakedMesh(frameItems, scene, -ROOM.x + 0.05, 0, 0);
  const blindTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#cdd2d8'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { g.fillStyle = '#b7bec6'; g.fillRect(0, y + 5, w, 3); g.fillStyle = '#dde1e6'; g.fillRect(0, y, w, 2); }
    g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(w / 2 - 1, 0, 2, h);
  });
  for (const zc of WIN) {
    panel(blindTex, 2.86, 0.78, -ROOM.x + 0.1, 2.15, zc, Math.PI / 2, true);
    box(0.07, 0.07, 2.96, '#aab2bb', -ROOM.x + 0.1, 2.55, zc);
  }
  // 창 아래 수납장 (위에 우리 반 꽃 화분)
  const cabTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#d8b88a'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k += 1) { g.fillStyle = 'rgba(150,105,60,.12)'; g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 50, 2); }
    g.strokeStyle = '#a9824f'; g.lineWidth = 3;
    for (let i = 0; i < 2; i += 1) { g.strokeRect(6 + i * 128, 8, 116, h - 16); g.fillStyle = '#7a6a5a'; g.fillRect(i * 128 + (i ? 14 : 100), h / 2 - 12, 6, 24); }
  }, [(ROOM.z * 2 - 0.4) / 1.0, 1]);
  const sillLen = ROOM.z * 2 - 0.4;
  box(0.45, 0.9, sillLen, '#cfae7e', -ROOM.x + 0.25, 0.45, 0);
  box(0.5, 0.04, sillLen + 0.05, '#e9d3ab', -ROOM.x + 0.26, 0.92, 0);
  panel(cabTex, sillLen, 0.84, -ROOM.x + 0.485, 0.45, 0, Math.PI / 2, true);
  colliders.push({ x: -ROOM.x + 0.26, z: 0, hw: 0.26, hd: ROOM.z - 0.3 });

  // ── 창밖: 하늘, 운동장, 나무, 멀리 아파트, 구름 ──
  const skyTex = canvasTex(8, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#8fc7ff');
    gr.addColorStop(0.55, '#d7ecff');
    gr.addColorStop(1, '#ffe9cf');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  scene.add(new T.Mesh(new T.SphereGeometry(150, 24, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false })));
  const ground = new T.Mesh(new T.PlaneGeometry(260, 200), M(0xa9d98f));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-135, -0.05, 0);
  scene.add(ground);
  const yardTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#dfc59b'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 400; k += 1) { g.fillStyle = 'rgba(170,130,85,.22)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5; g.strokeRect(14, 14, w - 28, h - 28);
    g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w / 2, h - 14); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 36, 0, Math.PI * 2); g.stroke();
  });
  const yard = new T.Mesh(new T.PlaneGeometry(34, 26), track(new T.MeshLambertMaterial({ map: yardTex })));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(-30, -0.03, -3);
  scene.add(yard);
  const hillMat = [M(0x9ed48a), M(0x86c57a), M(0xb4dc9a)];
  [[-70, -40, 26], [-85, 10, 34], [-75, 55, 28], [-110, -10, 40]].forEach(([x, z, r], i) => {
    const h = new T.Mesh(new T.SphereGeometry(r, 18, 12), hillMat[i % 3]);
    h.scale.y = 0.38;
    scene.add(place(h, x, -2, z));
  });
  // 멀리 보이는 아파트 단지
  const aptTex = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#f1ede6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9fb8cf';
    for (let y = 6; y < h - 6; y += 14) for (let x = 6; x < w - 6; x += 14) g.fillRect(x, y, 8, 8);
  });
  [[-96, -52, 18, 34], [-100, -30, 16, 44], [-94, -6, 18, 38], [-102, 18, 16, 48], [-96, 42, 18, 36], [-104, 64, 16, 42]].forEach(([x, z, w, h], i) => {
    const m = new T.Mesh(new T.BoxGeometry(12, h, w), track(new T.MeshLambertMaterial({ map: aptTex, color: i % 2 ? 0xffffff : 0xf4f0ea })));
    scene.add(place(m, x, h / 2 - 1, z));
  });
  for (let i = 0; i < 16; i += 1) {
    const tr = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(0.18, 0.24, 1.6, 6), M(0x9a6b45));
    trunk.position.y = 0.8;
    const crown = new T.Mesh(new T.SphereGeometry(1.4 + Math.random() * 0.7, 10, 8), M([0x6dbb7a, 0x5aab6a, 0x82c987][i % 3]));
    crown.position.y = 2.7;
    tr.add(trunk, crown);
    scene.add(place(tr, -14 - Math.random() * 12, 0, -24 + Math.random() * 48));
  }
  const clouds = [];
  const cloudTex = canvasTex(256, 128, (g) => {
    g.fillStyle = 'rgba(255,255,255,.95)';
    [[70, 70, 44], [120, 52, 54], [170, 72, 42], [110, 84, 40]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
  });
  for (let i = 0; i < 6; i += 1) {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.92, fog: false, depthWrite: false }));
    sp.scale.set(26 + Math.random() * 14, 13 + Math.random() * 7, 1);
    sp.position.set(-70 - Math.random() * 30, 22 + Math.random() * 14, -60 + i * 22);
    scene.add(sp);
    clouds.push({ sp, v: 0.4 + Math.random() * 0.5 });
  }
  const sunDisc = new T.Sprite(new T.SpriteMaterial({ map: softDot, color: 0xfff0b8, transparent: true, fog: false, depthWrite: false, blending: T.AdditiveBlending }));
  sunDisc.scale.set(34, 34, 1);
  sunDisc.position.set(-90, 38, -15);
  scene.add(sunDisc);

  // 창으로 들어오는 빛줄기
  const beamTex = canvasTex(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,244,214,.5)');
    gr.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,0)');
    side.addColorStop(0.5, 'rgba(0,0,0,1)');
    side.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = side;
    g.fillRect(0, 0, w, h);
  });
  const beams = [];
  for (const zc of WIN) {
    const b = new T.Mesh(
      new T.PlaneGeometry(2.6, 6.5),
      new T.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false })
    );
    b.rotation.set(0, Math.PI / 2, 0.95);
    b.position.set(-ROOM.x + 1.6, 1.5, zc);
    scene.add(b);
    beams.push(b);
  }

  // ── 앞쪽 벽: 하얀 칠판, TV, 알림판, 시계, 반 이름 ──
  const FZ = -ROOM.z; // 앞벽의 안쪽 면
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024;
  boardCanvas.height = 280;
  const bctx = boardCanvas.getContext('2d');
  const boardTex = new T.CanvasTexture(boardCanvas);
  boardTex.colorSpace = T.SRGBColorSpace;
  boardTex.anisotropy = 4;
  function drawBoard(word) {
    const w = boardCanvas.width;
    const h = boardCanvas.height;
    const gr = bctx.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#fdfdfb');
    gr.addColorStop(1, '#eef0ee');
    bctx.fillStyle = gr;
    bctx.fillRect(0, 0, w, h);
    // 지우다 만 마커 자국
    bctx.fillStyle = 'rgba(120,130,140,.07)';
    for (let i = 0; i < 9; i += 1) bctx.fillRect(Math.random() * w, Math.random() * h, 160, 10);
    bctx.textAlign = 'center';
    bctx.fillStyle = '#2f5fd0';
    bctx.font = FONT(60);
    bctx.fillText('오늘도 수고했어요 ⭐', w / 2, 92);
    bctx.font = FONT(68);
    bctx.fillStyle = word ? '#e0483f' : 'rgba(90,100,110,.6)';
    bctx.fillText(word ? `“${word}”` : '고마운 마음을 여기에 써 봐요', w / 2, 200);
    bctx.font = '44px sans-serif';
    bctx.fillText('🌼', 70, 240);
    bctx.fillText('☁️', w - 80, 80);
    bctx.fillText('✏️', w - 70, 240);
    boardTex.needsUpdate = true;
  }
  drawBoard('');
  box(4.5, 1.38, 0.06, '#d4d8dc', 0.1, 1.68, FZ + 0.03);
  const boardMesh = new T.Mesh(new T.PlaneGeometry(4.3, 1.17), new T.MeshBasicMaterial({ map: boardTex }));
  boardMesh.position.set(0.1, 1.68, FZ + 0.065);
  scene.add(boardMesh);
  box(4.3, 0.05, 0.1, '#b5bbc2', 0.1, 0.96, FZ + 0.1);
  bakedMesh([
    { g: bg(0.11, 0.022, 0.022), p: [-1.4, 1.0, 0.0], c: '#2f5fd0' },
    { g: bg(0.11, 0.022, 0.022), p: [-1.22, 1.0, 0.0], c: '#e0483f' },
    { g: bg(0.11, 0.022, 0.022), p: [-1.04, 1.0, 0.0], c: '#222831' },
    { g: bg(0.13, 0.045, 0.06), p: [1.5, 1.0, 0.0], c: '#6d7681' },
  ], scene, 0.1, 0, FZ + 0.1);

  // 문패: 학교 이름과 반 이름이 적힌 팻말
  const label = room?.label || '';
  if (label) {
    const plaqueTex = canvasTex(1024, 150, (g, w, h) => {
      g.fillStyle = theme.plaque;
      rr(g, 4, 4, w - 8, h - 8, 34);
      g.fill();
      g.lineWidth = 6; g.strokeStyle = '#2b2d42'; g.stroke();
      g.fillStyle = theme.plaqueInk; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (school) {
        g.font = FONT(40);
        g.fillText(`🏫 ${school}`, w / 2, 40);
        g.font = FONT(68);
        g.fillText(`${theme.flower} ${label} ${theme.flower}`, w / 2, 100);
      } else {
        g.font = FONT(72);
        g.fillText(`${theme.flower} ${label} ${theme.flower}`, w / 2, h / 2 + 4);
      }
    });
    panel(plaqueTex, 4.7, 0.69, 0.1, 2.84, FZ + 0.06, 0, false, { transparent: true });
  }
  if (flowerMap) {
    [-3.0, -3.4, -3.8, 3.2, 3.6, 4.0].forEach((x, i) => flowerDecal(x, 2.86 - (i % 2) * 0.04, FZ + 0.07, 0, 0.4 + (i % 3) * 0.04, i * 0.7));
  }

  // TV (칠판 왼쪽)
  const tvTex = canvasTex(640, 360, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#9fd8ff');
    gr.addColorStop(1, '#d7f5e5');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.7)';
    [[130, 90, 46], [185, 78, 56], [240, 96, 44]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
    g.textAlign = 'center'; g.fillStyle = '#24425f';
    g.font = FONT(58); g.fillText('오늘의 마음 날씨', w / 2, 210);
    g.font = '88px sans-serif'; g.fillText('☀️', w - 120, 100);
    g.font = FONT(36); g.fillStyle = '#3d6a8a'; g.fillText('숙제 끝! 눈도 마음도 쉬어요', w / 2, 290);
  });
  box(1.44, 0.86, 0.07, '#15171c', -3.3, 1.62, FZ + 0.045);
  panel(tvTex, 1.34, 0.75, -3.3, 1.62, FZ + 0.085);
  box(0.5, 0.04, 0.05, '#2a2d34', -3.3, 1.14, FZ + 0.05);

  // 알림판들 (칠판 오른쪽): 분홍·파랑 주머니 게시판, 검은 알림판, 초록 게시판
  const chartTex = canvasTex(384, 448, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = theme.plaque; g.fillRect(0, 0, w, 56);
    g.fillStyle = '#2b2d42'; g.textAlign = 'center'; g.font = FONT(34); g.fillText('우리 반 약속 💛', w / 2, 40);
    const cols = ['#ffc9d6', '#ffe0a3', '#c9ecc6', '#bfe0ff', '#e0cdfa'];
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const x = 14 + c * 92;
        const y = 72 + r * 74;
        g.fillStyle = cols[(r + c) % 5];
        rr(g, x, y, 82, 64, 8); g.fill();
        g.fillStyle = 'rgba(255,255,255,.85)';
        rr(g, x + 8, y + 7, 66, 38, 5); g.fill();
        g.fillStyle = 'rgba(43,45,66,.5)'; g.fillRect(x + 14, y + 17, 40, 4); g.fillRect(x + 14, y + 27, 30, 4);
      }
    }
  });
  panel(chartTex, 1.3, 1.52, 3.35, 1.52, FZ + 0.045, 0, true);
  box(1.38, 1.6, 0.04, '#c79f6b', 3.35, 1.52, FZ + 0.02);
  const blackTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#2a2f36'; g.fillRect(0, 0, w, h);
    const notes = ['#ffe08a', '#ffb3c6', '#a9e5c2', '#a9d6ff', '#e0c8ff', '#ffd1a3'];
    for (let i = 0; i < 9; i += 1) {
      g.save();
      g.translate(40 + (i % 5) * 100, 56 + Math.floor(i / 5) * 100);
      g.rotate((i % 3 - 1) * 0.06);
      g.fillStyle = notes[i % 6]; g.fillRect(-34, -34, 68, 68);
      g.fillStyle = 'rgba(43,45,66,.5)'; g.fillRect(-22, -14, 44, 4); g.fillRect(-22, -2, 34, 4); g.fillRect(-22, 10, 40, 4);
      g.restore();
    }
    g.fillStyle = '#f7f3e3'; g.font = FONT(30); g.textAlign = 'right'; g.fillText('오늘의 알림 ✨', w - 20, h - 18);
  });
  panel(blackTex, 1.38, 0.58, 3.35, 2.65, FZ + 0.045);
  box(1.46, 0.66, 0.04, '#7b6a58', 3.35, 2.65, FZ + 0.02);
  const greenTex = canvasTex(320, 380, (g, w, h) => {
    g.fillStyle = '#4f9d6c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = FONT(34); g.fillText('우리 반 칭찬 별 ⭐', w / 2, 46);
    const paper = ['#ffe08a', '#ffc2d1', '#bde0fe', '#ffffff', '#d9c2f5', '#ffd6a5'];
    for (let i = 0; i < 6; i += 1) {
      g.save();
      g.translate(70 + (i % 2) * 150, 120 + Math.floor(i / 2) * 105);
      g.rotate(((i * 7) % 5 - 2) * 0.04);
      g.fillStyle = paper[i]; g.fillRect(-52, -40, 104, 80);
      g.fillStyle = 'rgba(43,45,66,.45)'; g.fillRect(-36, -20, 72, 5); g.fillRect(-36, -6, 52, 5);
      g.fillStyle = '#e0483f'; g.beginPath(); g.arc(0, -42, 6, 0, 7); g.fill();
      g.restore();
    }
  });
  panel(greenTex, 1.2, 1.4, 5.4, 1.5, FZ + 0.045, 0, true);
  box(1.28, 1.48, 0.04, '#b78f5c', 5.4, 1.5, FZ + 0.02);

  // 벽시계
  const clockTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
    g.strokeStyle = '#2b2d42'; g.lineWidth = 12; g.stroke();
    g.fillStyle = '#2b2d42'; g.font = '700 30px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let n = 1; n <= 12; n += 1) g.fillText(String(n), 128 + Math.sin((n * Math.PI) / 6) * 88, 128 - Math.cos((n * Math.PI) / 6) * 88);
    const d = new Date();
    const hand = (ang, len, wd) => { g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(ang) * len, 128 - Math.cos(ang) * len); g.stroke(); };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 58, 9);
    hand(d.getMinutes() * (Math.PI / 30), 84, 6);
  });
  const clockMesh = new T.Mesh(new T.CircleGeometry(0.3, 32), new T.MeshBasicMaterial({ map: clockTex }));
  clockMesh.position.set(5.4, 2.75, FZ + 0.06);
  scene.add(clockMesh);

  // 앞쪽 왼쪽 모서리의 높은 나무 수납장
  const tallTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d6b184'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k += 1) { g.fillStyle = 'rgba(150,105,60,.1)'; g.fillRect(Math.random() * w, Math.random() * h, 60 + Math.random() * 80, 2); }
    g.strokeStyle = '#a07a4a'; g.lineWidth = 4;
    for (let i = 0; i < 4; i += 1) {
      g.fillStyle = i % 2 ? '#dcb98e' : '#d1ab7c';
      g.fillRect(6 + i * 124, 196, 118, 306); g.strokeRect(6 + i * 124, 196, 118, 306);
      g.fillRect(6 + i * 124, 10, 118, 176); g.strokeRect(6 + i * 124, 10, 118, 176);
      g.fillStyle = '#6f6254';
      g.fillRect(i % 2 ? 18 + i * 124 : 100 + i * 124, 330, 6, 54);
      g.fillRect(i % 2 ? 18 + i * 124 : 100 + i * 124, 100, 6, 40);
    }
  });
  box(2.4, 2.4, 0.5, '#cba67a', -5.75, 1.2, FZ + 0.27);
  panel(tallTex, 2.4, 2.4, -5.75, 1.2, FZ + 0.53, 0, true);
  solid(-5.75, FZ + 0.27, 1.2, 0.27);

  // 선생님 책상과 의자 (앞쪽 왼쪽)
  const TD = { x: -4.9, z: -4.1 };
  box(1.6, 0.05, 0.78, '#e4c79b', TD.x, 0.76, TD.z);
  box(1.5, 0.7, 0.7, '#d1ae7e', TD.x, 0.35, TD.z);
  box(1.0, 0.5, 0.02, '#f3efe7', TD.x, 0.42, TD.z + 0.36);
  bakedMesh([
    { g: bg(0.42, 0.02, 0.3), p: [-0.4, 0.795, 0.0], c: '#cfd3d8' },
    { g: bg(0.42, 0.28, 0.015), p: [-0.4, 0.935, -0.14], r: [-0.25, 0, 0], c: '#2b2f38' },
    { g: bg(0.1, 0.1, 0.1), p: [0.55, 0.84, 0.1], c: '#ffffff' },
    { g: bg(0.09, 0.14, 0.09), p: [0.7, 0.87, -0.15], c: '#ff8fab' },
    { g: bg(0.24, 0.03, 0.32), p: [0.15, 0.795, 0.0], c: '#8ecae6' },
  ], scene, TD.x, 0, TD.z);
  const tchair = new T.Group();
  box(0.5, 0.06, 0.5, '#4d6a9e', 0, 0.48, 0, tchair);
  box(0.46, 0.5, 0.06, '#4d6a9e', 0, 0.78, -0.24, tchair);
  tchair.add(place(new T.Mesh(cyl(0.025, 0.025, 0.46), M('#8e99a4')), 0, 0.23, 0));
  box(0.5, 0.04, 0.5, '#8e99a4', 0, 0.02, 0, tchair);
  scene.add(place(tchair, TD.x, 0, TD.z - 0.95));
  solid(TD.x, TD.z, 0.82, 0.42);
  solid(TD.x, TD.z - 0.95, 0.3, 0.3);

  // ── 오른쪽 벽: 에어컨, 알림판, 포스터, 교실 문 ──
  const RX = ROOM.x - 0.05;
  box(0.34, 0.3, 1.2, '#f1f2f4', ROOM.x - 0.19, 2.75, -2.9);
  box(0.05, 0.05, 0.9, '#b8bec6', ROOM.x - 0.37, 2.68, -2.9);
  box(0.03, 0.05, 0.08, '#6cc08e', ROOM.x - 0.37, 2.8, -2.45);
  const corkTex = canvasTex(320, 220, (g, w, h) => {
    g.fillStyle = '#d2a56d'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 220; k += 1) { g.fillStyle = 'rgba(120,80,40,.18)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    const paper = ['#ffffff', '#ffe08a', '#bde0fe', '#ffc2d1', '#c9ecc6'];
    for (let i = 0; i < 6; i += 1) {
      g.save(); g.translate(50 + (i % 3) * 110, 62 + Math.floor(i / 3) * 96); g.rotate(((i * 5) % 5 - 2) * 0.05);
      g.fillStyle = paper[i % 5]; g.fillRect(-42, -36, 84, 72);
      g.fillStyle = 'rgba(43,45,66,.4)'; g.fillRect(-30, -18, 60, 4); g.fillRect(-30, -6, 44, 4);
      g.fillStyle = '#e0483f'; g.beginPath(); g.arc(0, -38, 5, 0, 7); g.fill();
      g.restore();
    }
  });
  panel(corkTex, 1.6, 1.1, RX - 0.02, 1.7, -4.9, -Math.PI / 2, true);
  box(0.04, 1.18, 1.68, '#8a6a46', ROOM.x - 0.02, 1.7, -4.9);

  function poster(text, sub, color, x, y, z, ry, w = 0.8, h = 1.06) {
    const tex = canvasTex(256, 340, (g, pw, ph) => {
      g.fillStyle = color; g.fillRect(0, 0, pw, ph);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(14, 14, pw - 28, ph - 28);
      g.fillStyle = '#2b2d42'; g.textAlign = 'center';
      g.font = FONT(38);
      text.split('\n').forEach((l, i) => g.fillText(l, pw / 2, 90 + i * 46));
      g.font = '72px sans-serif'; g.fillText(sub, pw / 2, 240);
    });
    panel(tex, w, h, x, y, z, ry);
  }
  poster('따뜻한 말\n한마디', '💛', '#ffd6a5', RX - 0.01, 1.9, -0.9, -Math.PI / 2);
  poster('천천히\n숨 쉬기', '🌬️', '#bde0fe', RX - 0.01, 1.9, 0.6, -Math.PI / 2);
  poster('서로\n도와요', '🤝', '#caffbf', RX - 0.01, 1.9, 2.1, -Math.PI / 2);
  poster('오늘도\n수고했어요', '🌈', '#ffc6ff', -ROOM.x + 0.03, 1.9, -1.95, Math.PI / 2, 0.72, 0.95);
  poster('쉬는 시간\n눈 쉬기', '👀', '#fdffb6', -ROOM.x + 0.03, 1.9, 1.95, Math.PI / 2, 0.72, 0.95);
  // 교실 앞문(미닫이): 반 이름 팻말과 유리창
  const doorTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#e9dcc4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b79f78'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#bcd9ea'; g.fillRect(52, 50, 152, 190);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(52, 50, 152, 190);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(70, 238); g.lineTo(120, 52); g.lineTo(150, 52); g.lineTo(100, 238); g.fill();
    g.fillStyle = '#8e99a4'; g.fillRect(26, 280, 14, 80);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(52, 300, 152, 170);
  });
  box(0.1, 0.1, 1.34, '#f1f2f4', ROOM.x - 0.02, 2.17, DZ);
  box(0.1, 2.2, 0.07, '#f1f2f4', ROOM.x - 0.02, 1.1, DZ - 0.63);
  box(0.1, 2.2, 0.07, '#f1f2f4', ROOM.x - 0.02, 1.1, DZ + 0.63);
  const doorLeaf = new T.Group();
  const leafBody = box(0.06, 2.1, 1.2, '#e9dcc4', ROOM.x - 0.08, 1.05, DZ, doorLeaf);
  leafBody.material = M('#e9dcc4');
  const leafFace = new T.Mesh(new T.PlaneGeometry(1.15, 2.1), track(new T.MeshLambertMaterial({ map: doorTex })));
  leafFace.position.set(ROOM.x - 0.113, 1.05, DZ);
  leafFace.rotation.y = -Math.PI / 2;
  doorLeaf.add(leafFace);
  scene.add(doorLeaf);
  const doorCollider = { x: ROOM.x + 0.05, z: DZ, hw: 0.2, hd: 0.62 };
  colliders.push(doorCollider);

  // ── 뒤쪽 벽: 사물함, 작품 게시판, 책장(독서 코너) ──
  const BZ = ROOM.z;
  const lockerTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#e7d9bd'; g.fillRect(0, 0, w, h);
    const cols = ['#ffd6a5', '#bde0fe', '#caffbf', '#ffc6ff', '#fdffb6', '#ffadad'];
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const x = 8 + c * 126;
        const y = 8 + r * 124;
        g.fillStyle = cols[(r * 3 + c) % 6];
        rr(g, x, y, 116, 116, 8); g.fill();
        g.strokeStyle = 'rgba(43,45,66,.35)'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#ffffff'; rr(g, x + 22, y + 14, 72, 30, 6); g.fill();
        g.fillStyle = '#2b2d42'; g.font = FONT(24); g.textAlign = 'center'; g.fillText(String(r * 8 + c + 1), x + 58, y + 37);
        g.fillStyle = '#7a6a5a'; g.fillRect(x + 50, y + 74, 16, 8);
      }
    }
  });
  const LKX = 2.6;
  const LKW = 7.6;
  box(LKW, 1.5, 0.46, '#d9c7a1', LKX, 0.75, BZ - 0.24);
  box(LKW + 0.06, 0.04, 0.5, '#eadbb9', LKX, 1.52, BZ - 0.24);
  panel(lockerTex, LKW, 1.46, LKX, 0.75, BZ - 0.48, Math.PI, true);
  solid(LKX, BZ - 0.24, LKW / 2, 0.24);
  const artTex = canvasTex(1024, 220, (g, w, h) => {
    g.fillStyle = theme.plaque; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#2b2d42'; g.font = FONT(34); g.textAlign = 'left'; g.fillText('🎨 우리 반 작품 전시', 24, 48);
    const colors = ['#ffd6a5', '#bde0fe', '#caffbf', '#ffc6ff', '#fdffb6', '#ffadad', '#e0c8ff'];
    for (let i = 0; i < 7; i += 1) {
      const x = 22 + i * 142;
      g.fillStyle = colors[i]; g.fillRect(x, 70, 124, 130);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x + 8, 78, 108, 114);
      g.font = '58px sans-serif'; g.textAlign = 'center'; g.fillText(['🌈', '🐱', '🌳', '🚀', '🌸', '🏠', '🐶'][i], x + 62, 148);
    }
  });
  panel(artTex, LKW - 0.4, 0.95, LKX, 2.3, BZ - 0.05, Math.PI);

  // 책장 (독서 코너)
  const BKX = -4.45;
  const BKW = 3.7;
  box(BKW, 2.1, 0.06, '#cfae7e', BKX, 1.05, BZ - 0.06);
  for (const sx of [-1, 1]) box(0.05, 2.1, 0.36, '#d9b98a', BKX + sx * (BKW / 2 - 0.02), 1.05, BZ - 0.2);
  const levels = [0.08, 0.55, 1.0, 1.45, 1.9];
  for (const y of levels) box(BKW, 0.04, 0.36, '#e3c799', BKX, y, BZ - 0.2);
  const BOOKN = 4 * 30;
  const books = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: 0xffffff }), BOOKN);
  const dm = new T.Object3D();
  const bookColors = [0xff8fab, 0x90e0ef, 0xffd166, 0xb5e48c, 0xc7a6ff, 0xffa07a, 0x8ecae6];
  let bi = 0;
  for (let r = 0; r < 4; r += 1) {
    let bx = BKX - BKW / 2 + 0.12;
    for (let k = 0; k < 30 && bx < BKX + BKW / 2 - 0.1; k += 1) {
      const bw = 0.07 + Math.random() * 0.07;
      const hgt = 0.26 + Math.random() * 0.14;
      dm.position.set(bx + bw / 2, levels[r] + 0.02 + hgt / 2, BZ - 0.2);
      dm.scale.set(bw, hgt, 0.24);
      dm.updateMatrix();
      books.setMatrixAt(bi, dm.matrix);
      books.setColorAt(bi, new T.Color(bookColors[(bi + r) % bookColors.length]));
      bi += 1;
      bx += bw + 0.012;
    }
  }
  books.count = bi;
  books.instanceMatrix.needsUpdate = true;
  if (books.instanceColor) books.instanceColor.needsUpdate = true;
  scene.add(books);
  solid(BKX, BZ - 0.2, BKW / 2, 0.22);
  const readTex = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = theme.plaque; rr(g, 4, 4, w - 8, h - 8, 30); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#2b2d42'; g.stroke();
    g.fillStyle = theme.plaqueInk; g.font = FONT(52); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('📚 독서 코너', w / 2, h / 2 + 3);
  });
  panel(readTex, 2.0, 0.37, BKX, 2.5, BZ - 0.05, Math.PI, false, { transparent: true });

  // ── 책상 (칸막이)·의자·책가방: 실제 교실처럼 한 사람씩 앉는다 ──
  const rows = [-2.0, 0.5, 3.0];
  const cols = [-1.2, 0.3, 1.8, 3.3, 4.8];
  const deskBase = bake(T, [
    { g: bg(0.76, 0.035, 0.54), p: [0, 0.715, 0], c: '#efe2c4' },
    { g: bg(0.78, 0.022, 0.56), p: [0, 0.69, 0], c: '#cdb88e' },
    ...[[-0.33, -0.22], [0.33, -0.22], [-0.33, 0.22], [0.33, 0.22]].map(([x, z]) => ({ g: cyl(0.014, 0.014, 0.7), p: [x, 0.35, z], c: '#8e99a4' })),
    { g: bg(0.66, 0.02, 0.02), p: [0, 0.12, -0.22], c: '#8e99a4' },
    { g: bg(0.66, 0.02, 0.02), p: [0, 0.12, 0.22], c: '#8e99a4' },
    { g: bg(0.02, 0.02, 0.44), p: [-0.33, 0.12, 0], c: '#8e99a4' },
    { g: bg(0.02, 0.02, 0.44), p: [0.33, 0.12, 0], c: '#8e99a4' },
    { g: bg(0.6, 0.13, 0.38), p: [0, 0.58, 0.03], c: '#c9d1d8' },
    { g: bg(0.8, 0.018, 0.022), p: [0, 1.2, -0.28], c: '#dfe4e8' },
    { g: bg(0.022, 0.018, 0.56), p: [-0.385, 1.2, -0.0], c: '#dfe4e8' },
    { g: bg(0.022, 0.018, 0.56), p: [0.385, 1.2, -0.0], c: '#dfe4e8' },
  ]);
  const partGeo = bake(T, [
    { g: bg(0.78, 0.46, 0.01), p: [0, 0.97, -0.28], c: '#ffffff' },
    { g: bg(0.01, 0.46, 0.56), p: [-0.385, 0.97, 0], c: '#ffffff' },
    { g: bg(0.01, 0.46, 0.56), p: [0.385, 0.97, 0], c: '#ffffff' },
  ]);
  const partMat = track(new T.MeshPhongMaterial({
    color: 0xd7ecff, vertexColors: true, transparent: true, opacity: 0.2, shininess: 90, specular: 0xffffff, side: T.DoubleSide, depthWrite: false,
  }));
  const itemSets = [
    [{ g: bg(0.22, 0.02, 0.3), p: [-0.13, 0.742, 0.02], c: '#ff8fab' }, { g: bg(0.19, 0.035, 0.07), p: [0.2, 0.752, -0.12], c: '#90e0ef' }],
    [{ g: bg(0.2, 0.025, 0.28), p: [-0.15, 0.745, 0.0], c: '#ffd166' }, { g: bg(0.2, 0.02, 0.28), p: [-0.15, 0.768, 0.0], r: [0, 0.2, 0], c: '#b5e48c' }, { g: bg(0.1, 0.04, 0.1), p: [0.22, 0.755, 0.1], c: '#ffffff' }],
    [{ g: bg(0.3, 0.015, 0.22), p: [0.0, 0.742, 0.02], c: '#2b2f38' }, { g: bg(0.08, 0.1, 0.08), p: [0.28, 0.77, -0.12], c: '#ffa07a' }],
  ].map((it) => bake(T, it));
  const chairGeo = bake(T, [
    { g: bg(0.44, 0.04, 0.42), p: [0, 0.43, 0], c: '#79c36a' },
    { g: bg(0.42, 0.3, 0.03), p: [0, 0.68, 0.2], r: [-0.08, 0, 0], c: '#79c36a' },
    ...[[-0.19, -0.17], [0.19, -0.17], [-0.19, 0.17], [0.19, 0.17]].map(([x, z]) => ({ g: cyl(0.012, 0.012, 0.42), p: [x, 0.21, z], c: '#8e99a4' })),
    { g: bg(0.4, 0.015, 0.015), p: [0, 0.14, -0.17], c: '#8e99a4' },
    { g: bg(0.4, 0.015, 0.015), p: [0, 0.14, 0.17], c: '#8e99a4' },
    { g: bg(0.02, 0.3, 0.02), p: [-0.17, 0.57, 0.2], c: '#8e99a4' },
    { g: bg(0.02, 0.3, 0.02), p: [0.17, 0.57, 0.2], c: '#8e99a4' },
  ]);
  const bagColors = ['#2b2f38', '#4d7cff', '#ff7b9c', '#37b27f', '#ffb347'];
  const bagGeos = bagColors.map((c) => bake(T, [
    { g: bg(0.26, 0.34, 0.14), p: [0, 0.2, 0], c },
    { g: bg(0.2, 0.13, 0.04), p: [0, 0.12, 0.09], c: '#ffffff' },
    { g: bg(0.04, 0.2, 0.02), p: [0, 0.42, 0], c: '#2b2f38' },
  ]));
  const seats = [];
  rows.forEach((rz, ri) => {
    cols.forEach((cx, ci) => {
      scene.add(place(new T.Mesh(deskBase, vmat), cx, 0, rz));
      scene.add(place(new T.Mesh(itemSets[(ri + ci) % 3], vmat), cx, 0, rz));
      const part = place(new T.Mesh(partGeo, partMat), cx, 0, rz);
      part.renderOrder = 2;
      scene.add(part);
      scene.add(place(new T.Mesh(chairGeo, vmat), cx, 0, rz + 0.75));
      solid(cx, rz + 0.34, 0.4, 0.66);
      seats.push({ kind: 'chair', x: cx, z: rz + 0.75, rot: Math.PI, approach: { x: cx, z: rz + 1.62 }, taken: false });
      if ((ri * 5 + ci) % 3 === 1) {
        const bagM = new T.Mesh(bagGeos[(ri + ci * 2) % bagGeos.length], vmat);
        scene.add(place(bagM, cx + 0.47, 0.32, rz + 0.12));
        bagM.rotation.y = 0.2;
        box(0.012, 0.3, 0.012, '#2b2f38', cx + 0.4, 0.64, rz + 0.12);
      }
    });
  });

  // ── 독서 러그와 쿠션 (러그에 서서 숨 쉬기) ──
  const RUG = { x: -3.9, z: 3.4 };
  const rugTex = canvasTex(256, 256, (g, w, h) => {
    theme.rug.forEach((c, i) => {
      g.fillStyle = c; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - i * 24, 0, 7); g.fill();
    });
    drawFlower(g, w / 2, h / 2, 62); // 우리 반 꽃이 러그 한가운데에
  });
  const rug = new T.Mesh(new T.CircleGeometry(2.0, 40), new T.MeshLambertMaterial({ map: rugTex }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(RUG.x, 0.02, RUG.z);
  scene.add(rug);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const cx = RUG.x + Math.cos(a) * 1.5;
    const cz = RUG.z + Math.sin(a) * 1.5;
    const cu = new T.Mesh(new T.SphereGeometry(0.3, 14, 10), M([0xff8fab, 0x90e0ef, 0xffd166, 0xb5e48c, 0xc7a6ff, 0xffa07a][i]));
    cu.scale.y = 0.45;
    scene.add(place(cu, cx, 0.16, cz));
    // 쿠션에 앉을 때는 러그 한가운데를 바라본다
    seats.push({ kind: 'floor', x: cx, z: cz, rot: Math.atan2(RUG.x - cx, RUG.z - cz), approach: { x: RUG.x + Math.cos(a) * 2.2, z: RUG.z + Math.sin(a) * 2.2 }, taken: false });
  }

  // ── 화분 (우리 반 꽃) ──
  function plant(x, z, onFloor = true, parent = scene, scale = 1) {
    const g = new T.Group();
    const pot = new T.Mesh(new T.CylinderGeometry(0.28, 0.2, 0.4, 10), M(0xe07a5f));
    pot.position.y = 0.2;
    g.add(pot);
    if (room?.theme === 'chrysanthemum') {
      // 국화 화분: 동글동글한 꽃송이
      const base = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), M(0x5aab6a));
      base.position.y = 0.5;
      g.add(base);
      [[0, 0.82, 0], [0.22, 0.7, 0.1], [-0.22, 0.74, -0.08], [0.08, 0.66, -0.22], [-0.12, 0.64, 0.2], [0.28, 0.84, -0.12], [-0.26, 0.86, 0.08], [0, 0.98, 0.04]].forEach(([px, py, pz], i) => {
        const f = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), M(theme.petals[i % 4]));
        f.position.set(px, py, pz);
        g.add(f);
      });
    } else if (room?.theme === 'orchid') {
      // 난초 화분: 휘어진 줄기에 꽃이 줄줄이
      [[0.0, 0.22], [0.1, -0.18]].forEach(([lean, ph], si) => {
        for (let k = 0; k < 4; k += 1) {
          const seg = new T.Mesh(new T.CylinderGeometry(0.014, 0.018, 0.3, 5), M(0x5aab6a));
          seg.position.set(lean * 0.4 + k * 0.07 * (si ? -1 : 1), 0.5 + k * 0.27, 0);
          seg.rotation.z = (si ? 0.28 : -0.28) + k * 0.14 * (si ? -1 : 1);
          g.add(seg);
          if (k > 0) {
            const fl = flowerSprite(0.34 - k * 0.02);
            fl.position.set(seg.position.x + (si ? -0.06 : 0.06), seg.position.y + 0.05 + ph * 0.1, 0.04);
            g.add(fl);
          }
        }
      });
      const leaf = new T.Mesh(new T.SphereGeometry(0.2, 10, 8), M(0x6dbb7a));
      leaf.scale.set(1.5, 0.45, 1);
      leaf.position.y = 0.46;
      g.add(leaf);
    } else {
      [[0, 0.75, 0, 0.34], [0.2, 0.62, 0.1, 0.24], [-0.2, 0.66, -0.08, 0.26]].forEach(([px, py, pz, r]) => {
        const leaf = new T.Mesh(new T.SphereGeometry(r, 10, 8), M(0x6dbb7a));
        leaf.position.set(px, py, pz);
        g.add(leaf);
      });
    }
    g.scale.setScalar(scale);
    parent.add(place(g, x, onFloor ? 0 : 0.94, z));
    if (onFloor) colliders.push({ x, z, r: 0.32 * scale });
  }
  [[6.45, -5.3], [-1.95, 5.45], [6.45, 1.2]].forEach(([x, z]) => plant(x, z));
  if (flowerMap) {
    // 창가 화분: 창 아래 수납장 위에 우리 반 꽃이 늘어서 있다
    for (const zc of WIN) {
      box(0.3, 0.06, 2.8, '#5aab6a', -ROOM.x + 0.3, 0.97, zc);
      for (let k = 0; k < 6; k += 1) {
        const fl = flowerSprite(0.3 + (k % 2) * 0.06);
        fl.position.set(-ROOM.x + 0.3, 1.16 + (k % 2) * 0.04, zc - 1.2 + k * 0.48);
        scene.add(fl);
      }
    }
  } else {
    for (const zc of WIN) plant(-ROOM.x + 0.28, zc, false, scene, 0.55);
  }

  // 천장에 매단 종이별
  const starTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 ? 26 : 58;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 3; g.stroke();
  });
  const lanterns = [];
  [[-5.2, 0.8, 2.5], [-2.5, -3.2, 2.45], [-4.8, -2.8, 2.6], [1.2, 5.0, 2.5], [-3.0, 5.0, 2.6], [5.4, -4.4, 2.55]].forEach(([x, z, y], i) => {
    const g = new T.Group();
    const orb = new T.Sprite(new T.SpriteMaterial({ map: starTex, color: theme.stars[i % 4], transparent: true, depthWrite: false }));
    orb.scale.set(0.46, 0.46, 1);
    g.add(orb);
    const cord = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, ROOM.h - y, 4), M(0xaaaaaa));
    cord.position.y = (ROOM.h - y) / 2 + 0.2;
    g.add(cord);
    scene.add(place(g, x, y, z));
    lanterns.push({ g, y, ph: i * 1.3, orb });
  });

  const DUST = 140;
  const dustGeo = new T.BufferGeometry();
  const dp = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i += 1) { dp[i * 3] = -ROOM.x + Math.random() * ROOM.x * 2; dp[i * 3 + 1] = 0.3 + Math.random() * 2.6; dp[i * 3 + 2] = -ROOM.z + Math.random() * ROOM.z * 2; }
  dustGeo.setAttribute('position', new T.BufferAttribute(dp, 3));
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ size: 0.08, map: softDot, color: 0xfff4d0, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true }));
  scene.add(dust);

  // 길 찾기 지도는 가구를 다 놓은 뒤에 만든다 (사람이나 토끼는 가구가 아니다)
  const nav = makeNav(colliders);

  // ── 나 ──
  const kidDesc = { look: user.look || PLAYER_LOOK, tag: `${emoji} ${user.name}`, tagBg: '#fff7c2', scale: KID_SCALE(grade), role: 'kid' };
  const me = self || kidDesc;
  const player = kit.make(me.look, { name: me.tag, scale: me.scale, tagBg: me.tagBg, role: me.kind || 'kid' });
  scene.add(player);

  // ── 친구와 선생님: 스스로 걸어 다닌다 ──
  const NAV = {
    free: [[-3.2, -4.4], [-1.0, -4.0], [2.2, -4.2], [4.8, -4.4], [-3.4, -1.4], [-2.6, 0.6], [-4.6, 1.2], [-2.4, 5.0], [1.0, 4.9], [4.0, 4.7], [6.0, -3.0], [6.0, 3.0]],
    board: [[-1.2, -5.15], [0.4, -5.15], [2.0, -5.15]],
    window: [[-5.9, -3.9], [-5.9, 0.2], [-5.9, 3.9]],
    shelf: [[-4.6, 5.3], [2.4, 5.2]],
    aisle: [],
  };
  for (const rz of rows) for (const gx of [-0.45, 1.05, 2.55, 4.05]) NAV.aisle.push([gx, rz + 1.62]);
  for (const k of Object.keys(NAV)) NAV[k] = NAV[k].map(([x, z]) => { const s = nav.snap(x, z); return [s.x, s.z]; });
  // 들어서자마자 인사 별이 생기지 않게, 시작 자리에서 조금 떨어진 곳에서 친구들이 출발한다
  const SPAWN = NAV.free.filter(([x, z]) => Math.hypot(x - START.x, z - START.z) > 3.3).sort(() => Math.random() - 0.5);
  const kidGiven = givenName(user.name);
  const crowd = (npcs || []).map((data, i) => {
    const teacher = data.role === 'teacher';
    const g = kit.make(data.look, { name: data.name, scale: teacher ? TEACHER_SCALE : FRIEND_SCALE(grade), tagBg: teacher ? '#e3f1ff' : '#ffffff', role: teacher ? 'teacher' : 'friend' });
    const sp = SPAWN[i % SPAWN.length];
    g.position.set(sp[0] + (i >= SPAWN.length ? 0.6 : 0), 0, sp[1]);
    g.rotation.y = rand(-Math.PI, Math.PI);
    scene.add(g);
    colliders.push({ r: 0.45, ref: g });
    return {
      data, group: g, role: data.role, msg: String(data.msg || '').replaceAll('{이름}', kidGiven),
      speed: teacher ? rand(0.85, 1.0) : rand(1.05, 1.5), radius: teacher ? 0.34 : 0.3,
      state: 'idle', t: 0, dur: rand(0.5, 3), path: [], seat: null, face: null, partner: null, doing: 'idle',
      phase: rand(0, 6), stuck: 0, lastX: g.position.x, lastZ: g.position.z, wave: 0, speed01: 0,
    };
  });
  // 처음에는 친구 몇 명이 자리에 앉아 있다
  crowd.filter((n) => n.role === 'friend').slice(0, 3).forEach((n) => {
    const far = (s) => Math.hypot(s.x - START.x, s.z - START.z) > 3.3;
    const seat = seats.find((s) => s.kind === 'chair' && !s.taken && far(s) && Math.random() < 0.5) || seats.find((s) => s.kind === 'chair' && !s.taken && far(s));
    if (seat) sitDown(n, seat);
  });

  function sitDown(n, seat) {
    seat.taken = true;
    n.seat = seat;
    n.group.position.set(seat.x, 0, seat.z);
    n.group.rotation.y = seat.rot;
    kit.setSit(n.group, seat.kind === 'floor');
    n.state = 'sit';
    n.t = 0;
    n.dur = rand(12, 26);
    n.path = [];
  }
  function standUp(n) {
    const s = n.seat;
    kit.standUp(n.group);
    if (s) { n.group.position.set(s.approach.x, 0, s.approach.z); s.taken = false; }
    n.seat = null;
    n.state = 'idle';
    n.t = 0;
    n.dur = rand(0.8, 2);
  }

  // 어디로 갈지 고른다: 친구는 이곳저곳 구경하고 앉고 수다 떨고, 선생님은 통로를 돌며 살펴본다
  function walkTo(n, p, doing, face) {
    n.path = nav.path(n.group.position, { x: p[0] ?? p.x, z: p[1] ?? p.z });
    n.state = 'walk';
    n.doing = doing;
    n.face = face || null;
    n.stuck = 0;
    n.lastX = n.group.position.x;
    n.lastZ = n.group.position.z;
    n.t = 0;
  }
  function chooseNext(n) {
    const r = Math.random();
    if (n.role === 'teacher') {
      if (r < 0.4) walkTo(n, pick(NAV.aisle), 'look', null);
      else if (r < 0.62) { const b = pick(NAV.board); walkTo(n, b, 'write', { x: b[0], z: -ROOM.z }); }
      else if (r < 0.8) walkTo(n, pick(NAV.free), 'idle', null);
      else if (!startChat(n)) { const w = pick(NAV.window); walkTo(n, w, 'gaze', { x: -ROOM.x, z: w[1] }); }
      return;
    }
    if (r < 0.3) walkTo(n, pick(NAV.free), 'idle', null);
    else if (r < 0.45) { const w = pick(NAV.window); walkTo(n, w, 'gaze', { x: -ROOM.x, z: w[1] }); }
    else if (r < 0.55) { const s = pick(NAV.shelf); walkTo(n, s, 'gaze', { x: s[0], z: ROOM.z }); }
    else if (r < 0.7) {
      const free = seats.filter((s) => !s.taken);
      if (free.length) { const seat = pick(free); seat.taken = true; n.pendingSeat = seat; walkTo(n, seat.approach, 'sit', null); } else walkTo(n, pick(NAV.free), 'idle', null);
    } else if (r < 0.88) { if (!startChat(n)) walkTo(n, pick(NAV.free), 'idle', null); } else { n.state = 'idle'; n.t = 0; n.dur = rand(2, 5); n.doing = 'idle'; }
  }
  function startChat(n) {
    const others = crowd.filter((o) => o !== n && o.state !== 'sit' && o.state !== 'chat' && o.state !== 'greet');
    if (!others.length) return false;
    const o = others.reduce((best, c) => (Math.hypot(c.group.position.x - n.group.position.x, c.group.position.z - n.group.position.z) < Math.hypot(best.group.position.x - n.group.position.x, best.group.position.z - n.group.position.z) ? c : best));
    // 상대 가까이로 걸어가서 마주 보고 이야기한다. 상대는 잠깐 멈춰 기다린다.
    const dx = n.group.position.x - o.group.position.x;
    const dz = n.group.position.z - o.group.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const spot = { x: clamp(o.group.position.x + (dx / d) * 1.0, -6.3, 6.3), z: clamp(o.group.position.z + (dz / d) * 1.0, -5.3, 5.3) };
    if (!nav.free(spot.x, spot.z) || !nav.free(o.group.position.x, o.group.position.z)) return false;
    if (o.pendingSeat) { o.pendingSeat.taken = false; o.pendingSeat = null; } // 앉으러 가던 중이었다면 자리를 돌려준다
    o.state = 'idle'; o.t = 0; o.dur = 14; o.doing = 'wait'; o.path = []; o.partner = n;
    walkTo(n, spot, 'chat', null);
    n.partner = o;
    return true;
  }

  const sep = (n, hs, dt) => {
    const p = n.group.position;
    const push = (ox, oz, min) => {
      const dx = p.x - ox;
      const dz = p.z - oz;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) { const k = ((min - d) / min) * 2.2 * dt; p.x += (dx / d) * k; p.z += (dz / d) * k; }
    };
    for (const o of crowd) { if (o !== n && o.state !== 'sit') push(o.group.position.x, o.group.position.z, 0.8); }
    for (const h of hs) push(h.x, h.z, 0.95);
  };
  const faceTo = (g, x, z, k, dt) => {
    g.rotation.y += angleDelta(g.rotation.y, Math.atan2(x - g.position.x, z - g.position.z)) * (1 - Math.exp(-k * dt));
  };
  const REST_Z = 0.1; // 팔을 내리고 있을 때 바깥쪽으로 벌어진 정도

  // hs: 지금 교실에 있는 사람들의 위치 (나, 그리고 같이 온 엄마·아빠 또는 아이). 가장 가까운 사람에게 인사한다.
  function brain(n, t, dt, hs) {
    const g = n.group;
    const p = g.position;
    const u = g.userData;
    let pp = hs[0];
    let dP = Math.hypot(pp.x - p.x, pp.z - p.z);
    for (let i = 1; i < hs.length; i += 1) {
      const d = Math.hypot(hs[i].x - p.x, hs[i].z - p.z);
      if (d < dP) { dP = d; pp = hs[i]; }
    }
    let moving = false;
    let waveOn = false;
    let gesture = 0;
    let write = false;

    // 가까이 온 아이에게 인사한다 (걷던 길은 잠깐 멈춘다)
    if (n.state === 'sit') {
      if (dP < 2.6) { waveOn = true; u.head.rotation.y = damp(u.head.rotation.y, clamp(angleDelta(g.rotation.y, Math.atan2(pp.x - p.x, pp.z - p.z)), -1, 1), 5, dt); }
      else u.head.rotation.y = damp(u.head.rotation.y, 0, 4, dt);
      n.t += dt;
      if (n.t > n.dur && dP > 3.2) standUp(n);
    } else if (n.state === 'greet') {
      faceTo(g, pp.x, pp.z, 6, dt);
      waveOn = true;
      if (dP > 3.7) { n.state = 'idle'; n.t = 0; n.dur = rand(0.6, 1.6); }
    } else if (dP < 2.5) {
      n.state = 'greet';
      n.path = [];
      if (n.pendingSeat) { n.pendingSeat.taken = false; n.pendingSeat = null; }
      if (n.partner) { n.partner.partner = null; n.partner = null; }
    } else if (n.state === 'idle') {
      n.t += dt;
      u.head.rotation.y = damp(u.head.rotation.y, Math.sin(t * 0.7 + n.phase) * 0.6, 3, dt);
      if (n.face) faceTo(g, n.face.x, n.face.z, 3, dt);
      if (n.doing === 'wait' && n.partner) faceTo(g, n.partner.group.position.x, n.partner.group.position.z, 4, dt);
      write = n.doing === 'write';
      if (n.t > n.dur) { n.face = null; n.partner = null; n.doing = 'idle'; chooseNext(n); }
    } else if (n.state === 'walk') {
      const tgt = n.path[0];
      if (!tgt) { n.state = 'idle'; n.t = 0; n.dur = 1; } else {
        const dx = tgt.x - p.x;
        const dz = tgt.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.2) {
          n.path.shift();
          if (!n.path.length) arrive(n);
        } else {
          const step = Math.min(d, n.speed * dt);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          faceTo(g, tgt.x, tgt.z, 8, dt);
          moving = true;
          u.head.rotation.y = damp(u.head.rotation.y, 0, 5, dt);
        }
        // 막혀서 못 가고 있으면 다른 곳으로 간다 (방금 도착해서 앉거나 멈춘 경우는 건드리지 않는다)
        if (n.state === 'walk') {
          n.t += dt;
          n.stuck += dt;
          if (n.stuck > 1.4) {
            if (Math.hypot(p.x - n.lastX, p.z - n.lastZ) < 0.2) {
              if (n.pendingSeat) { n.pendingSeat.taken = false; n.pendingSeat = null; }
              n.path = [];
              n.state = 'idle'; n.t = 0; n.dur = rand(0.5, 1.5); n.doing = 'idle';
            }
            n.stuck = 0; n.lastX = p.x; n.lastZ = p.z;
          }
          if (n.t > 40) {
            if (n.pendingSeat) { n.pendingSeat.taken = false; n.pendingSeat = null; }
            n.path = []; n.state = 'idle'; n.t = 0; n.dur = 1;
          }
        }
      }
    } else if (n.state === 'chat') {
      n.t += dt;
      if (n.partner) faceTo(g, n.partner.group.position.x, n.partner.group.position.z, 5, dt);
      gesture = 1;
      u.head.rotation.y = damp(u.head.rotation.y, Math.sin(t * 2.3 + n.phase) * 0.25, 5, dt);
      if (n.t > n.dur) {
        if (n.partner) { n.partner.state = 'idle'; n.partner.t = n.partner.dur; n.partner.partner = null; }
        n.partner = null; n.state = 'idle'; n.t = 0; n.dur = rand(0.4, 1.2);
      }
    }

    if (n.state !== 'sit') {
      resolve(p, colliders, n.radius, true);
      sep(n, hs, dt);
    }

    // 몸짓
    n.speed01 = damp(n.speed01, moving ? 1 : 0, 8, dt);
    const sw = Math.sin(t * (6 + n.speed * 2) + n.phase) * 0.7 * n.speed01;
    if (!u.sit) {
      kit.limbs(g, sw, n.speed01);
      if (gesture) u.armL.rotation.x += Math.sin(t * 3 + n.phase) * 0.3;
      u.body.position.y = u.baseY + Math.abs(Math.sin(t * (6 + n.speed * 2) + n.phase)) * 0.035 * n.speed01 + Math.sin(t * 1.6 + n.phase) * 0.01;
    } else u.body.position.y = u.baseY + Math.sin(t * 1.6 + n.phase) * 0.012;
    let armRz = REST_Z;
    let armRx = u.sit ? -0.7 : sw * 0.9;
    let elbowR = u.sit ? -0.95 : u.elbowR.rotation.x;
    if (waveOn) { armRz = 2.4 + Math.sin(t * 9) * 0.35; elbowR = -0.5 + Math.sin(t * 9) * 0.25; }
    else if (write) { armRz = 2.1 + Math.sin(t * 4) * 0.12; armRx = 0.3; elbowR = -0.4; } else if (gesture) { armRx = -0.9 + Math.sin(t * 3.4 + n.phase) * 0.35; elbowR = -0.9; }
    u.armR.rotation.z = damp(u.armR.rotation.z, armRz, 9, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, armRx, 9, dt);
    u.elbowR.rotation.x = damp(u.elbowR.rotation.x, elbowR, 9, dt);
    kit.face(g, t, waveOn || gesture === 1);
    n.wave = waveOn ? 1 : 0;
  }

  function arrive(n) {
    if (n.doing === 'sit' && n.pendingSeat) { const s = n.pendingSeat; n.pendingSeat = null; sitDown(n, s); return; }
    if (n.doing === 'chat' && n.partner) { n.state = 'chat'; n.t = 0; n.dur = rand(5, 9); return; }
    n.state = 'idle';
    n.t = 0;
    n.dur = n.doing === 'write' ? rand(7, 12) : n.doing === 'gaze' ? rand(5, 10) : n.doing === 'look' ? rand(2, 4) : rand(2, 6);
  }

  // ── 교실 밖 공간: 복도, 복도 2, 화장실, 2층 계단 (별로 연 것만) ──
  const view = { unlocked: new Set(wInfo.unlocked), stars: wInfo.stars, catalog: wInfo.catalog };
  const halls = buildHalls(T, {
    scene, colliders, tb, theme, school, label: room?.label || '', catalog: wInfo.catalog, view, door: { leaf: doorLeaf, collider: doorCollider },
  });
  halls.init(wInfo.unlocked);

  // ── 토끼 (우리 반 토끼) ──
  const bgp = new T.Group();
  const white = M(0xfffaf5);
  const bBody = new T.Mesh(new T.SphereGeometry(0.3, 14, 10), white);
  bBody.scale.set(0.9, 0.8, 1.2);
  bBody.position.y = 0.26;
  const bHead = new T.Mesh(new T.SphereGeometry(0.2, 14, 10), white);
  bHead.position.set(0, 0.46, 0.3);
  const earG = new T.CapsuleGeometry(0.05, 0.22, 4, 8);
  const earL = new T.Mesh(earG, white);
  const earR = new T.Mesh(earG, white);
  earL.position.set(-0.08, 0.76, 0.28);
  earR.position.set(0.08, 0.76, 0.28);
  earL.rotation.z = 0.15;
  earR.rotation.z = -0.15;
  const tail = new T.Mesh(new T.SphereGeometry(0.1, 8, 8), white);
  tail.position.set(0, 0.28, -0.36);
  const bEyeL = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), M(0x2b2d42));
  const bEyeR = bEyeL.clone();
  bEyeL.position.set(-0.075, 0.5, 0.47);
  bEyeR.position.set(0.075, 0.5, 0.47);
  const nose = new T.Mesh(new T.SphereGeometry(0.025, 8, 6), M(0xff8fab));
  nose.position.set(0, 0.45, 0.5);
  bgp.add(bBody, bHead, earL, earR, tail, bEyeL, bEyeR, nose);
  const bBlob = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), new T.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(60,40,20,.38)');
    gr.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }), transparent: true, depthWrite: false }));
  bBlob.rotation.x = -Math.PI / 2;
  bBlob.position.y = 0.012;
  bgp.add(bBlob);
  bgp.position.set(RUG.x + 0.3, 0, RUG.z - 0.2);
  scene.add(bgp);
  const bunny = { group: bgp, target: new T.Vector3(RUG.x + 0.3, 0, RUG.z - 0.2), wait: 0 };

  // ── 미션 자리 표시 ──
  const stops = {
    window: { x: -5.7, z: 0, r: 1.3 },
    rug: { x: RUG.x, z: RUG.z, r: 1.6 },
    board: { x: 0.1, z: -4.6, r: 1.7 },
  };
  const iconTex = (icon) => canvasTex(128, 128, (g) => {
    g.font = '88px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, 64, 70);
  });
  const markers = {};
  for (const [id, s] of Object.entries(stops)) {
    const ring = new T.Mesh(
      new T.RingGeometry(s.r - 0.16, s.r, 48),
      new T.MeshBasicMaterial({ color: 0x7be0a4, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.05, s.z);
    scene.add(ring);
    const icon = new T.Sprite(new T.SpriteMaterial({ map: iconTex({ window: '👀', rug: '🌬️', board: '✏️' }[id]), transparent: true, depthWrite: false }));
    icon.scale.set(0.9, 0.9, 1);
    icon.position.set(s.x, 2.3, s.z);
    scene.add(icon);
    markers[id] = { ring, icon, base: 2.3 };
  }
  const doneStarTex = iconTex('⭐');

  // ── 같이 있는 사람들: 서버가 알려 주는 위치대로 걷는 엄마·아빠(또는 아이) ──
  const peers = new Map();
  const peerDesc = (kind) => (kind === 'kid' ? kidDesc : { look: PARENTS[kind].look, tag: PARENTS[kind].tag, tagBg: PARENTS[kind].tagBg, scale: PARENT_SCALE, role: kind });
  function syncPeers(list) {
    const seen = new Set();
    const out = { joined: [], left: [], said: [] };
    for (const p of list) {
      if (!['kid', 'mom', 'dad'].includes(p.kind)) continue; // eslint-disable-line no-continue
      seen.add(p.id);
      let peer = peers.get(p.id);
      if (!peer) {
        const d = peerDesc(p.kind);
        const g = kit.make(d.look, { name: d.tag, scale: d.scale, tagBg: d.tagBg, role: d.role });
        g.position.set(p.x, 0, p.z);
        g.rotation.y = p.ry;
        scene.add(g);
        const col = { r: 0.45, ref: g };
        colliders.push(col);
        peer = { id: p.id, kind: p.kind, group: g, col, tx: p.x, tz: p.z, tr: p.ry, speed01: 0, say: '', sayAt: 0 };
        peers.set(p.id, peer);
        out.joined.push(peer);
      }
      peer.tx = p.x;
      peer.tz = p.z;
      peer.tr = p.ry;
      if (p.say && p.sayAt !== peer.sayAt) { peer.say = p.say; peer.sayAt = p.sayAt; out.said.push(peer); }
    }
    for (const [id, peer] of peers) {
      if (seen.has(id)) continue; // eslint-disable-line no-continue
      scene.remove(peer.group);
      disposeCharacter(peer.group);
      const i = colliders.indexOf(peer.col);
      if (i >= 0) colliders.splice(i, 1);
      peers.delete(id);
      out.left.push(peer);
    }
    return out;
  }
  const swing = (ch, speed01, t) => {
    const u = ch.userData;
    kit.limbs(ch, Math.sin(t * 9) * 0.75 * speed01, speed01);
    u.body.position.y = u.baseY + Math.abs(Math.sin(t * 9)) * 0.04 * speed01 + Math.sin(t * 1.6) * 0.008;
    kit.face(ch, t, false);
  };
  const humans = [];

  return {
    scene, camera, player, colliders, stops, bunny, drawBoard, npcs: crowd, peers, syncPeers, grade, nav, halls, view,
    animatePlayer(speed01, t) { swing(player, speed01, t); },
    animate(t, dt, pos, st) {
      humans.length = 0;
      humans.push(pos);
      for (const p of peers.values()) {
        const g = p.group;
        const dx = p.tx - g.position.x;
        const dz = p.tz - g.position.z;
        const dd = Math.hypot(dx, dz);
        if (dd > 4) g.position.set(p.tx, 0, p.tz);
        else { g.position.x = damp(g.position.x, p.tx, 9, dt); g.position.z = damp(g.position.z, p.tz, 9, dt); }
        g.rotation.y += angleDelta(g.rotation.y, p.tr) * (1 - Math.exp(-10 * dt));
        g.position.y = damp(g.position.y, floorY(g.position.x, g.position.z), 14, dt); // 계단을 오르내린다
        p.speed01 = damp(p.speed01, clamp(dd * 5, 0, 1), 10, dt);
        swing(g, p.speed01, t);
        humans.push(g.position);
      }
      halls.update(t, dt);
      for (const n of crowd) brain(n, t, dt, humans);
      // 토끼: 러그 근처를 사뿐사뿐
      const bp = bunny.group.position;
      bunny.wait -= dt;
      const dxb = bunny.target.x - bp.x;
      const dzb = bunny.target.z - bp.z;
      const db = Math.hypot(dxb, dzb);
      let hop = 0;
      if (db > 0.15) {
        bp.x += (dxb / db) * 0.8 * dt;
        bp.z += (dzb / db) * 0.8 * dt;
        bunny.group.rotation.y += angleDelta(bunny.group.rotation.y, Math.atan2(dxb, dzb)) * (1 - Math.exp(-8 * dt));
        hop = Math.abs(Math.sin(t * 7)) * 0.14;
      } else if (bunny.wait <= 0) {
        bunny.target.set(RUG.x + (Math.random() - 0.5) * 2.8, 0, RUG.z - 0.2 + (Math.random() - 0.5) * 2.6);
        bunny.wait = 1.5 + Math.random() * 2.5;
      }
      bp.y = hop;
      // 풍경·조명
      for (const c of clouds) { c.sp.position.z += c.v * dt; if (c.sp.position.z > 80) c.sp.position.z = -80; }
      beams.forEach((b, i) => { b.material.opacity = 0.75 + Math.sin(t * 0.6 + i) * 0.2; });
      lanterns.forEach((l) => {
        l.g.position.y = l.y + Math.sin(t * 0.9 + l.ph) * 0.05;
        l.g.rotation.z = Math.sin(t * 0.7 + l.ph) * 0.05;
        l.orb.material.opacity = clamp((camera.position.distanceTo(l.g.position) - 0.9) / 1.4, 0, 1); // 카메라에 너무 가까우면 가린다
      });
      const arr = dust.geometry.attributes.position.array;
      for (let i = 0; i < DUST; i += 1) {
        arr[i * 3 + 1] += Math.sin(t * 0.5 + i) * 0.0015 + 0.0008;
        arr[i * 3] += Math.sin(t * 0.3 + i * 2) * 0.0012;
        if (arr[i * 3 + 1] > 3.0) arr[i * 3 + 1] = 0.3;
      }
      dust.geometry.attributes.position.needsUpdate = true;
      for (const [id, m] of Object.entries(markers)) {
        const doneIt = st.stars.has(id);
        m.ring.material.color.setHex(doneIt ? 0xffe27a : 0x7be0a4);
        m.ring.material.opacity = (doneIt ? 0.35 : 0.55) + Math.sin(t * 2.2) * 0.2;
        const sc = 1 + Math.sin(t * 2.2) * 0.03;
        m.ring.scale.set(sc, sc, 1);
        m.icon.position.y = m.base + Math.sin(t * 1.8) * 0.1;
        m.icon.material.opacity = clamp((camera.position.distanceTo(m.icon.position) - 1.2) / 1.6, 0, 1);
        if (doneIt && m.icon.material.map !== doneStarTex) { m.icon.material.map = doneStarTex; m.icon.material.needsUpdate = true; }
      }
    },
    dispose() {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      tb.dispose();
    },
  };
}
