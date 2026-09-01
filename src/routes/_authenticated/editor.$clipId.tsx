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
  { id: "broll", label: "Ikon & B-Roll", Icon: Sticker },
];

interface Placement {
  time_start: number;
  time_end: number;
  category: string;
  icon?: string | null;
  iconEmoji?: string;
  side: string;
  animation: string;
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
                if (!cancelled && s?.signedUrl) setSourceUrl(s.signedUrl);
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

  /* --- pemanasan preview server di belakang (opsional, tak menghalangi) --- */
  const warmServerPreview = useCallback(async () => {
    if (!clip || clip.preview_ready) return;
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/preview-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: clip.project_id, clip_id: clip.id }),
      });
      if (res.ok) {
        const d = await res.json();
        setClip((c) => (c ? { ...c, preview_url: d.url, preview_ready: true } : c));
      }
    } catch {
      /* mode instan tetap jalan */
    }
  }, [clip]);

  useEffect(() => {
    const t = setTimeout(() => void warmServerPreview(), 1500);
    return () => clearTimeout(t);
  }, [warmServerPreview]);

  const words = useMemo<LiveWord[]>(
    () =>
      ((clip?.caption_words as unknown as { word: string; start: number; end: number }[]) ?? []).map(
        (w) => ({ word: w.word, start: w.start, end: w.end }),
      ),
    [clip],
  );

  /* --- fit canvas 9:16 --- */
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (availW < 40 || availH < 40) return;
      const h = Math.min(availH - 60, (availW * 16) / 9);
      const w = (h * 9) / 16;
      setFit({ w: Math.round(w), h: Math.round(h) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const preset = getPreset(presetId);
  const effPosition = position ?? preset.style.position;
  const effFontSize = Math.round(preset.style.font_size * fontScale);
  const duration = clip ? clip.end_time - clip.start_time : 0;

  const liveStyle: LiveCaptionStyle = {
    fontFamily: preset.cssFontFamily,
    fontSize: effFontSize * 0.42,
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
    v.currentTime = Math.max(0, Math.min(duration - 0.05, t));
    setTime(v.currentTime);
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
        const res = await fetch("/api/render-jobs/queue-position/x", {
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

  async function toggleBroll(v: boolean) {
    setBrollEnabled(v);
    if (v && clip) {
      setBrollSearching(true);
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/broll/placements", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ project_id: clip.project_id, clip_id: clip.id }),
        });
        if (res.ok) {
          const d = await res.json();
          setLivePlacements(d.placements ?? []);
          if ((d.placements ?? []).length === 0) toast.info("AI tidak menemukan momen ikon yang cocok di klip ini.");
        } else {
          toast.error("Gagal memuat placement b-roll.");
        }
      } catch {
        toast.error("Gagal memuat placement b-roll.");
      } finally {
        setTimeout(() => setBrollSearching(false), 600);
      }
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ===== TOP BAR: Kembali · [Hapus Watermark] · Unduh ===== */}
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: clip.project_id } })}>
            <ArrowLeft className="size-4" /> Kembali
          </Button>
        </div>

        {/* tombol hapus watermark di TENGAH atas — antara Kembali & Unduh */}
        {!watermarkRemoved ? (
          <button
            type="button"
            onClick={() => setAdPlaying(true)}
            className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground sm:inline-flex"
            title="Tonton 4 iklan untuk menghapus watermark"
          >
            <BadgeX className="size-3.5 text-accent" />
            <span className="max-w-[130px] truncate">Hapus watermark</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{adsWatched}/4</span>
          </button>
        ) : (
          <span className="hidden items-center gap-1.5 rounded-full border border-[var(--color-success)]/30 bg-[color-mix(in_oklab,var(--color-success)_10%,transparent)] px-3 py-1.5 text-[12px] font-semibold sm:inline-flex">
            Watermark dihapus
          </span>
        )}

        <div className="flex items-center justify-end gap-1.5">
          <Button variant="accent" size="sm" onClick={handleDownload} disabled={submitting || downloadLocked}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : downloadLocked ? <Clock className="size-4" /> : <Download className="size-4" />}
            {downloadLocked ? "Merender…" : "Unduh"}
          </Button>
        </div>
      </header>

      {/* versi mobile: tombol hapus watermark di baris kedua tipis */}
      {!watermarkRemoved ? (
        <button
          type="button"
          onClick={() => setAdPlaying(true)}
          className="flex shrink-0 items-center justify-center gap-1.5 border-b border-border bg-surface/60 py-1.5 text-[12px] font-semibold text-muted-foreground sm:hidden"
        >
          <BadgeX className="size-3.5 text-accent" /> Hapus watermark — tonton {4 - adsWatched} iklan lagi
        </button>
      ) : null}

      {/* ===== BODY ===== */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Canvas */}
        <div ref={fitRef} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden p-3 lg:p-6">
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
                onEnded={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => {
                  const t = sourceUrl ? e.currentTarget.currentTime - clip.start_time : e.currentTarget.currentTime;
                  setTime(Math.max(0, t));
                }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-xs text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                Memuat video…
              </div>
            )}

            <LiveCaptionOverlay words={words} time={time} style={liveStyle} containerWidth={fit.w} showEmoji={emojiEnabled} />

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
                        top: "38%",
                        transform: active ? "translate(-50%, -50%)" : hidden,
                        opacity: active ? 1 : 0,
                      }}
                    >
                      <div style={{ width: fit.w * 0.24, height: fit.w * 0.24 }}>
                        <ColoredIcon category={p.category} icon={p.icon ?? null} />
                      </div>
                    </div>
                  );
                })
              : null}

            {/* watermark preview (proporsional) */}
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

          {/* timeline */}
          <div className="flex w-full max-w-xl items-center gap-3">
            <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">{clock(time)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.05}
              value={Math.min(time, duration)}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-[var(--color-accent)]"
              aria-label="Garis waktu klip"
            />
            <span className="w-10 text-[11px] tabular-nums text-muted-foreground">{clock(duration)}</span>
          </div>
        </div>

        {/* ===== PANEL TOOL ===== */}
        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-card md:h-auto md:w-[320px] md:border-l md:border-t-0">
          <div className="grid shrink-0 grid-cols-3 border-b border-border" role="tablist">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTool === t.id}
                onClick={() => setActiveTool(t.id)}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors ${
                  activeTool === t.id
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
              >
                <t.Icon className="size-4" />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <AnimatePresence mode="wait">
              {activeTool === "info" ? (
                <ToolPane key="info">
                  <FieldLabel>Deskripsi</FieldLabel>
                  <textarea
                    value={clip.description ?? ""}
                    onChange={(e) => setClip({ ...clip, description: e.target.value })}
                    onBlur={() => void supabase.from("clips").update({ description: clip.description }).eq("id", clip.id)}
                    rows={5}
                    className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-colors focus:border-accent"
                  />
                  <FieldLabel>Hashtag</FieldLabel>
                  <input
                    value={(clip.hashtags ?? []).join(" ")}
                    onChange={(e) => setClip({ ...clip, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
                    onBlur={() => void supabase.from("clips").update({ hashtags: clip.hashtags }).eq("id", clip.id)}
                    className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-colors focus:border-accent"
                  />
                </ToolPane>
              ) : activeTool === "subtitle" ? (
                <ToolPane key="subtitle">
                  <FieldLabel>Gaya subtitle</FieldLabel>
                  <SubtitleStylePicker value={presetId} onChange={setPresetId} />
                  <div className="mt-4 space-y-4">
                    <SliderRow label={`Ukuran · ${Math.round(fontScale * 100)}%`} min={0.6} max={1.8} step={0.05} value={fontScale} onChange={setFontScale} />
                    <SliderRow label={`Posisi · ${effPosition}%`} min={20} max={80} step={1} value={effPosition} onChange={(v) => setPosition(Math.round(v))} />
                    <SliderRow label={`Transparansi · ${Math.round(opacity * 100)}%`} min={0.1} max={1} step={0.05} value={opacity} onChange={setOpacity} />
                  </div>
                </ToolPane>
              ) : (
                <ToolPane key="broll">
                  <ToggleRow
                    label="Ikon & B-Roll"
                    desc="AI menyisipkan ikon animasi yang cocok di momen tepat."
                    enabled={brollEnabled}
                    onChange={(v) => void toggleBroll(v)}
                  />
                  {brollSearching ? (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-accent">
                      <Loader2 className="size-3.5 animate-spin" /> Mencari ikon dan b-roll yang cocok…
                    </div>
                  ) : null}
                  {brollEnabled && !brollSearching && livePlacements.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {livePlacements.map((p, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12px]">
                          <span className="min-w-0 truncate capitalize">{p.category}</span>
                          <button
                            type="button"
                            onClick={() => seek(Math.max(0, p.time_start - 1))}
                            className="shrink-0 font-mono text-accent"
                          >
                            {clock(p.time_start)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3">
                    <ToggleRow
                      label="Emoji pada subtitle"
                      desc="AI menaruh emoji di beberapa kata kunci."
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3"
    >
      {children}
    </motion.div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
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
        className="mt-1.5 w-full accent-[var(--color-accent)]"
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
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-accent" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
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
