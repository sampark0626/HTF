// 한문 6급 수업: 하루 5자를 쉽게 외우고, 태블릿에 손가락(펜)으로 획순대로 따라 쓴다.
//  몸풀기(어제 글자 퀴즈) → 글자마다 ① 보기(획순 애니메이션·외우는 요령) ② 따라쓰기 ③ 혼자 쓰기 → 마무리 퀴즈 → 저장
//  - 글자와 요령: /data/hanja6.json (scripts/hanja/build.js 가 만든다)
//  - 획 따라 쓰기: hanzi-writer (MIT) + hanzi-writer-data (Make Me a Hanzi 기반, Arphic Public License). npm 패키지를 /vendor 로 내려 준다.
//  - 시험용 정자(敎 飮 窓 淸)처럼 패키지에 없는 4자는 /data/strokes 의 보충 데이터를 쓴다.
import { sfx } from './sfx.js';
import { confetti } from './fx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const stars3 = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// ───────── 자료 불러오기 ─────────
let coursePromise = null;
export function loadCourse() {
  coursePromise ||= fetch('/data/hanja6.json')
    .then((r) => { if (!r.ok) throw new Error('한문 자료를 불러오지 못했어요'); return r.json(); })
    .catch((e) => { coursePromise = null; throw e; });
  return coursePromise;
}

let writerPromise = null;
function loadWriter() {
  if (window.HanziWriter) return Promise.resolve(window.HanziWriter);
  writerPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/hanzi-writer/hanzi-writer.min.js';
    s.onload = () => (window.HanziWriter ? resolve(window.HanziWriter) : reject(new Error('획 연습 도구가 비어 있어요')));
    s.onerror = () => { writerPromise = null; reject(new Error('획 연습 도구를 불러오지 못했어요')); };
    document.head.appendChild(s);
  });
  return writerPromise;
}

const SUPPLEMENT = new Set(['敎', '飮', '窓', '淸']);
function charDataLoader(char, onLoad, onError) {
  const name = encodeURIComponent(char);
  fetch(SUPPLEMENT.has(char) ? `/data/strokes/${name}.json` : `/vendor/hanzi-data/${name}.json`)
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(onLoad)
    .catch(onError);
}

// ───────── 날짜별 글자 ─────────
export const dayOf = (course, day) => course.days[day - 1];
export const levelOfDay = (course, day) => (dayOf(course, day) || {}).level || '';
export const allChars = (course) => course.days.flatMap((d) => d.chars.map((c) => ({ ...c, day: d.day })));

// 몸풀기 문제로 쓸 글자: 실제로 수업을 마친 날(doneDays)만 쓴다. 가장 최근에 배운 날의 글자가 중심이고,
// 그 전에 배운 날이 있으면 2자를 섞는다. 배운 적이 없으면 몸풀기는 건너뛴다.
export function reviewChars(course, day, doneDays = new Set()) {
  const days = [...doneDays].filter((d) => d < day).sort((a, b) => b - a);
  if (!days.length) return [];
  const older = shuffle(days.slice(1, 6).flatMap((d) => dayOf(course, d).chars)).slice(0, 2);
  const recent = shuffle(dayOf(course, days[0]).chars).slice(0, older.length ? 3 : 5);
  return shuffle([...recent, ...older]);
}

// 읽어 주기 (브라우저가 한국어 목소리를 가지고 있을 때만)
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (_) { /* 소리가 안 나도 수업은 계속된다 */ }
}

// ───────── 퀴즈 문제 만들기 ─────────
const label = (c) => `${c.k} ${c.s}`;
function makeQuestions(chars, pool) {
  return shuffle(chars).map((c, i) => {
    const type = i % 2 === 0 ? 'meaning' : 'hanja'; // 한자를 보고 훈음 고르기 / 훈음을 보고 한자 고르기
    const wrong = [];
    for (const d of shuffle(pool)) {
      if (wrong.length >= 3) break;
      if (d.h === c.h || label(d) === label(c) || wrong.some((w) => label(w) === label(d))) continue; // eslint-disable-line no-continue
      wrong.push(d);
    }
    return { c, type, options: shuffle([c, ...wrong]) };
  });
}

