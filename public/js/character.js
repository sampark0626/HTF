// 마음 쉼터의 캐릭터 공장: 외모(look)만 주면 제페토 같은 3D 아바타를 만든다.
//  - 큰 둥근 머리 + 반짝이는 큰 눈(깜빡이고 웃는다) + 볼터치, 윤기 나는 머리카락, 가느다란 몸에 후드·스니커즈
//  - 파츠를 색깔 달린 하나의 덩어리로 합쳐서(bake) 한 사람이 그리는 횟수를 15번 안팎으로 줄였다
//  - 쉼터와 부모님의 미리보기(교실 꾸미기 창)가 함께 쓴다
import { clamp, damp, rand } from './world-shared.js';

const THREE_URL = '/vendor/three/three.module.js';
let threePromise = null;
export const loadThree = () => { threePromise ||= import(THREE_URL); return threePromise; };

// ────────────────────────────────────────────────────────────────
// 재료 상자: 색 재질과 캔버스 그림을 한 곳에서 만들고 한꺼번에 치운다
export function toolbox(T) {
  const mats = new Map();
  const textures = [];
  const extra = [];
  const M = (color, opts = {}) => {
    const key = `${color}|${JSON.stringify(opts)}`;
    if (!mats.has(key)) mats.set(key, new T.MeshLambertMaterial({ color, ...opts }));
    return mats.get(key);
  };
  const canvasTex = (w, h, draw, repeat) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    if (repeat) { tex.wrapS = T.RepeatWrapping; tex.wrapT = T.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
    textures.push(tex);
    return tex;
  };
  const track = (obj) => { extra.push(obj); return obj; }; // 나중에 dispose() 해야 하는 재질 같은 것
  return {
    M, canvasTex, track,
    dispose() { textures.forEach((t) => t.dispose()); mats.forEach((m) => m.dispose()); extra.forEach((o) => o.dispose && o.dispose()); },
  };
}

// 여러 모양을 위치·회전·크기·색까지 정해서 하나의 geometry 로 합친다 (색은 꼭짓점 색으로 들어간다)
//  items: [{ g, p:[x,y,z], r:[x,y,z] 또는 q, s:[x,y,z], c: 색 }]
export function bake(T, items) {
  const P = [];
  const N = [];
  const U = [];
  const C = [];
  const I = [];
  const pv = new T.Vector3();
  const sv = new T.Vector3();
  const v = new T.Vector3();
  const pq = new T.Quaternion();
  const eu = new T.Euler();
  const m = new T.Matrix4();
  const nm = new T.Matrix3();
  const col = new T.Color();
  let base = 0;
  for (const it of items) {
    const g = it.g;
    if (it.q) pq.copy(it.q); else { eu.set(...(it.r || [0, 0, 0])); pq.setFromEuler(eu); }
    m.compose(pv.set(...(it.p || [0, 0, 0])), pq, sv.set(...(it.s || [1, 1, 1])));
    nm.getNormalMatrix(m);
    col.set(it.c || '#ffffff');
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      P.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      N.push(v.x, v.y, v.z);
      U.push(uv.getX(i), uv.getY(i));
      C.push(col.r, col.g, col.b);
    }
    const idx = g.index;
    for (let i = 0; i < idx.count; i += 1) I.push(base + idx.getX(i));
    base += pos.count;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
  out.setAttribute('color', new T.Float32BufferAttribute(C, 3));
  out.setIndex(I);
  return out;
}

// 머리: 반지름 HR. 얼굴 그림은 앞쪽 둥근 조각(FACE_*)에 붙인다.
const HR = 0.3;
const HIP = 0.8; // 서 있을 때 엉덩이 관절 높이
const HEAD_K = 0.9; // 머리를 몸에 맞게 줄이는 비율
const FACE_L = 1.7; // 얼굴 조각이 덮는 가로 각도(라디안)
const FACE_T0 = 1.1; // 위쪽 세로 각도
const FACE_T1 = 2.4; // 아래쪽 세로 각도
const FACE_W = 512;
const FACE_H = 384;
const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

