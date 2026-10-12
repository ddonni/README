# 과제 8 로컬 검증 기록 (카드별)

실행 시각: 2026-10-12T12:42:28.498Z · 브라우저: Chromium + 가상 인증기(CDP WebAuthn) · 서버: 로컬 개발 서버(메모리 저장소, RP ID=localhost)

비공개 칸에 넣은 내용은 모두 만들어 넣은 것입니다. 세션 토큰은 앞 4자만 남기고 가렸고, 서명·공개키 같은 긴 값은 앞부분과 길이만 적었습니다(공개키 저장 확인 칸만 전체 표시).

## 카드 2 — 패스키를 등록한다

### 등록용 질문이 매번 다르다
    1번째 POST /api/register/options → 200  challenge = 7PCVlB-ToCPNWqMG5yEGUiJDA8fzgauc0rZQoxGTp0U
    2번째 POST /api/register/options → 200  challenge = kzb1FeK706SCc45YHAYM5DxRQWwY3qJzJ6H9dLXBp70
    3번째 POST /api/register/options → 200  challenge = W8zxhndJLha4Ta3ZIDUOs_YUOTfWisrZzB5R1yK9yvc
- ✅ **T08-C19·C20** 등록 요청마다 서버가 새 질문을 만들어 보낸다 (본문은 서버 me_challenges에 5분 보관, 브라우저에는 그 줄을 가리키는 쿠키 ID만) — 세 값이 모두 다름

### 등록을 중간에 취소하면
- ✅ **T08-C25** 등록을 취소하면 화면에 안내가 나오고, 등록 확인 요청이 아예 가지 않아 서버에 저장되는 것이 없다 — 화면: "등록을 취소했거나 시간이 지났습니다. 서버에는 아무것도 저장되지 않았습니다." / register/verify 요청 0건 / GET /api/me → loggedIn=false

### 계정 A의 첫 패스키 등록 (기기 A1)
**등록 1/2 — 서버가 보낸 요청서**
```http
POST /api/register/options

{
  "mode": "signup",
  "name": "도현-메인",
  "label": "노트북 크롬 - 기기 자체(가상 인증기 A1)"
}
```
→ **200**
```json
{
  "ok": true,
  "mode": "signup",
  "options": {
    "challenge": "4FwCdZUn2M…(43자)",
    "rp": {
      "name": "곽도현의 소개 페이지",
      "id": "localhost"
    },
    "user": {
      "id": "74z7-ufz70…(22자)",
      "name": "도현-메인",
      "displayName": "도현-메인"
    },
    "pubKeyCredParams": [
      {
        "alg": -8,
        "type": "public-key"
      },
      {
        "alg": -7,
        "type": "public-key"
      },
      {
        "alg": -257,
        "type": "public-key"
      }
    ],
    "timeout": 60000,
    "attestation": "none",
    "excludeCredentials": [],
    "authenticatorSelection": {
      "residentKey": "required",
      "userVerification": "required",
      "requireResidentKey": true
    },
    "extensions": {
      "credProps": true
    },
    "hints": []
  }
}
```

**등록 2/2 — 기기가 서버로 보낸 것**
```http
POST /api/register/verify

{
  "response": {
    "id": "e1M0lDKd6H…(43자)",
    "rawId": "e1M0lDKd6H…(43자)",
    "response": {
      "attestationObject": "o2NmbXRkbm…(212자)",
      "clientDataJSON": "eyJ0eXBlIj…(183자)",
      "transports": [
        "internal"
      ],
      "publicKeyAlgorithm": -8,
      "publicKey": "MCowBQYDK2…(59자)",
      "authenticatorData": "SZYN5YgOjG…(172자)"
    },
    "type": "public-key",
    "clientExtensionResults": {
      "credProps": {
        "rk": true
      }
    },
    "authenticatorAttachment": "platform"
  },
  "label": "노트북 크롬 - 기기 자체(가상 인증기 A1)"
}
```
→ **200**
```json
{
  "ok": true,
  "saved": {
    "account": "도현-메인",
    "id": "e1M0lDKd6H…(43자)",
    "label": "노트북 크롬 - 기기 자체(가상 인증기 A1)",
    "publicKey": "pAEBAycgBi…(56자)",
    "publicKeyBytes": 42,
    "deviceType": "singleDevice"
  }
}
```

