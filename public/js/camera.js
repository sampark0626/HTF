// 셀카 카메라: 숙제(종이 등)가 보이거나 2초가 지나면 3·2·1 카운트다운 뒤 자동 촬영.
// 결과: { dataUrl } | { noPhoto: true } | null(취소)
import { sfx } from './sfx.js';

// 물체 감지는 AI 가 아니라 가벼운 화면 비교다. 값을 바꾸면 민감도가 달라진다.
const CFG = {
  sampleW: 80,
  sampleH: 60,
  warmupMs: 500,        // 카메라 밝기가 안정될 때까지 기다린 뒤
  baselineFrames: 3,    // 이 장면을 "아무것도 안 든 모습"으로 기억한다
  pollMs: 120,
  fallbackMs: 2000,     // 이 시간 안에 물체가 안 보이면 그냥 촬영 준비
  brightMin: 135,       // 종이처럼 밝고
  satMax: 55,           // 색이 옅은 픽셀이
  newPaperRatio: 0.08,  // 처음보다 화면의 8% 이상 새로 나타나면 물체 등장
  bigChangeRatio: 0.5,  // 또는 화면의 절반 이상이 확 바뀌면 물체 등장
  lumDiff: 60,
  stableFrames: 3,      // 연속으로 확인되어야 인정
  countdown: 3,
  maxEdge: 1024,
  quality: 0.82,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COMMENTS = {
  ask: ['숙제를 보여주세요! 📄', '보여줄 숙제가 없으면 V ✌️ 해주세요'],
  found: ['숙제 발견! 👀', '그대로 가만히 있어요~'],
  none: ['숙제가 안 보이네요 🤔', '그럼 V ✌️ 하고 얼굴을 찍어요!'],
  review: ['잘 찍혔나 볼까요? 👀', '마음에 들면 클리어!'],
};

function readFrame(video, ctx) {
  const { sampleW: w, sampleH: h } = CFG;
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const n = w * h;
  const paper = new Uint8Array(n);
  const lum = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    paper[i] = mx > CFG.brightMin && mx - mn < CFG.satMax ? 1 : 0;
    lum[i] = (r * 0.3 + g * 0.59 + b * 0.11) | 0;
  }
  return { paper, lum };
}

function buildBaseline(frames) {
  const n = frames[0].paper.length;
  const paper = new Uint8Array(n);
  const lum = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (const f of frames) {
      if (f.paper[i]) paper[i] = 1;
      sum += f.lum[i];
    }
    lum[i] = (sum / frames.length) | 0;
  }
  return { paper, lum };
}

function objectAppeared(cur, base) {
  const n = cur.paper.length;
  let newPaper = 0;
  let changed = 0;
  for (let i = 0; i < n; i += 1) {
    if (cur.paper[i] && !base.paper[i]) newPaper += 1;
    if (Math.abs(cur.lum[i] - base.lum[i]) > CFG.lumDiff) changed += 1;
  }
  return newPaper / n >= CFG.newPaperRatio || changed / n >= CFG.bigChangeRatio;
}

function toJpeg(source, sw, sh) {
  const scale = Math.min(1, CFG.maxEdge / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height); // 거울 반전 없이 → 숙제 글씨가 바로 읽힌다
  return c.toDataURL('image/jpeg', CFG.quality);
}

