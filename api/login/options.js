// [로그인 1/2] 서버가 매번 새 질문(challenge)을 만들어 보냅니다.
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { handler, sendJson } from '../../lib/http.js';
import { getConfig } from '../../lib/config.js';
import { rememberChallenge } from '../../lib/auth.js';
import { USER_VERIFICATION } from '../../lib/webauthn.js';

export default handler(['POST'], async (req, res) => {
  const cfg = getConfig();
  const options = await generateAuthenticationOptions({
    rpID: cfg.rpID,
    // 비워 두면 기기가 이 사이트용 패스키를 스스로 찾아 줍니다 (등록된 ID 목록을 밖에 알리지 않음)
    allowCredentials: [],
    userVerification: USER_VERIFICATION,
  });
  await rememberChallenge(res, options.challenge, 'login');
  sendJson(res, 200, { ok: true, options });
});
