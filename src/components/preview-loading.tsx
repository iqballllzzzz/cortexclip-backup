/**
 * PreviewLoading — tirai pemrosesan dengan persen NYATA dan hitung mundur.
 *
 * Kenapa ada: sebelumnya kanvas editor hitam total selama klip diproses, tanpa
 * keterangan apa pun, sehingga user menyangka aplikasinya rusak.
 *
 * Persen, tahap, dan estimasi berasal dari backend
 * (GET /api/preview-clip/status/{clip_id}) — bukan animasi tebakan. Estimasi
 * dihitung dari LAJU kemajuan sesungguhnya di server (lihat
 * backend/app/preview_progress.py), jadi hitung mundurnya menyesuaikan diri
 * pada klip cepat maupun lambat.
 *
 * Hitung mundur di sini turun per detik secara lokal supaya terasa hidup, tapi
 * selalu DISINKRONKAN ulang setiap kali backend mengirim estimasi baru — jadi
 * tidak pernah menyimpang jauh dari kenyataan, dan tidak pernah mencapai 0
 * sementara prosesnya masih jalan (ditahan di "hampir selesai").
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

function mmss(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const sisa = s % 60;
  return m > 0 ? `${m}m ${String(sisa).padStart(2, "0")}s` : `${sisa}s`;
}

export function PreviewLoading({
  pct,
  stage,
  compact = false,
  etaS = null,
  elapsedS = 0,
}: {
  /** 0-100 dari backend; 0 berarti belum ada laporan */
  pct: number;
  /** tahap dari backend, mis. "Menganalisis wajah" */
  stage?: string;
  /** true = tampil sebagai pita kecil di atas video yang sudah bisa diputar */
  compact?: boolean;
  /** estimasi sisa detik dari backend; null = belum bisa dihitung */
  etaS?: number | null;
  /** sudah berjalan berapa detik (dari backend) */
  elapsedS?: number;
}) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const label = stage?.trim() || "Menyiapkan video";

  // hitung mundur lokal, disinkronkan tiap kali etaS dari server berubah
  const [sisa, setSisa] = useState<number | null>(etaS);
  const etaRef = useRef<number | null>(etaS);
  useEffect(() => {
    if (etaS !== etaRef.current) {
      etaRef.current = etaS;
      setSisa(etaS);
    }
  }, [etaS]);
  useEffect(() => {
    if (sisa === null) return;
    const id = setInterval(() => {
      // ditahan di 1 detik: jangan pernah bilang "0s" sementara masih diproses
      setSisa((v) => (v === null ? null : Math.max(1, v - 1)));
    }, 1000);
    return () => clearInterval(id);
  }, [sisa === null]);

  if (compact) {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-black/55 px-2.5 py-1.5 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />
        <span className="truncate text-[11px] font-medium text-white">{label}</span>
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
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/80 px-5 text-center backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="size-8 animate-spin text-accent" aria-hidden="true" />

      <div className="space-y-1">
        <p className="font-display text-lg font-bold leading-tight tracking-tight text-white">
          Sedang memproses video
        </p>
        <p className="text-sm font-medium text-white/85">{label}…</p>
      </div>

      {/* persen 1-100: sengaja minimal 1 supaya tidak terlihat "mati di 0" */}
      <div className="w-full max-w-[240px]">
        <p className="font-display text-4xl font-bold leading-none tabular-nums text-accent">
          {Math.max(1, p)}
          <span className="text-xl">%</span>
        </p>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(2, p)}%` }}
          />
        </div>
      </div>

      <p className="text-xs font-medium tabular-nums text-white/70">
        {sisa !== null
          ? `Estimasi selesai ${mmss(sisa)}`
          : elapsedS > 0
            ? `Berjalan ${mmss(elapsedS)} — menghitung estimasi…`
            : "Menghitung estimasi…"}
      </p>

      <p className="max-w-[250px] text-[11px] leading-relaxed text-white/55">
        Proses berjalan di server — kamu boleh menutup halaman ini, hasilnya
        tetap tersimpan.
      </p>
    </div>
  );
}
