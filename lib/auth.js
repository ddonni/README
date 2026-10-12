// 세션(로그인 상태)과 일회용 질문(challenge)을 다루는 도우미.
import { randomBytes, createHash } from 'node:crypto';
import { getConfig } from './config.js';
import { getStore } from './store.js';
import { parseCookies, buildCookie, HttpError } from './http.js';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const randomId = () => randomBytes(32).toString('base64url');

// ---------- 일회용 질문 ----------
// 질문 본문은 simplewebauthn이 만든 랜덤 값이고, 브라우저에는 "어떤 질문인지" 가리키는
// 쿠키 ID만 줍니다. 검증할 때 takeChallenge 로 꺼내면서 바로 지우므로 재사용이 안 됩니다.
export async function rememberChallenge(res, challenge, purpose, extra = {}) {
  const cfg = getConfig();
  const id = randomId();
  await getStore().saveChallenge({
    id,
    challenge,
    purpose, // 'signup' | 'add-passkey' | 'login'  (등록용 질문으로 로그인 못 하게)
    user_id: extra.userId ?? null, // 등록 질문이면 어느 계정용인지
    user_name: extra.userName ?? null,
    expires_at: new Date(Date.now() + cfg.challengeTtlSeconds * 1000).toISOString(),
  });
  appendCookie(res, buildCookie(cfg.challengeCookie, id, { maxAge: cfg.challengeTtlSeconds, secure: cfg.secureCookies }));
}

// 질문 줄 전체를 돌려줍니다. purposes: 허용하는 용도 목록
export async function consumeChallenge(req, res, purposes) {
  const cfg = getConfig();
  const id = parseCookies(req)[cfg.challengeCookie];
  appendCookie(res, buildCookie(cfg.challengeCookie, '', { maxAge: 0, secure: cfg.secureCookies }));
  if (!id) throw new HttpError(400, '질문(challenge)이 없습니다. 처음부터 다시 시도하세요.');
  const row = await getStore().takeChallenge(id);
  if (!row) throw new HttpError(400, '이미 사용했거나 없는 질문입니다.');
  if (!purposes.includes(row.purpose)) throw new HttpError(400, '용도가 다른 질문입니다.');
  if (new Date(row.expires_at).getTime() < Date.now()) throw new HttpError(400, '질문의 유효시간(5분)이 지났습니다.');
  return row;
}

// ---------- 세션 ----------
// 세션 = "이 브라우저는 user_id 계정으로, passkey_id 패스키로 들어왔다"
export async function startSession(res, userId, passkeyId) {
  const cfg = getConfig();
  const token = randomId();
  await getStore().createSession({
    token_hash: sha256(token), // DB에는 해시만. DB가 새도 쿠키를 만들 수 없음
    user_id: userId,
    passkey_id: passkeyId,
    expires_at: new Date(Date.now() + cfg.sessionTtlSeconds * 1000).toISOString(),
  });
  appendCookie(res, buildCookie(cfg.sessionCookie, token, { maxAge: cfg.sessionTtlSeconds, secure: cfg.secureCookies }));
}

export async function getSession(req) {
  const cfg = getConfig();
  const token = parseCookies(req)[cfg.sessionCookie];
  if (!token) return null;
  const store = getStore();
  const s = await store.getSession(sha256(token));
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) {
    await store.deleteSession(s.token_hash);
    return null;
  }
  return s;
}

export async function requireSession(req) {
  const s = await getSession(req);
  if (!s) throw new HttpError(401, '로그인이 필요합니다.');
  return s;
}

export async function endSession(req, res) {
  const cfg = getConfig();
  const token = parseCookies(req)[cfg.sessionCookie];
  if (token) await getStore().deleteSession(sha256(token));
  appendCookie(res, buildCookie(cfg.sessionCookie, '', { maxAge: 0, secure: cfg.secureCookies }));
}

function appendCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}
