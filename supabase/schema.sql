-- 과제 8: 패스키 잠금용 테이블
-- 다른 과제(플랜두씨 등)와 같은 Supabase 프로젝트를 써도 겹치지 않도록 테이블 이름에 me_ 를 붙였습니다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run.
-- 모든 테이블에 RLS를 켜고 정책은 만들지 않습니다.
--   → 브라우저용 anon 키로는 아무것도 못 읽음.
--   → 서버(Vercel 함수)만 service_role 키로 접근.

-- 계정. 비밀번호 칸은 없습니다. id는 패스키 등록 때 기기에 넘기는 사용자 ID(랜덤)와 같습니다.
create table if not exists public.me_users (
  id          text primary key,                -- 랜덤 16바이트, base64url
  name        text not null,                   -- 계정 이름 (만든 이름, 실명 아님)
  created_at  timestamptz not null default now()
);

create table if not exists public.me_passkeys (
  id            text primary key,              -- 패스키(credential) ID, base64url
  user_id       text not null references public.me_users(id) on delete cascade,
  public_key    text not null,                 -- 공개키 (COSE_Key, base64url). 개인키 칸은 없음
  counter       bigint not null default 0,     -- 서명 횟수 (복제 감지용)
  transports    text[],
  device_type   text,                          -- singleDevice | multiDevice(동기화 패스키)
  backed_up     boolean,
  label         text not null,                 -- 내가 붙인 이름 (예: "휴대폰")
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists me_passkeys_user_idx on public.me_passkeys(user_id);

create table if not exists public.me_challenges (
  id          text primary key,                -- 브라우저 쿠키에 들어가는 조회용 ID
  challenge   text not null,                   -- 서버가 낸 일회용 질문
  purpose     text not null check (purpose in ('signup', 'add-passkey', 'login')),
  user_id     text,                            -- 등록일 때 어느 계정용 질문인지
  user_name   text,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.me_sessions (
  token_hash  text primary key,                -- 세션 토큰의 SHA-256 (원문은 저장 안 함)
  user_id     text not null references public.me_users(id) on delete cascade,
  passkey_id  text not null references public.me_passkeys(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.me_notes (
  id          bigserial primary key,
  user_id     text not null references public.me_users(id) on delete cascade,
  kind        text not null check (kind in ('project', 'apply', 'retro')),
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists me_notes_user_idx on public.me_notes(user_id);

alter table public.me_users      enable row level security;
alter table public.me_passkeys   enable row level security;
alter table public.me_challenges enable row level security;
alter table public.me_sessions   enable row level security;
alter table public.me_notes      enable row level security;

-- 확인용: 저장된 것이 공개키뿐인지 보기
-- select p.label, u.name as account, left(p.public_key, 24) || '…' as public_key_head, p.counter, p.created_at
--   from public.me_passkeys p join public.me_users u on u.id = p.user_id;