- ✅ **T08-C23** 등록 요청 본문에 개인키가 없다 (기기 안 개인키 값을 base64url·base64·hex 세 형태로 본문에서 찾아봄) — 본문 response 안의 칸: attestationObject, clientDataJSON, transports, publicKeyAlgorithm, publicKey, authenticatorData
서버에 저장된 값 (GET /api/passkeys, 공개키 전체):
```json
{
  "id": "e1M0lDKd6H8mhl1x2obseM1IJgwNR39xO9m-fsWKvJQ",
  "label": "노트북 크롬 - 기기 자체(가상 인증기 A1)",
  "publicKey": "pAEBAycgBiFYILuaJdp9lUcMy3DgUsUhK99Nqc0ZQQmf8Hd7O91OEUJ7",
  "publicKeyFormat": "COSE_Key (base64url)",
  "counter": 1,
  "deviceType": "singleDevice",
  "backedUp": false,
  "createdAt": "2026-10-12T12:42:29.365Z",
  "lastUsedAt": null
}
```
- ✅ **T08-C21·C22** 등록이 끝나면 서버에 공개키가 저장되고, 그 값은 기기 개인키로 계산한 공개키와 같다 — 비밀번호가 아님 — COSE_Key 42바이트, EdDSA(Ed25519)
- ✅ **T08-C24** 등록한 패스키에 사람이 알아볼 이름이 붙는다 — 노트북 크롬 - 기기 자체(가상 인증기 A1)

## 카드 1 — 무엇을 잠글지 먼저 가른다

- ✅ **T08-C14** 비공개 영역 항목이 세 개 이상 (준비 중인 프로젝트 메모 / 지원하려는 곳 / 회고) — 계정 A 3건
- ✅ **T08-C13** 공개 소개 아래에 "여기부터 비공개 영역" 점선 상자, /me/ 에는 "비공개 영역 · 패스키로 잠김" 표시
- ✅ **T08-C15** 로그인 안 한 /me/ 화면에 비공개 내용이 보이지 않는다
- ✅ **T08-C18** 로그인 없이 받은 /me/ 페이지 소스(HTML 원문) 어디에도 비공개 내용·계정 이름이 없다 — HTML 12841자 검사 — 내용은 로그인 뒤 /api/private 응답으로만 옴
**로그인 없이 비공개 자료 직접 요청 (응답 본문 전체)**
```http
GET /api/private
Cookie: (없음)
```
→ **401**
```json
{
  "ok": false,
  "error": "로그인이 필요합니다."
}
```

**로그인 없이 메모 하나를 번호로 직접 요청**
```http
GET /api/private?id=3
Cookie: (없음)
```
→ **401**
```json
{
  "ok": false,
  "error": "로그인이 필요합니다."
}
```

- ✅ **T08-C16·C17** 로그인 없이 서버에 직접 요청하면 401로 거절 (/api/private, ?id=, /api/passkeys) — 401, 401, 401

## 카드 3 — 패스키로 들어간다

### 로그인용 질문이 매번 다르다
    1번째 POST /api/login/options → 200  challenge = lfO9EPBmtIqUBZemIiw-BixywdrSFstzoTrAznl8PbI
    2번째 POST /api/login/options → 200  challenge = Bhfh9Ggw55x3AyV3J1thGEE7PIuYY5NCmeg6P0R10Oc
    3번째 POST /api/login/options → 200  challenge = rce0112p8EJXgdXf-Cu721P5USwpBtUBcG_iS0pHqs4
- ✅ **T08-C27·C28** 로그인 요청마다 새 질문, 세 값이 모두 다르다

### 서명 확인 — 성공한 요청과 실패한 요청
**✅ 성공: 기기가 만든 서명 그대로**
```http
POST /api/login/verify

{
  "response": {
    "id": "e1M0lDKd6H…(43자)",
    "rawId": "e1M0lDKd6H…(43자)",
    "response": {
      "authenticatorData": "SZYN5YgOjG…(50자)",
      "clientDataJSON": "eyJ0eXBlIj…(179자)",
      "signature": "2Ojgcy6Azg…(86자)",
      "userHandle": "74z7-ufz70…(22자)"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```
