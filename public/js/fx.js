// 시각 효과: 색종이(canvas) + 별 반짝이(DOM)
const COLORS = ['#ff6b6b', '#ffc93c', '#2ecc95', '#4f7cff', '#9b7bff', '#ff9f43', '#ff7eb6'];
const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas = null;
let ctx2d = null;
let particles = [];
let running = false;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  ctx2d = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loop() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx2d.clearRect(0, 0, w, h);
  particles = particles.filter((p) => p.y < h + 40 && p.life > 0);
  for (const p of particles) {
    p.vy += 0.32;
    p.vx *= 0.992;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 1;
    ctx2d.save();
    ctx2d.translate(p.x, p.y);
    ctx2d.rotate(p.rot);
    ctx2d.globalAlpha = Math.min(1, p.life / 30);
    if (p.emoji) {
      ctx2d.font = `${p.size * 2}px serif`;
      ctx2d.textAlign = 'center';
      ctx2d.fillText(p.emoji, 0, 0);
    } else {
      ctx2d.fillStyle = p.color;
      if (p.round) {
        ctx2d.beginPath();
        ctx2d.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx2d.fill();
      } else {
        ctx2d.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
    }
    ctx2d.restore();
  }
  if (particles.length) {
    requestAnimationFrame(loop);
  } else {
    running = false;
    ctx2d.clearRect(0, 0, w, h);
  }
}

// confetti({ count, x, y, power, emojis })  x,y 는 0~1 (화면 비율)
export function confetti({ count = 140, x = 0.5, y = 0.4, power = 1, emojis = null } = {}) {
  const n = reduce() ? Math.min(count, 24) : count;
  ensureCanvas();
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < n; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = (6 + Math.random() * 11) * power;
    particles.push({
      x: x * w, y: y * h,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: 8 + Math.random() * 9,
      rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      round: Math.random() < 0.3,
      emoji: emojis && Math.random() < 0.35 ? emojis[(Math.random() * emojis.length) | 0] : null,
      life: 110 + Math.random() * 70,
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
}

// 양쪽 아래에서 터지는 큰 축하
export function celebrate(emojis = ['⭐', '🎉', '✨']) {
  confetti({ count: 120, x: 0.15, y: 0.9, power: 1.5, emojis });
  confetti({ count: 120, x: 0.85, y: 0.9, power: 1.5, emojis });
  setTimeout(() => confetti({ count: 140, x: 0.5, y: 0.45, power: 1.2, emojis }), 350);
}

// 엘리먼트 중심에서 별이 퍼지는 효과
export function sparkle(el, glyphs = ['⭐', '✨', '💫']) {
  if (reduce() || !el) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 12; i += 1) {
    const s = document.createElement('span');
    const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 70;
    s.className = 'spark';
    s.textContent = glyphs[i % glyphs.length];
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
    s.style.setProperty('--rot', `${(Math.random() - 0.5) * 240}deg`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }
}