export function openCamera({ title }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'cam';
    root.dataset.phase = 'start';
    root.innerHTML = `
      <div class="cam-top">
        <div class="cam-title">📚 ${esc(title)}</div>
        <button class="cam-close" data-act="close" aria-label="닫기">✕</button>
      </div>
      <div class="cam-stage">
        <video playsinline muted autoplay></video>
        <img class="cam-preview" alt="찍은 사진" hidden>
        <div class="cam-frame"><i></i><i></i><i></i><i></i></div>
        <div class="cam-count"></div>
        <div class="cam-comment"></div>
        <div class="cam-flash"></div>
        <div class="cam-fallback" hidden></div>
      </div>
      <div class="cam-bar"></div>`;
    document.body.appendChild(root);

    const q = (s) => root.querySelector(s);
    const video = q('video');
    const preview = q('.cam-preview');
    const countEl = q('.cam-count');
    const commentEl = q('.cam-comment');
    const flashEl = q('.cam-flash');
    const fb = q('.cam-fallback');
    const bar = q('.cam-bar');
    const sample = document.createElement('canvas');
    sample.width = CFG.sampleW;
    sample.height = CFG.sampleH;
    const sctx = sample.getContext('2d', { willReadFrequently: true });

    let stream = null;
    let phase = 'start';
    let closed = false;
    const timers = new Set();

    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
      return id;
    };
    const setPhase = (p) => { phase = p; root.dataset.phase = p; };
    const setComment = ([main, sub]) => {
      commentEl.innerHTML = `<span class="main">${esc(main)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}`;
    };
    const fileLabel = (text, cls) => `<label class="btn ${cls}">${text}<input type="file" accept="image/*" capture="user"></label>`;

    function cleanup() {
      timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
      timers.clear();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      document.removeEventListener('keydown', onKey);
    }

    function finish(result) {
      if (closed) return;
      closed = true;
      cleanup();
      root.classList.add('leaving');
      setTimeout(() => root.remove(), 260);
      resolve(result);
    }

    function onKey(e) {
      if (e.key === 'Escape') finish(null);
    }
    document.addEventListener('keydown', onKey);

    // ── 카메라가 안 될 때: 기본 카메라 앱으로 찍거나, 사진 없이 클리어 ──
    function fallback(message) {
      setPhase('fallback');
      video.hidden = true;
      fb.hidden = false;
      fb.innerHTML = `<div class="big-emoji">📷</div><p>${esc(message)}</p>${fileLabel('📸 사진 찍기', 'btn-blue')}`;
      commentEl.innerHTML = '';
      bar.innerHTML = '<button class="btn btn-white small" data-act="skip">사진 없이 클리어</button>';
    }

    // ── 촬영 후 확인 ──
    function review(dataUrl) {
      cleanupTimersOnly();
      setPhase('review');
      countEl.textContent = '';
      preview.src = dataUrl;
      preview.hidden = false;
      preview.dataset.url = dataUrl;
      fb.hidden = true;
      setComment(COMMENTS.review);
      bar.innerHTML = `
        ${stream ? '<button class="btn btn-white" data-act="retake">🔄 다시 찍기</button>' : fileLabel('🔄 다시 찍기', 'btn-white')}
        <button class="btn btn-mint big" data-act="submit">✅ 이 사진으로 클리어!</button>`;
    }

    function cleanupTimersOnly() {
      timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
      timers.clear();
    }

    function shoot() {
      sfx.shutter();
      flashEl.classList.remove('go');
      void flashEl.offsetWidth;
      flashEl.classList.add('go');
      review(toJpeg(video, video.videoWidth || 640, video.videoHeight || 480));
    }

    // ── 3·2·1 ──
    function startCount() {
      setPhase('count');
      let n = CFG.countdown;
      const step = () => {
        if (closed || phase !== 'count') return;
        if (n === 0) {
          countEl.textContent = '';
          shoot();
          return;
        }
        countEl.textContent = n;
        countEl.classList.remove('pop');
        void countEl.offsetWidth;
        countEl.classList.add('pop');
        sfx.count(n);
        n -= 1;
        later(step, 1000);
      };
      step();
    }

    // ── 숙제가 보이는지 지켜보기 ──
    function watch() {
      setPhase('watch');
      root.dataset.found = '0';
      preview.hidden = true;
      video.style.visibility = '';
      setComment(COMMENTS.ask);
      bar.innerHTML = '<button class="btn btn-white small" data-act="now">📸 지금 바로 찍기</button>';

      const t0 = performance.now();
      const frames = [];
      let baseline = null;
      let hits = 0;
      const timer = setInterval(() => {
        if (closed || phase !== 'watch') { clearInterval(timer); return; }
        const elapsed = performance.now() - t0;
        if (video.readyState >= 2 && elapsed >= CFG.warmupMs) {
          const cur = readFrame(video, sctx);
          if (!baseline) {
            frames.push(cur);
            if (frames.length >= CFG.baselineFrames) baseline = buildBaseline(frames);
          } else {
            hits = objectAppeared(cur, baseline) ? hits + 1 : 0;
            if (hits >= CFG.stableFrames) {
              clearInterval(timer);
              root.dataset.found = '1';
              setComment(COMMENTS.found);
              sfx.pop();
              bar.innerHTML = '';
              startCount();
              return;
            }
          }
        }
        if (elapsed >= CFG.fallbackMs) {
          clearInterval(timer);
          setComment(COMMENTS.none);
          bar.innerHTML = '';
          startCount();
        }
      }, CFG.pollMs);
      timers.add(timer);
    }

    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        fallback('이 화면에서는 카메라를 바로 켤 수 없어요. 대신 카메라 앱으로 찍어요!');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
      } catch (err) {
        fallback(err && err.name === 'NotAllowedError'
          ? '카메라를 쓸 수 있게 허락해 주세요. (주소창 옆 🔒 → 카메라 허용)'
          : '카메라를 켤 수 없어요. 대신 카메라 앱으로 찍어요!');
        return;
      }
      if (closed) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await new Promise((res) => {
        if (video.readyState >= 2) res();
        else video.onloadeddata = () => res();
      });
      await video.play().catch(() => {});
      if (!closed) watch();
    }

    // ── 버튼/파일 입력 ──
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      sfx.tap();
      const act = btn.dataset.act;
      if (act === 'close') finish(null);
      else if (act === 'skip') finish({ noPhoto: true });
      else if (act === 'submit') finish({ dataUrl: preview.dataset.url });
      else if (act === 'retake') watch();
      else if (act === 'now' && phase === 'watch') {
        cleanupTimersOnly();
        setComment(COMMENTS.none);
        bar.innerHTML = '';
        startCount();
      }
    });

    root.addEventListener('change', async (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files[0]) return;
      try {
        const bmp = await createImageBitmap(input.files[0]);
        review(toJpeg(bmp, bmp.width, bmp.height));
      } catch (_) {
        setComment(['사진을 읽지 못했어요 😢', '다시 찍어 볼까요?']);
      }
      input.value = '';
    });

    start();
  });
}
