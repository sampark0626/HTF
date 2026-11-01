import { api, setToken, hasToken, setAuthLostHandler, photoUrl, clearPhotoCache } from './api.js';
import { sfx } from './sfx.js';
import { confetti, celebrate, sparkle } from './fx.js';
import { openCamera } from './camera.js';
import { avatarHtml, defaultAvatar, mountAvatarPicker } from './avatar.js';

// ───────────────────────── 공통 도구 ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtClock = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
const fmtMMSS = (sec) => `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;

const MESSAGES = [
  'HTF 준비 시간이에요! 📚',
  '책상 위를 깨끗이 치워요 🧹',
  '연필이랑 지우개를 챙겨요 ✏️',
  '물 한 모금, 화장실도 다녀와요 💧',
  '준비됐으면 시작 버튼을 눌러요 🚀',
];
const QUICK = ['수학', '영어', '국어', '독서', '일기'];

const app = $('#app');
const state = {
  config: null,
  user: null,
  items: [],
  session: null,
  offset: 0, // 서버 시간 - 이 기기 시간
  timeUp: false,
  clearing: false,
  finishing: false,
  tourReward: null,
};

// 로그인한 친구는 내 캐릭터, 그 밖에는 서버가 알려 준 캐릭터(없으면 기본)
const avatarOf = (name) => {
  if (state.user && state.user.name === name) return state.user.avatar;
  const kids = state.config?.kids || [];
  const i = Math.max(0, kids.findIndex((k) => k.name === name));
  return (kids[i] && kids[i].avatar) || defaultAvatar(i);
};

let cleanups = [];
const onLeave = (fn) => cleanups.push(fn);

function mount(html, cls = '') {
  cleanups.forEach((fn) => { try { fn(); } catch (_) { /* 무시 */ } });
  cleanups = [];
  app.innerHTML = `<section class="screen ${cls}">${html}</section>`;
  window.scrollTo(0, 0);
  return app.firstElementChild;
}

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3700);
}

function banner(msg, kind = '') {
  const b = document.createElement('div');
  b.className = `banner ${kind}`;
  b.textContent = msg;
  $('#banners').appendChild(b);
  setTimeout(() => b.remove(), 3500);
}

function confirmDialog({ title, text = '', yes = '네', no = '아니요' }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="card modal" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${text ? `<p>${esc(text)}</p>` : ''}
        <div class="row">
          <button class="btn btn-white" data-v="0">${esc(no)}</button>
          <button class="btn btn-blue" data-v="1">${esc(yes)}</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    back.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      sfx.tap();
      back.remove();
      resolve(b.dataset.v === '1');
    });
  });
}

async function hydratePhotos(root) {
  await Promise.all($$('img[data-photo]', root).map(async (img) => {
    try { img.src = await photoUrl(img.dataset.photo, img.dataset.admin === '1'); } catch (_) { img.replaceWith(Object.assign(document.createElement('span'), { textContent: '🖼️' })); }
  }));
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const shake = (el) => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };

// ───────────────────────── 상단 바 ─────────────────────────
function setTopbar(mode) {
  const bar = $('#topbar');
  if (mode === 'none' || !state.user) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  bar.innerHTML = `
    <div class="who">${avatarHtml(state.user.avatar, { size: 'sm' })}<b>${esc(state.user.name)}</b></div>
    <div class="bar-actions">
      <button class="icon-btn" data-bar="mute" aria-label="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
      ${mode === 'full' ? '<button class="pill-btn" data-bar="mypage">👤 마이페이지</button><button class="pill-btn" data-bar="logout">🚪 나가기</button>' : ''}
    </div>`;
}

$('#topbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bar]');
  if (!b) return;
  sfx.unlock();
  const act = b.dataset.bar;
  if (act === 'mute') {
    sfx.setMuted(!sfx.muted);
    b.textContent = sfx.muted ? '🔇' : '🔊';
    sfx.tap();
  } else if (act === 'mypage') {
    sfx.tap();
    screenMyPage();
  } else if (act === 'logout') {
    sfx.tap();
    screenLogin();
  }
});

// ───────────────────────── 서버 상태 ─────────────────────────
function applyHtf(r) {
  state.items = r.items;
  state.session = r.session;
  state.offset = r.now - Date.now();
}

async function refreshHtf() {
  applyHtf(await api.htf());
}

async function goHome() {
  try {
    await refreshHtf();
  } catch (err) {
    toast(err.message, 'err');
    if (!hasToken()) screenLogin();
    return;
  }
  if (state.session) screenRun();
  else screenHomework();
}

async function afterAuth(r) {
  setToken(r.token);
  state.user = r.user;
  clearPhotoCache();
  sfx.success();
  await goHome();
}

// ───────────────────────── 1. 로그인 ─────────────────────────
function screenLogin() {
  state.user = null;
  state.items = [];
  state.session = null;
  setToken(null);
  clearPhotoCache();
  setTopbar('none');
  renderLogin();
  // "처음이에요" 표시를 최신으로 (바뀐 게 있을 때만 다시 그린다)
  api.config().then((c) => {
    const changed = JSON.stringify(c.kids) !== JSON.stringify(state.config.kids);
    state.config = c;
    if (changed) renderLogin();
  }).catch(() => {});
}

function renderLogin() {
  if (state.user) return;
  const { kids, persistent, aiEnabled } = state.config;
  const el = mount(`
    <div class="logo" aria-label="HTF"><span>H</span><span>T</span><span>F</span></div>
    <p class="tagline">Homework Time <b>Forty</b> min ⏱️</p>
    <h2 class="ask">누가 숙제할 거예요?</h2>
    <div class="kid-cards">
      ${kids.map((k, i) => `
        <button class="kid-card" data-name="${esc(k.name)}" style="--d:${i * 0.15}s">
          ${avatarHtml(k.avatar, { size: 'xl', bob: true })}
          <span>${esc(k.name)}</span>
          ${!k.registered ? '<span class="new-badge">처음이에요 ✨</span>' : k.needsPin ? '<span class="new-badge">새 비밀번호 🔑</span>' : ''}
        </button>`).join('')}
    </div>
    ${persistent ? '' : '<p class="foot-note warn">⚠️ 임시 저장 모드예요. 서버가 다시 켜지면 기록이 지워질 수 있어요. (부모님께 알려 주세요)</p>'}
    ${aiEnabled ? '' : '<p class="foot-note">AI 선생님은 아직 준비 중이에요. (사진은 저장돼요)</p>'}
    <button class="back-link parent-link" id="parent">👪 부모님 메뉴</button>
  `, 'center');
  el.addEventListener('click', (e) => {
    if (e.target.closest('#parent')) { sfx.tap(); screenParentLogin(); return; }
    const card = e.target.closest('.kid-card');
    if (!card) return;
    sfx.unlock();
    sfx.pop();
    const kid = state.config.kids.find((k) => k.name === card.dataset.name);
    if (!kid.registered) screenSetup(kid.name);
    else if (kid.needsPin) screenNewPin(kid.name);
    else screenPin(kid.name);
  });
}

// ───────────────────────── PIN 패드 ─────────────────────────
// onDone(pin) → { error } 흔들며 메시지 / { next } 잠깐 보여 주고 비우기 / undefined 그대로 두기
function pinPad(root, onDone) {
  let val = '';
  let busy = false;
  root.innerHTML = `
    <div class="pin-dots" id="dots"><i></i><i></i><i></i><i></i></div>
    <div class="pin-msg" id="pmsg" aria-live="polite"></div>
    <div class="keypad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
      <button class="ghost" tabindex="-1" aria-hidden="true"></button>
      <button data-k="0">0</button>
      <button data-k="b" aria-label="지우기">⌫</button>
    </div>`;
  const dots = $$('#dots i', root);
  const dotsBox = $('#dots', root);
  const msg = $('#pmsg', root);
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < val.length));

  async function push(d) {
    if (busy || val.length >= 4) return;
    val += d;
    msg.textContent = '';
    sfx.tap();
    paint();
    if (val.length < 4) return;
    busy = true;
    const r = await onDone(val);
    if (r && r.error) {
      msg.textContent = r.error;
      shake(dotsBox);
      sfx.error();
      await sleep(350);
      val = '';
    } else if (r && r.next) {
      await sleep(300);
      val = '';
    }
    paint();
    busy = false;
  }
  const back = () => { if (!busy) { val = val.slice(0, -1); paint(); } };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    if (b.dataset.k === 'b') back();
    else push(b.dataset.k);
  });
  const onKey = (e) => {
    if (/^\d$/.test(e.key)) push(e.key);
    else if (e.key === 'Backspace') back();
  };
  document.addEventListener('keydown', onKey);
  onLeave(() => document.removeEventListener('keydown', onKey));
}

function screenPin(name) {
  const av = avatarOf(name);
  mount(`
    <div class="pin-screen">
      <button class="back-link" id="back">← 다른 친구</button>
      ${avatarHtml(av, { size: 'xl', bob: true })}
      <h2>${esc(name)}, 안녕! 👋</h2>
      <p>비밀번호 숫자 4개를 눌러 주세요</p>
      <div id="pad"></div>
    </div>`, 'center');
  $('#back').onclick = () => { sfx.tap(); screenLogin(); };
  pinPad($('#pad'), async (pin) => {
    try {
      await afterAuth(await api.login(name, pin));
    } catch (err) {
      return { error: err.message };
    }
    return undefined;
  });
}

// 비밀번호를 새로 정하는 화면 (숫자 4개를 두 번 눌러 확인). 첫 로그인과 "부모님이 초기화한 뒤"가 함께 쓴다.
function pinSetScreen({ title, backLabel, onBack, submit }) {
  let first = null;
  const el = mount(`
    <div class="pin-screen">
      <button class="back-link" id="back">${esc(backLabel)}</button>
      <h2 id="ttl">${esc(title)}</h2>
      <p id="hint">숫자 4개를 눌러 주세요. 다음에 올 때 이 번호가 필요해요!</p>
      <div id="pad"></div>
    </div>`, 'center');
  const reset = () => {
    first = null;
    $('#ttl', el).textContent = title;
    $('#hint', el).textContent = '숫자 4개를 눌러 주세요';
  };
  $('#back', el).onclick = () => { sfx.tap(); onBack(); };
  pinPad($('#pad', el), async (pin) => {
    if (!first) {
      first = pin;
      $('#ttl', el).textContent = '한 번 더 눌러 주세요 🔁';
      $('#hint', el).textContent = '같은 번호를 다시 눌러 확인해요';
      return { next: true };
    }
    if (pin !== first) {
      reset();
      return { error: '번호가 달라요. 처음부터 다시 해요' };
    }
    try {
      await submit(pin);
    } catch (err) {
      reset();
      return { error: err.message };
    }
    return undefined;
  });
}

// 부모님이 비밀번호를 초기화한 친구: 새 비밀번호를 직접 정한다 (기록은 그대로)
function screenNewPin(name) {
  setTopbar('none');
  pinSetScreen({
    title: `${name}, 새 비밀번호를 정해요 🔑`,
    backLabel: '← 다른 친구',
    onBack: screenLogin,
    submit: async (pin) => afterAuth(await api.setPin(name, pin)),
  });
}

// ───────────────────────── 2. 처음 설정 ─────────────────────────
function birthFields(value = '') {
  const [y, m, d] = value ? value.split('-').map(Number) : [0, 0, 0];
  const now = new Date().getFullYear();
  const years = [];
  for (let i = now - 3; i >= 2000; i -= 1) years.push(i);
  const opts = (list, sel, unit) => list.map((v) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${v}${unit}</option>`).join('');
  const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
  return `
    <div class="field"><span class="lbl">🎂 생년월일</span>
      <div class="field-row">
        <select id="by" aria-label="태어난 해"><option value="">년</option>${opts(years, y, '년')}</select>
        <select id="bm" aria-label="태어난 달"><option value="">월</option>${opts(range(12), m, '월')}</select>
        <select id="bd" aria-label="태어난 날"><option value="">일</option>${opts(range(31), d, '일')}</select>
      </div>
    </div>`;
}

function readBirth(root) {
  const y = $('#by', root).value;
  const m = $('#bm', root).value;
  const d = $('#bd', root).value;
  if (!y || !m || !d) return '';
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  const ok = new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;
  return ok ? iso : '';
}

