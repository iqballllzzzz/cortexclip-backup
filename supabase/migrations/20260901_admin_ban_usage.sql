-- =====================================================================
-- CortexClip — Admin panel, ban system, usage analytics
-- Dijalankan di Supabase self-host (psql -U supabase_admin -d postgres)
-- Idempotent: aman dijalankan berulang.
-- =====================================================================

-- 1) profiles: flag admin, status ban, jejak aktivitas -----------------
alter table public.profiles add column if not exists is_admin      boolean not null default false;
alter table public.profiles add column if not exists banned_until   timestamptz;          -- null = tidak diban, 'infinity' = permanen
alter table public.profiles add column if not exists ban_reason     text;
alter table public.profiles add column if not exists banned_at      timestamptz;
alter table public.profiles add column if not exists banned_by      uuid;
alter table public.profiles add column if not exists last_seen_at   timestamptz;
alter table public.profiles add column if not exists login_count    integer not null default 0;
alter table public.profiles add column if not exists notes          text;

create index if not exists profiles_banned_until_idx on public.profiles (banned_until)
  where banned_until is not null;
create index if not exists profiles_is_admin_idx on public.profiles (is_admin) where is_admin;

-- 2) usage_log: tiap request AI/pipeline (buat statistik & chart) ------
create table if not exists public.usage_log (
  id          bigserial primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  project_id  uuid,
  kind        text        not null,               -- 'transcribe' | 'clip_detect' | 'render' | 'preview' | 'youtube' | ...
  model       text,                               -- nama model / provider STT-LLM yang dipakai
  provider    text,                               -- groq | gemini | hf | local | openrouter | ...
  status      text        not null default 'success',  -- 'success' | 'error'
  latency_ms  integer,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists usage_log_user_idx    on public.usage_log (user_id, created_at desc);
create index if not exists usage_log_created_idx on public.usage_log (created_at desc);
create index if not exists usage_log_model_idx   on public.usage_log (model) where status = 'success';
create index if not exists usage_log_kind_idx    on public.usage_log (kind, status);

alter table public.usage_log enable row level security;

drop policy if exists "usage_log read own" on public.usage_log;
create policy "usage_log read own" on public.usage_log
  for select to authenticated using (auth.uid() = user_id);

-- 3) login_events: berapa banyak yang login (harian) -------------------
create table if not exists public.login_events (
  id         bigserial primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  user_agent text,
  ip         text
);
create index if not exists login_events_created_idx on public.login_events (created_at desc);
create index if not exists login_events_user_idx    on public.login_events (user_id, created_at desc);

alter table public.login_events enable row level security;
drop policy if exists "login_events read own" on public.login_events;
create policy "login_events read own" on public.login_events
  for select to authenticated using (auth.uid() = user_id);

-- 4) admin_actions: audit trail siapa nge-ban siapa --------------------
create table if not exists public.admin_actions (
  id          bigserial primary key,
  admin_id    uuid        not null,
  target_user uuid,
  action      text        not null,   -- 'ban' | 'unban' | 'set_plan' | 'grant_admin' | ...
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;  -- hanya service key yang akses

-- 5) profil user boleh baca kolom ban miliknya (buat layar "kamu diban")
--    Policy "Users can read own profile" yang lama sudah cukup (select *).

-- 6) helper view: ringkasan per user untuk admin dashboard -------------
create or replace view public.admin_user_overview as
select
  p.user_id,
  u.email,
  p.display_name,
  p.plan,
  p.premium_until,
  p.is_admin,
  p.banned_until,
  p.ban_reason,
  p.banned_at,
  p.created_at                                       as joined_at,
  greatest(p.last_seen_at, u.last_sign_in_at)         as last_active_at,
  u.last_sign_in_at,
  p.login_count,
  (select count(*) from public.projects pr where pr.user_id = p.user_id)            as total_projects,
  (select count(*) from public.clips c  where c.user_id = p.user_id)                as total_clips,
  (select count(*) from public.usage_log ul
     where ul.user_id = p.user_id and ul.status = 'success')                        as total_requests,
  (select count(*) from public.usage_log ul
     where ul.user_id = p.user_id and ul.status = 'success'
       and ul.created_at > now() - interval '30 days')                              as requests_30d
from public.profiles p
join auth.users u on u.id = p.user_id;

comment on view public.admin_user_overview is 'Ringkasan tiap user untuk halaman /admin (diakses via service key saja).';
