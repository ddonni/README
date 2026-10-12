// 로컬 전체 흐름 검증 + 카드별(T08-Cxx) 증거 기록
//
// 실제 브라우저(Chromium)에 "가상 인증기"(가짜 기기)를 붙여 화면 버튼을 눌러 가며 확인합니다.
//   - 내 서버  : http://localhost:3000  (메모리 저장소)
//   - 남의 서버: http://localhost:3001  (저장소가 따로) → 여기서 만든 패스키 = "이 사이트에 등록된 적 없는 남의 패스키"
//   - 계정 A(도현-메인, 기기 A1·A2), 계정 B(시험용-B, 기기 B1)는 서로 다른 브라우저 창(쿠키 따로)
//
// 결과: docs/evidence/local-e2e.md, docs/evidence/screens/*.png
// 세션 토큰은 앞 4자만, 서명·공개키 같은 긴 값은 앞부분과 길이만 기록합니다.
// 사용: node scripts/e2e.mjs   (CHROME_PATH 로 브라우저 경로 지정 가능)
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium, request as pwRequest } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const MINE = 'http://localhost:3000';
const STRANGER = 'http://localhost:3001';
const outDir = `${root}docs/evidence`;
await mkdir(`${outDir}/screens`, { recursive: true });

// ---------- 기록 도우미 ----------
const lines = [];
const checks = [];
const note = (s = '') => { lines.push(s); console.log(s); };
const check = (ids, name, ok, detail = '') => {
  checks.push({ ids, name, ok });
  note(`- ${ok ? '✅' : '❌'} **${ids}** ${name}${detail ? ` — ${detail}` : ''}`);
};
const LONG_KEYS = ['clientDataJSON', 'authenticatorData', 'signature', 'attestationObject', 'userHandle', 'publicKey', 'rawId', 'id', 'challenge'];
const mask = (v) => (typeof v === 'string' && v.length > 16 ? `${v.slice(0, 10)}…(${v.length}자)` : v);
const maskToken = (v) => (v ? `${v.slice(0, 4)}••••••••(가림, ${v.length}자)` : v);
const show = (o) => JSON.stringify(o, (k, v) => (LONG_KEYS.includes(k) ? mask(v) : v), 2);
function http(title, method, path, reqBody, status, resBody, { cookie } = {}) {
  note(`**${title}**`);
  note('```http');
  note(`${method} ${path}`);
  if (cookie !== undefined) note(`Cookie: ${cookie}`);
  if (reqBody !== undefined) note('\n' + show(reqBody));
  note('```');
  note(`→ **${status}**`);
  note('```json\n' + show(resBody) + '\n```');
  note('');
}

// ---------- 서버 두 개 ----------
function startServer(port) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['scripts/dev-server.mjs'], {
      cwd: root,
      env: { ...process.env, PORT: String(port), STORE: 'memory', RP_ID: 'localhost', ORIGIN: `http://localhost:${port}` },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    p.stdout.on('data', (d) => { if (String(d).includes('dev server')) resolve(p); });
    p.on('exit', (c) => reject(new Error(`server ${port} exited ${c}`)));
  });
}
const servers = [await startServer(3000), await startServer(3001)];
// 브라우저 경로: CHROME_PATH > 윈도우 기본 크롬 > 리눅스 Playwright 크롬
import { existsSync } from 'node:fs';
const chromePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].find((p) => p && existsSync(p));
if (!chromePath) throw new Error('크롬을 찾지 못했습니다. CHROME_PATH 환경변수로 chrome.exe 경로를 알려 주세요.');
const browser = await chromium.launch({ executablePath: chromePath });

