-- TUTUP LUBANG ESKALASI HAK: pengguna biasa bisa menjadikan dirinya
-- admin / premium lewat anon key yang ada di bundle JavaScript.
--
-- Dibuktikan 2026-09-05 dengan akun percobaan + anon key (lihat
-- /tmp/audit-keamanan.py). Semua ini BERHASIL sebelum migrasi ini:
--   UPDATE profiles SET plan='premium'              → HTTP 200
--   UPDATE profiles SET is_admin=true               → HTTP 200
--   UPDATE profiles SET premium_until='2027-12-31'  → HTTP 200
--   UPDATE profiles SET ad_credits=999999           → HTTP 200
--   UPDATE profiles SET watermark_removed=true      → HTTP 200
--   UPDATE profiles SET banned_until=NULL           → HTTP 200 (lepas ban!)
--
-- Sebabnya: RLS "Users can update own profile" hanya memeriksa KEPEMILIKAN
-- baris (uid() = user_id), tidak membatasi KOLOM mana yang boleh diubah, dan
-- role `authenticated` punya UPDATE pada semua 21 kolom.
--
-- Perbaikan berlapis:
--   1. GRANT per kolom — authenticated hanya boleh UPDATE display_name &
--      avatar_url. Ini pertahanan di tingkat Postgres, bukan aplikasi.
--   2. Trigger pengaman — kalau nanti ada jalur lain (fungsi SECURITY DEFINER,
--      grant baru yang lupa dicabut), trigger tetap menolak perubahan kolom
--      sensitif oleh siapa pun kecuali service_role/postgres.
--   3. anon dicabut penuh — akun yang belum login tidak punya urusan menulis.

-- ── 1. GRANT per kolom ─────────────────────────────────────────────────────
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE, INSERT, DELETE ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM anon;

GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;

-- ── 2. Trigger pengaman (jaring kedua) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jaga_kolom_hak_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  peran text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- service_role (backend) & superuser boleh apa saja; itu jalur resmi
  -- pemberian premium (setelah pembayaran Pakasir terverifikasi) dan ban.
  IF peran IN ('service_role', 'supabase_admin') OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Kolom hak istimewa: nilainya WAJIB sama dengan sebelumnya.
  IF NEW.plan              IS DISTINCT FROM OLD.plan
     OR NEW.is_admin          IS DISTINCT FROM OLD.is_admin
     OR NEW.premium_until     IS DISTINCT FROM OLD.premium_until
     OR NEW.banned_until      IS DISTINCT FROM OLD.banned_until
     OR NEW.ban_reason        IS DISTINCT FROM OLD.ban_reason
     OR NEW.banned_at         IS DISTINCT FROM OLD.banned_at
     OR NEW.banned_by         IS DISTINCT FROM OLD.banned_by
     OR NEW.ad_credits        IS DISTINCT FROM OLD.ad_credits
     OR NEW.ad_target         IS DISTINCT FROM OLD.ad_target
     OR NEW.ads_watched       IS DISTINCT FROM OLD.ads_watched
     OR NEW.watermark_removed IS DISTINCT FROM OLD.watermark_removed
     OR NEW.user_id           IS DISTINCT FROM OLD.user_id
     OR NEW.login_count       IS DISTINCT FROM OLD.login_count
     OR NEW.notes             IS DISTINCT FROM OLD.notes
  THEN
    RAISE EXCEPTION 'kolom hak istimewa hanya boleh diubah server (peran: %)', COALESCE(peran, current_user)
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jaga_kolom_hak_profiles ON public.profiles;
CREATE TRIGGER jaga_kolom_hak_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.jaga_kolom_hak_profiles();

-- ── 3. INSERT juga dibatasi: profil baru tidak boleh langsung premium/admin ─
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE(plan, 'free') = 'free'
    AND COALESCE(is_admin, false) = false
    AND premium_until IS NULL
    AND banned_until IS NULL
    AND COALESCE(ad_credits, 0) = 0
    AND COALESCE(watermark_removed, false) = false
  );

-- ── 4. Tabel lain: cabut hak tulis anon (pembaca tak berkepentingan) ────────
REVOKE INSERT, UPDATE, DELETE ON public.projects FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.clips FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.render_jobs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.usage_log FROM anon;

-- usage_log: analitik ditulis backend saja. Pengguna yang bisa menulis di sini
-- bisa memalsukan statistik admin.
REVOKE INSERT, UPDATE, DELETE ON public.usage_log FROM authenticated;

NOTIFY pgrst, 'reload schema';
