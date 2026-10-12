# 과제 8 제출물 — 내 소개 페이지에 패스키 달기

> 비공개 자리에 넣은 내용은 모두 **만들어 넣은 것**입니다(가상의 회사 이름, 연습용 메모). 실제 연락처·주소·신분증 번호 같은 개인정보는 어디에도 없습니다. 계정 이름도 실명이 아닌 "도현-메인", "시험용-B"입니다. (T08-C12)

## 결과물·소스 주소
- 결과물: https://readme-two-tau.vercel.app/ — 첫 화면은 1번 과제의 공개 소개 그대로, 맨 아래 점선 상자 "여기부터 비공개 영역" → `/me/` 만 잠김
- 소스: https://github.com/ddonni/README

---

## 인증 구현 설명서

### ① 무엇으로 붙였나
- **라이브러리**: SimpleWebAuthn — 서버 `@simplewebauthn/server` 13.3, 브라우저 `@simplewebauthn/browser` 13.3 (파일을 `me/vendor/`에 직접 넣음)
- **세션은 직접 구현**: 랜덤 토큰을 `HttpOnly; Secure; SameSite=Strict` 쿠키(`__Host-sid`)로 주고, 서버 DB(`me_sessions`)에는 토큰의 SHA-256만 저장
- **저장소**: Supabase(Postgres) 테이블 5개 — `me_users`, `me_passkeys`, `me_challenges`, `me_sessions`, `me_notes` (모두 RLS 켬, 서버의 service_role 키로만 접근)
- **서버**: Vercel 서버리스 함수(`api/*.js`)
- 인증 서비스(Supabase Auth, Auth0 등)는 쓰지 않았습니다.

### ② 왜 그걸 골랐나
- 서명 검증, CBOR·COSE 공개키 해석, origin·RP ID 확인을 직접 짜면 틀리기 쉬운 데 비해 결과는 눈에 안 보입니다. 그래서 이 부분은 검증된 라이브러리에 맡겼습니다.
- 대신 **언제 질문을 만들고 언제 지우는지, 누가 등록·삭제할 수 있는지, 어느 계정 자료를 돌려줄지**는 직접 코드로 써서 흐름이 보이게 했습니다.
- 인증 서비스를 쓰면 이 흐름이 서비스 안에 숨어서 "공개키만 저장된다", "질문이 일회용이다"를 내 기록으로 보여 주기 어렵습니다.
- 소개 페이지가 이미 Vercel에 있었고, 7번 과제에서 Supabase와 세션 쿠키를 써 봤기 때문에 같은 조합을 골랐습니다.

### ③ 어디를 어떻게 고쳤나
1번 소개 페이지의 공개 내용은 그대로 두었습니다. `index.html`에는 맨 아래 경계 상자 하나만 더했고, 나머지는 새로 만든 파일입니다.

| 흐름 | 지나는 곳 |
|---|---|
| **등록** | `me/index.html`의 `register()` → `POST /api/register/options` (`api/register/options.js`: 질문 생성, `lib/auth.js`의 `rememberChallenge`로 DB 보관) → 브라우저/기기가 열쇠 생성 → `POST /api/register/verify` (`api/register/verify.js`: `consumeChallenge`로 질문 꺼내며 삭제 → `verifyRegistrationResponse` → `me_passkeys`에 공개키 저장) |
| **로그인** | `login()` → `POST /api/login/options` (`api/login/options.js`: 매번 새 질문) → 기기가 개인키로 서명 → `POST /api/login/verify` (`api/login/verify.js`: 질문 꺼내며 삭제 → 패스키 ID로 공개키 찾기(없으면 401) → `verifyAuthenticationResponse` → 서명 횟수 갱신 → `lib/auth.js`의 `startSession`) |
| **로그아웃** | `POST /api/logout` (`api/logout.js` → `lib/auth.js`의 `endSession`: DB 세션 줄 삭제 + 쿠키 비움) |
| **비공개 자료 조회** | `loadOpen()` → `GET /api/private` (`api/private.js`: `requireSession` 없으면 401, 계정은 `session.user_id`에서만 → `lib/store.js`의 `listNotes(userId)`/`getNote(id, userId)`) |
| 패스키 목록·삭제 | `GET/DELETE /api/passkeys` (`api/passkeys.js`: 내 패스키만, 마지막 하나는 409) |

