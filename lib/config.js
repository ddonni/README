// 설정값은 전부 환경변수에서 읽습니다. 코드에는 비밀값을 적지 않습니다.
//
// RP_ID   : 패스키가 묶이는 도메인 (예: readme-two-tau.vercel.app)
// ORIGIN  : 브라우저 주소의 출처 (예: https://readme-two-tau.vercel.app)
// 둘 다 비어 있으면 로컬 개발용(localhost)으로 동작합니다.

export function getConfig() {
  const rpID = process.env.RP_ID || 'localhost';
  const origin = process.env.ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
  const isLocalHttp = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');

  return {
    rpID,
    origin,
    rpName: '곽도현의 소개 페이지',
    // 쿠키: 배포(https)에서는 __Host- 접두어 + Secure. 로컬(http)에서는 접두어 없이.
    secureCookies: !isLocalHttp,
    sessionCookie: isLocalHttp ? 'sid' : '__Host-sid',
    challengeCookie: isLocalHttp ? 'chal' : '__Host-chal',
    // 만들 수 있는 계정 수. 과제 확인용 2개(나 + 시험용)가 차면 새 계정 만들기가 닫힘.
    maxAccounts: Number(process.env.MAX_ACCOUNTS || 2),
    sessionTtlSeconds: 60 * 60 * 8, // 로그인 유지 8시간
    challengeTtlSeconds: 60 * 5, // 질문(challenge) 유효시간 5분
  };
}
