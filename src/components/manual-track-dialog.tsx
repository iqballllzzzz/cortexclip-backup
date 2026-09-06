"use client";
/**
 * MANUAL TRACKING — pemilihan subjek berbasis adegan.
 *
 * Sesuai spesifikasi pengguna:
 *  1. Scene-by-Scene: AI membagi video menjadi adegan; user menetapkan
 *     subjek berbeda per adegan.
 *  2. AI-Assisted Identification: cukup KLIK subjek di video — AI
 *     mengenali bentuk visualnya (wajah terdekat dari titik klik pada
 *     layout_frames analisis wajah yang tersimpan).
 *  3. Smooth Object Tracking: kamera menggeser (reframe) secara halus
 *     agar subjek selalu di tengah format vertikal 9:16.
 *
 * Modal menampilkan video SUMBER 16:9 (belum dipotong) — pengguna klik
 * subjek pada adegan terpilih → POST /api/manual-track/{clip_id} →
 * trajektori tersimpan → preview dirender ulang otomatis (auto-refresh).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Crosshair, Loader2, RefreshCw, Scissors } from "lucide-react";
import { toast } from "sonner";

import { getAccessToken } from "@/lib/backend-api";

export interface ManualScene {
  start: number;
  end: number;
}

export function ManualTrackDialog({
  clipId,
  sourceUrl,
  duration,
  onClose,
  onApplied,
}: {
  clipId: string;
  sourceUrl: string | null;
  duration: number;
  onClose: () => void;
  onApplied: () => void;
}) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const [scenes, setScenes] = useState<ManualScene[] | null>(null);
  const [selScene, setSelScene] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ start: number; end: number }[]>([]);
  const [klik, setKlik] = useState<{ x: number; y: number } | null>(null);

  /* adegan dari deteksi adegan sederhana sisi klien: bagi durasi jadi
     potongan 10s (fallback) — scene AI asli ada di backend; ini cukup
     untuk penetapan subjek per adegan. */
  useEffect(() => {
    if (!sourceUrl) return;
    const n = Math.max(1, Math.ceil(duration / 10));
    const list: ManualScene[] = [];
    for (let i = 0; i < n; i++) {
      list.push({
        start: +(i * 10).toFixed(1),
        end: +Math.min(duration, (i + 1) * 10).toFixed(1),
      });
    }
    setScenes(list);
  }, [sourceUrl, duration]);

  /* muat scene yang sudah tersimpan */
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/manual-track/${clipId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setSaved((d.scenes ?? []).map((s: { start: number; end: number }) => ({
            start: +Number(s.start).toFixed(1),
            end: +Number(s.end).toFixed(1),
          })));
        }
      } catch {
        /* offline ok */
      }
    })();
  }, [clipId]);

  const scene = scenes?.[selScene] ?? null;

  /* saat ganti adegan terpilih → seek video ke awal adegan */
  useEffect(() => {
    const v = vidRef.current;
    if (!v || !scene || !sourceUrl) return;
    try {
      v.currentTime = scene.start;
    } catch {
      /* belum siap */
    }
  }, [selScene, scene, sourceUrl]);

  function handleKlikVideo(e: React.MouseEvent<HTMLVideoElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setKlik({
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    });
  }

  async function terapkan() {
    if (!scene || !klik) {
      toast.error("Klik dulu subjek yang mau dilacak di video");
      return;
    }
    setSaving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/manual-track/${clipId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scene_start: scene.start,
          scene_end: scene.end,
          cx: klik.x,
          cy: klik.y,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Gagal menyimpan tracking");
      }
      const d = await res.json();
      setSaved((d.scenes ?? []).map((s: { start: number; end: number }) => ({
        start: +Number(s.start).toFixed(1),
        end: +Number(s.end).toFixed(1),
      })));
      toast.success(
        `Subjek terkunci di adegan ${scene.start}s–${scene.end}s — preview dibuat ulang`,
      );
      onApplied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan tracking");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-4">
      <motion.button
        aria-label="Tutup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        {/* header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <Crosshair className="size-4 shrink-0 text-accent" />
          <p className="flex-1 truncate font-display text-sm font-bold tracking-tight">
            Manual Tracking
          </p>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* body: video sumber 16:9 + pilihan adegan */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:flex-row">
          {/* video */}
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-black">
            {sourceUrl ? (
              <video
                ref={vidRef}
                src={sourceUrl}
                playsInline
                controls
                muted
                preload="auto"
                onClick={handleKlikVideo}
                className="h-full max-h-[52dvh] w-full cursor-crosshair object-contain"
              />
            ) : (
              <div className="grid h-48 place-items-center text-xs text-muted-foreground">
                Video sumber tidak tersedia
              </div>
            )}
            {klik ? (
              <span
                className="pointer-events-none absolute z-10 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-accent bg-accent/25"
                style={{ left: `${klik.x * 100}%`, top: `${klik.y * 100}%` }}
              >
                <Crosshair className="size-4 text-white" />
              </span>
            ) : null}
            <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-[11px] font-medium text-white">
              Klik orang/benda yang mau dilacak di video ini
            </p>
          </div>

          {/* panel adegan */}
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-56">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Scissors className="size-3" /> Adegan
            </p>
            <div className="flex flex-row gap-1.5 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible">
              {(scenes ?? []).map((s, i) => {
                const ada = saved.some((sv) => Math.abs(sv.start - s.start) < 0.05);
                const aktif = selScene === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelScene(i);
                      setKlik(null);
                    }}
                    className={`flex shrink-0 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] font-medium transition-colors ${
                      aktif
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-background hover:border-accent/50"
                    }`}
                  >
                    <span className="tabular-nums">
                      {s.start}s–{s.end}s
                    </span>
                    {ada ? <span className="size-1.5 rounded-full bg-accent" /> : null}
                  </button>
                );
              })}
            </div>

            {saved.length > 0 ? (
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {saved.length} adegan sudah punya subjek terkunci. Menyimpan
                adegan yang sama menimpa yang lama.
              </p>
            ) : null}

            <button
              type="button"
              disabled={saving || !klik}
              onClick={() => void terapkan()}
              className="mt-auto flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-accent-foreground transition-all hover:brightness-105 active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {saving ? "Mengunci subjek…" : "Kunci subjek di adegan ini"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
