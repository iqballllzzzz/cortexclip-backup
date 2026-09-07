"use client";
/**
 * MANUAL TRACKING — pemilihan subjek berbasis adegan.
 *
 * DIRENGKAK DARI KELUHAN PENGGUNA (2026-09-06): "masih berantakan, preview
 * munculnya lama, susah dioperasikan". Perombakan:
 *  — Layout: satu kolom jelas — VIDEO (besar) → PLAYER BAR → ADEGAN (chip
 *    besar horizontal, tidak lagi sidebar sempit yang bikin sesak).
 *  — Loading: video sumber lazim 20–40MB lewat signed URL → skeleton gelap
 *    + spinner + teks "Memuat video sumber…" selama buffering, bukan kotak
 *    hitam diam yang terasa mati.
 *  — Panduan 3 langkah ringkas di atas dialog, satu kalimat per langkah.
 *  — Player buatan sendiri: play/pause, ±5s, scrub bar, jam, mute.
 *  — Klik subjek → POST preview (border per frame dari AI) → border putih
 *    mengikuti subjek; klik lain = ganti subjek; kunci → tersimpan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Crosshair, Loader2, Pause, Play, Scissors, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { getAccessToken } from "@/lib/backend-api";

export interface ManualScene {
  start: number;
  end: number;
}

interface TrackBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function fmt(t: number) {
  const m = Math.floor(Math.max(0, t) / 60);
  const s = Math.floor(Math.max(0, t) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ManualTrackDialog({
  clipId,
  sourceUrl,
  duration,
  clipStart = 0,
  onClose,
  onApplied,
}: {
  clipId: string;
  sourceUrl: string | null;
  duration: number;
  clipStart?: number;
  onClose: () => void;
  onApplied: () => void;
}) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const [scenes, setScenes] = useState<ManualScene[] | null>(null);
  const [selScene, setSelScene] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ start: number; end: number }[]>([]);
  const [klik, setKlik] = useState<{ x: number; y: number } | null>(null);

  // player
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(true);
  const [videoSiap, setVideoSiap] = useState(false);
  const [videoGagal, setVideoGagal] = useState(false);
  const rafRef = useRef<number>(0);

  // border tracking
  const [boxes, setBoxes] = useState<TrackBox[] | null>(null);
  const [boxesFps, setBoxesFps] = useState(15);
  const [boxStart, setBoxStart] = useState(0);
  const [mencari, setMencari] = useState(false);

  /* adegan 10 detik */
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

  /* muat scene tersimpan */
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
      } catch { /* offline ok */ }
    })();
  }, [clipId]);

  const scene = scenes?.[selScene] ?? null;

  /* seek ke awal adegan (ABSOLUT — klip bisa mulai di 3:00 dst) */
  useEffect(() => {
    const v = vidRef.current;
    if (!v || !scene || !sourceUrl) return;
    if (videoSiap) {
      try { v.currentTime = clipStart + scene.start; } catch { /* belum siap */ }
      setTime(clipStart + scene.start);
    }
    setBoxes(null);
    setKlik(null);
  }, [selScene, scene, sourceUrl, clipStart, videoSiap]);

  function handleLoadedMetadata() {
    const v = vidRef.current;
    setVideoSiap(true);
    setVideoGagal(false);
    if (!v || !scene) return;
    try { v.currentTime = clipStart + scene.start; } catch { /* ok */ }
    setTime(clipStart + scene.start);
  }

  /* jam player */
  useEffect(() => {
    const tick = () => {
      const v = vidRef.current;
      if (v && !v.paused && v.readyState >= 2) {
        const t = v.currentTime;
        setTime(t);
        if (scene && t >= clipStart + scene.end) {
          v.pause();
          setPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scene, clipStart]);

  const togglePlay = useCallback(() => {
    const v = vidRef.current;
    if (!v) return;
    if (v.paused) {
      if (scene && v.currentTime < clipStart + scene.start - 0.2) {
        try { v.currentTime = clipStart + scene.start; } catch { /* ok */ }
      }
      void v.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [scene, clipStart]);

  const seek = useCallback((tAbs: number) => {
    const v = vidRef.current;
    if (!v || !scene) return;
    const c = Math.max(clipStart + scene.start,
                       Math.min(clipStart + scene.end - 0.05, tAbs));
    try { v.currentTime = c; } catch { /* ok */ }
    setTime(c);
  }, [scene, clipStart]);

  /* KLIK SUBJEK */
  async function handleKlikVideo(e: React.MouseEvent<HTMLDivElement>) {
    const v = vidRef.current;
    if (!v || !scene || mencari) return;
    const vr = v.getBoundingClientRect();
    const x = (e.clientX - vr.left) / vr.width;
    const y = (e.clientY - vr.top) / vr.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const tRefRel = Math.max(scene.start,
      Math.min(scene.end - 0.05, v.currentTime - clipStart));
    setKlik({ x, y });
    setMencari(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/manual-track/${clipId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scene_start: scene.start,
          scene_end: scene.end,
          cx: x, cy: y,
          t_ref: tRefRel,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "AI tidak menemukan subjek di situ");
      const d = await res.json();
      setBoxes(d.boxes ?? null);
      setBoxesFps(d.fps ?? 15);
      setBoxStart(d.start ?? scene.start);
      const vv = vidRef.current;
      if (vv) {
        try { vv.currentTime = clipStart + scene.start; } catch { /* ok */ }
        void vv.play().then(() => setPlaying(true)).catch(() => {});
      }
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Gagal mengunci subjek");
      setBoxes(null);
    } finally {
      setMencari(false);
    }
  }

  const boxSekarang = useMemo<TrackBox | null>(() => {
    if (!boxes || boxes.length === 0) return null;
    const rel = Math.max(0, time - clipStart);
    const idx = Math.round((rel - boxStart) * boxesFps);
    if (idx < 0 || idx >= boxes.length) return null;
    return boxes[idx] ?? null;
  }, [boxes, boxesFps, boxStart, time, clipStart]);

  async function terapkan() {
    if (!scene || !klik) {
      toast.error("Klik dulu subjek yang mau dilacak di video");
      return;
    }
    const v = vidRef.current;
    setSaving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/manual-track/${clipId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scene_start: scene.start,
          scene_end: scene.end,
          cx: klik.x, cy: klik.y,
          t_ref: v ? Math.max(scene.start,
            Math.min(scene.end - 0.05, v.currentTime - clipStart)) : undefined,
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
      toast.success(`Subjek terkunci — preview dibuat ulang`);
      onApplied();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan tracking");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-3 sm:p-4">
      <motion.button
        aria-label="Tutup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/50 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        {/* header ringkas + panduan 3 langkah */}
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Crosshair className="size-4 shrink-0 text-accent" />
            <p className="flex-1 truncate font-display text-sm font-bold tracking-tight">
              Manual Tracking
            </p>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              aria-label="Tutup"
            >✕</button>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            1. Pilih adegan · 2. Ketuk orang/benda di video · 3. Tekan Kunci.
            Kotak putih menandai subjek yang dilacak.
          </p>
        </div>

        {/* body: SATU KOLOM urut dari atas ke bawah — tidak ada sidebar */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {/* ══ VIDEO (besar) ══ */}
          <div
            className="relative w-full overflow-hidden rounded-2xl border border-border bg-black"
            onClick={(e) => void handleKlikVideo(e)}
            style={{ cursor: videoSiap && !mencari ? "crosshair" : "default" }}
          >
            {sourceUrl ? (
              <video
                ref={vidRef}
                src={sourceUrl}
                playsInline
                muted={muted}
                preload="auto"
                onLoadedMetadata={handleLoadedMetadata}
                onError={() => setVideoGagal(true)}
                className="block max-h-[46dvh] w-full object-contain"
              />
            ) : (
              <div className="grid h-40 place-items-center text-xs text-muted-foreground">
                Video sumber tidak tersedia
              </div>
            )}

            {/* LOADING STATE — keluhan "preview munculnya lama": video
                sumber besar butuh waktu buffering; tunjukkan progress jelas,
                bukan kotak hitam diam. */}
            {!videoSiap && !videoGagal ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80">
                <Loader2 className="size-8 animate-spin text-accent" />
                <p className="text-[12.5px] font-medium text-white/90">Memuat video sumber…</p>
                <p className="text-[11px] text-white/50">Video panjang butuh beberapa detik</p>
              </div>
            ) : null}
            {videoGagal ? (
              <div className="absolute inset-0 z-20 grid place-items-center bg-black/80 px-4 text-center">
                <p className="text-[12.5px] text-white/80">
                  Video sumber gagal dimuat — tutup lalu buka lagi
                </p>
              </div>
            ) : null}

            {/* BORDER TRACKING */}
            {boxSekarang ? (
              <div
                className="pointer-events-none absolute z-10 rounded-lg border-[2.5px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.55)]"
                style={{
                  left: `${boxSekarang.cx * 100}%`,
                  top: `${boxSekarang.cy * 100}%`,
                  width: `${Math.max(boxSekarang.w, 0.05) * 128}%`,
                  height: `${Math.max(boxSekarang.h ?? boxSekarang.w, 0.05) * 128}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span className="absolute -left-1 -top-1 size-2.5 rounded-full border-2 border-white bg-accent" />
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-white bg-accent" />
                <span className="absolute -bottom-1 -left-1 size-2.5 rounded-full border-2 border-white bg-accent" />
                <span className="absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-white bg-accent" />
                <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-md bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  Dilacak
                </span>
              </div>
            ) : null}

            {/* marker klik */}
            {klik && !boxSekarang && !mencari && videoSiap ? (
              <span
                className="pointer-events-none absolute z-10 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-accent bg-accent/25"
                style={{ left: `${klik.x * 100}%`, top: `${klik.y * 100}%` }}
              >
                <Crosshair className="size-4 text-white" />
              </span>
            ) : null}

            {mencari ? (
              <span className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-[10.5px] font-medium text-white backdrop-blur">
                <Loader2 className="size-3 animate-spin" /> AI mengenali subjek…
              </span>
            ) : null}

            {videoSiap ? (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/75 to-transparent px-3 pb-1.5 pt-6 text-[11px] font-medium text-white">
                {boxes
                  ? "Kotak = subjek yang dilacak · ketuk video untuk ganti"
                  : "Ketuk orang/benda yang mau dilacak"}
              </span>
            ) : null}

            {/* tombol play kecil di pojok */}
            {videoSiap ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="absolute bottom-1.5 right-2 z-[6] grid size-9 cursor-pointer place-items-center rounded-full bg-black/65 text-white backdrop-blur transition-transform active:scale-95"
                aria-label={playing ? "Jeda" : "Putar"}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
              </button>
            ) : null}
          </div>

          {/* ══ PLAYER BAR ══ */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => seek(time - 5)}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-[12px] font-bold tabular-nums text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Mundur 5 detik"
            >−5s</button>
            <button
              type="button"
              onClick={togglePlay}
              className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-md shadow-accent/25 transition-transform active:scale-95"
              aria-label={playing ? "Jeda" : "Putar"}
            >
              {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
            </button>
            <button
              type="button"
              onClick={() => seek(time + 5)}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-[12px] font-bold tabular-nums text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Maju 5 detik"
            >+5s</button>

            <div className="ml-1 min-w-0 flex-1">
              <div className="flex items-center justify-between text-[10.5px] font-medium tabular-nums text-muted-foreground">
                <span>{fmt(Math.max(0, time - clipStart))}</span>
                <span>{fmt(scene?.end ?? duration)}</span>
              </div>
              <input
                type="range"
                min={clipStart + (scene?.start ?? 0)}
                max={clipStart + (scene?.end ?? duration) - 0.05}
                step={0.05}
                value={Math.min(time, clipStart + (scene?.end ?? duration) - 0.05)}
                onChange={(e) => seek(Number(e.target.value))}
                className="mt-0.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-[var(--color-accent)]"
                aria-label="Garis waktu video sumber"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setMuted((m) => {
                  const v = vidRef.current;
                  if (v) v.muted = !m;
                  return !m;
                });
              }}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              aria-label={muted ? "Bunyikan" : "Bisukan"}
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          </div>

          {/* ══ ADEGAN: chip besar horizontal ══ */}
          <div className="shrink-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Scissors className="size-3" /> Adegan
            </p>
            <div className="snap-strip mt-1.5 flex gap-2 overflow-x-auto pb-1">
              {(scenes ?? []).map((s, i) => {
                const ada = saved.some((sv) => Math.abs(sv.start - s.start) < 0.05);
                const aktif = selScene === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelScene(i)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold tabular-nums transition-colors ${
                      aktif
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-foreground"
                    }`}
                  >
                    {fmt(s.start)}–{fmt(s.end)}
                    {ada ? <span className="size-1.5 rounded-full bg-accent" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══ TOMBOL UTAMA — selalu di bawah, besar ══ */}
          <button
            type="button"
            disabled={saving || !klik}
            onClick={() => void terapkan()}
            className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-[13.5px] font-semibold text-accent-foreground transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
            {saving ? "Mengunci subjek…" : "Kunci subjek di adegan ini"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
