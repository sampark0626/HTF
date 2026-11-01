// 부모님용: 마음 쉼터 교실의 친구·선생님을 만들고 고치는 편집 창 (3D 미리보기를 보면서)
import { sfx } from './sfx.js';
import { PLAYER_LOOK } from './world-shared.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SKIN = ['#ffe5d0', '#ffdcc0', '#f4c7a1', '#e0a97c', '#b97a4f', '#7a4a30'];
export const HAIR = ['#2a2018', '#4a2f22', '#7a4b2a', '#b5793f', '#e0b25a', '#f2d98b', '#1f1f2e', '#8a8a95', '#e6e6ee', '#c0392b', '#7a4bd0', '#2b8a8a'];
export const TOP = ['#ffd23f', '#ff8a8a', '#ff9ec7', '#c7a6ff', '#7ec8ff', '#8fd3d9', '#a6e3a1', '#ffc38a', '#f2a7c4', '#6c8ebf', '#ffffff', '#3b3f58'];
export const BOTTOM = ['#1f2030', '#2b2d42', '#3b3f58', '#6c757d', '#8d6e63', '#4a6fa5', '#7b9e87', '#c97b84', '#ffffff'];
export const HAIR_STYLES = [
  ['short', '짧은 머리'], ['long', '긴 머리'], ['bob', '단발'], ['pony', '묶은 머리'], ['twin', '양갈래'], ['bun', '올림머리'],
];

// 아이가 자기 교실 캐릭터를 꾸민다: 머리 모양·머리색·피부색·옷 색·바지/치마·안경 (3D 미리보기가 천천히 돈다).
// onSave(look) 는 async (실패하면 throw). 저장하면 true, 취소하면 false.
export async function openLookEditor({ look, name = '', onSave }) {
  const draft = { ...PLAYER_LOOK, ...JSON.parse(JSON.stringify(look || {})) };
  const { mountCharacterPreview } = await import('./world.js');
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay npc-ov';
    ov.innerHTML = `
      <div class="card npc-editor" role="dialog" aria-modal="true" aria-label="내 교실 캐릭터 꾸미기">
        <div class="ne-head"><h3>🧑‍🎨 내 교실 캐릭터 꾸미기</h3><button class="icon-btn" id="ne-x" aria-label="닫기">✕</button></div>
        <div class="ne-body">
          <div class="ne-left"><div class="ne-preview" id="ne-prev"></div><small>천천히 돌아요. 누르면 바로 바뀌어요.</small></div>
          <form class="ne-form" id="ne-form" autocomplete="off" novalidate></form>
        </div>
        <p class="err" id="ne-err" aria-live="polite"></p>
        <div class="ne-actions">
          <button class="btn btn-white" id="ne-cancel" type="button">취소</button>
          <button class="btn btn-white" id="ne-reset" type="button">↩️ 처음 모습</button>
          <button class="btn btn-blue" id="ne-save" type="button">💾 저장하기</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const q = (s) => ov.querySelector(s);
    let preview = null;
    let closed = false;
    const render = () => {
      q('#ne-form').innerHTML = `
        <div class="field"><span class="lbl">머리 모양</span>
          <div class="seg wrap" data-key="hairStyle">${HAIR_STYLES.map(([v, l]) => `<button type="button" class="${draft.hairStyle === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="field"><span class="lbl">머리 색</span>${swatches('hair', HAIR, draft.hair)}</div>
        <div class="field"><span class="lbl">피부 색</span>${swatches('skin', SKIN, draft.skin)}</div>
        <div class="field"><span class="lbl">윗옷 색</span>${swatches('top', TOP, draft.top)}</div>
        <div class="field"><span class="lbl">아래옷</span>
          <div class="seg" data-key="bottomStyle">
            <button type="button" class="${draft.bottomStyle === 'pants' ? 'on' : ''}" data-v="pants">바지</button>
            <button type="button" class="${draft.bottomStyle === 'skirt' ? 'on' : ''}" data-v="skirt">치마</button>
          </div>${swatches('bottom', BOTTOM, draft.bottom)}</div>
        <div class="field"><span class="lbl">안경</span>
          <div class="seg" data-key="glasses">
            <button type="button" class="${!draft.glasses ? 'on' : ''}" data-v="0">없음</button>
            <button type="button" class="${draft.glasses ? 'on' : ''}" data-v="1">👓 안경 쓰기</button>
          </div></div>`;
    };
    const sync = () => preview && preview.set(draft, 'kid', name);
    const close = (saved) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      if (preview) preview.dispose();
      ov.remove();
      resolve(saved);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    const form = q('#ne-form');
    form.addEventListener('input', (e) => {
      if (e.target.type !== 'color') return;
      const key = e.target.closest('.sw-row').dataset.key;
      draft[key] = e.target.value;
      e.target.closest('.sw').style.setProperty('--c', e.target.value);
      sync();
    });
    form.addEventListener('change', (e) => { if (e.target.type === 'color') { render(); sync(); } });
    form.addEventListener('click', (e) => {
      const sw = e.target.closest('.sw[data-color]');
      const segBtn = e.target.closest('.seg button');
      if (sw) draft[sw.closest('.sw-row').dataset.key] = sw.dataset.color;
      else if (segBtn) {
        const key = segBtn.closest('.seg').dataset.key;
        if (key === 'glasses') draft.glasses = segBtn.dataset.v === '1';
        else draft[key] = segBtn.dataset.v;
      } else return;
      sfx.tap();
      render();
      sync();
    });
    q('#ne-x').onclick = () => close(false);
    q('#ne-cancel').onclick = () => close(false);
    q('#ne-reset').onclick = () => { Object.assign(draft, PLAYER_LOOK); sfx.pop(); render(); sync(); };
    q('#ne-save').onclick = async () => {
      const btn = q('#ne-save');
      btn.disabled = true;
      try {
        await onSave({ ...draft });
        sfx.success();
        close(true);
      } catch (e) {
        q('#ne-err').textContent = e.message || '저장하지 못했어요';
        sfx.error();
        btn.disabled = false;
      }
    };
    render();
    mountCharacterPreview(q('#ne-prev'), draft, 'kid', name).then((p) => {
      if (closed) { p.dispose(); return; }
      preview = p;
      ov.__preview = p;
    });
    ov.__draft = draft;
  });
}

