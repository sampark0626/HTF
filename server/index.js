'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { open } = require('./db');
const auth = require('./auth');
const ai = require('./ai');
const avatars = require('./avatar');

const PORT = process.env.PORT || 3000;
const KIDS = (process.env.KIDS || '박준선,박준혁').split(',').map((s) => s.trim()).filter(Boolean);
const ADMIN_CODE = process.env.ADMIN_CODE || '';
const ADMIN_TTL_MS = 30 * 60 * 1000;
const kidIndex = (name) => Math.max(0, KIDS.indexOf(name));
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_PENDING = 30;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const uid = () => crypto.randomUUID();

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validBirth(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const year = Number(v.slice(0, 4));
  return year >= 2000 && d.getTime() < Date.now();
}

const publicUser = (u) => ({
  name: u.name,
  birth: u.birth,
  school: u.school,
  className: u.class_name,
  timerMin: u.timer_min,
  avatar: avatars.parseAvatar(u.avatar, kidIndex(u.name)),
});

const publicItem = (h) => ({
  id: h.id,
  title: h.title,
  status: h.status,
  carryCount: h.carry_count,
  createdAt: h.created_at,
  doneAt: h.done_at,
  photoId: h.photo_id,
  shown: h.shown,
  verdict: h.verdict,
  score: h.score,
  aiComment: h.ai_comment,
  aiNote: h.ai_note,
  aiStatus: h.ai_status,
  byParent: h.added_by === 'parent',
});

const publicSession = (s) => (s ? {
  id: s.id,
  startedAt: s.started_at,
  durationSec: s.duration_sec,
  endsAt: s.started_at + s.duration_sec * 1000,
} : null);