// 얼굴 그림: 반짝이는 큰 눈, 가느다란 눈썹, 작은 코와 입, 볼터치
function drawFace(g, W, H, { iris, irisLight, irisDark, brow, lip, mood }) {
  g.clearRect(0, 0, W, H);
  const cx = W / 2;
  const ey = H * 0.49;
  const exs = [W * 0.254, W * 0.746];
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // 볼터치
  for (const bx of [cx - W * 0.295, cx + W * 0.295]) {
    const by = ey + H * 0.2;
    const gr = g.createRadialGradient(bx, by, 0, bx, by, 54);
    gr.addColorStop(0, 'rgba(255,115,140,.5)');
    gr.addColorStop(1, 'rgba(255,115,140,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(bx, by, 56, 38, 0, 0, Math.PI * 2);
    g.fill();
  }

  for (const x of exs) {
    const outer = x < cx ? -1 : 1;
    const rx = 50;
    const ry = 59;
    if (mood === 'blink') {
      g.strokeStyle = '#2a1a14';
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(x - rx, ey + 4);
      g.quadraticCurveTo(x, ey + 26, x + rx, ey + 4);
      g.stroke();
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x + outer * rx, ey + 4);
      g.lineTo(x + outer * (rx + 12), ey - 6);
      g.stroke();
    } else if (mood === 'happy') {
      g.strokeStyle = '#2a1a14';
      g.lineWidth = 11;
      g.beginPath();
      g.moveTo(x - rx + 4, ey + 14);
      g.quadraticCurveTo(x, ey - 34, x + rx - 4, ey + 14);
      g.stroke();
    } else {
      g.save();
      g.beginPath();
      g.ellipse(x, ey, rx, ry, 0, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#fffdfa';
      g.fillRect(x - rx, ey - ry, rx * 2, ry * 2);
      const ir = g.createRadialGradient(x, ey + 12, 3, x, ey + 4, 46);
      ir.addColorStop(0, irisLight);
      ir.addColorStop(0.5, iris);
      ir.addColorStop(1, irisDark);
      g.fillStyle = ir;
      g.beginPath();
      g.ellipse(x, ey + 5, 42, 52, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b1210';
      g.beginPath();
      g.ellipse(x, ey + 6, 20, 27, 0, 0, Math.PI * 2);
      g.fill();
      const lid = g.createLinearGradient(0, ey - ry, 0, ey - ry + 40);
      lid.addColorStop(0, 'rgba(40,20,10,.42)');
      lid.addColorStop(1, 'rgba(40,20,10,0)');
      g.fillStyle = lid;
      g.fillRect(x - rx, ey - ry, rx * 2, 44);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(x - 14, ey - 17, 13, 15, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + 16, ey + 24, 7, 7.5, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.55;
      g.beginPath(); g.ellipse(x + 2, ey + 36, 22, 8, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      g.restore();
      // 윗 속눈썹 선과 바깥쪽으로 살짝 올라간 꼬리
      g.strokeStyle = '#2a1a14';
      g.lineWidth = 9;
      g.beginPath();
      g.ellipse(x, ey, rx + 2, ry + 2, 0, Math.PI * 1.06, Math.PI * 1.94);
      g.stroke();
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(x + outer * (rx + 1), ey - 14);
      g.quadraticCurveTo(x + outer * (rx + 10), ey - 20, x + outer * (rx + 15), ey - 31);
      g.stroke();
      g.strokeStyle = 'rgba(70,40,25,.45)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(x, ey, rx, ry, 0, Math.PI * 0.16, Math.PI * 0.84);
      g.stroke();
    }
    // 눈썹
    g.strokeStyle = brow;
    g.lineWidth = 8;
    g.beginPath();
    const by = ey - (mood === 'happy' ? 88 : 80);
    g.moveTo(x - 38, by + 7);
    g.quadraticCurveTo(x - 2, by - 12, x + 38, by + 5);
    g.stroke();
  }

  // 작은 코
  g.strokeStyle = 'rgba(190,105,85,.6)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(cx - 9, ey + 62);
  g.quadraticCurveTo(cx, ey + 70, cx + 9, ey + 62);
  g.stroke();

  // 입
  const my = H * 0.805;
  if (mood === 'happy') {
    g.fillStyle = '#a63a48';
    g.beginPath();
    g.moveTo(cx - 34, my - 6);
    g.quadraticCurveTo(cx, my + 8, cx + 34, my - 6);
    g.quadraticCurveTo(cx + 30, my + 40, cx, my + 42);
    g.quadraticCurveTo(cx - 30, my + 40, cx - 34, my - 6);
    g.fill();
    g.save();
    g.clip();
    g.fillStyle = '#ff8fa3';
    g.beginPath();
    g.ellipse(cx, my + 40, 20, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(cx - 26, my - 4);
    g.quadraticCurveTo(cx, my + 4, cx + 26, my - 4);
    g.quadraticCurveTo(cx, my + 12, cx - 26, my - 4);
    g.fill();
  } else {
    g.strokeStyle = lip;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(cx - 25, my - 2);
    g.quadraticCurveTo(cx, my + 19, cx + 25, my - 2);
    g.stroke();
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx - 29, my - 8); g.lineTo(cx - 25, my - 2); g.stroke();
    g.beginPath(); g.moveTo(cx + 29, my - 8); g.lineTo(cx + 25, my - 2); g.stroke();
  }
}

// ────────────────────────────────────────────────────────────────
export function characterKit(T, tb) {
  const { M, canvasTex, track } = tb;
  const tint = (a, b, t) => `#${new T.Color(a).lerp(new T.Color(b), t).getHexString()}`;
  const vmat = M('#ffffff', { vertexColors: true });
  const blobTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(60,40,20,.38)');
    gr.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
  // 머리카락 윤기: 위쪽에 둥근 빛 띠, 아래로 갈수록 살짝 어둡게
  const hairTex = canvasTex(32, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#b9b9b9');
    gr.addColorStop(0.16, '#d6d6d6');
    gr.addColorStop(0.3, '#ffffff');
    gr.addColorStop(0.42, '#dcdcdc');
    gr.addColorStop(0.75, '#c4c4c4');
    gr.addColorStop(1, '#a8a8a8');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });

  const geo = new Map();
  const G = {
    sph: (r, w = 14, h = 10) => { const k = `s${r}|${w}|${h}`; if (!geo.has(k)) geo.set(k, new T.SphereGeometry(r, w, h)); return geo.get(k); },
    cap: (r, len) => { const k = `c${r}|${len}`; if (!geo.has(k)) geo.set(k, new T.CapsuleGeometry(r, len, 5, 12)); return geo.get(k); },
    cyl: (rt, rb, h, seg = 14) => { const k = `y${rt}|${rb}|${h}|${seg}`; if (!geo.has(k)) geo.set(k, new T.CylinderGeometry(rt, rb, h, seg)); return geo.get(k); },
    box: (w, h, d) => { const k = `b${w}|${h}|${d}`; if (!geo.has(k)) geo.set(k, new T.BoxGeometry(w, h, d)); return geo.get(k); },
    // 앞쪽 gap(라디안)만큼 비워 둔 구의 한 조각. 모자 조각의 아랫단 색과 이어지게 v 를 맨 아래 값으로 고정한다
    shell: (t0, tl, gap) => {
      const k = `h${t0}|${tl}|${gap}`;
      if (!geo.has(k)) {
        const g = new T.SphereGeometry(1, 20, 8, Math.PI / 2 + gap, Math.PI * 2 - gap * 2, t0, tl);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i += 1) uv.setY(i, 0.03);
        geo.set(k, g);
      }
      return geo.get(k);
    },
    tor: (r, t, rs = 6, ts = 20) => { const k = `t${r}|${t}|${rs}|${ts}`; if (!geo.has(k)) geo.set(k, new T.TorusGeometry(r, t, rs, ts)); return geo.get(k); },
  };
  const unit = G.sph(1, 14, 10);
  G.cap0 = new T.SphereGeometry(1, 24, 9, 0, Math.PI * 2, 0, 1.45);
  G.cone = new T.ConeGeometry(1, 2, 8, 1);
  // 위에서 t(라디안)까지만 덮는 둥근 모자 조각
  G.capTo = (t) => { const k = `a${t}`; if (!geo.has(k)) geo.set(k, new T.SphereGeometry(1, 24, 9, 0, Math.PI * 2, 0, t)); return geo.get(k); };

  // 머리뼈 모양: 아래로 갈수록 갸름하게 (턱선)
  const shapeHead = (g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      const k = clamp(-y / HR, 0, 1);
      const f = 1 - 0.21 * k ** 1.5;
      x *= f;
      z *= f;
      y *= y < 0 ? 0.92 : 0.98;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    return g;
  };
  const headGeo = shapeHead(new T.SphereGeometry(HR, 32, 24));
  const faceGeo = shapeHead(new T.SphereGeometry(HR * 1.004, 40, 28, Math.PI / 2 - FACE_L / 2, FACE_L, FACE_T0, FACE_T1 - FACE_T0));

  faceGeo.userData.own = false;
  const faceCache = new Map();
  const faceMat = (look, mood) => {
    const iris = tint(look.hair, '#4a2c1a', 0.55);
    const key = `${iris}|${look.skin}|${mood}`;
    if (!faceCache.has(key)) {
      const lip = tint(look.skin, '#d9606c', 0.62);
      const brow = tint(look.hair, '#3a2a22', 0.35);
      const tex = canvasTex(FACE_W, FACE_H, (g, w, h) => drawFace(g, w, h, {
        iris, irisLight: tint(iris, '#ffffff', 0.4), irisDark: tint(iris, '#000000', 0.35), brow, lip, mood,
      }));
      faceCache.set(key, track(new T.MeshLambertMaterial({
        map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      })));
    }
    return faceCache.get(key);
  };

  const hairMats = new Map();
  const hairMat = (color) => {
    if (!hairMats.has(color)) {
      hairMats.set(color, track(new T.MeshPhongMaterial({ color, map: hairTex, vertexColors: true, shininess: 42, specular: 0x4d4d4d })));
    }
    return hairMats.get(color);
  };

  // 머리 위의 한 가닥: 머리 둘레의 방위각(az)과 높이각(el)으로 위치를 잡고 아래로 흘러내리게 눕힌다
  const lock = (az, elTop, elBot, w, th = 0.045, R = 0.33) => {
    const el = (elTop + elBot) / 2;
    const half = (Math.abs(elTop - elBot) * R) / 2;
    const radial = new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const down = new T.Vector3(Math.sin(az) * Math.sin(el), -Math.cos(el), Math.cos(az) * Math.sin(el));
    const right = down.clone().cross(radial).normalize();
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right, down, radial));
    return { g: unit, p: radial.multiplyScalar(R).toArray(), q, s: [w, half, th] };
  };

  // 머리 위 한 점(방위각 az, 높이각 el)에 놓는 덩어리: w=옆 폭, h=바깥쪽 높이, l=머리 둘레 방향 길이 (모두 반지름), spin=바깥 방향 축 둘레 회전
  const hairAt = (g, az, el, R, w, h, l, spin = 0, c) => {
    const radial = new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const east = new T.Vector3(Math.cos(az), 0, -Math.sin(az));
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(east, radial, east.clone().cross(radial)));
    if (spin) q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), spin));
    return { g, p: radial.multiplyScalar(R).toArray(), q, s: [w, h, l], c };
  };

  const BASE_S = [0.333, 0.322, 0.321];
  const DIM = '#c2c2c2'; // 짧게 민 옆머리는 조금 어둡게
  // 모자 조각: t=덮는 높이각, k=크기, dz=뒤로 물린 정도 (짧게 민 머리는 이마 쪽까지 바짝 붙인다)
  const capPart = (t, k, c, dz = -0.03) => ({ g: G.capTo(t), p: [0, 0.017, dz], s: BASE_S.map((v) => v * k), c });
  const sidePart = (t0, tl, gap, k, c, dz = -0.03) => ({ g: G.shell(t0, tl, gap), p: [0, 0.017, dz], s: BASE_S.map((v) => v * k), c });
  const sideburns = (top, bot, R = 0.332) => [-1, 1].map((sx) => lock(sx * 1.32, top, bot, 0.035, 0.035, R));
  // 짧게 친 머리 한 벌: 이마 가운데는 높고 옆으로 갈수록 점점 내려와서 머리선이 자연스럽다 (귀는 보인다)
  const trimmed = (k, c, dz) => [
    capPart(1.25, k, c, dz),
    ...[1, 2, 3, 4, 5].map((i) => sidePart(1.2, 0.1 + 0.115 * (i - 1), 0.4 + 0.2 * (i - 1), k, c, dz)),
    sidePart(1.6, 0.5, 1.9, k, c, dz),
  ];
  // 이마를 덮는 앞머리: botOf(az, k) 가 가닥마다 내려오는 높이, roll 은 한쪽으로 쓸어 넘기는 정도
  const fringe = (R, top, botOf, { w = 0.05, th = 0.045, step = 0.15, roll = () => 0 } = {}) => {
    const out = [];
    for (let k = -6; k <= 6; k += 1) {
      const az = k * step;
      const l = lock(az, top, botOf(az, k), w, th, R + (Math.abs(k) % 2) * 0.004);
      const r = roll(az, k);
      if (r) l.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), r));
      out.push(l);
    }
    return out;
  };

  // 말린 머리: S 가 클수록 크게 부푼다
  const curls = (S) => {
    const it = [capPart(1.35, 0.96 * Math.min(S, 1.1)), ...trimmed(0.96 * Math.min(S, 1.1))];
    const rows = [[1.5, 1, 0.09, 0], [1.2, 6, 0.082, 0], [0.9, 9, 0.08, 0], [0.62, 12, 0.076, 0], [0.33, 14, 0.072, 0.85 * Math.min(S, 1.15)], [0.02, 14, 0.068, 1.15 * Math.min(S, 1.15)], [-0.28, 10, 0.062, 1.35 * Math.min(S, 1.15)], [-0.58, 6, 0.056, 1.8]];
    rows.forEach(([el, n, r, skip], ri) => {
      for (let i = 0; i < n; i += 1) {
        const az = ((i + (ri % 2) * 0.5) / n) * Math.PI * 2;
        const d = Math.abs(Math.atan2(Math.sin(az), Math.cos(az))); // 앞(0)에서 얼마나 떨어졌나
        const j = (hash(`${ri}-${i}`) % 100) / 100 - 0.5;
        const rr = r * S * (1 + j * 0.2);
        if (d >= skip) it.push(hairAt(G.sph(1, 9, 7), az + j * 0.12, el + j * 0.06, 0.298 + (S - 1) * 0.1, rr, rr * 0.95, rr));
      }
    });
    for (let i = -2; i <= 2; i += 1) it.push(hairAt(G.sph(1, 9, 7), i * 0.27, 0.42 - Math.abs(i) * 0.03, 0.312, 0.06 * Math.min(S, 1.2), 0.056 * Math.min(S, 1.2), 0.06 * Math.min(S, 1.2)));
    return it;
  };

  // 남자 머리 모양들. 얼굴(눈·눈썹)이 보이도록 앞쪽 아래는 늘 비워 둔다.
  const maleHair = {
    // 스포츠머리: 아주 짧게 바짝 깎았다 (이마 위에 짧은 머리카락이 오톨도톨)
    crew: () => [
      ...trimmed(0.96, undefined, -0.005),
      ...fringe(0.318, 0.85, (az, k) => 0.34 + (hash(String(k)) % 5) * 0.012 + Math.abs(k) * 0.015, { w: 0.036, th: 0.03, step: 0.13 }),
    ],

    // 모히칸: 옆은 짧게 밀고 가운데만 앞에서 뒤로 뾰족하게 세운다
    mohawk: () => {
      const it = trimmed(0.955, DIM, -0.005);
      const N = 11;
      for (let i = 0; i < N; i += 1) {
        const t = i / (N - 1);
        const u = -0.85 + t * 2.5; // 이마 위(-) → 정수리(0) → 뒤통수(+)
        const az = u < 0 ? 0 : Math.PI;
        const el = u < 0 ? Math.PI / 2 + u : Math.PI / 2 - u;
        const s = Math.sin(Math.PI * t);
        const ridge = 0.05 + 0.04 * s;
        it.push(hairAt(G.sph(1, 10, 8), az, el, 0.3, 0.066, ridge, 0.078));
        const h = 0.07 + 0.065 * s;
        it.push(hairAt(G.cone, az, el, 0.3 + ridge * 0.6 + h * 0.5, 0.058, h, 0.07));
      }
      return it;
    },

    // 투블럭: 윗머리는 풍성하게 한쪽으로 쓸어 내리고, 옆·뒤는 짧게 쳐서 점점 짧아진다 (귀가 다 보인다)
    twoblock: () => [
      capPart(1.25, 1.05),
      capPart(1.4, 0.99, '#d6d6d6', -0.012),
      ...trimmed(0.96, DIM, -0.03),
      ...fringe(0.355, 0.95, (az, k) => 0.11 + (k + 6) * 0.011, { w: 0.058, th: 0.05, roll: () => -0.3 }),
    ],

    // 가르마 펌: 한쪽으로 가르마를 타서 앞머리가 양옆으로 물결치듯 흘러내린다
    wave: () => {
      const part = 0.3;
      const it = [capPart(1.4, 1.025), ...trimmed(1.0, undefined, -0.03)];
      it.push(...fringe(0.345, 0.9, (az) => (az < part ? 0.17 + (part - az) * 0.1 : 0.27 + (az - part) * 0.05), {
        w: 0.056, th: 0.05, roll: (az) => (az < part ? 0.6 : -0.5),
      }));
      for (const [az, el] of [[-0.8, 1.0], [-0.35, 1.2], [0.15, 1.3], [0.55, 1.1], [0.85, 0.85]]) {
        it.push(hairAt(G.sph(1, 10, 8), az, el, 0.335, 0.1, 0.045, 0.05, 0.7));
      }
      for (const el of [0.85, 1.1, 1.35]) it.push(hairAt(G.sph(1, 8, 6), part, el, 0.347, 0.008, 0.006, 0.1, 0, '#777777'));
      return it;
    },

    // 뽀글 파마: 동글동글 말린 머리카락이 머리 둘레에 가득
    perm: () => curls(1),

    // 아프로 파마: 크고 동그랗게 부풀린 파마
    afro: () => curls(1.45),

    // 뾰족 머리: 젤을 발라 위로 쭈뼛쭈뼛 세운 머리
    spiky: () => {
      const it = [capPart(1.45, 0.99, undefined, -0.02), ...trimmed(0.97)];
      const N = 17;
      for (let i = 0; i < N; i += 1) {
        const el = Math.PI / 2 - Math.sqrt((i + 0.5) / N) * 1.25; // 정수리에서 퍼져 나가는 해바라기 씨앗 배열
        const h = 0.08 + 0.02 * ((i * 7) % 3);
        it.push(hairAt(G.cone, i * 2.39996, el, 0.31 + h * 0.5, 0.062, h, 0.062));
      }
      for (let i = -2; i <= 2; i += 1) it.push(hairAt(G.cone, i * 0.3, 0.5, 0.35, 0.05, 0.085, 0.05));
      return it;
    },

    // 바가지 머리: 이마 위로 일자 앞머리, 귀 위까지 동글게 덮는다
    bowl: () => [
      capPart(1.45, 1.02),
      sidePart(1.45, 0.62, 0.7, 1.035),
      ...fringe(0.343, 0.9, (az, k) => 0.3 + Math.abs(k) * 0.005, { w: 0.052, th: 0.048, step: 0.13 }),
    ],
  };

  function hairItems(style, accent) {
    if (maleHair[style]) return { hair: maleHair[style](), extra: [] };
    const it = [
      { g: G.cap0, p: [0, 0.017, -0.03], s: [0.333, 0.322, 0.321] },
      { g: G.shell(1.45, 0.8, 1.25), p: [0, 0.017, -0.03], s: [0.333, 0.322, 0.321] },
    ];
    const extra = []; // 머리끈 (머리 색과 따로 칠한다)
    // 앞머리
    if (style === 'bun') {
      for (const sx of [-1, 1]) it.push(lock(sx * 0.95, 0.7, 0.2, 0.06), lock(sx * 0.7, 0.8, 0.34, 0.06));
    } else {
      const shorter = style === 'pony' ? 0.1 : 0;
      for (let k = -6; k <= 6; k += 1) {
        const az = k * 0.15;
        const bot = 0.2 + shorter + Math.abs(k) * 0.016 + (k % 2 ? 0.015 : 0);
        it.push(lock(az, 0.82, bot, 0.05, 0.045, 0.332 + (Math.abs(k) % 2) * 0.004));
      }
    }
    // 옆머리·뒷머리
    switch (style) {
      case 'long':
        for (const sx of [-1, 1]) it.push(lock(sx * 1.32, 0.55, -0.85, 0.075, 0.05), lock(sx * 1.05, 0.7, -0.45, 0.06, 0.05));
        it.push({ g: unit, p: [0, -0.43, -0.16], s: [0.31, 0.5, 0.2] });
        break;
      case 'bob':
        for (const sx of [-1, 1]) it.push(lock(sx * 1.3, 0.6, -0.55, 0.09, 0.05), lock(sx * 1.02, 0.72, -0.2, 0.06, 0.05));
        it.push({ g: G.shell(1.2, 1.4, 1.15), p: [0, -0.1, -0.05], s: [0.345, 0.3, 0.325] });
        break;
      case 'pony':
        for (const sx of [-1, 1]) it.push(lock(sx * 1.3, 0.5, -0.1, 0.045, 0.045));
        it.push({ g: G.cap(0.075, 0.22), p: [0, -0.1, -0.4], r: [-0.18, 0, 0], c: '#ffffff' });
        extra.push({ g: G.sph(0.062, 10, 8), p: [0, 0.07, -0.33], s: [1.2, 1, 1.2], c: accent });
        break;
      case 'twin':
        for (const sx of [-1, 1]) {
          it.push(lock(sx * 1.3, 0.5, -0.1, 0.045, 0.045));
          it.push({ g: G.cap(0.085, 0.2), p: [sx * 0.37, -0.15, -0.06], r: [0, 0, sx * 0.1], c: '#ffffff' });
          extra.push({ g: G.sph(0.058, 10, 8), p: [sx * 0.33, 0.08, -0.05], c: accent });
        }
        break;
      case 'bun':
        for (const sx of [-1, 1]) it.push(lock(sx * 1.3, 0.5, -0.1, 0.045, 0.045));
        it.push({ g: G.sph(0.115, 14, 10), p: [0, 0.37, -0.08], c: '#ffffff' });
        extra.push({ g: G.tor(0.1, 0.014, 6, 16), p: [0, 0.28, -0.06], r: [Math.PI / 2 - 0.2, 0, 0], c: accent });
        break;
      default: // short
        for (const sx of [-1, 1]) it.push(lock(sx * 1.32, 0.5, 0.0, 0.05, 0.045));
        break;
    }
    return { hair: it, extra };
  }

  function tag(text, bg = '#ffffff') {
    const tex = canvasTex(360, 96, (g, w, h) => {
      g.fillStyle = bg;
      const r = 44;
      g.beginPath(); g.moveTo(r, 6); g.lineTo(w - r, 6); g.quadraticCurveTo(w - 6, 6, w - 6, h / 2); g.quadraticCurveTo(w - 6, h - 6, w - r, h - 6);
      g.lineTo(r, h - 6); g.quadraticCurveTo(6, h - 6, 6, h / 2); g.quadraticCurveTo(6, 6, r, 6); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#2b2d42'; g.stroke();
      g.fillStyle = '#2b2d42'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = 44;
      g.font = `700 ${size}px Jua, "Malgun Gothic", sans-serif`;
      while (g.measureText(text).width > w - 50 && size > 22) { size -= 2; g.font = `700 ${size}px Jua, "Malgun Gothic", sans-serif`; }
      g.fillText(text, w / 2, h / 2 + 3);
    });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(1.3, 0.35, 1);
    return sp;
  }

  const BAGS = ['#ff8fab', '#7ec8ff', '#a6e3a1', '#c7a6ff', '#ffb870'];

  // look: { skin, hair, hairStyle, top, bottom, bottomStyle, glasses }
  //  role: 'kid'(나) | 'friend' | 'teacher' | 'mom' | 'dad' — 입는 옷 모양이 조금씩 다르다
  function make(look, { name = '', scale = 1, tagBg, role = 'friend' } = {}) {
    const skin = look.skin;
    const skirt = look.bottomStyle === 'skirt';
    const hb = hash(name || `${look.top}${look.hair}`);
    const outfit = role === 'teacher' ? 'cardigan' : role === 'mom' || role === 'dad' ? 'knit' : role === 'kid' ? 'hoodie' : ['hoodie', 'tee', 'stripe'][hb % 3];
    const topC = look.top;
    const hemC = tint(topC, '#000000', 0.16);
    const botC = look.bottom;
    const accent = tint(topC, '#ffffff', 0.15);
    const short = outfit === 'tee' || outfit === 'stripe';

    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const mesh = (items, parent) => { const m = new T.Mesh(bake(T, items), vmat); parent.add(m); return m; };

    // ── 몸통: 목, 상의(후드·카라·줄무늬·카디건), 하의 ──
    const torso = [
      { g: G.cyl(0.05, 0.056, 0.1, 10), p: [0, 1.215, 0], c: skin },
      { g: G.cap(0.15, 0.2), p: [0, 0.975, 0], s: [1.12, 1, 0.82], c: topC },
      { g: G.cap(0.056, 0.27), p: [0, 1.145, 0], r: [0, 0, Math.PI / 2], s: [0.95, 1, 0.9], c: topC },
      { g: G.cyl(0.152, 0.156, 0.055, 18), p: [0, 0.775, 0], s: [1.12, 1, 0.82], c: outfit === 'cardigan' ? topC : hemC },
    ];
    if (skirt) {
      torso.push({ g: G.cyl(0.155, 0.31, 0.3, 22), p: [0, 0.6, 0], s: [1, 1, 0.94], c: botC }, { g: G.cyl(0.157, 0.157, 0.045, 18), p: [0, 0.755, 0], s: [1.1, 1, 0.8], c: tint(botC, '#000000', 0.2) });
    } else {
      torso.push({ g: G.cyl(0.153, 0.158, 0.16, 18), p: [0, 0.715, 0], s: [1.12, 1, 0.82], c: botC });
    }
    if (outfit === 'hoodie') {
      torso.push(
        { g: G.sph(0.1, 12, 8), p: [0, 1.2, -0.1], s: [1.6, 0.85, 1.1], c: topC },
        { g: G.tor(0.07, 0.02, 6, 16), p: [0, 1.225, 0.01], r: [Math.PI / 2, 0, 0], c: hemC },
        { g: G.cap(0.009, 0.1), p: [-0.04, 1.12, 0.128], c: '#ffffff' },
        { g: G.cap(0.009, 0.1), p: [0.04, 1.12, 0.128], c: '#ffffff' },
        { g: G.box(0.17, 0.07, 0.02), p: [0, 0.86, 0.135], r: [0.2, 0, 0], c: hemC }
      );
    } else if (outfit === 'cardigan') {
      torso.push(
        { g: G.sph(1, 10, 8), p: [0, 1.11, 0.1], s: [0.1, 0.14, 0.05], c: '#ffffff' },
        { g: G.box(0.045, 0.32, 0.022), p: [-0.075, 1.04, 0.122], r: [0, 0, 0.13], c: hemC },
        { g: G.box(0.045, 0.32, 0.022), p: [0.075, 1.04, 0.122], r: [0, 0, -0.13], c: hemC },
        { g: G.box(0.012, 0.28, 0.01), p: [-0.05, 1.07, 0.15], r: [0, 0, 0.17], c: '#7ec8ff' },
        { g: G.box(0.012, 0.28, 0.01), p: [0.05, 1.07, 0.15], r: [0, 0, -0.17], c: '#7ec8ff' },
        { g: G.box(0.075, 0.1, 0.012), p: [0, 0.93, 0.15], c: '#ffffff' },
        { g: G.box(0.075, 0.025, 0.014), p: [0, 0.96, 0.151], c: '#4d7cff' }
      );
    } else {
      torso.push({ g: G.tor(0.062, 0.017, 6, 16), p: [0, 1.225, 0.01], r: [Math.PI / 2, 0, 0], c: hemC });
      if (outfit === 'stripe') {
        for (const y of [1.05, 0.96]) torso.push({ g: G.cyl(0.156, 0.156, 0.035, 18), p: [0, y, 0], s: [1.12, 1, 0.82], c: '#ffffff' });
      }
    }
    mesh(torso, body);

    // 가방 (앉으면 숨긴다)
    const bagC = role === 'kid' ? '#4d7cff' : BAGS[hb % BAGS.length];
    const bag = role === 'friend' || role === 'kid' ? mesh([
      { g: G.box(0.27, 0.32, 0.12), p: [0, 0.99, -0.185], c: bagC },
      { g: G.sph(0.135, 10, 8), p: [0, 1.15, -0.185], s: [1, 0.35, 0.45], c: bagC },
      { g: G.box(0.2, 0.13, 0.04), p: [0, 0.9, -0.26], c: tint(bagC, '#ffffff', 0.35) },
      { g: G.box(0.035, 0.34, 0.025), p: [-0.095, 1.06, 0.12], r: [0.08, 0, 0], c: tint(bagC, '#000000', 0.25) },
      { g: G.box(0.035, 0.34, 0.025), p: [0.095, 1.06, 0.12], r: [0.08, 0, 0], c: tint(bagC, '#000000', 0.25) },
    ], body) : null;

    // ── 다리: 허벅지(엉덩이 축) + 정강이·신발(무릎 축) ──
    const mkLeg = (sx) => {
      const hip = new T.Group();
      hip.position.set(sx * 0.085, HIP, 0);
      root.add(hip);
      mesh([{ g: G.cap(0.074, 0.23), p: [0, -0.19, 0], c: skirt ? skin : botC }], hip);
      const knee = new T.Group();
      knee.position.y = -0.39;
      hip.add(knee);
      mesh([
        { g: G.sph(0.063, 10, 8), p: [0, 0, 0], c: skirt ? '#ffffff' : botC },
        { g: G.cap(0.058, 0.2), p: [0, -0.17, 0], c: skirt ? '#ffffff' : botC },
        { g: G.sph(0.074, 12, 9), p: [0, -0.355, 0.04], s: [1, 0.72, 1.6], c: '#ffffff' },
        { g: G.sph(0.074, 12, 9), p: [0, -0.385, 0.04], s: [1.04, 0.3, 1.64], c: '#d9dde4' },
        { g: G.box(0.09, 0.014, 0.045), p: [0, -0.33, 0.12], r: [-0.25, 0, 0], c: accent },
      ], knee);
      return { hip, knee };
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);

    // ── 팔: 어깨 축 + 팔꿈치 축 ──
    const mkArm = (sx) => {
      const shoulder = new T.Group();
      shoulder.position.set(sx * 0.2, 1.15, 0);
      body.add(shoulder);
      mesh([
        { g: G.sph(0.054, 10, 8), p: [0, 0, 0], c: topC },
        { g: G.cap(0.047, 0.15), p: [0, -0.115, 0], c: topC },
      ], shoulder);
      const elbow = new T.Group();
      elbow.position.y = -0.225;
      shoulder.add(elbow);
      mesh([
        { g: G.cap(0.041, 0.13), p: [0, -0.105, 0], c: short ? skin : topC },
        { g: G.cyl(0.045, 0.045, 0.03, 10), p: [0, -0.19, 0], c: short ? skin : hemC },
        { g: G.sph(0.05, 10, 8), p: [0, -0.24, 0], c: skin },
      ], elbow);
      shoulder.rotation.z = sx * 0.1;
      return { shoulder, elbow };
    };
    const armL = mkArm(-1);
    const armR = mkArm(1);

    // ── 머리: 얼굴, 머리카락, 귀, 안경 ──
    const head = new T.Group();
    head.position.y = 1.5;
    body.add(head);
    const skinItems = [{ g: headGeo, c: skin }];
    for (const sx of [-1, 1]) skinItems.push({ g: G.sph(0.04, 8, 6), p: [sx * 0.292, -0.045, -0.02], s: [0.55, 1, 0.8], c: skin });
    if (look.glasses) {
      const frame = '#2b2d42';
      for (const sx of [-1, 1]) {
        const x = sx * 0.125;
        const z = Math.sqrt(HR * HR - x * x - 0.0025) + 0.014;
        skinItems.push({ g: G.tor(0.066, 0.0085, 6, 28), p: [x, -0.05, z], r: [0, sx * 0.34, 0], c: frame });
        skinItems.push({ g: G.box(0.012, 0.012, 0.3), p: [sx * 0.238, -0.045, 0.12], r: [0, -sx * 0.355, 0], c: frame });
      }
      skinItems.push({ g: G.box(0.06, 0.009, 0.009), p: [0, -0.045, 0.306], c: frame });
    }
    const hairParts = hairItems(look.hairStyle, accent);
    mesh(skinItems.concat(hairParts.extra), head);
    const face = new T.Mesh(faceGeo, faceMat(look, 'open'));
    head.add(face);
    const hair = new T.Mesh(bake(T, hairParts.hair), hairMat(look.hair));
    head.add(hair);

    const shadow = new T.Mesh(new T.PlaneGeometry(1.1, 1.1), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    root.add(shadow);
    if (name) {
      const t = tag(name, tagBg);
      t.position.y = 2.16;
      root.add(t);
    }
    body.position.y = HIP - 0.72;
    head.scale.setScalar(HEAD_K);
    root.scale.setScalar(scale);
    root.userData = {
      body, head, legL: legL.hip, legR: legR.hip, kneeL: legL.knee, kneeR: legR.knee,
      armL: armL.shoulder, armR: armR.shoulder, elbowL: armL.elbow, elbowR: armR.elbow,
      face, look, bag, mood: 'open', nextBlink: performance.now() / 1000 + rand(1, 5), blinkUntil: 0,
      sit: false, baseY: HIP - 0.72,
    };
    return root;
  }

  // 걷는 몸짓: sw 는 한 쪽 다리가 뒤로 가는 정도(+) / 앞으로 가는 정도(-), k 는 걷는 세기(0..1)
  function limbs(ch, sw, k = 1) {
    const u = ch.userData;
    u.legL.rotation.x = sw;
    u.legR.rotation.x = -sw;
    u.kneeL.rotation.x = Math.max(0, sw) * 0.95 + 0.04 * k;
    u.kneeR.rotation.x = Math.max(0, -sw) * 0.95 + 0.04 * k;
    u.armL.rotation.x = -sw * 0.9;
    u.armR.rotation.x = sw * 0.9;
    u.elbowL.rotation.x = -0.18 - Math.abs(sw) * 0.4;
    u.elbowR.rotation.x = -0.18 - Math.abs(sw) * 0.4;
  }

  // 표정: 눈을 깜빡이고, 신나면(손 흔들거나 이야기할 때) 활짝 웃는다
  function face(ch, t, happy) {
    const u = ch.userData;
    let mood = happy ? 'happy' : 'open';
    if (!happy) {
      if (t > u.nextBlink) { u.blinkUntil = t + 0.13; u.nextBlink = t + rand(2.2, 5.5); }
      if (t < u.blinkUntil) mood = 'blink';
    }
    if (mood !== u.mood) {
      u.mood = mood;
      u.face.material = faceMat(u.look, mood);
    }
  }

  // 의자(floor=false) 또는 바닥 쿠션(floor=true)에 앉는다 / 일어선다
  function setSit(ch, floor = false) {
    const u = ch.userData;
    const hipY = floor ? 0.3 : 0.5;
    u.sit = true;
    u.baseY = hipY - HIP;
    u.body.position.y = u.baseY;
    for (const [leg, knee, arm, elbow] of [[u.legL, u.kneeL, u.armL, u.elbowL], [u.legR, u.kneeR, u.armR, u.elbowR]]) {
      leg.position.y = hipY;
      leg.rotation.x = -1.5;
      knee.rotation.x = floor ? 0.12 : 1.5;
      arm.rotation.x = -0.7;
      elbow.rotation.x = -0.95;
    }
    if (u.bag) u.bag.visible = false;
  }
  function standUp(ch) {
    const u = ch.userData;
    u.sit = false;
    u.baseY = HIP - 0.72;
    u.body.position.y = u.baseY;
    for (const [leg, knee, arm, elbow] of [[u.legL, u.kneeL, u.armL, u.elbowL], [u.legR, u.kneeR, u.armR, u.elbowR]]) {
      leg.position.y = HIP;
      leg.rotation.x = 0;
      knee.rotation.x = 0;
      arm.rotation.x = 0;
      elbow.rotation.x = -0.18;
    }
    if (u.bag) u.bag.visible = true;
  }
  return { make, setSit, standUp, limbs, face };
}

