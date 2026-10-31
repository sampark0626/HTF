// 마음 쉼터: 숙제를 모두 클리어한 보상. 귀여운 교실을 5분 동안 천천히 걸으며 눈과 마음을 쉰다.
//  - 노란 상의 + 검정 하의 캐릭터로 교실을 돌아다닌다 (왼쪽 조이스틱 / 오른쪽 드래그로 시점 / 키보드 WASD)
//  - 교실에는 선생님과 친구들이 스스로 돌아다닌다 (부모님이 아이별로 만들고 고친다)
//  - 마음 별 7개: 먼 곳 보기, 숨쉬기, 칠판에 고마운 말, 토끼 만나기, 인사 3번
//  - three.js 는 이 화면에 들어올 때만 불러온다 (/vendor/three, npm 패키지)
import { sfx } from './sfx.js';
import { ANIMALS } from './avatar.js';
import { confetti } from './fx.js';

const THREE_URL = '/vendor/three/three.module.js';
export const TOUR_STARS = 7; // server/index.js 의 TOUR_MAX_STARS 와 같아야 한다
const TOUR_SECONDS = 5 * 60;
const GREET_STARS = 3;
const ROOM = { x: 9, z: 7, h: 3.6 };
const PLAYER_R = 0.32;
const WALK = 3.0;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 나: 노란 상의 + 검정 하의
const PLAYER_LOOK = { skin: '#ffdcc0', hair: '#2a2018', hairStyle: 'short', top: '#ffd23f', bottom: '#1a1b25', bottomStyle: 'pants', glasses: false };

// {이름} 은 그 아이의 이름 (세 글자 한국 이름이면 성을 뺀 이름)
const givenName = (full) => (/^[가-힣]{3}$/.test(full) ? full.slice(1) : full);

const WORDS = [
  { icon: '🌼', text: '고마워' },
  { icon: '💛', text: '괜찮아' },
  { icon: '⭐', text: '잘했어' },
];

let threePromise = null;
const loadThree = () => { threePromise ||= import(THREE_URL); return threePromise; };

// ────────────────────────────────────────────────────────────────
// 재료 상자: 색 재질과 캔버스 그림을 한 곳에서 만들고 한꺼번에 치운다
function toolbox(T) {
  const mats = new Map();
  const textures = [];
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
  return { M, canvasTex, dispose() { textures.forEach((t) => t.dispose()); mats.forEach((m) => m.dispose()); } };
}

