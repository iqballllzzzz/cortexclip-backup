-- Simpan waktu kadaluarsa QRIS supaya countdown tetap benar setelah refresh.
-- Pakasir mengembalikan `expired_at` HANYA pada response transactioncreate
-- (endpoint transactiondetail tidak mengembalikannya), jadi nilainya wajib
-- dipersist sendiri. Terukur: QRIS berlaku 60 menit sejak dibuat.
alter table public.premium_orders
  add column if not exists expired_at timestamptz;

comment on column public.premium_orders.expired_at is
  'Kadaluarsa QRIS dari Pakasir (transactioncreate.payment.expired_at, UTC).';
