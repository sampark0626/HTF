// 프로필 캐릭터: 친구(동물) + 배경색 + 꾸미기(모자·안경 등)를 번호 3개로 저장한다.
// 목록 길이는 server/avatar.js 의 LIMITS 와 같아야 한다 (12 / 8 / 10).
import { sfx } from './sfx.js';
import { sparkle } from './fx.js';

export const ANIMALS = ['🦊', '🐯', '🐼', '🐰', '🐻', '🐶', '🐱', '🐸', '🦁', '🐵', '🐧', '🦄'];
export const COLORS = ['#4f7cff', '#ff9f43', '#2ecc95', '#ff7eb6', '#9b7bff', '#ffc93c', '#ff6b6b', '#4dd0e1'];
export const ACCS = [
  { emoji: '', name: '없음', pos: 'none' },
  { emoji: '👑', name: '왕관', pos: 'top' },
  { emoji: '🎩', name: '모자', pos: 'top' },
  { emoji: '🧢', name: '야구모자', pos: 'top' },
  { emoji: '🎓', name: '졸업모자', pos: 'top' },
  { emoji: '🎧', name: '헤드폰', pos: 'top' },
  { emoji: '🕶️', name: '선글라스', pos: 'eyes' },
  { emoji: '🎀', name: '리본', pos: 'tr' },
  { emoji: '🌸', name: '꽃', pos: 'tl' },
  { emoji: '⭐', name: '별', pos: 'tr' },
];

const rnd = (n) => Math.floor(Math.random() * n);
const inRange = (v, len) => Number.isInteger(v) && v >= 0 && v < len;

export const defaultAvatar = (i = 0) => ({ animal: i % ANIMALS.length, color: i % COLORS.length, acc: 0 });
export const randomAvatar = () => ({ animal: rnd(ANIMALS.length), color: rnd(COLORS.length), acc: rnd(ACCS.length) });

function norm(av) {
  return {
    animal: inRange(av?.animal, ANIMALS.length) ? av.animal : 0,
    color: inRange(av?.color, COLORS.length) ? av.color : 0,
    acc: inRange(av?.acc, ACCS.length) ? av.acc : 0,
  };
}

// size: '' | 'sm' | 'xl' | 'xxl'
export function avatarHtml(av, { size = '', bob = false } = {}) {
  const a = norm(av);
  const acc = ACCS[a.acc];
  return `<span class="avatar ${size} ${bob ? 'bob' : ''}" style="--c:${COLORS[a.color]}"><span class="face">${ANIMALS[a.animal]}</span>${acc.emoji ? `<span class="acc pos-${acc.pos}">${acc.emoji}</span>` : ''}</span>`;
}

// 꾸미기 화면. get() 으로 현재 모습을 읽는다.
export function mountAvatarPicker(root, initial, onChange) {
  const av = norm(initial);
  root.innerHTML = `
    <div class="ap">
      <div class="ap-preview">
        <div class="ap-stage" id="ap-stage"></div>
        <button type="button" class="btn btn-white small" data-ap="random">🎲 랜덤으로 바꾸기</button>
      </div>
      <div class="ap-group"><h4>🐾 친구</h4>
        <div class="ap-grid">${ANIMALS.map((e, i) => `<button type="button" class="ap-opt" data-ap="animal" data-i="${i}" aria-label="친구 ${i + 1}">${e}</button>`).join('')}</div></div>
      <div class="ap-group"><h4>🎨 색깔</h4>
        <div class="ap-grid">${COLORS.map((c, i) => `<button type="button" class="ap-opt dot" data-ap="color" data-i="${i}" style="--c:${c}" aria-label="색깔 ${i + 1}"></button>`).join('')}</div></div>
      <div class="ap-group"><h4>✨ 꾸미기</h4>
        <div class="ap-grid">${ACCS.map((a, i) => `<button type="button" class="ap-opt" data-ap="acc" data-i="${i}" aria-label="${a.name}">${a.emoji || '🚫'}</button>`).join('')}</div></div>
    </div>`;
  const stage = root.querySelector('#ap-stage');

  function paint(jump) {
    stage.innerHTML = avatarHtml(av, { size: 'xxl' });
    root.querySelectorAll('.ap-opt').forEach((b) => {
      b.classList.toggle('on', av[b.dataset.ap] === Number(b.dataset.i));
    });
    if (jump) {
      stage.classList.remove('jump');
      void stage.offsetWidth;
      stage.classList.add('jump');
      sparkle(stage.firstElementChild, ['✨', '⭐']);
    }
    if (onChange) onChange({ ...av });
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ap]');
    if (!b) return;
    if (b.dataset.ap === 'random') {
      Object.assign(av, randomAvatar());
      sfx.pop();
    } else {
      av[b.dataset.ap] = Number(b.dataset.i);
      sfx.tap();
    }
    paint(true);
  });

  paint(false);
  return { get: () => ({ ...av }) };
}