function screenSetup(name) {
  setTopbar('none');
  let avatar = avatarOf(name);
  const profile = { birth: '', school: '', className: '' };

  function stepProfile() {
    const el = mount(`
      <button class="back-link" id="back">← 다른 친구</button>
      <form class="card form-card" id="form" autocomplete="off" novalidate>
        <div style="align-self:center">${avatarHtml(avatar, { size: 'xl', bob: true })}</div>
        <h2>${esc(name)}, 처음 왔구나! 👋</h2>
        <p class="sub">나를 소개해 줘요. (나중에 마이페이지에서 고칠 수 있어요)</p>
        ${birthFields(profile.birth)}
        <div class="field"><label for="school">🏫 학교</label>
          <input id="school" maxlength="40" placeholder="예) 해맑초등학교" value="${esc(profile.school)}"></div>
        <div class="field"><label for="cls">📘 학년 / 반</label>
          <input id="cls" maxlength="30" placeholder="예) 3학년 2반" value="${esc(profile.className)}"></div>
        <p class="err" id="err" aria-live="polite"></p>
        <button class="btn btn-blue big" type="submit">다음 ➡️</button>
      </form>`, 'center');
    $('#back', el).onclick = () => { sfx.tap(); screenLogin(); };
    $('#form', el).onsubmit = (e) => {
      e.preventDefault();
      const birth = readBirth(el);
      const school = $('#school', el).value.trim();
      const className = $('#cls', el).value.trim();
      const err = !birth ? '생년월일을 골라 주세요' : !school ? '학교 이름을 적어 주세요' : !className ? '학년/반을 적어 주세요' : '';
      if (err) {
        $('#err', el).textContent = err;
        shake($('#form', el));
        sfx.error();
        return;
      }
      Object.assign(profile, { birth, school, className });
      sfx.pop();
      stepAvatar();
    };
  }

  // 나를 나타내는 캐릭터 꾸미기
  function stepAvatar() {
    const el = mount(`
      <button class="back-link" id="back">← 고치기</button>
      <div class="card form-card avatar-card">
        <h2>나를 닮은 캐릭터를 꾸며요 🎨</h2>
        <p class="sub">친구, 색깔, 꾸미기를 골라 보세요. (나중에 마이페이지에서 또 바꿀 수 있어요)</p>
        <div id="picker"></div>
        <button class="btn btn-blue big" id="next">다음 ➡️</button>
      </div>`, 'center');
    const picker = mountAvatarPicker($('#picker', el), avatar);
    $('#back', el).onclick = () => { avatar = picker.get(); sfx.tap(); stepProfile(); };
    $('#next', el).onclick = () => { avatar = picker.get(); sfx.pop(); stepPin(); };
  }

  function stepPin() {
    pinSetScreen({
      title: '비밀번호를 정해요 🔑',
      backLabel: '← 캐릭터 고치기',
      onBack: stepAvatar,
      submit: async (pin) => afterAuth(await api.register({ name, ...profile, avatar, pin })),
    });
  }

  stepProfile();
}

// ───────────────────────── 3. 오늘의 Homework ─────────────────────────
const carryLabel = (n) => (n >= 2 ? `🔁 ${n}번째 이어하기` : '🔁 지난번에 못 끝냈어요');
const parentBadge = (it) => (it.byParent ? '<span class="carry by-parent">👪 부모님이 넣어 줬어요</span>' : '');

function screenHomework() {
  setTopbar('full');
  state.timeUp = false;
  const pending = () => state.items.filter((i) => i.status === 'pending');
  const el = mount(`
    <div class="hw">
      <div class="hw-head">
        ${avatarHtml(state.user.avatar, { size: 'lg', bob: true })}
        <div><h2>오늘의 Homework ✏️</h2><p>${esc(state.user.name)}, 오늘 할 숙제를 모두 적어 보자!</p></div>
      </div>
      <div class="hanja-entry hanja-exam" id="hanja-exam" hidden></div>
      <div class="hanja-entry" id="hanja" hidden></div>
      <form class="add-row" id="add" autocomplete="off">
        <input id="title" maxlength="60" placeholder="예) 수학 문제집 2쪽" enterkeyhint="done" aria-label="숙제 이름">
        <button class="btn btn-blue" type="submit">➕ 추가</button>
      </form>
      <div class="chips" id="freq" hidden></div>
      <div class="chips"><small>빠른 입력</small>${QUICK.map((c) => `<button type="button" class="chip" data-chip="${c}">${c}</button>`).join('')}</div>
      <ul class="hw-list" id="list"></ul>
      <div class="hw-cta"><button class="btn btn-mint big" id="done">✅ 다 적었어요!</button></div>
    </div>`);
  const list = $('#list', el);
  const input = $('#title', el);
  const doneBtn = $('#done', el);
  const freqBox = $('#freq', el);
  const hanjaBox = $('#hanja', el);
  const examBox = $('#hanja-exam', el);

  // 한문 6급 입구: 오늘의 5자를 숙제 목록에 넣거나, 바로 공부한다 (손이 불편한 날에도 태블릿으로 할 수 있다)
  const LEVEL_BTNS = [['8급', '쉬운 8급부터'], ['7급Ⅱ', '7급Ⅱ부터'], ['7급', '7급부터'], ['6급Ⅱ', '6급Ⅱ부터'], ['6급', '6급 새 한자부터']];
  async function renderHanja() {
    const h = state.user.hanja;
    if (!h || !h.enabled) { hanjaBox.hidden = true; examBox.hidden = true; return; }
    let hz;
    let course;
    try {
      hz = await import('./hanja.js');
      course = await hz.loadCourse();
    } catch (_) { hanjaBox.hidden = true; examBox.hidden = true; return; } // 자료를 못 불러와도 숙제 입력은 그대로 된다
    if (!app.contains(el)) return;
    const queued = state.items.some((i) => i.kind === 'hanja' && i.status === 'pending');

    // 시험 대비 카드: 남은 날, 오늘 할 일(모의시험 · 약한 글자 수업 · 순서대로 수업)
    const ex = h.exam;
    if (ex) {
      let weakN = 0;
      try { weakN = (await api.hanja()).weak.length; } catch (_) { /* 약한 글자 수는 없어도 된다 */ }
      if (!app.contains(el)) return;
      const next = h.canAdvance && h.started ? hz.dayOf(course, h.day) : null;
      const plan = ex.phase === 'study' ? `오늘의 목표: 순서대로 수업 ${h.goal}개 + 모의시험 1번`
        : ex.phase === 'final' ? '마무리 3일! 모의시험으로 약한 글자를 잡아요'
          : '오늘이 시험날! 모의시험으로 가볍게 몸을 풀고 자신 있게 가요 💪';
      examBox.hidden = false;
      examBox.classList.toggle('he-done', h.doneToday);
      examBox.innerHTML = `
        <div class="he-dday"><b>${ddayText(ex)}</b><small>${monthDay(ex.date)} 시험</small></div>
        <div class="he-body"><b>🎯 한자능력검정 6급 시험 준비${h.doneToday ? ' · 오늘의 한문 ✅' : ''}</b>
          <small>${plan}${queued ? ' · 숙제 목록에 들어 있어요' : ''}</small></div>
        ${next ? `<div class="he-chars">${next.chars.map((c) => `<b>${esc(c.h)}</b>`).join('')}</div>` : ''}
        <div class="he-btns">
          ${queued || h.doneToday ? '' : '<button class="btn btn-yellow small" data-hadd="1">➕ 숙제에 넣기</button>'}
          <button class="btn btn-hanja small" data-hgo="mock">📝 모의시험</button>
          ${weakN ? `<button class="btn btn-hanja small" data-hgo="weak">🎯 약한 글자 ${weakN}개</button>` : ''}
          ${next ? `<button class="btn btn-white small" data-hgo="today">📖 순서대로 ${h.advToday}/${h.goal}</button>` : ''}
          <button class="btn btn-white small" data-hgo="book">📚 교재 글자</button>
        </div>`;
    } else {
      examBox.hidden = true;
    }
    // 이미 시작했다면 시험 대비 카드가 순서대로 수업까지 맡는다
    if (ex && h.started) { hanjaBox.hidden = true; return; }

    hanjaBox.hidden = false;
    hanjaBox.classList.toggle('he-done', h.doneToday || h.finished);
    if (!h.started) {
      hanjaBox.innerHTML = `
        <div class="he-body"><b>📖 한문 6급 도전! 하루 5자</b>
          <small>태블릿에 획순대로 따라 쓰면서 쉽게 외워요. 손이 불편해도 괜찮아요.</small></div>
        <div class="he-levels"><small>${ex ? '교재에서 이미 배운 단계는 건너뛰어도 돼요. 모의시험이 약한 글자를 찾아 줘요. ' : ''}어디서부터 시작할까요?</small>
          ${LEVEL_BTNS.map(([, label], i) => `<button class="btn btn-white small" data-hlevel="${i}">${label}</button>`).join('')}</div>`;
      return;
    }
    if (h.finished) {
      hanjaBox.innerHTML = `
        <div class="he-body"><b>🏆 한문 6급 300자를 모두 배웠어요!</b><small>이제 복습으로 실력을 지켜요.</small></div>
        <div class="he-btns"><button class="btn btn-hanja small" data-hgo="replay">🔁 복습 수업</button></div>`;
      return;
    }
    const d = hz.dayOf(course, !h.canAdvance ? h.day - 1 : h.day);
    const chars = d.chars.map((c) => `<b>${esc(c.h)}</b>`).join('');
    if (!h.canAdvance) {
      hanjaBox.innerHTML = `
        <div class="he-chars">${chars}</div>
        <div class="he-body"><b>🎉 오늘의 한문 5자 끝! (Day ${d.day})</b><small>내일은 Day ${h.day} 가 열려요. 오늘 배운 글자를 한 번 더 복습해 볼까요?</small></div>
        <div class="he-btns"><button class="btn btn-white small" data-hgo="replay">🔁 복습하기</button></div>`;
      return;
    }
    hanjaBox.innerHTML = `
      <div class="he-chars">${chars}</div>
      <div class="he-body"><b>📖 오늘의 한문 5자 · Day ${d.day}</b>
        <small>${esc(d.title)} · ${esc(d.level)} · ${queued ? '숙제 목록에 들어 있어요. 타이머가 시작되면 "📖 공부하기"를 눌러요' : '숙제로 넣으면 HTF 타이머 안에서 클리어해요'}</small></div>
      <div class="he-btns">
        ${queued ? '' : '<button class="btn btn-yellow small" data-hadd="1">➕ 숙제에 넣기</button>'}
        <button class="btn btn-hanja small" data-hgo="today">✏️ 지금 해볼래요</button>
      </div>`;
  }
  renderHanja();

  async function afterHanja(r) {
    if (r && r.done && r.saved && r.saved.item) state.items = state.items.filter((i) => i.id !== r.saved.item.id);
    renderList();
    renderFreq();
    renderHanja();
  }

  // 자주 하는 숙제: 지난번들에서 같은 이름으로 2번 이상 적은 숙제를 한 번에 넣는 단축 버튼
  const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  let frequent = [];
  function renderFreq() {
    const have = new Set(pending().map((i) => norm(i.title)));
    const shown = frequent.filter((f) => !have.has(norm(f.title)));
    freqBox.hidden = !shown.length;
    freqBox.innerHTML = shown.length
      ? `<small>⭐ 자주 하는 숙제</small>${shown.map((f) => `<button type="button" class="chip freq" data-quick="${esc(f.title)}" title="누르면 바로 들어가요">＋ ${esc(f.title)}</button>`).join('')}`
      : '';
  }
  api.frequent().then((r) => { frequent = r.items; renderFreq(); }).catch(() => { /* 단축 버튼은 없어도 된다 */ });

  function renderList(newId) {
    const items = pending();
    list.innerHTML = items.length
      ? items.map((it, i) => `
          <li class="hw-item ${it.id === newId ? 'new' : ''}" data-id="${it.id}" style="--d:${newId ? 0 : i * 0.05}s">
            <span class="hw-no">${i + 1}</span>
            <span class="hw-title">${esc(it.title)}${it.carryCount > 0 ? `<span class="carry">${carryLabel(it.carryCount)}</span>` : ''}${parentBadge(it)}</span>
            <button class="icon-btn" data-del="${it.id}" aria-label="지우기">🗑️</button>
          </li>`).join('')
      : '<li class="card empty"><span class="big-emoji">📝</span>아직 숙제가 없어요.<br>오늘 할 숙제를 적어 볼까요?</li>';
    doneBtn.disabled = !items.length;
  }
  renderList();

  let adding = false;
  async function addTitle(title) {
    if (adding) return false;
    adding = true;
    sfx.unlock();
    try {
      const { item } = await api.addHomework(title);
      state.items.push(item);
      renderList(item.id);
      renderFreq();
      sfx.pop();
      return true;
    } catch (err) {
      toast(err.message, 'err');
      sfx.error();
      return false;
    } finally {
      adding = false;
    }
  }

  $('#add', el).onsubmit = async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) { shake(input); sfx.error(); input.focus(); return; }
    if (await addTitle(title)) input.value = '';
    input.focus();
  };

  el.addEventListener('click', async (e) => {
    const lvl = e.target.closest('[data-hlevel]');
    if (lvl) {
      sfx.pop();
      lvl.disabled = true;
      try {
        Object.assign(state.user, (await api.hanjaStart(Number(lvl.dataset.hlevel))).user);
        sfx.success();
        renderHanja();
      } catch (err) {
        lvl.disabled = false;
        toast(err.message, 'err');
        sfx.error();
      }
      return;
    }
    const hadd = e.target.closest('[data-hadd]');
    if (hadd) {
      sfx.pop();
      hadd.disabled = true;
      try {
        const { item } = await api.hanjaHomework();
        if (!state.items.some((i) => i.id === item.id)) state.items.push(item);
        renderList(item.id);
        renderHanja();
      } catch (err) {
        hadd.disabled = false;
        toast(err.message, 'err');
        sfx.error();
      }
      return;
    }
    const hgo = e.target.closest('[data-hgo]');
    if (hgo) {
      sfx.unlock();
      sfx.pop();
      afterHanja(await runHanja({ mode: hgo.dataset.hgo }));
      return;
    }
    const quick = e.target.closest('[data-quick]');
    if (quick) {
      addTitle(quick.dataset.quick);
      return;
    }
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      sfx.tap();
      input.value = `${chip.dataset.chip} `;
      input.focus();
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      sfx.tap();
      const li = del.closest('li');
      li.classList.add('out');
      try {
        await api.deleteHomework(del.dataset.del);
        await sleep(280);
        state.items = state.items.filter((i) => i.id !== del.dataset.del);
        renderList();
        renderFreq();
      } catch (err) {
        li.classList.remove('out');
        toast(err.message, 'err');
      }
    }
  });

  doneBtn.onclick = () => { sfx.pop(); screenReady(); };
}

