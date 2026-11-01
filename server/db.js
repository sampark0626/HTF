'use strict';
// DB 어댑터: DATABASE_URL 이 있으면 진짜 Postgres(Neon/Supabase/Render Postgres 등),
// 없으면 로컬 개발용 PGlite(WASM Postgres)를 사용한다. 두 쪽 모두 같은 SQL 을 쓴다.

const path = require('path');

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  birth TEXT NOT NULL,
  school TEXT NOT NULL,
  class_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  timer_min INTEGER NOT NULL DEFAULT 40,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_stars INTEGER NOT NULL DEFAULT 0;
-- 한문 6급 과정: hanja_on NULL 이면 이름 기준 기본값, 1 켬, 0 끔 / hanja_day 는 다음에 공부할 날 / hanja_last 는 마지막으로 끝낸 날(YYYY-MM-DD, 한국 시간)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hanja_on INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hanja_day INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hanja_last TEXT NOT NULL DEFAULT '';
-- 시험 대비: hanja_exam 은 시험 날짜(NULL 이면 기본값, '' 이면 시험 없음) / hanja_cnt 는 hanja_last 날에 나아간 수업 수 /
-- hanja_alt 는 약한 글자 수업이나 모의시험으로 오늘의 한문을 끝낸 날
ALTER TABLE users ADD COLUMN IF NOT EXISTS hanja_exam TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hanja_cnt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hanja_alt TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  duration_sec INTEGER NOT NULL,
  ended_at BIGINT
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS paused_at BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS paused_total BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS homework (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  carry_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  done_at BIGINT,
  done_session TEXT,
  photo_id TEXT,
  shown TEXT,
  verdict TEXT,
  score INTEGER,
  ai_comment TEXT,
  ai_note TEXT,
  ai_status TEXT NOT NULL DEFAULT 'none',
  ai_model TEXT
);
ALTER TABLE homework ADD COLUMN IF NOT EXISTS added_by TEXT;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'normal';
CREATE INDEX IF NOT EXISTS homework_user_idx ON homework(user_id, status);
CREATE TABLE IF NOT EXISTS hanja_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  done_at BIGINT NOT NULL,
  score INTEGER NOT NULL,
  misses INTEGER NOT NULL DEFAULT 0,
  advanced INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE hanja_log ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'lesson'; -- lesson 수업 / weak 약한 글자 수업 / mock 모의시험
ALTER TABLE hanja_log ADD COLUMN IF NOT EXISTS total INTEGER NOT NULL DEFAULT 0; -- 모의시험 문제 수, 약한 글자 수업의 글자 수
CREATE INDEX IF NOT EXISTS hanja_log_user_idx ON hanja_log(user_id, done_at);
-- 글자마다 맞고 틀린 기록: 틀린 뒤 연속 2번 맞히기 전까지는 "약한 글자"
CREATE TABLE IF NOT EXISTS hanja_char (
  user_id TEXT NOT NULL,
  h TEXT NOT NULL,
  ok_n INTEGER NOT NULL DEFAULT 0,
  bad_n INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, h)
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS npcs (
  id TEXT PRIMARY KEY,
  kid_name TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  look TEXT NOT NULL,
  msg TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS npcs_kid_idx ON npcs(kid_name);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Supabase 는 public 스키마를 REST(anon 키)로 노출한다. 정책 없는 RLS 로 그 경로를 막는다.
-- 앱은 테이블 소유자 계정으로 접속하므로 영향이 없다.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hanja_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hanja_char ENABLE ROW LEVEL SECURITY;
`;

function normalize(rows) {
  return rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'bigint') out[k] = Number(v);
      else if (v instanceof Uint8Array && !Buffer.isBuffer(v)) out[k] = Buffer.from(v);
      else out[k] = v;
    }
    return out;
  });
}

// sslmode 쿼리를 지우고 ssl 옵션을 직접 지정한다 (pg 8.x 가 require 를 verify-full 로 취급하는 문제 회피)
function pgConfig(url) {
  let conn = url;
  let isLocal = false;
  try {
    const u = new URL(url);
    isLocal = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
    u.searchParams.delete('sslmode');
    conn = u.toString();
  } catch (_) { /* 그대로 사용 */ }
  const ssl = process.env.PGSSL === 'disable' || isLocal ? false : { rejectUnauthorized: false };
  return { connectionString: conn, ssl, max: 4 };
}

async function openPostgres(url) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, (v) => Number(v)); // BIGINT → number
  const pool = new Pool(pgConfig(url));
  await pool.query(DDL);
  return {
    kind: 'postgres',
    persistent: true,
    query: async (sql, params = []) => normalize((await pool.query(sql, params)).rows),
    close: () => pool.end(),
  };
}

async function openPglite() {
  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch (e) {
    throw new Error('DATABASE_URL 이 설정되지 않았고 @electric-sql/pglite 도 설치되어 있지 않습니다.');
  }
  const dir = process.env.LOCAL_DB_DIR || path.join(__dirname, '..', 'data', 'pglite');
  const db = new PGlite(dir === 'memory' ? undefined : dir);
  await db.waitReady;
  await db.exec(DDL);
  return {
    kind: 'pglite',
    persistent: false, // Render 무료 플랜 디스크는 재시작 때 사라진다 → 임시 저장
    query: async (sql, params = []) => normalize((await db.query(sql, params)).rows),
    close: () => db.close(),
  };
}

async function open() {
  return process.env.DATABASE_URL ? openPostgres(process.env.DATABASE_URL) : openPglite();
}

module.exports = { open };
