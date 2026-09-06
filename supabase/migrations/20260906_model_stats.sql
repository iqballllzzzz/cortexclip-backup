-- Statistik per (provider, model): berapa kali BERHASIL dan berapa kali GAGAL.
--
-- Permintaan pengguna: "pastiin semua model itu bisa diliat berapa kali
-- keberhasilan dan kegagalannya di admin panel".
--
-- Kenapa tabel baru, kenapa tidak pakai usage_log?
--   usage_log mencatat 1 baris per LANGKAH PIPELINE (clip_detect, transcribe,
--   preview) dengan model = pemenang failover. Semua model yang dicoba dan
--   gagal SEBELUM pemenang tidak pernah tercatat — padahal justru itu yang
--   perlu dilihat admin untuk tahu model mana yang layak dibuang.
--   Tabel ini dihitung di dalam Hydra: setiap percobaan endpoint, sukses
--   maupun gagal, menambah counter.
--
-- Kenapa dipersistensi, tidak cukup di memori?
--   Counter di memori hilang setiap `systemctl restart` (deploy). Angka
--   lifetime harus selamat dari restart, jadi Hydra memuat tabel ini saat
--   startup dan menyimpannya kembali secara berkala (debounce 30s).

CREATE TABLE IF NOT EXISTS public.model_stats (
    provider     text        NOT NULL,
    model        text        NOT NULL,
    ok_total     bigint      NOT NULL DEFAULT 0,
    fail_total   bigint      NOT NULL DEFAULT 0,
    -- rata-rata latensi dihitung dari total supaya tidak perlu simpan histori
    latency_sum_ms bigint    NOT NULL DEFAULT 0,
    last_ok_at   timestamptz,
    last_fail_at timestamptz,
    last_error   text        NOT NULL DEFAULT '',
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, model)
);

COMMENT ON TABLE public.model_stats IS
    'Sukses/gagal kumulatif per endpoint AI Hydra. Ditulis backend (service key), dibaca panel admin.';

-- RLS aktif TANPA policy = tidak ada akses lewat anon/authenticated key.
-- Backend memakai service key (bypass RLS) dan sudah memverifikasi is_admin.
-- Tanpa ini, statistik provider + pesan error internal bisa dibaca user biasa.
ALTER TABLE public.model_stats ENABLE ROW LEVEL SECURITY;
