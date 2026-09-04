/**
 * PageLoading — penanda memuat SATU BENTUK untuk seluruh aplikasi.
 *
 * Kenapa ada: tiap halaman dulu memakai penanda sendiri-sendiri — ada yang cuma
 * `<Loader2 className="size-5 animate-spin" />` di tengah layar tanpa teks, ada
 * yang tidak punya penanda sama sekali sehingga layar kosong sampai data tiba.
 * Pada koneksi HP itu terlihat seperti aplikasi menggantung.
 *
 * Bentuknya: spinner + label di TENGAH area, dengan INDIKATOR PERSEN di bawahnya.
 *
 * Soal persen: kalau pemanggil tahu persen sebenarnya (unggahan, render ffmpeg),
 * kirim lewat `pct` dan angka itu yang dipakai. Kalau tidak ada — misalnya
 * menunggu balasan basis data yang tidak melaporkan kemajuan — komponen memakai
 * PERKIRAAN BERBASIS WAKTU yang naik melambat dan BERHENTI di 90%: jujur bahwa
 * ini perkiraan, tidak pernah berpura-pura selesai, dan tetap memberi tanda
 * "masih hidup" alih-alih spinner yang berputar tanpa informasi. Sisanya (90→100)
 * hanya terjadi kalau pemuatan benar-benar tuntas.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/** Waktu (ms) untuk mencapai ~63% pada kurva perkiraan. */
const TAU_MS = 2600;

export function PageLoading({
  label = "Memuat",
  pct,
  sub,
  className = "",
  fullscreen = false,
}: {
  /** teks di atas bilah, mis. "Memuat proyek" */
  label?: string;
  /** 0-100 kalau persen NYATA tersedia; undefined = pakai perkiraan waktu */
  pct?: number;
  /** keterangan tambahan opsional di bawah persen */
  sub?: string;
  className?: string;
  /** true = menutupi seluruh layar (dipakai saat rute belum siap) */
  fullscreen?: boolean;
}) {
  const [tick, setTick] = useState(0);
  const mulai = useRef<number>(Date.now());

  useEffect(() => {
    if (pct !== undefined) return; // persen nyata: tidak perlu timer
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [pct]);

  // 1 - e^(-t/tau) → naik cepat lalu melambat; dibatasi 90%
  const perkiraan = (() => {
    const dt = Date.now() - mulai.current;
    return Math.min(90, Math.round((1 - Math.exp(-dt / TAU_MS)) * 90));
  })();
  void tick; // memicu render ulang; nilainya sendiri tidak dipakai

  const p = Math.max(0, Math.min(100, Math.round(pct ?? perkiraan)));

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${
        fullscreen ? "min-h-screen" : "min-h-[240px] w-full py-10"
      } ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="size-7 animate-spin text-accent" />
      <p className="text-[13px] font-semibold">{label}…</p>
      <div className="w-full max-w-[190px]">
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(3, p)}%` }}
          />
        </div>
        <p className="mt-1.5 text-center text-[11px] font-semibold tabular-nums text-accent">
          {p}%
        </p>
      </div>
      {sub ? (
        <p className="max-w-[260px] text-center text-[11px] leading-relaxed text-muted-foreground">
          {sub}
        </p>
      ) : null}
    </div>
  );
}