// ───────────────────────── 4. 시계 · 준비 화면 ─────────────────────────
function clockSvg() {
  const pt = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [100 + r * Math.sin(a), 100 - r * Math.cos(a)];
  };
  let marks = '';
  for (let i = 0; i < 60; i += 1) {
    const big = i % 5 === 0;
    const [x1, y1] = pt(big ? 78 : 84, i * 6);
    const [x2, y2] = pt(90, i * 6);
    marks += `<line class="tick ${big ? 'big' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  let nums = '';
  for (let n = 1; n <= 12; n += 1) {
    const [x, y] = pt(64, n * 30);
    nums += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${n}</text>`;
  }
  return `
    <svg class="clock" viewBox="0 0 200 200" role="img" aria-label="시계">
      <circle class="face" cx="100" cy="100" r="95"/>
      ${marks}${nums}
      <line class="hand h" data-hand="h" x1="100" y1="100" x2="100" y2="58"/>
      <line class="hand m" data-hand="m" x1="100" y1="100" x2="100" y2="34"/>
      <line class="hand s" data-hand="s" x1="100" y1="112" x2="100" y2="24"/>
      <circle class="pin" cx="100" cy="100" r="7"/>
    </svg>`;
}

function tickClock(root) {
  const d = new Date();
  const s = d.getSeconds() + d.getMilliseconds() / 1000;
  const m = d.getMinutes() + s / 60;
  const h = (d.getHours() % 12) + m / 60;
  const set = (k, deg) => $(`[data-hand="${k}"]`, root).setAttribute('transform', `rotate(${deg} 100 100)`);
  set('h', h * 30);
  set('m', m * 6);
  set('s', s * 6);
  $('#digital', root).textContent = fmtClock(d);
}

function screenReady() {
  setTopbar('full');
  const pend = state.items.filter((i) => i.status === 'pending');
  const el = mount(`
    <div class="ready">
      <div class="card clock-card">
        ${clockSvg()}
        <div class="digital" id="digital"></div>
        <div class="dateline">${new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</div>
      </div>
      <div class="ready-right">
        <div class="bubble"><span class="mascot">🦉</span><div class="msg" id="msg"></div></div>
        <div class="todo-peek">${pend.map((i) => `<span>${esc(i.title)}</span>`).join('')}</div>
        <div class="timer-label">⏱️ 오늘의 HTF 시간</div>
        <div class="timer-set">
          <button class="btn btn-white step" data-step="-5" aria-label="5분 줄이기">−</button>
          <div class="timer-box"><input id="mins" type="number" inputmode="numeric" min="1" max="120" value="${state.user.timerMin || 40}" aria-label="분"><span>분</span></div>
          <button class="btn btn-white step" data-step="5" aria-label="5분 늘이기">＋</button>
        </div>
        <button class="btn btn-coral big start-btn" id="start"><span class="rk">🚀</span> HTF 시작!</button>
        <button class="back-link" id="back" style="align-self:center">← 숙제 고치기</button>
      </div>
    </div>`);

  tickClock(el);
  const clockIv = setInterval(() => tickClock(el), 100);
  let mi = 0;
  const msg = $('#msg', el);
  const nextMsg = () => { msg.innerHTML = `<span>${MESSAGES[mi % MESSAGES.length]}</span>`; mi += 1; };
  nextMsg();
  const msgIv = setInterval(nextMsg, 3200);
  onLeave(() => { clearInterval(clockIv); clearInterval(msgIv); });

  const mins = $('#mins', el);
  const readMins = () => clamp(Math.round(Number(mins.value)) || 40, 1, 120);
  el.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (!step) return;
    sfx.tap();
    mins.value = clamp(readMins() + Number(step.dataset.step), 1, 120);
  });
  mins.addEventListener('blur', () => { mins.value = readMins(); });

  $('#back', el).onclick = () => { sfx.tap(); screenHomework(); };
  let starting = false;
  $('#start', el).onclick = async () => {
    if (starting) return;
    starting = true;
    const m = readMins();
    mins.value = m;
    sfx.unlock();
    if (m !== state.user.timerMin) {
      api.updateMe({ timerMin: m }).then((r) => { state.user = r.user; }).catch(() => {});
    }
    const overlay = await countdownOverlay();
    try {
      applyHtf(await api.startHtf(m * 60));
      screenRun();
    } catch (err) {
      toast(err.message, 'err');
      sfx.error();
    }
    starting = false;
    overlay.remove();
  };
}

// 준비~ 3, 2, 1, GO!
async function countdownOverlay() {
  const ov = document.createElement('div');
  ov.className = 'go-overlay';
  document.body.appendChild(ov);
  for (const n of [3, 2, 1]) {
    ov.innerHTML = `<div class="num">${n}</div>`;
    sfx.count(n);
    await sleep(900);
  }
  ov.innerHTML = '<div class="num go">GO!</div>';
  sfx.go();
  confetti({ count: 90, x: 0.5, y: 0.55, emojis: ['⭐', '✨'] });
  await sleep(600);
  return ov;
}

// ───────────────────────── 5. HTF 진행 (타이머) ─────────────────────────
// 한문 기록의 이름: 수업(Day N) / 약한 글자 수업 / 모의시험
const hanjaLogIcon = (l) => ({ mock: '📝', weak: '🎯', book: '📚' }[l.kind] || '📖');
const hanjaLogLabel = (l) => (l.kind === 'book' ? `📚 교재 수업 (${l.total}자)` : l.kind === 'mock' ? `📝 모의시험 ${l.total - l.misses} / ${l.total}` : l.kind === 'weak' ? `🎯 약한 글자 수업 (${l.total}자)` : `Day ${l.day}${l.advanced ? '' : ' (복습)'}`);
const ddayText = (ex) => (ex.dday === 0 ? 'D-day' : `D-${ex.dday}`);
const monthDay = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
const stars = (score) => `<span class="mini-stars">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= score ? '' : 'off'}">★</span>`).join('')}</span>`;

function verdictInfo(it) {
  if (it.verdict === 'course') return { cls: 'good', emoji: '📖', label: '한문 수업을 마쳤어요' };
  if (it.aiStatus === 'error') return { cls: 'wait', emoji: '😴', label: 'AI 선생님이 쉬는 중이에요 (사진은 저장됐어요)' };
  if (it.verdict === 'good') return { cls: 'good', emoji: '🌟', label: '성의 있게 했어요' };
  if (it.verdict === 'okay') return { cls: 'okay', emoji: '🙂', label: '보통이에요' };
  if (it.verdict === 'poor') return { cls: 'poor', emoji: '💪', label: '조금 더 성의가 필요해요' };
  if (it.verdict === 'unverified') return { cls: 'unv', emoji: '🤔', label: '결과물을 확인하지 못했어요' };
  return { cls: 'none', emoji: '📸', label: '사진이 저장됐어요' };
}

function screenRun() {
  setTopbar('minimal');
  state.timeUp = false;
  state.clearing = false;
  state.finishing = false;
  const s = state.session;
  const total = s.durationSec * 1000;
  const C = 2 * Math.PI * 90;
  const el = mount(`
    <div class="run">
      <div class="run-left">
        <div class="ring" id="ring">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle class="trk" cx="100" cy="100" r="90"/>
            <circle class="fg" id="fg" cx="100" cy="100" r="90" transform="rotate(-90 100 100)" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"/>
          </svg>
          <div class="ring-text"><div id="time">00:00</div><small>남은 시간</small></div>
        </div>
        <div class="track" aria-hidden="true">
          <div class="track-line"><div class="track-fill" id="fill"></div></div>
          <div class="rocket" id="rocket">🚀</div><div class="flag">🏁</div>
        </div>
        <p class="endtime" id="endtime"></p>
        <div class="pause-row">
          <button class="btn btn-white small" id="pause">⏸️ 잠깐 멈춤</button>
          <small id="pause-left"></small>
        </div>
      </div>
      <div class="run-right">
        <div class="run-head"><h2>오늘의 Homework</h2><span class="pill" id="prog"></span></div>
        <ul class="tasks" id="tasks"></ul>
        <div class="run-foot"><button class="btn btn-white small" id="quit">🏳️ 그만할래요</button></div>
      </div>
    </div>`);
  const ring = $('#ring', el);
  const fg = $('#fg', el);
  const timeEl = $('#time', el);
  const fill = $('#fill', el);
  const rocket = $('#rocket', el);
  const tasks = $('#tasks', el);
  const prog = $('#prog', el);

  // 화면이 꺼지지 않게
  let wake = null;
  const keepAwake = async () => {
    try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (_) { /* 무시 */ }
  };
  keepAwake();
  const onVis = () => { if (document.visibilityState === 'visible') keepAwake(); };
  document.addEventListener('visibilitychange', onVis);
  onLeave(() => { document.removeEventListener('visibilitychange', onVis); if (wake) wake.release().catch(() => {}); });

  // 할 일 목록
  const todoCard = (it, i, animate) => `
    <li class="task ${it.kind === 'hanja' ? 'hanja' : ''} ${animate ? 'enter' : ''}" data-id="${it.id}" style="--d:${i * 0.08}s">
      <span class="no">${i + 1}</span>
      <div class="t-body"><div class="t-title">${esc(it.title)}</div>${it.carryCount > 0 ? `<span class="carry">${carryLabel(it.carryCount)}</span>` : ''}${parentBadge(it)}</div>
      ${it.kind === 'hanja'
    ? `<button class="btn btn-hanja clear-btn" data-hanja="${it.id}" style="--d:${i * 0.4}s">📖 공부하기</button>`
    : `<button class="btn btn-mint clear-btn" data-clear="${it.id}" style="--d:${i * 0.4}s">클리어! ✨</button>`}
    </li>`;
  const doneCard = (it, justId) => {
    const v = verdictInfo(it);
    return `
    <li class="task done ${it.id === justId ? 'just' : ''}" data-id="${it.id}">
      <span class="no">✔</span>
      <div class="t-body"><div class="t-title">${esc(it.title)}</div>${it.score ? stars(it.score) : ''} <span title="${esc(v.label)}">${v.emoji}</span></div>
      ${it.photoId ? `<img class="thumb" data-photo="${it.photoId}" alt="">` : ''}
      <span class="stamp">CLEAR!</span>
    </li>`;
  };
  function renderTasks({ animate = false, justId = null } = {}) {
    tasks.innerHTML = state.items.map((it, i) => (it.status === 'done' ? doneCard(it, justId) : todoCard(it, i, animate))).join('');
    hydratePhotos(tasks);
    const done = state.items.filter((i) => i.status === 'done').length;
    prog.textContent = `${done} / ${state.items.length} 클리어`;
    if (justId) { prog.classList.remove('pop'); void prog.offsetWidth; prog.classList.add('pop'); }
  }
  renderTasks({ animate: true });

  // 중간 응원 메시지 (이미 지난 시점은 건너뛴다)
  const totalSec = s.durationSec;
  const marks = [
    { at: Math.floor(totalSec / 2), text: '절반 지났어요! 힘내요 💪', kind: '' },
    { at: 600, text: '10분 남았어요! 🏃', kind: '', min: 1200 },
    { at: 300, text: '5분 남았어요! 🔥', kind: 'hot', min: 600 },
    { at: 60, text: '1분 남았어요!! ⚡', kind: 'hot', min: 180 },
  ].filter((m) => !m.min || totalSec > m.min);
  const fired = new Set();
  // 남은 시간: 멈춘 동안에는 서버가 알려 준 고정값, 흐르는 동안에는 종료 시각까지
  const remainMsNow = () => (s.pausedAt ? s.remainingMs : Math.max(0, s.endsAt - (Date.now() + state.offset)));
  marks.forEach((m, i) => { if (Math.ceil(remainMsNow() / 1000) <= m.at) fired.add(i); });

  let lastSec = -1;
  function tick() {
    const paused = Boolean(s.pausedAt);
    const remainMs = remainMsNow();
    const sec = Math.ceil(remainMs / 1000);
    const ratio = remainMs / total;
    fg.setAttribute('stroke-dashoffset', (C * (1 - ratio)).toFixed(2));
    const p = clamp(1 - ratio, 0, 1);
    fill.style.width = `${p * 100}%`;
    rocket.style.left = `calc(${p} * (100% - 34px))`;
    ring.classList.toggle('paused', paused);
    if (sec !== lastSec) {
      lastSec = sec;
      timeEl.textContent = fmtMMSS(sec);
      const left = sec / s.durationSec;
      ring.classList.toggle('warn', left <= 0.33 && left > 0.1);
      ring.classList.toggle('hot', left <= 0.1);
      const last10 = sec <= 10 && sec > 0 && !paused;
      ring.classList.toggle('last10', last10);
      if (last10) { sfx.tick(); timeEl.style.animation = 'none'; void timeEl.offsetWidth; timeEl.style.animation = ''; }
      if (!paused) {
        marks.forEach((m, i) => {
          if (!fired.has(i) && sec <= m.at && sec > 0) {
            fired.add(i);
            banner(m.text, m.kind);
            if (m.kind) sfx.warn(); else sfx.pop();
          }
        });
      }
    }
    if (remainMs <= 0 && !paused) {
      clearInterval(iv);
      onTimeUp();
    }
  }
  const iv = setInterval(tick, 200);
  onLeave(() => clearInterval(iv));

  // ── 잠깐 멈춤 (화장실·물 마시기 등): 타이머가 멈추고, 한 번의 HTF 에서 합쳐 정해진 시간까지만 쓴다 ──
  const pauseBtn = $('#pause', el);
  const pauseLeftEl = $('#pause-left', el);
  const endEl = $('#endtime', el);
  let pauseBase = { left: s.pauseLeftMs ?? 0, at: Date.now() };
  const pauseLeftNow = () => Math.max(0, pauseBase.left - (s.pausedAt ? Date.now() - pauseBase.at : 0));
  let pauseOv = null;
  let pauseIv = null;
  let resuming = false;

  function refreshPauseUi() {
    const left = pauseLeftNow();
    pauseBtn.disabled = Boolean(s.pausedAt) || left <= 0;
    pauseLeftEl.textContent = left > 0 ? `쉬는 시간 ${fmtMMSS(Math.ceil(left / 1000))} 남음` : '쉬는 시간을 다 썼어요';
    endEl.textContent = s.endsAt ? `⏰ ${fmtClock(s.endsAt)} 에 끝나요` : '⏸️ 잠깐 멈춰 있어요';
  }

  function applySession(r) {
    Object.assign(s, { endsAt: null, pausedAt: null, remainingMs: null }, r.session);
    state.offset = r.now - Date.now();
    pauseBase = { left: r.session.pauseLeftMs, at: Date.now() };
    refreshPauseUi();
    tick();
  }

  function hidePauseOverlay() {
    clearInterval(pauseIv);
    if (pauseOv) pauseOv.remove();
    pauseOv = null;
  }
  onLeave(hidePauseOverlay);

  function showPauseOverlay() {
    hidePauseOverlay();
    const [emoji, msg] = [
      ['🚽', '다녀와요! 급할 땐 참지 말고요'],
      ['💧', '물 한 모금 마시고 와요'],
      ['🧘', '기지개 쭉~ 쉬었다 와요'],
      ['🙋', '도움이 필요하면 어른께 말해요'],
    ][Math.floor(Math.random() * 4)];
    pauseOv = document.createElement('div');
    pauseOv.className = 'overlay pause-ov';
    pauseOv.innerHTML = `
      <div class="card ovl-card pause-card" role="dialog" aria-modal="true" aria-label="잠깐 멈춤">
        <div class="pause-emoji">${emoji}</div>
        <h2>잠깐 멈췄어요</h2>
        <p>${esc(msg)}</p>
        <div class="pause-stats">
          <div>HTF 남은 시간<b id="p-remain"></b></div>
          <div>쉬는 시간 남음<b id="p-left"></b></div>
        </div>
        <button class="btn btn-mint big" id="resume">▶️ 다시 시작</button>
      </div>`;
    document.body.appendChild(pauseOv);
    pauseOv.addEventListener('click', (e) => {
      if (e.target.closest('#resume')) { sfx.tap(); doResume(); }
    });
    resuming = false;
    const update = () => {
      $('#p-remain', pauseOv).textContent = fmtMMSS(Math.ceil((s.remainingMs ?? 0) / 1000));
      const left = pauseLeftNow();
      $('#p-left', pauseOv).textContent = fmtMMSS(Math.ceil(left / 1000));
      if (left <= 0) doResume(); // 쉬는 시간을 다 쓰면 서버도 같은 때 자동으로 다시 흐르게 한다
    };
    update();
    pauseIv = setInterval(update, 250);
  }

  async function doPause() {
    if (s.pausedAt || state.clearing || state.finishing || state.timeUp || pauseBtn.disabled) return;
    try {
      applySession(await api.pauseHtf());
      showPauseOverlay();
      sfx.pop();
    } catch (err) {
      toast(err.message, 'err');
      sfx.error();
      if (err.status === 409) finishHtf('timeup');
    }
  }

  async function doResume() {
    if (resuming) return;
    resuming = true;
    try {
      applySession(await api.resumeHtf());
      hidePauseOverlay();
      sfx.go();
      banner('▶️ 다시 시작! 힘내요 💪');
    } catch (err) {
      resuming = false;
      toast(err.message, 'err');
      sfx.error();
      if (err.status === 409) { hidePauseOverlay(); finishHtf('timeup'); }
    }
  }

  refreshPauseUi();
  tick();
  if (s.pausedAt) showPauseOverlay(); // 멈춘 채로 새로고침/다시 로그인한 경우

  async function onTimeUp() {
    state.timeUp = true;
    sfx.alarm();
    if (state.clearing) {
      toast('⏰ 시간이 끝났어요! 이 숙제만 마무리해요');
      return;
    }
    await finishHtf('timeup');
  }

  // 클리어 → 셀카 → AI → 결과
  async function onClear(id, btn) {
    if (state.clearing || state.finishing) return;
    state.clearing = true;
    const item = state.items.find((i) => i.id === id);
    sfx.unlock();
    sfx.pop();
    sparkle(btn);
    let justId = null;
    try {
      const shot = await openCamera({ title: item.title });
      if (!shot) return;
      const dataUrl = shot.dataUrl || null;
      let scan = showAnalyzing(dataUrl);
      let res;
      for (;;) {
        try {
          res = await api.clear(id, dataUrl);
          break;
        } catch (err) {
          scan.close();
          sfx.error();
          // eslint-disable-next-line no-await-in-loop
          const retry = await confirmDialog({ title: '앗, 저장하지 못했어요 😢', text: err.message, yes: '다시 시도', no: '그만두기' });
          if (!retry) return;
          scan = showAnalyzing(dataUrl);
        }
      }
      scan.close();
      state.items = state.items.map((i) => (i.id === id ? res.item : i));
      const last = state.items.every((i) => i.status === 'done');
      await showResult(res.item, dataUrl, last);
      justId = id;
    } finally {
      state.clearing = false;
      if (app.contains(el)) {
        renderTasks({ justId });
        if (justId) sparkle($(`[data-id="${justId}"]`, tasks));
      }
      if (state.timeUp) finishHtf('timeup');
      else if (justId && state.items.every((i) => i.status === 'done')) finishHtf('allclear');
    }
  }

  // 한문 숙제: 카메라 대신 한문 수업(획 따라 쓰기)을 마치면 클리어된다
  async function onHanja(id, btn) {
    if (state.clearing || state.finishing) return;
    state.clearing = true; // 시간이 끝나도 이 수업만은 마무리할 수 있게 (onClear 와 같은 규칙)
    sfx.unlock();
    sfx.pop();
    sparkle(btn);
    let justId = null;
    try {
      let mode = 'auto';
      if (state.user.hanja && state.user.hanja.exam) {
        mode = await chooseHanjaMode();
        if (!mode) return;
      }
      const r = await runHanja({ mode });
      if (!r.done) return;
      let item = r.saved && r.saved.item;
      if (!item) { // 서버가 이미 정리해 둔 경우: 목록을 새로 맞춘다
        try { state.items = (await api.htf()).items; } catch (_) { /* 무시 */ }
        item = state.items.find((i) => i.id === id && i.status === 'done');
      } else {
        state.items = state.items.map((i) => (i.id === item.id ? item : i));
      }
      if (item && item.status === 'done') justId = item.id;
    } finally {
      state.clearing = false;
      if (app.contains(el)) {
        renderTasks({ justId });
        if (justId) sparkle($(`[data-id="${justId}"]`, tasks));
      }
      if (state.timeUp) finishHtf('timeup');
      else if (justId && state.items.every((i) => i.status === 'done')) finishHtf('allclear');
    }
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('#pause')) { sfx.unlock(); doPause(); return; }
    const hanjaBtn = e.target.closest('[data-hanja]');
    if (hanjaBtn) { onHanja(hanjaBtn.dataset.hanja, hanjaBtn); return; }
    const clearBtn = e.target.closest('[data-clear]');
    if (clearBtn) { onClear(clearBtn.dataset.clear, clearBtn); return; }
    if (e.target.closest('#quit')) {
      sfx.tap();
      if (state.clearing) return;
      const yes = await confirmDialog({
        title: '지금 그만할까요? 🏳️',
        text: '못 끝낸 숙제는 다음 HTF 에서 이어서 해요.',
        yes: '그만할래요',
        no: '계속할래요',
      });
      if (yes) finishHtf('quit');
    }
  });
}

function showAnalyzing(dataUrl) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="card ovl-card">
      <div class="scan-photo">${dataUrl ? `<img src="${dataUrl}" alt="">` : '<div style="height:100%;display:grid;place-items:center;font-size:4rem">📝</div>'}</div>
      <div class="scan-text" id="scan-text"></div>
    </div>`;
  document.body.appendChild(ov);
  const lines = dataUrl
    ? ['AI 선생님이 숙제를 보는 중', '글씨를 읽는 중', '꼼꼼히 살펴보는 중', '칭찬거리를 찾는 중']
    : ['숙제를 저장하는 중'];
  let i = 0;
  const text = $('#scan-text', ov);
  const set = () => { text.innerHTML = `🔍 ${lines[i % lines.length]}<span class="dots"></span>`; i += 1; };
  set();
  const iv = setInterval(set, 1800);
  return { close() { clearInterval(iv); ov.remove(); } };
}