→ **200**
```json
{
  "ok": true,
  "account": "도현-메인",
  "passkey": {
    "id": "e1M0lDKd6H…(43자)",
    "label": "노트북 크롬 - 기기 자체(가상 인증기 A1)"
  }
}
```

**❌ 실패: 서명 마지막 1바이트만 바꿈 (질문·나머지는 정상)**
```http
POST /api/login/verify

{
  "response": {
    "id": "e1M0lDKd6H…(43자)",
    "rawId": "e1M0lDKd6H…(43자)",
    "response": {
      "authenticatorData": "SZYN5YgOjG…(50자)",
      "clientDataJSON": "eyJ0eXBlIj…(179자)",
      "signature": "8ELqQKylMQ…(86자)",
      "userHandle": "74z7-ufz70…(22자)"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```
→ **401**
```json
{
  "ok": false,
  "error": "서명을 확인하지 못했습니다."
}
```

- ✅ **T08-C29·C30** 저장된 공개키로 서명을 확인한 뒤에만 통과 — 서명이 1바이트만 달라도 401

### 이미 쓴 질문으로 다시 로그인
**위 성공 요청을 글자 하나 안 바꾸고 다시 보냄**
```http
POST /api/login/verify

{
  "response": {
    "id": "e1M0lDKd6H…(43자)",
    "rawId": "e1M0lDKd6H…(43자)",
    "response": {
      "authenticatorData": "SZYN5YgOjG…(50자)",
      "clientDataJSON": "eyJ0eXBlIj…(179자)",
      "signature": "2Ojgcy6Azg…(86자)",
      "userHandle": "74z7-ufz70…(22자)"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```
→ **400**
```json
{
  "ok": false,
  "error": "질문(challenge)이 없습니다. 처음부터 다시 시도하세요."
}
```

**새 질문을 받아 놓은 뒤 옛 서명을 보냄**
```http
POST /api/login/verify

{
  "response": {
    "id": "e1M0lDKd6H…(43자)",
    "rawId": "e1M0lDKd6H…(43자)",
    "response": {
      "authenticatorData": "SZYN5YgOjG…(50자)",
      "clientDataJSON": "eyJ0eXBlIj…(179자)",
      "signature": "2Ojgcy6Azg…(86자)",
      "userHandle": "74z7-ufz70…(22자)"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```
→ **401**
```json
{
  "ok": false,
  "error": "서명 검증 실패: Unexpected authentication response challenge \"n6sxHBKqwIviQEmgxL3byganKbylAU8NNdeg1to971k\", expected \"Y8pqjUopfmm_KcgE5zYjPxNacpDSb33qAMsMv4DI6KI\""
}
```

- ✅ **T08-C31** 이미 한 번 쓴 질문(과 그 서명)으로는 다시 못 들어온다 — 400, 401

### 로그아웃한 뒤 같은 세션 값으로 다시 요청
로그아웃 전, 이 세션 쿠키로 GET /api/private → 200 (자료 3건)

**로그아웃 후, 로그아웃 전에 쓰던 세션 쿠키를 그대로 붙여 요청**
```http
GET /api/private
Cookie: sid=ZkG6••••••••(가림, 43자)
```
→ **401**
```json
{
  "ok": false,
  "error": "로그인이 필요합니다."
}
```

- ✅ **T08-C32·C33** 로그인 뒤에는 세션 쿠키(서버 DB의 세션 줄)로 사람을 알아보고, 로그아웃하면 서버에서 지워져 같은 값으로는 401
- ✅ **T08-C34** 이 기록 어디에도 세션 값 원문이 없다
- ✅ **T08-C35** 비밀번호 입력 칸이 없다 (/me/ 화면의 input 전부 검사)

## 카드 4 — 기기를 잃어버렸을 때

- ✅ **T08-C42** 한 계정에 패스키 두 개 — 노트북 크롬 - 기기 자체(가상 인증기 A1) / 휴대폰 - 구글 비밀번호 관리자(가상 인증기 A2)
- ✅ **T08-C43** 목록 화면에 각 패스키의 이름과 등록 날짜가 보인다
**패스키 A1 지우기 (A2로 들어온 상태)**
```http
DELETE /api/passkeys

{
  "id": "e1M0lDKd6H…(43자)"
}
```
→ **200**
```json
{
  "ok": true,
  "removed": "e1M0lDKd6H8mhl1x2obseM1IJgwNR39xO9m-fsWKvJQ",
  "youWereLoggedOut": false
}
```

