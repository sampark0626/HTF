// 칠판: 낙서 층 위에 "우리 반 약속"을 얹어서 3D 칠판 그림 한 장으로 만든다.
//  - 아이가 그린 낙서(펜·지우개·도장)는 따로 한 층에 쌓인다. 약속 판은 늘 맨 위에 있어서 지워지지 않는다.
//  - 낙서는 PNG 로 내보내고(toDataURL) 다시 불러올 수(load) 있다. 서버에 저장해서 다음에 와도, 부모님이 와도 보인다.
//  - 화면(3D 칠판에서 손가락 위치 → 그림 좌표)은 world.js 가 맡고, 이 파일은 그림 그리기만 한다.
const FONT = (px) => `700 ${px}px Jua, "Malgun Gothic", sans-serif`;

export const BOARD_W = 1280;
export const BOARD_H = 350;
export const PANEL_W = 360; // 오른쪽 구석의 "우리 반 약속" 판
export const INKS = ['#2f5fd0', '#e0483f', '#222831', '#2e9e5b', '#f2a900', '#d94fa0', '#8b5cf6'];
export const SIZES = [5, 11, 22];
export const STAMPS = ['⭐', '❤️', '🌼', '😊'];
const MAX_STROKES = 300; // 이보다 많이 쌓이면 지금 그림을 밑그림으로 굳힌다 (되돌리기는 그 뒤부터)

const rr = (g, x, y, w, h, r) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};
const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

