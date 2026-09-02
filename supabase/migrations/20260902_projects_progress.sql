-- Progres persen untuk proses panjang (transkripsi video berjam-jam).
-- Ditulis server saat pipeline jalan, dibaca UI lewat realtime/polling —
-- sehingga user bisa MENUTUP halaman dan tetap melihat kemajuan saat kembali.
alter table public.projects
  add column if not exists progress smallint default 0;

comment on column public.projects.progress is
  'Progres 0-100 untuk tahap berjalan (transcribing/analyzing). Diisi backend.';
