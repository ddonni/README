// "남의 패스키"로 문을 두드려 보는 스크립트 — 배포된 사이트에 그대로 써도 안전합니다.
// (아무것도 등록하거나 지우지 않고, 거절되는지만 확인합니다)
//
// 이 스크립트가 하는 일
//   1) 내 컴퓨터에서 새 열쇠 한 쌍(P-256)을 즉석으로 만든다 = 사이트가 한 번도 본 적 없는 "남의 패스키"
//   2) 사이트에서 질문(challenge)을 정상적으로 받아
//   3) 그 질문에 "남의 개인키"로 진짜 서명을 해서 보낸다
//   4) 서버가 401로 거절하는지, 비공개 자료가 여전히 401인지 확인하고 요청/응답을 파일로 남긴다
//
// 사용: node scripts/stranger-check.mjs https://readme-two-tau.vercel.app
import { generateKeyPairSync, createHash, sign, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const origin = new URL(target).origin;
const rpID = new URL(target).hostname;
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (b) => createHash('sha256').update(b).digest();

const log = [];
const out = (s = '') => { log.push(s); console.log(s); };
const cookies = {};
function keepCookies(res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    cookies[pair.slice(0, i)] = pair.slice(i + 1);
  }
}
const cookieHeader = () => Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');

async function call(method, path, body) {
  const res = await fetch(target + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...(cookieHeader() ? { Cookie: cookieHeader() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  keepCookies(res);
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

out(`# 남의 패스키로 열어 보기 — ${target}`);
out('');
out(`실행 시각: ${new Date().toISOString()}`);
out('');

// 1) 남의 열쇠 한 쌍
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const strangerCredId = b64u(randomBytes(32));
out(`남의 패스키 ID(방금 만든 것): ${strangerCredId}`);
out('');

// 0) 로그인 없이 비공개 자료
const before = await call('GET', '/api/private');
out('## 1. 로그인 없이 비공개 자료 요청');
out('```http\nGET /api/private\n```');
out(`→ ${before.status}\n\`\`\`json\n${JSON.stringify(before.json, null, 2)}\n\`\`\``);

// 2) 질문 받기
const opt = await call('POST', '/api/login/options', {});
const challenge = opt.json?.options?.challenge;
out('');
out('## 2. 질문(challenge) 받기');
out('```http\nPOST /api/login/options\n```');
out(`→ ${opt.status}  challenge = ${challenge}`);

// 3) 남의 개인키로 진짜 서명
const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
const flags = 0x01 | 0x04; // 사용자 있음(UP) + 사용자 확인(UV)
const authData = Buffer.concat([sha256(rpID), Buffer.from([flags]), Buffer.from([0, 0, 0, 1])]);
const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), privateKey); // DER ECDSA
const response = {
  id: strangerCredId,
  rawId: strangerCredId,
  type: 'public-key',
  authenticatorAttachment: 'platform',
  clientExtensionResults: {},
  response: {
    clientDataJSON: b64u(clientDataJSON),
    authenticatorData: b64u(authData),
    signature: b64u(signature),
    userHandle: b64u(randomBytes(16)), // 아무 계정 ID나 붙여 봄
  },
};
const ver = await call('POST', '/api/login/verify', { response });
out('');
out('## 3. 남의 개인키로 서명한 답을 제출');
out('```http\nPOST /api/login/verify\nContent-Type: application/json\n```');
out('```json\n' + JSON.stringify({ response: { ...response, response: { ...response.response, signature: response.response.signature.slice(0, 16) + '…' } } }, null, 2) + '\n```');
out(`→ ${ver.status}\n\`\`\`json\n${JSON.stringify(ver.json, null, 2)}\n\`\`\``);

// 4) 그래도 비공개 자료는 닫혀 있는지
const after = await call('GET', '/api/private');
out('');
out('## 4. 그 뒤 비공개 자료 다시 요청');
out(`GET /api/private → ${after.status}  ${JSON.stringify(after.json)}`);

// 5) 남이 새 패스키를 등록하려 하면?
const reg = await call('POST', '/api/register/options', { mode: 'signup', name: '낯선 사람' });
out('');
out('## 5. 남이 자기 패스키를 새로 등록하려고 시도');
out(`POST /api/register/options → ${reg.status}  ${JSON.stringify(reg.json?.error ?? (reg.status === 200 ? '새 계정 자리가 아직 남아 있음! 계정 2개를 먼저 만드세요.' : reg.json))}`);

const pass = before.status === 401 && ver.status === 401 && after.status === 401 && reg.status === 403;
out('');
out(pass ? '**결과: 통과 — 남의 패스키로는 열리지 않았고, 새로 등록할 수도 없었습니다.**'
         : '**결과: 확인 필요 — 위 상태 코드를 보세요.** (계정 2개를 만들기 전이면 5번은 200이 정상)');

const dir = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
await mkdir(dir, { recursive: true });
const file = `${dir}stranger-${rpID.replace(/[^a-z0-9.-]/gi, '_')}.md`;
await writeFile(file, log.join('\n') + '\n');
console.log(`\n저장: ${file}`);
process.exit(pass ? 0 : 1);
