-- Rencana overlay (ikon/b-roll/emoji) disimpan per klip supaya PREVIEW dan
-- HASIL UNDUHAN memakai penempatan yang SAMA. Tanpa ini, AI planner dipanggil
-- dua kali (preview & render) dan menghasilkan penempatan berbeda.
alter table public.clips
  add column if not exists overlay_plan jsonb;

comment on column public.clips.overlay_plan is
  'Rencana overlay: [{time_start,time_end,category,genre,icon_id,side,animation,broll_url,emoji}] — sumber tunggal untuk preview & render.';