async function main() {
  const db = await open();
  const secret = await auth.loadSecret(db);
  if (!db.persistent) {
    console.warn('\n⚠️  DATABASE_URL 이 없어 임시 저장소(PGlite)를 사용합니다. 서버가 재시작되면 기록이 사라질 수 있어요.\n');
  }
  if (!ai.isEnabled()) {
    console.warn('⚠️  GEMINI_API_KEY 가 없어 AI 판독 없이 동작합니다 (사진은 저장됩니다).');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '6mb' }));
  app.use((req, res, next) => {
    req.body ??= {}; // Express 5: 본문이 없으면 undefined
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Permissions-Policy', 'camera=(self), microphone=()');
    next();
  });

  // ───────── 공개 API ─────────
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.get('/api/config', async (req, res) => {
    const rows = await db.query('SELECT name, avatar, pin_hash FROM users');
    const byName = new Map(rows.map((r) => [r.name, r]));
    res.json({
      kids: KIDS.map((name, i) => {
        const u = byName.get(name);
        return {
          name,
          registered: Boolean(u),
          needsPin: Boolean(u) && !u.pin_hash, // 부모님이 비밀번호를 초기화한 상태
          avatar: u ? avatars.parseAvatar(u.avatar, i) : avatars.defaultAvatar(i),
        };
      }),
      persistent: db.persistent,
      aiEnabled: ai.isEnabled(),
      adminEnabled: Boolean(ADMIN_CODE),
    });
  });

  app.post('/api/register', async (req, res) => {
    const name = str(req.body.name, 20);
    const birth = str(req.body.birth, 10);
    const school = str(req.body.school, 40);
    const className = str(req.body.className, 30);
    const pin = str(req.body.pin, 4);
    if (!KIDS.includes(name)) throw new HttpError(400, '등록된 이름이 아니에요');
    if (!validBirth(birth)) throw new HttpError(400, '생년월일을 다시 확인해 주세요');
    if (!school) throw new HttpError(400, '학교 이름을 적어 주세요');
    if (!className) throw new HttpError(400, '학년/반을 적어 주세요');
    if (!/^\d{4}$/.test(pin)) throw new HttpError(400, '비밀번호는 숫자 4자리예요');
    const avatar = avatars.sanitizeAvatar(req.body.avatar) || avatars.defaultAvatar(kidIndex(name));
    const exists = await db.query('SELECT id FROM users WHERE name = $1', [name]);
    if (exists.length) throw new HttpError(409, '이미 등록된 친구예요. 비밀번호로 들어와 주세요');
    const now = Date.now();
    const id = uid();
    await db.query(
      `INSERT INTO users (id, name, birth, school, class_name, pin_hash, avatar, timer_min, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 40, $8, $8)`,
      [id, name, birth, school, className, auth.hashPin(pin), JSON.stringify(avatar), now]
    );
    const [user] = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    res.json({ token: auth.issueToken(id, secret), user: publicUser(user) });
  });

  app.post('/api/login', async (req, res) => {
    const name = str(req.body.name, 20);
    const pin = str(req.body.pin, 4);
    if (!KIDS.includes(name)) throw new HttpError(400, '등록된 이름이 아니에요');
    const wait = auth.lockedFor(name);
    if (wait) throw new HttpError(429, `잠깐 쉬었다 다시 해요 (${wait}초 후)`);
    const [user] = await db.query('SELECT * FROM users WHERE name = $1', [name]);
    if (!user) throw new HttpError(404, '아직 등록 전이에요');
    if (!user.pin_hash) throw new HttpError(409, '새 비밀번호를 먼저 정해 주세요');
    if (!/^\d{4}$/.test(pin) || !auth.verifyPin(pin, user.pin_hash)) {
      auth.recordFail(name);
      throw new HttpError(401, '비밀번호가 달라요');
    }
    auth.clearFails(name);
    res.json({ token: auth.issueToken(user.id, secret), user: publicUser(user) });
  });

  // 부모님이 비밀번호를 초기화한 친구만, 새 비밀번호를 직접 정할 수 있다
  app.post('/api/set-pin', async (req, res) => {
    const name = str(req.body.name, 20);
    const pin = str(req.body.pin, 4);
    if (!KIDS.includes(name)) throw new HttpError(400, '등록된 이름이 아니에요');
    if (!/^\d{4}$/.test(pin)) throw new HttpError(400, '비밀번호는 숫자 4자리예요');
    const [user] = await db.query('SELECT * FROM users WHERE name = $1', [name]);
    if (!user || user.pin_hash) throw new HttpError(409, '지금은 비밀번호를 새로 정할 수 없어요');
    // 동시에 두 번 눌려도 한 번만 반영되게 조건을 건다
    const done = await db.query(
      "UPDATE users SET pin_hash = $1, updated_at = $2 WHERE id = $3 AND pin_hash = '' RETURNING id",
      [auth.hashPin(pin), Date.now(), user.id]
    );
    if (!done.length) throw new HttpError(409, '지금은 비밀번호를 새로 정할 수 없어요');
    const [fresh] = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
    res.json({ token: auth.issueToken(fresh.id, secret), user: publicUser(fresh) });
  });

  // ───────── 로그인 필요 API ─────────
  const api = express.Router();
  api.use(async (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    const userId = m && auth.readToken(m[1], secret);
    if (!userId) throw new HttpError(401, '다시 로그인해 주세요');
    const [user] = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) throw new HttpError(401, '다시 로그인해 주세요');
    req.user = user;
    next();
  });

  api.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));

  api.put('/me', async (req, res) => {
    const u = req.user;
    const b = req.body;
    const birth = b.birth === undefined ? u.birth : str(b.birth, 10);
    const school = b.school === undefined ? u.school : str(b.school, 40);
    const className = b.className === undefined ? u.class_name : str(b.className, 30);
    let timerMin = u.timer_min;
    if (b.timerMin !== undefined) {
      timerMin = Math.round(Number(b.timerMin));
      if (!(timerMin >= 1 && timerMin <= 120)) throw new HttpError(400, '타이머는 1~120분 사이로 정해요');
    }
    if (!validBirth(birth)) throw new HttpError(400, '생년월일을 다시 확인해 주세요');
    if (!school) throw new HttpError(400, '학교 이름을 적어 주세요');
    if (!className) throw new HttpError(400, '학년/반을 적어 주세요');
    let avatarJson = u.avatar;
    if (b.avatar !== undefined) {
      const a = avatars.sanitizeAvatar(b.avatar);
      if (!a) throw new HttpError(400, '캐릭터를 다시 골라 주세요');
      avatarJson = JSON.stringify(a);
    }
    let pinHash = u.pin_hash;
    if (b.newPin !== undefined) {
      if (!/^\d{4}$/.test(String(b.newPin))) throw new HttpError(400, '새 비밀번호는 숫자 4자리예요');
      if (!auth.verifyPin(String(b.currentPin || ''), u.pin_hash)) throw new HttpError(401, '지금 비밀번호가 달라요');
      pinHash = auth.hashPin(String(b.newPin));
    }
    await db.query(
      `UPDATE users SET birth = $1, school = $2, class_name = $3, timer_min = $4, pin_hash = $5, avatar = $6, updated_at = $7
       WHERE id = $8`,
      [birth, school, className, timerMin, pinHash, avatarJson, Date.now(), u.id]
    );
    const [fresh] = await db.query('SELECT * FROM users WHERE id = $1', [u.id]);
    res.json({ user: publicUser(fresh) });
  });

  // 진행 중인 HTF (끝났으면 닫고 남은 숙제는 다음 HTF 로 넘긴다)
  async function endSession(userId, sessionId) {
    await db.query('UPDATE sessions SET ended_at = $1 WHERE id = $2 AND ended_at IS NULL', [Date.now(), sessionId]);
    await db.query(
      "UPDATE homework SET carry_count = carry_count + 1 WHERE user_id = $1 AND status = 'pending'",
      [userId]
    );
  }

  async function openSession(userId) {
    const [s] = await db.query(
      'SELECT * FROM sessions WHERE user_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
      [userId]
    );
    return s || null;
  }

  async function listItems(userId, sessionId) {
    return db.query(
      `SELECT * FROM homework
       WHERE user_id = $1 AND (status = 'pending' OR done_session = $2)
       ORDER BY created_at ASC`,
      [userId, sessionId || '']
    );
  }

  api.get('/htf', async (req, res) => {
    let session = await openSession(req.user.id);
    if (session && session.started_at + session.duration_sec * 1000 <= Date.now()) {
      await endSession(req.user.id, session.id);
      session = null;
    }
    const items = await listItems(req.user.id, session && session.id);
    res.json({ now: Date.now(), session: publicSession(session), items: items.map(publicItem) });
  });

  api.post('/htf/start', async (req, res) => {
    const durationSec = Math.round(Number(req.body.durationSec));
    if (!(durationSec >= 10 && durationSec <= 7200)) throw new HttpError(400, '시간 설정이 올바르지 않아요');
    const pending = await db.query("SELECT id FROM homework WHERE user_id = $1 AND status = 'pending' LIMIT 1", [req.user.id]);
    if (!pending.length) throw new HttpError(400, '오늘의 Homework 를 먼저 적어 주세요');
    const old = await openSession(req.user.id);
    if (old) await db.query('UPDATE sessions SET ended_at = $1 WHERE id = $2', [Date.now(), old.id]);
    const id = uid();
    const startedAt = Date.now();
    await db.query(
      'INSERT INTO sessions (id, user_id, started_at, duration_sec) VALUES ($1, $2, $3, $4)',
      [id, req.user.id, startedAt, durationSec]
    );
    const [session] = await db.query('SELECT * FROM sessions WHERE id = $1', [id]);
    const items = await listItems(req.user.id, id);
    res.json({ now: Date.now(), session: publicSession(session), items: items.map(publicItem) });
  });

  api.post('/htf/end', async (req, res) => {
    const session = await openSession(req.user.id);
    let cleared = 0;
    if (session) {
      await endSession(req.user.id, session.id);
      const [c] = await db.query('SELECT COUNT(*) AS n FROM homework WHERE done_session = $1', [session.id]);
      cleared = Number(c.n);
    }
    const left = await db.query("SELECT * FROM homework WHERE user_id = $1 AND status = 'pending' ORDER BY created_at ASC", [req.user.id]);
    res.json({ cleared, remaining: left.map(publicItem) });
  });

  // ───────── 숙제 ─────────
  async function findOwned(userId, id) {
    const [h] = await db.query('SELECT * FROM homework WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!h) throw new HttpError(404, '숙제를 찾을 수 없어요');
    return h;
  }
  const ownedItem = (req) => findOwned(req.user.id, req.params.id);

  // 숙제 추가·수정·삭제는 아이 화면과 부모님 메뉴가 같은 규칙을 쓴다
  function cleanTitle(value) {
    const title = str(value, 60);
    if (!title) throw new HttpError(400, '숙제 이름을 적어 주세요');
    return title;
  }

  async function createHomework(userId, rawTitle, addedBy = null) {
    const title = cleanTitle(rawTitle);
    const [c] = await db.query("SELECT COUNT(*) AS n FROM homework WHERE user_id = $1 AND status = 'pending'", [userId]);
    if (Number(c.n) >= MAX_PENDING) throw new HttpError(400, `숙제는 ${MAX_PENDING}개까지만 적을 수 있어요`);
    const id = uid();
    await db.query(
      'INSERT INTO homework (id, user_id, title, created_at, added_by) VALUES ($1, $2, $3, $4, $5)',
      [id, userId, title, Date.now(), addedBy]
    );
    const [h] = await db.query('SELECT * FROM homework WHERE id = $1', [id]);
    return h;
  }

  async function renameHomework(userId, id, rawTitle) {
    const h = await findOwned(userId, id);
    if (h.status !== 'pending') throw new HttpError(400, '이미 끝낸 숙제는 바꿀 수 없어요');
    const title = cleanTitle(rawTitle);
    await db.query('UPDATE homework SET title = $1 WHERE id = $2', [title, h.id]);
    return { ...h, title };
  }

  async function removeHomework(userId, id) {
    const h = await findOwned(userId, id);
    if (h.status !== 'pending') throw new HttpError(400, '이미 끝낸 숙제는 지울 수 없어요');
    await db.query('DELETE FROM homework WHERE id = $1', [h.id]);
  }

  // 자주 하는 숙제: 같은 이름(공백·대소문자 무시)으로 2번 이상 적은 숙제를 많이 적은 순 → 최근 순으로
  async function frequentTitles(userId) {
    const rows = await db.query(
      `SELECT (array_agg(title ORDER BY created_at DESC))[1] AS title, COUNT(*) AS n, MAX(created_at) AS last_at
       FROM homework WHERE user_id = $1
       GROUP BY lower(regexp_replace(btrim(title), '\\s+', ' ', 'g'))
       HAVING COUNT(*) >= 2
       ORDER BY n DESC, last_at DESC
       LIMIT 8`,
      [userId]
    );
    return rows.map((r) => ({ title: r.title, count: Number(r.n) }));
  }

  api.get('/homework/frequent', async (req, res) => {
    res.json({ items: await frequentTitles(req.user.id) });
  });

  api.post('/homework', async (req, res) => {
    res.json({ item: publicItem(await createHomework(req.user.id, req.body.title)) });
  });

  api.patch('/homework/:id', async (req, res) => {
    res.json({ item: publicItem(await renameHomework(req.user.id, req.params.id, req.body.title)) });
  });

  api.delete('/homework/:id', async (req, res) => {
    await removeHomework(req.user.id, req.params.id);
    res.json({ ok: true });
  });

  function parseImage(dataUrl) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) throw new HttpError(400, '사진 형식이 올바르지 않아요');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > MAX_PHOTO_BYTES) throw new HttpError(413, '사진이 너무 커요');
    return { mime: m[1], buf };
  }

  async function runAnalysis(user, item, photo) {
    try {
      const r = await ai.analyze({
        profile: { birth: user.birth, className: user.class_name },
        title: item.title,
        imageBuf: photo.data,
        mime: photo.mime,
      });
      await db.query(
        `UPDATE homework SET shown = $1, verdict = $2, score = $3, ai_comment = $4, ai_note = $5,
           ai_status = 'ok', ai_model = $6 WHERE id = $7`,
        [r.shown, r.verdict, r.score, r.kidComment, r.parentNote, r.model, item.id]
      );
    } catch (err) {
      console.error('[ai] 분석 실패:', err.message);
      await db.query("UPDATE homework SET ai_status = 'error' WHERE id = $1", [item.id]);
    }
    const [fresh] = await db.query('SELECT * FROM homework WHERE id = $1', [item.id]);
    return fresh;
  }

  api.post('/homework/:id/clear', async (req, res) => {
    const item = await ownedItem(req);
    if (item.status !== 'pending') throw new HttpError(400, '이미 클리어한 숙제예요');
    const image = req.body.image ? parseImage(req.body.image) : null;
    const session = await openSession(req.user.id);

    let photoId = null;
    if (image) {
      photoId = uid();
      await db.query(
        'INSERT INTO photos (id, user_id, mime, data, created_at) VALUES ($1, $2, $3, $4, $5)',
        [photoId, req.user.id, image.mime, image.buf, Date.now()]
      );
    }
    await db.query(
      `UPDATE homework SET status = 'done', done_at = $1, done_session = $2, photo_id = $3,
         verdict = $4, ai_status = 'none' WHERE id = $5`,
      [Date.now(), session ? session.id : null, photoId, image ? null : 'unverified', item.id]
    );

    let [fresh] = await db.query('SELECT * FROM homework WHERE id = $1', [item.id]);
    if (image && ai.isEnabled()) {
      fresh = await runAnalysis(req.user, fresh, { data: image.buf, mime: image.mime });
    }
    res.json({ item: publicItem(fresh) });
  });

  api.post('/homework/:id/reanalyze', async (req, res) => {
    const item = await ownedItem(req);
    if (item.status !== 'done' || !item.photo_id) throw new HttpError(400, '다시 볼 사진이 없어요');
    if (!ai.isEnabled()) throw new HttpError(503, 'AI 선생님이 아직 준비되지 않았어요');
    const [photo] = await db.query('SELECT mime, data FROM photos WHERE id = $1', [item.photo_id]);
    if (!photo) throw new HttpError(404, '사진을 찾을 수 없어요');
    const fresh = await runAnalysis(req.user, item, photo);
    res.json({ item: publicItem(fresh) });
  });

  api.get('/records', async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const rows = await db.query(
      "SELECT * FROM homework WHERE user_id = $1 AND status = 'done' ORDER BY done_at DESC LIMIT $2",
      [req.user.id, limit]
    );
    res.json({ items: rows.map(publicItem) });
  });

  api.get('/photos/:id', async (req, res) => {
    const [p] = await db.query('SELECT mime, data FROM photos WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!p) throw new HttpError(404, '사진을 찾을 수 없어요');
    res.set('Content-Type', p.mime);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(p.data);
  });

  // ───────── 부모님 메뉴: 초기화·비밀번호 재설정 (환경변수 ADMIN_CODE 가 있어야 켜진다) ─────────
  const admin = express.Router();

  admin.post('/login', async (req, res) => {
    if (!ADMIN_CODE) throw new HttpError(503, '부모님 비밀번호(ADMIN_CODE)가 아직 설정되지 않았어요');
    const wait = auth.lockedFor('__admin');
    if (wait) throw new HttpError(429, `잠깐 쉬었다 다시 해요 (${wait}초 후)`);
    if (!auth.codeMatches(str(req.body.code, 100), ADMIN_CODE)) {
      auth.recordFail('__admin');
      throw new HttpError(401, '부모님 비밀번호가 달라요');
    }
    auth.clearFails('__admin');
    res.json({ token: auth.issueToken('admin', secret, ADMIN_TTL_MS) });
  });

  admin.use((req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    if (!ADMIN_CODE || !m || auth.readToken(m[1], secret) !== 'admin') {
      throw new HttpError(401, '부모님 비밀번호를 다시 입력해 주세요');
    }
    next();
  });

  admin.get('/kids', async (req, res) => {
    const kids = [];
    for (const name of KIDS) {
      // eslint-disable-next-line no-await-in-loop
      const [u] = await db.query('SELECT * FROM users WHERE name = $1', [name]);
      if (!u) {
        kids.push({ name, registered: false, avatar: avatars.defaultAvatar(kidIndex(name)) });
        continue; // eslint-disable-line no-continue
      }
      // eslint-disable-next-line no-await-in-loop
      const [c] = await db.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'done') AS done,
                COUNT(*) FILTER (WHERE status = 'pending') AS pending
         FROM homework WHERE user_id = $1`,
        [u.id]
      );
      // eslint-disable-next-line no-await-in-loop
      const [p] = await db.query('SELECT COUNT(*) AS n FROM photos WHERE user_id = $1', [u.id]);
      kids.push({
        name,
        registered: true,
        needsPin: !u.pin_hash,
        avatar: avatars.parseAvatar(u.avatar, kidIndex(name)),
        school: u.school,
        className: u.class_name,
        done: Number(c.done),
        pending: Number(c.pending),
        photos: Number(p.n),
      });
    }
    res.json({ kids });
  });

  async function kidFromParam(req) {
    if (!KIDS.includes(req.params.name)) throw new HttpError(404, '없는 친구예요');
    const [u] = await db.query('SELECT * FROM users WHERE name = $1', [req.params.name]);
    if (!u) throw new HttpError(404, '아직 등록 전이에요');
    return u;
  }

  async function wipeRecords(userId) {
    await db.query('DELETE FROM photos WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM homework WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  // 숙제·사진·HTF 기록만 지운다 (프로필·캐릭터·비밀번호는 그대로)
  admin.post('/kids/:name/clear-records', async (req, res) => {
    const u = await kidFromParam(req);
    await wipeRecords(u.id);
    res.json({ ok: true });
  });

  // 기록과 프로필을 모두 지워 "처음 로그인" 상태로 되돌린다
  admin.post('/kids/:name/reset-all', async (req, res) => {
    const u = await kidFromParam(req);
    await wipeRecords(u.id);
    await db.query('DELETE FROM users WHERE id = $1', [u.id]);
    res.json({ ok: true });
  });

  // 비밀번호만 비운다 → 다음 로그인에서 새 비밀번호를 정한다 (기록은 그대로)
  admin.post('/kids/:name/reset-pin', async (req, res) => {
    const u = await kidFromParam(req);
    await db.query("UPDATE users SET pin_hash = '', updated_at = $1 WHERE id = $2", [Date.now(), u.id]);
    auth.clearFails(u.name);
    res.json({ ok: true });
  });

  // ── 부모님이 아이의 숙제를 확인하고 고친다 (빼먹은 숙제 넣어 주기) ──
  // 대기 중인 숙제는 추가·수정·삭제, 클리어한 숙제는 최근 30개를 읽기만 한다.
  admin.get('/kids/:name/homework', async (req, res) => {
    const u = await kidFromParam(req);
    const pending = await db.query(
      "SELECT * FROM homework WHERE user_id = $1 AND status = 'pending' ORDER BY created_at ASC", [u.id]
    );
    const done = await db.query(
      "SELECT * FROM homework WHERE user_id = $1 AND status = 'done' ORDER BY done_at DESC LIMIT 30", [u.id]
    );
    res.json({
      kid: { name: u.name, avatar: avatars.parseAvatar(u.avatar, kidIndex(u.name)) },
      pending: pending.map(publicItem),
      done: done.map(publicItem),
      frequent: await frequentTitles(u.id),
    });
  });

  admin.post('/kids/:name/homework', async (req, res) => {
    const u = await kidFromParam(req);
    res.json({ item: publicItem(await createHomework(u.id, req.body.title, 'parent')) });
  });

  admin.patch('/kids/:name/homework/:id', async (req, res) => {
    const u = await kidFromParam(req);
    res.json({ item: publicItem(await renameHomework(u.id, req.params.id, req.body.title)) });
  });

  admin.delete('/kids/:name/homework/:id', async (req, res) => {
    const u = await kidFromParam(req);
    await removeHomework(u.id, req.params.id);
    res.json({ ok: true });
  });

  // 부모님은 두 아이의 숙제 사진을 볼 수 있다 (사진 번호는 추측할 수 없는 무작위 값)
  admin.get('/photos/:id', async (req, res) => {
    const [p] = await db.query('SELECT mime, data FROM photos WHERE id = $1', [req.params.id]);
    if (!p) throw new HttpError(404, '사진을 찾을 수 없어요');
    res.set('Content-Type', p.mime);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(p.data);
  });

  app.use('/api/admin', admin);
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: '없는 주소예요' }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: '사진이 너무 커요' });
    console.error(err);
    res.status(500).json({ error: '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 주세요' });
  });

  const server = app.listen(PORT, () => console.log(`HTF 대시보드가 http://localhost:${PORT} 에서 실행 중이에요`));
  const shutdown = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
