/**
 * PreviewLoading — penanda "memuat preview" dengan persen NYATA.
 *
 * Kenapa ada: sebelumnya kanvas editor hitam total selama klip diproses, tanpa
 * keterangan apa pun, sehingga user menyangka aplikasinya rusak. Persen di sini
 * berasal dari ffmpeg (out_time dibagi durasi klip) lewat
 * GET /api/preview-clip/status/{clip_id} — bukan animasi tebakan.
 */
import { Loader2 } from "lucide-react";

export function PreviewLoading({
  pct,
  stage,
  compact = false,
}: {
  /** 0-100 dari backend; 0 berarti belum ada laporan */
  pct: number;
  /** tahap dari backend, mis. "Memproses video" */
  stage?: string;
  /** true = tampil sebagai pita kecil di atas video yang sudah bisa diputar */
  compact?: boolean;
}) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const label = stage?.trim() || "Memuat preview";

  if (compact) {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-black/55 px-2.5 py-1.5 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />
        <span className="truncate text-[11px] font-medium text-white">
          {label}
        </span>
        <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-accent">
          {p}%
        </span>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${p}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 p-5 text-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-7 animate-spin text-accent" />
      <p className="text-sm font-semibold text-white">{label}…</p>
      <div className="w-full max-w-[190px]">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(3, p)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] font-semibold tabular-nums text-accent">
          {p}%
        </p>
      </div>
      <p className="max-w-[230px] text-[11px] leading-relaxed text-white/70">
        Proses berjalan di server — kamu boleh menutup halaman ini, hasilnya
        tetap tersimpan.
      </p>
    </div>
  );
}
