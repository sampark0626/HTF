// 마음 쉼터: 숙제를 모두 클리어한 보상. 매원초등학교 같은 교실을 5분 동안 천천히 걸으며 눈과 마음을 쉰다.
//  - 노란 상의 + 검정 하의의 제페토 같은 캐릭터로 교실을 돌아다닌다 (왼쪽 조이스틱 / 오른쪽 드래그로 시점 / 키보드 WASD)
//  - 교실에는 선생님과 친구들이 스스로 돌아다닌다 (부모님이 아이별로 만들고 고친다)
//  - 마음 별 7개: 먼 곳 보기, 숨쉬기, 칠판에 고마운 말, 토끼 만나기, 인사 3번
//  - three.js 는 이 화면에 들어올 때만 불러온다 (/vendor/three, npm 패키지)
//  - 파일 나눔: 이 파일은 화면·조작·미션, 교실 장면은 schoolroom.js, 캐릭터는 character.js, 공용 값은 world-shared.js
import { sfx } from './sfx.js';
import { ANIMALS } from './avatar.js';
import { confetti } from './fx.js';
import { ROOM, ZONES, START, WALK, PARENTS, PARENT_SCALE, clamp, damp, angleDelta, givenName, resolve, floorY, zoneAt } from './world-shared.js';
import { loadThree } from './character.js';
import { buildScene } from './schoolroom.js';
import { makeChoices } from './rules.js';
import { INKS, SIZES, STAMPS } from './board.js';

export { mountCharacterPreview } from './character.js';
export const TOUR_STARS = 7; // server/index.js 의 TOUR_MAX_STARS 와 같아야 한다
export const TOUR_HELP = 5; // 말썽 친구를 타일러 받는 별. server/index.js 의 TOUR_MAX_HELP, schoolroom.js 의 MIS_MAX 와 같아야 한다
const TOUR_SECONDS = 5 * 60; // 걸어 다닌 시간. 친구를 타이르거나 칠판에 낙서하는 동안은 흐르지 않는다
const GREET_STARS = 3;
const MIS_TALK_R = 2.3; // 말썽 친구에게 이만큼 가까이 가면 타이르는 창이 열린다

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SAYS = [
  { icon: '💛', text: '오늘도 수고했어' },
  { icon: '❤️', text: '사랑해' },
  { icon: '👏', text: '정말 잘했어' },
  { icon: '🤗', text: '이리 와, 안아 줄게' },
];

