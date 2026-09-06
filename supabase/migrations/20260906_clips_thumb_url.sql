-- Thumbnail per klip: gambar potongan dari video sumber.
--
-- Permintaan pengguna: kartu klip di halaman proyek jangan polosan dengan
-- angka skor di tengah — isi dengan GAMBAR potongan klip itu. Frame diambil
-- backend lewat ffmpeg HTTP-range (tanpa mengunduh video penuh) lalu
-- disimpan ke storage; URL publiknya ditaruh di sini.
--
-- NULL = belum pernah dibuat (frontend menampilkan placeholder + memicu
-- pembuatan lewat POST /api/clips/{id}/thumbnail).

alter table public.clips
  add column if not exists thumb_url text;

comment on column public.clips.thumb_url is
  'URL publik JPG frame klip (dibuat backend via ffmpeg range-read). NULL = belum ada.';