**✅ 남은 A2로 로그인**
```http
POST /api/login/verify

{
  "response": {
    "id": "zpGiw3CCSP…(43자)",
    "rawId": "zpGiw3CCSP…(43자)",
    "response": {
      "authenticatorData": "SZYN5YgOjG…(50자)",
      "clientDataJSON": "eyJ0eXBlIj…(179자)",
      "signature": "N_oowSsDUJ…(86자)",
      "userHandle": "74z7-ufz70…(22자)"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```
→ **200**
```json
{
  "ok": true,
  "account": "도현-메인",
  "passkey": {
    "id": "zpGiw3CCSP…(43자)",
    "label": "휴대폰 - 구글 비밀번호 관리자(가상 인증기 A2)"
  }
}
```

- ✅ **T08-C44** 하나를 지운 뒤 남은 하나로 들어간다
**마지막 남은 패스키 지우기 시도**
```http
DELETE /api/passkeys

{
  "id": "zpGiw3CCSP…(43자)"
}
```
→ **409**
```json
{
  "ok": false,
  "error": "마지막 패스키는 지울 수 없습니다. 하나도 없으면 이 계정에는 다시 들어올 방법이 없습니다. 먼저 다른 기기의 패스키를 추가하세요."
}
```

- ✅ **T08-C46** 하나만 남으면 지울 수 없고(409, 화면 버튼도 비활성), "하나도 없으면 다시 들어올 방법이 없다"는 안내가 화면에 있다
**❌ 지운 A1로 로그인**
```http
POST /api/login/verify

{
  "response": {
    "id": "e1M0lDKd6H…(43자)",
    "rawId": "e1M0lDKd6H…(43자)",
    "response": {
      "authenticatorData": "SZYN5YgOjG…(50자)",
      "clientDataJSON": "eyJ0eXBlIj…(179자)",
      "signature": "BrwTILIK0-…(86자)",
      "userHandle": "74z7-ufz70…(22자)"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```
→ **401**
```json
{
  "ok": false,
  "error": "등록되지 않은 패스키입니다."
}
```

- ✅ **T08-C45** 지운 패스키로는 더 이상 못 들어간다

## 카드 5 — 정말 안 열리는지

### 계정 B 만들기 (다른 브라우저 창, 기기 B1)
- ✅ **T08-C36** 패스키를 등록한 계정이 두 개이고, 비공개 내용이 서로 다르다 — A(도현-메인) 3건 / B(시험용-B) 3건

### A로 들어가 B의 자료를 읽고 지우려 함
**A의 세션으로 B의 회고(메모 번호)를 읽기**
```http
GET /api/private?id=6
Cookie: sid=(A의 세션, 가림)
```
→ **404**
```json
{
  "ok": false,
  "error": "없거나 내 자료가 아닙니다."
}
```

**A의 세션으로 B의 회고 지우기**
```http
DELETE /api/private
Cookie: sid=(A의 세션, 가림)

{
  "id": 6
}
```
→ **404**
```json
{
  "ok": false,
  "error": "없거나 내 자료가 아닙니다."
}
```

**A의 세션으로 B의 패스키 지우기**
```http
DELETE /api/passkeys
Cookie: sid=(A의 세션, 가림)

{
  "id": "NbzbKlOiho…(43자)"
}
```
→ **404**
```json
{
  "ok": false,
  "error": "없거나 내 패스키가 아닙니다."
}
```

- ✅ **T08-C37** A에서 B의 자료 읽기·지우기, B의 패스키 지우기가 모두 거절 — 404, 404, 404
### 반대로 B로 들어가 A의 자료를 읽고 지우려 함
**B의 세션으로 A의 "지원하려는 곳" 읽기**
```http
GET /api/private?id=2
Cookie: sid=(B의 세션, 가림)
```
→ **404**
```json
{
  "ok": false,
  "error": "없거나 내 자료가 아닙니다."
}
```