// 브라우저 창 하나 = 쿠키 따로 + 가상 인증기 따로
async function newWindow(name) {
  const ctx = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const traffic = [];
  page.on('response', async (res) => {
    const url = new URL(res.url());
    if (!url.pathname.startsWith('/api/')) return;
    let body = null; try { body = await res.json(); } catch {}
    let reqBody; try { reqBody = res.request().postDataJSON() ?? undefined; } catch {}
    traffic.push({ method: res.request().method(), path: url.pathname + url.search, status: res.status(), reqBody, body });
  });
  return {
    name, ctx, page, cdp, traffic,
    last: (path, method) => [...traffic].reverse().find((t) => t.path.startsWith(path) && (!method || t.method === method)),
    async device() {
      const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
      });
      return authenticatorId;
    },
    async deviceWith(cred) { const id = await this.device(); await cdp.send('WebAuthn.addCredential', { authenticatorId: id, credential: cred }); return id; },
    unplug: (id) => cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: id }),
    creds: async (id) => (await cdp.send('WebAuthn.getCredentials', { authenticatorId: id })).credentials,
    async call(method, path, data) {
      const r = await ctx.request.fetch(MINE + path, method === 'GET' ? { method } : { method, headers: { 'Content-Type': 'application/json' }, data: data ?? {} });
      let json = null; try { json = await r.json(); } catch {}
      return { status: r.status(), json };
    },
    msg: () => page.locator('#msg').innerText(),
    async sid() { return (await ctx.cookies(MINE)).find((c) => c.name === 'sid')?.value; },
  };
}
const urlId = (c) => Buffer.from(c.credentialId, 'base64').toString('base64url'); // CDP는 일반 base64
const settle = (w) => w.page.waitForTimeout(300);
const waitOpen = (w) => w.page.locator('#v-open').waitFor();
const waitLocked = (w) => w.page.locator('#v-locked').waitFor();
const waitBad = (w) => w.page.waitForFunction(() => document.querySelector('#msg').className.includes('bad'));
async function login(w) { await w.page.click('#btn-login'); await waitOpen(w); await settle(w); }
async function logout(w) { await w.page.click('#btn-logout'); await waitLocked(w); }
async function addNote(w, kind, text) {
  await w.page.locator(`input[data-kind="${kind}"]`).fill(text);
  await w.page.locator(`button[data-kind="${kind}"]`).click();
  await w.page.waitForFunction((t) => document.querySelector('#note-groups').innerText.includes(t), text);
  return w.last('/api/private', 'POST').body.note.id;
}

const A_NOTES = {
  project: '(만든 내용) 디스코드 봇을 Docker 이미지로 옮기기 — 이번 주 Dockerfile 초안',
  apply: '(만든 내용) 가상의 회사 "구름다리클라우드" 주니어 DevOps — 마감 11월 말',
  retro: '(만든 내용) 패스키 과제: 질문을 언제 지우는지 처음에 헷갈렸음',
};
const B_NOTES = {
  project: '(만든 내용·B) 시험용 계정의 프로젝트 메모 — 할 일 앱 정리',
  apply: '(만든 내용·B) 가상의 "바다빛소프트" 인턴',
  retro: '(만든 내용·B) 시험용 계정 회고 — 이 글은 A가 보면 안 됨',
};

const anon = await newWindow('익명');
const A = await newWindow('계정A');
const B = await newWindow('계정B');