// ────────────────────────────────────────────────────────────────
// 캐릭터 공장: 외모(look)만 주면 귀여운 3D 캐릭터를 만든다. 쉼터와 부모님의 미리보기가 함께 쓴다.
function characterKit(T, { M, canvasTex }) {
  const blobTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(60,40,20,.38)');
    gr.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });

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

  // look: { skin, hair, hairStyle, top, bottom, bottomStyle, glasses }
  function make(look, { name = '', scale = 1, tagBg } = {}) {
    const skin = look.skin;
    const skirt = look.bottomStyle === 'skirt';
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);
    const cap = (r, len) => new T.CapsuleGeometry(r, len, 6, 12);

    const torso = new T.Mesh(cap(0.25, 0.26), M(look.top));
    torso.position.y = 0.82;
    body.add(torso);
    if (skirt) {
      const sk = new T.Mesh(new T.CylinderGeometry(0.26, 0.4, 0.36, 18), M(look.bottom));
      sk.position.y = 0.5;
      body.add(sk);
    } else {
      const waist = new T.Mesh(new T.CylinderGeometry(0.255, 0.25, 0.24, 14), M(look.bottom));
      waist.position.y = 0.58;
      body.add(waist);
    }
    const mkLeg = (sx) => {
      const piv = new T.Group();
      piv.position.set(sx * 0.12, 0.5, 0);
      const leg = new T.Mesh(cap(0.1, 0.3), M(skirt ? skin : look.bottom));
      leg.position.y = -0.25;
      const shoe = new T.Mesh(new T.SphereGeometry(0.12, 10, 8), M('#ffffff'));
      shoe.scale.set(1, 0.7, 1.5);
      shoe.position.set(0, -0.44, 0.05);
      piv.add(leg, shoe);
      root.add(piv);
      return piv;
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);
    const mkArm = (sx) => {
      const piv = new T.Group();
      piv.position.set(sx * 0.31, 1.0, 0);
      const arm = new T.Mesh(cap(0.075, 0.2), M(look.top));
      arm.position.y = -0.16;
      const hand = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), M(skin));
      hand.position.y = -0.33;
      piv.add(arm, hand);
      body.add(piv);
      return piv;
    };
    const armL = mkArm(-1);
    const armR = mkArm(1);

    const head = new T.Group();
    head.position.y = 1.4;
    body.add(head);
    head.add(new T.Mesh(new T.SphereGeometry(0.34, 22, 16), M(skin)));
    const eyeMat = M('#2b2d42');
    for (const sx of [-1, 1]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.048, 10, 8), eyeMat);
      eye.scale.set(0.9, 1.15, 0.6);
      eye.position.set(sx * 0.12, -0.015, 0.305);
      const hl = new T.Mesh(new T.SphereGeometry(0.014, 6, 6), M('#ffffff'));
      hl.position.set(sx * 0.12 + 0.012, 0.005, 0.335);
      const cheek = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), M('#ff9fb0'));
      cheek.scale.set(1, 0.65, 0.4);
      cheek.position.set(sx * 0.2, -0.085, 0.265);
      head.add(eye, hl, cheek);
    }
    const mouth = new T.Mesh(new T.TorusGeometry(0.05, 0.011, 6, 14, Math.PI), M('#8a3b3b'));
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.115, 0.325);
    head.add(mouth);

    if (look.glasses) {
      const frame = M('#2b2d42');
      for (const sx of [-1, 1]) {
        const ring = new T.Mesh(new T.TorusGeometry(0.075, 0.012, 8, 20), frame);
        ring.position.set(sx * 0.12, -0.012, 0.325);
        head.add(ring);
      }
      const bridge = new T.Mesh(new T.BoxGeometry(0.07, 0.012, 0.012), frame);
      bridge.position.set(0, -0.005, 0.335);
      head.add(bridge);
    }

    // 머리 모양
    const hairMat = M(look.hair);
    const hairCap = new T.Mesh(new T.SphereGeometry(0.36, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), hairMat);
    head.add(hairCap);
    const back = new T.Mesh(new T.SphereGeometry(0.37, 16, 12), hairMat);
    back.scale.set(1, look.hairStyle === 'bob' ? 1.12 : 1, 0.82);
    back.position.set(0, look.hairStyle === 'bob' ? -0.03 : 0, -0.1);
    head.add(back);
    const blob = (r, sx, sy, sz, x, y, z) => {
      const m = new T.Mesh(new T.SphereGeometry(r, 10, 8), hairMat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      head.add(m);
    };
    switch (look.hairStyle) {
      case 'long': {
        const fall = new T.Mesh(cap(0.27, 0.42), hairMat);
        fall.position.set(0, -0.26, -0.2);
        head.add(fall);
        break;
      }
      case 'bob': blob(0.13, 1, 1, 1, -0.3, -0.13, 0); blob(0.13, 1, 1, 1, 0.3, -0.13, 0); break;
      case 'pony': blob(0.13, 0.9, 1.6, 0.9, 0, -0.05, -0.42); break;
      case 'twin': blob(0.13, 0.9, 1.7, 0.9, -0.38, -0.1, -0.06); blob(0.13, 0.9, 1.7, 0.9, 0.38, -0.1, -0.06); break;
      case 'bun': blob(0.15, 1, 1, 1, 0, 0.42, -0.08); break;
      default: break;
    }

    const shadow = new T.Mesh(new T.PlaneGeometry(1.1, 1.1), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    root.add(shadow);
    if (name) {
      const t = tag(name, tagBg);
      t.position.y = 1.98;
      root.add(t);
    }
    root.scale.setScalar(scale);
    root.userData = { body, head, legL, legR, armL, armR, sit: false, baseY: 0 };
    return root;
  }

  // 의자(floor=false) 또는 바닥 쿠션(floor=true)에 앉는다 / 일어선다
  function setSit(ch, floor = false) {
    const u = ch.userData;
    u.sit = true;
    u.baseY = floor ? -0.34 : -0.1;
    u.body.position.y = u.baseY;
    const hip = floor ? 0.16 : 0.42;
    u.legL.position.y = hip;
    u.legR.position.y = hip;
    u.legL.rotation.x = -1.35;
    u.legR.rotation.x = -1.35;
    u.armL.rotation.x = -0.5;
    u.armR.rotation.x = -0.5;
  }
  function standUp(ch) {
    const u = ch.userData;
    u.sit = false;
    u.baseY = 0;
    u.body.position.y = 0;
    u.legL.position.y = 0.5;
    u.legR.position.y = 0.5;
    u.legL.rotation.x = 0;
    u.legR.rotation.x = 0;
    u.armL.rotation.x = 0;
    u.armR.rotation.x = 0;
  }
  return { make, setSit, standUp };
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
  scene.add(new T.HemisphereLight(0xfff6e6, 0xc9a77c, 2.4));
  const sun = new T.DirectionalLight(0xfff1cf, 1.8);
  sun.position.set(-3, 5, 4);
  scene.add(sun);
  const camera = new T.PerspectiveCamera(32, 0.85, 0.1, 50);
  camera.position.set(0, 1.3, 5.3); // 선생님(조금 더 큼)의 이름표까지 들어오게
  camera.lookAt(0, 1.05, 0);
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
    if (ch) { scene.remove(ch); ch.traverse((o) => o.geometry && o.geometry.dispose()); }
    ch = kit.make(lk, { name: nm, scale: rl === 'teacher' ? 1.12 : 0.95, tagBg: rl === 'teacher' ? '#e3f1ff' : '#ffffff' });
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
    if (ch) ch.rotation.y = spin;
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

// ────────────────────────────────────────────────────────────────
export async function startWorld({ user, preview = false, npcs = [], onDone }) {
  const root = document.createElement('div');
  root.className = 'world';
  root.innerHTML = '<div class="world-card"><div class="boot-clock">🌈</div><h2>마음 쉼터를 준비하는 중…</h2></div>';
  document.body.appendChild(root);

  const ctl = { disposed: false, dispose() { this.disposed = true; teardown(); } };
  let teardown = () => root.remove();
  const finishOnce = (() => { let done = false; return (res) => { if (!done) { done = true; ctl.dispose(); onDone(res); } }; })();

  let T;
  try {
    T = await loadThree();
  } catch (err) {
    console.warn('[world] three.js 를 불러오지 못했어요', err);
    return fallbackRest(root, { finish: finishOnce }, ctl);
  }
  if (ctl.disposed) return ctl;

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('[world] WebGL 을 쓸 수 없어요', err);
    return fallbackRest(root, { finish: finishOnce }, ctl);
  }

  // ───────── 화면 뼈대 ─────────
  const emoji = ANIMALS[user.avatar?.animal ?? 0] || '🦊';
  root.innerHTML = `
    <div class="world-stage" id="w-stage"></div>
    <div class="world-hud" id="w-hud" hidden>
      <div class="wh-top">
        <div class="wh-pill" id="w-stars">⭐ 0 / ${TOUR_STARS}</div>
        <div class="wh-pill" id="w-time">🕒 ${fmt(TOUR_SECONDS)}</div>
        <div class="wh-spacer"></div>
        <button class="wh-btn" id="w-mute" aria-label="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
        <button class="wh-btn" id="w-exit">🏁 마치기</button>
      </div>
      <div class="wh-guide" id="w-guide">
        <div class="wh-arrow" id="w-arrow">▲</div>
        <div><b id="w-g-title"></b><small id="w-g-sub"></small></div>
      </div>
      <div class="wh-bubble" id="w-bubble" hidden></div>
      <div class="wh-act" id="w-act" hidden></div>
      <div class="wh-joy" id="w-joy" aria-label="움직이기"><div class="wh-knob" id="w-knob"></div></div>
      <div class="wh-hint" id="w-hint">오른쪽을 드래그하면 시점이 돌아가요</div>
    </div>
    <div class="world-card" id="w-card"></div>`;
  const $ = (s) => root.querySelector(s);
  const stage = $('#w-stage');
  stage.appendChild(renderer.domElement);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

  // ───────── 장면 만들기 ─────────
  const world = buildScene(T, { user, emoji, npcs });
  const { scene, camera, player, colliders, stops, bunny } = world;
  const crowd = world.npcs;

  const state = {
    running: false,
    elapsed: 0,
    stars: new Set(),
    greeted: new Set(),
    yaw: 0,
    pitch: 0.42,
    camPos: new T.Vector3(0, 3, 12),
    holdSec: 0,
    breathCycles: 0,
    breathT: 0,
    bunnyT: 0,
    board: null,
    acting: null,
    lastHudAt: 0,
  };
  const input = { jx: 0, jy: 0, keys: new Set() };
  const pos = player.position;
  pos.set(-0.2, 0, 2.4); // 교실 가운데 복도에서 시작해 칠판을 바라본다 (뒤에 카메라가 놓일 자리가 있다)
  player.rotation.y = Math.PI;
  state.yaw = 0;

  function resize() {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 62 : 52; // 세로 화면에서는 더 넓게
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ───────── 조작: 조이스틱, 드래그 시점, 키보드 ─────────
  const joyEl = $('#w-joy');
  const knob = $('#w-knob');
  let joyId = null;
  const joyMove = (e) => {
    const r = joyEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    input.jx = dx;
    input.jy = -dy;
    knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
  };
  const joyEnd = () => { joyId = null; input.jx = 0; input.jy = 0; knob.style.transform = ''; };
  joyEl.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); e.preventDefault(); });
  joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
  joyEl.addEventListener('pointerup', (e) => { if (e.pointerId === joyId) joyEnd(); });
  joyEl.addEventListener('pointercancel', joyEnd);

  let lookId = null;
  let lookX = 0;
  let lookY = 0;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY; cv.setPointerCapture(e.pointerId); $('#w-hint').classList.add('gone'); });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    state.yaw -= (e.clientX - lookX) * 0.006;
    state.pitch = clamp(state.pitch + (e.clientY - lookY) * 0.004, 0.12, 0.85);
    lookX = e.clientX;
    lookY = e.clientY;
  });
  const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
  cv.addEventListener('pointerup', lookEnd);
  cv.addEventListener('pointercancel', lookEnd);

  const onKeyDown = (e) => { input.keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow')) e.preventDefault(); };
  const onKeyUp = (e) => input.keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  $('#w-mute').addEventListener('click', () => {
    sfx.setMuted(!sfx.muted);
    $('#w-mute').textContent = sfx.muted ? '🔇' : '🔊';
  });
  $('#w-exit').addEventListener('click', () => { if (state.running) finishTour('exit'); });

  // ───────── 말풍선·미션 패널 ─────────
  const bubble = $('#w-bubble');
  const act = $('#w-act');
  const tmp = new T.Vector3();
  function placeOver(el, obj, lift) {
    tmp.setFromMatrixPosition(obj.matrixWorld);
    tmp.y += lift;
    tmp.project(camera);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    el.style.left = `${clamp((tmp.x * 0.5 + 0.5) * w, 120, w - 120)}px`;
    el.style.top = `${clamp((-tmp.y * 0.5 + 0.5) * h, 90, h - 200)}px`;
  }

  function toastStar(text) {
    const t = document.createElement('div');
    t.className = 'wh-toast';
    t.textContent = `⭐ ${text}`;
    root.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function gainStar(id, label) {
    if (state.stars.has(id)) return;
    state.stars.add(id);
    sfx.twinkle();
    const pill = $('#w-stars');
    pill.textContent = `⭐ ${state.stars.size} / ${TOUR_STARS}`;
    pill.classList.remove('pop');
    void pill.offsetWidth;
    pill.classList.add('pop');
    toastStar(label);
    confetti({ count: 30, x: 0.5, y: 0.35, power: 0.7, emojis: ['⭐', '✨'] });
    if (state.stars.size >= TOUR_STARS) toastStar('마음 별을 다 모았어요! 🎉');
  }

  function chooseWord(w) {
    state.board = w;
    world.drawBoard(w.text);
    sfx.pop();
    gainStar('board', `칠판에 "${w.text}" 라고 썼어요`);
  }
  act.addEventListener('click', (e) => {
    const b = e.target.closest('[data-word]');
    if (b) chooseWord(WORDS[Number(b.dataset.word)]);
  });

  // ───────── 한 프레임 ─────────
  let lastSpeed = 0;
  const speed01 = () => lastSpeed;
  function update(dt) {
    const t = performance.now() / 1000;
    if (state.running) state.elapsed += dt;

    // 입력 → 이동 (카메라가 보는 방향 기준)
    let ix = input.jx;
    let iy = input.jy;
    const k = input.keys;
    if (k.has('w') || k.has('arrowup')) iy += 1;
    if (k.has('s') || k.has('arrowdown')) iy -= 1;
    if (k.has('d') || k.has('arrowright')) ix += 1;
    if (k.has('a') || k.has('arrowleft')) ix -= 1;
    if (k.has('q')) state.yaw += dt * 1.6;
    if (k.has('e')) state.yaw -= dt * 1.6;
    const mag = Math.min(1, Math.hypot(ix, iy));
    let speed = 0;
    if (mag > 0.08 && state.running) {
      const fx = -Math.sin(state.yaw);
      const fz = -Math.cos(state.yaw);
      const rx = Math.cos(state.yaw);
      const rz = -Math.sin(state.yaw);
      let mx = fx * iy + rx * ix;
      let mz = fz * iy + rz * ix;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml;
      mz /= ml;
      speed = WALK * mag;
      pos.x += mx * speed * dt;
      pos.z += mz * speed * dt;
      resolve(pos, colliders);
      const want = Math.atan2(mx, mz);
      player.rotation.y += angleDelta(player.rotation.y, want) * (1 - Math.exp(-12 * dt));
    }
    lastSpeed = speed / WALK;
    world.animatePlayer(lastSpeed, t);
    world.animate(t, dt, pos, state);

    if (state.running) handleStops(dt);

    // 카메라 (뒤에서 따라가기). 벽에 막히면 거리를 줄이고 조금 더 위에서 내려다본다
    const baseDist = 5.0;
    const ch = Math.cos(state.pitch);
    const hx = Math.sin(state.yaw) * ch * baseDist;
    const hz = Math.cos(state.yaw) * ch * baseDist;
    let fit = 1;
    if (hx > 0.01) fit = Math.min(fit, (ROOM.x - 0.6 - pos.x) / hx);
    else if (hx < -0.01) fit = Math.min(fit, (-ROOM.x + 0.6 - pos.x) / hx);
    if (hz > 0.01) fit = Math.min(fit, (ROOM.z - 0.6 - pos.z) / hz);
    else if (hz < -0.01) fit = Math.min(fit, (-ROOM.z + 0.6 - pos.z) / hz);
    fit = clamp(fit, 0.3, 1);
    const pitchEff = state.pitch + (1 - fit) * 0.55;
    const dist = baseDist * fit;
    const cp = Math.cos(pitchEff) * dist;
    const target = tmp.set(pos.x + Math.sin(state.yaw) * cp, 1.0 + Math.sin(pitchEff) * dist, pos.z + Math.cos(state.yaw) * cp);
    target.x = clamp(target.x, -ROOM.x + 0.5, ROOM.x - 0.5);
    target.z = clamp(target.z, -ROOM.z + 0.5, ROOM.z - 0.5);
    target.y = clamp(target.y, 0.8, ROOM.h - 0.3);
    state.camPos.x = damp(state.camPos.x, target.x, 7, dt);
    state.camPos.y = damp(state.camPos.y, target.y, 7, dt);
    state.camPos.z = damp(state.camPos.z, target.z, 7, dt);
    camera.position.copy(state.camPos);
    camera.lookAt(pos.x, 1.0, pos.z);
    camera.updateMatrixWorld(true);

    if (state.running && t - state.lastHudAt > 0.2) { state.lastHudAt = t; updateHud(); }
    if (state.running && state.elapsed >= TOUR_SECONDS) finishTour('time');
  }

  const insideStop = (s) => Math.hypot(pos.x - s.x, pos.z - s.z) < s.r;

  let actKey = '';
  function setAct(key, html) {
    if (key === actKey) return false;
    actKey = key;
    if (!html) { act.hidden = true; act.innerHTML = ''; return true; }
    act.hidden = false;
    act.innerHTML = html;
    return true;
  }

  function handleStops(dt) {
    const { window: win, rug, board: brd } = stops;
    let active = null;
    if (!state.stars.has('window') && insideStop(win)) active = 'window';
    else if (!state.stars.has('rug') && insideStop(rug)) active = 'rug';
    else if (!state.stars.has('board') && insideStop(brd)) active = 'board';

    // 먼 곳 바라보기 20초
    if (active === 'window') {
      state.holdSec += dt;
      const left = Math.max(0, 20 - state.holdSec);
      setAct('window', '<div class="act-card"><div class="act-icon">👀</div><b>먼 하늘을 바라봐요</b><small>천천히 눈을 깜빡여요</small><div class="act-bar"><i id="a-bar"></i></div><em id="a-left"></em></div>');
      $('#a-bar').style.width = `${(state.holdSec / 20) * 100}%`;
      $('#a-left').textContent = `${Math.ceil(left)}초`;
      if (state.holdSec >= 20) { gainStar('window', '먼 곳을 바라봤어요'); setAct('', null); }
    }

    // 숨쉬기: 4초 들이쉬고 6초 내쉬기 × 3번
    if (active === 'rug') {
      state.breathT += dt;
      const cycle = 10;
      const phase = state.breathT % cycle;
      const inhale = phase < 4;
      const k = inhale ? phase / 4 : 1 - (phase - 4) / 6;
      setAct('rug', '<div class="act-card breath"><div class="breath-orb" id="a-orb"></div><b id="a-b"></b><small id="a-cnt"></small></div>');
      $('#a-orb').style.transform = `scale(${0.6 + k * 0.7})`;
      $('#a-b').textContent = inhale ? '코로 들이쉬어요… 💨' : '입으로 후~ 내쉬어요 🌬️';
      $('#a-cnt').textContent = `${Math.min(3, state.breathCycles + 1)} / 3번째 숨`;
      if (state.breathT >= cycle * (state.breathCycles + 1)) {
        state.breathCycles += 1;
        sfx.pop();
        if (state.breathCycles >= 3) { gainStar('rug', '편안하게 숨을 쉬었어요'); setAct('', null); }
      }
    }

    // 칠판에 고마운 말 쓰기
    if (active === 'board') {
      setAct('board', `<div class="act-card"><div class="act-icon">✏️</div><b>고마운 마음을 골라요</b><div class="act-words">${WORDS.map((w, i) => `<button class="btn btn-white small" data-word="${i}">${w.icon} ${w.text}</button>`).join('')}</div></div>`);
    }
    if (!active && actKey) setAct('', null);
    state.acting = active ? { id: active } : null;

    // 토끼: 가까이 가만히 있으면 친구가 된다
    if (!state.stars.has('bunny')) {
      const d = Math.hypot(pos.x - bunny.group.position.x, pos.z - bunny.group.position.z);
      if (d < 1.7 && speed01() < 0.3) {
        state.bunnyT += dt;
        if (state.bunnyT > 2.2) { gainStar('bunny', '토끼와 친구가 됐어요'); spawnHearts(bunny.group); }
      } else state.bunnyT = Math.max(0, state.bunnyT - dt * 0.5);
    }

    // 선생님·친구 인사
    let near = null;
    let nearD = 2.5;
    for (const n of crowd) {
      const d = Math.hypot(pos.x - n.group.position.x, pos.z - n.group.position.z);
      if (d < nearD) { nearD = d; near = n; }
    }
    if (near) {
      bubble.hidden = false;
      bubble.innerHTML = `<b>${esc(near.data.name)}</b>${esc(near.msg)}`;
      placeOver(bubble, near.group, 2.0);
      if (!state.greeted.has(near.data.id)) {
        state.greeted.add(near.data.id);
        sfx.pop();
        if (state.greeted.size <= GREET_STARS) gainStar(`greet${state.greeted.size}`, `${near.data.name}와 인사했어요`);
      }
    } else bubble.hidden = true;
  }

  function spawnHearts(obj) {
    obj.updateMatrixWorld(true);
    tmp.setFromMatrixPosition(obj.matrixWorld);
    tmp.y += 0.6;
    tmp.project(camera);
    const x = (tmp.x * 0.5 + 0.5) * stage.clientWidth;
    const y = (-tmp.y * 0.5 + 0.5) * stage.clientHeight;
    for (let i = 0; i < 7; i += 1) {
      const h = document.createElement('span');
      h.className = 'wh-heart';
      h.textContent = ['💗', '💛', '💖'][i % 3];
      h.style.left = `${x + (Math.random() - 0.5) * 80}px`;
      h.style.top = `${y}px`;
      h.style.animationDelay = `${i * 0.12}s`;
      root.appendChild(h);
      setTimeout(() => h.remove(), 2400);
    }
  }

  // ───────── HUD ─────────
  function updateHud() {
    $('#w-time').textContent = `🕒 ${fmt(Math.max(0, TOUR_SECONDS - state.elapsed))}`;
    const g = nextGoal();
    $('#w-g-title').textContent = g.title;
    $('#w-g-sub').textContent = g.sub;
    const arrow = $('#w-arrow');
    if (g.target) {
      arrow.hidden = false;
      const h = state.yaw + Math.PI;
      const dx = g.target.x - pos.x;
      const dz = g.target.z - pos.z;
      const fwdC = dx * Math.sin(h) + dz * Math.cos(h);
      const rightC = dx * -Math.cos(h) + dz * Math.sin(h);
      arrow.style.transform = `rotate(${Math.atan2(rightC, fwdC)}rad)`;
    } else arrow.hidden = true;
  }

  function nextGoal() {
    const S = state.stars;
    if (!S.has('window')) return { title: '👀 창가에서 먼 곳 바라보기', sub: '초록 동그라미에 서서 20초 동안 먼 하늘을 봐요', target: stops.window };
    if (!S.has('rug')) return { title: '🌬️ 러그에서 숨 쉬기', sub: '동그란 러그 위에 서서 크게 3번 숨 쉬어요', target: stops.rug };
    if (!S.has('board')) return { title: '✏️ 칠판에 고마운 말 쓰기', sub: '칠판 앞 동그라미에 서 봐요', target: stops.board };
    if (!S.has('bunny')) return { title: '🐰 토끼 친구 만나기', sub: '토끼 곁에 가만히 서 있어 봐요', target: bunny.group.position };
    const gs = Math.min(GREET_STARS, state.greeted.size);
    if (gs < GREET_STARS && crowd.length) {
      let best = null;
      let bd = 1e9;
      for (const n of crowd) {
        if (state.greeted.has(n.data.id)) continue;
        const d = Math.hypot(pos.x - n.group.position.x, pos.z - n.group.position.z);
        if (d < bd) { bd = d; best = n; }
      }
      return { title: `🧑‍🏫 선생님과 친구들에게 인사하기 (${gs} / ${GREET_STARS})`, sub: '가까이 가면 말을 걸어 줘요. 걸어 다니니까 따라가 봐요!', target: best && best.group.position };
    }
    return { title: '🎉 마음 별을 다 모았어요!', sub: '더 걸어도 좋고, 🏁 마치기를 누르면 선물이 기다려요', target: null };
  }

  // ───────── 시작 · 끝 카드 ─────────
  const card = $('#w-card');
  function showIntro() {
    card.hidden = false;
    const teachers = crowd.filter((n) => n.role === 'teacher').map((n) => n.data.name);
    card.innerHTML = `
      <div class="world-intro">
        <div class="wi-emoji">🌈</div>
        <h2>마음 쉼터</h2>
        <p>숙제를 모두 끝낸 선물이에요.<br>교실을 천천히 걸으며 <b>5분</b> 동안 눈과 마음을 쉬어요.</p>
        ${teachers.length ? `<p class="wi-note">🧑‍🏫 ${esc(teachers.join(', '))}도 교실에 계세요</p>` : ''}
        <ul>
          <li>🕹️ 왼쪽 조이스틱으로 걸어요 (키보드는 WASD)</li>
          <li>👆 화면을 드래그하면 시점이 돌아가요</li>
          <li>⭐ 마음 별 ${TOUR_STARS}개를 모아 보세요</li>
        </ul>
        ${preview ? '<p class="wi-note">👪 미리보기예요 (마음 별은 저장되지 않아요)</p>' : ''}
        <button class="btn btn-yellow big" id="w-go">🚪 교실에 들어가기</button>
        <button class="back-link" id="w-skip">다음에 할래요</button>
      </div>`;
    $('#w-go').onclick = beginTour;
    $('#w-skip').onclick = () => finishOnce({ stars: 0, seconds: 0, skipped: true });
  }

  function beginTour() {
    sfx.unlock();
    sfx.ambientStart();
    sfx.go();
    card.hidden = true;
    $('#w-hud').hidden = false;
    state.running = true;
    state.elapsed = 0;
    updateHud();
  }

  function finishTour(reason) {
    state.running = false;
    sfx.ambientStop();
    $('#w-hud').hidden = true;
    bubble.hidden = true;
    const n = state.stars.size;
    const seconds = Math.round(state.elapsed);
    const msg = n >= TOUR_STARS ? '마음 별을 모두 모았어요! 눈도 마음도 반짝반짝 😊'
      : n >= 4 ? '편안한 시간이었나요? 정말 잘 쉬었어요 😌'
        : n >= 1 ? '잘 쉬었어요. 다음엔 더 많은 별을 모아 봐요 🌟' : '눈을 잠깐 쉬었어요. 수고했어요 💛';
    card.hidden = false;
    card.innerHTML = `
      <div class="world-intro world-result">
        <div class="wi-emoji">${n >= TOUR_STARS ? '🏆' : '🌟'}</div>
        <h2>${reason === 'time' ? '5분이 다 됐어요' : '쉼터 여행 끝!'}</h2>
        <div class="wr-stars">${Array.from({ length: TOUR_STARS }, (_, i) => `<span class="${i < n ? 'on' : ''}" style="--i:${i}">★</span>`).join('')}</div>
        <p class="wr-count">마음 별 <b>${n}</b>개 모았어요${preview ? ' (미리보기)' : ''}</p>
        <p>${esc(msg)}</p>
        <div class="wr-sticker">🌈 마음 쉼터 스티커</div>
        <button class="btn btn-mint big" id="w-back">🎁 선물 받고 돌아가기</button>
      </div>`;
    if (n > 0) { sfx.success(); confetti({ count: 110, x: 0.5, y: 0.5, power: 1.1, emojis: ['⭐', '🌈', '✨'] }); }
    $('#w-back').onclick = () => finishOnce({ stars: n, seconds, skipped: false });
  }

  // ───────── 루프 ─────────
  let raf = 0;
  let last = performance.now();
  let slow = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    renderer.render(scene, camera);
    // 느린 기기: 해상도를 낮춰서 부드럽게
    slow = dt > 0.034 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 40 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); slow = 0; }
  }
  raf = requestAnimationFrame(frame);

  teardown = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    sfx.ambientStop();
    world.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    root.remove();
  };

  showIntro();
  // 개발·점검용: localStorage.htf_debug = '1' 이면 밖에서 상태를 읽고 한 프레임씩 돌려 볼 수 있다
  ctl.debug = { state, input, pos, player, camera, scene, stops, crowd, bunny, colliders, update, renderer, beginTour, finishTour, gainStar, nextGoal, world };
  try { if (localStorage.getItem('htf_debug') === '1') window.__htfWorld = ctl; } catch (_) { /* 무시 */ }
  return ctl;
}