export const newNpc = (role) => (role === 'teacher'
  ? { role, name: '', msg: '', look: { skin: '#ffdcc0', hair: '#2a2018', hairStyle: 'bun', top: '#f2a7c4', bottom: '#3b3f58', bottomStyle: 'skirt', glasses: false } }
  : { role, name: '', msg: '', look: { skin: '#ffdcc0', hair: '#2a2018', hairStyle: 'short', top: '#7ec8ff', bottom: '#1f2030', bottomStyle: 'pants', glasses: false } });

const swatches = (key, palette, value) => `
  <div class="sw-row" data-key="${key}">
    ${palette.map((c) => `<button type="button" class="sw ${c === value ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}
    <label class="sw custom ${palette.includes(value) ? '' : 'on'}" title="직접 고르기" style="--c:${value}">
      <input type="color" value="${value}" aria-label="직접 고르기">🎨
    </label>
  </div>`;

// initial: { id?, role, name, msg, look }  /  onSave(draft) → Promise (실패하면 throw)
// 저장하면 true, 취소하면 false
export async function openNpcEditor({ initial, kidName, onSave }) {
  const draft = JSON.parse(JSON.stringify(initial));
  const editing = Boolean(initial.id);
  const { mountCharacterPreview } = await import('./world.js');

  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay npc-ov';
    ov.innerHTML = `
      <div class="card npc-editor" role="dialog" aria-modal="true" aria-label="교실 친구·선생님 꾸미기">
        <div class="ne-head">
          <h3 id="ne-title"></h3>
          <button class="icon-btn" id="ne-x" aria-label="닫기">✕</button>
        </div>
        <div class="ne-body">
          <div class="ne-left">
            <div class="ne-preview" id="ne-prev"></div>
            <small>천천히 돌아요. 바로 아래에서 고르면 바로 바뀌어요.</small>
          </div>
          <form class="ne-form" id="ne-form" autocomplete="off" novalidate></form>
        </div>
        <p class="err" id="ne-err" aria-live="polite"></p>
        <div class="ne-actions">
          <button class="btn btn-white" id="ne-cancel" type="button">취소</button>
          <button class="btn btn-blue" id="ne-save" type="button">💾 저장하기</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const q = (s) => ov.querySelector(s);
    let preview = null;
    let closed = false;

    const render = () => {
      q('#ne-title').textContent = `${editing ? '고치기' : '새로 만들기'} · ${draft.role === 'teacher' ? '🧑‍🏫 선생님' : '🧒 친구'} (${kidName}의 교실)`;
      q('#ne-form').innerHTML = `
        <div class="field"><label for="ne-name">이름</label>
          <input id="ne-name" maxlength="24" placeholder="${draft.role === 'teacher' ? '예) 김은지 선생님' : '예) 하늘'}" value="${esc(draft.name)}"></div>
        <div class="field"><span class="lbl">역할</span>
          <div class="seg" data-key="role">
            <button type="button" class="${draft.role === 'friend' ? 'on' : ''}" data-v="friend">🧒 친구</button>
            <button type="button" class="${draft.role === 'teacher' ? 'on' : ''}" data-v="teacher">🧑‍🏫 선생님</button>
          </div></div>
        <div class="field"><label for="ne-msg">아이를 만나면 하는 말</label>
          <input id="ne-msg" maxlength="80" placeholder="예) 오늘도 정말 수고했어요 😊" value="${esc(draft.msg)}">
          <small class="hint">{이름} 이라고 쓰면 아이 이름으로 바뀌어요</small></div>
        <div class="field"><span class="lbl">머리 모양</span>
          <div class="seg wrap" data-key="hairStyle">${HAIR_STYLES.map(([v, l]) => `<button type="button" class="${draft.look.hairStyle === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="field"><span class="lbl">머리 색</span>${swatches('hair', HAIR, draft.look.hair)}</div>
        <div class="field"><span class="lbl">피부 색</span>${swatches('skin', SKIN, draft.look.skin)}</div>
        <div class="field"><span class="lbl">상의 색</span>${swatches('top', TOP, draft.look.top)}</div>
        <div class="field"><span class="lbl">하의</span>
          <div class="seg" data-key="bottomStyle">
            <button type="button" class="${draft.look.bottomStyle === 'pants' ? 'on' : ''}" data-v="pants">바지</button>
            <button type="button" class="${draft.look.bottomStyle === 'skirt' ? 'on' : ''}" data-v="skirt">치마</button>
          </div>${swatches('bottom', BOTTOM, draft.look.bottom)}</div>
        <div class="field"><span class="lbl">안경</span>
          <div class="seg" data-key="glasses">
            <button type="button" class="${!draft.look.glasses ? 'on' : ''}" data-v="0">없음</button>
            <button type="button" class="${draft.look.glasses ? 'on' : ''}" data-v="1">👓 안경 쓰기</button>
          </div></div>`;
    };
    const syncPreview = () => preview && preview.set(draft.look, draft.role, draft.name || (draft.role === 'teacher' ? '선생님' : '친구'));

    const close = (saved) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      if (preview) preview.dispose();
      ov.remove();
      resolve(saved);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);

    const form = q('#ne-form');
    // 이름·말은 글자를 칠 때마다, 모양·색은 누를 때마다 미리보기에 반영
    form.addEventListener('input', (e) => {
      if (e.target.id === 'ne-name') { draft.name = e.target.value; syncPreview(); }
      else if (e.target.id === 'ne-msg') draft.msg = e.target.value;
      else if (e.target.type === 'color') {
        const key = e.target.closest('.sw-row').dataset.key;
        draft.look[key] = e.target.value;
        e.target.closest('.sw').style.setProperty('--c', e.target.value);
        syncPreview();
      }
    });
    form.addEventListener('change', (e) => {
      if (e.target.type === 'color') { render(); syncPreview(); }
    });
    form.addEventListener('click', (e) => {
      const sw = e.target.closest('.sw[data-color]');
      const segBtn = e.target.closest('.seg button');
      if (sw) {
        draft.look[sw.closest('.sw-row').dataset.key] = sw.dataset.color;
      } else if (segBtn) {
        const key = segBtn.closest('.seg').dataset.key;
        const v = segBtn.dataset.v;
        if (key === 'role') {
          draft.role = v;
        } else if (key === 'glasses') draft.look.glasses = v === '1';
        else draft.look[key] = v;
      } else return;
      sfx.tap();
      const keep = { name: draft.name, msg: draft.msg };
      render();
      q('#ne-name').value = keep.name;
      q('#ne-msg').value = keep.msg;
      syncPreview();
    });

    q('#ne-x').onclick = () => close(false);
    q('#ne-cancel').onclick = () => close(false);
    q('#ne-save').onclick = async () => {
      const err = q('#ne-err');
      draft.name = q('#ne-name').value.trim();
      draft.msg = q('#ne-msg').value.trim();
      if (!draft.name) { err.textContent = '이름을 적어 주세요'; q('#ne-name').focus(); sfx.error(); return; }
      const btn = q('#ne-save');
      btn.disabled = true;
      try {
        await onSave(draft);
        sfx.success();
        close(true);
      } catch (e) {
        err.textContent = e.message || '저장하지 못했어요';
        sfx.error();
        btn.disabled = false;
      }
    };

    render();
    mountCharacterPreview(q('#ne-prev'), draft.look, draft.role, draft.name || '').then((p) => {
      if (closed) { p.dispose(); return; }
      preview = p;
      ov.__preview = p; // 점검용
    });
    ov.__draft = draft; // 점검용
  });
}
