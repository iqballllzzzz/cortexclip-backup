-- AUTO LAYOUT: pilihan pengguna per klip.
--
-- Bentuk: {"enabled": bool, "layouts": ["fill","fit","split","three","four",
--          "screenshare","gameplay"], "has_screenshare": bool, "has_gameplay": bool}
--
-- enabled=false  → render memakai fill saja (perilaku lama, tidak berubah).
-- layouts kosong atau memuat semuanya → mode CERDAS: sistem memilih sendiri
--   layout mana yang pantas per segmen (mengikuti perilaku "applicable auto
--   layout" OpusClip).
alter table public.clips
  add column if not exists layout_prefs jsonb;

comment on column public.clips.layout_prefs is
  'Auto layout: {"enabled":bool,"layouts":[...],"has_screenshare":bool,"has_gameplay":bool}';