function showResult(item, dataUrl, last) {
  return new Promise((resolve) => {
    const v = verdictInfo(item);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="card ovl-card">
        <div class="result-wrap">
          ${dataUrl ? `<img class="result-photo" src="${dataUrl}" alt="찍은 사진">` : '<div class="result-photo" style="display:grid;place-items:center;font-size:4rem">📝</div>'}
          <span class="stamp">CLEAR!</span>
        </div>
        ${item.score ? `<div class="stars">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= item.score ? '' : 'dim'}">★</span>`).join('')}</div>` : ''}
        <div class="verdict">${v.emoji} ${esc(v.label)}</div>
        ${item.aiComment ? `<p class="ai-comment">${esc(item.aiComment)}</p>` : ''}
        <button class="btn btn-blue" id="next">${last ? '🏆 마무리!' : '다음 숙제로 ➡️'}</button>
      </div>`;
    document.body.appendChild(ov);

    // 별이 하나씩 반짝
    $$('.stars span:not(.dim)', ov).forEach((s, i) => setTimeout(() => { s.classList.add('on'); sfx.star(i); }, 500 + i * 260));
    if (item.verdict === 'good') { celebrate(); sfx.success(); }
    else if (item.verdict === 'okay') { confetti({ count: 110, y: 0.5 }); sfx.success(); }
    else { confetti({ count: 50, y: 0.5 }); sfx.pop(); }

    $('#next', ov).onclick = () => { sfx.tap(); ov.remove(); resolve(); };
  });
}

// ───────────────────────── 6. 종료 ─────────────────────────
async function finishHtf(reason) {
  if (state.finishing) return;
  state.finishing = true;
  let summary;
  try {
    summary = await api.endHtf();
  } catch (_) {
    const done = state.items.filter((i) => i.status === 'done').length;
    summary = { cleared: done, remaining: state.items.filter((i) => i.status === 'pending') };
  }
  state.session = null;
  state.tourReward = null; // 이번 HTF 의 마음 쉼터 보상 (한 번만 저장)
  screenFinish(reason, summary);
}

// 한문 6급 수업. 끝나면 서버에 기록하고 { done, saved } 를 돌려준다. mode:
//  today  순서대로 오늘의 수업(진도가 나아간다). 오늘 몫을 다 했거나 60일을 마쳤으면 복습으로 열린다.   replay  이미 배운 날 복습 (day 로 날을 고른다)
//  weak   약한 글자 수업(시험 대비): 틀렸던 글자 최대 5자                                           mock  모의시험 20문제
//  book   교재에서 오늘 배우는 글자를 직접 골라(최대 5자) 같은 글자로 수업
//  auto   (기본) today 와 같다
async function loadHanja() {
  try {
    const hz = await import('./hanja.js');
    return { hz, course: await hz.loadCourse() };
  } catch (err) {
    toast(err.message || '한문 수업을 열지 못했어요', 'err');
    return null;
  }
}