**B의 세션으로 A의 "지원하려는 곳" 지우기**
```http
DELETE /api/private
Cookie: sid=(B의 세션, 가림)

{
  "id": 2
}
```
→ **404**
```json
{
  "ok": false,
  "error": "없거나 내 자료가 아닙니다."
}
```

- ✅ **T08-C38** B → A 방향도 똑같이 거절 — 404, 404, 404
- ✅ **T08-C39** 거절 앞뒤로 상대편 자료 건수가 같다 — B: 3건 → 3건 / A: 3건 → 3건

### 주소와 본문에 다른 계정을 적어 보내기
**A의 세션 + 주소에 B 계정 이름과 B의 사용자 ID(JBeoCTgy6M…(22자))**
```http
GET /api/private?account=시험용-B&user_id=JBeoCTgy6M…(22자)
```
→ **200**
```json
{
  "ok": true,
  "account": "도현-메인",
  "kinds": {
    "project": "준비 중인 프로젝트 메모",
    "apply": "지원하려는 곳",
    "retro": "회고"
  },
  "count": 3,
  "notes": [
    "[project] (만든 내용) 디스코드 봇을 Docker 이미지로 옮기기 — 이번 주 Dockerfile 초안",
    "[apply] (만든 내용) 가상의 회사 \"구름다리클라우드\" 주니어 DevOps — 마감 11월 말",
    "[retro] (만든 내용) 패스키 과제: 질문을 언제 지우는지 처음에 헷갈렸음"
  ],
  "ignored": [
    "account",
    "user_id"
  ],
  "note": "다른 계정을 가리키는 값은 무시하고 내 자료만 돌려줍니다."
}
```

**A의 세션 + 본문에 B의 user_id를 넣고 글 쓰기**
```http
POST /api/private

{
  "kind": "retro",
  "body": "(만든 내용) B 계정에 끼워 넣으려 한 글",
  "user_id": "JBeoCTgy6M…(22자)",
  "account": "시험용-B"
}
```
→ **201**
```json
{
  "ok": true,
  "note": {
    "id": 7,
    "kind": "retro",
    "body": "(만든 내용) B 계정에 끼워 넣으려 한 글",
    "created_at": "2026-10-12T12:42:34.807Z"
  },
  "ignored": [
    "account",
    "user_id"
  ]
}
```

- ✅ **T08-C40** 주소·본문에 다른 계정을 적어도 무시되고 내 자료만 돌아오며, 쓰기도 내 계정에만 들어감 — B 건수 3 → 3
- ✅ **T08-C41** 거절을 만드는 소스 위치: api/private.js (계정은 session.user_id에서만), lib/store.js 의 getNote/deleteNote/deletePasskey (user_id 조건), api/passkeys.js (내 패스키인지 확인)

### 세 번째 계정은 만들 수 없음
**로그인 안 한 사람이 새 계정 만들기 시도**
```http
POST /api/register/options

{
  "mode": "signup",
  "name": "낯선 사람"
}
```
→ **403**
```json
{
  "ok": false,
  "error": "새 계정 자리가 없습니다. (최대 2개, 이미 다 만들어짐)"
}
```

- ✅ **보너스** 계정 자리(2개)가 차면 새 계정 등록이 403

### 남의 패스키로 열기 (이 사이트에 등록된 적 없는 패스키)
**❌ 다른 사이트(:3001)에서 정상 발급된 패스키로 이 사이트 로그인**
```http
POST /api/login/verify

{
  "response": {
    "id": "6v0btN1qh3…(43자)",
    "rawId": "6v0btN1qh3…(43자)",
    "response": {
      "authenticatorData": "SZYN5YgOjG…(50자)",
      "clientDataJSON": "eyJ0eXBlIj…(324자)",
      "signature": "6SmtxRq8KE…(86자)",
      "userHandle": "TsT50x6iNI…(22자)"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```
→ **401**
```json
{
  "ok": false,
  "error": "등록되지 않은 패스키입니다."
}
```

그 뒤 GET /api/private → 401 {"ok":false,"error":"로그인이 필요합니다."}

- ✅ **T08-C50(남의 패스키)** 남의 패스키로는 401, 비공개 자료도 계속 401

## 요약

