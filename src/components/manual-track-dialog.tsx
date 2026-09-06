"use client";
/**
 * MANUAL TRACKING — pemilihan subjek berbasis adegan.
 *
 * VIDEO PLAYER BUATAN SENDIRI (permintaan pengguna: "video yang mau di
 * manual tracker nya itu gak pakai video player basic tapi pakai video
 * player buatan sendiri khusus"): tombol play/pause besar, scrub bar
 * presisi, jam mono, tap kiri/kanan ±5 detik, mute — tanpa <video controls>.
 *
 * BORDER TRACKING: setelah pengguna klik subjek, POST preview
 * /api/manual-track/{id}/preview mengambil kotak subjek per frame, lalu
 * border putih-putus (dengan pegangan sudut ala CapCut) MENGIKUTI subjek
 * selama video berjalan — "biar user tau itu yang di tracking".
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

  // player buatan sendiri
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(true);
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

  /* seek ke awal adegan saat ganti pilihan */
  useEffect(() => {
    const v = vidRef.current;
    if (!v || !scene || !sourceUrl) return;
    try { v.currentTime = scene.start; } catch { /* belum siap */ }
    setBoxes(null);
    setKlik(null);
    setTime(scene.start);
  }, [selScene, scene, sourceUrl]);

  /* jam player: rAF loop */
  useEffect(() => {
    const tick = () => {
      const v = vidRef.current;
      if (v && !v.paused && v.readyState >= 2) {
        const t = v.currentTime;
        setTime(t);
        if (scene && t >= scene.end) {
          v.pause();
          setPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [scene]);

  const togglePlay = useCallback(() => {
    const v = vidRef.current;
    if (!v) return;
    if (v.paused) { void v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); setPlaying(false); }
  }, []);

  const seek = useCallback((t: number) => {
    const v = vidRef.current;
    if (!v || !scene) return;
    const c = Math.max(scene.start, Math.min(scene.end - 0.05, t));
    try { v.currentTime = c; } catch { /* ok */ }
    setTime(c);
  }, [scene]);

  /* KLIK SUBJEK → ambil kotak tracking dari backend (preview tanpa simpan) */
  async function handleKlikVideo(e: React.MouseEvent<HTMLDivElement>) {
    const v = vidRef.current;
    if (!v || !scene) return;
    const r = e.currentTarget.getBoundingClientRect();
    // koordinat klik terhadap KOTAK VIDEO (bukan kontainer): hitung ulang
    // dari rect video — object-contain bisa membuat letterbox.
    const vr = v.getBoundingClientRect();
    const x = (e.clientX - vr.left) / vr.width;
    const y = (e.clientY - vr.top) / vr.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const tRef = v.currentTime;
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
          t_ref: tRef,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "AI tidak menemukan subjek di situ");
      const d = await res.json();
      setBoxes(d.boxes ?? null);
      setBoxesFps(d.fps ?? 15);
      setBoxStart(d.start ?? scene.start);
      // mainkan otomatis supaya border langsung terlihat mengikuti subjek
      const vv = vidRef.current;
      if (vv) {
        try { vv.currentTime = scene.start; } catch { /* ok */ }
        void vv.play().then(() => setPlaying(true)).catch(() => {});
      }
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Gagal mengunci subjek");
      setBoxes(null);
    } finally {
      setMencari(false);
    }
  }

  /* kotak yang tampil pada waktu `time` */
  const boxSekarang = useMemo<TrackBox | null>(() => {
    if (!boxes || boxes.length === 0) return null;
    const idx = Math.round((time - boxStart) * boxesFps);
    if (idx < 0 || idx >= boxes.length) return null;
    return boxes[idx] ?? null;
  }, [boxes, boxesFps, boxStart, time]);

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
          t_ref: v ? Math.max(scene.start, v.currentTime) : undefined,
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
      toast.success(`Subjek terkunci di adegan ${scene.start}s–${scene.end}s — preview dibuat ulang`);
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

        {/* body */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:flex-row">
          {/* ══ VIDEO PLAYER BUATAN SENDIRI ══ */}
          <div className="relative min-w-0 flex-1">
            <div
              className="relative overflow-hidden rounded-2xl border border-border bg-black"
              onClick={(e) => void handleKlikVideo(e)}
              style={{ cursor: "crosshair" }}
            >
              {sourceUrl ? (
                <video
                  ref={vidRef}
                  src={sourceUrl}
                  playsInline
                  muted={muted}
                  preload="auto"
                  className="block max-h-[54dvh] w-full object-contain"
                />
              ) : (
                <div className="grid h-48 place-items-center text-xs text-muted-foreground">
                  Video sumber tidak tersedia
                </div>
              )}

              {/* BORDER TRACKING — mengikuti subjek per frame */}
              {boxSekarang ? (
                <div
                  className="pointer-events-none absolute z-10 rounded-lg border-[2.5px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.55)]"
                  style={{
                    left: `${boxSekarang.cx * 100}%`,
                    top: `${boxSekarang.cy * 100}%`,
                    width: `${Math.max(boxSekarang.w, 0.06) * 130}%`,
                    aspectRatio: "1 / 1",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {/* sudut ala CapCut — tanda "ini yang dilacak" */}
                  <span className="absolute -left-1 -top-1 size-2.5 rounded-full border-2 border-white bg-accent" />
                  <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-white bg-accent" />
                  <span className="absolute -bottom-1 -left-1 size-2.5 rounded-full border-2 border-white bg-accent" />
                  <span className="absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-white bg-accent" />
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-md bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Dilacak
                  </span>
                </div>
              ) : null}

              {/* marker titik klik */}
              {klik && !boxSekarang && !mencari ? (
                <span
                  className="pointer-events-none absolute z-10 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-accent bg-accent/25"
                  style={{ left: `${klik.x * 100}%`, top: `${klik.y * 100}%` }}
                >
                  <Crosshair className="size-4 text-white" />
                </span>
              ) : null}

              {mencari ? (
                <span className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[10.5px] font-medium text-white backdrop-blur">
                  <Loader2 className="size-3 animate-spin" /> AI mengenali subjek…
                </span>
              ) : null}

              {/* petunjuk + tombol play kecil (bukan overlay penuh —
                  seluruh bidang video harus tetap AREA KLIK SUBJEK;
                  overlay penuh menelan klik user = subjek tak terpilih) */}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-[11px] font-medium text-white">
                {boxes ? "Kotak putih = subjek yang dilacak · ketuk video untuk ganti subjek" : "Ketuk orang/benda yang mau dilacak di video ini"}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className="absolute bottom-1.5 right-2 z-[6] grid size-9 cursor-pointer place-items-center rounded-full bg-black/60 text-white backdrop-blur transition-transform active:scale-95"
                aria-label={playing ? "Jeda" : "Putar"}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
              </button>
            </div>

            {/* — kontrol player buatan sendiri — */}
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => seek(time - 5)}
                onDoubleClick={togglePlay}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-[11px] font-bold tabular-nums text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Mundur 5 detik"
              >−5s</button>
              <button
                type="button"
                onClick={togglePlay}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-md shadow-accent/25 transition-transform active:scale-95"
                aria-label={playing ? "Jeda" : "Putar"}
              >
                {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
              </button>
              <button
                type="button"
                onClick={() => seek(time + 5)}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-[11px] font-bold tabular-nums text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Maju 5 detik"
              >+5s</button>

              <div className="ml-1 min-w-0 flex-1">
                <div className="flex items-center justify-between text-[10.5px] font-medium tabular-nums text-muted-foreground">
                  <span>{fmt(time)}</span>
                  <span>{fmt(scene?.end ?? duration)}</span>
                </div>
                <input
                  type="range"
                  min={scene?.start ?? 0}
                  max={scene?.end ?? duration}
                  step={0.05}
                  value={Math.min(time, scene?.end ?? duration)}
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
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
                aria-label={muted ? "Bunyikan" : "Bisukan"}
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            </div>
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
                    onClick={() => setSelScene(i)}
                    className={`flex shrink-0 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] font-medium transition-colors ${
                      aktif
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-background hover:border-accent/50"
                    }`}
                  >
                    <span className="tabular-nums">{s.start}s–{s.end}s</span>
                    {ada ? <span className="size-1.5 rounded-full bg-accent" /> : null}
                  </button>
                );
              })}
            </div>

            {saved.length > 0 ? (
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {saved.length} adegan sudah punya subjek terkunci. Menyimpan adegan yang sama menimpa yang lama.
              </p>
            ) : null}

            <button
              type="button"
              disabled={saving || !klik}
              onClick={() => void terapkan()}
              className="mt-auto flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-accent-foreground transition-all hover:brightness-105 active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
              {saving ? "Mengunci subjek…" : "Kunci subjek di adegan ini"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