// 시험 대비 중 "오늘은 뭘 할까요?" (HTF 타이머 안의 한문 숙제에서 쓴다). 고르지 않으면 null.
async function chooseHanjaMode() {
  const h = state.user.hanja;
  let weakN = 0;
  try { weakN = (await api.hanja()).weak.length; } catch (_) { /* 약한 글자 수는 없어도 된다 */ }
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="card modal" role="dialog" aria-modal="true">
        <h3>🎯 오늘은 뭘 해 볼까요? <small>시험까지 ${ddayText(h.exam)}</small></h3>
        <div class="hz-choices">
          <button class="btn btn-yellow" data-v="mock">📝 모의시험<small>20문제 · 실전 연습</small></button>
          ${weakN ? `<button class="btn btn-hanja" data-v="weak">🎯 약한 글자 수업<small>틀렸던 글자 ${weakN}개 중 5개</small></button>` : ''}
          ${h.canAdvance && h.started ? `<button class="btn btn-white" data-v="today">📖 순서대로 수업<small>오늘 ${h.advToday}/${h.goal}</small></button>` : ''}
          <button class="btn btn-white" data-v="book">📚 교재 따라 수업<small>교재에서 오늘 배운 글자 고르기</small></button>
        </div>
        <button class="back-link" data-v="">다음에 할래요</button>
      </div>`;
    document.body.appendChild(back);
    back.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      sfx.tap();
      back.remove();
      resolve(b.dataset.v || null);
    });
  });
}

// 교재에서 오늘 배우는 한자를 직접 골라 수업한다 (최대 5자). 고르지 않고 닫으면 null.
function pickBookChars(hz, course) {
  const all = hz.allChars(course);
  const picked = [];
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    const grids = course.levels.map((lv) => `<div class="hz-lv">${esc(lv.key)}</div><div class="hz-grid">${all.filter((c) => c.day >= lv.startDay && c.day < lv.startDay + lv.days)
      .map((c) => `<button type="button" class="hz-cell" data-h="${esc(c.h)}" title="${esc(c.k)} ${esc(c.s)}">${esc(c.h)}</button>`).join('')}</div>`).join('');
    back.innerHTML = `
      <div class="card modal hz-pick" role="dialog" aria-modal="true">
        <h3>📚 교재 글자 고르기<small>교재에서 오늘 배우는 한자를 눌러요 (최대 5자)</small></h3>
        <div class="hz-picked" id="pk-sel"></div>
        <div class="hz-pickgrid">${grids}</div>
        <div class="row"><button class="btn btn-white" data-v="0">취소</button><button class="btn btn-hanja" data-v="1" id="pk-go" disabled>✏️ 수업 시작</button></div>
      </div>`;
    document.body.appendChild(back);
    const sel = back.querySelector('#pk-sel');
    const go = back.querySelector('#pk-go');
    const paint = () => {
      sel.innerHTML = picked.length
        ? picked.map((c) => `<span class="hz-chip"><b>${esc(c.h)}</b><small>${esc(c.k)} ${esc(c.s)}</small></span>`).join('')
        : '<small>아직 고른 글자가 없어요</small>';
      back.querySelectorAll('.hz-cell').forEach((b) => b.classList.toggle('on', picked.some((c) => c.h === b.dataset.h)));
      go.disabled = !picked.length;
    };
    paint();
    back.addEventListener('click', (e) => {
      const cell = e.target.closest('.hz-cell');
      if (cell) {
        const i = picked.findIndex((c) => c.h === cell.dataset.h);
        if (i >= 0) picked.splice(i, 1);
        else if (picked.length < 5) picked.push(all.find((c) => c.h === cell.dataset.h));
        else { toast('한 번에 5자까지 고를 수 있어요'); sfx.error(); return; }
        sfx.tap();
        paint();
        return;
      }
      const b = e.target.closest('[data-v]');
      if (!b) return;
      sfx.tap();
      back.remove();
      resolve(b.dataset.v === '1' ? picked.slice() : null);
    });
  });
}

async function runHanjaBook(hz, course) {
  const chars = await pickBookChars(hz, course);
  if (!chars) return { done: false };
  return hz.openLesson({
    course,
    title: '📚 교재 따라 수업',
    chars,
    review: [],
    quiz: true,
    day: 0,
    confirm: confirmDialog,
    doneLabel: '🏆 오늘 한문 끝!',
    save: async (result) => {
      const r = await api.hanjaWeak({ kind: 'book', score: result.score, misses: result.misses, results: result.results });
      Object.assign(state.user, r.user);
      return r;
    },
  });
}

async function runHanjaWeak(hz, course) {
  let weak = [];
  try { weak = (await api.hanja()).weak; } catch (_) { /* 아래에서 안내 */ }
  const all = hz.allChars(course);
  const chars = weak.slice(0, 5).map((x) => all.find((c) => c.h === x)).filter(Boolean);
  if (!chars.length) {
    toast('약한 글자가 아직 없어요. 모의시험부터 해 볼까요? 📝');
    return { done: false };
  }
  return hz.openLesson({
    course,
    title: '🎯 약한 글자 수업',
    chars,
    review: [],
    quiz: true,
    day: 0,
    confirm: confirmDialog,
    doneLabel: '🏆 오늘 한문 끝!',
    save: async (result) => {
      const r = await api.hanjaWeak({ score: result.score, misses: result.misses, results: result.results });
      Object.assign(state.user, r.user);
      return r;
    },
  });
}

async function runHanjaMock(hz, course) {
  let weak = [];
  try { weak = (await api.hanja()).weak; } catch (_) { /* 약한 글자 없이 무작위로 */ }
  const r = await hz.openLesson({
    course,
    title: '📝 모의시험',
    chars: [],
    exam: { questions: hz.makeExamQuestions(course, { count: 20, weak }), note: '배정한자 300자에서 20문제를 풀어요. 전에 틀렸던 글자도 섞여 있어요.', sub: '실전처럼 한 번에 하나씩' },
    day: 0,
    confirm: confirmDialog,
    doneLabel: '👍 끝내기',
    save: async (result) => {
      const rr = await api.hanjaMock({ results: result.results });
      Object.assign(state.user, rr.user);
      return rr;
    },
  });
  // 틀린 글자가 있으면 바로 약한 글자 수업으로 이어 갈 수 있다 (모의시험 기록은 이미 저장됐다)
  if (r.done && r.next === 'weak') await runHanjaWeak(hz, course);
  return r;
}

async function runHanja({ mode = 'auto', day = null } = {}) {
  const loaded = await loadHanja();
  if (!loaded) return { done: false };
  const { hz, course } = loaded;
  if (mode === 'mock') return runHanjaMock(hz, course);
  if (mode === 'weak') return runHanjaWeak(hz, course);
  if (mode === 'book') return runHanjaBook(hz, course);
  const h = state.user.hanja;
  const today = !day && mode !== 'replay' && h.canAdvance;
  const target = day || (today ? h.day : h.finished ? 1 + Math.floor(Math.random() * h.totalDays) : Math.max(1, h.day - 1));
  const d = hz.dayOf(course, target);
  let doneDays = new Set();
  if (today) { // 몸풀기는 실제로 배운 날의 글자로만 낸다
    try { doneDays = new Set((await api.hanja()).doneDays); } catch (_) { /* 몸풀기 없이 진행 */ }
  }
  return hz.openLesson({
    course,
    title: `${today ? '' : '🔁 복습 · '}Day ${target} · ${d.title}`,
    chars: d.chars,
    review: today ? hz.reviewChars(course, target, doneDays) : [],
    quiz: true,
    day: target,
    confirm: confirmDialog,
    doneLabel: today ? '🏆 오늘 한문 끝!' : '👍 복습 끝!',
    save: async (result) => {
      const r = await api.hanjaComplete({ day: target, score: result.score, misses: result.misses, results: result.results });
      Object.assign(state.user, r.user);
      return r;
    },
  });
}

// 마음 쉼터(3D 교실 투어): 필요할 때만 불러온다. 끝나면 onClose({ stars, seconds, skipped })
// room: 이 아이의 교실(문패·분위기), visit: 부모님이 엄마/아빠로 같이 들어올 때 { role }, presence: 같이 있는 사람과 위치를 주고받는 연결
async function openTour({ user, preview = false, visit = null, room = null, npcs = [], presence = null, onClose }) {
  try {
    const { startWorld } = await import('./world.js');
    await startWorld({ user, preview, visit, room, npcs, presence, onDone: onClose });
  } catch (err) {
    console.warn('[tour]', err);
    toast('쉼터를 열지 못했어요. 잠시 뒤에 다시 해 봐요', 'err');
    onClose({ stars: 0, seconds: 0, skipped: true });
  }
}

function screenFinish(reason, summary, { returning = false } = {}) {
  const { cleared, remaining } = summary;
  setTopbar('full');
  const cfg = {
    allclear: { emoji: '🏆', title: '올 클리어!!', sub: '오늘 숙제를 모두 끝냈어요. 정말 대단해요!' },
    timeup: { emoji: '⏰', title: '시간 종료!', sub: 'HTF 시간이 끝났어요. 정말 수고했어요!' },
    quit: { emoji: '👋', title: '수고했어요!', sub: '오늘은 여기까지 해요.' },
  }[reason];
  const rw = state.tourReward;
  // 숙제를 모두 클리어하면 보상: 귀여운 교실을 걸으며 5분 쉬는 3D 마음 쉼터
  const reward = reason !== 'allclear' ? '' : `
    <div class="reward-card">
      <div class="gift">${rw ? '🌈' : '🎁'}</div>
      <h3>${rw ? '마음 쉼터에 다녀왔어요!' : '올 클리어 선물이 있어요!'}</h3>
      <p>${rw
    ? `마음 별 <b>+${rw.gained}</b> · 지금까지 <span class="mind-stars">⭐ ${state.user.tourStars || 0}개</span>`
    : '귀여운 교실을 걸으며 5분 동안<br>눈과 마음을 쉬어 봐요'}</p>
      <button class="btn btn-yellow big tour-btn" id="tour">${rw ? '🌈 한 번 더 둘러보기' : '🌈 마음 쉼터 입장'}</button>
      ${rw ? '<small>별은 한 번만 저장돼요</small>' : '<small>눈을 쉬는 시간이에요 👀</small>'}
    </div>`;
  const el = mount(`
    <div class="trophy">${cfg.emoji}</div>
    <h2>${cfg.title}</h2>
    <p class="sub">${cfg.sub}</p>
    ${reward}
    <div class="count-pills">
      <div class="count-pill">🎯 클리어<b>${cleared}</b>개</div>
      <div class="count-pill">📌 남은 숙제<b>${remaining.length}</b>개</div>
    </div>
    ${remaining.length ? `
      <div class="card carry-box">
        <h3>다음 HTF 에서 이어서 해요 🔁</h3>
        <div class="todo-peek">${remaining.map((i) => `<span>${esc(i.title)}</span>`).join('')}</div>
      </div>` : ''}
    <div class="finish-actions">
      <button class="btn btn-mint" id="again">🔁 다음 HTF 준비</button>
      <button class="btn btn-white" id="mypage">📒 내 기록 보기</button>
      <button class="btn btn-white" id="bye">🚪 끝내기</button>
    </div>`, `center finish ${reason}`);
  if (!returning) {
    if (reason === 'allclear') { celebrate(['🏆', '⭐', '🎉', '✨']); sfx.success(); }
    else if (reason === 'timeup') { confetti({ count: cleared ? 120 : 40, y: 0.6, emojis: ['⭐'] }); }
    else if (cleared) { confetti({ count: 60, y: 0.6 }); }
  }
  const tourBtn = $('#tour', el);
  if (tourBtn) {
    tourBtn.onclick = async () => {
      sfx.unlock();
      sfx.pop();
      tourBtn.disabled = true;
      // 이 아이의 교실(문패·분위기)과 거기 있는 선생님·친구들 (못 불러와도 교실은 열린다)
      const cls = await api.classroom().catch(() => ({ npcs: [], room: null }));
      await openTour({
        user: state.user,
        npcs: cls.npcs,
        room: cls.room,
        // 부모님이 같은 교실에 들어와 있으면 서로 볼 수 있다
        presence: { sync: (me) => api.presence(me), leave: () => api.presenceLeave() },
        onClose: async (res) => {
          if (!res.skipped && !state.tourReward) {
            state.tourReward = { gained: res.stars };
            try {
              Object.assign(state.user, (await api.tourComplete(res.stars, res.seconds)).user);
            } catch (err) {
              toast(err.message, 'err');
            }
          }
          screenFinish(reason, summary, { returning: true });
        },
      });
    };
  }
  $('#again', el).onclick = () => { sfx.pop(); goHome(); };
  $('#mypage', el).onclick = () => { sfx.tap(); screenMyPage(); };
  $('#bye', el).onclick = () => { sfx.tap(); screenLogin(); };
}

// ───────────────────────── 7. 마이페이지 ─────────────────────────
function screenMyPage() {
  setTopbar('full');
  const u = state.user;
  const el = mount(`
    <div class="my">
      <button class="back-link" id="back">← 돌아가기</button>
      <div class="tabs">
        <button class="tab on" data-tab="info">👤 내 정보</button>
        <button class="tab" data-tab="avatar">🎨 캐릭터</button>
        ${u.hanja && u.hanja.enabled ? '<button class="tab" data-tab="hanja">📖 한문</button>' : ''}
        <button class="tab" data-tab="rec">📒 숙제 기록</button>
      </div>
      <div id="pane"></div>
    </div>`);
  const pane = $('#pane', el);
  $('#back', el).onclick = () => { sfx.tap(); goHome(); };
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    sfx.tap();
    $$('.tab', el).forEach((b) => b.classList.toggle('on', b === t));
    if (t.dataset.tab === 'info') paneInfo();
    else if (t.dataset.tab === 'avatar') paneAvatar();
    else if (t.dataset.tab === 'hanja') paneHanja();
    else paneRecords();
  });

  // 한문 6급: 진도와 배운 글자 모음, 시험 대비(약한 글자·모의시험). 글자를 누르면 그 글자만 다시 연습한다.
  async function paneHanja() {
    pane.innerHTML = '<p class="empty">불러오는 중<span class="dots"></span></p>';
    let hz;
    let course;
    let status;
    try {
      hz = await import('./hanja.js');
      [course, status] = await Promise.all([hz.loadCourse(), api.hanja()]);
    } catch (err) {
      pane.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
      return;
    }
    u.hanja = status.hanja;
    const h = status.hanja;
    const ex = h.exam;
    const done = new Set(status.doneDays); // 실제로 수업을 마친 날 (시작 단계를 건너뛴 날은 빠진다)
    const learnedCount = done.size * h.perDay;
    const pct = Math.round((learnedCount / (h.totalDays * h.perDay)) * 100);
    const byH = new Map(hz.allChars(course).map((c) => [c.h, c]));
    const dayRow = (d) => `<option value="${d.day}">Day ${d.day} · ${esc(d.title)}</option>`;
    const grid = course.levels.map((lv) => {
      const days = course.days.filter((d) => d.day >= lv.startDay && d.day < lv.startDay + lv.days);
      return `<div class="hz-lv">${esc(lv.key)} · ${lv.days * course.perDay}자</div>
        <div class="hz-grid">${days.flatMap((d) => d.chars.map((c) => (done.has(d.day)
    ? `<button class="hz-cell learned" data-char="${esc(c.h)}" title="${esc(c.k)} ${esc(c.s)}">${esc(c.h)}</button>`
    : '<span class="hz-cell locked">？</span>'))).join('')}</div>`;
    }).join('');
    const weakCells = status.weak.map((x) => byH.get(x)).filter(Boolean)
      .map((c) => `<button class="hz-cell weak" data-char="${esc(c.h)}" title="${esc(c.k)} ${esc(c.s)}">${esc(c.h)}</button>`).join('');
    const examCard = ex || status.asked ? `
        <div class="card hz-prog hz-exam">
          <h2>🎯 ${ex ? `시험까지 ${ddayText(ex)} <small>${monthDay(ex.date)}</small>` : '시험 대비'}</h2>
          <div>${status.weak.length ? `다시 볼 약한 글자 <b>${status.weak.length}</b>개 · 눌러서 연습해요` : status.asked ? '약한 글자가 없어요! 잘하고 있어요 🎉' : '모의시험을 보면 약한 글자를 찾아 줘요'}</div>
          ${weakCells ? `<div class="hz-grid">${weakCells}</div>` : ''}
          <div class="chips"><button class="btn btn-hanja small" id="mk-go">📝 모의시험</button>${weakCells ? '<button class="btn btn-hanja small" id="wk-go">🎯 약한 글자 수업</button>' : ''}</div>
        </div>` : '';
    const logs = status.log.map((l) => `<div class="rec"><div class="thumb">${hanjaLogIcon(l)}</div><div class="r-body"><div class="r-title">${hanjaLogLabel(l)}</div><div class="r-meta">${stars(l.score)}<small>${new Date(l.doneAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${fmtClock(l.doneAt)}</small></div></div></div>`).join('');
    pane.innerHTML = `
      <div style="display:grid;gap:14px;width:100%">
        ${examCard}
        <div class="card hz-prog">
          <h2>📖 한문 6급 · 하루 5자</h2>
          <div>${h.finished ? '🏆 60일 코스를 모두 마쳤어요!' : `다음은 <b>Day ${h.day}</b> · ${esc(hz.dayOf(course, h.day).title)}`} · 배운 글자 <b>${learnedCount}</b> / ${h.totalDays * h.perDay}</div>
          <div class="hz-bar"><i style="width:${pct}%"></i></div>
          <div class="chips"><button class="btn btn-hanja small" id="bk-go">📚 교재 글자로 수업</button></div>
          ${done.size ? `<div class="chips"><select id="rp" aria-label="복습할 날">${course.days.filter((d) => done.has(d.day)).map(dayRow).join('')}</select><button class="btn btn-hanja small" id="rp-go">🔁 복습 수업</button></div>` : '<small>아직 마친 수업이 없어요. 숙제 화면에서 오늘의 한문을 시작해 봐요!</small>'}
        </div>
        <div class="card"><h3>배운 글자 <small>(눌러서 연습)</small></h3>${grid}</div>
        ${logs ? `<div class="card"><h3>최근 기록</h3><div style="display:grid;gap:10px;margin-top:8px">${logs}</div></div>` : ''}
      </div>`;
    pane.onclick = async (e) => {
      const cell = e.target.closest('[data-char]');
      if (cell) {
        sfx.tap();
        const ch = hz.allChars(course).find((c) => c.h === cell.dataset.char);
        if (ch) await hz.openCharPractice({ course, char: ch, confirm: confirmDialog });
        return;
      }
      if (e.target.closest('#rp-go')) {
        sfx.pop();
        await runHanja({ mode: 'replay', day: Number($('#rp', pane).value) });
        paneHanja();
      } else if (e.target.closest('#bk-go')) {
        sfx.pop();
        await runHanja({ mode: 'book' });
        paneHanja();
      } else if (e.target.closest('#mk-go')) {
        sfx.pop();
        await runHanja({ mode: 'mock' });
        paneHanja();
      } else if (e.target.closest('#wk-go')) {
        sfx.pop();
        await runHanja({ mode: 'weak' });
        paneHanja();
      }
    };
  }

  function paneAvatar() {
    pane.innerHTML = `
      <div class="card form-card avatar-card" style="width:100%">
        <h2>내 캐릭터 🎨</h2>
        <div id="picker"></div>
        <button class="btn btn-blue big" id="save">💾 이 모습으로 저장</button>
      </div>`;
    const picker = mountAvatarPicker($('#picker', pane), u.avatar);
    const save = $('#save', pane);
    save.onclick = async () => {
      save.disabled = true;
      try {
        const r = await api.updateMe({ avatar: picker.get() });
        Object.assign(u, r.user);
        state.user = u;
        setTopbar('full');
        sfx.success();
        confetti({ count: 60, y: 0.7 });
        toast('새 캐릭터로 바꿨어요! ✅');
      } catch (err) {
        toast(err.message, 'err');
        sfx.error();
      }
      save.disabled = false;
    };
  }

  function paneInfo() {
    pane.innerHTML = `
      <form class="card form-card" id="form" autocomplete="off" novalidate style="width:100%">
        <div style="text-align:center"><span class="mind-stars">🌈 마음 쉼터 ${u.tourCount || 0}번 다녀옴 · ⭐ 마음 별 ${u.tourStars || 0}개</span></div>
        <div class="field"><label for="nm">🙋 이름</label><input id="nm" value="${esc(u.name)}" disabled></div>
        ${birthFields(u.birth)}
        <div class="field"><label for="school">🏫 학교</label><input id="school" maxlength="40" value="${esc(u.school)}"></div>
        <div class="field"><label for="cls">📘 학년 / 반</label><input id="cls" maxlength="30" value="${esc(u.className)}"></div>
        <div class="field"><label for="mins">⏱️ HTF 기본 시간 (분)</label><input id="mins" type="number" inputmode="numeric" min="1" max="120" value="${u.timerMin}"></div>
        <details>
          <summary>🔑 비밀번호 바꾸기</summary>
          <div class="field"><label for="curpin">지금 비밀번호</label><input id="curpin" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></div>
          <div class="field"><label for="newpin">새 비밀번호 (숫자 4자리)</label><input id="newpin" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></div>
        </details>
        <p class="err" id="err" aria-live="polite"></p>
        <button class="btn btn-blue big" type="submit">💾 저장하기</button>
      </form>`;
    const form = $('#form', pane);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        birth: readBirth(pane),
        school: $('#school', pane).value.trim(),
        className: $('#cls', pane).value.trim(),
        timerMin: Number($('#mins', pane).value),
      };
      const curPin = $('#curpin', pane).value;
      const newPin = $('#newpin', pane).value;
      if (curPin || newPin) Object.assign(body, { currentPin: curPin, newPin });
      const fail = (m) => { $('#err', pane).textContent = m; shake(form); sfx.error(); };
      if (!body.birth) return fail('생년월일을 골라 주세요');
      try {
        const r = await api.updateMe(body);
        Object.assign(u, r.user);
        state.user = u;
        $('#err', pane).textContent = '';
        $('#curpin', pane).value = '';
        $('#newpin', pane).value = '';
        sfx.success();
        confetti({ count: 50, y: 0.7 });
        toast('저장했어요! ✅');
      } catch (err) {
        fail(err.message);
      }
    };
  }

  async function paneRecords() {
    pane.innerHTML = '<p class="empty">불러오는 중<span class="dots"></span></p>';
    let items;
    try {
      ({ items } = await api.records());
    } catch (err) {
      pane.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
      return;
    }
    if (!items.length) {
      pane.innerHTML = '<div class="card empty"><span class="big-emoji">📒</span>아직 기록이 없어요.<br>숙제를 클리어하면 여기에 모여요!</div>';
      return;
    }
    const dayOf = (ms) => new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    const card = (it) => {
      const v = verdictInfo(it);
      return `
      <div class="rec" data-id="${it.id}">
        ${it.photoId ? `<img class="thumb" data-photo="${it.photoId}" alt="">` : '<div class="thumb">📝</div>'}
        <div class="r-body">
          <div class="r-title">${esc(it.title)}</div>
          <div class="r-meta"><span class="chipv ${v.cls}">${v.emoji} ${esc(v.label)}</span>${it.score ? stars(it.score) : ''}<small>${fmtClock(it.doneAt)}</small></div>
          ${it.aiComment ? `<div class="r-comment">💬 ${esc(it.aiComment)}</div>` : ''}
          ${it.aiNote ? `<div class="r-note">👪 부모님 메모: ${esc(it.aiNote)}</div>` : ''}
          ${it.aiStatus === 'error' && state.config.aiEnabled ? `<button class="btn btn-white small" data-redo="${it.id}" style="width:fit-content">🔄 AI 다시 보기</button>` : ''}
        </div>
      </div>`;
    };
    let html = '';
    let day = '';
    for (const it of items) {
      const d = dayOf(it.doneAt);
      if (d !== day) { day = d; html += `<div class="rec-day">📅 ${d}</div>`; }
      html += card(it);
    }
    pane.innerHTML = `<div style="display:grid;gap:12px">${html}</div>`;
    hydratePhotos(pane);
    pane.onclick = async (e) => {
      const redo = e.target.closest('[data-redo]');
      if (!redo) return;
      redo.disabled = true;
      redo.textContent = '🔍 보는 중…';
      try {
        const { item } = await api.reanalyze(redo.dataset.redo);
        const wrap = redo.closest('.rec');
        const tmp = document.createElement('div');
        tmp.innerHTML = card(item);
        wrap.replaceWith(tmp.firstElementChild);
        hydratePhotos(pane);
        if (item.aiStatus === 'ok') sfx.success();
      } catch (err) {
        toast(err.message, 'err');
        redo.disabled = false;
        redo.textContent = '🔄 AI 다시 보기';
      }
    };
  }

  paneInfo();
}

// ───────────────────────── 8. 부모님 메뉴 (초기화) ─────────────────────────
function screenParentLogin() {
  setTopbar('none');
  const enabled = state.config.adminEnabled;
  const el = mount(`
    <div class="pin-screen">
      <button class="back-link" id="back">← 돌아가기</button>
      <div class="boot-clock" style="font-size:4rem">👪</div>
      <h2>부모님 메뉴</h2>
      ${enabled ? `
        <p>부모님 비밀번호를 입력해 주세요</p>
        <form class="form-card" id="form" autocomplete="off">
          <div class="field"><input id="code" type="password" autocomplete="off" aria-label="부모님 비밀번호"></div>
          <p class="err" id="err" aria-live="polite"></p>
          <button class="btn btn-blue" type="submit">들어가기</button>
        </form>` : `
        <p class="foot-note warn">아직 부모님 비밀번호가 없어요.<br>Render 환경변수 <b>ADMIN_CODE</b> 를 정하면 쓸 수 있어요.</p>`}
    </div>`, 'center');
  $('#back', el).onclick = () => { sfx.tap(); screenLogin(); };
  if (!enabled) return;
  const code = $('#code', el);
  code.focus();
  $('#form', el).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.adminLogin(code.value);
      sfx.success();
      screenParent();
    } catch (err) {
      $('#err', el).textContent = err.message;
      shake($('#form', el));
      sfx.error();
      code.select();
    }
  };
}

const PARENT_ACTIONS = {
  'clear-records': {
    title: '숙제 기록을 모두 지울까요? 🧹',
    text: '숙제·사진·AI 판독 기록과 마음 별이 사라져요. 프로필과 캐릭터, 비밀번호는 그대로예요.',
    done: '기록을 지웠어요',
  },
  'reset-pin': {
    title: '비밀번호를 다시 정하게 할까요? 🔑',
    text: '다음에 로그인할 때 새 비밀번호를 정해요. 기록은 그대로예요.',
    done: '다음 로그인 때 새 비밀번호를 정해요',
  },
  'reset-all': {
    title: '처음부터 다시 할까요? 🔄',
    text: '기록과 프로필, 캐릭터, 비밀번호가 모두 지워지고 처음 로그인 상태로 돌아가요. 되돌릴 수 없어요.',
    done: '처음 상태로 되돌렸어요',
  },
};

async function screenParent() {
  setTopbar('none');
  let kids;
  try {
    ({ kids } = await api.adminKids());
  } catch (err) {
    toast(err.message, 'err');
    screenParentLogin();
    return;
  }
  const card = (k) => `
    <div class="card parent-card" data-name="${esc(k.name)}">
      <div class="pc-head">
        ${avatarHtml(k.avatar, { size: 'lg' })}
        <div>
          <h3>${esc(k.name)}${k.room && k.room.who ? ` <span class="chipv">${esc(k.room.who)}</span>` : ''}</h3>
          <p class="pc-room">🏫 ${esc(k.room ? k.room.label : '')}${k.hanja && k.hanja.enabled ? ` · 📖 한문 ${k.hanja.finished ? '완주' : `Day ${k.hanja.day}`}` : ''}</p>
          <p>${k.registered
    ? `${esc(k.school)} ${esc(k.className)}<br>클리어 ${k.done}개 · 남은 숙제 ${k.pending}개 · 사진 ${k.photos}장${k.needsPin ? ' · 🔑 새 비밀번호 대기 중' : ''}`
    : '아직 등록 전이에요'}</p>
        </div>
      </div>
      <div class="pc-actions">
        <button class="btn btn-mint small" data-act="visit">👪 교실에 같이 들어가기</button>
        ${k.registered ? '<button class="btn btn-blue small" data-act="homework">📝 숙제 보기·편집</button>' : ''}
        ${k.registered ? '<button class="btn btn-hanja small" data-act="hanja">📖 한문 설정</button>' : ''}
        <button class="btn btn-yellow small" data-act="classroom">🏫 교실 친구·선생님</button>
        ${k.registered ? `
          <button class="btn btn-white small" data-act="clear-records">🧹 기록만 지우기</button>
          <button class="btn btn-white small" data-act="reset-pin">🔑 비밀번호 다시 정하기</button>
          <button class="btn btn-coral small" data-act="reset-all">🔄 처음부터 다시</button>` : ''}
      </div>
    </div>`;
  const el = mount(`
    <div class="my">
      <button class="back-link" id="back">← 나가기</button>
      <h2 style="font-size:2rem">👪 부모님 메뉴</h2>
      <p class="sub">테스트한 기록을 지우거나, 비밀번호를 잊은 친구를 도와줄 수 있어요.</p>
      ${kids.map(card).join('')}
    </div>`);
  $('#back', el).onclick = () => { sfx.tap(); api.adminLogout(); screenLogin(); };
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    sfx.tap();
    const name = btn.closest('.parent-card').dataset.name;
    if (btn.dataset.act === 'homework') { screenParentHomework(name); return; }
    if (btn.dataset.act === 'hanja') { screenParentHanja(name); return; }
    if (btn.dataset.act === 'classroom') { screenParentClassroom(name); return; }
    if (btn.dataset.act === 'visit') { enterClassroom(name, screenParent); return; }
    const a = PARENT_ACTIONS[btn.dataset.act];
    if (!(await confirmDialog({ title: `${name}: ${a.title}`, text: a.text, yes: '네, 할게요', no: '아니요' }))) return;
    btn.disabled = true;
    try {
      await api.adminAction(name, btn.dataset.act);
      sfx.success();
      toast(`${name}: ${a.done} ✅`);
      state.config = await api.config();
      screenParent();
    } catch (err) {
      btn.disabled = false;
      toast(err.message, 'err');
      sfx.error();
    }
  });
}

// 숙제 사진 크게 보기 (부모님용): 사진 + 아이가 보여 준 것 + AI 판독 결과
const SHOWN_LABEL = { homework: '숙제 결과물', face: '얼굴', v_sign: 'V 포즈', nothing: '잘 안 보임', other: '다른 물건' };

function showPhotoViewer(item) {
  const v = verdictInfo(item);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="card ovl-card viewer-card" role="dialog" aria-modal="true" aria-label="${esc(item.title)}">
      <h3 class="viewer-title">${esc(item.title)}</h3>
      ${item.photoId
    ? `<img class="viewer-photo" data-photo="${item.photoId}" data-admin="1" alt="${esc(item.title)} 사진">`
    : '<p class="empty">사진 없이 클리어했어요.</p>'}
      <div class="r-meta">
        <span class="chipv ${v.cls}">${v.emoji} ${esc(v.label)}</span>
        ${item.score ? stars(item.score) : ''}
        ${item.shown ? `<span class="chipv">📷 ${esc(SHOWN_LABEL[item.shown] || item.shown)}</span>` : ''}
        <small>${new Date(item.doneAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
      </div>
      ${item.aiComment ? `<p class="ai-comment">${esc(item.aiComment)}</p>` : ''}
      ${item.aiNote ? `<p class="r-note">👪 AI 메모: ${esc(item.aiNote)}</p>` : ''}
      <button class="btn btn-blue" data-close>닫기</button>
    </div>`;
  document.body.appendChild(ov);
  hydratePhotos(ov);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { document.removeEventListener('keydown', onKey); ov.remove(); }
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-close]')) { sfx.tap(); close(); }
  });
}

