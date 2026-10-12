# 과제 8 — 내 소개 페이지에 패스키 달기

- 공개: `/` — 지금까지의 소개 페이지. 누구나 봄. 바뀐 건 맨 아래 "여기부터 비공개 영역" 점선 상자 하나뿐.
- 비공개: `/me/` — 패스키로만 열리는 자리. 화면(HTML)은 누구나 받아 갈 수 있지만 **내용은 `/api/private`가 로그인한 계정에게, 그 계정 것만** 줍니다.
- 계정은 최대 2개(`MAX_ACCOUNTS`, 기본 2): 내 계정 + 서로 못 읽는지 확인할 시험용 계정. 다 차면 새 계정 만들기가 닫힙니다.
- 비공개 항목 세 종류: 준비 중인 프로젝트 메모 / 지원하려는 곳 / 회고

## 파일 지도 (어디를 지나가나)

| 하는 일 | 파일 |
|---|---|
| 등록 1/2 — 서버가 "새 열쇠 만들어 주세요" 요청서 + 질문 발급 | `api/register/options.js` |
| 등록 2/2 — 기기가 보낸 **공개키** 검증·저장 | `api/register/verify.js` |
| 로그인 1/2 — 매번 새 질문 발급 | `api/login/options.js` |
| 로그인 2/2 — 서명을 저장된 공개키로 검증, 세션 시작 | `api/login/verify.js` |
| 로그아웃 — 서버 세션 삭제 + 쿠키 비움 | `api/logout.js` |
| 비공개 자료 조회/추가 (세션 없으면 401) | `api/private.js` |
| 패스키 목록(이름·등록일·공개키)·삭제 — 내 것만, 마지막 하나는 409 | `api/passkeys.js` |
| 로그인 상태만 알려 줌 | `api/me.js` |
| 질문 일회용 처리, 세션 쿠키 | `lib/auth.js` |
| 저장소(Supabase / 로컬 메모리) | `lib/store.js` |
| 테이블 만들기 | `supabase/schema.sql` |
| 비공개 화면 | `me/index.html` |
| 검증 스크립트 | `scripts/e2e.mjs`, `scripts/stranger-check.mjs` |

## 배포 순서

1. **Supabase**: 새 프로젝트(또는 기존 프로젝트) → SQL Editor → `supabase/schema.sql` 전체 실행.
   테이블 이름이 `me_`로 시작해서 다른 과제 테이블과 겹치지 않습니다.
2. Supabase → Project Settings → API 에서 `Project URL`, `service_role` 키를 확인. (service_role 키는 비밀값 — 코드·문서·캡처에 절대 넣지 않음)
3. **Vercel** → readme 프로젝트 → Settings → Environment Variables (Production):
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role 키
   - `RP_ID` = `readme-two-tau.vercel.app`
   - `ORIGIN` = `https://readme-two-tau.vercel.app`
   - (선택) `MAX_ACCOUNTS` = `2`
4. 이 폴더 내용을 저장소에 올리고 push → Vercel이 다시 배포. (Framework Preset: Other, Build Command 비움)
5. **배포되자마자** 휴대폰으로 `/me/` → "새 계정 만들기"(계정 이름: 실명 말고 예) 도현-메인, 패스키 이름: 예) 갤럭시 - 구글 비밀번호 관리자).
6. 같은 계정에 두 번째 패스키: 노트북에서 `/me/` → "패스키로 들어가기" → 창에서 **"다른 기기 사용 / QR"** → 휴대폰으로 QR 찍어 로그인 → 노트북에서 "패스키 하나 더 등록"(예: 노트북 - Windows Hello).
   - 같은 Apple ID 키체인처럼 이미 같은 패스키가 동기화된 저장소에서는 "이미 등록됨"으로 막힙니다. 다른 저장소(Windows Hello, 다른 구글 계정의 크롬 프로필, 보안 키)를 쓰세요.
7. 시험용 계정 B: 다른 브라우저(또는 다른 크롬 프로필)에서 `/me/` → 새 계정 만들기(예: 시험용-B) → A와 **다른** 메모 3개.
8. 계정 두 개가 차면 `npm run stranger-check -- https://readme-two-tau.vercel.app` 로 배포 사이트 확인 기록을 남깁니다(마지막 줄이 "통과").
9. 각 계정에 세 종류 메모를 한 줄 이상씩 넣습니다. 전부 만든 내용으로.

## 로컬에서 돌려 보기

```bash
npm install
npm run dev                 # http://localhost:3000  (메모리 저장소, 재시작하면 초기화)
npm run e2e                 # 크롬 가상 인증기로 카드별(T08-Cxx) 전체 흐름 확인 → docs/evidence/local-e2e.md
npm run stranger-check -- https://readme-two-tau.vercel.app   # 배포 사이트에 남의 패스키로 두드려 보기(아무것도 안 바꿈)
```
