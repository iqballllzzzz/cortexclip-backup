/**
 * Iklan full-screen (gaya vignette) untuk menukar tontonan jadi premium.
 *
 * Catatan penting soal AdSense: iklan "vignette" resmi Google HANYA muncul
 * otomatis lewat Auto ads (dashboard AdSense → Auto ads → Vignette) saat user
 * berpindah halaman; tidak ada API untuk memaksanya tampil. Jadi di sini kami
 * pakai unit display AdSense yang dirender MEMENUHI LAYAR (perilaku sama dari
 * sisi user: pop-up full screen yang harus ditutup) dan hitungan detik minimal
 * supaya "ditonton" berarti benar-benar tampil.
 */
import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Detik minimal iklan harus tampil sebelum boleh dihitung. */
const MIN_WATCH_S = 10;

export function AdFullscreen({
  client,
  slot,
  index,
  total,
  onDone,
  onCancel,
}: {
  client: string;
  /** ID slot AdSense; kalau kosong, dipakai unit auto-relaxed tanpa slot. */
  slot?: string;
  index: number;
  total: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(MIN_WATCH_S);
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    // AdSense butuh elemen <ins> sudah ada di DOM sebelum push
    const t = setTimeout(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* pemblokir iklan / skrip belum termuat — tetap bisa lanjut */
      }
    }, 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95">
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold text-white/90">
          Iklan {index}/{total}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Tutup iklan"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <ins
          ref={insRef}
          className="adsbygoogle block w-full"
          style={{ display: "block", width: "100%", height: "100%", minHeight: 250 }}
          data-ad-client={client}
          {...(slot ? { "data-ad-slot": slot } : {})}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>

      <div className="shrink-0 px-4 pb-5 pt-3">
        <button
          type="button"
          disabled={left > 0}
          onClick={onDone}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-bold text-accent-foreground disabled:opacity-50"
        >
          {left > 0 ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Tunggu {left}s…
            </>
          ) : (
            "Selesai ditonton"
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-white/55">
          Iklan membiayai server supaya premium bisa gratis.
        </p>
      </div>
    </div>
  );
}