// 부모님이 한 아이의 숙제를 보고 고친다: 빼먹은 숙제 넣기, 이름 고치기, 지우기, 클리어 사진 보기
async function screenParentHomework(name) {
  setTopbar('none');
  let data;
  try {
    data = await api.adminHomework(name);
  } catch (err) {
    toast(err.message, 'err');
    if (err.status === 401) screenParentLogin(); else screenParent();
    return;
  }
  let { pending, frequent } = data;
  let editingId = null;
  const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

  const el = mount(`
    <div class="my">
      <button class="back-link" id="back">← 부모님 메뉴</button>
      <div class="pc-head">
        ${avatarHtml(data.kid.avatar, { size: 'lg' })}
        <div><h2 style="font-size:1.8rem">${esc(name)}의 숙제 📝</h2>
          <p>빼먹은 숙제를 넣어 주거나, 잘못 적은 숙제를 고칠 수 있어요.</p></div>
      </div>
      <form class="add-row" id="add" autocomplete="off">
        <input id="title" maxlength="60" placeholder="추가할 숙제 이름" aria-label="추가할 숙제 이름">
        <button class="btn btn-blue" type="submit">➕ 추가</button>
      </form>
      <div class="chips" id="freq" hidden></div>
      <div class="rec-day">⏳ 아직 안 한 숙제 (아이 화면에 그대로 보여요)</div>
      <ul class="hw-list" id="list"></ul>
      <div class="rec-day">✔ 클리어한 숙제와 사진 (최근 30개 · 보기만 가능)</div>
      <div id="done" style="display:grid;gap:10px"></div>
    </div>`);
  const list = $('#list', el);
  const input = $('#title', el);
  const freqBox = $('#freq', el);

  const fail = (err) => {
    toast(err.message, 'err');
    sfx.error();
    if (err.status === 401) screenParentLogin();
  };

  function renderFreq() {
    const have = new Set(pending.map((i) => norm(i.title)));
    const shown = frequent.filter((f) => !have.has(norm(f.title)));
    freqBox.hidden = !shown.length;
    freqBox.innerHTML = shown.length
      ? `<small>⭐ ${esc(name)}가 자주 하는 숙제</small>${shown.map((f) => `<button type="button" class="chip freq" data-quick="${esc(f.title)}">＋ ${esc(f.title)}</button>`).join('')}`
      : '';
  }

  function renderPending(newId) {
    list.innerHTML = pending.length
      ? pending.map((it, i) => {
        const badges = `${it.carryCount > 0 ? `<span class="carry">${carryLabel(it.carryCount)}</span>` : ''}${parentBadge(it)}`;
        return it.id === editingId
          ? `<li class="hw-item" data-id="${it.id}">
               <span class="hw-no">${i + 1}</span>
               <input class="ph-edit" maxlength="60" value="${esc(it.title)}" aria-label="숙제 이름 고치기">
               <button class="icon-btn" data-save="${it.id}" aria-label="저장">✔️</button>
               <button class="icon-btn" data-cancel aria-label="취소">✖️</button>
             </li>`
          : `<li class="hw-item ${it.id === newId ? 'new' : ''}" data-id="${it.id}">
               <span class="hw-no">${i + 1}</span>
               <span class="hw-title">${esc(it.title)}${badges}</span>
               <button class="icon-btn" data-edit="${it.id}" aria-label="고치기">✏️</button>
               <button class="icon-btn" data-del="${it.id}" aria-label="지우기">🗑️</button>
             </li>`;
      }).join('')
      : '<li class="card empty"><span class="big-emoji">🎉</span>남은 숙제가 없어요.<br>빼먹은 숙제가 있으면 위에서 넣어 주세요.</li>';
    const editInput = $('.ph-edit', list);
    if (editInput) { editInput.focus(); editInput.select(); }
    renderFreq();
  }

  // 클리어한 숙제: 날짜별로 사진 썸네일과 AI 결과를 보여 주고, 누르면 사진을 크게 본다
  function renderDone() {
    const box = $('#done', el);
    if (!data.done.length) {
      box.innerHTML = '<p class="empty">아직 클리어한 숙제가 없어요.</p>';
      return;
    }
    const dayOf = (ms) => new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    let day = '';
    box.innerHTML = data.done.map((it) => {
      const d = dayOf(it.doneAt);
      const header = d !== day ? `<div class="rec-day">📅 ${d}</div>` : '';
      day = d;
      const v = verdictInfo(it);
      return `${header}
        <div class="rec viewable" data-view="${it.id}" tabindex="0" role="button" aria-label="${esc(it.title)} 크게 보기">
          ${it.photoId ? `<img class="thumb" data-photo="${it.photoId}" data-admin="1" alt="">` : '<div class="thumb">📝</div>'}
          <div class="r-body">
            <div class="r-title">${esc(it.title)}${parentBadge(it)}</div>
            <div class="r-meta"><span class="chipv ${v.cls}">${v.emoji} ${esc(v.label)}</span>${it.score ? stars(it.score) : ''}<small>${fmtClock(it.doneAt)}</small></div>
            ${it.aiComment ? `<div class="r-comment">💬 ${esc(it.aiComment)}</div>` : ''}
            ${it.photoId ? '<small class="view-hint">🔍 눌러서 크게 보기</small>' : '<small class="view-hint">사진 없이 클리어했어요</small>'}
          </div>
        </div>`;
    }).join('');
    hydratePhotos(box);
  }

  let busy = false;
  async function addTitle(title) {
    if (busy) return false;
    busy = true;
    try {
      const { item } = await api.adminAddHomework(name, title);
      pending.push(item);
      renderPending(item.id);
      sfx.pop();
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      busy = false;
    }
  }

  async function saveEdit(id) {
    const field = $('.ph-edit', list);
    const title = field.value.trim();
    if (!title) { shake(field); sfx.error(); return; }
    if (busy) return;
    busy = true;
    try {
      const { item } = await api.adminEditHomework(name, id, title);
      pending = pending.map((p) => (p.id === id ? item : p));
      editingId = null;
      renderPending();
      sfx.success();
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  renderPending();
  renderDone();

  $('#back', el).onclick = () => { sfx.tap(); screenParent(); };
  $('#add', el).onsubmit = async (e) => {
    e.preventDefault();
    const title = input.value.trim();
    if (!title) { shake(input); sfx.error(); input.focus(); return; }
    if (await addTitle(title)) input.value = '';
    input.focus();
  };

  list.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('ph-edit')) return;
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(editingId); }
    else if (e.key === 'Escape') { editingId = null; renderPending(); }
  });

  const openViewer = (card) => {
    const item = data.done.find((d) => d.id === card.dataset.view);
    if (item) { sfx.tap(); showPhotoViewer(item); }
  };
  $('#done', el).addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-view]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openViewer(card); }
  });

  el.addEventListener('click', async (e) => {
    const view = e.target.closest('[data-view]');
    if (view) { openViewer(view); return; }
    const quick = e.target.closest('[data-quick]');
    if (quick) { addTitle(quick.dataset.quick); return; }
    const edit = e.target.closest('[data-edit]');
    if (edit) { sfx.tap(); editingId = edit.dataset.edit; renderPending(); return; }
    if (e.target.closest('[data-cancel]')) { sfx.tap(); editingId = null; renderPending(); return; }
    const save = e.target.closest('[data-save]');
    if (save) { saveEdit(save.dataset.save); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      sfx.tap();
      const li = del.closest('li');
      li.classList.add('out');
      try {
        await api.adminDeleteHomework(name, del.dataset.del);
        await sleep(280);
        pending = pending.filter((p) => p.id !== del.dataset.del);
        renderPending();
      } catch (err) {
        li.classList.remove('out');
        fail(err);
      }
    }
  });
}

