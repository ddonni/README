// 내 계정의 패스키 목록(이름·등록일·공개키)을 보고, 필요하면 하나를 지웁니다. 로그인 필수.
import { handler, sendJson, readJson, HttpError } from '../lib/http.js';
import { getStore } from '../lib/store.js';
import { requireSession } from '../lib/auth.js';
import { toPublicView } from '../lib/webauthn.js';

export default handler(['GET', 'DELETE'], async (req, res) => {
  const session = await requireSession(req);
  const me = session.user_id;
  const store = getStore();

  if (req.method === 'DELETE') {
    const { id } = await readJson(req);
    if (!id) throw new HttpError(400, '지울 패스키 ID가 없습니다.');
    const mine = (await store.listPasskeys(me)).some((p) => p.id === id);
    // 남의 계정 패스키 ID를 줘도 "없음" — 다른 사람 패스키는 지울 수 없음
    if (!mine) throw new HttpError(404, '없거나 내 패스키가 아닙니다.');
    // 마지막 하나를 지우면 이 계정은 영영 못 열림 → 막음
    if ((await store.countPasskeys(me)) <= 1) {
      throw new HttpError(409, '마지막 패스키는 지울 수 없습니다. 하나도 없으면 이 계정에는 다시 들어올 방법이 없습니다. 먼저 다른 기기의 패스키를 추가하세요.');
    }
    await store.deletePasskey(id, me);
    // 이 패스키로 열었던 세션은 DB에서 함께 사라짐(ON DELETE CASCADE)
    return sendJson(res, 200, { ok: true, removed: id, youWereLoggedOut: session.passkey_id === id });
  }

  const rows = await store.listPasskeys(me);
  sendJson(res, 200, {
    ok: true,
    currentPasskeyId: session.passkey_id,
    note: '서버에는 공개키만 있습니다. 개인키는 각 기기 밖으로 나오지 않습니다.',
    passkeys: rows.map(toPublicView),
  });
});
