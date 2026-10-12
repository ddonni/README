// [로그인 2/2] 기기가 질문에 서명해 보낸 답을, 저장해 둔 공개키로 확인합니다.
// 확인에 성공해야만 세션을 만듭니다. 세션에는 "어느 계정인지"가 패스키에서 정해져 들어갑니다.
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { handler, sendJson, readJson, HttpError } from '../../lib/http.js';
import { getConfig } from '../../lib/config.js';
import { getStore } from '../../lib/store.js';
import { consumeChallenge, startSession } from '../../lib/auth.js';
import { toLibCredential, USER_VERIFICATION } from '../../lib/webauthn.js';

export default handler(['POST'], async (req, res) => {
  const cfg = getConfig();
  const store = getStore();
  const body = await readJson(req);
  // 질문은 꺼내는 순간 지워짐 → 같은 답을 다시 보내도 "이미 사용한 질문"으로 막힘
  const { challenge: expectedChallenge } = await consumeChallenge(req, res, ['login']);

  const credId = body?.response?.id;
  if (!credId) throw new HttpError(400, '패스키 응답이 비어 있습니다.');
  const row = await store.getPasskey(credId);
  // 등록되지 않은 패스키(남의 사이트 것, 지운 것): 서버에 그 공개키가 없으므로 여기서 거절
  if (!row) throw new HttpError(401, '등록되지 않은 패스키입니다.');
  // 기기가 알려 준 계정 ID와 패스키 주인이 다르면 거절
  const handle = body.response.response?.userHandle;
  if (handle && handle !== row.user_id) throw new HttpError(401, '패스키와 계정이 맞지 않습니다.');

  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      credential: toLibCredential(row),
      requireUserVerification: USER_VERIFICATION === 'required',
    });
  } catch (err) {
    throw new HttpError(401, `서명 검증 실패: ${err.message}`);
  }
  if (!result.verified) throw new HttpError(401, '서명을 확인하지 못했습니다.');

  await store.touchPasskey(row.id, result.authenticationInfo.newCounter);
  await startSession(res, row.user_id, row.id);
  const user = await store.getUser(row.user_id);
  sendJson(res, 200, { ok: true, account: user?.name, passkey: { id: row.id, label: row.label } });
});
