// Vercel 함수와 로컬 개발 서버에서 똑같이 동작하도록
// Node 기본 req/res만 사용하는 작은 도우미들입니다.
import { getConfig } from './config.js';

export function sendJson(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  // Vercel은 req.body를 미리 파싱해 둘 수 있고, 로컬 서버는 스트림을 직접 읽습니다.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new HttpError(413, '요청이 너무 큽니다.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

export function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function buildCookie(name, value, { maxAge, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly', // 자바스크립트에서 읽을 수 없음
    'SameSite=Strict', // 다른 사이트에서 보낸 요청에는 실리지 않음
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// 모든 API 함수를 감싸서: 메서드 확인, 다른 출처의 POST 차단, 에러를 JSON으로 통일
export function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, '허용되지 않은 메서드입니다.');
      }
      if (req.method !== 'GET') {
        const from = req.headers.origin;
        const expected = getConfig().origin;
        if (from && from !== expected) {
          // 비밀값이 아니므로 두 주소를 그대로 보여 줘서 원인을 바로 알 수 있게 함
          throw new HttpError(403, `다른 출처에서 온 요청입니다. (받은 주소: ${from} / 서버가 기대한 주소: ${expected} — Vercel 환경변수 ORIGIN·RP_ID 와 접속 주소를 확인하세요)`);
        }
        const ct = req.headers['content-type'] || '';
        if (!ct.includes('application/json')) throw new HttpError(415, 'JSON으로 보내 주세요.');
      }
      await fn(req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { ok: false, error: status === 500 ? '서버 오류' : err.message });
    }
  };
}
