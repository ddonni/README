// 비공개 자료. 세션이 없으면 401.
// 어느 계정의 자료인지는 "세션"만 보고 정합니다. 주소(?account=, ?user=)나 본문(user_id)에
// 다른 계정을 적어 보내도 무시하고, 언제나 로그인한 내 계정 것만 돌려줍니다.
// 내용은 저장소(DB)에 있고 코드에는 없습니다 → 공개 GitHub 저장소를 봐도 안 보임.
//
//   GET    /api/private          내 메모 전부 (세 종류)
//   GET    /api/private?id=N     메모 하나. 내 것이 아니면 404 (남의 메모가 있는지조차 알려 주지 않음)
//   POST   /api/private          { kind, body } 내 계정에 추가
//   DELETE /api/private          { id } 내 것만 지움. 남의 것이면 404
import { handler, sendJson, readJson, HttpError } from '../lib/http.js';
import { getStore } from '../lib/store.js';
import { requireSession } from '../lib/auth.js';
import { NOTE_KINDS } from '../lib/webauthn.js';

const OTHER_ACCOUNT_KEYS = ['account', 'user', 'user_id', 'userId', 'owner'];

export default handler(['GET', 'POST', 'DELETE'], async (req, res) => {
  const session = await requireSession(req); // ← 로그인 안 했으면 여기서 401
  const me = session.user_id;                 // ← 계정은 오직 세션에서
  const store = getStore();
  const query = new URL(req.url, 'http://x').searchParams;
  const ignoredQuery = OTHER_ACCOUNT_KEYS.filter((k) => query.has(k));

  if (req.method === 'POST') {
    const body = await readJson(req);
    const ignoredBody = OTHER_ACCOUNT_KEYS.filter((k) => k in body);
    const kind = String(body.kind || '');
    if (!NOTE_KINDS[kind]) throw new HttpError(400, `kind 는 ${Object.keys(NOTE_KINDS).join(', ')} 중 하나`);
    const text = String(body.body || '').trim();
    if (!text) throw new HttpError(400, '내용이 비어 있습니다.');
    if (text.length > 500) throw new HttpError(400, '500자까지 쓸 수 있습니다.');
    const note = await store.addNote(me, kind, text);
    return sendJson(res, 201, { ok: true, note, ...(ignoredBody.length && { ignored: ignoredBody }) });
  }

  if (req.method === 'DELETE') {
    const { id } = await readJson(req);
    const removed = await store.deleteNote(id, me);
    if (!removed) throw new HttpError(404, '없거나 내 자료가 아닙니다.');
    return sendJson(res, 200, { ok: true, removed: id });
  }

  if (query.has('id')) {
    const note = await store.getNote(query.get('id'), me);
    if (!note) throw new HttpError(404, '없거나 내 자료가 아닙니다.');
    return sendJson(res, 200, { ok: true, note });
  }

  const user = await store.getUser(me);
  const notes = await store.listNotes(me);
  sendJson(res, 200, {
    ok: true,
    account: user.name,
    kinds: NOTE_KINDS,
    count: notes.length,
    notes,
    ...(ignoredQuery.length && { ignored: ignoredQuery, note: '다른 계정을 가리키는 값은 무시하고 내 자료만 돌려줍니다.' }),
  });
});
