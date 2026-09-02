-- Genre video (dideteksi AI dari transkrip) → dipakai memilih ikon/b-roll/emoji
-- yang relate dengan isi video, dan mempertajam judul/deskripsi/hashtag.
alter table public.projects
  add column if not exists genre text;

comment on column public.projects.genre is
  'Genre konten hasil deteksi AI: comedy|business|tech|education|sports|food|travel|music|gaming|lifestyle|drama|health|motivation';
