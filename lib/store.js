// 저장소: 배포에서는 Supabase(Postgres), 로컬 테스트에서는 메모리.
// API 코드는 어느 쪽인지 모르고 아래 함수들만 부릅니다.
//
// 계정별로 나뉘는 함수(패스키·메모)는 모두 userId 를 함께 받고,
// "그 계정 것만" 찾고/지웁니다. 남의 것을 가리키는 ID를 줘도 결과가 없음(null/0).
//
//   me_users      : 계정 (비밀번호 칸 없음)
//   me_passkeys   : 패스키 ID, "공개키", 서명 횟수, 이름  ← 개인키는 절대 여기 없음
//   me_challenges : 서버가 보낸 일회용 질문 (쓰면 바로 지움)
//   me_sessions   : 로그인 상태 (토큰 원문이 아니라 SHA-256 해시만 저장)
//   me_notes      : 계정별 비공개 메모 (만들어 넣은 내용)

import { createClient } from '@supabase/supabase-js';

let cached;
export function getStore() {
  if (cached) return cached;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    cached = supabaseStore(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }));
  } else if (process.env.STORE === 'memory' || !process.env.VERCEL) {
    cached = memoryStore();
  } else {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  }
  return cached;
}

const nowIso = () => new Date().toISOString();

function supabaseStore(db) {
  const must = ({ data, error }) => {
    if (error) throw new Error(`DB 오류: ${error.message}`);
    return data;
  };
  const count = async (q) => {
    const { count: n, error } = await q;
    if (error) throw new Error(`DB 오류: ${error.message}`);
    return n ?? 0;
  };
  return {
    kind: 'supabase',
    // ---- 계정
    async countUsers() { return count(db.from('me_users').select('id', { count: 'exact', head: true })); },
    async createUser(u) { must(await db.from('me_users').insert(u)); },
    async getUser(id) { return must(await db.from('me_users').select('id, name, created_at').eq('id', id).maybeSingle()); },

    // ---- 패스키
    async countPasskeys(userId) {
      return count(db.from('me_passkeys').select('id', { count: 'exact', head: true }).eq('user_id', userId));
    },
    async listPasskeys(userId) {
      return must(await db.from('me_passkeys').select('*').eq('user_id', userId).order('created_at', { ascending: true }));
    },
    async getPasskey(id) { // 로그인 때: 어떤 계정의 패스키인지 찾는 용도
      return must(await db.from('me_passkeys').select('*').eq('id', id).maybeSingle());
    },
    async addPasskey(p) { must(await db.from('me_passkeys').insert(p)); },
    async touchPasskey(id, counter) {
      must(await db.from('me_passkeys').update({ counter, last_used_at: nowIso() }).eq('id', id));
    },
    async deletePasskey(id, userId) {
      // user_id 조건이 같이 걸려 있어서 남의 패스키 ID를 줘도 0건
      // me_sessions.passkey_id 는 ON DELETE CASCADE → 이 패스키로 연 세션도 같이 사라짐
      return must(await db.from('me_passkeys').delete().eq('id', id).eq('user_id', userId).select('id')).length;
    },

    // ---- 일회용 질문
    async saveChallenge(c) { must(await db.from('me_challenges').insert(c)); },
    async takeChallenge(id) {
      // 지우면서 꺼내기 = 딱 한 번만 쓸 수 있음. 같은 질문으로 두 번 오면 두 번째는 null.
      const rows = must(await db.from('me_challenges').delete().eq('id', id).select('*'));
      await db.from('me_challenges').delete().lt('expires_at', nowIso()); // 만료된 질문 청소
      return rows[0] || null;
    },

    // ---- 세션
    async createSession(s) { must(await db.from('me_sessions').insert(s)); },
    async getSession(h) { return must(await db.from('me_sessions').select('*').eq('token_hash', h).maybeSingle()); },
    async deleteSession(h) { must(await db.from('me_sessions').delete().eq('token_hash', h)); },

    // ---- 비공개 메모 (전부 user_id 로 범위 제한)
    async listNotes(userId) {
      return must(await db.from('me_notes').select('id, kind, body, created_at').eq('user_id', userId).order('created_at', { ascending: true }));
    },
    async getNote(id, userId) {
      return must(await db.from('me_notes').select('id, kind, body, created_at').eq('id', id).eq('user_id', userId).maybeSingle());
    },
    async addNote(userId, kind, body) {
      return must(await db.from('me_notes').insert({ user_id: userId, kind, body }).select('id, kind, body, created_at').single());
    },
    async deleteNote(id, userId) {
      return must(await db.from('me_notes').delete().eq('id', id).eq('user_id', userId).select('id')).length;
    },
  };
}

function memoryStore() {
  const users = new Map();
  const passkeys = new Map();
  const challenges = new Map();
  const sessions = new Map();
  const notes = [];
  let noteSeq = 0;
  const pick = ({ id, kind, body, created_at }) => ({ id, kind, body, created_at });
  return {
    kind: 'memory',
    async countUsers() { return users.size; },
    async createUser(u) { users.set(u.id, { created_at: nowIso(), ...u }); },
    async getUser(id) { return users.get(id) || null; },

    async countPasskeys(userId) { return [...passkeys.values()].filter((p) => p.user_id === userId).length; },
    async listPasskeys(userId) {
      return [...passkeys.values()].filter((p) => p.user_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async getPasskey(id) { return passkeys.get(id) || null; },
    async addPasskey(p) {
      if (passkeys.has(p.id)) throw new Error('이미 등록된 패스키');
      passkeys.set(p.id, { created_at: nowIso(), last_used_at: null, ...p });
    },
    async touchPasskey(id, counter) {
      const p = passkeys.get(id);
      if (p) Object.assign(p, { counter, last_used_at: nowIso() });
    },
    async deletePasskey(id, userId) {
      const p = passkeys.get(id);
      if (!p || p.user_id !== userId) return 0;
      passkeys.delete(id);
      for (const [k, s] of sessions) if (s.passkey_id === id) sessions.delete(k);
      return 1;
    },

    async saveChallenge(c) { challenges.set(c.id, { created_at: nowIso(), ...c }); },
    async takeChallenge(id) {
      const c = challenges.get(id) || null;
      challenges.delete(id);
      return c;
    },

    async createSession(s) { sessions.set(s.token_hash, { created_at: nowIso(), ...s }); },
    async getSession(h) { return sessions.get(h) || null; },
    async deleteSession(h) { sessions.delete(h); },

    async listNotes(userId) { return notes.filter((n) => n.user_id === userId).map(pick); },
    async getNote(id, userId) {
      const n = notes.find((x) => String(x.id) === String(id) && x.user_id === userId);
      return n ? pick(n) : null;
    },
    async addNote(userId, kind, body) {
      const n = { id: ++noteSeq, user_id: userId, kind, body, created_at: nowIso() };
      notes.push(n);
      return pick(n);
    },
    async deleteNote(id, userId) {
      const i = notes.findIndex((x) => String(x.id) === String(id) && x.user_id === userId);
      if (i < 0) return 0;
      notes.splice(i, 1);
      return 1;
    },
  };
}