// canvas: 3D 칠판에 붙는 그림판(BOARD_W × BOARD_H). rules: rules.js 의 약속들. onChange: 그림이 바뀔 때마다 (텍스처를 갱신)
export function createBoard({ canvas, rules, onChange }) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // 밑판: 하얀 칠판, 지우다 만 마커 자국, 머리글
  const base = mk(W, H);
  {
    const g = base.getContext('2d');
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#fdfdfb');
    gr.addColorStop(1, '#eef0ee');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120,130,140,.07)';
    for (let i = 0; i < 11; i += 1) g.fillRect(Math.random() * W, Math.random() * H, 160, 10);
    g.textAlign = 'left';
    g.fillStyle = '#2f5fd0';
    g.font = FONT(40);
    g.fillText('오늘도 수고했어요 ⭐', 28, 58);
  }

  // 오른쪽 구석의 "우리 반 약속": 말썽 친구를 타이를 때 힌트가 된다
  const panel = mk(PANEL_W, H);
  {
    const g = panel.getContext('2d');
    g.fillStyle = '#fff8d6';
    rr(g, 10, 10, PANEL_W - 20, H - 20, 26);
    g.fill();
    g.setLineDash([16, 10]);
    g.lineWidth = 6;
    g.strokeStyle = '#e0a800';
    g.stroke();
    g.setLineDash([]);
    g.textAlign = 'center';
    g.fillStyle = '#b25b00';
    g.font = FONT(40);
    g.fillText('🌟 우리 반 약속', PANEL_W / 2, 66);
    rules.forEach((r, i) => {
      const y = 128 + i * 64;
      g.textAlign = 'left';
      g.font = '38px sans-serif';
      g.fillText(r.icon, 32, y);
      g.fillStyle = '#2b2d42';
      let size = 30;
      g.font = FONT(size);
      while (g.measureText(r.board).width > PANEL_W - 110 && size > 18) { size -= 1; g.font = FONT(size); }
      g.fillText(r.board, 84, y - 2);
    });
  }

  // 낙서 층: 약속 판 아래로는 그려지지 않게 잘라 둔다
  const doodle = mk(W, H);
  const dctx = doodle.getContext('2d');
  dctx.lineCap = 'round';
  dctx.lineJoin = 'round';
  dctx.beginPath();
  dctx.rect(0, 0, W - PANEL_W, H);
  dctx.clip();

  let word = null; // 고마운 말 { icon, text }
  let baseImg = null; // 서버에서 받아 온 낙서 (처음 그림)
  let strokes = [];
  let cur = null;
  let dirty = false;

  function compose() {
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(doodle, 0, 0);
    if (!strokes.length && !baseImg && !cur) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(90,100,110,.5)';
      ctx.font = FONT(44);
      ctx.fillText('칠판 앞에서 마음껏 낙서해 봐요 🖍️', (W - PANEL_W) / 2, H / 2 + 14);
    }
    if (word) {
      const label = `${word.icon} ${word.text}`;
      ctx.font = FONT(54);
      const w = ctx.measureText(label).width + 56;
      const x = W - PANEL_W - 28 - w;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      rr(ctx, x, H - 106, w, 80, 40);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#e0483f';
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0483f';
      ctx.fillText(label, x + w / 2, H - 50);
    }
    ctx.drawImage(panel, W - PANEL_W, 0);
    if (onChange) onChange();
  }

  function style(s) {
    dctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    dctx.strokeStyle = s.color;
    dctx.fillStyle = s.color;
    dctx.lineWidth = s.tool === 'eraser' ? s.size * 2.2 : s.size;
  }
  const dot = (s, p) => {
    dctx.save();
    style(s);
    dctx.beginPath();
    dctx.arc(p.x, p.y, dctx.lineWidth / 2, 0, Math.PI * 2);
    dctx.fill();
    dctx.restore();
  };
  // a 에서 b 까지 부드러운 곡선 (c 는 조절점)
  const seg = (s, a, c, b) => {
    dctx.save();
    style(s);
    dctx.beginPath();
    dctx.moveTo(a.x, a.y);
    dctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    dctx.stroke();
    dctx.restore();
  };
  function paint(s) {
    if (s.tool === 'clear') { dctx.clearRect(0, 0, W, H); return; }
    if (s.tool === 'stamp') {
      dctx.save();
      dctx.globalCompositeOperation = 'source-over';
      dctx.font = `${s.size * 7}px sans-serif`;
      dctx.textAlign = 'center';
      dctx.textBaseline = 'middle';
      dctx.fillText(s.emoji, s.x, s.y);
      dctx.restore();
      return;
    }
    const p = s.pts;
    if (p.length === 1) { dot(s, p[0]); return; }
    let a = p[0];
    for (let i = 1; i < p.length; i += 1) {
      const b = mid(p[i - 1], p[i]);
      seg(s, a, p[i - 1], b);
      a = b;
    }
    seg(s, a, p[p.length - 1], p[p.length - 1]);
  }
  function redraw() {
    dctx.save();
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    if (baseImg) dctx.drawImage(baseImg, 0, 0);
    dctx.restore();
    for (const s of strokes) paint(s);
  }
  function bake() {
    const c = mk(W, H);
    c.getContext('2d').drawImage(doodle, 0, 0);
    baseImg = c;
    strokes = [];
  }
  function push(s) {
    strokes.push(s);
    dirty = true;
    if (strokes.length > MAX_STROKES) bake();
  }

  return {
    W, H,
    compose,
    // 펜·지우개는 begin → move … → end, 도장은 begin 한 번 (tool: 'pen' | 'eraser' | 'stamp')
    begin(x, y, { tool = 'pen', color = INKS[0], size = SIZES[1], emoji = '' } = {}) {
      if (tool === 'stamp') {
        const s = { tool, emoji, size, x, y, color };
        paint(s);
        push(s);
        compose();
        return;
      }
      cur = { tool, color, size, pts: [{ x, y }], a: { x, y } };
      dot(cur, cur.pts[0]);
      compose();
    },
    move(x, y) {
      if (!cur) return;
      const p = { x, y };
      const last = cur.pts[cur.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
      cur.pts.push(p);
      const b = mid(last, p);
      seg(cur, cur.a, last, b);
      cur.a = b;
      compose();
    },
    end() {
      if (!cur) return;
      const last = cur.pts[cur.pts.length - 1];
      if (cur.pts.length > 1) seg(cur, cur.a, last, last);
      const s = { tool: cur.tool, color: cur.color, size: cur.size, pts: cur.pts };
      cur = null;
      push(s);
      compose();
    },
    undo() {
      if (!strokes.length) return false;
      strokes.pop();
      redraw();
      compose();
      return true;
    },
    clear() {
      push({ tool: 'clear' });
      dctx.clearRect(0, 0, W, H);
      compose();
    },
    canUndo: () => strokes.length > 0,
    // 서버에서 받아 온 낙서 그림(이미지)을 처음 그림으로 깐다
    load(img) {
      baseImg = img;
      strokes = [];
      cur = null;
      dirty = false;
      redraw();
      compose();
    },
    setWord(w) { word = w; compose(); },
    toDataURL: () => doodle.toDataURL('image/png'),
    isDirty: () => dirty,
    markSaved() { dirty = false; },
  };
}
