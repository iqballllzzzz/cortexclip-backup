-- Simpan jalur kamera face-tracking supaya bisa dipakai ulang.
--
-- Kenapa: trajektori dihitung ulang setiap render (analisis 15fps ~40 detik untuk
-- klip 60 detik). Dengan disimpan:
--   1. preview & unduhan tidak menghitung dua kali,
--   2. EDITOR bisa mengambilnya dan langsung membingkai video sumber di browser
--      (transform CSS), jadi framing benar SEJAK DETIK PERTAMA tanpa menunggu
--      render server selesai.
--
-- Bentuk camera_track:
--   {"fps": 15.0, "src_w": 1920, "crop_w": 607,
--    "x": [1241.0, 1240.5, ...],      -- pusat crop, piksel sumber
--    "cuts": [104, 162],               -- indeks frame ganti pembicara
--    "static_x": 1041.0}               -- satu offset terbaik (mode kilat)

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS camera_track jsonb;

COMMENT ON COLUMN clips.camera_track IS
  'Jalur kamera face tracking: {fps, src_w, crop_w, x[], cuts[], static_x}. Dipakai preview instan di browser + render, supaya analisis tidak diulang.';
