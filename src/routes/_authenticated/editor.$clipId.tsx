import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Clock,
  Download,
  Hash,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Subtitles,
  Sticker,
  VolumeX,
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
      { name: "description", content: "Editor klip vertikal ala CapCut — subtitle, ikon & b-roll, emoji." },
    ],
  }),
  component: EditorPage,
});

// ---- toolbar modes ----
type ToolId = "info" | "subtitle" | "broll" | "watermark";

const TOOLS: { id: ToolId; label: string; Icon: typeof Hash }[] = [
  { id: "info", label: "Deskripsi & Hashtag", Icon: Hash },
  { id: "subtitle", label: "Subtitle", Icon: Subtitles },
  { id: "broll", label: "Ikon & B-Roll", Icon: Sticker },
  { id: "watermark", label: "Hapus Watermark", Icon: VolumeX },
];

function EditorPage() {
  const { clipId } = Route.useParams();
  const navigate = useNavigate();

  const [clip, setClip] = useState<Clip | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);

  // video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // ukuran canvas 9:16 hasil hitung fit (selalu terlihat di semua viewport)
  const [fit, setFit] = useState({ w: 216, h: 384 });

  // tool state
  const [activeTool, setActiveTool] = useState<ToolId>("subtitle");
  const [presetId, setPresetId] = useState(DEFAULT_SUBTITLE_PRESET);
  const [fontScale, setFontScale] = useState(1);
  const [position, setPosition] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(1);

  // b-roll & emoji toggles
  const [brollEnabled, setBrollEnabled] = useState(false);
  const [brollSearching, setBrollSearching] = useState(false);
  const [emojiEnabled, setEmojiEnabled] = useState(false);
  // hasil AI placement (momen ikon/b-roll) — tampil live di canvas
  const [livePlacements, setLivePlacements] = useState<
    { time_start: number; time_end: number; category: string; icon?: string | null; iconEmoji?: string; side: string; animation: string }[]
  >([]);

  // watermark ads
  const [adsWatched, setAdsWatched] = useState(0);
  const [watermarkRemoved, setWatermarkRemoved] = useState(false);
  const [adPlaying, setAdPlaying] = useState(false);

  // unduhan: lock tombol sampai render selesai + GUI info
  const [downloadLocked, setDownloadLocked] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<string | null>(null);

  // ---- MEMORI EDITOR: simpan/muat setting per-clip (persist antar kunjungan) ----
  const memKey = `cc_editor_mem_${clipId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(memKey);
      if (!raw) return;
      const m = JSON.parse(raw);
      if (m.presetId) setPresetId(m.presetId);
      if (typeof m.fontScale === "number") setFontScale(m.fontScale);
      if (typeof m.position === "number") setPosition(m.position);
      if (typeof m.opacity === "number") setOpacity(m.opacity);
      if (typeof m.brollEnabled === "boolean") {
        setBrollEnabled(m.brollEnabled);
        if (m.brollEnabled && Array.isArray(m.livePlacements)) setLivePlacements(m.livePlacements);
      }
      if (typeof m.emojiEnabled === "boolean") setEmojiEnabled(m.emojiEnabled);
    } catch { /* korup → abaikan */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  function saveEditorMemory() {
    try {
      localStorage.setItem(memKey, JSON.stringify({
        presetId, fontScale, position, opacity,
        brollEnabled, emojiEnabled, livePlacements,
        savedAt: Date.now(),
      }));
    } catch { /* storage penuh → abaikan */ }
  }

  // auto-save memori tiap setting berubah (debounce 800ms)
  useEffect(() => {
    const t = setTimeout(() => saveEditorMemory(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, fontScale, position, opacity, brollEnabled, emojiEnabled, livePlacements]);

  // load clip + project
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("clips")
        .select("*")
        .eq("id", clipId)
        .single();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Klip tidak ditemukan");
        navigate({ to: "/dashboard" });
        return;
      }
      setClip(data as Clip);
      if (data.project_id) {
        const { data: p } = await supabase
          .from("projects")
          .select("*")
          .eq("id", data.project_id)
          .single();
        if (!cancelled && p) setProject(p as Project);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clipId, navigate]);

  // ads status
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/ads/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setAdsWatched(d.ads_watched);
          setWatermarkRemoved(d.watermark_removed);
        }
      } catch { /* offline ok */ }
    })();
  }, []);

  // preview auto-render sekali
  const ensurePreview = useCallback(async () => {
    if (!clip || previewBusy || clip.preview_ready) return;
    setPreviewBusy(true);
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
    } catch { /* fallback silent */ }
    finally { setPreviewBusy(false); }
  }, [clip, previewBusy]);

  useEffect(() => {
    void ensurePreview();
  }, [ensurePreview]);

  const words = useMemo<LiveWord[]>(
    () =>
      ((clip?.caption_words as unknown as { word: string; start: number; end: number }[]) ?? [])
        .map((w) => ({ word: w.word, start: w.start, end: w.end })),
    [clip],
  );

  // measure container — hitung ukuran canvas 9:16 yang fit di area canvas
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (availW < 40 || availH < 40) return;
      // 9:16 → h = w × 16/9; fit BOTH dims + sisakan ruang timeline (~44px)
      const h = Math.min(availH - 44, (availW * 16) / 9);
      const w = (h * 9) / 16;
      setFit({ w: Math.round(w), h: Math.round(h) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // time sync via onTimeUpdate di <video> (React handler — anti stale element).
  // rAF loop lama dihapus: nge-refer elemen video lama hasil remount → time beku.

  const preset = getPreset(presetId);
  const effPosition = position ?? preset.style.position;
  const effFontSize = Math.round(preset.style.font_size * fontScale);

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
    wordBoxColor: preset.style.word_box_color ?? undefined,
    uppercase: preset.style.uppercase ?? false,
    opacity,
    position: effPosition,
    animation: "karaoke",
  };

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration - 0.05, t));
    setTime(v.currentTime);
  }

  const duration = clip ? clip.end_time - clip.start_time : 0;

  async function handleDownload() {
    if (!clip || submitting || downloadLocked) return;
    setSubmitting(true);
    try {
      // cek antrean dulu: kalau ada render lain jalan → pesan nomor antrean
      let queueNote = "";
      let queueN = 0;
      try {
        const tokenQ = await getAccessToken();
        const res = await fetch("/api/render-jobs/queue-position/x", {
          headers: { Authorization: `Bearer ${tokenQ}` },
        });
        if (res.ok) {
          const d = await res.json();
          queueN = d.total_active;
          if (d.total_active > 0) queueNote = ` Anda ada di nomor antrean ke ${d.total_active + 1}.`;
        }
      } catch { /* abaikan */ }
      await startRenderJob({
        projectId: clip.project_id,
        clipId: clip.id,
        clipTitle: clip.title,
        captionStyle: {
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
        },
      });
      // kunci tombol sampai render job ini selesai (poll /api/render-jobs)
      setDownloadLocked(true);
      pollRenderDone();
      setDownloadInfo(queueNote);
      // simpan memori setting saat unduh
      void saveEditorMemory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memulai render");
    } finally {
      setSubmitting(false);
    }
  }

  // poll job render terakhir klip ini → unlock tombol saat selesai
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
      } catch { /* keep polling */ }
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
    } catch { toast.error("Gagal mencatat iklan"); }
  }

  if (loading || !clip) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      {/* ===== TOP BAR ===== */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost" size="sm"
            className="text-neutral-300 hover:bg-white/10 hover:text-white"
            onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: clip.project_id } })}
          >
            <ArrowLeft className="size-4" /> Kembali
          </Button>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold">{clip.title}</p>
            <p className="text-[11px] text-neutral-500">{project?.title ?? "Project"}</p>
          </div>
        </div>
        <Button variant="accent" size="sm" onClick={handleDownload} disabled={submitting || downloadLocked} className="gap-2">
          {submitting ? <Loader2 className="size-4 animate-spin" /> : downloadLocked ? <Clock className="size-4" /> : <Download className="size-4" />}
          {downloadLocked ? "Merender…" : "Unduh"}
        </Button>
      </header>

      {/* ===== BODY: canvas + track area (mobile: bawah kecil; desktop: panel kanan) ===== */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Canvas area — fitRef mengukur ruang; canvas 9:16 fit sempurna di semua viewport */}
        <div ref={fitRef} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden p-3 lg:p-6">
          <div
            className="relative shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
            style={{ width: fit.w, height: fit.h }}
          >
            {clip.preview_url ? (
              <video
                ref={videoRef}
                src={clip.preview_url}
                playsInline
                preload="auto"
                className="absolute inset-0 size-full object-cover"
                onClick={togglePlay}
                onEnded={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => {
                  const t = e.currentTarget.currentTime;
                  if (Math.abs(t - lastTimeRef.current) > 0.09) {
                    lastTimeRef.current = t;
                    setTime(t);
                  }
                }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-500">
                {previewBusy ? (
                  <>
                    <Loader2 className="size-8 animate-spin" />
                    <p className="text-xs">Menyiapkan preview…</p>
                  </>
                ) : (
                  <p className="text-xs">Preview belum tersedia</p>
                )}
              </div>
            )}

            {/* LIVE subtitle overlay (+ emoji pada kata kunci) */}
            <LiveCaptionOverlay words={words} time={time} style={liveStyle} containerWidth={fit.w} showEmoji={emojiEnabled} />

            {/* IKON & B-ROLL overlay live — SVG berwarna, 10 animasi CSS */}
            {brollEnabled && livePlacements.length > 0
              ? livePlacements.map((p, idx) => {
                  const active = time >= p.time_start && time <= p.time_end;
                  const dist = fit.w * 0.7;
                  let hidden = `translate(-50%, -50%) `;
                  switch (p.animation) {
                    case "slide-right": hidden += `translateX(${-dist}px)`; break;
                    case "slide-up": hidden += `translateY(${dist}px)`; break;
                    case "slide-down": hidden += `translateY(${-dist}px)`; break;
                    case "zoom-in": hidden += `scale(0) rotate(-90deg)`; break;
                    case "pop-bounce": hidden += `scale(0)`; break;
                    case "flip-in": hidden += `perspective(600px) rotateY(90deg)`; break;
                    case "drop-in": hidden += `translateY(${-fit.h * 0.5}px) rotate(-20deg)`; break;
                    case "swing-in": hidden += `translateX(${dist}px) rotate(25deg)`; break;
                    case "rotate-in": hidden += `scale(0) rotate(270deg)`; break;
                    default: hidden += `translateX(${dist}px)`; // slide-left
                  }
                  return (
                    <div
                      key={`${p.time_start}-${idx}`}
                      className="pointer-events-none absolute flex items-center justify-center transition-[transform,opacity] duration-500 ease-out"
                      style={{
                        left: p.side === "left" ? "20%" : "80%",
                        top: "38%",
                        transform: active ? "translate(-50%, -50%)" : hidden,
                        opacity: active ? 1 : 0,
                      }}
                    >
                      <div style={{ width: fit.w * 0.24, height: fit.w * 0.24 }}>
                        <ColoredIcon category={p.category} icon={p.icon ?? undefined} />
                      </div>
                    </div>
                  );
                })
              : null}

            {/* watermark preview (visualisasi) — skala PROPORTIONAL ke canvas (32% lebar) */}
            {!watermarkRemoved ? (
              <div
                className="pointer-events-none absolute left-[6%] top-[5%] flex items-center opacity-65"
                style={{ gap: Math.max(2, fit.w * 0.012) }}
              >
                <img
                  src="/watermark-logo.png"
                  alt=""
                  className="shrink-0 object-contain"
                  style={{ width: fit.w * 0.095, height: fit.w * 0.095 }}
                />
                <div className="min-w-0 leading-tight">
                  <p className="font-bold text-white" style={{ fontSize: Math.max(7, fit.w * 0.036) }}>CortexClipAI</p>
                  <p className="text-white/90" style={{ fontSize: Math.max(4, fit.w * 0.017) }}>AI that can help many people, made in Indonesia</p>
                </div>
              </div>
            ) : null}

            {/* play/pause center */}
            <button
              type="button"
              onClick={togglePlay}
              className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 backdrop-blur transition-opacity hover:bg-black/60"
              aria-label={playing ? "Jeda" : "Putar"}
            >
              {playing ? <Pause className="size-6 text-white" /> : <Play className="size-6 translate-x-0.5 text-white" />}
            </button>
          </div>

          {/* timeline strip */}
          <div className="mt-3 flex w-full max-w-xl items-center gap-3">
            <span className="w-10 text-right text-[11px] tabular-nums text-neutral-500">{clock(time)}</span>
            <input
              type="range" min={0} max={Math.max(0.1, duration)} step={0.05}
              value={Math.min(time, duration)}
              onChange={(e) => seek(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-amber-500"
            />
            <span className="w-10 text-[11px] tabular-nums text-neutral-500">{clock(duration)}</span>
          </div>
        </div>

        {/* ===== TRACK AREA — kecil, scroll DI DALAM (mobile: bawah; desktop: kanan) ===== */}
        <aside className="h-[190px] w-full shrink-0 border-t border-white/10 bg-neutral-900/95 md:h-auto md:w-[300px] md:border-l md:border-t-0 md:bg-neutral-900/60">
          <div className="h-full overflow-y-auto overscroll-contain p-3">
            <AnimatePresence mode="wait">
              {activeTool === "info" ? (
                <motion.div key="info" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
                  <PanelTitle>Deskripsi & Hashtag</PanelTitle>
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Deskripsi</label>
                    <textarea
                      value={clip.description ?? ""}
                      onChange={(e) => setClip({ ...clip, description: e.target.value })}
                      onBlur={() => void supabase.from("clips").update({ description: clip.description }).eq("id", clip.id)}
                      rows={5}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-neutral-900 p-3 text-sm outline-none focus:border-amber-500/60"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Hashtag</label>
                    <input
                      value={(clip.hashtags ?? []).join(" ")}
                      onChange={(e) => setClip({ ...clip, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
                      onBlur={() => void supabase.from("clips").update({ hashtags: clip.hashtags }).eq("id", clip.id)}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-neutral-900 p-3 text-sm outline-none focus:border-amber-500/60"
                    />
                  </div>
                </motion.div>
              ) : activeTool === "subtitle" ? (
                <motion.div key="subtitle" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">
                  <PanelTitle>Subtitle</PanelTitle>
                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Gaya Subtitle</p>
                    <SubtitleStylePicker value={presetId} onChange={setPresetId} />
                  </div>
                  <SliderRow label={`Ukuran · ${Math.round(fontScale * 100)}%`} min={0.6} max={1.8} step={0.05} value={fontScale} onChange={setFontScale} />
                  <SliderRow label={`Posisi · ${effPosition}%`} min={20} max={80} step={1} value={effPosition} onChange={(v) => setPosition(v)} />
                  <SliderRow label={`Transparansi · ${Math.round(opacity * 100)}%`} min={0.1} max={1} step={0.05} value={opacity} onChange={setOpacity} />
                </motion.div>
              ) : activeTool === "broll" ? (
                <motion.div key="broll" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-5">
                  <PanelTitle>Ikon & B-Roll</PanelTitle>
                  <ToggleRow
                    label="Ikon & B-Roll"
                    desc="AI menyisipkan ikon animasi & b-roll yang cocok di momen tepat."
                    enabled={brollEnabled}
                    onChange={async (v) => {
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
                          }
                        } catch { /* offline: coba lagi nanti */ }
                        finally { setTimeout(() => setBrollSearching(false), 600); }
                      } else {
                        setLivePlacements([]);
                      }
                    }}
                  />
                  {brollSearching ? (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
                      <Loader2 className="size-3.5 animate-spin" />
                      Mencari ikon dan b-roll yang cocok…
                    </div>
                  ) : null}
                  <ToggleRow
                    label="Emoji pada Subtitle"
                    desc="AI menaruh emoji di beberapa kata kunci (bukan semua kalimat)."
                    enabled={emojiEnabled}
                    onChange={setEmojiEnabled}
                  />
                </motion.div>
              ) : (
                <motion.div key="watermark" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}>
                  <PanelTitle>Hapus Watermark</PanelTitle>
                  {watermarkRemoved ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-300">
                      ✅ Watermark sudah dihapus. Semua render berikutnya bebas watermark.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-neutral-300">
                        Anda memerlukan menonton <b>4 iklan</b> untuk menghapus watermark.
                      </p>
                      <div className="flex gap-1.5">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < adsWatched ? "bg-amber-500" : "bg-white/10"}`} />
                        ))}
                      </div>
                      <p className="text-xs text-neutral-500">{adsWatched}/4 iklan ditonton</p>
                      <Button variant="accent" size="sm" className="w-full" onClick={() => setAdPlaying(true)} disabled={adPlaying}>
                        <Play className="size-4" /> Tonton Iklan ({4 - adsWatched} lagi)
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>

      {/* ===== BOTTOM TOOLBAR (quickmenu) ===== */}
      <nav className="flex h-16 shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-neutral-900/80 px-4 backdrop-blur">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTool(t.id)}
            className={`flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-medium transition-colors ${
              activeTool === t.id
                ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/40"
                : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            }`}
          >
            <t.Icon className="size-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ===== GUI KONFIRMASI UNDUH ===== */}
      <AnimatePresence>
        {downloadInfo !== null ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6 text-center"
            >
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Download className="size-6" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">Video yang ingin anda unduh akan tersedia di halaman <button type="button" onClick={() => { setDownloadInfo(null); navigate({ to: "/unduh" }); }} className="text-amber-600 underline decoration-amber-600/50 underline-offset-2 hover:text-amber-500">/unduh</button></h3>
              <p className="mt-2 text-sm text-neutral-400">
                {downloadInfo
                  ? `Sedang mengantri untuk merender video.${downloadInfo}`
                  : "Merender video agar siap di unduh — proses berjalan di cloud meski kamu keluar dari halaman ini."}
              </p>
              <Button variant="accent" size="sm" className="mt-5 w-full" onClick={() => setDownloadInfo(null)}>
                Mengerti
              </Button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ===== AD POPUP (placeholder Google Ads — user urus nanti) ===== */}
      <AnimatePresence>
        {adPlaying ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Iklan {adsWatched + 1}/4</p>
                <button type="button" onClick={() => setAdPlaying(false)} className="text-neutral-500 hover:text-neutral-300">
                  <X className="size-4" />
                </button>
              </div>
              {/* Slot Google Ads — diisi user nanti */}
              <div className="mt-4 flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/15 bg-neutral-800/50 text-xs text-neutral-500">
                Slot Google Ads (pop-up video)
              </div>
              <Button variant="accent" size="sm" className="mt-4 w-full" onClick={handleAdWatched}>
                <Sparkles className="size-4" /> Selesai ditonton
              </Button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
      <span className="h-4 w-1 rounded-full bg-amber-500" />
      {children}
    </h2>
  );
}

function SliderRow({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[11px] text-neutral-500">{label}</label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1.5 w-full accent-amber-500"
      />
    </div>
  );
}

function ToggleRow({ label, desc, enabled, onChange }: {
  label: string; desc: string; enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-neutral-900 p-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-amber-500" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function clock(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