// ────────────────────────────────────────────────────────────────
// 충돌: 방 안쪽으로 가두고, 가구와 겹치면 밀어낸다. 나는 걸어 다니는 친구도 피하고, 친구(NPC)는 가구만 피한다.
function resolve(p, colliders, r = PLAYER_R, npcMode = false) {
  p.x = clamp(p.x, -ROOM.x + 0.6, ROOM.x - 0.6);
  p.z = clamp(p.z, -ROOM.z + 0.7, ROOM.z - 0.55);
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

// 책상 구역(통로 포함)과 왼쪽 복도: 친구들이 길을 찾을 때 쓴다
const inBlock = (x, z) => x > 0.55 && x < 8.3 && z > -2.85 && z < 3.85;
const corridor = (z) => ({ x: 0.2, z: clamp(z, -3.3, 4.4) });
function hitsBlock(a, b) {
  for (let i = 1; i < 14; i += 1) {
    const k = i / 14;
    if (inBlock(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return true;
  }
  return false;
}
function routeTo(a, b) {
  const path = [];
  let cur = { x: a.x, z: a.z };
  if (inBlock(cur.x, cur.z)) { cur = { x: 0.2, z: cur.z }; path.push(cur); } // 통로에서 먼저 왼쪽 복도로 나온다
  if (inBlock(b.x, b.z)) {
    const entry = { x: 0.2, z: b.z };
    if (Math.abs(cur.z - entry.z) > 0.4 || Math.abs(cur.x - entry.x) > 0.4) {
      if (hitsBlock(cur, entry)) { if (Math.abs(cur.x - 0.2) > 0.3) path.push(corridor(cur.z)); path.push(corridor(entry.z)); }
      path.push(entry);
    }
  } else if (hitsBlock(cur, b)) {
    if (Math.abs(cur.x - 0.2) > 0.3) path.push(corridor(cur.z));
    path.push(corridor(b.z));
  }
  path.push({ x: b.x, z: b.z });
  return path;
}

// ────────────────────────────────────────────────────────────────
// 장면: 교실, 가구, 친구와 선생님, 토끼, 빛과 먼지
function buildScene(T, { user, emoji, npcs }) {
  const scene = new T.Scene();
  scene.background = new T.Color(0xd6ecff);
  scene.fog = new T.Fog(0xd6ecff, 30, 130);
  const camera = new T.PerspectiveCamera(52, 1.6, 0.1, 220);
  const colliders = [];
  const tb = toolbox(T);
  const { M, canvasTex } = tb;
  const kit = characterKit(T, tb);
  const place = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };
  const box = (w, h, d, color, x, y, z, parent = scene, opts) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), M(color, opts));
    parent.add(place(m, x, y, z));
    return m;
  };
  const solid = (x, z, hw, hd) => colliders.push({ x, z, hw, hd });

  const softDot = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });

  // ── 빛 ──
  scene.add(new T.HemisphereLight(0xfff6e6, 0xc9a77c, 2.2));
  const sun = new T.DirectionalLight(0xfff1cf, 1.7);
  sun.position.set(-12, 9, 3);
  scene.add(sun);
  for (const [x, z] of [[-3, -2], [3, -2], [3, 3.2], [-4, 3]]) {
    const l = new T.PointLight(0xffe7c2, 9, 12, 2);
    l.position.set(x, 3.1, z);
    scene.add(l);
  }

  // ── 바닥·천장 ──
  const wood = canvasTex(512, 512, (g, w, h) => {
    for (let i = 0; i < 8; i += 1) {
      const y = (h / 8) * i;
      g.fillStyle = ['#dcae72', '#d6a566', '#e0b57c', '#d9aa6d'][i % 4];
      g.fillRect(0, y, w, h / 8);
      g.fillStyle = 'rgba(120,70,30,.18)';
      g.fillRect(0, y, w, 3);
      g.fillRect((i * 97) % 300, y, 3, h / 8);
    }
  }, [6, 5]);
  const floor = new T.Mesh(new T.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), new T.MeshLambertMaterial({ map: wood }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ceil = new T.Mesh(new T.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), M(0xfff8ea));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.h;
  scene.add(ceil);
  for (const [x, z] of [[-3, -2], [3, -2], [3, 3.2], [-4, 3]]) {
    box(1.8, 0.05, 0.8, 0xffffff, x, ROOM.h - 0.03, z, scene, { emissive: 0xfff3d0, emissiveIntensity: 0.9 });
  }

  // ── 벽 (왼쪽은 창문) ──
  const WALL = 0xfff1d6;
  const BAND = 0xbfe8d4;
  box(0.3, ROOM.h, ROOM.z * 2, WALL, ROOM.x + 0.15, ROOM.h / 2, 0);
  box(ROOM.x * 2, ROOM.h, 0.3, WALL, 0, ROOM.h / 2, -ROOM.z - 0.15);
  box(ROOM.x * 2, ROOM.h, 0.3, WALL, 0, ROOM.h / 2, ROOM.z + 0.15);
  box(0.3, 0.95, ROOM.z * 2, WALL, -ROOM.x - 0.15, 0.475, 0);
  box(0.3, 0.75, ROOM.z * 2, WALL, -ROOM.x - 0.15, ROOM.h - 0.375, 0);
  for (const [z0, z1] of [[-7, -5.8], [-2.6, -1.6], [1.6, 2.6], [5.8, 7]]) {
    box(0.3, 1.9, z1 - z0, WALL, -ROOM.x - 0.15, 1.9, (z0 + z1) / 2);
  }
  for (const zc of [-4.2, 0, 4.2]) {
    box(0.12, 0.08, 3.4, 0xffffff, -ROOM.x + 0.02, 0.95, zc);
    box(0.08, 1.9, 0.08, 0xffffff, -ROOM.x + 0.02, 1.9, zc);
    box(0.08, 0.06, 3.2, 0xffffff, -ROOM.x + 0.02, 1.9, zc);
  }
  box(0.05, 1.0, ROOM.z * 2, BAND, ROOM.x - 0.02, 0.5, 0);
  box(ROOM.x * 2, 1.0, 0.05, BAND, 0, 0.5, -ROOM.z + 0.02);
  box(ROOM.x * 2, 1.0, 0.05, BAND, 0, 0.5, ROOM.z - 0.02);

  // ── 창밖: 하늘, 언덕, 나무, 구름 ──
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
  const hillMat = [M(0x9ed48a), M(0x86c57a), M(0xb4dc9a)];
  [[-70, -40, 26], [-85, 10, 34], [-75, 55, 28], [-110, -10, 40]].forEach(([x, z, r], i) => {
    const h = new T.Mesh(new T.SphereGeometry(r, 18, 12), hillMat[i % 3]);
    h.scale.y = 0.38;
    scene.add(place(h, x, -2, z));
  });
  for (let i = 0; i < 14; i += 1) {
    const tr = new T.Group();
    const trunk = new T.Mesh(new T.CylinderGeometry(0.18, 0.24, 1.6, 6), M(0x9a6b45));
    trunk.position.y = 0.8;
    const crown = new T.Mesh(new T.ConeGeometry(1.3 + Math.random() * 0.7, 3.2, 7), M([0x6dbb7a, 0x5aab6a, 0x82c987][i % 3]));
    crown.position.y = 3.0;
    tr.add(trunk, crown);
    scene.add(place(tr, -16 - Math.random() * 30, 0, -30 + Math.random() * 60));
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
  for (const zc of [-4.2, 0, 4.2]) {
    const b = new T.Mesh(
      new T.PlaneGeometry(2.6, 7.5),
      new T.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false })
    );
    b.rotation.set(0, Math.PI / 2, 0.95);
    b.position.set(-6.2, 1.7, zc);
    scene.add(b);
    beams.push(b);
  }

  // ── 칠판, 시계, 포스터 ──
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024;
  boardCanvas.height = 300;
  const bctx = boardCanvas.getContext('2d');
  const boardTex = new T.CanvasTexture(boardCanvas);
  boardTex.colorSpace = T.SRGBColorSpace;
  function drawBoard(word) {
    const w = boardCanvas.width;
    const h = boardCanvas.height;
    bctx.fillStyle = '#2f6a58';
    bctx.fillRect(0, 0, w, h);
    bctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 14; i += 1) bctx.fillRect(Math.random() * w, Math.random() * h, 120, 8);
    bctx.textAlign = 'center';
    bctx.fillStyle = '#f7f3e3';
    bctx.font = '700 62px Jua, "Malgun Gothic", sans-serif';
    bctx.fillText('오늘도 수고했어요 ⭐', w / 2, 100);
    bctx.font = '700 70px Jua, "Malgun Gothic", sans-serif';
    bctx.fillStyle = word ? '#ffe28a' : 'rgba(247,243,227,.6)';
    bctx.fillText(word ? `“${word}”` : '고마운 마음을 여기에 써 봐요', w / 2, 215);
    bctx.font = '46px sans-serif';
    bctx.fillText('🌼', 70, 250);
    bctx.fillText('☁️', w - 80, 90);
    bctx.fillText('✏️', w - 70, 250);
    boardTex.needsUpdate = true;
  }
  drawBoard('');
  box(7.6, 2.5, 0.12, 0x9a6b45, 0, 1.9, -ROOM.z + 0.06);
  const boardMesh = new T.Mesh(new T.PlaneGeometry(7.2, 2.1), new T.MeshBasicMaterial({ map: boardTex }));
  boardMesh.position.set(0, 1.9, -ROOM.z + 0.13);
  scene.add(boardMesh);
  box(7.0, 0.07, 0.25, 0x9a6b45, 0, 0.78, -ROOM.z + 0.2);

  const clockTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
    g.strokeStyle = '#2b2d42'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#2b2d42'; g.font = '700 30px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let n = 1; n <= 12; n += 1) g.fillText(String(n), 128 + Math.sin((n * Math.PI) / 6) * 88, 128 - Math.cos((n * Math.PI) / 6) * 88);
    const d = new Date();
    const hand = (ang, len, wd) => { g.lineWidth = wd; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(ang) * len, 128 - Math.cos(ang) * len); g.stroke(); };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 58, 9);
    hand(d.getMinutes() * (Math.PI / 30), 84, 6);
  });
  const clockMesh = new T.Mesh(new T.CircleGeometry(0.5, 32), new T.MeshBasicMaterial({ map: clockTex }));
  clockMesh.position.set(5.2, 2.9, -ROOM.z + 0.14);
  scene.add(clockMesh);

  function poster(text, sub, color, x, y, z, ry) {
    const tex = canvasTex(256, 340, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(14, 14, w - 28, h - 28);
      g.fillStyle = '#2b2d42'; g.textAlign = 'center';
      g.font = '700 38px Jua, "Malgun Gothic", sans-serif';
      text.split('\n').forEach((l, i) => g.fillText(l, w / 2, 90 + i * 46));
      g.font = '72px sans-serif'; g.fillText(sub, w / 2, 240);
    });
    const m = new T.Mesh(new T.PlaneGeometry(0.95, 1.26), new T.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
  }
  poster('따뜻한 말\n한마디', '💛', '#ffd6a5', ROOM.x - 0.17, 2.0, -3.5, -Math.PI / 2);
  poster('천천히\n숨 쉬기', '🌬️', '#bde0fe', ROOM.x - 0.17, 2.0, 0.2, -Math.PI / 2);
  poster('서로\n도와요', '🤝', '#caffbf', ROOM.x - 0.17, 2.0, 3.0, -Math.PI / 2);
  poster('오늘도\n수고했어요', '🌈', '#ffc6ff', -2.2, 2.0, ROOM.z - 0.17, Math.PI);
  poster('쉬는 시간\n눈 쉬기', '👀', '#fdffb6', 2.2, 2.0, ROOM.z - 0.17, Math.PI);

  // ── 책상과 의자 (줄 사이 통로는 사람이 지나다닐 만큼 넓다) ──
  const chairColors = [0x8ecae6, 0xffb3c6, 0xb5e48c];
  const rows = [-2.4, 0.1, 2.6];
  const cols = [1.4, 3.4, 5.4, 7.4];
  const seats = [];
  rows.forEach((rz, ri) => {
    cols.forEach((cx) => {
      const g = new T.Group();
      box(1.2, 0.06, 0.75, 0xeac58c, 0, 0.72, 0, g);
      box(0.06, 0.7, 0.62, 0xc98d52, -0.54, 0.35, 0, g);
      box(0.06, 0.7, 0.62, 0xc98d52, 0.54, 0.35, 0, g);
      box(0.2, 0.05, 0.28, [0xff8fab, 0x90e0ef, 0xffd166][(ri + Math.round(cx)) % 3], -0.3 + Math.random() * 0.5, 0.78, 0.05, g);
      scene.add(place(g, cx, 0, rz));
      const ch = new T.Group();
      box(0.46, 0.05, 0.46, chairColors[ri], 0, 0.42, 0, ch);
      box(0.46, 0.42, 0.05, chairColors[ri], 0, 0.7, 0.22, ch);
      box(0.06, 0.4, 0.06, 0x7a7f8c, 0, 0.2, 0, ch);
      box(0.4, 0.04, 0.4, 0x7a7f8c, 0, 0.02, 0, ch);
      scene.add(place(ch, cx, 0, rz + 0.85));
      solid(cx, rz + 0.42, 0.62, 0.8);
      seats.push({ kind: 'chair', x: cx, z: rz + 0.85, rot: Math.PI, approach: { x: cx, z: rz + 1.5 }, taken: false });
    });
  });

  // 선생님 책상
  box(1.7, 0.78, 0.75, 0xc98d52, -4.6, 0.39, -6.1);
  box(1.8, 0.05, 0.85, 0xeac58c, -4.6, 0.8, -6.1);
  solid(-4.6, -6.1, 0.9, 0.45);
  const globe = new T.Mesh(new T.SphereGeometry(0.22, 16, 12), M(0x4ea8de));
  scene.add(place(globe, -4.2, 1.1, -6.1));
  box(0.04, 0.2, 0.04, 0x7a7f8c, -4.2, 0.9, -6.1);

  // ── 책장 (오른쪽 벽) ──
  const books = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ color: 0xffffff }), 2 * 4 * 9);
  const dm = new T.Object3D();
  const bookColors = [0xff8fab, 0x90e0ef, 0xffd166, 0xb5e48c, 0xc7a6ff, 0xffa07a, 0x8ecae6];
  let bi = 0;
  for (const zc of [-5.0, 5.0]) {
    box(0.6, 2.2, 3.0, 0xc98d52, ROOM.x - 0.45, 1.1, zc);
    solid(ROOM.x - 0.45, zc, 0.3, 1.5);
    for (let r = 0; r < 4; r += 1) {
      box(0.5, 0.04, 2.8, 0xeac58c, ROOM.x - 0.62, 0.45 + r * 0.5, zc);
      for (let k = 0; k < 9; k += 1) {
        const hgt = 0.28 + Math.random() * 0.12;
        dm.position.set(ROOM.x - 0.66, 0.47 + r * 0.5 + hgt / 2, zc - 1.2 + k * 0.3);
        dm.scale.set(0.3, hgt, 0.2);
        dm.updateMatrix();
        books.setMatrixAt(bi, dm.matrix);
        books.setColorAt(bi, new T.Color(bookColors[(bi + r) % bookColors.length]));
        bi += 1;
      }
    }
  }
  books.instanceMatrix.needsUpdate = true;
  if (books.instanceColor) books.instanceColor.needsUpdate = true;
  scene.add(books);

  // ── 독서 러그와 쿠션 ──
  const RUG = { x: -5.5, z: 3.6 };
  const rugTex = canvasTex(256, 256, (g, w, h) => {
    ['#ffd6a5', '#ffadad', '#fdffb6', '#caffbf', '#9bf6ff'].forEach((c, i) => {
      g.fillStyle = c; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - i * 24, 0, 7); g.fill();
    });
  });
  const rug = new T.Mesh(new T.CircleGeometry(2.4, 40), new T.MeshLambertMaterial({ map: rugTex }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(RUG.x, 0.02, RUG.z);
  scene.add(rug);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const cx = RUG.x + Math.cos(a) * 1.85;
    const cz = RUG.z + Math.sin(a) * 1.85;
    const cu = new T.Mesh(new T.SphereGeometry(0.34, 14, 10), M([0xff8fab, 0x90e0ef, 0xffd166, 0xb5e48c, 0xc7a6ff, 0xffa07a][i]));
    cu.scale.y = 0.45;
    scene.add(place(cu, cx, 0.16, cz));
    // 쿠션에 앉을 때는 러그 한가운데를 바라본다
    seats.push({ kind: 'floor', x: cx, z: cz, rot: Math.atan2(RUG.x - cx, RUG.z - cz), approach: { x: RUG.x + Math.cos(a) * 2.5, z: RUG.z + Math.sin(a) * 2.5 }, taken: false });
  }
  box(0.7, 0.9, 2.2, 0xc98d52, -ROOM.x + 0.45, 0.45, 5.6);
  solid(-ROOM.x + 0.45, 5.6, 0.35, 1.1);

  // ── 화분과 걸린 장식 ──
  function plant(x, z) {
    const g = new T.Group();
    const pot = new T.Mesh(new T.CylinderGeometry(0.28, 0.2, 0.4, 10), M(0xe07a5f));
    pot.position.y = 0.2;
    g.add(pot);
    [[0, 0.75, 0, 0.34], [0.2, 0.62, 0.1, 0.24], [-0.2, 0.66, -0.08, 0.26]].forEach(([px, py, pz, r]) => {
      const leaf = new T.Mesh(new T.SphereGeometry(r, 10, 8), M(0x6dbb7a));
      leaf.position.set(px, py, pz);
      g.add(leaf);
    });
    scene.add(place(g, x, 0, z));
    colliders.push({ x, z, r: 0.35 });
  }
  [[-8.2, -6.2], [8.2, -6.2], [-8.2, 6.3], [8.2, 0.1], [-1.2, 6.2]].forEach(([x, z]) => plant(x, z));

  const lanterns = [];
  [[-6, 0.3, 2.9], [-2.5, -3, 2.8], [1.5, 1.2, 3.0], [5.5, -4, 2.85], [-6, 5.2, 2.9], [3, 5.6, 2.8]].forEach(([x, z, y], i) => {
    const g = new T.Group();
    const orb = new T.Mesh(new T.SphereGeometry(0.2, 14, 10), new T.MeshBasicMaterial({ color: [0xffd9a0, 0xffc2d1, 0xcdeac0, 0xbde0fe][i % 4] }));
    orb.scale.y = 1.2;
    g.add(orb);
    const cord = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, ROOM.h - y, 4), M(0x888888));
    cord.position.y = (ROOM.h - y) / 2 + 0.2;
    g.add(cord);
    scene.add(place(g, x, y, z));
    lanterns.push({ g, y, ph: i * 1.3 });
  });

  const DUST = 140;
  const dustGeo = new T.BufferGeometry();
  const dp = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i += 1) { dp[i * 3] = -8 + Math.random() * 16; dp[i * 3 + 1] = 0.3 + Math.random() * 3; dp[i * 3 + 2] = -6 + Math.random() * 12; }
  dustGeo.setAttribute('position', new T.BufferAttribute(dp, 3));
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ size: 0.09, map: softDot, color: 0xfff4d0, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true }));
  scene.add(dust);

  // ── 나 ──
  const player = kit.make(PLAYER_LOOK, { name: `${emoji} ${user.name}`, scale: 0.95, tagBg: '#fff7c2' });
  scene.add(player);

  // ── 친구와 선생님: 스스로 걸어 다닌다 ──
  const NAV = {
    free: [[-2.4, -4.2], [-1.4, 0.5], [-3.2, 2.4], [-1.0, 5.2], [1.8, 5.3], [4.4, 5.3], [6.6, 5.1], [-6.4, -2.2], [-6.4, 1.8], [2.2, -4.5], [5.4, -4.2], [-0.8, -3.2]],
    board: [[-1.6, -5.3], [0.4, -5.4], [2.2, -5.3]],
    window: [[-7.6, -3.9], [-7.6, 0.1], [-7.6, 4.1]],
    shelf: [[7.4, -5.0], [7.4, 5.0]],
    aisle: [[1.0, -0.73], [3.0, -0.73], [5.0, -0.73], [7.0, -0.73], [1.0, 1.77], [3.0, 1.77], [5.0, 1.77], [7.0, 1.77]],
  };
  const SPAWN = NAV.free.slice().sort(() => Math.random() - 0.5);
  const kidGiven = givenName(user.name);
  const crowd = (npcs || []).map((data, i) => {
    const teacher = data.role === 'teacher';
    const g = kit.make(data.look, { name: data.name, scale: teacher ? 1.12 : 0.92, tagBg: teacher ? '#e3f1ff' : '#ffffff' });
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
    const seat = seats.find((s) => s.kind === 'chair' && !s.taken && Math.random() < 0.5) || seats.find((s) => s.kind === 'chair' && !s.taken);
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
    n.path = routeTo(n.group.position, { x: p[0] ?? p.x, z: p[1] ?? p.z });
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
      else if (!startChat(n)) walkTo(n, pick(NAV.window), 'gaze', { x: -ROOM.x, z: 0 });
      return;
    }
    if (r < 0.3) walkTo(n, pick(NAV.free), 'idle', null);
    else if (r < 0.45) { const w = pick(NAV.window); walkTo(n, w, 'gaze', { x: -ROOM.x, z: w[1] }); }
    else if (r < 0.55) { const s = pick(NAV.shelf); walkTo(n, s, 'gaze', { x: ROOM.x, z: s[1] }); }
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
    const spot = { x: clamp(o.group.position.x + (dx / d) * 1.0, -7.6, 7.6), z: clamp(o.group.position.z + (dz / d) * 1.0, -5.8, 5.8) };
    if (inBlock(spot.x, spot.z) || inBlock(o.group.position.x, o.group.position.z)) return false;
    if (o.pendingSeat) { o.pendingSeat.taken = false; o.pendingSeat = null; } // 앉으러 가던 중이었다면 자리를 돌려준다
    o.state = 'idle'; o.t = 0; o.dur = 14; o.doing = 'wait'; o.path = []; o.partner = n;
    walkTo(n, spot, 'chat', null);
    n.partner = o;
    return true;
  }

  const sep = (n, pp, dt) => {
    const p = n.group.position;
    const push = (ox, oz, min) => {
      const dx = p.x - ox;
      const dz = p.z - oz;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) { const k = ((min - d) / min) * 2.2 * dt; p.x += (dx / d) * k; p.z += (dz / d) * k; }
    };
    for (const o of crowd) { if (o !== n && o.state !== 'sit') push(o.group.position.x, o.group.position.z, 0.8); }
    push(pp.x, pp.z, 0.95);
  };
  const faceTo = (g, x, z, k, dt) => {
    g.rotation.y += angleDelta(g.rotation.y, Math.atan2(x - g.position.x, z - g.position.z)) * (1 - Math.exp(-k * dt));
  };

  function brain(n, t, dt, pp) {
    const g = n.group;
    const p = g.position;
    const u = g.userData;
    const dP = Math.hypot(pp.x - p.x, pp.z - p.z);
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
      sep(n, pp, dt);
    }

    // 몸짓
    n.speed01 = damp(n.speed01, moving ? 1 : 0, 8, dt);
    const sw = Math.sin(t * (6 + n.speed * 2) + n.phase) * 0.7 * n.speed01;
    if (!u.sit) {
      u.legL.rotation.x = sw;
      u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.9 + (gesture ? Math.sin(t * 3 + n.phase) * 0.3 : 0);
      u.body.position.y = Math.abs(Math.sin(t * (6 + n.speed * 2) + n.phase)) * 0.035 * n.speed01 + Math.sin(t * 1.6 + n.phase) * 0.01;
    } else u.body.position.y = u.baseY + Math.sin(t * 1.6 + n.phase) * 0.012;
    let armRz = 0;
    let armRx = u.sit ? -0.5 : sw * 0.9;
    if (waveOn) armRz = 2.4 + Math.sin(t * 9) * 0.35;
    else if (write) { armRz = 2.1 + Math.sin(t * 4) * 0.12; armRx = 0.3; } else if (gesture) { armRx = -0.9 + Math.sin(t * 3.4 + n.phase) * 0.35; }
    u.armR.rotation.z = damp(u.armR.rotation.z, armRz, 9, dt);
    u.armR.rotation.x = damp(u.armR.rotation.x, armRx, 9, dt);
    n.wave = waveOn ? 1 : 0;
  }

  function arrive(n) {
    if (n.doing === 'sit' && n.pendingSeat) { const s = n.pendingSeat; n.pendingSeat = null; sitDown(n, s); return; }
    if (n.doing === 'chat' && n.partner) { n.state = 'chat'; n.t = 0; n.dur = rand(5, 9); return; }
    n.state = 'idle';
    n.t = 0;
    n.dur = n.doing === 'write' ? rand(7, 12) : n.doing === 'gaze' ? rand(5, 10) : n.doing === 'look' ? rand(2, 4) : rand(2, 6);
  }

  // ── 토끼 ──
  const bg = new T.Group();
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
  bg.add(bBody, bHead, earL, earR, tail, bEyeL, bEyeR, nose);
  const bBlob = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), new T.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(60,40,20,.38)');
    gr.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }), transparent: true, depthWrite: false }));
  bBlob.rotation.x = -Math.PI / 2;
  bBlob.position.y = 0.012;
  bg.add(bBlob);
  bg.position.set(-5.2, 0, 2.7);
  scene.add(bg);
  const bunny = { group: bg, target: new T.Vector3(-5.2, 0, 2.7), wait: 0 };

  // ── 미션 자리 표시 ──
  const stops = {
    window: { x: -7.2, z: 0, r: 1.3 },
    rug: { x: RUG.x, z: RUG.z, r: 1.6 },
    board: { x: 0, z: -4.9, r: 1.7 },
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
  const starTex = iconTex('⭐');

  return {
    scene, camera, player, colliders, stops, bunny, drawBoard, npcs: crowd,
    animatePlayer(speed01, t) {
      const u = player.userData;
      const sw = Math.sin(t * 9) * 0.75 * speed01;
      u.legL.rotation.x = sw;
      u.legR.rotation.x = -sw;
      u.armL.rotation.x = -sw * 0.9;
      u.armR.rotation.x = sw * 0.9;
      u.body.position.y = Math.abs(Math.sin(t * 9)) * 0.04 * speed01 + Math.sin(t * 1.6) * 0.008;
    },
    animate(t, dt, pos, st) {
      for (const n of crowd) brain(n, t, dt, pos);
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
        bunny.target.set(RUG.x + (Math.random() - 0.5) * 3.6, 0, RUG.z - 0.2 + (Math.random() - 0.5) * 3.2);
        bunny.wait = 1.5 + Math.random() * 2.5;
      }
      bp.y = hop;
      // 풍경·조명
      for (const c of clouds) { c.sp.position.z += c.v * dt; if (c.sp.position.z > 80) c.sp.position.z = -80; }
      beams.forEach((b, i) => { b.material.opacity = 0.75 + Math.sin(t * 0.6 + i) * 0.2; });
      lanterns.forEach((l) => { l.g.position.y = l.y + Math.sin(t * 0.9 + l.ph) * 0.05; l.g.rotation.z = Math.sin(t * 0.7 + l.ph) * 0.05; });
      const arr = dust.geometry.attributes.position.array;
      for (let i = 0; i < DUST; i += 1) {
        arr[i * 3 + 1] += Math.sin(t * 0.5 + i) * 0.0015 + 0.0008;
        arr[i * 3] += Math.sin(t * 0.3 + i * 2) * 0.0012;
        if (arr[i * 3 + 1] > 3.3) arr[i * 3 + 1] = 0.3;
      }
      dust.geometry.attributes.position.needsUpdate = true;
      for (const [id, m] of Object.entries(markers)) {
        const doneIt = st.stars.has(id);
        m.ring.material.color.setHex(doneIt ? 0xffe27a : 0x7be0a4);
        m.ring.material.opacity = (doneIt ? 0.35 : 0.55) + Math.sin(t * 2.2) * 0.2;
        const sc = 1 + Math.sin(t * 2.2) * 0.03;
        m.ring.scale.set(sc, sc, 1);
        m.icon.position.y = m.base + Math.sin(t * 1.8) * 0.1;
        if (doneIt && m.icon.material.map !== starTex) { m.icon.material.map = starTex; m.icon.material.needsUpdate = true; }
      }
    },
    dispose() {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      tb.dispose();
    },
  };
}

