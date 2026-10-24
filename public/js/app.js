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
    try { img.src = await photoUrl(img.dataset.photo); } catch (_) { img.replaceWith(Object.assign(document.createElement('span'), { textContent: '🖼️' })); }
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
            <span class="hw-title">${esc(it.title)}${it.carryCount > 0 ? `<span class="carry">${carryLabel(it.carryCount)}</span>` : ''}</span>
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
const stars = (score) => `<span class="mini-stars">${[1, 2, 3, 4, 5].map((n) => `<span class="${n <= score ? '' : 'off'}">★</span>`).join('')}</span>`;

function verdictInfo(it) {
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
        <p class="endtime">⏰ ${fmtClock(s.endsAt)} 에 끝나요</p>
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
    <li class="task ${animate ? 'enter' : ''}" data-id="${it.id}" style="--d:${i * 0.08}s">
      <span class="no">${i + 1}</span>
      <div class="t-body"><div class="t-title">${esc(it.title)}</div>${it.carryCount > 0 ? `<span class="carry">${carryLabel(it.carryCount)}</span>` : ''}</div>
      <button class="btn btn-mint clear-btn" data-clear="${it.id}" style="--d:${i * 0.4}s">클리어! ✨</button>
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
  const remainNow = () => Math.max(0, Math.ceil((s.endsAt - (Date.now() + state.offset)) / 1000));
  marks.forEach((m, i) => { if (remainNow() <= m.at) fired.add(i); });

  let lastSec = -1;
  function tick() {
    const remainMs = Math.max(0, s.endsAt - (Date.now() + state.offset));
    const sec = Math.ceil(remainMs / 1000);
    const ratio = remainMs / total;
    fg.setAttribute('stroke-dashoffset', (C * (1 - ratio)).toFixed(2));
    const p = clamp(1 - ratio, 0, 1);
    fill.style.width = `${p * 100}%`;
    rocket.style.left = `calc(${p} * (100% - 34px))`;
    if (sec !== lastSec) {
      lastSec = sec;
      timeEl.textContent = fmtMMSS(sec);
      const left = sec / s.durationSec;
      ring.classList.toggle('warn', left <= 0.33 && left > 0.1);
      ring.classList.toggle('hot', left <= 0.1);
      const last10 = sec <= 10 && sec > 0;
      ring.classList.toggle('last10', last10);
      if (last10) { sfx.tick(); timeEl.style.animation = 'none'; void timeEl.offsetWidth; timeEl.style.animation = ''; }
      marks.forEach((m, i) => {
        if (!fired.has(i) && sec <= m.at && sec > 0) {
          fired.add(i);
          banner(m.text, m.kind);
          if (m.kind) sfx.warn(); else sfx.pop();
        }
      });
    }
    if (remainMs <= 0) {
      clearInterval(iv);
      onTimeUp();
    }
  }
  const iv = setInterval(tick, 200);
  onLeave(() => clearInterval(iv));
  tick();

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

  el.addEventListener('click', async (e) => {
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
  screenFinish(reason, summary);
}

function screenFinish(reason, { cleared, remaining }) {
  setTopbar('full');
  const cfg = {
    allclear: { emoji: '🏆', title: '올 클리어!!', sub: '오늘 숙제를 모두 끝냈어요. 정말 대단해요!' },
    timeup: { emoji: '⏰', title: '시간 종료!', sub: 'HTF 시간이 끝났어요. 정말 수고했어요!' },
    quit: { emoji: '👋', title: '수고했어요!', sub: '오늘은 여기까지 해요.' },
  }[reason];
  const el = mount(`
    <div class="trophy">${cfg.emoji}</div>
    <h2>${cfg.title}</h2>
    <p class="sub">${cfg.sub}</p>
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
  if (reason === 'allclear') { celebrate(['🏆', '⭐', '🎉', '✨']); sfx.success(); }
  else if (reason === 'timeup') { confetti({ count: cleared ? 120 : 40, y: 0.6, emojis: ['⭐'] }); }
  else if (cleared) { confetti({ count: 60, y: 0.6 }); }
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
    else paneRecords();
  });

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
    text: '숙제·사진·AI 판독 기록이 사라져요. 프로필과 캐릭터, 비밀번호는 그대로예요.',
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
          <h3>${esc(k.name)}</h3>
          <p>${k.registered
    ? `${esc(k.school)} ${esc(k.className)}<br>클리어 ${k.done}개 · 남은 숙제 ${k.pending}개 · 사진 ${k.photos}장${k.needsPin ? ' · 🔑 새 비밀번호 대기 중' : ''}`
    : '아직 등록 전이에요'}</p>
        </div>
      </div>
      ${k.registered ? `
        <div class="pc-actions">
          <button class="btn btn-white small" data-act="clear-records">🧹 기록만 지우기</button>
          <button class="btn btn-white small" data-act="reset-pin">🔑 비밀번호 다시 정하기</button>
          <button class="btn btn-coral small" data-act="reset-all">🔄 처음부터 다시</button>
        </div>` : ''}
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

boot();
