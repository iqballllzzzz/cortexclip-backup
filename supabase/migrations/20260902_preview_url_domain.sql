-- Perbaiki URL preview lama yang masih memakai domain lama.
--
-- Kenapa penting: preview_url disimpan sebagai URL ABSOLUT. Setelah domain
-- pindah ke cortexclip.eu.cc, URL lama masih bisa dibuka (nginx melayani kedua
-- domain), tapi menjadi permintaan LINTAS-ORIGIN dari halaman baru. Itu bukan
-- mixed content, namun tetap salah: kalau suatu saat domain lama dimatikan,
-- semua preview lama ikut mati tanpa pesan apa pun.
UPDATE clips
SET preview_url = replace(preview_url,
                          'https://clip.aqualibrya.my.id',
                          'https://cortexclip.eu.cc')
WHERE preview_url LIKE 'https://clip.aqualibrya.my.id%';

COMMENT ON COLUMN clips.preview_url IS
  'URL preview MP4 (absolut, https, domain produksi cortexclip.eu.cc).';