// ────────────────────────────────────────────────────────────────
// 3D 를 쓸 수 없는 기기: 눈 쉬기 타임(먼 곳 보기 + 숨쉬기 3번)으로 대신하고 마음 별 3개를 준다
function fallbackRest(root, { finish }, ctl) {
  const total = 20 + 30;
  let t = 0;
  let timer = 0;
  root.innerHTML = `
    <div class="world-card">
      <div class="world-intro">
        <div class="wi-emoji">🌈</div>
        <h2>눈 쉬기 시간</h2>
        <p>이 기기에서는 3D 교실을 열 수 없어서<br>대신 <b>1분</b> 동안 눈을 쉬어 볼게요.</p>
        <div class="act-card breath" id="fb-body" hidden><div class="breath-orb" id="fb-orb"></div><b id="fb-text"></b></div>
        <button class="btn btn-yellow big" id="fb-go">👀 시작하기</button>
        <button class="back-link" id="fb-skip">다음에 할래요</button>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  $('#fb-skip').onclick = () => { clearInterval(timer); finish({ stars: 0, seconds: 0, skipped: true }); };
  $('#fb-go').onclick = () => {
    sfx.unlock();
    sfx.ambientStart();
    $('#fb-go').hidden = true;
    $('#fb-body').hidden = false;
    timer = setInterval(() => {
      t += 0.1;
      if (t < 20) {
        $('#fb-text').textContent = `👀 먼 곳을 바라보며 눈을 깜빡여요 (${Math.ceil(20 - t)}초)`;
        $('#fb-orb').style.transform = 'scale(0.9)';
      } else {
        const p = (t - 20) % 10;
        const k = p < 4 ? p / 4 : 1 - (p - 4) / 6;
        $('#fb-orb').style.transform = `scale(${0.6 + k * 0.7})`;
        $('#fb-text').textContent = p < 4 ? '코로 들이쉬어요… 💨' : '입으로 후~ 내쉬어요 🌬️';
      }
      if (t >= total) {
        clearInterval(timer);
        sfx.ambientStop();
        sfx.success();
        finish({ stars: 3, seconds: Math.round(t), skipped: false });
      }
    }, 100);
  };
  const prev = ctl.dispose.bind(ctl);
  ctl.dispose = () => { clearInterval(timer); sfx.ambientStop(); prev(); };
  return ctl;
}
