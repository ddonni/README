// 로그아웃: 서버의 세션 줄을 지우고 쿠키도 비웁니다.
import { handler, sendJson } from '../lib/http.js';
import { endSession } from '../lib/auth.js';

export default handler(['POST'], async (req, res) => {
  await endSession(req, res);
  sendJson(res, 200, { ok: true });
});
