// [등록 1/2] 서버가 일회용 질문을 만들고, "새 열쇠를 만들어 주세요" 요청서를 보냅니다.
// 질문은 me_challenges 에 5분 동안 보관했다가, 등록 2/2 에서 꺼내는 순간 지웁니다.
//
// 두 가지 경우
//   mode: 'signup' — 새 계정 + 그 계정의 첫 패스키. 로그인 안 한 상태에서만, 계정 수가 MAX_ACCOUNTS(기본 2) 미만일 때만.
//   mode: 'add'    — 이미 로그인한 내 계정에 패스키 하나 더. 로그인 필수.
import { randomBytes } from 'node:crypto';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { handler, sendJson, readJson, HttpError } from '../../lib/http.js';
import { getConfig } from '../../lib/config.js';
import { getStore } from '../../lib/store.js';
import { getSession, rememberChallenge } from '../../lib/auth.js';
import { USER_VERIFICATION } from '../../lib/webauthn.js';

export default handler(['POST'], async (req, res) => {
  const cfg = getConfig();
  const store = getStore();
  const body = await readJson(req);
  const session = await getSession(req);

  let userId, userName, excludeCredentials = [], purpose;
  if (body.mode === 'add') {
    if (!session) throw new HttpError(401, '패스키를 추가하려면 먼저 로그인하세요.');
    const user = await store.getUser(session.user_id);
    userId = user.id;
    userName = user.name;
    // 이 계정에 이미 등록된 기기로 또 등록하는 것을 막음 → 두 번째 패스키는 "다른 기기/다른 저장소"여야 함
    excludeCredentials = (await store.listPasskeys(userId)).map((p) => ({ id: p.id, transports: p.transports || undefined }));
    purpose = 'add-passkey';
  } else if (body.mode === 'signup') {
    if (session) throw new HttpError(400, '이미 로그인한 상태입니다. 로그아웃 후 새 계정을 만드세요.');
    if ((await store.countUsers()) >= cfg.maxAccounts) {
      throw new HttpError(403, `새 계정 자리가 없습니다. (최대 ${cfg.maxAccounts}개, 이미 다 만들어짐)`);
    }
    userName = String(body.name || '').trim().slice(0, 30);
    if (!userName) throw new HttpError(400, '계정 이름을 적어 주세요.');
    userId = isoBase64URL.fromBuffer(randomBytes(16)); // 새 계정 ID (랜덤, 개인정보 아님)
    purpose = 'signup';
  } else {
    throw new HttpError(400, "mode 는 'signup' 또는 'add' 여야 합니다.");
  }

  const options = await generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpID,
    userID: isoBase64URL.toBuffer(userId),
    userName,
    userDisplayName: userName,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'required', // 아이디 입력 없이 기기가 이 사이트용 패스키를 찾도록
      userVerification: USER_VERIFICATION,
    },
  });

  await rememberChallenge(res, options.challenge, purpose, { userId, userName });
  sendJson(res, 200, { ok: true, mode: body.mode, options });
});