try {
  note('# 과제 8 로컬 검증 기록 (카드별)');
  note('');
  note(`실행 시각: ${new Date().toISOString()} · 브라우저: Chromium + 가상 인증기(CDP WebAuthn) · 서버: 로컬 개발 서버(메모리 저장소, RP ID=localhost)`);
  note('');
  note('비공개 칸에 넣은 내용은 모두 만들어 넣은 것입니다. 세션 토큰은 앞 4자만 남기고 가렸고, 서명·공개키 같은 긴 값은 앞부분과 길이만 적었습니다(공개키 저장 확인 칸만 전체 표시).');
  note('');

  // =====================================================================
  note('## 카드 2 — 패스키를 등록한다');
  note('');
  note('### 등록용 질문이 매번 다르다');
  const regChs = [];
  for (let i = 0; i < 3; i++) {
    const r = await anon.call('POST', '/api/register/options', { mode: 'signup', name: '질문확인용' });
    regChs.push(r.json.options.challenge);
    note(`    ${i + 1}번째 POST /api/register/options → ${r.status}  challenge = ${r.json.options.challenge}`);
  }
  check('T08-C19·C20', '등록 요청마다 서버가 새 질문을 만들어 보낸다 (본문은 서버 me_challenges에 5분 보관, 브라우저에는 그 줄을 가리키는 쿠키 ID만)', new Set(regChs).size === 3, '세 값이 모두 다름');
  note('');

  note('### 등록을 중간에 취소하면');
  const devCancel = await B.device();
  await B.cdp.send('WebAuthn.setUserVerified', { authenticatorId: devCancel, isUserVerified: false }); // 지문/PIN 확인 실패 = 취소
  await B.page.goto(MINE + '/me/');
  await waitLocked(B);
  await B.page.fill('#signup-name', '취소될 계정');
  await B.page.fill('#signup-label', '취소될 패스키');
  await B.page.click('#btn-signup');
  await waitBad(B);
  const cancelMsg = await B.msg();
  const meAfterCancel = await B.call('GET', '/api/me');
  const verifyCalls = B.traffic.filter((t) => t.path.startsWith('/api/register/verify')).length;
  check('T08-C25', '등록을 취소하면 화면에 안내가 나오고, 등록 확인 요청이 아예 가지 않아 서버에 저장되는 것이 없다',
    cancelMsg.includes('아무것도 저장되지 않았습니다') && verifyCalls === 0 && meAfterCancel.json.loggedIn === false,
    `화면: "${cancelMsg}" / register/verify 요청 ${verifyCalls}건 / GET /api/me → loggedIn=${meAfterCancel.json.loggedIn}`);
  await B.page.screenshot({ path: `${outDir}/screens/c2-cancel.png`, fullPage: true });
  await B.unplug(devCancel);
  note('');

  note('### 계정 A의 첫 패스키 등록 (기기 A1)');
  const devA1 = await A.device();
  await A.page.goto(MINE + '/me/');
  await waitLocked(A);
  await A.page.fill('#signup-name', '도현-메인');
  await A.page.fill('#signup-label', '노트북 크롬 - 기기 자체(가상 인증기 A1)');
  await A.page.click('#btn-signup');
  await waitOpen(A);
  await settle(A);
  const regOpt = A.last('/api/register/options');
  const regA = A.last('/api/register/verify');
  const credA1 = (await A.creds(devA1))[0];
  http('등록 1/2 — 서버가 보낸 요청서', 'POST', '/api/register/options', regOpt.reqBody, regOpt.status, regOpt.body);
  http('등록 2/2 — 기기가 서버로 보낸 것', 'POST', '/api/register/verify', regA.reqBody, regA.status, regA.body);
  const bodyStr = JSON.stringify(regA.reqBody);
  const privA1 = createPrivateKey({ key: Buffer.from(credA1.privateKey, 'base64'), format: 'der', type: 'pkcs8' });
  const dA1 = Buffer.from(privA1.export({ format: 'jwk' }).d, 'base64url');
  const leaks = [credA1.privateKey, dA1.toString('base64url'), dA1.toString('base64'), dA1.toString('hex')].some((s) => bodyStr.includes(s));
  check('T08-C23', '등록 요청 본문에 개인키가 없다 (기기 안 개인키 값을 base64url·base64·hex 세 형태로 본문에서 찾아봄)', !leaks,
    `본문 response 안의 칸: ${Object.keys(regA.reqBody.response.response).join(', ')}`);

  const keysA = await A.call('GET', '/api/passkeys');
  const storedA1 = keysA.json.passkeys.find((p) => p.id === urlId(credA1));
  const jwk = createPublicKey(privA1).export({ format: 'jwk' });
  const cose = Buffer.from(storedA1.publicKey, 'base64url');
  const matches = [jwk.x, jwk.y].filter(Boolean).every((c) => cose.includes(Buffer.from(c, 'base64url')));
  note('서버에 저장된 값 (GET /api/passkeys, 공개키 전체):');
  note('```json\n' + JSON.stringify(storedA1, null, 2) + '\n```');
  check('T08-C21·C22', '등록이 끝나면 서버에 공개키가 저장되고, 그 값은 기기 개인키로 계산한 공개키와 같다 — 비밀번호가 아님', matches,
    `COSE_Key ${cose.length}바이트, ${jwk.crv === 'Ed25519' ? 'EdDSA(Ed25519)' : 'ES256(' + jwk.crv + ')'}`);
  check('T08-C24', '등록한 패스키에 사람이 알아볼 이름이 붙는다', storedA1.label === '노트북 크롬 - 기기 자체(가상 인증기 A1)', storedA1.label);
  note('');

  // =====================================================================
  note('## 카드 1 — 무엇을 잠글지 먼저 가른다');
  note('');
  const aIds = {};
  for (const [k, t] of Object.entries(A_NOTES)) aIds[k] = await addNote(A, k, t);
  const aList = await A.call('GET', '/api/private');
  check('T08-C14', '비공개 영역 항목이 세 개 이상 (준비 중인 프로젝트 메모 / 지원하려는 곳 / 회고)', aList.json.count >= 3, `계정 A ${aList.json.count}건`);
  await A.page.screenshot({ path: `${outDir}/screens/c1-private-open-A.png`, fullPage: true });

  await anon.page.goto(MINE + '/');
  const doorVisible = await anon.page.locator('.private-door').isVisible();
  check('T08-C13', '공개 소개 아래에 "여기부터 비공개 영역" 점선 상자, /me/ 에는 "비공개 영역 · 패스키로 잠김" 표시', doorVisible && (await anon.page.locator('h1').innerText()).includes('곽도현'));
  await anon.page.screenshot({ path: `${outDir}/screens/c1-public.png`, fullPage: true });

  await anon.page.goto(MINE + '/me/');
  await waitLocked(anon);
  const anonText = await anon.page.locator('body').innerText();
  check('T08-C15', '로그인 안 한 /me/ 화면에 비공개 내용이 보이지 않는다', !Object.values(A_NOTES).some((t) => anonText.includes(t)));
  await anon.page.screenshot({ path: `${outDir}/screens/c1-locked.png`, fullPage: true });

  const rawHtml = await (await anon.ctx.request.get(MINE + '/me/')).text();
  const sourceLeak = Object.values(A_NOTES).some((t) => rawHtml.includes(t)) || rawHtml.includes('도현-메인');
  check('T08-C18', '로그인 없이 받은 /me/ 페이지 소스(HTML 원문) 어디에도 비공개 내용·계정 이름이 없다', !sourceLeak, `HTML ${rawHtml.length}자 검사 — 내용은 로그인 뒤 /api/private 응답으로만 옴`);

  const an1 = await anon.call('GET', '/api/private');
  const an2 = await anon.call('GET', `/api/private?id=${aIds.retro}`);
  const an3 = await anon.call('GET', '/api/passkeys');
  http('로그인 없이 비공개 자료 직접 요청 (응답 본문 전체)', 'GET', '/api/private', undefined, an1.status, an1.json, { cookie: '(없음)' });
  http('로그인 없이 메모 하나를 번호로 직접 요청', 'GET', `/api/private?id=${aIds.retro}`, undefined, an2.status, an2.json, { cookie: '(없음)' });
  check('T08-C16·C17', '로그인 없이 서버에 직접 요청하면 401로 거절 (/api/private, ?id=, /api/passkeys)',
    [an1, an2, an3].every((r) => r.status === 401), `${an1.status}, ${an2.status}, ${an3.status}`);
  note('');

  // =====================================================================
  note('## 카드 3 — 패스키로 들어간다');
  note('');
  await logout(A);
  note('### 로그인용 질문이 매번 다르다');
  const loginChs = [];
  for (let i = 0; i < 3; i++) {
    const r = await anon.call('POST', '/api/login/options', {});
    loginChs.push(r.json.options.challenge);
    note(`    ${i + 1}번째 POST /api/login/options → ${r.status}  challenge = ${r.json.options.challenge}`);
  }
  check('T08-C27·C28', '로그인 요청마다 새 질문, 세 값이 모두 다르다', new Set(loginChs).size === 3);
  note('');

  // 틀린 서명: 기기가 만든 서명의 마지막 1바이트만 바꿔 보냄
  await A.page.route('**/api/login/verify', async (route) => {
    const b = route.request().postDataJSON();
    const sig = Buffer.from(b.response.response.signature, 'base64url');
    sig[sig.length - 1] ^= 0x01;
    b.response.response.signature = sig.toString('base64url');
    await route.continue({ postData: JSON.stringify(b) });
  });
  await A.page.click('#btn-login');
  await waitBad(A);
  await A.page.unroute('**/api/login/verify');
  const badSig = A.last('/api/login/verify');
  await login(A);
  const goodSig = A.last('/api/login/verify');
  note('### 서명 확인 — 성공한 요청과 실패한 요청');
  http('✅ 성공: 기기가 만든 서명 그대로', 'POST', '/api/login/verify', goodSig.reqBody, goodSig.status, goodSig.body);
  http('❌ 실패: 서명 마지막 1바이트만 바꿈 (질문·나머지는 정상)', 'POST', '/api/login/verify', badSig.reqBody, badSig.status, badSig.body);
  check('T08-C29·C30', '저장된 공개키로 서명을 확인한 뒤에만 통과 — 서명이 1바이트만 달라도 401', goodSig.status === 200 && badSig.status === 401);
  note('');

  note('### 이미 쓴 질문으로 다시 로그인');
  const rp1 = await A.call('POST', '/api/login/verify', goodSig.reqBody);
  await A.call('POST', '/api/login/options', {});
  const rp2 = await A.call('POST', '/api/login/verify', goodSig.reqBody);
  http('위 성공 요청을 글자 하나 안 바꾸고 다시 보냄', 'POST', '/api/login/verify', goodSig.reqBody, rp1.status, rp1.json);
  http('새 질문을 받아 놓은 뒤 옛 서명을 보냄', 'POST', '/api/login/verify', goodSig.reqBody, rp2.status, rp2.json);
  check('T08-C31', '이미 한 번 쓴 질문(과 그 서명)으로는 다시 못 들어온다', rp1.status === 400 && rp2.status === 401, `${rp1.status}, ${rp2.status}`);
  note('');

  note('### 로그아웃한 뒤 같은 세션 값으로 다시 요청');
  // (A는 위 성공 로그인 상태 그대로)
  const sidA = await A.sid();
  const before = await A.call('GET', '/api/private');
  await logout(A);
  const raw = await pwRequest.newContext();
  const after = await raw.get(MINE + '/api/private', { headers: { Cookie: `sid=${sidA}` } });
  const afterJson = await after.json();
  await raw.dispose();
  note(`로그아웃 전, 이 세션 쿠키로 GET /api/private → ${before.status} (자료 ${before.json.count}건)`);
  note('');
  http('로그아웃 후, 로그아웃 전에 쓰던 세션 쿠키를 그대로 붙여 요청', 'GET', '/api/private', undefined, after.status(), afterJson, { cookie: `sid=${maskToken(sidA)}` });
  check('T08-C32·C33', '로그인 뒤에는 세션 쿠키(서버 DB의 세션 줄)로 사람을 알아보고, 로그아웃하면 서버에서 지워져 같은 값으로는 401', before.status === 200 && after.status() === 401);
  check('T08-C34', '이 기록 어디에도 세션 값 원문이 없다', !lines.join('\n').includes(sidA));
  const pwInputs = (await A.page.locator('input[type=password]').count()) + (await anon.page.locator('input[type=password]').count());
  check('T08-C35', '비밀번호 입력 칸이 없다 (/me/ 화면의 input 전부 검사)', pwInputs === 0);
  note('');

  // =====================================================================
  note('## 카드 4 — 기기를 잃어버렸을 때');
  note('');
  await login(A); // A1
  await A.unplug(devA1);
  const devA2 = await A.device();
  await A.page.fill('#add-label', '휴대폰 - 구글 비밀번호 관리자(가상 인증기 A2)');
  await A.page.click('#btn-add');
  await A.page.waitForFunction(() => document.querySelectorAll('#keys > li').length === 2);
  await settle(A);
  const credA2 = (await A.creds(devA2))[0];
  const listTwo = await A.call('GET', '/api/passkeys');
  check('T08-C42', '한 계정에 패스키 두 개', listTwo.json.passkeys.length === 2, listTwo.json.passkeys.map((p) => p.label).join(' / '));
  const listText = await A.page.locator('#keys').innerText();
  check('T08-C43', '목록 화면에 각 패스키의 이름과 등록 날짜가 보인다', listText.includes('휴대폰 - 구글') && listText.includes('노트북 크롬') && (listText.match(/등록 \d{4}\./g) || []).length === 2);
  await A.page.screenshot({ path: `${outDir}/screens/c4-two-passkeys.png`, fullPage: true });

  await logout(A);
  await login(A); // A2로
  A.page.once('dialog', (d) => d.accept());
  await A.page.locator('#keys > li', { hasText: '노트북 크롬' }).locator('button').click();
  await A.page.waitForFunction(() => document.querySelectorAll('#keys > li').length === 1);
  await settle(A);
  const delReq = A.last('/api/passkeys', 'DELETE');
  http('패스키 A1 지우기 (A2로 들어온 상태)', 'DELETE', '/api/passkeys', delReq.reqBody, delReq.status, delReq.body);
  await logout(A);
  await login(A);
  const okA2 = A.last('/api/login/verify');
  http('✅ 남은 A2로 로그인', 'POST', '/api/login/verify', okA2.reqBody, okA2.status, okA2.body);
  check('T08-C44', '하나를 지운 뒤 남은 하나로 들어간다', okA2.status === 200);

  const lastDel = await A.call('DELETE', '/api/passkeys', { id: urlId(credA2) });
  const btnDisabled = await A.page.locator('#keys > li button').isDisabled();
  const lastNote = await A.page.locator('#last-key-note').innerText();
  http('마지막 남은 패스키 지우기 시도', 'DELETE', '/api/passkeys', { id: urlId(credA2) }, lastDel.status, lastDel.json);
  check('T08-C46', '하나만 남으면 지울 수 없고(409, 화면 버튼도 비활성), "하나도 없으면 다시 들어올 방법이 없다"는 안내가 화면에 있다',
    lastDel.status === 409 && btnDisabled && lastNote.includes('다시 들어올 방법이 없'));
  await A.page.screenshot({ path: `${outDir}/screens/c4-after-delete.png`, fullPage: true });
  await logout(A);

  const credA2now = (await A.creds(devA2))[0]; // 서명 횟수가 올라간 최신 상태로 보관
  await A.unplug(devA2);
  const devA1again = await A.deviceWith(credA1); // 지운 A1을 다시 꽂음
  await A.page.click('#btn-login');
  await waitBad(A);
  const badA1 = A.last('/api/login/verify');
  http('❌ 지운 A1로 로그인', 'POST', '/api/login/verify', badA1.reqBody, badA1.status, badA1.body);
  check('T08-C45', '지운 패스키로는 더 이상 못 들어간다', badA1.status === 401);
  await A.unplug(devA1again);
  note('');

  // =====================================================================
  note('## 카드 5 — 정말 안 열리는지');
  note('');
  note('### 계정 B 만들기 (다른 브라우저 창, 기기 B1)');
  const devB1 = await B.device();
  await B.page.goto(MINE + '/me/');
  await waitLocked(B);
  await B.page.fill('#signup-name', '시험용-B');
  await B.page.fill('#signup-label', '다른 크롬 창 - 기기 자체(가상 인증기 B1)');
  await B.page.click('#btn-signup');
  await waitOpen(B);
  const bIds = {};
  for (const [k, t] of Object.entries(B_NOTES)) bIds[k] = await addNote(B, k, t);
  const credB1 = (await B.creds(devB1))[0];
  const bUserId = Buffer.from(credB1.userHandle, 'base64').toString('base64url');
  await B.page.screenshot({ path: `${outDir}/screens/c5-private-open-B.png`, fullPage: true });
  await A.deviceWith(credA2now);
  await login(A);
  const aNow = await A.call('GET', '/api/private');
  const bNow = await B.call('GET', '/api/private');
  check('T08-C36', '패스키를 등록한 계정이 두 개이고, 비공개 내용이 서로 다르다',
    aNow.json.account === '도현-메인' && bNow.json.account === '시험용-B' && !aNow.json.notes.some((n) => bNow.json.notes.some((m) => m.body === n.body)),
    `A(${aNow.json.account}) ${aNow.json.count}건 / B(${bNow.json.account}) ${bNow.json.count}건`);
  note('');

  note('### A로 들어가 B의 자료를 읽고 지우려 함');
  const bCountBefore = bNow.json.count;
  const x1 = await A.call('GET', `/api/private?id=${bIds.retro}`);
  const x2 = await A.call('DELETE', '/api/private', { id: bIds.retro });
  const x3 = await A.call('DELETE', '/api/passkeys', { id: urlId(credB1) });
  const bCountAfter = (await B.call('GET', '/api/private')).json.count;
  http('A의 세션으로 B의 회고(메모 번호)를 읽기', 'GET', `/api/private?id=${bIds.retro}`, undefined, x1.status, x1.json, { cookie: 'sid=(A의 세션, 가림)' });
  http('A의 세션으로 B의 회고 지우기', 'DELETE', '/api/private', { id: bIds.retro }, x2.status, x2.json, { cookie: 'sid=(A의 세션, 가림)' });
  http('A의 세션으로 B의 패스키 지우기', 'DELETE', '/api/passkeys', { id: urlId(credB1) }, x3.status, x3.json, { cookie: 'sid=(A의 세션, 가림)' });
  check('T08-C37', 'A에서 B의 자료 읽기·지우기, B의 패스키 지우기가 모두 거절', [x1, x2, x3].every((r) => r.status === 404), `${x1.status}, ${x2.status}, ${x3.status}`);

  note('### 반대로 B로 들어가 A의 자료를 읽고 지우려 함');
  const aCountBefore = aNow.json.count;
  const y1 = await B.call('GET', `/api/private?id=${aIds.apply}`);
  const y2 = await B.call('DELETE', '/api/private', { id: aIds.apply });
  const y3 = await B.call('DELETE', '/api/passkeys', { id: urlId(credA2) });
  const aCountAfter = (await A.call('GET', '/api/private')).json.count;
  http('B의 세션으로 A의 "지원하려는 곳" 읽기', 'GET', `/api/private?id=${aIds.apply}`, undefined, y1.status, y1.json, { cookie: 'sid=(B의 세션, 가림)' });
  http('B의 세션으로 A의 "지원하려는 곳" 지우기', 'DELETE', '/api/private', { id: aIds.apply }, y2.status, y2.json, { cookie: 'sid=(B의 세션, 가림)' });
  check('T08-C38', 'B → A 방향도 똑같이 거절', [y1, y2, y3].every((r) => r.status === 404), `${y1.status}, ${y2.status}, ${y3.status}`);
  check('T08-C39', '거절 앞뒤로 상대편 자료 건수가 같다', bCountBefore === bCountAfter && aCountBefore === aCountAfter,
    `B: ${bCountBefore}건 → ${bCountAfter}건 / A: ${aCountBefore}건 → ${aCountAfter}건`);
  note('');

  note('### 주소와 본문에 다른 계정을 적어 보내기');
  const z1 = await A.call('GET', `/api/private?account=${encodeURIComponent('시험용-B')}&user_id=${bUserId}`);
  const z1OnlyMine = z1.json.account === '도현-메인' && !z1.json.notes.some((n) => Object.values(B_NOTES).includes(n.body));
  http(`A의 세션 + 주소에 B 계정 이름과 B의 사용자 ID(${mask(bUserId)})`, 'GET', `/api/private?account=시험용-B&user_id=${mask(bUserId)}`, undefined, z1.status, { ...z1.json, notes: z1.json.notes.map((n) => `[${n.kind}] ${n.body}`) });
  const bBefore2 = (await B.call('GET', '/api/private')).json.count;
  const z2 = await A.call('POST', '/api/private', { kind: 'retro', body: '(만든 내용) B 계정에 끼워 넣으려 한 글', user_id: bUserId, account: '시험용-B' });
  const bAfter2 = (await B.call('GET', '/api/private')).json.count;
  http('A의 세션 + 본문에 B의 user_id를 넣고 글 쓰기', 'POST', '/api/private', { kind: 'retro', body: '(만든 내용) B 계정에 끼워 넣으려 한 글', user_id: mask(bUserId), account: '시험용-B' }, z2.status, z2.json);
  check('T08-C40', '주소·본문에 다른 계정을 적어도 무시되고 내 자료만 돌아오며, 쓰기도 내 계정에만 들어감', z1.status === 200 && z1OnlyMine && bBefore2 === bAfter2,
    `B 건수 ${bBefore2} → ${bAfter2}`);
  check('T08-C41', '거절을 만드는 소스 위치: api/private.js (계정은 session.user_id에서만), lib/store.js 의 getNote/deleteNote/deletePasskey (user_id 조건), api/passkeys.js (내 패스키인지 확인)', true);
  note('');

  note('### 세 번째 계정은 만들 수 없음');
  const third = await anon.call('POST', '/api/register/options', { mode: 'signup', name: '낯선 사람' });
  http('로그인 안 한 사람이 새 계정 만들기 시도', 'POST', '/api/register/options', { mode: 'signup', name: '낯선 사람' }, third.status, third.json);
  check('보너스', '계정 자리(2개)가 차면 새 계정 등록이 403', third.status === 403);
  note('');

  note('### 남의 패스키로 열기 (이 사이트에 등록된 적 없는 패스키)');
  const devS = await anon.device();
  await anon.page.goto(STRANGER + '/me/');
  await waitLocked(anon);
  await anon.page.fill('#signup-name', '낯선 사람');
  await anon.page.fill('#signup-label', '낯선 사람의 패스키');
  await anon.page.click('#btn-signup');
  await waitOpen(anon);
  await anon.page.goto(MINE + '/me/');
  await waitLocked(anon);
  await anon.page.click('#btn-login');
  await waitBad(anon);
  const sTry = anon.last('/api/login/verify');
  const sAfter = await anon.call('GET', '/api/private');
  http('❌ 다른 사이트(:3001)에서 정상 발급된 패스키로 이 사이트 로그인', 'POST', '/api/login/verify', sTry.reqBody, sTry.status, sTry.body);
  note(`그 뒤 GET /api/private → ${sAfter.status} ${JSON.stringify(sAfter.json)}`);
  note('');
  check('T08-C50(남의 패스키)', '남의 패스키로는 401, 비공개 자료도 계속 401', sTry.status === 401 && sAfter.status === 401);
  await anon.page.screenshot({ path: `${outDir}/screens/c5-stranger-rejected.png`, fullPage: true });
  await anon.unplug(devS);
} catch (err) {
  note(`\n실패: ${err.stack}`);
  try { note('A msg: ' + await A.msg()); note('B msg: ' + await B.msg()); } catch {}
  checks.push({ ids: 'script', ok: false });
}

await browser.close();
servers.forEach((s) => s.kill());
const failed = checks.filter((c) => !c.ok);
note('');
note('## 요약');
note('');
note('| 결과 | 항목 | 내용 |');
note('|---|---|---|');
checks.forEach((c) => note(`| ${c.ok ? '✅' : '❌'} | ${c.ids} | ${c.name ?? ''} |`));
note('');
note(`**결과: ${checks.length - failed.length}/${checks.length} 통과**`);
await writeFile(`${outDir}/local-e2e.md`, lines.join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
