// 마음 쉼터 넓히기: 교실 밖의 공간들 — 복도, 복도 2, 화장실, 2층으로 가는 계단과 2층 복도.
// 별로 하나씩 열고(server/world.js 의 목록), 아직 안 열린 곳은 "공사 중" 가림막이나 잠긴 문으로 막혀 있다.
//   buildHalls(T, ctx) → { barriers, init(열린 공간 id들), unlock(id), update(t, dt) }
//   ctx: { scene, colliders, tb(재료 상자), theme, school, label, catalog, view: { unlocked:Set, stars }, door: { leaf, collider } }
import { ROOM, ZONES, STAIRS } from './world-shared.js';

const FONT = (px) => `700 ${px}px Jua, "Malgun Gothic", sans-serif`;
const HOST = { hall1: 'room', hall2: 'hall1', wc: 'hall2', stairs: 'hall2' }; // 막힌 곳이 놓이는 공간

export function buildHalls(T, ctx) {
  const { scene, colliders, tb, theme, school, label, catalog, view, door } = ctx;
  const { M, canvasTex, track } = tb;
  const root = new T.Group();
  scene.add(root);
  const built = new Set();
  const barriers = [];
  const anims = [];
  const rings = [];

  // ───────── 작은 도구 ─────────
  const box = (w, h, d, color, x, y, z, parent = root, opts) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), M(color, opts));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const panel = (tex, w, h, x, y, z, ry = 0, lit = false, opts = {}, parent = root) => {
    const mat = track(lit ? new T.MeshLambertMaterial({ map: tex, ...opts }) : new T.MeshBasicMaterial({ map: tex, ...opts }));
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    return m;
  };
  const solid = (x, z, hw, hd) => { const c = { x, z, hw, hd }; colliders.push(c); return c; };
  const unsolid = (c) => { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); };
  const rr = (g, x, y, w, h, r) => {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };
  // 글자 팻말 그림: lines 는 [글, 크기] 목록
  const signTex = (lines, { bg = '#fff7d6', ink = '#2b2d42', w = 512, h = 160 } = {}) => canvasTex(w, h, (g) => {
    g.fillStyle = bg; rr(g, 4, 4, w - 8, h - 8, 28); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#2b2d42'; g.stroke();
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    const gap = (h - 20) / lines.length;
    lines.forEach(([text, px], i) => { g.font = FONT(px); g.fillText(text, w / 2, 10 + gap * (i + 0.5) + 3); });
  });
  const tileTex = (w, d, a = '#ece9e1', b = '#e2ded3', cell = 1) => canvasTex(128, 128, (g, cw, ch) => {
    g.fillStyle = a; g.fillRect(0, 0, cw, ch);
    g.fillStyle = b; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    for (let k = 0; k < 260; k += 1) { g.fillStyle = k % 2 ? 'rgba(150,140,125,.12)' : 'rgba(255,255,255,.4)'; g.fillRect(Math.random() * cw, Math.random() * ch, 2, 2); }
    g.fillStyle = 'rgba(165,155,140,.5)'; g.fillRect(0, 0, cw, 2); g.fillRect(0, 0, 2, ch);
  }, [w / cell, d / cell]);
  const doorTex = (color, glass = true) => canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    if (glass) {
      g.fillStyle = '#bcd9ea'; g.fillRect(70, 56, 116, 150);
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(70, 56, 116, 150);
      g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.moveTo(84, 204); g.lineTo(120, 58); g.lineTo(146, 58); g.lineTo(110, 204); g.fill();
    }
    g.fillStyle = '#8e99a4'; g.fillRect(26, 290, 14, 80);
  });

  // 벽 한 줄. gaps 는 문·창문 구멍 { a, b, y0, y1 } (a~b 는 따라가는 방향의 구간, y0~y1 은 높이). 창문 구멍은 열려 있어도 막힌다.
  function wall(axis, fixed, from, to, { y = 0, h = 3.2, thick = 0.3, color, gaps = [] }) {
    const cuts = gaps.slice().sort((p, q) => p.a - q.a);
    const seg = (a, b, y0, y1) => {
      if (b - a < 0.01 || y1 - y0 < 0.01) return;
      const mid = (a + b) / 2;
      const len = b - a;
      const hgt = y1 - y0;
      const paint = { emissive: color, emissiveIntensity: 0.3 };
      if (axis === 'z') box(thick, hgt, len, color, fixed, y + y0 + hgt / 2, mid, root, paint);
      else box(len, hgt, thick, color, mid, y + y0 + hgt / 2, fixed, root, paint);
      if (y0 === 0) { // 걸레받이
        if (axis === 'z') box(thick + 0.03, 0.1, len, '#b7b2a6', fixed, y + 0.05, mid);
        else box(len, 0.1, thick + 0.03, '#b7b2a6', mid, y + 0.05, fixed);
      }
    };
    const block = (a, b) => { if (b - a > 0.01) (axis === 'z' ? solid(fixed, (a + b) / 2, thick / 2, (b - a) / 2) : solid((a + b) / 2, fixed, (b - a) / 2, thick / 2)); };
    let at = from;
    for (const g of cuts) {
      seg(at, g.a, 0, h); block(at, g.a);
      seg(g.a, g.b, 0, g.y0); seg(g.a, g.b, g.y1, h);
      if (g.y0 > 0.3) block(g.a, g.b); // 창문은 막는다
      at = g.b;
    }
    seg(at, to, 0, h); block(at, to);
  }
  // 창틀(하얀 알루미늄)
  function windowFrames(axis, fixed, wins, y) {
    for (const w of wins) {
      const mid = (w.a + w.b) / 2;
      const len = w.b - w.a;
      const hgt = w.y1 - w.y0;
      const put = (l, hh, along, yy) => (axis === 'z' ? box(0.1, hh, l, '#f3f4f5', fixed, y + yy, along) : box(l, hh, 0.1, '#f3f4f5', along, y + yy, fixed));
      put(len + 0.06, 0.06, mid, w.y1); put(len + 0.12, 0.05, mid, w.y0 - 0.01); put(0.06, hgt, w.a, w.y0 + hgt / 2); put(0.06, hgt, w.b, w.y0 + hgt / 2);
      put(0.05, hgt, mid, w.y0 + hgt / 2); put(len, 0.04, mid, w.y0 + hgt / 2);
    }
  }
  // 천장판과 형광등, 바닥
  function shell(zr, floorTexture, { ceilColor = 0xf2f1ec, stripe = true } = {}) {
    const w = zr.x1 - zr.x0;
    const d = zr.z1 - zr.z0;
    const cx = (zr.x0 + zr.x1) / 2;
    const cz = (zr.z0 + zr.z1) / 2;
    const floor = new T.Mesh(new T.PlaneGeometry(w, d), track(new T.MeshLambertMaterial({ map: floorTexture })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, zr.y + 0.003, cz);
    root.add(floor);
    const ceil = new T.Mesh(new T.PlaneGeometry(w, d), track(new T.MeshBasicMaterial({ color: ceilColor })));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, zr.y + zr.h, cz);
    root.add(ceil);
    for (let z = zr.z0 + 1.6; z < zr.z1 - 0.8; z += 3.2) {
      box(1.9, 0.05, 0.45, '#ffffff', cx, zr.y + zr.h - 0.03, z, root, { emissive: 0xfffbf0, emissiveIntensity: 0.95 });
    }
    if (stripe) { // 바닥 한가운데 길 따라가는 띠
      const s = new T.Mesh(new T.PlaneGeometry(0.35, d), M(theme.band));
      s.rotation.x = -Math.PI / 2;
      s.position.set(cx, zr.y + 0.006, cz);
      root.add(s);
    }
  }
  const plant = (x, z, y = 0) => {
    const g = new T.Group();
    const pot = new T.Mesh(new T.CylinderGeometry(0.22, 0.16, 0.34, 10), M(0xe07a5f));
    pot.position.set(0, 0.17, 0);
    g.add(pot);
    [[0, 0.62, 0, 0.3], [0.16, 0.5, 0.08, 0.2], [-0.16, 0.54, -0.06, 0.22]].forEach(([px, py, pz, r]) => {
      const leaf = new T.Mesh(new T.SphereGeometry(r, 10, 8), M(0x6dbb7a));
      leaf.position.set(px, py, pz);
      g.add(leaf);
    });
    g.position.set(x, y, z);
    root.add(g);
    solid(x, z, 0.25, 0.25);
  };
  const extinguisher = (x, y, z, dz = -1) => { // dz: 벽이 있는 쪽 (-1 이면 z 가 작은 쪽)
    box(0.16, 0.45, 0.16, '#d63031', x, y + 0.23, z);
    box(0.06, 0.1, 0.06, '#222831', x, y + 0.5, z);
    box(0.28, 0.6, 0.05, '#f3f4f5', x, y + 0.3, z + 0.1 * dz);
  };

  // ───────── 바깥 풍경(오른쪽 창문 밖): 운동장 잔디와 나무 ─────────
  let outsideDone = false;
  function outside() {
    if (outsideDone) return;
    outsideDone = true;
    const ground = new T.Mesh(new T.PlaneGeometry(230, 230), M(0xa9d98f));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(126, -0.05, 20);
    root.add(ground);
    for (let i = 0; i < 18; i += 1) {
      const tr = new T.Group();
      const trunk = new T.Mesh(new T.CylinderGeometry(0.18, 0.24, 1.6, 6), M(0x9a6b45));
      trunk.position.y = 0.8;
      const crown = new T.Mesh(new T.SphereGeometry(1.3 + (i % 3) * 0.3, 10, 8), M([0x6dbb7a, 0x5aab6a, 0x82c987][i % 3]));
      crown.position.y = 2.7;
      tr.add(trunk, crown);
      tr.position.set(20 + (i % 4) * 5 + ((i * 7) % 3), 0, -8 + i * 2.3);
      root.add(tr);
    }
  }

  // ───────── 공간 만들기 ─────────
  const build = {};

  // 복도: 신발장, 학교 소식판(마음 지도), 트로피장, 정수기, 창문, 비상구
  let mapCtx = null;
  let mapTexture = null;
  const drawMap = () => {
    if (!mapCtx) return;
    const g = mapCtx;
    const w = 512;
    const h = 420;
    g.fillStyle = '#fff7d6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4f9d6c'; g.fillRect(0, 0, w, 62);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = FONT(36); g.fillText('🗺️ 우리 학교 마음 지도', w / 2, 44);
    g.textAlign = 'left';
    catalog.forEach((c, i) => {
      const y = 82 + i * 74;
      const on = view.unlocked.has(c.id);
      g.fillStyle = on ? '#c9f5df' : '#ffffff';
      rr(g, 22, y, w - 44, 62, 16); g.fill();
      g.lineWidth = 4; g.strokeStyle = '#2b2d42'; g.stroke();
      g.fillStyle = '#2b2d42'; g.font = FONT(32);
      g.fillText(`${c.icon} ${c.name}`, 44, y + 41);
      g.textAlign = 'right';
      g.fillText(on ? '✅ 열렸어요' : `🔒 ⭐${c.cost}`, w - 44, y + 41);
      g.textAlign = 'left';
    });
    g.fillStyle = '#2b2d42'; g.textAlign = 'center'; g.font = FONT(28);
    g.fillText('별을 모으면 새 공간이 열려요!', w / 2, h - 18);
    if (mapTexture) mapTexture.needsUpdate = true;
  };
  build.hall1 = () => {
    const zr = ZONES.hall1;
    outside();
    shell(zr, tileTex(zr.x1 - zr.x0, zr.z1 - zr.z0));
    const wins = [-4.6, -1.6, 1.4, 4.4].map((c) => ({ a: c - 1.0, b: c + 1.0, y0: 0.95, y1: 2.5 }));
    wall('z', zr.x1 + 0.15, zr.z0 - 0.3, zr.z1, { color: theme.wall, gaps: wins });
    windowFrames('z', zr.x1 + 0.0, wins, 0);
    wall('x', zr.z0 - 0.15, zr.x0 - 0.3, zr.x1 + 0.3, { color: theme.wall }); // 복도 끝벽
    // 신발장 (왼쪽 벽, 교실 앞쪽)
    const lockers = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#e7d9bd'; g.fillRect(0, 0, w, h);
      const cols = ['#ffd6a5', '#bde0fe', '#caffbf', '#ffc6ff'];
      for (let r = 0; r < 2; r += 1) for (let c = 0; c < 4; c += 1) {
        g.fillStyle = cols[(r + c) % 4]; rr(g, 6 + c * 62, 6 + r * 124, 56, 116, 8); g.fill();
        g.strokeStyle = 'rgba(43,45,66,.35)'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#7a6a5a'; g.fillRect(26 + c * 62, 66 + r * 124, 12, 6);
      }
    });
    box(0.5, 1.1, 2.0, '#d9c7a1', 7.55, 0.55, -4.6);
    panel(lockers, 2.0, 1.06, 7.81, 0.55, -4.6, Math.PI / 2, true);
    solid(7.55, -4.6, 0.28, 1.0);
    plant(7.7, -3.2);
    // 학교 소식판 = 마음 지도 (별로 열 공간이 한눈에)
    const mc = document.createElement('canvas');
    mc.width = 512; mc.height = 420;
    mapCtx = mc.getContext('2d');
    mapTexture = new T.CanvasTexture(mc);
    mapTexture.colorSpace = T.SRGBColorSpace;
    mapTexture.anisotropy = 4;
    drawMap();
    box(0.06, 2.0, 2.4, '#b78f5c', 7.33, 1.7, -1.0);
    panel(mapTexture, 2.3, 1.9, 7.37, 1.7, -1.0, Math.PI / 2);
    // 트로피장
    box(0.45, 1.2, 1.5, '#cba67a', 7.55, 0.6, 1.4);
    const glass = new T.Mesh(new T.BoxGeometry(0.4, 0.7, 1.4), track(new T.MeshPhongMaterial({ color: 0xd7ecff, transparent: true, opacity: 0.25, shininess: 80, depthWrite: false })));
    glass.position.set(7.58, 1.55, 1.4);
    root.add(glass);
    box(0.4, 0.04, 1.4, '#cba67a', 7.58, 1.2, 1.4);
    [[0.0, 0.3], [0.45, 0.22], [-0.45, 0.26]].forEach(([dz, hh]) => {
      const cup = new T.Mesh(new T.CylinderGeometry(0.1, 0.05, hh, 10), M(0xffc83d));
      cup.position.set(7.6, 1.22 + hh / 2, 1.4 + dz);
      root.add(cup);
    });
    solid(7.55, 1.4, 0.28, 0.78);
    // 교실 문 위 이름표 (복도 쪽)
    panel(signTex([[school ? `🏫 ${school}` : '🏫 우리 학교', 34], [label || '우리 반', 52]], { bg: theme.plaque, ink: theme.plaqueInk, w: 640, h: 170 }), 2.4, 0.64, 7.34, 2.55, 4.7, Math.PI / 2);
    // 오른쪽: 벤치, 정수기, 화분
    box(0.42, 0.06, 1.8, '#d1ae7e', 10.7, 0.45, -3.0);
    box(0.4, 0.45, 0.06, '#d1ae7e', 10.88, 0.7, -3.0);
    [-3.8, -2.2].forEach((z) => box(0.06, 0.42, 0.06, '#8e99a4', 10.7, 0.21, z));
    solid(10.7, -3.0, 0.25, 0.95);
    box(0.4, 1.0, 0.4, '#f1f2f4', 10.6, 0.5, 1.0);
    box(0.28, 0.4, 0.28, '#7ec8ff', 10.6, 1.2, 1.0);
    box(0.1, 0.06, 0.1, '#2b2d42', 10.4, 0.85, 1.0);
    solid(10.6, 1.0, 0.25, 0.25);
    plant(10.5, -5.6);
    plant(10.5, 5.7);
    // 끝벽: 비상구 + 소화기
    panel(doorTex('#6cc08e', true), 1.1, 2.1, 9.2, 1.05, -6.18, 0, true);
    panel(signTex([['🏃 비상구', 44]], { bg: '#37b27f', ink: '#ffffff', w: 360, h: 100 }), 1.2, 0.34, 9.2, 2.4, -6.17, 0);
    extinguisher(10.5, 0.1, -6.1);
    // 바닥의 발자국 (걸어요!)
    const foot = canvasTex(64, 64, (g) => { g.font = '48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('👣', 32, 34); });
    for (let i = 0; i < 8; i += 1) {
      const m = new T.Mesh(new T.PlaneGeometry(0.5, 0.5), new T.MeshBasicMaterial({ map: foot, transparent: true, opacity: 0.8, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(9.15 + (i % 2 ? 0.55 : -0.55), 0.01, -5 + i * 1.4);
      root.add(m);
    }
  };

  // 복도 2: 과학실·음악실 문, 벽화, 소화전, 화장실 문 자리
  build.hall2 = () => {
    const zr = ZONES.hall2;
    shell(zr, tileTex(zr.x1 - zr.x0, zr.z1 - zr.z0));
    const wins = [{ a: 6.4, b: 8.05, y0: 0.95, y1: 2.5 }];
    const wcGap = { a: 10.4, b: 11.6, y0: 0, y1: 2.2 };
    wall('z', zr.x1 + 0.15, zr.z0, zr.z1, { color: theme.wall, gaps: [...wins, wcGap] });
    windowFrames('z', zr.x1 + 0.0, wins, 0);
    box(1.3, 0.06, 0.3, '#f1f2f4', 11.0, 2.25, 11.0); // 화장실 문틀 윗부분
    wall('z', 7.15, zr.z0, zr.z1, { color: theme.wall }); // 왼쪽 벽 (옆 교실들)
    // 왼쪽 벽: 과학실, 벽화, 음악실, 소화전
    [[8.4, '🔬 과학실', '#cfe8ff'], [12.4, '🎵 음악실', '#ffd9e8']].forEach(([z, name, color]) => {
      panel(doorTex(color, true), 1.1, 2.1, 7.31, 1.05, z, Math.PI / 2, true);
      panel(signTex([[name, 44]], { w: 360, h: 100 }), 1.2, 0.34, 7.3, 2.45, z, Math.PI / 2);
    });
    const mural = canvasTex(512, 256, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#9fd8ff'); sky.addColorStop(1, '#e8f7ff'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8fd18a'; g.beginPath(); g.ellipse(120, 260, 220, 90, 0, 0, 7); g.fill(); g.fillStyle = '#a8e0a0'; g.beginPath(); g.ellipse(400, 270, 220, 80, 0, 0, 7); g.fill();
      g.font = '70px sans-serif'; g.textAlign = 'center'; g.fillText('🌳', 90, 190); g.fillText('🏫', 256, 170); g.fillText('🌈', 420, 100); g.fillText('🦋', 330, 210); g.fillText('☀️', 70, 70);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = FONT(34); g.fillText('우리 학교 · 우리 반 · 우리 모두', w / 2, 240);
    });
    box(0.06, 1.6, 3.0, '#b78f5c', 7.33, 1.55, 10.4);
    panel(mural, 2.9, 1.5, 7.37, 1.55, 10.4, Math.PI / 2);
    box(0.3, 0.7, 0.55, '#e74c3c', 7.45, 1.1, 14.3); // 소화전함
    panel(signTex([['🧯 소화전', 34]], { w: 280, h: 90 }), 0.7, 0.22, 7.62, 1.65, 14.3, Math.PI / 2);
    // 오른쪽 벽(화장실 쪽)은 창문 대신 게시판
    const notice = (title, rows, z, color) => {
      const tex = canvasTex(256, 340, (g, w, h) => {
        g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(12, 12, w - 24, h - 24);
        g.fillStyle = '#2b2d42'; g.textAlign = 'center'; g.font = FONT(34); g.fillText(title, w / 2, 62);
        g.textAlign = 'left'; g.font = FONT(26); rows.forEach((r, i) => g.fillText(r, 28, 120 + i * 48));
      });
      box(0.06, 1.1, 0.9, '#b78f5c', 10.97, 1.6, z);
      panel(tex, 0.82, 1.02, 10.93, 1.6, z, -Math.PI / 2);
    };
    notice('🍚 급식', ['월 비빔밥', '화 돈가스', '수 카레', '목 볶음밥'], 9.0, '#ffd6a5');
    notice('🛡️ 안전', ['복도는 걸어요', '계단은 천천히', '친구와 사이좋게'], 13.0, '#bde0fe');
    plant(10.5, 7.2);
    plant(10.5, 14.4);
    box(0.4, 0.06, 1.6, '#d1ae7e', 10.7, 0.45, 8.6);
    [-0.7, 0.7].forEach((dz) => box(0.06, 0.42, 0.06, '#8e99a4', 10.7, 0.21, 8.6 + dz));
    solid(10.7, 8.6, 0.25, 0.85);
  };

  // 화장실: 세면대 4개와 거울, 칸막이 3칸, 손 씻기 포스터
  build.wc = () => {
    const zr = ZONES.wc;
    const blue = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#f4fbff'; g.fillRect(0, 0, w, h); g.fillStyle = '#cfe8f7'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
      g.fillStyle = 'rgba(120,150,170,.4)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    }, [(zr.x1 - zr.x0) / 0.8, (zr.z1 - zr.z0) / 0.8]);
    shell(zr, blue, { stripe: false });
    const wallC = '#e6f4fb';
    wall('z', zr.x1 + 0.15, zr.z0 - 0.3, zr.z1 + 0.3, { color: wallC }); // 오른쪽
    wall('x', zr.z0 - 0.15, zr.x0, zr.x1 + 0.3, { color: wallC }); // 앞
    wall('x', zr.z1 + 0.15, zr.x0, zr.x1 + 0.3, { color: wallC }); // 뒤
    // 반쯤 높이의 타일 띠
    [[zr.x1 - 0.02, (zr.z0 + zr.z1) / 2, 0.04, 1.4, zr.z1 - zr.z0], [(zr.x0 + zr.x1) / 2, zr.z0 + 0.02, zr.x1 - zr.x0, 1.4, 0.04]].forEach(([x, z, w, hh, d]) => {
      box(w, 0.06, d, '#7ec8ff', x, hh, z);
    });
    // 세면대 4개 (뒤쪽 벽)
    const mirror = canvasTex(128, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#e9f6ff'); gr.addColorStop(1, '#b9dff5'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(10, 120); g.lineTo(60, 8); g.lineTo(84, 8); g.lineTo(34, 120); g.fill(); });
    [12.5, 13.8, 15.1, 16.4].forEach((x) => {
      box(0.62, 0.12, 0.46, '#ffffff', x, 0.82, zr.z1 - 0.3);
      box(0.2, 0.78, 0.2, '#e9eef2', x, 0.4, zr.z1 - 0.22);
      box(0.05, 0.16, 0.05, '#c0c7cf', x, 0.97, zr.z1 - 0.46);
      box(0.05, 0.05, 0.14, '#c0c7cf', x, 1.04, zr.z1 - 0.4);
      box(0.1, 0.18, 0.1, '#ff9fcb', x + 0.28, 0.99, zr.z1 - 0.46); // 비누
      panel(mirror, 0.7, 0.8, x, 1.65, zr.z1 - 0.03, Math.PI);
      box(0.76, 0.86, 0.03, '#f3f4f5', x, 1.65, zr.z1 - 0.005);
    });
    solid(14.5, zr.z1 - 0.3, 2.3, 0.3);
    // 칸막이 3칸 (오른쪽 벽): 문은 닫혀 있다
    [['#ffc6ff', 9.2], ['#bde0fe', 10.6], ['#caffbf', 12.0]].forEach(([c, z]) => {
      box(0.06, 1.8, 1.3, c, 16.0, 0.95, z);
      box(1.0, 1.8, 0.05, '#e8eef2', 16.5, 0.95, z + 0.65);
      box(0.08, 0.1, 0.08, '#37b27f', 15.95, 1.5, z); // "비어 있음" 표시등 대신 작은 잠금쇠
    });
    box(1.0, 1.8, 0.05, '#e8eef2', 16.5, 0.95, 8.55);
    solid(16.4, 10.4, 0.7, 2.2);
    // 왼쪽 벽(복도쪽 벽 안쪽)에 손 씻기 포스터, 앞벽에 거울 옆 안내
    const wash = canvasTex(256, 340, (g, w, h) => {
      g.fillStyle = '#bde0fe'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(14, 14, w - 28, h - 28);
      g.fillStyle = '#2b2d42'; g.textAlign = 'center'; g.font = FONT(36); g.fillText('손 씻기', w / 2, 70); g.fillText('6단계', w / 2, 114);
      g.font = '70px sans-serif'; g.fillText('🫧', w / 2, 210); g.font = FONT(26); g.fillText('비누로 30초!', w / 2, 270);
    });
    panel(wash, 0.8, 1.06, 13.0, 1.7, zr.z0 + 0.02, 0, false);
    // 쓰레기통, 핸드 드라이어
    const bin = new T.Mesh(new T.CylinderGeometry(0.2, 0.17, 0.5, 12), M(0x9aa3ad));
    bin.position.set(11.8, 0.25, 13.7);
    root.add(bin);
    solid(11.8, 13.7, 0.22, 0.22);
    box(0.3, 0.45, 0.2, '#f1f2f4', 11.8, 1.1, zr.z1 - 0.12);
    // 문 위 표지판 (복도쪽)
    panel(signTex([['🚻 화장실', 46]], { bg: '#bde0fe', w: 360, h: 100 }), 1.2, 0.34, 10.97, 2.5, 11.0, -Math.PI / 2);
  };

  // 계단: 17칸, 난간, 높은 창
  build.stairs = () => {
    const zr = ZONES.stairs;
    const z2 = ZONES.floor2;
    outside();
    // 천장은 2층 천장과 이어진 하나의 판
    const ceil = new T.Mesh(new T.PlaneGeometry(zr.x1 - zr.x0, zr.z1 - zr.z0), track(new T.MeshBasicMaterial({ color: 0xf2f1ec })));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((zr.x0 + zr.x1) / 2, zr.h, (zr.z0 + zr.z1) / 2);
    root.add(ceil);
    const floor0 = new T.Mesh(new T.PlaneGeometry(zr.x1 - zr.x0, zr.z1 - zr.z0), track(new T.MeshLambertMaterial({ map: tileTex(zr.x1 - zr.x0, zr.z1 - zr.z0) })));
    floor0.rotation.x = -Math.PI / 2;
    floor0.position.set((zr.x0 + zr.x1) / 2, 0.003, (zr.z0 + zr.z1) / 2);
    root.add(floor0);
    const tall = { y: 0, h: zr.h };
    const wins = [{ a: 16.2, b: 20.3, y0: 1.2, y1: 6.0 }];
    wall('z', zr.x1 + 0.15, zr.z0, zr.z1, { ...tall, color: theme.wall, gaps: wins });
    windowFrames('z', zr.x1, wins, 0);
    box(0.08, 4.8, 0.05, '#f3f4f5', zr.x1, 3.6, 18.25);
    wall('z', 7.15, zr.z0, zr.z1, { ...tall, color: theme.wall });
    // 계단 17칸 (한 칸 = 높이 0.2, 앞 모서리에 노란 미끄럼 방지)
    const run = (zr.z1 - zr.z0) / STAIRS.steps;
    const rise = STAIRS.rise / STAIRS.steps;
    for (let i = 0; i < STAIRS.steps; i += 1) {
      const top = (i + 1) * rise;
      box(zr.x1 - zr.x0, top, run, i % 2 ? '#e7d3ad' : '#dcc79c', 9.15, top / 2, zr.z0 + run * (i + 0.5));
      box(zr.x1 - zr.x0 - 0.3, 0.03, 0.07, '#ffd166', 9.15, top + 0.01, zr.z0 + run * i + 0.07);
    }
    // 난간 (양쪽 비스듬한 막대 + 기둥)
    const ang = Math.atan2(STAIRS.rise, zr.z1 - zr.z0);
    const len = Math.hypot(STAIRS.rise, zr.z1 - zr.z0);
    [7.6, 10.7].forEach((x) => {
      const rail = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, len, 8), M('#8e99a4'));
      rail.rotation.x = Math.PI / 2 - ang;
      rail.position.set(x, 1.0 + STAIRS.rise / 2, (zr.z0 + zr.z1) / 2);
      root.add(rail);
      for (let i = 0; i <= 5; i += 1) {
        const t = i / 5;
        const post = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 1.0, 6), M('#8e99a4'));
        post.position.set(x, STAIRS.rise * t + 0.5, zr.z0 + (zr.z1 - zr.z0) * t);
        root.add(post);
      }
    });
    // 안내
    panel(signTex([['⚠️ 계단은 천천히!', 40], ['한 칸씩 걸어요', 34]], { bg: '#fff3c4', w: 420, h: 150 }), 1.5, 0.54, 7.31, 1.7, 16.0, Math.PI / 2);
    panel(signTex([['⬆️ 2층', 56]], { bg: '#bde0fe', w: 300, h: 110 }), 1.2, 0.44, 9.15, 5.2, 21.0, Math.PI);
  };

  // 2층 복도: 도서관·컴퓨터실은 곧 열려요, 큰 창, 환영 현수막
  build.floor2 = () => {
    const zr = ZONES.floor2;
    shell(zr, tileTex(zr.x1 - zr.x0, zr.z1 - zr.z0, '#e9eef5', '#dde5f0'), { stripe: false });
    const stripe = new T.Mesh(new T.PlaneGeometry(0.35, zr.z1 - zr.z0), M('#9fd0ff'));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(9.15, zr.y + 0.006, (zr.z0 + zr.z1) / 2);
    root.add(stripe);
    const wins = [{ a: 22.2, b: 24.2, y0: zr.y + 0.95, y1: zr.y + 2.5 }, { a: 26.6, b: 28.6, y0: zr.y + 0.95, y1: zr.y + 2.5 }].map((w) => ({ ...w, y0: w.y0 - zr.y, y1: w.y1 - zr.y }));
    wall('z', zr.x1 + 0.15, zr.z0, zr.z1, { y: zr.y, color: '#e3ecf7', gaps: wins });
    windowFrames('z', zr.x1, wins, zr.y);
    wall('z', 7.15, zr.z0, zr.z1, { y: zr.y, color: '#e3ecf7' });
    wall('x', zr.z1 + 0.15, zr.x0 - 0.3, zr.x1 + 0.3, { y: zr.y, color: '#e3ecf7', gaps: [{ a: 8.1, b: 10.2, y0: 0.9, y1: 2.5 }] });
    windowFrames('x', zr.z1, [{ a: 8.1, b: 10.2, y0: 0.9, y1: 2.5 }], zr.y);
    [[23.4, '📚 도서관', '#ffe9b3'], [27.4, '💻 컴퓨터실', '#d9e6ff']].forEach(([z, name, color]) => {
      panel(doorTex(color, true), 1.1, 2.1, 7.31, zr.y + 1.05, z, Math.PI / 2, true);
      panel(signTex([[name, 40], ['🔒 곧 열려요', 28]], { w: 360, h: 120 }), 1.2, 0.42, 7.3, zr.y + 2.5, z, Math.PI / 2);
    });
    const banner = canvasTex(1024, 220, (g, w, h) => {
      g.fillStyle = '#ffd166'; rr(g, 6, 6, w - 12, h - 12, 40); g.fill(); g.lineWidth = 8; g.strokeStyle = '#2b2d42'; g.stroke();
      g.fillStyle = '#2b2d42'; g.textAlign = 'center'; g.font = FONT(84); g.fillText('🎉 2층에 왔어요! 🎉', w / 2, 120);
      g.font = FONT(40); g.fillText('별을 더 모으면 새 방이 열려요', w / 2, 178);
    });
    panel(banner, 3.4, 0.73, 9.15, zr.y + 2.55, zr.z1 - 0.18, Math.PI, false);
    plant(10.4, zr.z0 + 1.0, zr.y);
    plant(8.0, zr.z1 - 0.9, zr.y);
    box(0.42, 0.06, 1.6, '#d1ae7e', 10.7, zr.y + 0.45, 25.2);
    [-0.7, 0.7].forEach((dz) => box(0.06, 0.42, 0.06, '#8e99a4', 10.7, zr.y + 0.21, 25.2 + dz));
    solid(10.7, 25.2, 0.25, 0.85);
    // 끝에서 내려다보이는 바깥: 아래쪽으로 땅
  };

  // ───────── 막힌 곳(가림막·잠긴 문) ─────────
  const ringMat = () => new T.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false });
  function addRing(x, z, r, y = 0) {
    const ring = new T.Mesh(new T.RingGeometry(r - 0.14, r, 40), ringMat());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.05, z);
    root.add(ring);
    rings.push(ring);
    return ring;
  }
  function priceSign(c, w = 1.5) {
    return signTex([[`🔒 ${c.icon} ${c.name}`, 44], [`⭐ ${c.cost}`, 46]], { bg: '#fff3c4', w: 420, h: 170 });
  }
  const item = (id) => catalog.find((c) => c.id === id);

  // 복도 가운데를 가로막는 "공사 중" 가림막 (복도 2, 계단 앞)
  function tempWall(id, z, zr) {
    const c = item(id);
    const g = new T.Group();
    const w = zr.x1 - zr.x0;
    const cx = (zr.x0 + zr.x1) / 2;
    const tex = canvasTex(512, 256, (cg, tw, th) => {
      cg.fillStyle = '#d9b77c'; cg.fillRect(0, 0, tw, th);
      for (let i = 0; i < 40; i += 1) { cg.fillStyle = 'rgba(120,80,40,.12)'; cg.fillRect(Math.random() * tw, Math.random() * th, 90, 3); }
      [0, th - 54].forEach((y) => {
        cg.fillStyle = '#ffd23f'; cg.fillRect(0, y, tw, 54);
        cg.fillStyle = '#2b2d42';
        for (let x = -60; x < tw + 60; x += 70) { cg.beginPath(); cg.moveTo(x, y + 54); cg.lineTo(x + 34, y); cg.lineTo(x + 62, y); cg.lineTo(x + 28, y + 54); cg.fill(); }
      });
      cg.fillStyle = '#2b2d42'; cg.textAlign = 'center'; cg.font = FONT(54); cg.fillText('🚧 공사 중', tw / 2, 112);
      cg.font = FONT(38); cg.fillText(`${c.icon} ${c.name} · ⭐${c.cost}`, tw / 2, 168);
    });
    const slab = new T.Mesh(new T.BoxGeometry(w, zr.h, 0.14), M('#c9a56b')); // 천장까지 막는다
    slab.position.set(cx, zr.h / 2, z);
    g.add(slab);
    panel(tex, w - 0.1, 2.3, cx, 1.2, z - 0.08, Math.PI, true, {}, g);
    root.add(g);
    const col = solid(cx, z, w / 2, 0.14);
    const b = { id, x: cx, z: z - 1.1, r: 1.7, y: 0, group: g, cols: [col], kind: 'wall' };
    b.ring = addRing(b.x, b.z, 1.3);
    b.open = () => { unsolid(col); };
    barriers.push(b);
    return b;
  }

  // 잠긴 문
  function lockedDoor(id, spec) {
    const c = item(id);
    const g = new T.Group();
    const leaf = new T.Mesh(new T.BoxGeometry(spec.w, 2.1, spec.d), M('#dcc9a6'));
    leaf.position.set(spec.x, 1.05, spec.z);
    g.add(leaf);
    const face = panel(doorTex('#e9dcc4', false), spec.w > spec.d ? spec.w : spec.d, 2.1, spec.fx, 1.05, spec.fz, spec.ry, true, {}, g);
    panel(priceSign(c), 1.2, 0.48, spec.sx, 2.55, spec.sz, spec.ry, false, { transparent: true }, g);
    root.add(g);
    const col = solid(spec.x, spec.z, spec.cw, spec.cd);
    const b = { id, x: spec.px, z: spec.pz, r: 1.7, y: 0, group: g, cols: [col], kind: 'door', face };
    b.ring = addRing(b.x, b.z, 1.3);
    b.open = () => { unsolid(col); };
    barriers.push(b);
    return b;
  }

  function makeBarrier(id) {
    if (barriers.some((b) => b.id === id)) return;
    if (id === 'hall1') {
      // 교실 오른쪽 문: 교실이 만든 문짝을 쓰고, 이쪽에는 팻말과 발판 표시만 더한다
      const c = item('hall1');
      const g = new T.Group();
      panel(priceSign(c), 1.2, 0.48, ROOM.x - 0.1, 2.5, 4.7, -Math.PI / 2, false, { transparent: true }, g);
      root.add(g);
      const b = { id, x: ROOM.x - 1.1, z: 4.7, r: 1.7, y: 0, group: g, cols: [door.collider], kind: 'door', leaf: door.leaf };
      b.ring = addRing(b.x, b.z, 1.3);
      b.open = () => { unsolid(door.collider); };
      barriers.push(b);
    } else if (id === 'hall2') {
      tempWall('hall2', ZONES.hall1.z1 + 0.1, ZONES.hall1);
    } else if (id === 'wc') {
      lockedDoor('wc', { x: 11.08, z: 11.0, w: 0.1, d: 1.2, cw: 0.2, cd: 0.62, fx: 10.99, fz: 11.0, ry: -Math.PI / 2, sx: 10.95, sz: 11.0, px: 10.0, pz: 11.0 });
    } else if (id === 'stairs') {
      tempWall('stairs', ZONES.hall2.z1 - 0.1, ZONES.hall2);
    }
  }

  // ───────── 열기 / 처음 만들기 ─────────
  function buildZone(id) {
    if (built.has(id)) return;
    built.add(id);
    build[id]();
    if (id === 'stairs') { build.floor2(); }
    if (id === 'hall1') drawMap();
  }
  function refreshBarriers() {
    for (const c of catalog) {
      if (view.unlocked.has(c.id)) continue; // eslint-disable-line no-continue
      const hostId = HOST[c.id];
      if (hostId === 'room' || view.unlocked.has(hostId)) makeBarrier(c.id);
    }
  }

  function init(ids) {
    view.unlocked = new Set(ids);
    for (const c of catalog) if (view.unlocked.has(c.id)) buildZone(c.id);
    if (view.unlocked.has('hall1')) openDoorNow();
    refreshBarriers();
    drawMap();
  }
  function openDoorNow() { // 이미 열린 공간: 교실 문은 옆으로 밀려 열려 있다
    if (!door) return;
    if (door.leaf) door.leaf.position.z = 1.25;
    unsolid(door.collider);
  }

  // 별로 새 공간을 열었을 때: 막힌 곳이 사라지고(문은 옆으로 열리고) 공간이 나타난다
  function unlock(id) {
    view.unlocked.add(id);
    const b = barriers.find((x) => x.id === id);
    if (b) {
      b.open();
      barriers.splice(barriers.indexOf(b), 1);
      root.remove(b.ring);
      rings.splice(rings.indexOf(b.ring), 1);
      if (b.kind === 'door' && b.leaf) {
        const from = b.leaf.position.z;
        anims.push({ t: 0, dur: 0.9, fn: (k) => { b.leaf.position.z = from + 1.25 * k; } });
        b.group.visible = false;
      } else if (b.kind === 'door') {
        const from = b.group.position.z;
        anims.push({ t: 0, dur: 0.8, fn: (k) => { b.group.position.z = from + 1.3 * k; }, end: () => root.remove(b.group) });
      } else {
        anims.push({ t: 0, dur: 0.7, fn: (k) => { b.group.scale.y = Math.max(0.01, 1 - k); b.group.position.y = -0.2 * k; }, end: () => root.remove(b.group) });
      }
    }
    buildZone(id);
    refreshBarriers();
    drawMap();
  }

  function update(t, dt) {
    for (const r of rings) { r.material.opacity = 0.5 + Math.sin(t * 2.4) * 0.25; const s = 1 + Math.sin(t * 2.4) * 0.03; r.scale.set(s, s, 1); }
    for (let i = anims.length - 1; i >= 0; i -= 1) {
      const a = anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k * k * (3 - 2 * k));
      if (k >= 1) { if (a.end) a.end(); anims.splice(i, 1); }
    }
  }

  return { barriers, init, unlock, update, drawMap };
}
