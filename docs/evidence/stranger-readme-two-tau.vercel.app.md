# 남의 패스키로 열어 보기 — https://readme-two-tau.vercel.app

실행 시각: 2026-10-13T01:12:40.311Z

남의 패스키 ID(방금 만든 것): QsvIgcMjt0jsEdb8nJ1WhTp3wdC6wwSDR5UX7SaCjYU

## 1. 로그인 없이 비공개 자료 요청
```http
GET /api/private
```
→ 401
```json
{
  "ok": false,
  "error": "로그인이 필요합니다."
}
```

## 2. 질문(challenge) 받기
```http
POST /api/login/options
```
→ 200  challenge = 8amd8aLnCEuq-5b50Ap2YbnYtY5rch5FhAAlA9VNoNA

## 3. 남의 개인키로 서명한 답을 제출
```http
POST /api/login/verify
Content-Type: application/json
```
```json
{
  "response": {
    "id": "QsvIgcMjt0jsEdb8nJ1WhTp3wdC6wwSDR5UX7SaCjYU",
    "rawId": "QsvIgcMjt0jsEdb8nJ1WhTp3wdC6wwSDR5UX7SaCjYU",
    "type": "public-key",
    "authenticatorAttachment": "platform",
    "clientExtensionResults": {},
    "response": {
      "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiOGFtZDhhTG5DRXVxLTViNTBBcDJZYm5ZdFk1cmNoNUZoQUFsQTlWTm9OQSIsIm9yaWdpbiI6Imh0dHBzOi8vcmVhZG1lLXR3by10YXUudmVyY2VsLmFwcCIsImNyb3NzT3JpZ2luIjpmYWxzZX0",
      "authenticatorData": "VAN5xzYSw8LOAKVe6P2q79bCdDHcqRZAn5lFE2yEtDIFAAAAAQ",
      "signature": "MEYCIQDssMiblUgX…",
      "userHandle": "ABdQgh_1DcMEKl4m4VXmQg"
    }
  }
}
```
→ 401
```json
{
  "ok": false,
  "error": "등록되지 않은 패스키입니다."
}
```

## 4. 그 뒤 비공개 자료 다시 요청
GET /api/private → 401  {"ok":false,"error":"로그인이 필요합니다."}

## 5. 남이 자기 패스키를 새로 등록하려고 시도
POST /api/register/options → 403  "새 계정 자리가 없습니다. (최대 2개, 이미 다 만들어짐)"

**결과: 통과 — 남의 패스키로는 열리지 않았고, 새로 등록할 수도 없었습니다.**
