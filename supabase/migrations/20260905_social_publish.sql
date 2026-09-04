-- SOCIAL AUTO PUBLISHING: koneksi akun + jadwal tayang.
--
-- Dua tabel:
--   social_accounts  — satu baris per akun sosial yang disambungkan pengguna
--   publish_jobs     — satu baris per klip yang dijadwalkan tayang
--
-- Token OAuth disimpan di sini karena penjadwal berjalan di server TANPA
-- pengguna hadir (itu inti fitur ini). RLS mengikat baris ke pemiliknya;
-- backend memakai service key dan menyaring per user_id secara eksplisit.

create table if not exists public.social_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  platform      text not null check (platform in ('youtube', 'tiktok')),
  -- nama profil yang DIMASUKKAN pengguna sebelum OAuth. Dipakai untuk
  -- memverifikasi bahwa akun yang dipilih di layar Google/TikTok memang
  -- akun yang dimaksud (lihat social_publish.tautkan()).
  profile_name  text not null,
  -- identitas yang DIKEMBALIKAN platform setelah OAuth
  account_id    text,
  account_name  text,
  avatar_url    text,
  -- metode login yang dipilih pengguna (khusus TikTok: google/facebook/email/…)
  login_method  text,
  access_token  text,
  refresh_token text,
  -- kapan access_token kedaluwarsa (penjadwal me-refresh sendiri)
  expires_at    timestamptz,
  scopes        text,
  status        text not null default 'connected'
                check (status in ('pending', 'connected', 'expired', 'revoked')),
  -- state OAuth acak: mengikat callback ke permintaan yang benar (anti-CSRF)
  oauth_state   text,
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists social_accounts_user_idx
  on public.social_accounts (user_id, platform);
create unique index if not exists social_accounts_state_idx
  on public.social_accounts (oauth_state) where oauth_state is not null;

create table if not exists public.publish_jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  account_id     uuid not null references public.social_accounts (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete cascade,
  clip_id        uuid references public.clips (id) on delete cascade,
  platform       text not null check (platform in ('youtube', 'tiktok')),
  -- metadata siap tayang (dibuat otomatis dari transkrip klip)
  title          text,
  description    text,
  hashtags       text,
  -- jadwal: kapan klip ini harus tayang
  scheduled_at   timestamptz not null,
  status         text not null default 'scheduled'
                 check (status in ('scheduled', 'rendering', 'uploading',
                                   'published', 'failed', 'canceled')),
  -- hasil
  remote_url     text,
  remote_id      text,
  error_message  text,
  attempts       int not null default 0,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists publish_jobs_due_idx
  on public.publish_jobs (status, scheduled_at);
create index if not exists publish_jobs_user_idx
  on public.publish_jobs (user_id, created_at desc);

alter table public.social_accounts enable row level security;
alter table public.publish_jobs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'social_accounts' and policyname = 'own social accounts') then
    create policy "own social accounts" on public.social_accounts
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'publish_jobs' and policyname = 'own publish jobs') then
    create policy "own publish jobs" on public.publish_jobs
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- updated_at otomatis (fungsi touch_updated_at sudah ada dari migrasi lain)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'touch_updated_at') then
    drop trigger if exists social_accounts_touch on public.social_accounts;
    create trigger social_accounts_touch before update on public.social_accounts
      for each row execute function public.touch_updated_at();
    drop trigger if exists publish_jobs_touch on public.publish_jobs;
    create trigger publish_jobs_touch before update on public.publish_jobs
      for each row execute function public.touch_updated_at();
  end if;
end $$;

comment on table public.social_accounts is
  'Akun TikTok/YouTube tersambung untuk auto-publish. Token dipakai penjadwal server.';
comment on table public.publish_jobs is
  'Klip yang dijadwalkan tayang otomatis ke sosial media.';