// ───────── 수업 화면 ─────────
// openLesson 은 수업이 끝나면 { done: true, result, saved } 를, 중간에 그만두면 { done: false } 를 돌려준다.
//   chars    이번에 배울 글자들 (보통 하루 5자)       review  몸풀기 퀴즈용 글자들(없으면 건너뜀)
//   quiz     마지막 퀴즈를 낼지                       save    async (result) => 저장 (실패하면 던진다)
//   confirm  async ({title,text,yes,no}) => boolean   doneLabel 마지막 버튼 글자
export async function openLesson({ course, title, chars, review = [], quiz = true, day = 0, save = null, confirm, doneLabel = '🏆 끝났어요!' }) {
  document.body.classList.add('hz-open');
  const root = document.createElement('div');
  root.className = 'hz';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <header class="hz-top">
      <button class="hz-x" id="hz-x" aria-label="그만하기">✕</button>
      <div class="hz-steps" id="hz-steps"></div>
      <div class="hz-title">${esc(title)}</div>
    </header>
    <main class="hz-main" id="hz-main"><div class="hz-loading">📖 수업을 준비하는 중<span class="dots"></span></div></main>`;
  document.body.appendChild(root);
  const main = root.querySelector('#hz-main');
  const stepsEl = root.querySelector('#hz-steps');

  let HW;
  try {
    HW = await loadWriter();
  } catch (err) {
    main.innerHTML = `<div class="hz-card hz-err"><h2>앗, 수업을 열지 못했어요 😢</h2><p>${esc(err.message)}</p><button class="btn btn-white" id="hz-close">닫기</button></div>`;
    return new Promise((resolve) => {
      root.querySelector('#hz-close').onclick = () => { root.remove(); document.body.classList.remove('hz-open'); resolve({ done: false }); };
    });
  }

  const pool = allChars(course);
  const steps = [];
  if (review.length) steps.push({ id: 'review', dot: '🔥' });
  chars.forEach((c, i) => steps.push({ id: `c${i}`, dot: String(i + 1) }));
  if (quiz) steps.push({ id: 'quiz', dot: '❓' });
  const setStep = (id) => {
    const at = steps.findIndex((s) => s.id === id);
    stepsEl.innerHTML = steps.map((s, i) => `<span class="${i < at ? 'done' : i === at ? 'now' : ''}">${s.dot}</span>`).join('');
  };

  let live = null; // 지금 쓰고 있는 글씨판 (닫을 때 정리)
  let closed = false;
  let finish = () => {};
  const closeAll = (value) => {
    closed = true;
    if (live) { try { live.cancel(); } catch (_) { /* 무시 */ } }
    root.remove();
    document.body.classList.remove('hz-open');
    finish(value);
  };
  root.querySelector('#hz-x').onclick = async () => {
    sfx.tap();
    if (await confirm({ title: '수업을 그만할까요? 📖', text: '지금까지 한 것은 저장되지 않아요. 다음에 다시 이어서 해요.', yes: '그만할래요', no: '계속할래요' })) closeAll({ done: false });
  };
  const resultPromise = new Promise((resolve) => { finish = resolve; });

  const totals = { misses: 0, quizRight: 0, quizTotal: 0 };
  const charStars = [];

  // ── 글씨판: 획순 애니메이션 / 따라쓰기 ──
  function makeBoard(boardEl, ch, opts = {}) {
    boardEl.innerHTML = '';
    const size = Math.round(boardEl.clientWidth || 360);
    return HW.create(boardEl, ch, {
      width: size,
      height: size,
      padding: Math.round(size * 0.07),
      showOutline: opts.outline !== false,
      showCharacter: Boolean(opts.show),
      strokeColor: '#2b2d42',
      outlineColor: '#d6daea',
      highlightColor: '#ffb703',
      drawingColor: '#4f7cff',
      radicalColor: opts.radical ? '#e8590c' : null,
      drawingWidth: Math.max(6, Math.round(size / 42)),
      strokeAnimationSpeed: 0.9,
      delayBetweenStrokes: 650,
      charDataLoader,
    });
  }

  // 한 글자를 따라/혼자 써 보는 판. 끝나면 { misses, skipped } 로 resolve 된다.
  function writeRound(boardEl, panelEl, ch, { outline, hintAfter, markAfter, leniency }) {
    return new Promise((resolve) => {
      let misses = 0;
      let nextStroke = 0;
      let total = 0;
      let writer = null;
      let ended = false;
      const counter = panelEl.querySelector('[data-count]');
      const showCount = () => { if (counter) counter.textContent = total ? `${Math.min(nextStroke, total)} / ${total} 획` : ''; };
      const start = () => {
        nextStroke = 0;
        writer = makeBoard(boardEl, ch, { outline });
        writer.getCharacterData().then((d) => { total = d.strokes.length; showCount(); }).catch(() => {});
        showCount();
        writer.quiz({
          leniency,
          showHintAfterMisses: hintAfter,
          markStrokeCorrectAfterMisses: markAfter,
          highlightOnComplete: true,
          acceptBackwardsStrokes: true,
          onMistake: () => { misses += 1; sfx.error(); boardEl.classList.remove('shake'); void boardEl.offsetWidth; boardEl.classList.add('shake'); },
          onCorrectStroke: (s) => { nextStroke = s.strokeNum + 1; sfx.pop(); showCount(); },
          onComplete: () => {
            if (ended) return;
            ended = true;
            nextStroke = total;
            showCount();
            resolve({ misses, skipped: false });
          },
        }).catch(() => { /* 취소된 퀴즈 */ });
      };
      start();
      const startedAt = Date.now();
      live = {
        cancel() { ended = true; try { writer.cancelQuiz(); } catch (_) { /* 무시 */ } },
        restart() { try { writer.cancelQuiz(); } catch (_) { /* 무시 */ } misses += 1; start(); },
        hint() { try { writer.highlightStroke(nextStroke); } catch (_) { /* 무시 */ } },
        count: showCount,
        // 건너뛰기는 충분히 해 본 뒤에만 (실수 2번 또는 20초). 막혔을 때 빠져나갈 길이지, 연습을 통째로 빼먹는 길이 아니다.
        skip() {
          if (ended) return true;
          if (misses < 2 && Date.now() - startedAt < 20000) return false;
          ended = true;
          try { writer.cancelQuiz(); } catch (_) { /* 무시 */ }
          resolve({ misses: misses + 3, skipped: true });
          return true;
        },
      };
    });
  }

  // ── 한 글자 수업 (보기 → 따라쓰기 → 혼자 쓰기) ──
  async function teachChar(c, idx, count) {
    setStep(`c${idx}`);
    const words = c.w.map(([w, r, m]) => `<li><b>${esc(w)}</b> <span>${esc(r)}</span> <small>${esc(m)}</small></li>`).join('');
    const alt = (c.alt || []).map(([k, s]) => `${esc(k)} ${esc(s)}`).join(' · ');
    main.innerHTML = `
      <div class="hz-char">
        <div class="hz-left">
          <div class="hz-board" id="hz-board"></div>
          <div class="hz-count" data-count></div>
        </div>
        <div class="hz-right">
          <div class="hz-card">
            <div class="hz-phase" id="hz-phase"></div>
            <div class="hz-read"><span class="hz-big">${esc(c.h)}</span><div><b>${esc(c.k)} ${esc(c.s)}</b>${alt ? `<small>다른 읽기: ${alt}</small>` : ''}<small>${esc(c.lv)} · 부수 ${esc(c.r)} · ${c.n}획</small></div></div>
            <div class="hz-tip"><em>💡 외우는 요령</em>${esc(c.m)}</div>
            <ul class="hz-words">${words}</ul>
          </div>
          <div class="hz-actions" id="hz-actions"></div>
        </div>
      </div>`;
    const board = main.querySelector('#hz-board');
    const phase = main.querySelector('#hz-phase');
    const actions = main.querySelector('#hz-actions');
    const panel = main.querySelector('.hz-left');
    const say = () => speak(`${c.k} ${c.s}`);
    const wait = (html, handlers) => new Promise((resolve) => {
      actions.innerHTML = html;
      actions.onclick = (e) => {
        const b = e.target.closest('[data-do]');
        if (!b || closed) return;
        sfx.tap();
        const r = handlers[b.dataset.do]?.(b);
        if (r === 'next') resolve('next');
      };
    });

    // ① 보기
    phase.innerHTML = `<span>① 보기</span><i>${count > 1 ? `${idx + 1} / ${count}번째 글자` : ''}</i>`;
    const play = () => {
      const w = makeBoard(board, c.h, { outline: true, radical: true });
      w.animateCharacter({ onComplete: () => { if (!closed) w.showCharacter(); } });
    };
    play();
    say();
    await wait(
      `<button class="btn btn-white small" data-do="again">▶ 획순 다시</button>
       <button class="btn btn-white small" data-do="say">🔊 읽어 줘요</button>
       <button class="btn btn-yellow" data-do="next">✏️ 따라 써 볼래요!</button>`,
      { again: play, say, next: () => 'next' }
    );
    if (closed) return null;

    // ② 따라쓰기 ③ 혼자 쓰기
    const rounds = [
      { name: '② 따라쓰기', tip: '연한 글자를 따라 획순대로 그려요', cfg: { outline: true, hintAfter: 1, markAfter: 4, leniency: 1.5 } },
      { name: '③ 혼자 쓰기', tip: '이제 보지 않고 써 봐요!', cfg: { outline: false, hintAfter: 2, markAfter: 5, leniency: 1.4 } },
    ];
    const got = [];
    for (const rd of rounds) {
      phase.innerHTML = `<span>${rd.name}</span><i>${rd.tip}</i>`;
      actions.innerHTML = `
        <button class="btn btn-white small" data-do="hint">💡 힌트</button>
        <button class="btn btn-white small" data-do="redo">↺ 다시 쓰기</button>
        <button class="btn btn-white small" data-do="skip">⏭ 건너뛰기</button>`;
      actions.onclick = (e) => {
        const b = e.target.closest('[data-do]');
        if (!b || !live) return;
        sfx.tap();
        if (b.dataset.do === 'hint') live.hint();
        else if (b.dataset.do === 'redo') live.restart();
        else if (b.dataset.do === 'skip' && !live.skip()) {
          const cnt = main.querySelector('[data-count]');
          if (cnt) {
            cnt.textContent = '💪 조금만 더 써 봐요! 막히면 💡 힌트를 눌러요';
            setTimeout(() => { if (live && live.count && !closed) live.count(); }, 2600);
          }
        }
      };
      // eslint-disable-next-line no-await-in-loop
      const r = await writeRound(board, panel, c.h, rd.cfg);
      if (closed) return null;
      got.push(r);
      sfx.success();
      // eslint-disable-next-line no-await-in-loop
      await sleep(r.skipped ? 300 : 700);
    }
    const [trace, solo] = got;
    const misses = trace.misses + solo.misses;
    const skipped = trace.skipped || solo.skipped;
    const stars = skipped ? 1 : solo.misses === 0 && trace.misses <= 1 ? 3 : solo.misses <= 2 ? 2 : 1;
    totals.misses += misses;
    charStars.push(stars);
    confetti({ count: 40 + stars * 20, y: 0.5, emojis: ['⭐', '✨'] });
    phase.innerHTML = `<span>🎉 ${esc(c.h)} 완성!</span><i>${stars3(stars)}</i>`;
    await wait(
      `<button class="btn btn-white small" data-do="say">🔊 읽어 줘요</button>
       <button class="btn btn-yellow" data-do="next">${idx + 1 < count ? '다음 글자 ▶' : quiz ? '퀴즈 ▶' : '끝! ▶'}</button>`,
      { say, next: () => 'next' }
    );
    return stars;
  }

  // ── 퀴즈 (몸풀기와 마무리가 같은 틀) ──
  async function runQuiz({ id, heading, sub, questions, count = true }) {
    setStep(id);
    let queue = questions.slice();
    let n = 0;
    const asked = questions.length;
    const retry = new Set();
    let right = 0;
    while (queue.length && !closed) {
      const q = queue.shift();
      n += 1;
      const prompt = q.type === 'meaning'
        ? `<div class="hz-qbig">${esc(q.c.h)}</div><p>이 글자의 <b>뜻과 소리</b>는?</p>`
        : `<div class="hz-qtext">${esc(label(q.c))}</div><p>이 <b>뜻과 소리</b>의 한자는?</p>`;
      main.innerHTML = `
        <div class="hz-quiz">
          <div class="hz-qhead"><b>${esc(heading)}</b><small>${esc(sub)}</small><span>${Math.min(n, asked + retry.size)} / ${asked + retry.size}</span></div>
          ${prompt}
          <div class="hz-opts ${q.type === 'hanja' ? 'han' : ''}">
            ${q.options.map((o, i) => `<button class="hz-opt" data-i="${i}">${q.type === 'meaning' ? esc(label(o)) : `<span>${esc(o.h)}</span>`}</button>`).join('')}
          </div>
          <div class="hz-fb" id="hz-fb" aria-live="polite"></div>
        </div>`;
      // eslint-disable-next-line no-await-in-loop
      const ok = await new Promise((resolve) => {
        let locked = false;
        main.querySelector('.hz-opts').onclick = async (e) => {
          const b = e.target.closest('.hz-opt');
          if (!b || locked || closed) return;
          locked = true;
          const pick = q.options[Number(b.dataset.i)];
          const good = pick.h === q.c.h;
          const fb = main.querySelector('#hz-fb');
          b.classList.add(good ? 'right' : 'wrong');
          if (good) {
            sfx.success();
            fb.innerHTML = '⭕ 맞아요!';
          } else {
            sfx.error();
            main.querySelectorAll('.hz-opt').forEach((x) => { if (q.options[Number(x.dataset.i)].h === q.c.h) x.classList.add('right'); });
            fb.innerHTML = `❌ 정답은 <b>${esc(q.c.h)} ${esc(label(q.c))}</b> 이에요<small>💡 ${esc(q.c.m)}</small>`;
          }
          await sleep(good ? 650 : 2200);
          resolve(good);
        };
      });
      if (closed) return null;
      if (ok) { if (!retry.has(q.c.h)) right += 1; } else if (!retry.has(q.c.h)) { retry.add(q.c.h); queue.push({ ...q, options: shuffle(q.options) }); }
    }
    if (count) { totals.quizRight += right; totals.quizTotal += asked; }
    return right;
  }

  // ── 시작 ──
  const intro = () => new Promise((resolve) => {
    stepsEl.innerHTML = steps.map((s) => `<span>${s.dot}</span>`).join('');
    main.innerHTML = `
      <div class="hz-intro">
        <h2>${esc(title)}</h2>
        <div class="hz-chips">${chars.map((c) => `<div class="hz-chip"><b>${esc(c.h)}</b><small>${esc(label(c))}</small></div>`).join('')}</div>
        <ol class="hz-plan">
          ${review.length ? '<li>🔥 <b>몸풀기</b> 지난번에 배운 글자 퀴즈</li>' : ''}
          <li>👀 <b>보기</b> 획순 애니메이션과 외우는 요령</li>
          <li>✏️ <b>따라쓰기</b> → <b>혼자 쓰기</b> 손가락(펜)으로 획순대로!</li>
          ${quiz ? '<li>❓ <b>마무리 퀴즈</b></li>' : ''}
        </ol>
        <p class="hz-note">손이 불편하면 천천히, 틀려도 괜찮아요. 막히면 💡힌트를 눌러요.</p>
        <button class="btn btn-yellow big" id="hz-go">✏️ 시작해요</button>
      </div>`;
    main.querySelector('#hz-go').onclick = () => { sfx.go(); resolve(); };
  });

  // ── 끝 화면: 별점과 저장 ──
  async function finishView() {
    const avg = charStars.length ? charStars.reduce((a, b) => a + b, 0) / charStars.length : 2; // 1~3
    const quizPts = totals.quizTotal ? (totals.quizRight / totals.quizTotal) * 2 : 1; // 0~2
    const score = Math.min(5, Math.max(1, Math.round(avg + quizPts)));
    const result = { day, score, misses: totals.misses, charStars: charStars.slice(), quizRight: totals.quizRight, quizTotal: totals.quizTotal };
    sfx.success();
    confetti({ count: 140, y: 0.55, emojis: ['⭐', '📖', '✨', '🎉'] });
    main.innerHTML = `
      <div class="hz-done">
        <div class="hz-trophy">🎉</div>
        <h2>${esc(title)} 끝!</h2>
        <div class="hz-chips">${chars.map((c, i) => `<div class="hz-chip"><b>${esc(c.h)}</b><small>${esc(label(c))}</small><i>${stars3(charStars[i] || 1)}</i></div>`).join('')}</div>
        <div class="hz-score">${'★'.repeat(score)}<span>${'★'.repeat(5 - score)}</span></div>
        ${totals.quizTotal ? `<p>퀴즈 ${totals.quizRight} / ${totals.quizTotal} 정답 · 획 연습 ${totals.misses === 0 ? '실수 없이!' : `실수 ${totals.misses}번`}</p>` : ''}
        <p class="hz-save" id="hz-save">${save ? '기록을 저장하는 중<span class="dots"></span>' : ''}</p>
        <button class="btn btn-mint big" id="hz-fin" ${save ? 'disabled' : ''}>${esc(doneLabel)}</button>
      </div>`;
    const fin = main.querySelector('#hz-fin');
    const note = main.querySelector('#hz-save');
    let saved = null;
    const trySave = async () => {
      if (!save) return true;
      note.innerHTML = '기록을 저장하는 중<span class="dots"></span>';
      fin.disabled = true;
      try {
        saved = await save(result);
        note.textContent = '✅ 기록을 저장했어요';
        fin.disabled = false;
        return true;
      } catch (err) {
        note.innerHTML = `😢 ${esc(err.message || '저장하지 못했어요')} <button class="btn btn-white small" id="hz-retry">다시 저장</button>`;
        main.querySelector('#hz-retry').onclick = () => { sfx.tap(); trySave(); };
        return false;
      }
    };
    await trySave();
    fin.onclick = () => { sfx.tap(); closeAll({ done: true, result, saved }); };
  }

  // ── 순서대로 진행 ──
  (async () => {
    await intro();
    if (review.length) {
      const poolForReview = pool.filter((p) => !review.some((r) => r.h === p.h));
      await runQuiz({ id: 'review', heading: '🔥 몸풀기', sub: '지난번에 배운 글자, 기억나요?', questions: makeQuestions(review, [...review, ...poolForReview]), count: false });
      if (closed) return;
    }
    for (let i = 0; i < chars.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const r = await teachChar(chars[i], i, chars.length);
      if (closed || r === null) return;
    }
    if (quiz) {
      await runQuiz({ id: 'quiz', heading: '❓ 마무리 퀴즈', sub: '오늘 배운 글자예요', questions: makeQuestions(chars, [...chars, ...pool]) });
      if (closed) return;
    }
    await finishView();
  })().catch((err) => {
    console.warn('[hanja]', err);
    if (!closed) closeAll({ done: false, error: err.message });
  });

  return resultPromise;
}

// 마이페이지에서 글자 하나만 연습한다 (기록은 남기지 않는다)
export function openCharPractice({ course, char, confirm }) {
  return openLesson({
    course,
    title: `✏️ ${char.h} 연습`,
    chars: [char],
    review: [],
    quiz: false,
    day: 0,
    save: null,
    confirm,
    doneLabel: '👍 연습 끝!',
  });
}