// 부모님이 한 아이의 한문 6급 과정을 켜고 끄고, 몇 번째 날부터 할지 정한다
async function screenParentHanja(name) {
  setTopbar('none');
  let hz;
  let course;
  let info;
  try {
    hz = await import('./hanja.js');
    [course, info] = await Promise.all([hz.loadCourse(), api.adminHanja(name)]);
  } catch (err) {
    toast(err.message, 'err');
    if (err.status === 401) screenParentLogin(); else screenParent();
    return;
  }
  const h = info.hanja;
  const LV = ['8급', '7급Ⅱ', '7급', '6급Ⅱ', '6급 새 한자'];
  const nowDay = Math.min(h.day, h.totalDays);
  const ex = h.exam;
  const byH = new Map(hz.allChars(course).map((c) => [c.h, c]));
  const weakChips = info.weak.map((x) => byH.get(x)).filter(Boolean).map((c) => `<span class="hz-chip"><b>${esc(c.h)}</b><small>${esc(c.k)} ${esc(c.s)}</small></span>`).join('');
  const exNote = ex
    ? `시험 ${monthDay(ex.date)} · ${ddayText(ex)} · ${{ study: '공부 기간', final: '마무리 3일', today: '시험날' }[ex.phase]}${ex.phase === 'study' ? ` · 오늘 순서대로 수업 ${h.advToday}/${h.goal}` : ''}`
    : '시험 날짜가 없어요 (정하지 않았거나 이미 지났어요)';
  const dayNote = h.finished ? '60일을 모두 마쳤어요 🏆' : `다음에 공부할 날: Day ${h.day} · ${esc(hz.dayOf(course, h.day).title)} (${esc(hz.dayOf(course, h.day).level)})`;
  const logs = info.log.map((l) => `<div class="rec"><div class="thumb">${hanjaLogIcon(l)}</div><div class="r-body"><div class="r-title">${hanjaLogLabel(l)}</div><div class="r-meta">${stars(l.score)}<small>${l.kind === 'lesson' ? '실수' : '틀린 문제'} ${l.misses}번 · ${new Date(l.doneAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${fmtClock(l.doneAt)}</small></div></div></div>`).join('');
  const el = mount(`
    <div class="my">
      <button class="back-link" id="back">← 부모님 메뉴</button>
      <h2 style="font-size:1.9rem">📖 ${esc(name)}의 한문 6급</h2>
      <p class="sub">한국어문회 6급 배정한자 300자를 하루 5자씩 60일 코스로 익혀요. 시험 날짜를 정하면 D-day 와 함께 모의시험·약한 글자 수업이 나오고, 순서대로 수업은 남은 날에 맞춰 하루 1~3개가 목표예요.</p>
      <div class="card" style="display:grid;gap:12px">
        <div><b>${h.enabled ? '✅ 켜져 있어요' : '⏸️ 꺼져 있어요'}</b> <small>${info.defaultOn ? '(기본값: 켜짐)' : '(기본값: 꺼짐)'}</small></div>
        <div class="pc-actions">
          <button class="btn ${h.enabled ? 'btn-white' : 'btn-mint'} small" data-set="${h.enabled ? 'off' : 'on'}">${h.enabled ? '⏸️ 끄기' : '▶️ 켜기'}</button>
          <button class="btn btn-white small" data-set="default">↩️ 기본값으로</button>
        </div>
      </div>
      <div class="card" style="display:grid;gap:12px">
        <div>${dayNote}<br><small>수업을 마친 날 ${info.doneDays.length}일 · 배운 글자 ${info.doneDays.length * h.perDay} / ${h.totalDays * h.perDay} · 오늘 ${h.doneToday ? '이미 끝냈어요' : '아직이에요'}</small></div>
        <div class="hz-bar"><i style="width:${Math.round((info.doneDays.length / h.totalDays) * 100)}%"></i></div>
        <div class="chips"><small>이 단계부터 시작</small>${h.levelStarts.map((d, i) => `<button class="btn btn-white small" data-day="${d}">${LV[i]}</button>`).join('')}</div>
        <div class="chips"><small>날짜 바꾸기</small>
          <button class="btn btn-white small" data-day="${Math.max(1, h.day - 1)}">◀ 하루 전</button>
          <b>Day ${nowDay}</b>
          <button class="btn btn-white small" data-day="${Math.min(h.totalDays + 1, h.day + 1)}">하루 뒤 ▶</button>
          ${h.doneToday ? '<button class="btn btn-yellow small" data-reopen="1">🔓 오늘 몫 다시 열기</button>' : ''}
        </div>
      </div>
      <div class="card" style="display:grid;gap:12px">
        <div><b>🎯 시험 대비</b><br><small>${exNote}</small></div>
        <div class="chips"><small>시험 날짜</small>
          <input type="date" id="exam-date" value="${ex ? ex.date : ''}" aria-label="시험 날짜" style="font:inherit;padding:6px 10px;border:3px solid var(--ink);border-radius:12px">
          <button class="btn btn-blue small" data-exam="set">저장</button>
          <button class="btn btn-white small" data-exam="none">시험 없음</button>
          ${info.examDefault ? `<button class="btn btn-white small" data-exam="default">↩️ 기본값 (${monthDay(info.examDefault)})</button>` : ''}
        </div>
        <div><small>모의시험·수업에서 만난 글자 ${info.asked}자 · 약한 글자 ${info.weak.length}개 (틀린 뒤 연속 2번 맞히면 빠져요)</small></div>
        ${weakChips ? `<div class="hz-chips">${weakChips}</div>` : ''}
      </div>
      ${logs ? `<div class="card"><h3>최근 수업 기록</h3><div style="display:grid;gap:10px;margin-top:8px">${logs}</div></div>` : ''}
    </div>`);
  $('#back', el).onclick = () => { sfx.tap(); screenParent(); };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-set],[data-day],[data-reopen],[data-exam]');
    if (!b) return;
    sfx.tap();
    const body = {};
    if (b.dataset.exam) {
      const v = $('#exam-date', el).value;
      if (b.dataset.exam === 'set' && !v) { toast('시험 날짜를 골라 주세요', 'err'); sfx.error(); return; }
      body.exam = { set: v, none: '', default: null }[b.dataset.exam];
    }
    if (b.dataset.set) body.enabled = { on: true, off: false, default: null }[b.dataset.set];
    if (b.dataset.day) body.day = Number(b.dataset.day);
    if (b.dataset.reopen) body.reopenToday = true;
    b.disabled = true;
    try {
      await api.adminSetHanja(name, body);
      sfx.success();
      state.config = await api.config();
      screenParentHanja(name);
    } catch (err) {
      b.disabled = false;
      toast(err.message, 'err');
      sfx.error();
    }
  });
}