// 사람 하나를 완전히 치운다 (geometry 는 캐릭터마다 따로 만든 것이라 같이 버린다)
export function disposeCharacter(ch) {
  ch.traverse((o) => { if (o.geometry && o.geometry.userData?.own !== false && !o.isSprite) o.geometry.dispose(); });
}

// ────────────────────────────────────────────────────────────────
// 부모님용: 친구·선생님을 만들 때 보는 작은 3D 미리보기 (천천히 돈다)
export async function mountCharacterPreview(container, look, role = 'friend', name = '') {
  let T;
  let renderer;
  try {
    T = await loadThree();
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    container.innerHTML = '<p class="empty">3D 미리보기를 쓸 수 없어요</p>';
    return { set() {}, dispose() {}, step() {} };
  }
  const tb = toolbox(T);
  const kit = characterKit(T, tb);
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff, 0xd9cdb8, 2.5));
  const sun = new T.DirectionalLight(0xfff4dc, 1.9);
  sun.position.set(-3, 5, 4);
  scene.add(sun);
  const camera = new T.PerspectiveCamera(32, 0.85, 0.1, 50);
  camera.position.set(0, 1.25, 4.8); // 선생님(조금 더 큼)의 이름표까지 들어오게
  camera.lookAt(0, 1.2, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.innerHTML = '';
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  const floor = new T.Mesh(new T.CircleGeometry(0.9, 32), tb.M('#ffffff', { transparent: true, opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.005;
  scene.add(floor);

  let ch = null;
  let spin = 0.5;
  const build = (lk, rl, nm) => {
    if (ch) { scene.remove(ch); disposeCharacter(ch); }
    ch = kit.make(lk, { name: nm, scale: rl === 'teacher' ? 1.06 : 0.95, tagBg: rl === 'teacher' ? '#e3f1ff' : '#ffffff', role: rl });
    ch.rotation.y = spin;
    scene.add(ch);
  };
  build(look, role, name);

  const resize = () => {
    const w = container.clientWidth || 240;
    const h = container.clientHeight || 280;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  let raf = 0;
  let last = performance.now();
  const step = (dt) => {
    spin += dt * 0.7;
    if (ch) {
      ch.rotation.y = spin;
      const t = performance.now() / 1000;
      kit.face(ch, t, Math.sin(t * 0.8) > 0.55);
      const u = ch.userData;
      u.body.position.y = Math.sin(t * 1.6) * 0.01;
      u.armR.rotation.z = damp(u.armR.rotation.z, Math.sin(t * 0.8) > 0.55 ? 2.3 + Math.sin(t * 9) * 0.3 : 0.1, 8, dt);
    }
    renderer.render(scene, camera);
  };
  const loop = (now) => { raf = requestAnimationFrame(loop); step(Math.min(0.05, (now - last) / 1000)); last = now; };
  raf = requestAnimationFrame(loop);
  return {
    set(lk, rl, nm) { build(lk, rl, nm); },
    step,
    renderer,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      scene.traverse((o) => o.geometry && o.geometry.dispose());
      tb.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      container.innerHTML = '';
    },
  };
}
