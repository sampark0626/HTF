'use strict';
const crypto = require('crypto');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPin(pin, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function issueToken(userId, secret) {
  const body = b64url(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  return `${body}.${sign(body, secret)}`;
}

function readToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload.uid : null;
  } catch (_) {
    return null;
  }
}

// 이름별 PIN 오입력 제한 (5회 실패 → 60초 잠금)
const attempts = new Map();
const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;

function lockedFor(name) {
  const a = attempts.get(name);
  if (!a || !a.until) return 0;
  if (Date.now() >= a.until) {
    attempts.delete(name);
    return 0;
  }
  return Math.ceil((a.until - Date.now()) / 1000);
}

function recordFail(name) {
  const a = attempts.get(name) || { fails: 0, until: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) a.until = Date.now() + LOCK_MS;
  attempts.set(name, a);
}

function clearFails(name) {
  attempts.delete(name);
}

async function loadSecret(db) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const rows = await db.query("SELECT value FROM meta WHERE key = 'session_secret'");
  if (rows[0]) return rows[0].value;
  const secret = crypto.randomBytes(32).toString('hex');
  await db.query(
    "INSERT INTO meta (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING",
    [secret]
  );
  const again = await db.query("SELECT value FROM meta WHERE key = 'session_secret'");
  return again[0].value;
}

module.exports = {
  hashPin, verifyPin, issueToken, readToken,
  lockedFor, recordFail, clearFails, loadSecret,
};
