// 마음 쉼터의 교실 장면: 매원초등학교 교실처럼 꾸민다
//  - 앞쪽 하얀 칠판·TV·알림판·시계, 왼쪽 창문(블라인드)과 나무 수납장, 뒤쪽 사물함과 책장
//  - 책상마다 투명 칸막이, 초록색 의자, 책가방, 하얀 타일 바닥과 형광등 천장
//  - 선생님과 친구들은 스스로 걸어 다니고(길 찾기), 토끼와 마음 미션 자리는 그대로 있다
import {
  ROOM, START, THEMES, PLAYER_LOOK, PARENTS, PARENT_SCALE, TEACHER_SCALE, KID_SCALE, FRIEND_SCALE,
  clamp, damp, angleDelta, rand, pick, givenName, resolve, makeNav, floorY,
} from './world-shared.js';
import { toolbox, characterKit, bake, disposeCharacter, roomEnvironment } from './character.js';
import { buildHalls } from './schoolhall.js';
import { createBoard, BOARD_W, BOARD_H } from './board.js';
import { RULES, ruleOf } from './rules.js';

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
//  boardImage: 아이가 칠판에 남긴 낙서(PNG data URL, 없으면 빈 칠판)
//  renderer: 빛 환경(IBL)을 한 번 구울 때 쓴다 (없으면 반구 빛만으로 밝힌다)
export function buildScene(T, { user, emoji, npcs, room, self, world = null, boardImage = '', renderer = null }) {
  const wInfo = world || { catalog: [], unlocked: [], stars: 0 };
  const scene = new T.Scene();
  scene.background = new T.Color(0xd6ecff);
  scene.fog = new T.Fog(0xd6ecff, 30, 130);
  const camera = new T.PerspectiveCamera(52, 1.6, 0.1, 220);
  const colliders = [];
  const tb = toolbox(T);
  const { M, L, canvasTex, track } = tb;
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
    const mat = lit ? L({ map: tex, ...opts }) : track(new T.MeshBasicMaterial({ map: tex, ...opts }));
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

  // ── 빛: 교실 빛 환경(천장 형광등·창의 하늘빛이 고루 밝힌다) + 창으로 들어오는 오후 햇빛(가구 그림자) ──
  let envRT = null;
  if (renderer) {
    try {
      envRT = roomEnvironment(T, renderer, { wall: theme.wall });
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.6;
    } catch (err) {
      console.warn('[world] 빛 환경을 만들지 못했어요', err);
    }
  }
  const hemi = new T.HemisphereLight(0xfffaf0, 0xd9cdb8, envRT ? 0.25 : 2.3);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff0d4, envRT ? 2.5 : 1.7);
  sun.position.set(-8.5, 10.5, 3.5);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  // 반대쪽(복도 쪽) 위에서 오는 은은한 빛: 창문 벽과 물건 뒷면이 칙칙해지지 않게 (그림자 없음)
  const fill = new T.DirectionalLight(0xf4f6ff, envRT ? 0.7 : 0.8);
  fill.position.set(7, 8, -8);
  scene.add(fill);
  // 가구는 움직이지 않으니 그림자 지도는 처음 한 번만 그린다 (움직이는 문·사람은 그림자를 드리우지 않는다)
  sun.castShadow = true;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3.2;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.025;
  sun.shadow.intensity = 0.82;
  {
    // 그림자 사진기가 교실(가구 높이까지)을 꼭 맞게 담도록 크기를 잡는다
    const cam = sun.shadow.camera;
    cam.position.copy(sun.position);
    cam.lookAt(sun.target.position);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    const v = new T.Vector3();
    let [x0, x1, y0, y1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const x of [-ROOM.x - 0.4, ROOM.x + 0.4]) for (const y of [0, 2.6]) for (const z of [-ROOM.z - 0.4, ROOM.z + 0.4]) {
      v.set(x, y, z).applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
    Object.assign(cam, { left: x0, right: x1, bottom: y0, top: y1, near: Math.max(0.1, -z1 - 1), far: -z0 + 1 });
    cam.updateProjectionMatrix();
  }
  // 바닥 그늘(AO): 가구 밑과 벽 가장자리. 가구를 놓을 때마다 적어 두었다가 마지막에 바닥 그림으로 굽는다
  const aoSpots = [];
  const ao = (x, z, w, d, k = 0.5, round = false) => aoSpots.push({ x, z, w, d, k, round });
  // 햇빛 그림자를 드리우는 것은 가구뿐이다 (cast 로 표시). 벽·천장은 햇빛을 막지 않아 창가가 어두워지지 않는다.
  const cast = (o) => { o.traverse((c) => { c.userData.cast = true; }); return o; };

  // ── 바닥(연한 타일)·천장(흰 천장판과 형광등) ──
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    const tones = ['#eeeae1', '#e7e3d9', '#ebe7dd', '#e9e5db'];
    for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) { g.fillStyle = tones[i * 2 + j]; g.fillRect(i * 256, j * 256, 256, 256); }
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 4200; k += 1) {
      const c = rnd();
      g.fillStyle = c < 0.45 ? 'rgba(150,140,125,.14)' : c < 0.55 ? 'rgba(120,135,150,.12)' : 'rgba(255,255,255,.45)';
      const s = 1 + rnd() * 2.2;
      g.fillRect(rnd() * w, rnd() * h, s, s);
    }
    // 타일 줄눈: 가운데는 어둡고 양옆은 살짝 밝게 (움푹 들어간 느낌)
    for (const p of [0, 256]) {
      g.fillStyle = 'rgba(160,150,135,.6)'; g.fillRect(0, p, w, 3); g.fillRect(p, 0, 3, h);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, p + 3, w, 2); g.fillRect(p + 3, 0, 2, h);
    }
  }, [(ROOM.x * 2) / 1.2, (ROOM.z * 2) / 1.2]);
  const floorMat = L({ map: floorTex, roughness: 0.42 });
  const floor = new T.Mesh(new T.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), floorMat);
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
  // 창유리: 아주 옅은 유리에 교실 빛이 살짝 비친다
  const glassMat = track(new T.MeshStandardMaterial({
    color: 0xe4f1ff, transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0, depthWrite: false, side: T.DoubleSide,
  }));
  for (const zc of WIN) {
    panel(blindTex, 2.86, 0.78, -ROOM.x + 0.1, 2.15, zc, Math.PI / 2, true);
    box(0.07, 0.07, 2.96, '#aab2bb', -ROOM.x + 0.1, 2.55, zc);
    const glass = new T.Mesh(new T.PlaneGeometry(2.96, 1.58), glassMat);
    glass.position.set(-ROOM.x + 0.03, 1.75, zc);
    glass.rotation.y = Math.PI / 2;
    glass.renderOrder = 1;
    scene.add(glass);
  }
  // 창 아래 수납장 (위에 우리 반 꽃 화분)
  const cabTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#d8b88a'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k += 1) { g.fillStyle = 'rgba(150,105,60,.12)'; g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 50, 2); }
    g.strokeStyle = '#a9824f'; g.lineWidth = 3;
    for (let i = 0; i < 2; i += 1) { g.strokeRect(6 + i * 128, 8, 116, h - 16); g.fillStyle = '#7a6a5a'; g.fillRect(i * 128 + (i ? 14 : 100), h / 2 - 12, 6, 24); }
  }, [(ROOM.z * 2 - 0.4) / 1.0, 1]);
  const sillLen = ROOM.z * 2 - 0.4;
  cast(box(0.45, 0.9, sillLen, '#cfae7e', -ROOM.x + 0.25, 0.45, 0));
  cast(box(0.5, 0.04, sillLen + 0.05, '#e9d3ab', -ROOM.x + 0.26, 0.92, 0));
  panel(cabTex, sillLen, 0.84, -ROOM.x + 0.485, 0.45, 0, Math.PI / 2, true);
  colliders.push({ x: -ROOM.x + 0.26, z: 0, hw: 0.26, hd: ROOM.z - 0.3 });
  ao(-ROOM.x + 0.26, 0, 0.56, sillLen + 0.1, 0.6);

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
  const yard = new T.Mesh(new T.PlaneGeometry(34, 26), L({ map: yardTex, roughness: 1 }));
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
    const m = new T.Mesh(new T.BoxGeometry(12, h, w), L({ map: aptTex, color: i % 2 ? 0xffffff : 0xf4f0ea }));
    scene.add(place(m, x, h / 2 - 1, z));
  });
  // 운동장 가의 나무들: 줄기 + 몽글몽글한 잎 덩어리 세 개 (모두 한 덩어리로 구워 한 번에 그린다)
  {
    const trunkG = cyl(0.17, 0.26, 1.8, 7);
    const crownG = new T.SphereGeometry(1, 12, 9);
    const greens = ['#6dbb7a', '#5aab6a', '#82c987', '#74b86c'];
    const items = [];
    for (let i = 0; i < 16; i += 1) {
      const x = -14 - Math.random() * 12;
      const z = -24 + Math.random() * 48;
      const s = 0.85 + Math.random() * 0.45;
      const c = greens[i % greens.length];
      items.push({ g: trunkG, p: [x, 0.9 * s, z], s: [s, s, s], c: '#9a6b45' });
      items.push({ g: crownG, p: [x, 2.75 * s, z], s: [1.45 * s, 1.3 * s, 1.45 * s], c });
      items.push({ g: crownG, p: [x + 0.75 * s, 2.3 * s, z + 0.35 * s], s: [1.0 * s, 0.9 * s, 1.0 * s], c: greens[(i + 1) % greens.length] });
      items.push({ g: crownG, p: [x - 0.55 * s, 3.3 * s, z - 0.3 * s], s: [0.95 * s, 0.85 * s, 0.95 * s], c: '#8fd08f' });
    }
    scene.add(new T.Mesh(bake(T, items), vmat));
    crownG.dispose();
    trunkG.dispose();
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
  // 칠판: 아이의 낙서 + 고마운 말 + 오른쪽 구석의 "우리 반 약속" (board.js). 낙서는 PNG 로 저장했다가 다시 불러온다.
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = BOARD_W;
  boardCanvas.height = BOARD_H;
  const boardTex = new T.CanvasTexture(boardCanvas);
  boardTex.colorSpace = T.SRGBColorSpace;
  boardTex.anisotropy = 4;
  const board = createBoard({ canvas: boardCanvas, rules: RULES, onChange: () => { boardTex.needsUpdate = true; } });
  board.compose();
  if (boardImage) {
    const img = new Image();
    img.onload = () => board.load(img);
    img.src = boardImage;
  }
  const drawBoard = (word) => board.setWord(word);
  box(4.5, 1.38, 0.06, '#d4d8dc', 0.1, 1.68, FZ + 0.03);
  // 칠판 면은 색 보정(톤 매핑)을 받지 않는다: 하얀 칠판이 회색으로 바래지 않고 낙서 색이 그대로 보인다
  const boardMesh = new T.Mesh(new T.PlaneGeometry(4.3, 1.17), new T.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  boardMesh.position.set(0.1, 1.68, FZ + 0.065);
  scene.add(boardMesh);
  // 낙서할 때 카메라가 서는 자리: 칠판 정면에서 칠판이 화면 가로를 거의 채우도록 (aspect: 화면 가로/세로, fov: 세로 시야각)
  const boardView = (aspect, fov) => {
    const half = Math.tan((fov * Math.PI) / 360) * aspect;
    const d = clamp(2.15 / (0.94 * half), 2.4, 9);
    return { pos: { x: 0.1, y: 1.68, z: FZ + 0.065 + d }, look: { x: 0.1, y: 1.68, z: FZ + 0.065 } };
  };
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
  cast(box(2.4, 2.4, 0.5, '#cba67a', -5.75, 1.2, FZ + 0.27));
  panel(tallTex, 2.4, 2.4, -5.75, 1.2, FZ + 0.53, 0, true);
  solid(-5.75, FZ + 0.27, 1.2, 0.27);
  ao(-5.75, FZ + 0.27, 2.5, 0.62, 0.6);

  // 선생님 책상과 의자 (앞쪽 왼쪽)
  const TD = { x: -4.9, z: -4.1 };
  cast(box(1.6, 0.05, 0.78, '#e4c79b', TD.x, 0.76, TD.z));
  cast(box(1.5, 0.7, 0.7, '#d1ae7e', TD.x, 0.35, TD.z));
  box(1.0, 0.5, 0.02, '#f3efe7', TD.x, 0.42, TD.z + 0.36);
  ao(TD.x, TD.z, 1.62, 0.84, 0.62);
  ao(TD.x, TD.z - 0.95, 0.5, 0.5, 0.35, true);
  bakedMesh([
    { g: bg(0.42, 0.02, 0.3), p: [-0.4, 0.795, 0.0], c: '#cfd3d8' },
    { g: bg(0.42, 0.28, 0.015), p: [-0.4, 0.935, -0.14], r: [-0.25, 0, 0], c: '#2b2f38' },
    { g: bg(0.1, 0.1, 0.1), p: [0.55, 0.84, 0.1], c: '#ffffff' },
    { g: bg(0.09, 0.14, 0.09), p: [0.7, 0.87, -0.15], c: '#ff8fab' },
    { g: bg(0.24, 0.03, 0.32), p: [0.15, 0.795, 0.0], c: '#8ecae6' },
  ], scene, TD.x, 0, TD.z).userData.cast = true;
  const tchair = new T.Group();
  box(0.5, 0.06, 0.5, '#4d6a9e', 0, 0.48, 0, tchair);
  box(0.46, 0.5, 0.06, '#4d6a9e', 0, 0.78, -0.24, tchair);
  tchair.add(place(new T.Mesh(cyl(0.025, 0.025, 0.46), M('#8e99a4')), 0, 0.23, 0));
  box(0.5, 0.04, 0.5, '#8e99a4', 0, 0.02, 0, tchair);
  scene.add(cast(place(tchair, TD.x, 0, TD.z - 0.95)));
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
  const leafFace = new T.Mesh(new T.PlaneGeometry(1.15, 2.1), L({ map: doorTex }));
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
  cast(box(LKW, 1.5, 0.46, '#d9c7a1', LKX, 0.75, BZ - 0.24));
  cast(box(LKW + 0.06, 0.04, 0.5, '#eadbb9', LKX, 1.52, BZ - 0.24));
  panel(lockerTex, LKW, 1.46, LKX, 0.75, BZ - 0.48, Math.PI, true);
  solid(LKX, BZ - 0.24, LKW / 2, 0.24);
  ao(LKX, BZ - 0.24, LKW + 0.1, 0.6, 0.62);
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
  for (const sx of [-1, 1]) cast(box(0.05, 2.1, 0.36, '#d9b98a', BKX + sx * (BKW / 2 - 0.02), 1.05, BZ - 0.2));
  const levels = [0.08, 0.55, 1.0, 1.45, 1.9];
  for (const y of levels) cast(box(BKW, 0.04, 0.36, '#e3c799', BKX, y, BZ - 0.2));
  ao(BKX, BZ - 0.2, BKW + 0.1, 0.5, 0.55);
  const BOOKN = 4 * 30;
  const books = cast(new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), track(new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 })), BOOKN));
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
  // 투명 칸막이: 맑은 유리처럼 교실 빛이 비친다
  const partMat = track(new T.MeshStandardMaterial({
    color: 0xe0efff, vertexColors: true, transparent: true, opacity: 0.17, roughness: 0.06, metalness: 0, side: T.DoubleSide, depthWrite: false,
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
      scene.add(cast(place(new T.Mesh(deskBase, vmat), cx, 0, rz)));
      scene.add(cast(place(new T.Mesh(itemSets[(ri + ci) % 3], vmat), cx, 0, rz)));
      const part = place(new T.Mesh(partGeo, partMat), cx, 0, rz);
      part.renderOrder = 2;
      scene.add(part);
      scene.add(cast(place(new T.Mesh(chairGeo, vmat), cx, 0, rz + 0.75)));
      ao(cx, rz, 0.82, 0.62, 0.48);
      ao(cx, rz + 0.75, 0.48, 0.46, 0.3);
      solid(cx, rz + 0.34, 0.4, 0.66);
      seats.push({ kind: 'chair', x: cx, z: rz + 0.75, rot: Math.PI, approach: { x: cx, z: rz + 1.62 }, taken: false });
      if ((ri * 5 + ci) % 3 === 1) {
        const bagM = cast(new T.Mesh(bagGeos[(ri + ci * 2) % bagGeos.length], vmat));
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
  const rug = new T.Mesh(new T.CircleGeometry(2.0, 48), L({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(RUG.x, 0.02, RUG.z);
  scene.add(rug);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const cx = RUG.x + Math.cos(a) * 1.5;
    const cz = RUG.z + Math.sin(a) * 1.5;
    const cu = cast(new T.Mesh(new T.SphereGeometry(0.3, 18, 12), M([0xff8fab, 0x90e0ef, 0xffd166, 0xb5e48c, 0xc7a6ff, 0xffa07a][i], { roughness: 0.95 })));
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
    parent.add(place(cast(g), x, onFloor ? 0 : 0.94, z));
    if (onFloor) {
      colliders.push({ x, z, r: 0.32 * scale });
      ao(x, z, 0.7 * scale, 0.7 * scale, 0.5, true);
    }
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

  // ── 마무리: 바닥 그늘(AO) 굽기, 벽 모서리 그늘, 그림자 표시 ──
  // 바닥 그늘: 벽 가장자리와 가구 밑을 부드럽게 어둡게 그린 그림을 바닥의 aoMap 으로 쓴다 (그리는 비용 없음)
  {
    const AW = 1024;
    const AH = Math.round((AW * ROOM.z) / ROOM.x);
    const ppm = AW / (ROOM.x * 2); // 1m 당 픽셀. 그림의 위쪽이 앞벽(-z), 왼쪽이 창문 벽(-x)
    const aoTex = canvasTex(AW, AH, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      const E = 0.55 * ppm;
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [0, 0, 0, E, 0, 0, w, E], [0, h, 0, h - E, 0, h - E, w, E], [0, 0, E, 0, 0, 0, E, h], [w, 0, w - E, 0, w - E, 0, E, h],
      ]) {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(0,0,0,.4)');
        gr.addColorStop(0.35, 'rgba(0,0,0,.14)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(rx, ry, rw, rh);
      }
      // 가구 밑: 그림 밖에 그린 모양의 흐린 그림자만 그림 안에 떨어지게 한다 (shadowBlur 는 어느 브라우저나 된다)
      const OFF = w * 3;
      for (const s of aoSpots) {
        const cx = (s.x + ROOM.x) * ppm;
        const cy = (s.z + ROOM.z) * ppm;
        const sw = s.w * ppm * 0.86;
        const sd = s.d * ppm * 0.86;
        g.save();
        g.shadowColor = `rgba(0,0,0,${s.k})`;
        g.shadowBlur = clamp(Math.min(sw, sd) * 0.4, 6, 40);
        g.shadowOffsetX = OFF;
        g.fillStyle = '#000000';
        if (s.round) {
          g.beginPath();
          g.ellipse(cx - OFF, cy, sw / 2.4, sd / 2.4, 0, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillRect(cx - OFF - sw / 2, cy - sd / 2, sw, sd);
        }
        g.restore();
      }
    });
    aoTex.colorSpace = T.NoColorSpace; // 밝기 값 그대로 쓴다
    floorMat.aoMap = aoTex;
    floorMat.aoMapIntensity = 1;
    floorMat.needsUpdate = true;
  }
  // 벽 모서리 그늘: 바닥·천장과 만나는 곳이 살짝 어둡다 (옅은 그러데이션 띠)
  {
    const aoGrad = canvasTex(8, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.4, 'rgba(255,255,255,.38)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    const aoMat = (k) => track(new T.MeshBasicMaterial({ color: 0x2e2216, map: aoGrad, transparent: true, opacity: k, depthWrite: false }));
    const low = aoMat(0.2);
    const high = aoMat(0.13);
    const strip = (mat, w, h, x, y, z, rx, ry, rz) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.renderOrder = 1;
      scene.add(m);
    };
    const BH = 0.38; // 바닥 쪽 띠 높이
    const TH = 0.5; // 천장 쪽 띠 높이
    const e = 0.068; // 걸레받이 바로 앞
    // 앞벽·뒷벽
    for (const [zz, ry] of [[-ROOM.z + e, 0], [ROOM.z - e, Math.PI]]) {
      strip(low, ROOM.x * 2, BH, 0, BH / 2, zz, 0, ry, 0);
      strip(high, ROOM.x * 2, TH, 0, ROOM.h - TH / 2, zz * 0.999, 0, ry, Math.PI);
    }
    // 오른쪽 벽 (문 자리는 비운다)
    for (const [a, b] of [[-ROOM.z, DZ - 0.6], [DZ + 0.6, ROOM.z]]) {
      strip(low, b - a, BH, ROOM.x - e, BH / 2, (a + b) / 2, 0, -Math.PI / 2, 0);
      strip(high, b - a, TH, ROOM.x - e * 0.999, ROOM.h - TH / 2, (a + b) / 2, 0, -Math.PI / 2, Math.PI);
    }
    // 창문 벽 위쪽
    strip(high, ROOM.z * 2, TH, -ROOM.x + 0.02, ROOM.h - TH / 2, 0, 0, Math.PI / 2, Math.PI);
    // 천장 가장자리
    const ch = ROOM.h - 0.004;
    strip(high, ROOM.x * 2, TH, 0, ch, -ROOM.z + TH / 2, Math.PI / 2, 0, 0);
    strip(high, ROOM.x * 2, TH, 0, ch, ROOM.z - TH / 2, Math.PI / 2, 0, Math.PI);
    strip(high, ROOM.z * 2, TH, -ROOM.x + TH / 2, ch, 0, Math.PI / 2, 0, -Math.PI / 2);
    strip(high, ROOM.z * 2, TH, ROOM.x - TH / 2, ch, 0, Math.PI / 2, 0, Math.PI / 2);
  }
  // 그림자: 가구(cast 표시)만 햇빛 그림자를 드리우고, 교실 안의 빛 받는 물건은 모두 그림자를 받는다.
  //  사람·토끼는 나중에 만들어져 여기서 빠진다 (발밑 둥근 그림자, 늘 햇빛을 받아 또렷하게 보인다)
  {
    scene.updateMatrixWorld(true);
    const c = new T.Vector3();
    scene.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial || o.material.transparent) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      c.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const inside = Math.abs(c.x) < ROOM.x + 1 && Math.abs(c.z) < ROOM.z + 1 && c.y < ROOM.h + 0.5;
      o.receiveShadow = inside;
      o.castShadow = inside && Boolean(o.userData.cast);
    });
  }

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
      mis: null, aux: null, cool: 0, cheer: 0, warn: null, // 말썽 부리는 중 / 말썽에 얽힘(놀림받는 친구·타이르는 선생님) / 다시 말썽 부리기까지 쉬는 때 / 기뻐서 손 흔드는 시간
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
    let pose = '';
    let mood = '';

    // 말썽 부리는 친구는 제 할 일에 바쁘고, 놀림받는 친구와 타이르는 선생님은 그 곁을 지킨다
    if (n.mis && !n.mis.over) {
      const r = misStep(n, t, dt, pp, dP);
      ({ moving, pose, mood, gesture } = r);
    } else if (n.aux) {
      const r = auxStep(n, t, dt);
      ({ moving, pose, mood, gesture } = r);
    } else if (n.state === 'sit') { // 가까이 온 아이에게 인사한다 (걷던 길은 잠깐 멈춘다)
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

    // 기뻐서 손을 흔든다 (타이름을 듣고 난 뒤)
    if (n.cheer > 0) { n.cheer -= dt; waveOn = true; }

    // 몸짓: 뛰기(run)는 팔다리를 크게 흔들며 앞으로 숙이고, 발 구르기(stomp)는 제자리에서, 장난(poke)은 팔을 쭉 뻗고, 팔짱(cross)은 팔을 접는다
    const running = pose === 'run';
    const stomp = pose === 'stomp';
    n.speed01 = damp(n.speed01, moving ? 1 : stomp ? 0.55 : 0, 8, dt);
    const freq = stomp ? 9 : 6 + n.speed * 2;
    const sw = Math.sin(t * freq + n.phase) * (running ? 1.05 : stomp ? 0.5 : 0.7) * n.speed01;
    if (!u.sit) {
      kit.limbs(g, sw, n.speed01);
      if (gesture) u.armL.rotation.x += Math.sin(t * 3 + n.phase) * 0.3;
      if (pose === 'cross') { u.armL.rotation.x = -0.85; u.elbowL.rotation.x = -1.7; }
      u.body.position.y = u.baseY + Math.abs(Math.sin(t * freq + n.phase)) * (running ? 0.075 : 0.035) * n.speed01 + Math.sin(t * 1.6 + n.phase) * 0.01;
    } else u.body.position.y = u.baseY + Math.sin(t * 1.6 + n.phase) * 0.012;
    u.body.rotation.x = damp(u.body.rotation.x, running ? 0.2 : 0, 8, dt);
    u.body.rotation.z = stomp ? Math.sin(t * 17) * 0.05 : damp(u.body.rotation.z, 0, 8, dt);
    u.head.rotation.x = damp(u.head.rotation.x, pose === 'listen' ? 0.34 : 0, 6, dt); // 타이름을 듣는 동안 고개를 숙인다
    let armRz = REST_Z;
    let armRx = u.sit ? -0.7 : sw * 0.9;
    let elbowR = u.sit ? -0.95 : u.elbowR.rotation.x;
    if (waveOn) { armRz = 2.4 + Math.sin(t * 9) * 0.35; elbowR = -0.5 + Math.sin(t * 9) * 0.25; }
    else if (pose === 'poke') { armRz = 0.25; armRx = -1.35 + Math.sin(t * 12) * 0.4; elbowR = -0.3; }
    else if (pose === 'cross') { armRx = -0.85; elbowR = -1.7; }
    else if (stomp) { armRz = 0.55; armRx = -0.25; elbowR = -1.2; }
    else if (write) { armRz = 2.1 + Math.sin(t * 4) * 0.12; armRx = 0.3; elbowR = -0.4; } else if (gesture) { armRx = -0.9 + Math.sin(t * 3.4 + n.phase) * 0.35; elbowR = -0.9; }
    u.armR.rotation.z = damp(u.armR.rotation.z, armRz, 9, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, armRx, 9, dt);
    u.elbowR.rotation.x = damp(u.elbowR.rotation.x, elbowR, 9, dt);
    kit.face(g, t, mood === 'angry' ? 'angry' : (mood === 'happy' || waveOn || gesture === 1));
    n.wave = waveOn ? 1 : 0;
  }

  function arrive(n) {
    if (n.doing === 'sit' && n.pendingSeat) { const s = n.pendingSeat; n.pendingSeat = null; sitDown(n, s); return; }
    if (n.doing === 'chat' && n.partner) { n.state = 'chat'; n.t = 0; n.dur = rand(5, 9); return; }
    n.state = 'idle';
    n.t = 0;
    n.dur = n.doing === 'write' ? rand(7, 12) : n.doing === 'gaze' ? rand(5, 10) : n.doing === 'look' ? rand(2, 4) : rand(2, 6);
  }

  // ── 말썽 친구: 약속(rules.js)을 어기는 친구를 찾아 다정하게 타이르면 별을 받는다 ──
  //  n.mis: 말썽 부리는 친구 { type, rule, over, caught, victim, teacher, phase … }
  //  n.aux: 말썽에 얽힌 친구 { role: 'victim'(놀림받는 친구) | 'teacher'(타이르러 온 선생님), with: 말썽꾼 }
  //  마음 쉼터가 시작되면 world.js 가 mis.setOn(true) 로 켜고, 걸어 다닌 시간(elapsed)을 알려 주며 일정에 따라 하나씩 나타난다.
  const RUN_SPEED = 3.2;
  const MIS_MAX = 5; // 한 번의 쉼터에서 나타나는 말썽 수
  const MIS_LIFE = 80; // 아무도 타이르지 않으면 이만큼(걸어 다닌 초) 뒤에 제풀에 그친다
  const hooks = { say: null }; // world.js 가 말풍선을 띄우려고 건다: (친구, 글) => void
  const speak = (n, text) => { if (hooks.say) hooks.say(n, text); };
  const sched = { on: false, at: 12, spawned: 0, fixed: 0, missed: 0, fails: 0, order: [] };
  const nowSec = () => performance.now() / 1000;
  const gdist = (a, b) => Math.hypot(a.group.position.x - b.group.position.x, a.group.position.z - b.group.position.z);

  function stepAlong(n, dt, speed) { // 길을 따라 한 걸음. 움직였으면 true
    const p = n.group.position;
    const tgt = n.path[0];
    if (!tgt) return false;
    const dx = tgt.x - p.x;
    const dz = tgt.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) { n.path.shift(); return false; }
    const step = Math.min(d, speed * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    faceTo(n.group, tgt.x, tgt.z, 10, dt);
    return true;
  }
  function repath(n, x, z) {
    n.path = nav.path(n.group.position, { x, z });
    n.stuck = 0; n.lastX = n.group.position.x; n.lastZ = n.group.position.z;
  }
  function unstick(n, dt, onStuck) { // 한참 못 움직이면 알려 준다
    n.stuck += dt;
    if (n.stuck > 1.3) {
      const p = n.group.position;
      if (Math.hypot(p.x - n.lastX, p.z - n.lastZ) < 0.25) onStuck();
      n.stuck = 0; n.lastX = p.x; n.lastZ = p.z;
    }
  }
  // 하던 일(앉으러 가기, 수다, 앉아 있기)을 그만두고 선 채로 시작한다
  function freeUp(n) {
    if (n.pendingSeat) { n.pendingSeat.taken = false; n.pendingSeat = null; }
    if (n.partner) { if (n.partner.partner === n) n.partner.partner = null; n.partner = null; }
    if (n.state === 'sit') standUp(n);
    n.path = []; n.state = 'idle'; n.t = 0; n.dur = 1; n.doing = 'idle'; n.face = null;
  }
  function calm(n, sec = 1.5) { n.aux = null; n.state = 'idle'; n.t = 0; n.dur = sec + rand(0, 1); n.doing = 'idle'; n.path = []; n.face = null; }

  // 머리 위의 빨간 느낌표 배지와 발밑의 빨간 동그라미: 멀리서도 눈에 띈다
  const warnTexes = {};
  const warnTex = (icon) => {
    if (!warnTexes[icon]) {
      warnTexes[icon] = canvasTex(128, 128, (g) => {
        g.fillStyle = '#ff5a4f';
        g.beginPath(); g.arc(62, 66, 50, 0, 7); g.fill();
        g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke();
        g.font = '60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
        g.fillText(icon, 62, 70);
        g.fillStyle = '#ffd23f';
        g.beginPath(); g.arc(106, 24, 20, 0, 7); g.fill();
        g.lineWidth = 4; g.strokeStyle = '#2b2d42'; g.stroke();
        g.fillStyle = '#2b2d42'; g.font = '700 28px sans-serif';
        g.fillText('!', 106, 27);
      });
    }
    return warnTexes[icon];
  };
  function addWarn(n, rule) {
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: warnTex(rule.icon), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    sprite.scale.set(0.62, 0.62, 1);
    sprite.position.set(0, 2.78, 0);
    sprite.renderOrder = 20;
    const ring = new T.Mesh(
      new T.RingGeometry(0.62, 0.82, 40),
      new T.MeshBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    n.group.add(sprite, ring);
    n.warn = { sprite, ring };
  }
  function dropWarn(n) {
    if (!n.warn) return;
    n.group.remove(n.warn.sprite, n.warn.ring);
    n.warn.ring.geometry.dispose();
    n.warn.ring.material.dispose();
    n.warn.sprite.material.dispose(); // 그림(map)은 모양마다 한 번 만들어 돌려 쓰니 치우지 않는다
    n.warn = null;
  }

  function runTo(n, pp) { // 뛰는 친구는 아이 가까이를 이리저리 뛰어서 쫓아갈 만하다
    const pool = [...NAV.free, ...NAV.aisle];
    const ring = pool.filter(([x, z]) => { const d = Math.hypot(x - pp.x, z - pp.z); return d > 2.2 && d < 6.5; });
    const [x, z] = pick(ring.length ? ring : pool);
    repath(n, x, z);
  }

  function misStep(n, t, dt, pp) {
    const m = n.mis;
    const g = n.group;
    const p = g.position;
    const u = g.userData;
    const r = { moving: false, pose: '', mood: '', gesture: 0 };
    u.head.rotation.y = damp(u.head.rotation.y, 0, 4, dt);
    if (m.caught) { // 누가 말을 걸어 주고 있다: 서서 듣는다
      faceTo(g, pp.x, pp.z, 6, dt);
      r.pose = 'listen';
      return r;
    }
    const lines = () => { if (t > m.sayAt) { speak(n, pick(m.rule.lines)); m.sayAt = t + rand(4.5, 7); } };
    if (m.type === 'run') {
      r.mood = 'happy';
      if (m.rest > 0) {
        m.rest -= dt;
        if (m.rest <= 0) runTo(n, pp);
      } else if (!n.path.length) runTo(n, pp);
      else {
        r.moving = stepAlong(n, dt, RUN_SPEED);
        r.pose = 'run';
        if (!n.path.length) m.rest = rand(0.9, 1.7);
        unstick(n, dt, () => { n.path = []; m.rest = 0.2; });
      }
      lines();
    } else if (m.type === 'bad') {
      r.mood = 'angry';
      r.pose = 'stomp';
      u.head.rotation.y = damp(u.head.rotation.y, Math.sin(t * 5 + n.phase) * 0.4, 6, dt);
      lines();
    } else if (m.type === 'tease') {
      const v = m.victim;
      if (!v || !v.aux || v.aux.with !== n) { endMis(n, 'missed'); return r; }
      r.mood = 'happy';
      faceTo(g, v.group.position.x, v.group.position.z, 8, dt);
      if (m.phase === 'go') {
        r.moving = stepAlong(n, dt, 2.1);
        if (!n.path.length && gdist(n, v) > 1.25) repath(n, m.spot.x, m.spot.z);
        if (gdist(n, v) < 1.2) { m.phase = 'poke'; n.path = []; }
        unstick(n, dt, () => { m.phase = 'poke'; n.path = []; });
      } else {
        r.pose = 'poke';
        lines();
        if (t > m.vSayAt) { speak(v, pick(m.rule.victimLines)); m.vSayAt = t + rand(6, 9); }
      }
    } else if (m.type === 'ignore') {
      const tc = m.teacher;
      if (!tc || !tc.aux || tc.aux.with !== n) { endMis(n, 'missed'); return r; }
      if (m.phase === 'go') {
        r.moving = stepAlong(n, dt, 1.3);
        if (!n.path.length) m.phase = 'stand';
        unstick(n, dt, () => { m.phase = 'stand'; n.path = []; });
      } else { // 선생님을 등지고 팔짱을 낀 채 고개를 젓는다
        r.pose = 'cross';
        const away = Math.atan2(p.x - tc.group.position.x, p.z - tc.group.position.z);
        g.rotation.y += angleDelta(g.rotation.y, away) * (1 - Math.exp(-4 * dt));
        u.head.rotation.y = damp(u.head.rotation.y, Math.sin(t * 2.2 + n.phase) * 0.5, 5, dt);
        lines();
      }
    }
    return r;
  }

  function auxStep(n, t, dt) {
    const a = n.aux;
    const o = a.with;
    const g = n.group;
    const u = g.userData;
    const r = { moving: false, pose: '', mood: '', gesture: 0 };
    if (!o.mis || o.mis.over) { calm(n); return r; }
    u.head.rotation.y = damp(u.head.rotation.y, 0, 4, dt);
    if (a.role === 'victim') { // 놀림받는 친구는 그 자리에서 싫은 표정으로 상대를 본다
      faceTo(g, o.group.position.x, o.group.position.z, 5, dt);
      r.mood = 'angry';
      return r;
    }
    if (a.phase === 'go') { // 선생님이 말썽 친구에게 다가간다
      r.moving = stepAlong(n, dt, 1.6);
      if (!n.path.length) { if (Math.hypot(g.position.x - a.spot.x, g.position.z - a.spot.z) < 0.6) a.phase = 'talk'; else repath(n, a.spot.x, a.spot.z); }
      unstick(n, dt, () => { a.phase = 'talk'; n.path = []; });
    } else {
      faceTo(g, o.group.position.x, o.group.position.z, 5, dt);
      r.gesture = 1;
      if (t > a.sayAt) { speak(n, pick(o.mis.rule.teacherLines)); a.sayAt = t + rand(5.5, 8); }
    }
    return r;
  }

  function endMis(n, how) {
    const m = n.mis;
    if (!m || m.over) return;
    m.over = true;
    dropWarn(n);
    n.speed = m.speed0;
    n.cool = nowSec() + 150;
    for (const o of [m.victim, m.teacher]) if (o) calm(o);
    n.mis = null;
    calm(n, how === 'fixed' ? 2 : 0.8);
    if (how === 'missed') sched.missed += 1;
  }

  // 말썽 시작: 앉아 있거나 이야기하던 친구를 일으켜 세워서 시작한다. 시작할 수 없으면 false
  function startMis(n, type, elapsed) {
    const rule = ruleOf(type);
    const m = { type, rule, until: elapsed + MIS_LIFE, over: false, caught: false, sayAt: 0, vSayAt: 0, rest: 0, phase: 'go', victim: null, teacher: null, speed0: n.speed, spot: null };
    if (type === 'tease') {
      const v = crowd.filter((c) => c !== n && c.role === 'friend' && !c.mis && !c.aux && c.state !== 'sit' && c.state !== 'greet').sort((a, b) => gdist(a, n) - gdist(b, n))[0];
      if (!v) return false;
      freeUp(v);
      v.aux = { role: 'victim', with: n };
      m.victim = v;
      const dx = n.group.position.x - v.group.position.x;
      const dz = n.group.position.z - v.group.position.z;
      const d = Math.hypot(dx, dz) || 1;
      m.spot = nav.snap(v.group.position.x + (dx / d) * 0.95, v.group.position.z + (dz / d) * 0.95);
    }
    if (type === 'ignore') {
      const tc = crowd.find((c) => c.role === 'teacher' && !c.mis && !c.aux);
      if (!tc) return false;
      freeUp(tc);
      const stand = nav.snap(...pick(NAV.free));
      const near = nav.snap(stand.x, stand.z + 1.3);
      tc.aux = { role: 'teacher', with: n, phase: 'go', spot: near, sayAt: 0 };
      repath(tc, near.x, near.z);
      m.teacher = tc;
      m.stand = stand;
    }
    freeUp(n);
    n.mis = m;
    if (type === 'run') n.speed = RUN_SPEED;
    if (type === 'ignore') repath(n, m.stand.x, m.stand.z);
    if (type === 'tease') repath(n, m.spot.x, m.spot.z);
    addWarn(n, rule);
    return true;
  }

  function spawnOne(elapsed, pPos) {
    const now = nowSec();
    const at = sched.spawned % sched.order.length;
    const types = sched.order.slice(at).concat(sched.order.slice(0, at));
    // 아이에게서 멀리 있는 친구부터 (찾는 재미). 마땅한 친구가 없으면 조금씩 가까운 친구도 고른다 (타이르는 창이 바로 열리지 않을 만큼은 떨어져 있게)
    const minD = Math.max(2.7, 3.4 - sched.fails * 0.35);
    const cands = crowd.filter((c) => c.role === 'friend' && !c.mis && !c.aux && now >= c.cool && Math.hypot(c.group.position.x - pPos.x, c.group.position.z - pPos.z) > minD).sort(() => Math.random() - 0.5);
    for (const type of types) {
      for (const n of cands) if (startMis(n, type, elapsed)) return true;
    }
    return false;
  }

  const mis = {
    setOn(on) {
      sched.on = on;
      if (on && !sched.order.length) sched.order = RULES.map((r) => r.id).sort(() => Math.random() - 0.5).concat([pick(RULES).id]);
    },
    // elapsed: 쉼터에서 걸어 다닌 초 (타이르거나 낙서하는 동안은 흐르지 않는다), pPos: 아이의 위치
    update(elapsed, pPos) {
      if (!sched.on) return;
      for (const n of crowd) if (n.mis && !n.mis.over && elapsed > n.mis.until) endMis(n, 'missed');
      if (sched.spawned >= MIS_MAX || elapsed < sched.at) return;
      if (crowd.filter((n) => n.mis && !n.mis.over).length >= 2) { sched.at = elapsed + 5; return; }
      if (spawnOne(elapsed, pPos)) { sched.spawned += 1; sched.fails = 0; sched.at = elapsed + rand(34, 50); } else { sched.fails += 1; sched.at = elapsed + 6; }
    },
    active: () => crowd.filter((n) => n.mis && !n.mis.over),
    hold(n, on) { if (n.mis && !n.mis.over) n.mis.caught = on; },
    // 타이르기에 성공: 친구가 사과하고 제자리로 돌아간다. 돌려주는 값은 그 약속
    fix(n) {
      const m = n.mis;
      if (!m || m.over) return null;
      const rule = m.rule;
      const type = m.type;
      endMis(n, 'fixed');
      sched.fixed += 1;
      speak(n, rule.apology);
      n.cheer = 2.4;
      if (type === 'ignore' || type === 'run') { // 선생님 말씀을 들으러 자리에 앉는다
        const seat = seats.find((s) => s.kind === 'chair' && !s.taken);
        if (seat) { seat.taken = true; n.pendingSeat = seat; walkTo(n, seat.approach, 'sit', null); }
      }
      return rule;
    },
    stats: sched,
  };

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
  // 아이콘 배지: 하얀 동그라미 위에 그림 글자 (멀리서도 잘 보이게 테두리와 그림자)
  const iconTex = (icon) => canvasTex(192, 192, (g) => {
    g.fillStyle = 'rgba(43,45,66,.22)';
    g.beginPath(); g.arc(96, 104, 78, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(96, 96, 78, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#2b2d42'; g.stroke();
    g.font = '96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, 96, 104);
  });
  // 바닥 동그라미: 가장자리는 또렷한 띠, 안쪽은 은은하게 빛난다 (점선이 천천히 돈다)
  const ringTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const glow = g.createRadialGradient(c, c, c * 0.55, c, c, c * 0.97);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(1, 'rgba(255,255,255,.4)');
    g.fillStyle = glow;
    g.beginPath(); g.arc(c, c, c * 0.97, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 12;
    g.beginPath(); g.arc(c, c, c * 0.9, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 7;
    for (let i = 0; i < 24; i += 1) {
      g.beginPath(); g.arc(c, c, c * 0.76, (i / 24) * Math.PI * 2, (i / 24 + 0.022) * Math.PI * 2); g.stroke();
    }
  });
  // 빛기둥: 가운데가 밝고 가장자리·위쪽으로 갈수록 스르르 사라진다 (위로 흐르는 빛결)
  const beamMat = () => track(new T.ShaderMaterial({
    uniforms: { color: { value: new T.Color(0xfff0a0) }, opacity: { value: 0.5 }, time: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = uv.y; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; uniform float time; varying vec3 vN; varying vec3 vV; varying float vY; void main() { float face = abs(dot(normalize(vN), normalize(vV))); float core = face * face; float fade = pow(1.0 - vY, 1.6) * smoothstep(0.0, 0.06, vY); float flow = 0.8 + 0.2 * sin(vY * 26.0 - time * 2.6); gl_FragColor = vec4(color * core * fade * flow * opacity, 1.0); }',
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
  }));
  const markers = {};
  for (const [id, s] of Object.entries(stops)) {
    const ring = new T.Mesh(
      new T.PlaneGeometry(s.r * 2.1, s.r * 2.1),
      new T.MeshBasicMaterial({ map: ringTex, color: 0x7be0a4, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.035, s.z);
    ring.renderOrder = 1;
    scene.add(ring);
    const icon = new T.Sprite(new T.SpriteMaterial({ map: iconTex({ window: '👀', rug: '🌬️', board: '✏️' }[id]), transparent: true, depthWrite: false, toneMapped: false }));
    icon.scale.set(0.62, 0.62, 1);
    icon.position.set(s.x, 2.3, s.z);
    scene.add(icon);
    // 멀리서도 보이는 빛기둥: 아직 못 받은 별 자리만 환하게 서 있다
    const pillar = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, 3.1, 28, 1, true), beamMat());
    pillar.position.set(s.x, 1.55, s.z);
    pillar.renderOrder = 3;
    scene.add(pillar);
    markers[id] = { ring, icon, pillar, base: 2.3 };
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
        g.visible = !hiding;
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

  // 칠판에 낙서하는 동안은 사람들이 카메라 앞을 가리지 않게 모두 숨긴다
  let hiding = false;
  const setDrawMode = (on) => {
    hiding = on;
    player.visible = !on;
    bunny.group.visible = !on;
    dust.visible = !on; // 칠판 바로 앞을 떠다니는 먼지가 얼룩처럼 보이지 않게
    for (const n of crowd) n.group.visible = !on;
    for (const p of peers.values()) p.group.visible = !on;
  };

  // 이름표 크기: 멀리서는 원래 크기, 내 캐릭터까지의 거리(약 5m)보다 가까우면 거리에 맞춰 줄여 화면에서 더 커지지 않고,
  //  아주 가까우면 흐려진다 (가까이 온 친구의 이름표가 화면을 덮지 않게)
  const tagPos = new T.Vector3();
  const fitTag = (ch) => {
    const tg = ch.userData.tag;
    if (!tg) return;
    tg.getWorldPosition(tagPos);
    const d = camera.position.distanceTo(tagPos);
    const k = clamp(d / 5, 0.3, 1);
    const [bw, bh] = tg.userData.base;
    tg.scale.set(bw * k, bh * k, 1);
    tg.material.opacity = clamp((d - 1.2) / 1.6, 0, 1);
  };
  // 카메라가 사람 몸 안이나 머리 바로 앞에 있다 (그 사람을 잠깐 숨겨 화면을 가리지 않게)
  const camInside = (g) => {
    const s = g.scale.y;
    const dx = camera.position.x - g.position.x;
    const dz = camera.position.z - g.position.z;
    const dy = camera.position.y - g.position.y;
    if (dy > -0.2 && dy < 2.0 * s && Math.hypot(dx, dz) < 0.55 * g.scale.x) return true;
    return Math.hypot(dx, dy - 1.2 * s, dz) < 1.25;
  };

  return {
    scene, camera, player, colliders, stops, bunny, drawBoard, npcs: crowd, peers, syncPeers, grade, nav, halls, view,
    board, boardMesh, boardView, setDrawMode, mis, hooks,
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
      if (!st.drawing) for (const n of crowd) brain(n, t, dt, humans); // 칠판에 낙서하는 동안은 교실이 멈춰 있다
      for (const n of crowd) {
        if (!n.warn) continue; // eslint-disable-line no-continue
        n.warn.sprite.position.y = 2.78 + Math.sin(t * 5 + n.phase) * 0.08;
        const k = 1 + Math.sin(t * 5 + n.phase) * 0.08;
        n.warn.sprite.scale.set(0.62 * k, 0.62 * k, 1);
        n.warn.ring.material.opacity = 0.5 + Math.sin(t * 4 + n.phase) * 0.22;
        n.warn.sprite.material.opacity = clamp((camera.position.distanceTo(n.group.position) - 1.6) / 1.8, 0, 1); // 카메라에 너무 가까우면 가린다
      }
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
        m.ring.material.color.setHex(doneIt ? 0xffd75e : 0x6fdc9c);
        m.ring.material.opacity = (doneIt ? 0.5 : 0.75) + Math.sin(t * 2.2) * 0.15;
        const sc = 1 + Math.sin(t * 2.2) * 0.025;
        m.ring.scale.set(sc, sc, 1);
        m.ring.rotation.z = t * 0.22;
        m.icon.position.y = m.base + Math.sin(t * 1.8) * 0.1;
        m.icon.material.opacity = clamp((camera.position.distanceTo(m.icon.position) - 1.2) / 1.6, 0, 1);
        m.ring.visible = !hiding; // 칠판에 낙서하는 동안은 별 자리 표시가 칠판을 가리지 않게 숨긴다
        m.icon.visible = !hiding;
        m.pillar.visible = !doneIt && !hiding;
        // 카메라가 기둥 안이나 바로 곁에 있으면 화면이 하얘지니 흐리게 한다
        const near = Math.hypot(camera.position.x - stops[id].x, camera.position.z - stops[id].z);
        m.pillar.material.uniforms.opacity.value = (0.3 + Math.sin(t * 2.2 + 1) * 0.08) * clamp((near - 1.6) / 3, 0, 1);
        m.pillar.material.uniforms.time.value = t;
        if (doneIt && m.icon.material.map !== doneStarTex) { m.icon.material.map = doneStarTex; m.icon.material.needsUpdate = true; }
      }
      // 이름표: 카메라에 가까워지면 작아지고 흐려져서 화면을 가리지 않는다.
      // 카메라가 사람 몸 안까지 들어가면 그 사람은 잠깐 숨긴다 (머리 속이 화면을 덮지 않게)
      fitTag(player);
      for (const n of crowd) { fitTag(n.group); n.group.visible = !hiding && !camInside(n.group); }
      for (const p of peers.values()) { fitTag(p.group); p.group.visible = !hiding && !camInside(p.group); }
    },
    dispose() {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      tb.dispose();
      if (envRT) envRT.dispose();
      if (sun.shadow.map) sun.shadow.map.dispose();
    },
  };
}
