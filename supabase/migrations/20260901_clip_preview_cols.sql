-- Kolom cache preview di clips (dipakai render_preview_clip + editor)
alter table public.clips add column if not exists preview_style_hash text;
alter table public.clips add column if not exists preview_ready  boolean not null default false;
alter table public.clips add column if not exists preview_url    text;
