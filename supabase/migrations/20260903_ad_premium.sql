-- Premium lewat iklan: kredit iklan per user + jenis paket yang dicicil.
--
-- Aturan dari user:
--   1 hari    = 8 iklan    (harus sekali jalan, TIDAK bisa dicicil)
--   7 hari    = 45 iklan   (harus sekali jalan, TIDAK bisa dicicil)
--   30 hari   = 340 iklan  (BOLEH dicicil — nonton sedikit, lanjut nanti)
--
-- Karena paket bulanan boleh dicicil, jumlah tontonan harus BERTAHAN antar
-- sesi. Kolom `ad_credits` menyimpan progres itu; `ad_target` menyimpan paket
-- yang sedang dikejar supaya progres tidak tertukar saat user berganti pilihan.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ad_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_target text,
  ADD COLUMN IF NOT EXISTS ad_credits_updated_at timestamptz;

COMMENT ON COLUMN profiles.ad_credits IS
  'Jumlah iklan yang sudah ditonton untuk paket premium yang sedang dikejar (ad_target). Dipakai paket bulanan yang boleh dicicil.';
COMMENT ON COLUMN profiles.ad_target IS
  'Paket premium-lewat-iklan yang sedang dikejar: day | week | month. NULL = tidak sedang mengejar paket.';

-- Riwayat penukaran iklan → premium (untuk audit & anti-curang)
CREATE TABLE IF NOT EXISTS ad_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan text NOT NULL CHECK (plan IN ('day', 'week', 'month')),
  ads_watched integer NOT NULL,
  granted_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_redemptions_user_idx
  ON ad_redemptions (user_id, created_at DESC);

COMMENT ON TABLE ad_redemptions IS
  'Catatan setiap kali user menukar tontonan iklan menjadi premium.';