// 엄마·아빠 캐릭터로 아이의 교실에 같이 들어간다. 아이가 그때 쉼터에 있으면 서로 보인다.
const ROLE_KEY = 'htf_parent_role';
function chooseParentRole(name, room) {
  return new Promise((resolve) => {
    let last = 'mom';
    try { last = localStorage.getItem(ROLE_KEY) === 'dad' ? 'dad' : 'mom'; } catch (_) { /* 무시 */ }
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="card ovl-card role-card" role="dialog" aria-modal="true">
        <div class="avatar-row">${avatarHtml(avatarOf(name), { size: 'lg' })}</div>
        <h3>${esc(name)}의 교실에 같이 들어가요</h3>
        <p class="pc-room">🏫 ${esc(room ? room.label : '')}</p>
        <p class="role-status" id="role-status">교실을 확인하는 중…</p>
        <div class="role-btns">
          <button class="btn btn-coral big${last === 'mom' ? ' pick' : ''}" data-role="mom">👩 엄마로 들어가기</button>
          <button class="btn btn-blue big${last === 'dad' ? ' pick' : ''}" data-role="dad">👨 아빠로 들어가기</button>
        </div>
        <button class="back-link" data-role="">← 돌아가기</button>
      </div>`;
    document.body.appendChild(ov);
    api.adminPeek(name).then((r) => {
      const kidHere = r.here.some((p) => p.kind === 'kid');
      const el = $('#role-status', ov);
      if (el) el.textContent = kidHere ? `🎉 ${name}이(가) 지금 교실에 있어요! 같이 만나요` : `지금은 ${name}이(가) 교실에 없어요. 숙제를 모두 끝내면 들어와요 (먼저 둘러봐도 좋아요)`;
    }).catch(() => { const el = $('#role-status', ov); if (el) el.textContent = ''; });
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-role]');
      if (!b) return;
      sfx.tap();
      ov.remove();
      const role = b.dataset.role;
      if (role) { try { localStorage.setItem(ROLE_KEY, role); } catch (_) { /* 무시 */ } }
      resolve(role || null);
    });
  });
}

async function enterClassroom(name, back) {
  sfx.unlock();
  let cls;
  try {
    cls = await api.adminClassroom(name);
  } catch (err) {
    toast(err.message, 'err');
    if (err.status === 401) screenParentLogin();
    return;
  }
  const role = await chooseParentRole(name, cls.room);
  if (!role) return;
  sfx.pop();
  const sid = Math.random().toString(36).slice(2, 10); // 이 화면의 번호 (같은 사람의 움직임을 이어 붙인다)
  openTour({
    user: { name, avatar: avatarOf(name) },
    visit: { role },
    room: cls.room,
    npcs: cls.npcs,
    presence: { sync: (me) => api.adminPresence(name, { ...me, sid, role }), leave: () => api.adminPresenceLeave(name, { sid, role }) },
    onClose: () => back(),
  });
}

// 부모님이 한 아이의 마음 쉼터 교실을 꾸민다: 선생님·친구를 만들고, 고치고, 지우고, 미리 본다
async function screenParentClassroom(name) {
  setTopbar('none');
  let npcs;
  let room;
  try {
    ({ npcs, room } = await api.adminClassroom(name));
  } catch (err) {
    toast(err.message, 'err');
    if (err.status === 401) screenParentLogin(); else screenParent();
    return;
  }
  const card = (n) => `
    <div class="card npc-card" data-id="${n.id}">
      <div class="npc-chips" aria-hidden="true"><i style="--c:${n.look.hair}"></i><i style="--c:${n.look.top}"></i><i style="--c:${n.look.bottom}"></i></div>
      <div class="npc-info">
        <b>${esc(n.name)}</b>
        <span class="chipv ${n.role === 'teacher' ? 'okay' : ''}">${n.role === 'teacher' ? '🧑‍🏫 선생님' : '🧒 친구'}</span>
        <p>${n.msg ? esc(n.msg) : '(한마디 없음)'}</p>
      </div>
      <div class="npc-btns">
        <button class="btn btn-white small" data-edit="${n.id}">✏️ 고치기</button>
        <button class="icon-btn" data-del="${n.id}" aria-label="${esc(n.name)} 지우기">🗑️</button>
      </div>
    </div>`;
  const section = (title, list) => `<div class="rec-day">${title} (${list.length})</div>${list.length ? list.map(card).join('') : '<p class="empty">아직 없어요</p>'}`;
  const el = mount(`
    <div class="my">
      <button class="back-link" id="back">← 부모님 메뉴</button>
      <h2 style="font-size:1.9rem">🏫 ${esc(name)}의 교실${room && room.who ? ` <span class="chipv">${esc(room.who)}</span>` : ''}</h2>
      <p class="pc-room">${esc(room ? room.label : '')}</p>
      <p class="sub">숙제를 모두 끝낸 ${esc(name)}이(가) 들어가는 마음 쉼터에 나오는 선생님과 친구들이에요. 만들고 고치면 바로 반영되고, 모두 교실을 돌아다녀요. (최대 12명)</p>
      <div class="pc-actions">
        <button class="btn btn-coral small" id="visit">👪 엄마·아빠로 같이 들어가기</button>
        <button class="btn btn-yellow small" data-new="teacher">➕ 선생님 만들기</button>
        <button class="btn btn-blue small" data-new="friend">➕ 친구 만들기</button>
        <button class="btn btn-mint small" id="preview">🌈 이 교실 미리 보기</button>
        <button class="btn btn-white small" id="reset">↩️ 기본으로 되돌리기</button>
      </div>
      ${section('🧑‍🏫 선생님', npcs.filter((n) => n.role === 'teacher'))}
      ${section('🧒 친구들', npcs.filter((n) => n.role === 'friend'))}
    </div>`);

  const edit = async (initial, onSave) => {
    const { openNpcEditor } = await import('./classroom.js');
    if (await openNpcEditor({ initial, kidName: name, onSave })) screenParentClassroom(name);
  };

  $('#back', el).onclick = () => { sfx.tap(); screenParent(); };
  $('#preview', el).onclick = async () => {
    sfx.unlock();
    sfx.pop();
    const avatar = (state.config.kids.find((k) => k.name === name) || {}).avatar || { animal: 0, color: 0, acc: 0 };
    // 이 아이가 보게 될 모습 그대로 둘러본다 (별은 저장되지 않는다)
    openTour({ user: { name, avatar }, preview: true, room, npcs, onClose: () => screenParentClassroom(name) });
  };
  $('#visit', el).onclick = () => { sfx.tap(); enterClassroom(name, () => screenParentClassroom(name)); };
  $('#reset', el).onclick = async () => {
    sfx.tap();
    if (!(await confirmDialog({
      title: `${name}의 교실을 기본으로 되돌릴까요? ↩️`,
      text: '만들거나 고친 선생님·친구가 모두 사라지고 처음 모습으로 돌아가요.',
      yes: '되돌릴래요',
      no: '아니요',
    }))) return;
    try {
      await api.adminResetClassroom(name);
      sfx.success();
      toast('기본 교실로 되돌렸어요 ✅');
      screenParentClassroom(name);
    } catch (err) {
      toast(err.message, 'err');
      sfx.error();
    }
  };
  el.addEventListener('click', async (e) => {
    const created = e.target.closest('[data-new]');
    if (created) {
      sfx.tap();
      const { newNpc } = await import('./classroom.js');
      edit(newNpc(created.dataset.new), (d) => api.adminAddNpc(name, d));
      return;
    }
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      sfx.tap();
      const npc = npcs.find((n) => n.id === editBtn.dataset.edit);
      if (npc) edit(npc, (d) => api.adminEditNpc(name, npc.id, d));
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      sfx.tap();
      const npc = npcs.find((n) => n.id === del.dataset.del);
      if (!npc || !(await confirmDialog({ title: `${npc.name}을(를) 교실에서 뺄까요? 🗑️`, yes: '뺄래요', no: '아니요' }))) return;
      try {
        await api.adminDeleteNpc(name, npc.id);
        sfx.success();
        screenParentClassroom(name);
      } catch (err) {
        toast(err.message, 'err');
        sfx.error();
      }
    }
  });
}

// ───────────────────────── 시작 ─────────────────────────
function screenBoot(message, retry) {
  mount(`
    <div class="boot-clock">⏱️</div>
    <p style="font-size:1.5rem">${esc(message)}</p>
    ${retry ? '<button class="btn btn-blue" id="retry">🔄 다시 해보기</button>' : '<small style="opacity:.6">처음엔 1분 정도 걸릴 수 있어요 😴</small>'}`, 'center boot');
  if (retry) $('#retry').onclick = boot;
}

async function boot() {
  setAuthLostHandler(() => { toast('다시 로그인해 주세요'); screenLogin(); });
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
  screenBoot('HTF 를 깨우는 중이에요…');
  // 무료 서버는 한동안 안 쓰면 잠든다 → 깨어날 때까지 기다리며 다시 시도
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      state.config = await api.config();
      break;
    } catch (_) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(3000);
    }
  }
  if (!state.config) { screenBoot('서버에 연결하지 못했어요 😢', true); return; }
  if (hasToken()) {
    try {
      state.user = (await api.me()).user;
    } catch (_) {
      // 401 이면 api.js 가 이미 로그인 화면으로 보냈다. 그 밖의 실패만 여기서 처리한다.
      if (hasToken()) { setToken(null); screenLogin(); }
      return;
    }
    await goHome();
    return;
  }
  screenLogin();
}

// 개발·점검용: localStorage.htf_debug = '1' 이면 화면을 직접 불러 볼 수 있다 (world.js 의 점검용 훅과 같은 방식)
try { if (localStorage.getItem('htf_debug') === '1') window.__htfApp = { state, screenFinish, screenParent, screenParentHanja, screenHomework, screenRun, screenMyPage, runHanja }; } catch (_) { /* 무시 */ }
boot();
