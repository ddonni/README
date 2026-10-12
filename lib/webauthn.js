// 패스키 규칙을 한곳에 모아 둔 파일.
import { isoBase64URL } from '@simplewebauthn/server/helpers';

// 비공개 메모의 종류 — 비공개 자리에 들어가는 세 가지 항목
export const NOTE_KINDS = {
  project: '준비 중인 프로젝트 메모',
  apply: '지원하려는 곳',
  retro: '회고',
};

// 등록할 때도, 로그인할 때도 "기기 잠금(지문·얼굴·PIN)을 확인했다"는 표시를 요구합니다.
export const USER_VERIFICATION = 'required';

// DB 한 줄 → simplewebauthn이 원하는 모양
export function toLibCredential(row) {
  return {
    id: row.id,
    publicKey: isoBase64URL.toBuffer(row.public_key),
    counter: Number(row.counter || 0),
    transports: row.transports || undefined,
  };
}

// 화면에 보여 줄 때: 공개키는 전부 보여 줘도 안전합니다 (공개키로는 서명을 만들 수 없음)
export function toPublicView(row) {
  return {
    id: row.id,
    label: row.label,
    publicKey: row.public_key,
    publicKeyFormat: 'COSE_Key (base64url)',
    counter: Number(row.counter || 0),
    deviceType: row.device_type,
    backedUp: row.backed_up,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}
