import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  BadgeX,
  Clock,
  Download,
  Hash,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Subtitles,
  Sticker,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getPreset, SubtitleStylePicker, DEFAULT_SUBTITLE_PRESET } from "@/components/subtitle-styles";
import { ColoredIcon } from "@/components/colored-icon";
import { BrollPip } from "@/components/broll-pip";
import { LiveCaptionOverlay, type LiveCaptionStyle, type LiveWord } from "@/components/live-caption-overlay";
import { startRenderJob, getAccessToken } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ClipBase = Database["public"]["Tables"]["clips"]["Row"];
type Clip = ClipBase & {
  preview_url?: string | null;
  preview_ready?: boolean;
};

export const Route = createFileRoute("/_authenticated/editor/$clipId")({
  head: () => ({
    meta: [
      { title: "Editor Klip — CortexClip" },
      { name: "description", content: "Editor klip vertikal — subtitle karaoke, ikon & b-roll, emoji." },
    ],
  }),
  component: EditorPage,
});

/* ---------------------------------------------------------------- toolbar */

type ToolId = "subtitle" | "info" | "broll";

const TOOLS: { id: ToolId; label: string; Icon: typeof Hash }[] = [
  { id: "subtitle", label: "Subtitle", Icon: Subtitles },
  { id: "info", label: "Deskripsi", Icon: Hash },
  { id: "broll", label: "Ikon", Icon: Sticker },
];

interface Placement {
  time_start: number;
  time_end: number;
  category: string;
  icon?: string | null;
  /** id ikon katalog (mis. 'MoneyIcon-blue') — PNG dari /api/icons/{id} */
  icon_id?: string;
  iconEmoji?: string;
  side: string;
  animation: string;
  broll_url?: string | null;
  genre?: string;
}

/* ------------------------------------------------------------------- page */

