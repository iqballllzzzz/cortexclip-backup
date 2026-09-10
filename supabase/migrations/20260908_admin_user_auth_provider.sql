-- Tambah kolom auth_provider ke view public.admin_user_overview
-- Mendeteksi apakah user mendaftar/masuk via Google OAuth atau Email/Password.

CREATE OR REPLACE VIEW public.admin_user_overview AS
SELECT
  p.user_id,
  u.email,
  p.display_name,
  p.plan,
  p.premium_until,
  p.is_admin,
  p.banned_until,
  p.ban_reason,
  p.banned_at,
  p.created_at                                       AS joined_at,
  GREATEST(p.last_seen_at, u.last_sign_in_at)         AS last_active_at,
  u.last_sign_in_at,
  p.login_count,
  (SELECT count(*) FROM public.projects pr WHERE pr.user_id = p.user_id)            AS total_projects,
  (SELECT count(*) FROM public.clips c  WHERE c.user_id = p.user_id)                AS total_clips,
  (SELECT count(*) FROM public.usage_log ul
     WHERE ul.user_id = p.user_id AND ul.status = 'success')                        AS total_requests,
  (SELECT count(*) FROM public.usage_log ul
     WHERE ul.user_id = p.user_id AND ul.status = 'success'
       AND ul.created_at > now() - INTERVAL '30 days')                              AS requests_30d,
  CASE
    WHEN EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = p.user_id AND i.provider = 'google') THEN 'google'
    WHEN COALESCE(u.raw_app_meta_data->>'provider', '') = 'google' THEN 'google'
    ELSE COALESCE(u.raw_app_meta_data->>'provider', 'email')
  END                                                AS auth_provider
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id;

COMMENT ON VIEW public.admin_user_overview IS 'Ringkasan tiap user untuk halaman /admin (diakses via service key saja).';