// 마지막 글자에 받침이 있는지 (한글이 아니면 없는 것으로 본다)
const hasFinal = (name) => {
  const code = String(name).charCodeAt(String(name).length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};
const vocative = (name) => `${name}${hasFinal(name) ? '아' : '야'}`; // 준선아, 하나야
const subject = (name) => `${name}${hasFinal(name) ? '이' : '가'}`; // 준선이, 하나가
const PRESENCE_MS = 250; // 같이 있는 사람의 위치를 이만큼마다 주고받는다
const SAY_SHOW_MS = 5500;

const WORDS = [
  { icon: '🌼', text: '고마워' },
  { icon: '💛', text: '괜찮아' },
  { icon: '⭐', text: '잘했어' },
];

// ────────────────────────────────────────────────────────────────
// user: 이 교실의 주인(아이). visit: { role: 'mom' | 'dad' } 이면 부모님이 그 캐릭터로 같이 들어온 것.
// room: server/rooms.js 의 교실 정보 { label, theme, grade }. presence: { sync(me), leave() } 이면 같이 있는 사람을 서로 본다.
// worldInfo: { catalog, unlocked, stars } 별로 연 공간들. buy(id) 가 있으면 잠긴 문 앞에서 별로 열 수 있다 (async, 성공하면 { user } 를 돌려준다).
// board: 아이가 칠판에 남긴 낙서(PNG data URL). saveBoard(png) 가 있으면 낙서를 마칠 때 저장한다 (async). 없으면 이번에만 보인다.
export async function startWorld({ user, preview = false, visit = null, room = null, npcs = [], presence = null, worldInfo = null, buy = null, board = '', saveBoard = null, onDone }) {
  const root = document.createElement('div');
  root.className = 'world';
  root.innerHTML = `<div class="world-card"><div class="boot-clock">🌈</div><h2>${visit ? '교실에 들어가는 중…' : '마음 쉼터를 준비하는 중…'}</h2></div>`;
  document.body.appendChild(root);

  const ctl = { disposed: false, dispose() { this.disposed = true; teardown(); } };
  let teardown = () => root.remove();
  const finishOnce = (() => { let done = false; return (res) => { if (!done) { done = true; ctl.dispose(); onDone(res); } }; })();
  const fallback = () => (visit ? fallbackVisit(root, { finish: finishOnce }, ctl) : fallbackRest(root, { finish: finishOnce }, ctl));

  let T;
  try {
    T = await loadThree();
  } catch (err) {
    console.warn('[world] three.js 를 불러오지 못했어요', err);
    return fallback();
  }
  if (ctl.disposed) return ctl;

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    console.warn('[world] WebGL 을 쓸 수 없어요', err);
    return fallback();
  }

  // ───────── 화면 뼈대 ─────────
  const emoji = ANIMALS[user.avatar?.animal ?? 0] || '🦊';
  const parent = visit ? PARENTS[visit.role] : null;
  const self = parent ? { look: parent.look, tag: parent.tag, tagBg: parent.tagBg, scale: PARENT_SCALE, kind: visit.role } : null;
  const kidGiven = givenName(user.name);
  root.innerHTML = `
    <div class="world-stage" id="w-stage"></div>
    <div class="world-hud" id="w-hud" hidden>
      <div class="wh-top">
        <div class="wh-pill" id="w-stars"${visit ? ' hidden' : ''}>⭐ 0 / ${TOUR_STARS}</div>
        <div class="wh-pill" id="w-help" title="말썽 친구를 다정하게 타일러 받는 별"${visit ? ' hidden' : ''}>🌟 0 / ${TOUR_HELP}</div>
        <div class="wh-pill" id="w-time"${visit ? ' hidden' : ''}>🕒 ${fmt(TOUR_SECONDS)}</div>
        <div class="wh-pill wh-room" id="w-room"${visit ? '' : ' hidden'}>🏫 ${esc(room?.label || '교실')}</div>
        <div class="wh-pill wh-who" id="w-who" hidden></div>
        <div class="wh-spacer"></div>
        <button class="wh-btn" id="w-mute" aria-label="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
        <button class="wh-btn" id="w-exit" aria-label="${visit ? '나가기' : '마치기'}">${visit ? '🚪' : '🏁'}<span class="wh-lbl"> ${visit ? '나가기' : '마치기'}</span></button>
      </div>
      <div class="wh-guide" id="w-guide"${visit ? ' hidden' : ''}>
        <div class="wh-arrow" id="w-arrow">▲</div>
        <div><b id="w-g-title"></b><small id="w-g-sub"></small></div>
      </div>
      <div class="wh-edges" id="w-edges"></div>
      <div class="wh-bubble" id="w-bubble" hidden></div>
      <div class="wh-act" id="w-act" hidden></div>
      <div class="wh-draw" id="w-draw" hidden>
        <small class="wd-hint">📱 휴대폰을 가로로 돌리면 더 크게 그릴 수 있어요</small>
        <div class="wd-row" id="wd-inks">${INKS.map((c, i) => `<button type="button" class="wd-ink${i ? '' : ' on'}" data-ink="${c}" style="--c:${c}" aria-label="색 ${i + 1}"></button>`).join('')}</div>
        <div class="wd-row">
          ${SIZES.map((s, i) => `<button type="button" class="wd-size${i === 1 ? ' on' : ''}" data-size="${s}" aria-label="굵기 ${i + 1}"><i style="--s:${6 + i * 5}px"></i></button>`).join('')}
          <button type="button" class="wd-tool" data-tool="eraser">🧽 지우개</button>
          ${STAMPS.map((e) => `<button type="button" class="wd-tool" data-stamp="${e}" aria-label="도장 ${e}">${e}</button>`).join('')}
        </div>
        <div class="wd-row">
          <button type="button" class="wd-tool" id="wd-undo">↩️ 되돌리기</button>
          <button type="button" class="wd-tool" id="wd-clear">🗑️ 모두 지우기</button>
          <button type="button" class="btn btn-mint" id="wd-done">✅ 다 그렸어요</button>
        </div>
      </div>
      <div class="wh-joy" id="w-joy" aria-label="움직이기"><div class="wh-knob" id="w-knob"></div></div>
      <button class="wh-flip" id="w-flip" aria-label="뒤돌아보기" title="뒤돌아보기">🔄</button>
      <div class="wh-hint" id="w-hint">오른쪽을 드래그하면 시점이 돌아가요</div>
    </div>
    <div class="world-card" id="w-card"></div>`;
  const $ = (s) => root.querySelector(s);
  const stage = $('#w-stage');
  stage.appendChild(renderer.domElement);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

  // ───────── 장면 만들기 ─────────
  const world = buildScene(T, { user, emoji, npcs, room, self, world: worldInfo, boardImage: board });
  const { scene, camera, player, colliders, stops, bunny, halls, view } = world;
  const canBuy = Boolean(buy) && !visit;
  const crowd = world.npcs;
  const misOn = !visit; // 말썽 친구를 타이르는 놀이는 아이의 쉼터에서만 (부모님이 둘러볼 때는 없다)

  const state = {
    running: false,
    elapsed: 0,
    stars: new Set(),
    helped: 0,
    dialog: null, // 말썽 친구를 타이르는 중 { npc, rule, options, msg, tries, done }
    drawing: false,
    drawReady: false,
    draw: { tool: 'pen', color: INKS[0], size: SIZES[1], emoji: '' },
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
  pos.set(START.x, 0, START.z); // 창가 쪽 열린 공간에서 시작해 칠판을 바라본다 (뒤에 카메라가 놓일 자리가 있다)
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
  cv.addEventListener('pointerdown', (e) => {
    if (state.drawing) { drawDown(e); return; }
    lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY; cv.setPointerCapture(e.pointerId); $('#w-hint').classList.add('gone');
  });
  cv.addEventListener('pointermove', (e) => {
    if (state.drawing) { drawMove(e); return; }
    if (e.pointerId !== lookId) return;
    state.yaw -= (e.clientX - lookX) * 0.006;
    state.pitch = clamp(state.pitch + (e.clientY - lookY) * 0.004, 0.12, 0.85);
    lookX = e.clientX;
    lookY = e.clientY;
  });
  const lookEnd = (e) => { if (state.drawing) { drawUp(e); return; } if (e.pointerId === lookId) lookId = null; };
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
  $('#w-flip').addEventListener('click', () => { state.yaw += Math.PI; sfx.tap(); });
  $('#w-exit').addEventListener('click', () => {
    if (!state.running) return;
    if (visit) { state.running = false; finishOnce({ visit: true, stars: 0, seconds: Math.round(state.elapsed), skipped: false }); } else finishTour('exit');
  });

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
    world.drawBoard(w);
    sfx.pop();
    gainStar('board', `칠판에 "${w.text}" 라고 썼어요`);
  }
  act.addEventListener('click', (e) => {
    const b = e.target.closest('[data-word]');
    if (b) chooseWord(WORDS[Number(b.dataset.word)]);
    const s = e.target.closest('[data-say]');
    if (s) speak(Number(s.dataset.say));
    const bb = e.target.closest('[data-buy]');
    if (bb) buyDoor(bb.dataset.buy, bb);
    const f = e.target.closest('[data-fix]');
    if (f) tryFix(Number(f.dataset.fix));
    if (e.target.closest('[data-draw]')) enterDraw();
  });

  // ───────── 한 프레임 ─────────
  let lastSpeed = 0;
  const speed01 = () => lastSpeed;
  function update(dt) {
    const t = performance.now() / 1000;
    if (state.running && !state.drawing && !state.dialog) state.elapsed += dt; // 타이르거나 낙서하는 동안은 쉼터 시간이 흐르지 않는다

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
    if (mag > 0.08 && state.running && !state.drawing) {
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
    pos.y = damp(pos.y, floorY(pos.x, pos.z), 16, dt); // 계단은 한 칸씩 올라간다
    lastSpeed = speed / WALK;
    world.animatePlayer(lastSpeed, t);
    world.animate(t, dt, pos, state);

    if (state.running && !state.drawing) {
      if (visit) handleVisit();
      else {
        if (misOn) world.mis.update(state.elapsed, pos);
        handleStops(dt);
        handleMis();
        updateEdges();
      }
    }
    placeSays(t);

    // 칠판에 낙서하는 동안: 카메라가 칠판 정면으로 다가가 칠판이 화면을 가득 채운다
    if (state.drawing) {
      const v = world.boardView(camera.aspect, camera.fov);
      state.camPos.x = damp(state.camPos.x, v.pos.x, 6, dt);
      state.camPos.y = damp(state.camPos.y, v.pos.y, 6, dt);
      state.camPos.z = damp(state.camPos.z, v.pos.z, 6, dt);
      camera.position.copy(state.camPos);
      camera.lookAt(v.look.x, v.look.y, v.look.z);
      camera.updateMatrixWorld(true);
      state.drawReady = Math.hypot(state.camPos.x - v.pos.x, state.camPos.y - v.pos.y, state.camPos.z - v.pos.z) < 0.12;
      if (state.running && t - state.lastHudAt > 0.2) state.lastHudAt = t;
      return;
    }

    // 카메라 (뒤에서 따라가기). 지금 있는 공간 안에 머물고, 벽에 막히면 거리를 줄이고 조금 더 위에서 내려다본다
    const zr = ZONES[zoneAt(pos.x, pos.z, [...view.unlocked])];
    const baseDist = zr === ZONES.room ? 5.0 : 3.6;
    const ch = Math.cos(state.pitch);
    const hx = Math.sin(state.yaw) * ch * baseDist;
    const hz = Math.cos(state.yaw) * ch * baseDist;
    let fit = 1;
    if (hx > 0.01) fit = Math.min(fit, (zr.x1 - 0.6 - pos.x) / hx);
    else if (hx < -0.01) fit = Math.min(fit, (zr.x0 + 0.6 - pos.x) / hx);
    if (hz > 0.01) fit = Math.min(fit, (zr.z1 - 0.6 - pos.z) / hz);
    else if (hz < -0.01) fit = Math.min(fit, (zr.z0 + 0.6 - pos.z) / hz);
    fit = clamp(fit, 0.3, 1);
    const pitchEff = state.pitch + (1 - fit) * 0.55;
    const dist = baseDist * fit;
    const cp = Math.cos(pitchEff) * dist;
    const target = tmp.set(pos.x + Math.sin(state.yaw) * cp, pos.y + 1.0 + Math.sin(pitchEff) * dist, pos.z + Math.cos(state.yaw) * cp);
    target.x = clamp(target.x, zr.x0 + 0.5, zr.x1 - 0.5);
    target.z = clamp(target.z, zr.z0 + 0.5, zr.z1 - 0.5);
    target.y = clamp(target.y, pos.y + 0.8, zr.y + zr.h - 0.3);
    state.camPos.x = damp(state.camPos.x, target.x, 7, dt);
    state.camPos.y = damp(state.camPos.y, target.y, 7, dt);
    state.camPos.z = damp(state.camPos.z, target.z, 7, dt);
    camera.position.copy(state.camPos);
    camera.lookAt(pos.x, pos.y + 1.0, pos.z);
    camera.updateMatrixWorld(true);

    if (state.running && t - state.lastHudAt > 0.2) { state.lastHudAt = t; updateHud(); }
    if (state.running && !visit && state.elapsed >= TOUR_SECONDS) finishTour('time');
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

    // 칠판 앞: 고마운 말 쓰기(별) + 마음대로 낙서하기
    const drawBtn = '<button class="btn btn-yellow small" data-draw="1">🖍️ 낙서하기</button>';
    if (active === 'board') {
      setAct('board', `<div class="act-card"><div class="act-icon">✏️</div><b>고마운 마음을 골라요</b><div class="act-words">${WORDS.map((w, i) => `<button class="btn btn-white small" data-word="${i}">${w.icon} ${w.text}</button>`).join('')}</div>${drawBtn}</div>`);
    } else if (!active && !state.dialog && insideStop(brd)) {
      setAct('board:draw', `<div class="act-card"><div class="act-icon">🖍️</div><b>칠판이 비어 있어요</b><small>그림도 글씨도 마음대로 써 봐요</small>${drawBtn}</div>`);
    } else if (!active && !state.dialog) {
      const b = nearBarrier();
      if (b) setAct(`barrier:${b.id}:${view.stars}:${view.unlocked.size}`, barrierCard(b));
      else if (actKey) setAct('', null);
    }
    state.acting = active ? { id: active } : null;

    // 토끼: 가까이 가만히 있으면 친구가 된다
    if (!state.stars.has('bunny')) {
      const d = Math.hypot(pos.x - bunny.group.position.x, pos.z - bunny.group.position.z);
      if (d < 1.7 && speed01() < 0.3) {
        state.bunnyT += dt;
        if (state.bunnyT > 2.2) { gainStar('bunny', '토끼와 친구가 됐어요'); spawnHearts(bunny.group); }
      } else state.bunnyT = Math.max(0, state.bunnyT - dt * 0.5);
    }

    // 선생님·친구(그리고 같이 온 엄마·아빠) 인사
    const near = nearTalker();
    if (near) {
      showNear(near);
      if (!state.greeted.has(near.data.id)) {
        state.greeted.add(near.data.id);
        sfx.pop();
        if (state.greeted.size <= GREET_STARS) gainStar(`greet${state.greeted.size}`, `${near.data.name}${hasFinal(near.data.name) ? '과' : '와'} 인사했어요`);
      }
    } else bubble.hidden = true;
  }

  // ───────── 별로 공간 열기: 잠긴 문·공사 중 가림막 앞에서 ─────────
  const itemOf = (id) => view.catalog.find((c) => c.id === id);
  function nearBarrier() {
    let best = null;
    let bd = 1e9;
    for (const b of halls.barriers) {
      const d = Math.hypot(pos.x - b.x, pos.z - b.z);
      if (d < b.r && d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function barrierCard(b) {
    const c = itemOf(b.id);
    const prev = c.needs ? itemOf(c.needs) : null;
    const title = `<div class="act-icon">🔒</div><b>${c.icon} ${esc(c.name)} 열기</b>`;
    if (prev && !view.unlocked.has(prev.id)) return `<div class="act-card">${title}<small>먼저 앞 공간(${esc(prev.name)})을 열어야 해요</small></div>`;
    if (!canBuy) return `<div class="act-card">${title}<small>마음 별 ⭐${c.cost}개로 열 수 있어요</small></div>`;
    if (view.stars < c.cost) {
      return `<div class="act-card">${title}<small>⭐${c.cost}개가 필요해요 · 지금 ⭐${view.stars}개 (${c.cost - view.stars}개 더!)</small></div>`;
    }
    return `<div class="act-card">${title}<small>쓸 수 있는 별 ⭐${view.stars}개 중 ⭐${c.cost}개를 써요</small><button class="btn btn-yellow" data-buy="${b.id}">🔓 열기 (⭐${c.cost})</button></div>`;
  }
  let buying = false;
  async function buyDoor(id, btn) {
    if (!canBuy || buying) return;
    buying = true;
    btn.disabled = true;
    try {
      const r = await buy(id);
      const w = r.user && r.user.world;
      if (w) view.stars = w.stars;
      halls.unlock(id);
      sfx.success();
      confetti({ count: 70, x: 0.5, y: 0.5, power: 0.9, emojis: ['⭐', '🔓', '✨'] });
      toastNote(`🎉 열렸어요! ${itemOf(id).icon} ${itemOf(id).name}`);
      setAct('', null);
      actKey = '';
    } catch (err) {
      btn.disabled = false;
      sfx.error();
      toastNote(err.message || '열지 못했어요');
    } finally {
      buying = false;
    }
  }

  // 인사를 나눌 수 있는 상대: 선생님·친구, 그리고 아이 화면에서는 같이 온 엄마·아빠
  function talkers() {
    const list = crowd.filter((n) => !(n.mis && !n.mis.over)); // 말썽 부리는 친구는 인사 대신 타이르는 창이 열린다
    if (!visit) {
      for (const p of world.peers.values()) {
        if (p.kind === 'kid') continue; // eslint-disable-line no-continue
        const hello = PARENTS[p.kind].hello(vocative(kidGiven));
        list.push({
          data: { id: `peer:${p.kind}`, name: PARENTS[p.kind].word },
          group: p.group,
          msg: p.say && performance.now() - p.sayLocalAt < SAY_SHOW_MS ? p.say : hello,
          role: 'parent',
        });
      }
    }
    return list;
  }
  function nearTalker() {
    let near = null;
    let nearD = 2.5;
    for (const n of talkers()) {
      const d = Math.hypot(pos.x - n.group.position.x, pos.z - n.group.position.z);
      if (d < nearD) { nearD = d; near = n; }
    }
    state.nearKey = near ? near.data.id : '';
    return near;
  }
  function showNear(near) {
    bubble.hidden = false;
    bubble.innerHTML = `<b>${esc(near.data.name)}</b>${esc(near.msg)}`;
    placeOver(bubble, near.group, 2.0);
  }

  // ───────── 말썽 친구 타이르기: 약속을 어기는 친구를 찾아가 다정하게 말해 주면 별 ─────────
  //  친구는 가끔 뛰어다니거나 나쁜 말을 하거나 장난치거나 선생님 말씀을 안 듣는다 (머리 위 빨간 배지, 화면 가장자리 화살표).
  //  가까이 가면 말을 고르는 창이 열리고, 칠판 구석의 약속과 같은 뜻의 말을 고르면 친구가 사과하고 별 하나.
  const nameOf = (n) => n.data.name;
  const inRoom = () => zoneAt(pos.x, pos.z, [...view.unlocked]) === 'room'; // 복도에서는 벽 너머 친구를 타이르지 않는다
  function nearMis() {
    if (!inRoom()) return null;
    let best = null;
    let bd = MIS_TALK_R;
    for (const n of world.mis.active()) {
      const d = Math.hypot(pos.x - n.group.position.x, pos.z - n.group.position.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function renderDialog() {
    const d = state.dialog;
    const who = nameOf(d.npc);
    actKey = '';
    setAct(`mis:${d.npc.data.id}:${d.tries}`, `
      <div class="act-card mis-card">
        <div class="act-icon">${d.rule.icon}</div>
        <b>${esc(subject(who))} ${esc(d.rule.alert)}!</b>
        <small>${d.msg ? esc(d.msg) : '어떻게 말해 줄까요? 칠판 구석의 약속을 봐요 👀'}</small>
        <div class="mis-opts">${d.options.map((o, i) => `<button class="btn btn-white small" data-fix="${i}">${esc(o.text)}</button>`).join('')}</div>
      </div>`);
  }
  function openDialog(n) {
    state.dialog = { npc: n, rule: n.mis.rule, options: makeChoices(n.mis.type), msg: '', tries: 0, done: false };
    world.mis.hold(n, true);
    state.nearKey = '';
    bubble.hidden = true;
    sfx.pop();
    renderDialog();
  }
  function closeDialog() {
    const d = state.dialog;
    if (!d) return;
    state.dialog = null;
    world.mis.hold(d.npc, false);
    setAct('', null);
    actKey = '';
  }
  function handleMis() {
    if (!misOn) return;
    const d = state.dialog;
    if (d) { // 타이르는 중: 그 친구에게서 멀어지면 창을 닫는다
      const away = Math.hypot(pos.x - d.npc.group.position.x, pos.z - d.npc.group.position.z) > MIS_TALK_R + 1;
      if (d.done || away || !d.npc.mis || d.npc.mis.over) closeDialog();
      return;
    }
    const n = nearMis();
    if (n && !state.acting) openDialog(n);
  }
  function tryFix(i) {
    const d = state.dialog;
    if (!d || d.done) return;
    const o = d.options[i];
    if (!o) return;
    if (!o.ok) { // 알맞지 않은 말: 다시 고르게 한다 (벌은 없다)
      d.tries += 1;
      d.msg = o.why;
      sfx.error();
      renderDialog();
      return;
    }
    d.done = true;
    const n = d.npc;
    world.mis.fix(n);
    state.helped = Math.min(TOUR_HELP, state.helped + 1);
    const pill = $('#w-help');
    pill.textContent = `🌟 ${state.helped} / ${TOUR_HELP}`;
    pill.classList.remove('pop');
    void pill.offsetWidth;
    pill.classList.add('pop');
    sfx.twinkle();
    toastStar(`${nameOf(n)}${hasFinal(nameOf(n)) ? '이' : '가'} 약속을 지키기로 했어요`);
    confetti({ count: 40, x: 0.5, y: 0.4, power: 0.8, emojis: ['🌟', '✨', '💛'] });
    spawnHearts(n.group);
    closeDialog();
  }

  // 화면 가장자리 화살표: 화면 밖에 있는 별 자리와 말썽 친구가 어느 쪽에 있는지 알려 준다
  const edgeBox = $('#w-edges');
  const edgeEls = new Map();
  const edgeVec = new T.Vector3();
  function edgeTargets() {
    const list = [];
    if (state.drawing || state.dialog) return list;
    for (const [id, icon] of [['window', '👀'], ['rug', '🌬️'], ['board', '✏️']]) {
      if (!state.stars.has(id)) list.push({ key: id, icon, x: stops[id].x, y: 1.6, z: stops[id].z, kind: 'star' });
    }
    if (!state.stars.has('bunny')) list.push({ key: 'bunny', icon: '🐰', x: bunny.group.position.x, y: 0.8, z: bunny.group.position.z, kind: 'star' });
    for (const n of world.mis.active()) {
      list.push({ key: `mis:${n.data.id}`, icon: n.mis.rule.icon, x: n.group.position.x, y: 2.4, z: n.group.position.z, kind: 'alert' });
    }
    return list;
  }
  function updateEdges() {
    const list = inRoom() ? edgeTargets() : [];
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const seen = new Set();
    for (const it of list) {
      seen.add(it.key);
      let el = edgeEls.get(it.key);
      if (!el) {
        el = document.createElement('div');
        el.className = `wh-edge ${it.kind}`;
        el.innerHTML = `<span class="we-ico">${it.icon}</span><i class="we-arr"></i>`;
        edgeBox.appendChild(el);
        edgeEls.set(it.key, el);
      }
      edgeVec.set(it.x, it.y, it.z).project(camera);
      let nx = edgeVec.x;
      let ny = edgeVec.y;
      const behind = edgeVec.z > 1;
      if (behind) { nx = -nx; ny = -ny; }
      const visible = !behind && Math.abs(nx) < 0.9 && Math.abs(ny) < 0.8;
      el.hidden = visible;
      if (visible) continue; // eslint-disable-line no-continue
      const k = Math.max(Math.abs(nx) / 0.88, Math.abs(ny) / 0.7, 1e-3); // 가장자리에 닿도록 늘린다
      const ex = nx / k;
      const ey = ny / k;
      el.style.left = `${clamp((ex * 0.5 + 0.5) * w, 34, w - 34)}px`;
      el.style.top = `${clamp((-ey * 0.5 + 0.5) * h, 96, h - 130)}px`;
      el.querySelector('.we-arr').style.transform = `rotate(${Math.atan2(-ey, ex)}rad)`;
    }
    for (const [key, el] of edgeEls) {
      if (!seen.has(key)) { el.remove(); edgeEls.delete(key); }
    }
  }

  // ───────── 칠판 낙서: 칠판 앞에서 카메라가 칠판 정면으로 다가가고, 손가락이 닿는 칠판 자리에 그려진다 ─────────
  const drawBox = $('#w-draw');
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  let strokePtr = null;
  let inStroke = false;
  function boardPoint(e) {
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(world.boardMesh, false)[0];
    return hit && hit.uv ? { x: hit.uv.x * world.board.W, y: (1 - hit.uv.y) * world.board.H } : null;
  }
  function drawDown(e) {
    if (!state.drawReady || strokePtr !== null) return;
    const p = boardPoint(e);
    if (!p) return;
    const d = state.draw;
    if (d.tool === 'stamp') { world.board.begin(p.x, p.y, { tool: 'stamp', emoji: d.emoji, size: d.size, color: d.color }); sfx.pop(); refreshTools(); return; }
    strokePtr = e.pointerId;
    inStroke = true;
    cv.setPointerCapture(e.pointerId);
    world.board.begin(p.x, p.y, { tool: d.tool, color: d.color, size: d.size });
  }
  function drawMove(e) {
    if (e.pointerId !== strokePtr) return;
    const p = boardPoint(e);
    const d = state.draw;
    if (!p) { if (inStroke) { world.board.end(); inStroke = false; } return; } // 칠판 밖으로 나가면 그 획은 끝
    if (!inStroke) { world.board.begin(p.x, p.y, { tool: d.tool, color: d.color, size: d.size }); inStroke = true; return; }
    world.board.move(p.x, p.y);
  }
  function drawUp(e) {
    if (e.pointerId !== strokePtr) return;
    if (inStroke) world.board.end();
    inStroke = false;
    strokePtr = null;
    refreshTools();
  }
  function refreshTools() {
    const d = state.draw;
    drawBox.querySelectorAll('[data-ink]').forEach((b) => b.classList.toggle('on', d.tool !== 'eraser' && d.tool !== 'stamp' && b.dataset.ink === d.color));
    drawBox.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === d.size));
    drawBox.querySelectorAll('[data-tool="eraser"]').forEach((b) => b.classList.toggle('on', d.tool === 'eraser'));
    drawBox.querySelectorAll('[data-stamp]').forEach((b) => b.classList.toggle('on', d.tool === 'stamp' && b.dataset.stamp === d.emoji));
    $('#wd-undo').disabled = !world.board.canUndo();
  }
  let clearArm = 0;
  drawBox.addEventListener('click', (e) => {
    const d = state.draw;
    const ink = e.target.closest('[data-ink]');
    const size = e.target.closest('[data-size]');
    const tool = e.target.closest('[data-tool]');
    const stamp = e.target.closest('[data-stamp]');
    if (ink) { d.tool = 'pen'; d.color = ink.dataset.ink; sfx.tap(); }
    else if (size) { d.size = Number(size.dataset.size); if (d.tool === 'stamp') d.tool = 'pen'; sfx.tap(); }
    else if (tool) { d.tool = 'eraser'; sfx.tap(); }
    else if (stamp) { d.tool = 'stamp'; d.emoji = stamp.dataset.stamp; sfx.tap(); }
    else if (e.target.closest('#wd-undo')) { if (world.board.undo()) sfx.pop(); }
    else if (e.target.closest('#wd-clear')) {
      const btn = $('#wd-clear');
      if (performance.now() < clearArm) { world.board.clear(); clearArm = 0; btn.textContent = '🗑️ 모두 지우기'; sfx.pop(); } else { clearArm = performance.now() + 2500; btn.textContent = '정말 다 지울까요? 한 번 더!'; setTimeout(() => { if (clearArm && performance.now() >= clearArm) { clearArm = 0; btn.textContent = '🗑️ 모두 지우기'; } }, 2600); }
    } else if (e.target.closest('#wd-done')) { exitDraw(); return; }
    refreshTools();
  });
  function enterDraw() {
    if (state.drawing || !state.running) return;
    state.drawing = true;
    state.drawReady = false;
    root.classList.add('drawing');
    world.setDrawMode(true);
    input.jx = 0; input.jy = 0; input.keys.clear();
    setAct('', null);
    actKey = '';
    bubble.hidden = true;
    drawBox.hidden = false;
    sfx.pop();
    refreshTools();
  }
  async function exitDraw() {
    if (!state.drawing) return;
    state.drawing = false;
    strokePtr = null;
    inStroke = false;
    root.classList.remove('drawing');
    drawBox.hidden = true;
    world.setDrawMode(false);
    sfx.success();
    if (!world.board.isDirty()) return;
    if (!saveBoard || visit) { toastNote('🖍️ 낙서는 이번에만 보여요'); return; }
    try {
      await saveBoard(world.board.toDataURL());
      world.board.markSaved();
      toastNote('💾 칠판 낙서를 저장했어요. 다음에 와도 그대로예요!');
    } catch (err) {
      toastNote(err.message || '칠판 낙서를 저장하지 못했어요');
    }
  }

  // 부모님이 교실을 둘러볼 때: 미션 없이 걸어 다니고, 가까이 가면 선생님·친구가 인사한다
  function handleVisit() {
    const near = nearTalker();
    if (near) showNear(near); else bubble.hidden = true;
  }
  // (부모님이 들어온 화면에서는 공간을 사지 않는다. 아이가 연 곳까지만 걸어 볼 수 있다.)

  // ───────── 같이 있는 사람: 위치 주고받기, 말풍선 ─────────
  const says = new Map(); // 사람 id('me' 는 나, 'npc:…' 는 친구·선생님) → { el, until, peer, group }
  function showSay(key, peer, text, group = null) {
    const old = says.get(key);
    if (old) old.el.remove();
    const el = document.createElement('div');
    el.className = `wh-bubble say${group ? ' npc' : ''}`;
    el.textContent = text;
    $('#w-hud').appendChild(el);
    says.set(key, { el, until: performance.now() + SAY_SHOW_MS, peer, group });
  }
  function placeSays(t) {
    if (!says.size) return;
    const now = performance.now();
    for (const [key, s] of says) {
      const target = key === 'me' ? player : s.group || (s.peer && s.peer.group);
      if (now > s.until || !target || (s.peer && !world.peers.has(s.peer.id))) { s.el.remove(); says.delete(key); continue; } // eslint-disable-line no-continue
      // 가까이 있으면 이미 이름표 말풍선에 같은 말이 나오니 겹치지 않게 숨긴다. 낙서하는 동안에는 모두 숨긴다
      s.el.style.display = state.drawing || (s.peer && state.nearKey === `peer:${s.peer.kind}`) ? 'none' : '';
      placeOver(s.el, target, 2.45 + Math.sin(t * 3) * 0.02);
    }
  }
  // 친구·선생님이 하는 말(말썽 부리는 말, 선생님의 타이름, 사과)을 머리 위 말풍선으로
  world.hooks.say = (n, text) => { if (state.running) showSay(`npc:${n.data.id}`, null, text, n.group); };
  const toastNote = (text) => {
    const el = document.createElement('div');
    el.className = 'wh-toast note';
    el.textContent = text;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };
  const whoPill = $('#w-who');
  function updateWho() {
    const list = [...world.peers.values()];
    if (visit) {
      const kid = list.some((p) => p.kind === 'kid');
      whoPill.hidden = false;
      whoPill.textContent = kid ? `${emoji} ${user.name} 교실에 있어요` : `🕓 ${user.name} 아직 안 왔어요`;
      whoPill.classList.toggle('here', kid);
    } else {
      const ps = list.filter((p) => p.kind !== 'kid');
      whoPill.hidden = !ps.length;
      whoPill.textContent = ps.map((p) => PARENTS[p.kind].tag).join(' · ') + ' 같이 있어요';
      const note = root.querySelector('#w-pnote');
      if (note) { note.hidden = !ps.length; note.textContent = `${ps.map((p) => PARENTS[p.kind].tag).join(', ')}${ps.length ? '가 교실에 와 있어요' : ''}`; }
    }
  }
  function applyPeers(list) {
    const r = world.syncPeers(list);
    const t = performance.now();
    for (const p of r.joined) {
      sfx.pop();
      toastNote(visit
        ? `${emoji} ${subject(user.name)} 교실에 들어왔어요!`
        : `${PARENTS[p.kind].tag}가 교실에 왔어요! 가서 인사해 볼까요?`);
    }
    for (const p of r.left) {
      if (!visit && p.kind !== 'kid') toastNote(`${PARENTS[p.kind].tag}가 교실을 나갔어요`);
      else if (visit && p.kind === 'kid') toastNote(`${emoji} ${subject(user.name)} 교실을 나갔어요`);
    }
    for (const p of r.said) {
      p.sayLocalAt = t;
      if (p.kind !== 'kid') { showSay(p.id, p, p.say); sfx.pop(); }
    }
    if (r.joined.length || r.left.length) updateWho();
  }

  let pBusy = false;
  let pNext = 0;
  let pDead = false;
  let pSay = '';
  async function syncPresence(now) {
    if (!presence || pBusy || pDead || ctl.disposed || now < pNext) return;
    pBusy = true;
    pNext = now + PRESENCE_MS;
    const say = pSay;
    pSay = '';
    try {
      const r = await presence.sync({
        x: Math.round(pos.x * 100) / 100,
        z: Math.round(pos.z * 100) / 100,
        ry: Math.round(player.rotation.y * 100) / 100,
        mv: Math.round(lastSpeed * 100) / 100,
        say,
      });
      if (!ctl.disposed) applyPeers((r && r.others) || []);
    } catch (err) {
      pSay = say || pSay;
      pNext = performance.now() + 2500; // 잠깐 쉬었다가 다시 시도
      if (err && err.status === 401) { pDead = true; if (visit) toastNote('부모님 비밀번호 시간이 끝나서 같이 있는 모습이 멈췄어요'); }
    } finally {
      pBusy = false;
    }
  }

  // 부모님이 자리에서 한마디 (모두에게 말풍선으로 보인다)
  function speak(i) {
    const s = SAYS[i];
    if (!s) return;
    sfx.pop();
    pSay = `${s.icon} ${s.text}`;
    showSay('me', null, pSay);
    pNext = 0; // 바로 알린다
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
    if (visit) return;
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
    // 말썽 친구가 있으면 그 친구가 먼저 (가만두면 얼마 뒤 사라진다)
    const alerts = misOn ? world.mis.active() : [];
    if (alerts.length) {
      let best = alerts[0];
      let bd = 1e9;
      for (const n of alerts) {
        const d = Math.hypot(pos.x - n.group.position.x, pos.z - n.group.position.z);
        if (d < bd) { bd = d; best = n; }
      }
      return { title: `${best.mis.rule.icon} ${subject(nameOf(best))} ${best.mis.rule.alert}!`, sub: '가까이 가서 다정하게 타일러 줘요. 칠판 구석의 약속이 힌트예요', target: best.group.position };
    }
    if (!S.has('window')) return { title: '👀 창가에서 먼 곳 바라보기', sub: '초록 동그라미에 서서 20초 동안 먼 하늘을 봐요', target: stops.window };
    if (!S.has('rug')) return { title: '🌬️ 러그에서 숨 쉬기', sub: '동그란 러그 위에 서서 크게 3번 숨 쉬어요', target: stops.rug };
    if (!S.has('board')) return { title: '✏️ 칠판에 고마운 말 쓰기', sub: '칠판 앞 동그라미에 서 봐요', target: stops.board };
    if (!S.has('bunny')) return { title: '🐰 토끼 친구 만나기', sub: '토끼 곁에 가만히 서 있어 봐요', target: bunny.group.position };
    const gs = Math.min(GREET_STARS, state.greeted.size);
    const tk = talkers();
    if (gs < GREET_STARS && tk.length) {
      let best = null;
      let bd = 1e9;
      for (const n of tk) {
        if (state.greeted.has(n.data.id)) continue;
        const d = Math.hypot(pos.x - n.group.position.x, pos.z - n.group.position.z);
        if (d < bd) { bd = d; best = n; }
      }
      return { title: `🧑‍🏫 선생님과 친구들에게 인사하기 (${gs} / ${GREET_STARS})`, sub: '가까이 가면 말을 걸어 줘요. 걸어 다니니까 따라가 봐요!', target: best && best.group.position };
    }
    if (misOn && state.helped < TOUR_HELP && world.mis.stats.spawned < TOUR_HELP) return { title: '🌟 말썽 친구를 찾아봐요', sub: '약속을 어기는 친구가 나타나면 알려 줄게요. 그동안 칠판에 낙서해도 좋아요', target: null };
    return { title: '🎉 마음 별을 다 모았어요!', sub: '더 걸어도 좋고, 🏁 마치기를 누르면 선물이 기다려요', target: null };
  }

  // ───────── 시작 · 끝 카드 ─────────
  const card = $('#w-card');
  function showIntro() {
    card.hidden = false;
    const teachers = crowd.filter((n) => n.role === 'teacher').map((n) => n.data.name);
    if (visit) {
      card.innerHTML = `
        <div class="world-intro">
          <div class="wi-emoji">${parent.tag.split(' ')[0]}</div>
          <h2>${esc(user.name)}의 교실</h2>
          <p class="wi-room">🏫 ${esc(room?.label || '교실')}</p>
          <p>${esc(parent.word)} 캐릭터로 교실에 들어가요.<br>${esc(user.name)}${hasFinal(user.name) ? '이' : '가'} 쉼터에 있으면 서로 볼 수 있어요.</p>
          <ul>
            <li>🕹️ 왼쪽 조이스틱으로 걸어요 (키보드는 WASD)</li>
            <li>💬 아래 버튼으로 한마디를 전해요</li>
            ${teachers.length ? `<li>🧑‍🏫 ${esc(teachers.join(', '))}도 교실에 계세요</li>` : ''}
          </ul>
          <button class="btn btn-yellow big" id="w-go">🚪 교실에 들어가기</button>
          <button class="back-link" id="w-skip">← 돌아가기</button>
        </div>`;
      $('#w-go').onclick = beginTour;
      $('#w-skip').onclick = () => finishOnce({ visit: true, stars: 0, seconds: 0, skipped: true });
      return;
    }
    card.innerHTML = `
      <div class="world-intro">
        <div class="wi-emoji">🌈</div>
        <h2>마음 쉼터</h2>
        ${room?.label ? `<p class="wi-room">🏫 ${esc(room.label)}</p>` : ''}
        <p>숙제를 모두 끝낸 선물이에요.<br>교실을 천천히 걸으며 <b>5분</b> 동안 눈과 마음을 쉬어요.</p>
        <p class="wi-note wi-parent" id="w-pnote" hidden></p>
        ${teachers.length ? `<p class="wi-note">🧑‍🏫 ${esc(teachers.join(', '))}도 교실에 계세요</p>` : ''}
        <ul>
          <li>🕹️ 왼쪽 조이스틱으로 걸어요 (키보드는 WASD)</li>
          <li>👆 화면을 드래그하면 시점이 돌아가요</li>
          <li>⭐ 마음 별 ${TOUR_STARS}개를 모아 보세요 (빛기둥과 화면 가장자리 화살표가 알려 줘요)</li>
          <li>🌟 약속을 어기는 친구를 찾아 다정하게 타이르면 별을 더 받아요 (칠판 구석에 약속이 있어요)</li>
          <li>🖍️ 칠판 앞에서 마음껏 낙서도 할 수 있어요</li>
        </ul>
        ${canBuy && view.catalog.length ? `<p class="wi-note">🪙 쓸 수 있는 별 <b>⭐${view.stars}</b>개 · 교실 오른쪽 문 밖에 새 공간이 기다려요</p>` : ''}
        ${preview ? `<p class="wi-note">${canBuy ? '🌈 구경하는 시간이에요 (마음 별은 저장되지 않아요)' : '👪 미리보기예요 (마음 별은 저장되지 않아요)'}</p>` : ''}
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
    if (misOn) world.mis.setOn(true);
    updateHud();
    if (visit) {
      setAct('say', `<div class="act-card say-card"><b>한마디 전하기</b><div class="act-words">${SAYS.map((s, i) => `<button class="btn btn-white small" data-say="${i}">${s.icon} ${s.text}</button>`).join('')}</div></div>`);
      updateWho();
    }
  }

  function finishTour(reason) {
    if (state.drawing) { state.drawing = false; root.classList.remove('drawing'); drawBox.hidden = true; world.setDrawMode(false); }
    closeDialog();
    state.running = false;
    sfx.ambientStop();
    $('#w-hud').hidden = true;
    bubble.hidden = true;
    for (const s of says.values()) s.el.remove();
    says.clear();
    const n = state.stars.size;
    const helped = state.helped;
    const seconds = Math.round(state.elapsed);
    const total = n + helped;
    const msg = n >= TOUR_STARS && helped >= TOUR_HELP ? '마음 별도, 친구 도우미 별도 모두 모았어요! 최고예요 😊'
      : n >= TOUR_STARS ? '마음 별을 모두 모았어요! 눈도 마음도 반짝반짝 😊'
        : helped >= 3 ? '친구들에게 다정하게 말해 줘서 고마워요. 멋진 도우미예요 💛'
          : n >= 4 ? '편안한 시간이었나요? 정말 잘 쉬었어요 😌'
            : total >= 1 ? '잘 쉬었어요. 다음엔 더 많은 별을 모아 봐요 🌟' : '눈을 잠깐 쉬었어요. 수고했어요 💛';
    card.hidden = false;
    card.innerHTML = `
      <div class="world-intro world-result">
        <div class="wi-emoji">${n >= TOUR_STARS ? '🏆' : '🌟'}</div>
        <h2>${reason === 'time' ? '5분이 다 됐어요' : '쉼터 여행 끝!'}</h2>
        <div class="wr-stars">${Array.from({ length: TOUR_STARS }, (_, i) => `<span class="${i < n ? 'on' : ''}" style="--i:${i}">★</span>`).join('')}</div>
        <p class="wr-count">마음 별 <b>${n}</b>개 모았어요${preview ? ' (미리보기)' : ''}</p>
        ${misOn ? `<div class="wr-stars help">${Array.from({ length: TOUR_HELP }, (_, i) => `<span class="${i < helped ? 'on' : ''}" style="--i:${i}">★</span>`).join('')}</div>
        <p class="wr-count">친구 도우미 별 <b>${helped}</b>개 🌟</p>` : ''}
        <p>${esc(msg)}</p>
        <div class="wr-sticker">🌈 마음 쉼터 스티커</div>
        <button class="btn btn-mint big" id="w-back">🎁 선물 받고 돌아가기</button>
      </div>`;
    if (total > 0) { sfx.success(); confetti({ count: 110, x: 0.5, y: 0.5, power: 1.1, emojis: ['⭐', '🌈', '✨'] }); }
    $('#w-back').onclick = () => finishOnce({ stars: n, helped, seconds, skipped: false });
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
    syncPresence(now);
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
    if (presence) { try { Promise.resolve(presence.leave()).catch(() => {}); } catch (_) { /* 무시 */ } } // 교실을 나갔다고 알린다
    world.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    root.remove();
  };

  showIntro();
  // 개발·점검용: localStorage.htf_debug = '1' 이면 밖에서 상태를 읽고 한 프레임씩 돌려 볼 수 있다
  ctl.debug = { state, input, pos, player, camera, scene, stops, crowd, bunny, colliders, update, renderer, beginTour, finishTour, gainStar, nextGoal, world, applyPeers, speak, says, talkers, halls, view, buyDoor, nearBarrier, mis: world.mis, openDialog, tryFix, enterDraw, exitDraw, updateEdges };
  try { if (localStorage.getItem('htf_debug') === '1') window.__htfWorld = ctl; } catch (_) { /* 무시 */ }
  return ctl;
}

// ────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────
// 부모님이 3D 를 쓸 수 없는 기기에서 교실에 들어가려 할 때
function fallbackVisit(root, { finish }, ctl) {
  root.innerHTML = `
    <div class="world-card">
      <div class="world-intro">
        <div class="wi-emoji">🧊</div>
        <h2>3D 교실을 열 수 없어요</h2>
        <p>이 기기에서는 3D 화면을 쓸 수 없어요.<br>다른 기기나 브라우저에서 열어 주세요.</p>
        <button class="btn btn-yellow" id="fv-back">← 돌아가기</button>
      </div>
    </div>`;
  root.querySelector('#fv-back').onclick = () => finish({ visit: true, stars: 0, seconds: 0, skipped: true });
  return ctl;
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