**남의 자료를 거절하는 소스 위치 (T08-C41)**
- `api/private.js`: 주소·본문의 계정 값은 무시하고 `session.user_id`만 씀
- `lib/store.js`의 `getNote`, `deleteNote`, `deletePasskey`: 모든 조회·삭제에 `user_id` 조건이 붙어 있어 남의 ID를 줘도 0건이 되고, 404로 응답
- `api/passkeys.js`: 내 패스키 목록에 있는지 먼저 확인

남의 자료에 403 대신 404를 준 건 일부러입니다. 403이면 "그 번호의 자료가 있긴 하다"는 사실이 새기 때문입니다.

### ④ 안 열리는 것을 확인한 기록
전체 기록은 `docs/evidence/local-e2e.md`에 있습니다(29/29 통과). 실제 크롬에 가상 인증기를 붙여 버튼을 눌러 가며 확인했고, 각 확인마다 통과한 요청과 거절된 요청을 나란히 적었습니다.

| 확인 | ✅ 통과한 요청 | ❌ 거절된 요청 |
|---|---|---|
| 1. 로그인 없이 열기 | 로그인 뒤 `GET /api/private` → 200, 내 메모 3건 | 쿠키 없이 `GET /api/private` → **401** "로그인이 필요합니다", `?id=3` → 401, `/me/` HTML 원문에 비공개 내용 없음 |
| 2. 남의 패스키로 열기 | 내 패스키로 `POST /api/login/verify` → 200 | 다른 사이트에서 정상 발급된 패스키 → **401** "등록되지 않은 패스키입니다"<br>계정 B로 들어가 A의 메모 읽기·지우기·A의 패스키 지우기 → **404** (반대 방향도 같음, 상대편 건수 3→3) |
| 3. 이미 쓴 질문 재사용 | 기기가 만든 그대로 → 200 | 같은 요청 그대로 재전송 → **400** "질문이 없습니다"<br>새 질문을 받고 옛 서명 → **401** "Unexpected authentication response challenge"<br>서명 1바이트 변조 → **401** "서명을 확인하지 못했습니다" |
| 4. 패스키 삭제 뒤 로그인 | A1 삭제 후 남은 A2로 로그인 → 200 | 지운 A1로 로그인 → **401** "등록되지 않은 패스키입니다"<br>마지막 A2 삭제 시도 → **409** |

**배포 사이트에서도 확인할 것**
- `npm run stranger-check -- https://readme-two-tau.vercel.app`: 남의 패스키 요청·응답을 `docs/evidence/stranger-readme-two-tau.vercel.app.md`로 남깁니다. 아무것도 바꾸지 않습니다.
- 개발자도구 Network에서 성공한 `login/verify`를 "Copy as fetch"로 복사해 Console에서 다시 실행 → 400이 나오는지 봅니다.

### ⑤ AI와 나
- **AI에게 맡긴 일**: (직접 작성)
- **내가 직접 판단한 일**: (직접 작성)
- **AI 제안을 따르지 않은 일**: (직접 작성 — 없다면 왜 없었는지)

### ⑥ 아직 못 막은 것
1. **계정 만들기 창이 잠깐 열려 있음**
   - 계정은 최대 2개(`MAX_ACCOUNTS`)이고, 다 차면 새 계정 등록은 403입니다.
   - 하지만 배포 직후부터 내가 두 계정을 만들 때까지는, `/me/` 주소를 아는 누구나 먼저 계정을 만들어 자리를 차지할 수 있습니다. 초대 코드 같은 확인이 없습니다.