function EditorPage() {
  const { clipId } = Route.useParams();
  const navigate = useNavigate();

  const [clip, setClip] = useState<Clip | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // player
  const videoRef = useRef<HTMLVideoElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  // "source" = video penuh (currentTime absolut) · "preview" = video terpotong (relatif)
  const videoKindRef = useRef<"source" | "preview" | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fit, setFit] = useState({ w: 216, h: 384 });

  // tools
  const [activeTool, setActiveTool] = useState<ToolId>("subtitle");
  const [presetId, setPresetId] = useState(DEFAULT_SUBTITLE_PRESET);
  const [fontScale, setFontScale] = useState(1);
  const [position, setPosition] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [brollEnabled, setBrollEnabled] = useState(false);
  const [brollSearching, setBrollSearching] = useState(false);
  const [emojiEnabled, setEmojiEnabled] = useState(false);
  const [livePlacements, setLivePlacements] = useState<Placement[]>([]);

  // watermark ads
  const [adsWatched, setAdsWatched] = useState(0);
  const [watermarkRemoved, setWatermarkRemoved] = useState(false);
  const [adPlaying, setAdPlaying] = useState(false);

  // unduhan
  const [downloadLocked, setDownloadLocked] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<string | null>(null);

  const clipRef = useRef<Clip | null>(null);
  clipRef.current = clip;
  const startNum = Number(clip?.start_time ?? 0);
  const duration = clip ? Math.max(0.1, Number(clip.end_time) - Number(clip.start_time)) : 0.1;

  /* --- memori editor per-klip --- */
  const memKey = `cc_editor_mem_${clipId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(memKey);
      if (!raw) return;
      const m = JSON.parse(raw) as Record<string, unknown>;
      if (typeof m["presetId"] === "string") setPresetId(m["presetId"]);
      if (typeof m["fontScale"] === "number") setFontScale(m["fontScale"]);
      if (typeof m["position"] === "number") setPosition(m["position"]);
      if (typeof m["opacity"] === "number") setOpacity(m["opacity"]);
      if (typeof m["brollEnabled"] === "boolean") {
        setBrollEnabled(m["brollEnabled"]);
        if (m["brollEnabled"] && Array.isArray(m["livePlacements"]))
          setLivePlacements(m["livePlacements"] as Placement[]);
      }
      if (typeof m["emojiEnabled"] === "boolean") setEmojiEnabled(m["emojiEnabled"]);
    } catch {
      /* korup → abaikan */
    }
  }, [memKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          memKey,
          JSON.stringify({ presetId, fontScale, position, opacity, brollEnabled, emojiEnabled, livePlacements, savedAt: Date.now() }),
        );
      } catch {
        /* storage penuh → abaikan */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [memKey, presetId, fontScale, position, opacity, brollEnabled, emojiEnabled, livePlacements]);

  /* --- load clip + project + sumber (preview INSTAN) --- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("clips").select("*").eq("id", clipId).single();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Klip tidak ditemukan");
        navigate({ to: "/dashboard" });
        return;
      }
      const c = data as Clip;
      setClip(c);
      if (c.project_id) {
        const { data: p } = await supabase.from("projects").select("*").eq("id", c.project_id).single();
        if (!cancelled && p) {
          const proj = p as Project;
          setProject(proj);
          if (proj.storage_path) {
            supabase.storage
              .from("video-uploads")
              .createSignedUrl(proj.storage_path, 60 * 60)
              .then(({ data: s }) => {
                if (!cancelled && s?.signedUrl) {
                  videoKindRef.current = "source";
                  setSourceUrl(s.signedUrl);
                }
              });
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clipId, navigate]);

  /* --- status iklan/watermark --- */
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/ads/status", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setAdsWatched(d.ads_watched);
          setWatermarkRemoved(d.watermark_removed);
        }
      } catch {
        /* offline ok */
      }
    })();
  }, []);

  /* --- pemanasan preview server di belakang + polling status --- */
  const warmServerPreview = useCallback(async () => {
    if (!clip || clip.preview_ready) return;
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/preview-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: clip.project_id, clip_id: clip.id }),
      });
      if (!res.ok) return;
      const d = await res.json();
      if (d.url) {
        setClip((c) => (c ? { ...c, preview_url: d.url, preview_ready: true } : c));
        if (!videoKindRef.current) videoKindRef.current = "preview";
        return;
      }
      // Masih diproses di server. Preview instan (sumber + overlay CSS) sudah
      // jalan, jadi polling ini cuma menaikkan kualitas begitu file siap.
      // Proses server TIDAK ikut mati kalau user menutup halaman.
      const clipId = clip.id;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const t2 = await getAccessToken();
        const st = await fetch(`/api/preview-clip/status/${clipId}`, {
          headers: { Authorization: `Bearer ${t2}` },
        });
        if (!st.ok) return;
        const sd = await st.json();
        if (sd.status === "ready" && sd.url) {
          setClip((c) => (c && c.id === clipId ? { ...c, preview_url: sd.url, preview_ready: true } : c));
          if (!videoKindRef.current) videoKindRef.current = "preview";
          return;
        }
        if (sd.status === "idle") return; // gagal / tidak ada task
      }
    } catch {
      /* mode instan tetap jalan */
    }
  }, [clip]);

  useEffect(() => {
    const t = setTimeout(() => void warmServerPreview(), 1200);
    return () => clearTimeout(t);
  }, [warmServerPreview]);

  const words = useMemo<LiveWord[]>(
    () =>
      ((clip?.caption_words as unknown as { word: string; start: number; end: number }[]) ?? []).map(
        (w) => ({ word: w.word, start: Number(w.start), end: Number(w.end) }),
      ),
    [clip],
  );

  /* --- fit canvas 9:16 — sisa ruang setelah panel 40dvh, timeline 30px --- */
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (availW < 40 || availH < 40) return;
      const h = Math.min(availH - 34, (availW * 16) / 9);
      const w = (h * 9) / 16;
      setFit({ w: Math.round(w), h: Math.round(h) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  /* --- WAKU VIDEO: rAF loop (anti-stuck) — sumber penuh → relatif klip --- */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const c = clipRef.current;
      if (v && c && !v.paused && v.readyState >= 2) {
        const kind = videoKindRef.current;
        const raw = kind === "source" ? v.currentTime - Number(c.start_time) : v.currentTime;
        if (raw >= duration) {
          // akhir klip → pause + kunci waktu di durasi
          v.pause();
          setPlaying(false);
          setTime(duration);
        } else {
          setTime(Math.max(0, raw));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  /* --- video sumber penuh: SEEK ke start_time saat metadata siap ---
     (inilah akar bug "subtitle stuck di 0:00": video main dari awal file) */
  function handleLoadedMetadata() {
    const v = videoRef.current;
    const c = clipRef.current;
    if (!v || !c) return;
    if (videoKindRef.current === "source") {
      try {
        v.currentTime = Number(c.start_time);
      } catch {
        /* seek gagal → biarkan */
      }
    }
  }

  // === STOP OTOMATIS di akhir klip (video sumber penuh jangan lanjut) ===
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const check = () => {
      const c = clipRef.current;
      if (!v.paused && c && videoKindRef.current === "source") {
        const rel = v.currentTime - Number(c.start_time);
        if (rel >= duration - 0.05) {
          v.pause();
          setPlaying(false);
          setTime(duration);
        }
      }
    };
    // cek tiap frame via rAF sudah ada; ini interval cadangan 250ms
    const iv = setInterval(check, 250);
    return () => clearInterval(iv);
  }, [duration]);

  const preset = getPreset(presetId);
  const effPosition = position ?? preset.style.position;
  const effFontSize = Math.round(preset.style.font_size * fontScale);

  const liveStyle: LiveCaptionStyle = {
    fontFamily: preset.cssFontFamily,
    fontSize: effFontSize * 0.42,
    ...(preset.style.max_words ? { maxWords: preset.style.max_words } : {}),
    fontColor: preset.style.font_color,
    highlightColor: preset.style.highlight_color,
    emphasisColor: preset.style.highlight_color,
    strokeColor: "#000000",
    strokeWidth: preset.style.word_box ? 0 : 3,
    shadow: true,
    wordBox: preset.style.word_box ?? false,
    wordBoxColor: preset.style.word_box_color ?? "#000000",
    uppercase: preset.style.uppercase ?? false,
    opacity,
    position: effPosition,
    animation: "karaoke",
  };

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(duration - 0.05, t));
    if (videoKindRef.current === "source") v.currentTime = Number(clip?.start_time ?? 0) + clamped;
    else v.currentTime = clamped;
    setTime(clamped);
  }

  function buildCaptionStyle() {
    return {
      preset: presetId,
      font_family: preset.style.font_family,
      font_size: effFontSize,
      font_color: preset.style.font_color,
      highlight_color: preset.style.highlight_color,
      position: effPosition,
      word_box: preset.style.word_box ?? false,
      word_box_color: preset.style.word_box_color,
      emoji: emojiEnabled || preset.style.emoji,
      uppercase: preset.style.uppercase ?? false,
      opacity,
      broll: brollEnabled,
    };
  }

  async function handleDownload() {
    if (!clip || submitting || downloadLocked) return;
    setSubmitting(true);
    try {
      let queueNote = "";
      try {
        const tokenQ = await getAccessToken();
        const res = await fetch("/api/render-jobs/queue", {
          headers: { Authorization: `Bearer ${tokenQ}` },
        });
        if (res.ok) {
          const d = await res.json();
          if (d.total_active > 0) queueNote = ` Anda ada di nomor antrean ke ${d.total_active + 1}.`;
        }
      } catch {
        /* abaikan */
      }
      await startRenderJob({
        projectId: clip.project_id,
        clipId: clip.id,
        clipTitle: clip.title,
        captionStyle: buildCaptionStyle(),
      });
      setDownloadLocked(true);
      pollRenderDone();
      setDownloadInfo(queueNote);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memulai render");
    } finally {
      setSubmitting(false);
    }
  }

  function pollRenderDone() {
    const iv = setInterval(async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/render-jobs/project/${clip!.project_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const d = await res.json();
        const mine = (d.jobs ?? []).filter((j: { clip_id?: string }) => j.clip_id === clip!.id);
        const latest = mine[0];
        if (latest && (latest.status === "completed" || latest.status === "failed")) {
          clearInterval(iv);
          setDownloadLocked(false);
        }
      } catch {
        /* keep polling */
      }
    }, 8000);
  }

  async function handleAdWatched() {
    setAdPlaying(false);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/ads/watched", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setAdsWatched(d.ads_watched);
        setWatermarkRemoved(d.watermark_removed);
        toast.success(d.message);
      }
    } catch {
      toast.error("Gagal mencatat iklan");
    }
  }

  /** Muat placement ikon/b-roll. refresh=true memaksa AI merencanakan ulang;
   *  tanpa refresh, backend mengembalikan rencana tersimpan supaya preview
   *  dan hasil unduhan PERSIS sama. */
  async function loadPlacements(refresh = false) {
    if (!clip) return;
    setBrollSearching(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/broll/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: clip.project_id, clip_id: clip.id, refresh }),
      });
      if (res.ok) {
        const d = await res.json();
        setLivePlacements(d.placements ?? []);
        if ((d.placements ?? []).length === 0) toast.info("AI tidak menemukan momen ikon yang cocok di klip ini.");
        else if (refresh) toast.success("Ikon & b-roll diperbarui.");
      } else {
        toast.error("Gagal memuat placement b-roll.");
      }
    } catch {
      toast.error("Gagal memuat placement b-roll.");
    } finally {
      setTimeout(() => setBrollSearching(false), 600);
    }
  }

  const refreshPlacements = () => loadPlacements(true);

  async function toggleBroll(v: boolean) {
    setBrollEnabled(v);
    if (v && clip) {
      await loadPlacements(false);
    } else {
      setLivePlacements([]);
    }
  }

  /* ------------------------------------------------------------- render */

  if (loading || !clip) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-accent" />
      </div>
    );
  }

  const videoSrc = sourceUrl ?? clip.preview_url ?? null;
  const effectiveKind = videoKindRef.current ?? (clip.preview_url ? "preview" : null);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* ===== TOP BAR (mobile 48px): Kembali · Hapus watermark coklat · Unduh ===== */}
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1.5 border-b border-border px-2 sm:h-14 sm:grid-cols-[1fr_auto_1fr] sm:gap-2 sm:px-4">
        <div className="justify-self-start">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: clip.project_id } })}>
            <ArrowLeft className="size-4" /> Kembali
          </Button>
        </div>

        {watermarkRemoved ? (
          <span className="hidden items-center gap-1.5 rounded-full border border-[var(--color-success)]/30 bg-[color-mix(in_oklab,var(--color-success)_10%,transparent)] px-3 py-1.5 text-[11px] font-semibold sm:inline-flex">
            Watermark dihapus
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdPlaying(true)}
            title="Tonton 4 iklan untuk menghapus watermark"
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-accent-foreground transition-transform hover:-translate-y-px sm:gap-1.5 sm:px-3.5 sm:text-[12px]"
          >
            <BadgeX className="size-3.5 shrink-0" />
            <span className="max-w-[96px] truncate sm:max-w-none">Hapus watermark</span>
            <span className="shrink-0 rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] tabular-nums">{adsWatched}/4</span>
          </button>
        )}

        <div className="justify-self-end">
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={submitting || downloadLocked} className="px-2.5 sm:px-4">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : downloadLocked ? <Clock className="size-4" /> : <Download className="size-4" />}
            {downloadLocked ? "Merender…" : "Unduh"}
          </Button>
        </div>
      </header>

      {/* ===== BODY: canvas besar (flex-1) + panel kecil di kanan/bawah ===== */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div ref={fitRef} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden p-2 lg:p-4">
          <div
            className="relative shrink-0 overflow-hidden rounded-2xl border border-border bg-black shadow-lg"
            style={{ width: fit.w, height: fit.h }}
          >
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                playsInline
                preload="auto"
                className="absolute inset-0 size-full object-cover"
                onClick={togglePlay}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-xs text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                Memuat video…
              </div>
            )}

            <LiveCaptionOverlay words={words} time={time} style={liveStyle} containerWidth={fit.w} showEmoji={emojiEnabled} />

            {/* B-ROLL VIDEO PiP — parity dengan render unduhan (ffmpeg overlay) */}
            {brollEnabled
              ? livePlacements
                  .filter((p) => !!p.broll_url)
                  .map((p, idx) => {
                    const active = time >= p.time_start && time <= p.time_end;
                    return (
                      <BrollPip
                        key={`broll-${p.time_start}-${idx}`}
                        url={p.broll_url as string}
                        active={active}
                        localTime={Math.max(0, time - p.time_start)}
                        width={fit.w * 0.74}
                        top={fit.h * 0.44}
                      />
                    );
                  })
              : null}

            {/* Ikon & b-roll live */}
            {brollEnabled && livePlacements.length > 0
              ? livePlacements.map((p, idx) => {
                  const active = time >= p.time_start && time <= p.time_end;
                  const dist = fit.w * 0.7;
                  let hidden = "translate(-50%, -50%) ";
                  switch (p.animation) {
                    case "slide-right": hidden += `translateX(${-dist}px)`; break;
                    case "slide-up": hidden += `translateY(${dist}px)`; break;
                    case "slide-down": hidden += `translateY(${-dist}px)`; break;
                    case "zoom-in": hidden += "scale(0) rotate(-90deg)"; break;
                    case "pop-bounce": hidden += "scale(0)"; break;
                    case "flip-in": hidden += "perspective(600px) rotateY(90deg)"; break;
                    case "drop-in": hidden += `translateY(${-fit.h * 0.5}px) rotate(-20deg)`; break;
                    case "swing-in": hidden += `translateX(${dist}px) rotate(25deg)`; break;
                    case "rotate-in": hidden += "scale(0) rotate(270deg)"; break;
                    default: hidden += `translateX(${dist}px)`;
                  }
                  return (
                    <div
                      key={`${p.time_start}-${idx}`}
                      className="pointer-events-none absolute flex items-center justify-center transition-[transform,opacity] duration-500 ease-out"
                      style={{
                        left: p.side === "left" ? "20%" : p.side === "center" ? "50%" : "80%",
                        top: "26%",
                        transform: active ? "translate(-50%, -50%)" : hidden,
                        opacity: active ? 1 : 0,
                      }}
                    >
                      <div style={{ width: fit.w * 0.24, height: fit.w * 0.24 }}>
                        {p.icon_id ? (
                          /* PARITY: PNG dari backend = berkas yang dibakar ffmpeg */
                          <img
                            src={`/api/icons/${p.icon_id}`}
                            alt=""
                            className="size-full object-contain"
                            style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.45))" }}
                          />
                        ) : (
                          <ColoredIcon category={p.category} icon={p.icon ?? null} />
                        )}
                      </div>
                    </div>
                  );
                })
              : null}

            {!watermarkRemoved ? (
              <div className="pointer-events-none absolute left-[6%] top-[5%] flex items-center opacity-65" style={{ gap: Math.max(2, fit.w * 0.012) }}>
                <img src="/watermark-logo.png" alt="" className="shrink-0 object-contain" style={{ width: fit.w * 0.095, height: fit.w * 0.095 }} />
                <div className="min-w-0 leading-tight">
                  <p className="font-bold text-white" style={{ fontSize: Math.max(7, fit.w * 0.036) }}>CortexClipAI</p>
                  <p className="text-white/90" style={{ fontSize: Math.max(4, fit.w * 0.017) }}>AI that can help many people, made in Indonesia</p>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={togglePlay}
              className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 backdrop-blur transition-opacity hover:bg-black/60"
              aria-label={playing ? "Jeda" : "Putar"}
            >
              {playing ? <Pause className="size-6 text-white" /> : <Play className="size-6 translate-x-0.5 text-white" />}
            </button>
          </div>

          {/* timeline — tipis */}
          <div className="flex w-full max-w-[420px] items-center gap-2 px-1">
            <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{clock(time)}</span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={Math.min(time, duration)}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-[var(--color-accent)]"
              aria-label="Garis waktu klip"
            />
            <span className="w-9 text-[11px] tabular-nums text-muted-foreground">{clock(duration)}</span>
          </div>
        </div>

        {/* ===== PANEL TOOL — mobile 40% tinggi (mudah dipencet & scroll), desktop 272px ===== */}
        <aside className="flex h-[40dvh] w-full shrink-0 flex-col border-t border-border bg-card md:h-auto md:w-[272px] md:border-l md:border-t-0">
          <div className="grid shrink-0 grid-cols-3 border-b border-border" role="tablist">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTool === t.id}
                onClick={() => setActiveTool(t.id)}
                className={`flex items-center justify-center gap-1.5 px-1 py-2.5 text-[12px] font-medium transition-colors ${
                  activeTool === t.id
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
              >
                <t.Icon className="size-3.5" />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>

          {/* satu-satunya area yang scroll — halaman & canvas tidak bergeser */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" data-editor-scroll>
            <AnimatePresence mode="wait">
              {activeTool === "info" ? (
                <ToolPane key="info">
                  <FieldLabel>Deskripsi</FieldLabel>
                  <textarea
                    value={clip.description ?? ""}
                    onChange={(e) => setClip({ ...clip, description: e.target.value })}
                    onBlur={() => void supabase.from("clips").update({ description: clip.description }).eq("id", clip.id)}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-[13px] outline-none transition-colors focus:border-accent"
                  />
                  <FieldLabel>Hashtag</FieldLabel>
                  <input
                    value={(clip.hashtags ?? []).join(" ")}
                    onChange={(e) => setClip({ ...clip, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
                    onBlur={() => void supabase.from("clips").update({ hashtags: clip.hashtags }).eq("id", clip.id)}
                    className="w-full rounded-lg border border-border bg-background p-2.5 text-[13px] outline-none transition-colors focus:border-accent"
                  />
                </ToolPane>
              ) : activeTool === "subtitle" ? (
                <ToolPane key="subtitle">
                  <FieldLabel>Gaya subtitle</FieldLabel>
                  <SubtitleStylePicker value={presetId} onChange={setPresetId} />
                  <div className="mt-3 space-y-3">
                    <SliderRow label={`Ukuran · ${Math.round(fontScale * 100)}%`} min={0.6} max={1.8} step={0.05} value={fontScale} onChange={setFontScale} />
                    <SliderRow label={`Posisi · ${effPosition}%`} min={20} max={80} step={1} value={effPosition} onChange={(v) => setPosition(Math.round(v))} />
                    <SliderRow label={`Transparansi · ${Math.round(opacity * 100)}%`} min={0.1} max={1} step={0.05} value={opacity} onChange={setOpacity} />
                  </div>
                </ToolPane>
              ) : (
                <ToolPane key="broll">
                  <ToggleRow
                    label="Ikon & B-Roll"
                    desc="AI menyisipkan ikon animasi di momen tepat."
                    enabled={brollEnabled}
                    onChange={(v) => void toggleBroll(v)}
                  />
                  {brollSearching ? (
                    <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2.5 text-[11px] text-accent">
                      <Loader2 className="size-3.5 animate-spin" /> Mencari momen ikon…
                    </div>
                  ) : null}
                  {brollEnabled && !brollSearching && livePlacements.length > 0 ? (
                    <>
                      <ul className="mt-2.5 space-y-1">
                        {livePlacements.map((p, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px]">
                            <span className="min-w-0 truncate capitalize">{p.category}</span>
                            <button type="button" onClick={() => seek(Math.max(0, p.time_start - 1))} className="shrink-0 font-mono text-accent">
                              {clock(p.time_start)}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => void refreshPlacements()}
                        className="mt-2 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Cari ikon &amp; b-roll lain
                      </button>
                    </>
                  ) : null}
                  <div className="mt-2.5">
                    <ToggleRow
                      label="Emoji pada subtitle"
                      desc="Emoji di beberapa kata kunci."
                      enabled={emojiEnabled}
                      onChange={setEmojiEnabled}
                    />
                  </div>
                </ToolPane>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>

      {/* ===== modal konfirmasi unduh ===== */}
      <AnimatePresence>
        {downloadInfo !== null ? (
          <Overlay onClose={() => setDownloadInfo(null)}>
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/12 text-accent">
              <Download className="size-6" />
            </span>
            <h3 className="mt-4 text-center font-display text-lg font-bold tracking-tight">
              Video tersedia di halaman{" "}
              <button
                type="button"
                onClick={() => {
                  setDownloadInfo(null);
                  navigate({ to: "/unduh" });
                }}
                className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent/80"
              >
                Unduhan
              </button>
            </h3>
            <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
              {downloadInfo
                ? `Sedang mengantri untuk merender video.${downloadInfo}`
                : "Merender video agar siap diunduh — proses berjalan di cloud meski kamu keluar dari halaman ini."}
            </p>
            <Button variant="accent" size="sm" className="mt-5 w-full" onClick={() => setDownloadInfo(null)}>
              Mengerti
            </Button>
          </Overlay>
        ) : null}
      </AnimatePresence>

      {/* ===== popup iklan (slot Google Ads) ===== */}
      <AnimatePresence>
        {adPlaying ? (
          <Overlay onClose={() => setAdPlaying(false)}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Iklan {adsWatched + 1}/4</p>
              <button type="button" onClick={() => setAdPlaying(false)} className="text-muted-foreground hover:text-foreground" aria-label="Tutup">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-surface text-xs text-muted-foreground">
              Slot Google Ads (pop-up video)
            </div>
            <Button variant="accent" size="sm" className="mt-4 w-full" onClick={handleAdWatched}>
              <Sparkles className="size-4" /> Selesai ditonton
            </Button>
          </Overlay>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------- komponen */

function ToolPane({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-2.5"
    >
      {children}
    </motion.div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function SliderRow({ label, min, max, step, value, onChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

function ToggleRow({ label, desc, enabled, onChange }: {
  label: string;
  desc: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2.5 rounded-lg border border-border bg-background p-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-tight">{label}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative h-5.5 w-10 shrink-0 rounded-full transition-colors ${enabled ? "bg-accent" : "bg-border"}`}
        style={{ height: 22 }}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${enabled ? "left-[21px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-4">
      <motion.button
        aria-label="Tutup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/30 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-lg"
      >
        {children}
      </motion.div>
    </div>
  );
}

function clock(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
