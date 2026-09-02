/**
 * Nama file unduhan berdasarkan JUDUL KLIP.
 *
 * Tiap klip punya judul berbeda, jadi file yang diunduh user juga harus
 * berbeda (sebelumnya memakai nama project → semua klip bernama sama).
 *
 * Aturan:
 * - huruf/angka/spasi/-/_ dipertahankan, tanda baca lain jadi spasi
 * - spasi rapat jadi satu, lalu diubah jadi "-"
 * - maksimal 60 karakter (aman untuk Windows/macOS/Linux)
 * - selalu berakhiran .mp4 dan tidak pernah kosong
 */
export function clipFileName(title: string | null | undefined, ext = "mp4"): string {
  const raw = (title ?? "").normalize("NFKD");
  const cleaned = raw
    // buang emoji & simbol non-teks
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, " ")
    .replace(/[\s_]+/g, " ")
    .trim();
  let base = cleaned.slice(0, 60).trim().replace(/\s+/g, "-");
  // jangan berakhir dengan tanda hubung menggantung
  base = base.replace(/^-+|-+$/g, "");
  if (!base) base = "cortexclip-clip";
  return `${base}.${ext}`;
}
