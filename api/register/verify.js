// [등록 2/2] 기기가 만든 "공개키"를 받아 확인하고 저장합니다.
// 개인키는 기기 안에 남고, 이 요청에는 들어 있지 않습니다.
// 사용자가 등록 창을 취소하면 브라우저가 이 요청을 아예 보내지 않으므로 아무것도 저장되지 않습니다.
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { handler, sendJson, readJson, HttpError } from '../../lib/http.js';
import { getConfig } from '../../lib/config.js';
import { getStore } from '../../lib/store.js';
import { getSession, consumeChallenge, startSession } from '../../lib/auth.js';
import { USER_VERIFICATION } from '../../lib/webauthn.js';

export default handler(['POST'], async (req, res) => {
  const cfg = getConfig();
  const store = getStore();
  const body = await readJson(req);
  // 질문을 먼저 꺼내서 지움 → 실패하더라도 같은 질문은 다시 못 씀
  const row = await consumeChallenge(req, res, ['signup', 'add-passkey']);
  const session = await getSession(req);

  // 옵션을 받은 뒤 상황이 바뀌었을 수 있으니 권한을 한 번 더 확인
  if (row.purpose === 'add-passkey') {
    if (!session || session.user_id !== row.user_id) throw new HttpError(403, '내 계정에만 패스키를 추가할 수 있습니다.');
  } else {
    if ((await store.countUsers()) >= cfg.maxAccounts) throw new HttpError(403, '새 계정 자리가 없습니다.');
  }

  let result;
  try {
    result = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: row.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      requireUserVerification: USER_VERIFICATION === 'required',
    });
  } catch (err) {
    throw new HttpError(400, `등록 응답 검증 실패: ${err.message}`);
  }
  if (!result.verified || !result.registrationInfo) throw new HttpError(400, '등록 응답을 확인하지 못했습니다.');

  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  if (row.purpose === 'signup') await store.createUser({ id: row.user_id, name: row.user_name });
  const existing = await store.countPasskeys(row.user_id);
  const label = String(body.label || '').trim().slice(0, 40) || `패스키 ${existing + 1}`;
  await store.addPasskey({
    id: credential.id,
    user_id: row.user_id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey), // ← 저장되는 것은 공개키뿐
    counter: credential.counter,
    transports: credential.transports || null,
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    label,
  });

  // 새 계정이면 바로 로그인 상태로
  if (row.purpose === 'signup') await startSession(res, row.user_id, credential.id);

  sendJson(res, 200, {
    ok: true,
    saved: {
      account: row.user_name,
      id: credential.id,
      label,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      publicKeyBytes: credential.publicKey.length,
      deviceType: credentialDeviceType,
    },
  });
});
