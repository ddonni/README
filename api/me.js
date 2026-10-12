// 지금 로그인 상태인지, 새 계정을 만들 수 있는지만 알려 줍니다. (비공개 내용은 없음)
import { handler, sendJson } from '../lib/http.js';
import { getConfig } from '../lib/config.js';
import { getStore } from '../lib/store.js';
import { getSession } from '../lib/auth.js';

export default handler(['GET'], async (req, res) => {
  const store = getStore();
  const session = await getSession(req);
  const user = session ? await store.getUser(session.user_id) : null;
  sendJson(res, 200, {
    ok: true,
    loggedIn: Boolean(session),
    account: user ? { name: user.name } : null,
    signupOpen: (await store.countUsers()) < getConfig().maxAccounts,
  });
});