2. **질문 요청 횟수 제한이 없음**
   - `POST /api/login/options`를 계속 부르면 `me_challenges`에 5분짜리 줄이 계속 쌓입니다.
   - 만료된 줄은 다음 검증 때만 청소됩니다. 요청 횟수 제한(rate limit)이 없어 DB를 채우는 공격을 막지 못합니다.
3. **패스키를 모두 잃으면 복구할 길이 없음**
   - 마지막 패스키 삭제는 막았지만, 등록한 기기 두 개를 모두 잃어버리면 그 계정에는 들어갈 방법이 없습니다.
   - 복구 메일·백업 코드가 없어서, Supabase에서 직접 DB를 고쳐야 합니다.
4. **다른 기기의 세션을 끊는 버튼이 없음**
   - "다른 기기에서 모두 로그아웃"이 없습니다. 휴대폰을 잃어버렸는데 그 휴대폰이 로그인 상태라면, 최대 8시간 동안은 세션이 살아 있습니다.
   - 끊는 방법은 그 패스키를 지우는 것뿐입니다(지우면 그 패스키로 연 세션도 함께 삭제됨).
5. **동기화 패스키에서는 복제 감지가 안 됨**
   - 기기 패스키는 서명 횟수가 줄면 거절합니다. 시험 중 실제로 "counter value 2 was lower than expected 3"으로 막힌 적이 있습니다.
   - 하지만 구글·애플 동기화 패스키는 횟수를 늘 0으로 보내므로 이 확인이 작동하지 않습니다.

---

## 패스키를 저장한 곳 (T08-C26) — 직접 확인해서 작성
- 계정 A 패스키 1: (예: 갤럭시 휴대폰 — 구글 비밀번호 관리자)
- 계정 A 패스키 2: (예: 윈도우 노트북 — Windows Hello, 기기 자체)
- 계정 B 패스키: (예: 다른 크롬 프로필 — 구글 비밀번호 관리자 / 보안 키)

## 로그인 뒤 사람을 알아보는 방법 (T08-C32)
- **세션 쿠키 방식**입니다(JWT 같은 토큰을 브라우저가 들고 다니는 방식이 아님).
- 쿠키에는 랜덤 값만 있습니다. 서버가 그 해시로 `me_sessions`에서 "어느 계정, 어느 패스키로 들어왔는지"를 찾습니다.
- 로그아웃하면 그 줄을 지우므로, 같은 쿠키 값으로 다시 요청해도 401입니다.

---

## 짧은 확인 방법
- **① 어디로 가나요**: https://readme-two-tau.vercel.app/ 을 새 시크릿 창으로 엽니다.
- **② 세 단계 안에 무엇을 하나요**: (1) 소개 페이지가 그냥 보이는지 봅니다 (2) 맨 아래 점선 상자의 "나만의 자리 →"를 누릅니다 (3) https://readme-two-tau.vercel.app/api/private 를 주소창에 직접 엽니다.
- **③ 무엇이 보이면 통과인가요**: 소개는 보이고, `/me/`에는 "잠겨 있음"과 "패스키로 들어가기" 버튼만 있으며, `/api/private`는 `{"ok":false,"error":"로그인이 필요합니다."}`(401)입니다.
- **④ 안 될 때는 무엇이 보이나요**: "패스키로 들어가기"를 눌러도 이 사이트용 패스키가 없으니 창이 닫히고 빨간 글씨 "취소했거나 시간이 지났습니다"가 뜹니다. 이것이 잠김이 정상인 모습입니다. 만약 메모 내용이 보인다면 잠금이 실패한 것입니다.

## AI와 내 판단
- **① AI에게 맡긴 일**: (직접 작성)
- **② 내가 직접 판단한 일**: (직접 작성)
- **③ AI 제안을 따르지 않은 일**: (직접 작성)