| 결과 | 항목 | 내용 |
|---|---|---|
| ✅ | T08-C19·C20 | 등록 요청마다 서버가 새 질문을 만들어 보낸다 (본문은 서버 me_challenges에 5분 보관, 브라우저에는 그 줄을 가리키는 쿠키 ID만) |
| ✅ | T08-C25 | 등록을 취소하면 화면에 안내가 나오고, 등록 확인 요청이 아예 가지 않아 서버에 저장되는 것이 없다 |
| ✅ | T08-C23 | 등록 요청 본문에 개인키가 없다 (기기 안 개인키 값을 base64url·base64·hex 세 형태로 본문에서 찾아봄) |
| ✅ | T08-C21·C22 | 등록이 끝나면 서버에 공개키가 저장되고, 그 값은 기기 개인키로 계산한 공개키와 같다 — 비밀번호가 아님 |
| ✅ | T08-C24 | 등록한 패스키에 사람이 알아볼 이름이 붙는다 |
| ✅ | T08-C14 | 비공개 영역 항목이 세 개 이상 (준비 중인 프로젝트 메모 / 지원하려는 곳 / 회고) |
| ✅ | T08-C13 | 공개 소개 아래에 "여기부터 비공개 영역" 점선 상자, /me/ 에는 "비공개 영역 · 패스키로 잠김" 표시 |
| ✅ | T08-C15 | 로그인 안 한 /me/ 화면에 비공개 내용이 보이지 않는다 |
| ✅ | T08-C18 | 로그인 없이 받은 /me/ 페이지 소스(HTML 원문) 어디에도 비공개 내용·계정 이름이 없다 |
| ✅ | T08-C16·C17 | 로그인 없이 서버에 직접 요청하면 401로 거절 (/api/private, ?id=, /api/passkeys) |
| ✅ | T08-C27·C28 | 로그인 요청마다 새 질문, 세 값이 모두 다르다 |
| ✅ | T08-C29·C30 | 저장된 공개키로 서명을 확인한 뒤에만 통과 — 서명이 1바이트만 달라도 401 |
| ✅ | T08-C31 | 이미 한 번 쓴 질문(과 그 서명)으로는 다시 못 들어온다 |
| ✅ | T08-C32·C33 | 로그인 뒤에는 세션 쿠키(서버 DB의 세션 줄)로 사람을 알아보고, 로그아웃하면 서버에서 지워져 같은 값으로는 401 |
| ✅ | T08-C34 | 이 기록 어디에도 세션 값 원문이 없다 |
| ✅ | T08-C35 | 비밀번호 입력 칸이 없다 (/me/ 화면의 input 전부 검사) |
| ✅ | T08-C42 | 한 계정에 패스키 두 개 |
| ✅ | T08-C43 | 목록 화면에 각 패스키의 이름과 등록 날짜가 보인다 |
| ✅ | T08-C44 | 하나를 지운 뒤 남은 하나로 들어간다 |
| ✅ | T08-C46 | 하나만 남으면 지울 수 없고(409, 화면 버튼도 비활성), "하나도 없으면 다시 들어올 방법이 없다"는 안내가 화면에 있다 |
| ✅ | T08-C45 | 지운 패스키로는 더 이상 못 들어간다 |
| ✅ | T08-C36 | 패스키를 등록한 계정이 두 개이고, 비공개 내용이 서로 다르다 |
| ✅ | T08-C37 | A에서 B의 자료 읽기·지우기, B의 패스키 지우기가 모두 거절 |
| ✅ | T08-C38 | B → A 방향도 똑같이 거절 |
| ✅ | T08-C39 | 거절 앞뒤로 상대편 자료 건수가 같다 |
| ✅ | T08-C40 | 주소·본문에 다른 계정을 적어도 무시되고 내 자료만 돌아오며, 쓰기도 내 계정에만 들어감 |
| ✅ | T08-C41 | 거절을 만드는 소스 위치: api/private.js (계정은 session.user_id에서만), lib/store.js 의 getNote/deleteNote/deletePasskey (user_id 조건), api/passkeys.js (내 패스키인지 확인) |
| ✅ | 보너스 | 계정 자리(2개)가 차면 새 계정 등록이 403 |
| ✅ | T08-C50(남의 패스키) | 남의 패스키로는 401, 비공개 자료도 계속 401 |

**결과: 29/29 통과**
