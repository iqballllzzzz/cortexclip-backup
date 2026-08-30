import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  Sparkles,
  Upload,
  Wand2,
  Eye,
  Type,
  Flame,
  Clock,
  Film,
  Link2,
  ChevronDown,
  Clapperboard,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CaptionPreview, defaultCaptionStyle, type CaptionStyle } from "@/components/caption-preview";
import { extractAudio } from "@/lib/audio-extract";
import { ClipVideoPreview } from "@/components/clip-video-preview";
import { VideoWithLiveCaption, type LiveCaptionStyle } from "@/components/live-caption-overlay";
import { transcribeChunkFn, detectClipsFn } from "@/lib/pipeline.functions";
import { buildAss, buildFfmpegCommand, buildSrt, download, toCaptionWords } from "@/lib/srt";
import { getPreset, SubtitleStylePicker, DEFAULT_SUBTITLE_PRESET } from "@/components/subtitle-styles";
import type { Transcript, TranscriptSegment } from "@/lib/pipeline-types";
import type { Database } from "@/integrations/supabase/types";
import { Label } from "@/components/ui/label";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ClipBase = Database["public"]["Tables"]["clips"]["Row"];
type Clip = ClipBase & {
  preview_url?: string | null;
  preview_ready?: boolean;
};

const title = "Proyek Klip — CortexClip";
const description =
  "Pantau proses transkripsi, deteksi klip viral AI, dan ekspor klip siap unggah dari satu video panjang.";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectPage,
});

const STATUS_META: Record<string, { label: string; dot: string }> = {
  pending: { label: "Menunggu", dot: "bg-muted-foreground" },
  uploading: { label: "Mengunggah", dot: "bg-blue-500" },
  transcribing: { label: "Transkripsi", dot: "bg-amber-500" },
  analyzing: { label: "Analisis AI", dot: "bg-purple-500" },
  completed: { label: "Selesai", dot: "bg-green-500" },
  failed: { label: "Gagal", dot: "bg-red-500" },
};

function ProjectPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  // job render selesai yang BELUM dilihat user (banner /unduh)
  const [renderDoneCount, setRenderDoneCount] = useState(0);
  const seenJobsRef = useRef<Set<string>>(new Set());

  // Deteksi render selesai — poll job render project ini (user boleh balik
  // kapan saja setelah keluar/pindah tab)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { listProjectRenderJobs } = await import("@/lib/backend-api");
        const jobs = await listProjectRenderJobs(projectId);
        if (cancelled) return;
        const fresh = jobs.filter(
          (j) => j.status === "completed" && !seenJobsRef.current.has(j.id),
        );
        // job yang selesai SETELAH user terakhir lihat halaman → banner
        if (seenJobsRef.current.size > 0 || jobs.some((j) => j.status === "completed")) {
          setRenderDoneCount(fresh.length);
          for (const j of jobs) seenJobsRef.current.add(j.id);
        }
      } catch {
        // abaikan — backend mungkin belum siap
      }
    };
    void check();
    const iv = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [projectId]);

  useEffect(() => {
    if (localFile) {
      const url = URL.createObjectURL(localFile);
      setMediaUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    let cancelled = false;
    const path = project?.storage_path;
    if (!path) {
      setMediaUrl(null);
      return;
    }
    void supabase.storage
      .from("video-uploads")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setMediaUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [localFile, project?.storage_path]);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase
        .from("clips")
        .select("*")
        .eq("project_id", projectId)
        .order("virality_score", { ascending: false }),
    ]);
    setProject(p.data);
    setClips(c.data ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function getMediaBlob(): Promise<Blob> {
    if (localFile) return localFile;
    if (project?.storage_path) {
      const { data, error } = await supabase.storage
        .from("video-uploads")
        .download(project.storage_path);
      if (error || !data) throw new Error("Gagal mengambil file video dari penyimpanan.");
      return data;
    }
    throw new Error("Pilih file video/audio dulu untuk diproses.");
  }

  async function runPipeline() {
    setRunning(true);
    try {
      setProgress("Menyiapkan audio…");
      const blob = await getMediaBlob();
      await supabase.from("projects").update({ status: "transcribing" }).eq("id", projectId);

      const audio = await extractAudio(blob, 45, (r: number) =>
        setProgress(`Mengekstrak audio… ${Math.round(r * 100)}%`),
      );
      const duration = audio.duration;

      const segments: TranscriptSegment[] = [];
      for (let i = 0; i < audio.count; i += 1) {
        setProgress(
          `Transkripsi bagian ${i + 1}/${audio.count} (${Math.round(((i + 1) / audio.count) * 100)}%)…`,
        );
        const chunk = audio.getChunk(i);
        const res = await transcribeChunkFn({
          data: {
            audioBase64: chunk.base64,
            offset: chunk.offset,
            duration: chunk.duration,
          },
        });
        segments.push(...res.segments);
      }

      if (segments.length === 0) throw new Error("Tidak ada ucapan terdeteksi di media ini.");

      const transcript: Transcript = { language: "auto", duration, segments };
      await supabase
        .from("projects")
        .update({
          transcript: transcript as never,
          duration_seconds: Math.round(duration),
          status: "analyzing",
        })
        .eq("id", projectId);

      setProgress("AI mencari momen paling viral…");
      const { count } = await detectClipsFn({ data: { projectId, targetCount: 10 } });

      await supabase.from("projects").update({ status: "completed" }).eq("id", projectId);
      toast.success(`${count} klip terdeteksi!`);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proses gagal.";
      await supabase
        .from("projects")
        .update({ status: "failed", error_message: message })
        .eq("id", projectId);
      toast.error(message);
      await load();
    } finally {
      setProgress("");
      setRunning(false);
    }
  }

  async function saveClip(clip: Clip, patch: Partial<Clip>) {
    setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("clips").update(patch as never).eq("id", clip.id);
    if (error) toast.error("Gagal menyimpan perubahan.");
  }

  function exportClip(clip: Clip, kind: "srt" | "ass" | "ffmpeg") {
    const words = (clip.caption_words as unknown as { word: string; start: number; end: number }[]) ?? [];
    const slug = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "clip";

    if (kind === "srt") {
      download(`${slug}.srt`, clip.srt_content ?? buildSrt(words));
      return;
    }
    if (kind === "ass") {
      const p = getPreset(DEFAULT_SUBTITLE_PRESET);
      download(
        `${slug}.ass`,
        buildAss(words, {
          accent: p.style.highlight_color,
          base: p.style.font_color,
          fontSize: p.style.font_size,
          wordsPerLine: 3,
          position: p.style.position,
          stroke: !p.style.word_box,
        }),
      );
      return;
    }
    const command = buildFfmpegCommand({
      input: "source.mp4",
      output: `${slug}.mp4`,
      start: clip.start_time,
      end: clip.end_time,
      subtitleFile: `${slug}.ass`,
      resolution: "1080x1920",
      faceTracking: true, // auto-framing wajah SELALU aktif
    });
    void navigator.clipboard.writeText(command);
    toast.success("Perintah FFmpeg disalin ke clipboard.");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-28">
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-5 py-28 text-center">
          <p className="text-lg font-semibold">Proyek tidak ditemukan.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/dashboard" })}>
            Kembali ke dashboard
          </Button>
        </div>
      </div>
    );
  }

  const avgScore = clips.length
    ? Math.round(clips.reduce((s, c) => s + (c.virality_score ?? 0), 0) / clips.length)
    : 0;
  const status = STATUS_META[project.status] ?? { label: "Menunggu", dot: "bg-muted-foreground" };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground antialiased">
      {/* ===== Floating glass nav ===== */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl border border-white/8 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-xl sm:mt-4 sm:px-4 sm:py-3 dark:bg-neutral-950/70">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
            <img src="/favicon.png" alt="Logo CortexClip" className="size-7 shrink-0 object-contain sm:size-8" />
            <span className="truncate font-display text-[14px] font-bold tracking-tight sm:text-[15px]">CortexClip</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-card px-2.5 py-1 text-xs text-muted-foreground">
              <span className={`size-1.5 rounded-full ${status.dot} ${project.status === "transcribing" || project.status === "analyzing" ? "animate-pulse" : ""}`} />
              {status.label}
            </span>
            <Link
              to="/dashboard"
              className="flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              title="Kembali ke dashboard"
            >
              <ArrowLeft className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-5 sm:pt-28">
        {/* ===== Header proyek ===== */}
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            {project.source_type === "youtube" ? <Link2 className="size-3" /> : <Upload className="size-3" />}
            {project.source_type === "youtube" ? "Sumber YouTube" : "Unggahan"}
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">{project.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {project.duration_seconds ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-card px-2.5 py-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> {formatClock(project.duration_seconds)}
                  </span>
                ) : null}
                {clips.length > 0 ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-card px-2.5 py-1 text-xs text-muted-foreground">
                      <Clapperboard className="size-3" /> {clips.length} klip
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                      <Flame className="size-3" /> Rerata skor {avgScore}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            <Button variant="accent" onClick={runPipeline} disabled={running} className="group">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4 transition-transform group-hover:rotate-12" />}
              {clips.length > 0 ? "Proses Ulang" : "Mulai Proses AI"}
            </Button>
          </div>
        </motion.header>

        {running ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm"
          >
            <Loader2 className="size-4 animate-spin text-accent" />
            <span>{progress || "Memproses…"}</span>
          </motion.div>
        ) : null}

        {/* Banner: render selesai (dideteksi saat user balik ke halaman project) */}
        {renderDoneCount > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm"
          >
            <CheckCircle2 className="size-4 text-accent" />
            <span>
              {renderDoneCount > 1 ? `${renderDoneCount} klip berhasil` : "Project berhasil"} dirender — masuk ke dalam halaman{" "}
              <Link to="/unduh" className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:text-accent/80">
                /unduh
              </Link>{" "}
              untuk mengunduh video yang pernah kamu render.
            </span>
          </motion.div>
        ) : null}

        {project.status === "failed" && project.error_message ? (
          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-500">
            {project.error_message}
          </div>
        ) : null}

        {/* Config grid: media + render settings */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Media source */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Film className="size-3.5" />
              </span>
              File media
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {project.storage_path
                ? "Pilih ulang file dari perangkat agar preview & ekspor berjalan tanpa mengunduh ulang video dari server."
                : "Untuk sumber YouTube, unduh videonya lalu pilih filenya di sini. Audio diekstrak langsung di browser kamu — tidak ada file besar yang dikirim ke server."}
            </p>
            <div className="mt-3 flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-background/40 px-4 py-6 transition-colors hover:border-accent/50">
              <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                <Upload className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5" />
                <span className="text-xs text-muted-foreground">
                  {localFile ? localFile.name : "Klik untuk memilih file"}
                </span>
                {localFile ? (
                  <span className="text-[11px] text-accent">
                    {(localFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                ) : null}
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>
          </section>
        </div>

        {/* Clips */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Klip terdeteksi ({clips.length})
            </h2>
            {clips.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flame className="size-3.5 text-accent" /> diurutkan dari skor tertinggi
              </span>
            ) : null}
          </div>

          {clips.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-border bg-card py-16 text-center">
              <Sparkles className="size-10 text-muted-foreground/50" />
              <p className="mt-4 font-medium">Belum ada klip</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Klik "Mulai Proses AI" — CortexClip akan mentranskrip audio, mencari momen paling
                kuat, lalu menulis judul, deskripsi, hashtag, dan skor viralitas untuk tiap klip.
              </p>
              <Button variant="accent" size="sm" className="mt-5" onClick={runPipeline} disabled={running}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                Mulai Proses AI
              </Button>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {clips.map((clip, i) => (
                <motion.div
                  key={clip.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.04 * i }}
                >
                  <ClipCard
                    clip={clip}
                    mediaUrl={mediaUrl}
                    expanded={activeClip === clip.id}
                    onToggle={() => setActiveClip(activeClip === clip.id ? null : clip.id)}
                    onSave={saveClip}
                    onExport={exportClip}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function ClipCard({
  clip,
  mediaUrl,
  expanded,
  onToggle,
  onSave,
  onExport,
}: {
  clip: Clip;
  mediaUrl: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSave: (clip: Clip, patch: Partial<Clip>) => void;
  onExport: (clip: Clip, kind: "srt" | "ass" | "ffmpeg") => void;
}) {
  const words = (clip.caption_words as unknown as { word: string; start: number; end: number }[]) ?? [];
  const duration = clip.end_time - clip.start_time;
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ---- Editor subtitle PER-KLIP ----
  const [presetId, setPresetId] = useState(DEFAULT_SUBTITLE_PRESET);
  // fontScale 0.5..2 (multiplier dari fontSize preset) & posisi 20..80 %dari atas
  const [fontScale, setFontScale] = useState(1);
  const [position, setPosition] = useState<number | null>(null); // null = default preset
  const [opacity, setOpacity] = useState(1); // 1 = 100% (default), turun = transparan
  const preset = getPreset(presetId);
  const effPosition = position ?? preset.style.position;
  const effFontSize = Math.round(preset.style.font_size * fontScale);

  // words utk live overlay (timing word-level JSON dari transkripsi)
  const liveWords = words.map((w) => ({ word: w.word, start: w.start, end: w.end }));

  // style live overlay — LANGSUNG berubah tiap setting diubah (tanpa render VPS)
  const liveStyle: LiveCaptionStyle = {
    fontFamily: preset.cssFontFamily,
    fontSize: effFontSize * 0.42, // skala ke preview kecil (basis 360px)
    fontColor: preset.style.font_color,
    highlightColor: preset.style.highlight_color,
    emphasisColor: preset.style.highlight_color,
    strokeColor: "#000000",
    strokeWidth: preset.style.word_box ? 0 : 3,
    shadow: true,
    wordBox: preset.style.word_box ?? false,
    wordBoxColor: preset.style.word_box_color,
    uppercase: preset.style.uppercase ?? false,
    opacity: opacity,
    position: effPosition,
    animation: "karaoke",
  };

  /** caption_style yang dikirim ke backend (key template Supoclip — preview & render final SAMA). */
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
      emoji: preset.style.emoji ?? true,
      uppercase: preset.style.uppercase ?? false,
      opacity: opacity,
    };
  }

  // Preview VPS instan: render pipeline ASLI (ASS burn + face tracking) 360x640.
  async function ensurePreview(force = false) {
    if (previewBusy) return;
    if (!force && clip.preview_ready) return;
    setPreviewBusy(true);
    try {
      const { renderClipPreview } = await import("@/lib/backend-api");
      const result = await renderClipPreview({
        projectId: clip.project_id,
        clipId: clip.id,
        captionStyle: buildCaptionStyle(),
      });
      onSave(clip, { preview_url: result.url, preview_ready: true });
    } catch (error) {
      console.warn("Preview gagal dibuat:", error);
    } finally {
      setPreviewBusy(false);
    }
  }

  // Saat kartu dibuka & preview belum ada → render sekali (video murni).
  // Preview TIDAK lagi re-render saat setting berubah — subtitle live overlay
  // HTML5 menampilkan perubahan gaya/ukuran/posisi/opacity SEKETIKA.
  useEffect(() => {
    if (expanded && mediaUrl && !clip.preview_ready && !previewBusy) {
      void ensurePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, mediaUrl]);

  async function renderServerMp4() {
    if (rendering) return;
    setRendering(true);
    setRenderProgress(0.2);
    try {
      // BACKGROUND JOB — user boleh keluar/pindah tab, hasil via halaman /unduh
      const { startRenderJob } = await import("@/lib/backend-api");
      await startRenderJob({
        projectId: clip.project_id,
        clipId: clip.id,
        clipTitle: clip.title,
        captionStyle: buildCaptionStyle(),
      });
      setRenderProgress(1);
      toast.success("Render dimulai! Kamu boleh keluar dari halaman ini — klip akan muncul di halaman Unduhan saat selesai.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memulai render.");
    } finally {
      setRendering(false);
      setRenderProgress(0);
    }
  }

  return (
    <div className={`group rounded-2xl border bg-card p-5 transition-colors ${expanded ? "border-accent/40" : "border-white/8 hover:border-accent/30"}`}>
      <div className="flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={onToggle}
          className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border transition-colors ${clip.virality_score >= 85 ? "border-accent/40 bg-accent/12" : "border-white/10 bg-foreground/4"}`}
        >
          <span className="font-display text-xl font-bold text-accent">{clip.virality_score}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">viral</span>
          {clip.virality_score >= 85 ? (
            <Flame className="absolute -right-1.5 -top-1.5 size-4 rounded-full bg-background p-0.5 text-accent" />
          ) : null}
        </button>
        <div className="min-w-0 flex-1">
          <input
            value={clip.title}
            onChange={(e) => onSave(clip, { title: e.target.value })}
            className="w-full bg-transparent text-base font-semibold outline-none transition-colors focus:underline decoration-accent/50"
          />
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{formatClock(clip.start_time)} – {formatClock(clip.end_time)}</span>
            <span>·</span>
            <span>{duration.toFixed(0)} detik</span>
            {clip.hook_type ? (
              <Badge variant="secondary" className="ml-1 text-[10px]">{clip.hook_type}</Badge>
            ) : null}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="group"
        >
          <Link to="/editor/$clipId" params={{ clipId: clip.id }}>
            <Play className="size-4" /> Buka editor
            <ChevronDown className="ml-0.5 size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>

      {expanded ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3 }}
          className="mt-5 space-y-5"
        >
          {/* ===== 1. PREVIEW (paling atas) — video + LIVE subtitle overlay ===== */}
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <div className="mx-auto w-[200px]">
              {mediaUrl || clip.preview_url ? (
                <VideoWithLiveCaption
                  videoSrc={clip.preview_url ?? mediaUrl}
                  words={liveWords}
                  start={clip.start_time}
                  end={clip.end_time}
                  style={liveStyle}
                />
              ) : words.length > 0 ? (
                <CaptionPreview
                  clip={{
                    id: clip.id,
                    title: clip.title,
                    description: clip.description ?? "",
                    hashtags: clip.hashtags ?? [],
                    score: clip.virality_score,
                    range: `${formatClock(clip.start_time)} - ${formatClock(clip.end_time)}`,
                    duration: Math.max(...words.map((w) => w.end), 1),
                    hook: clip.hook_type ?? "",
                    captions: toCaptionWords(words),
                    overlays: [],
                  }}
                  style={{
                    ...defaultCaptionStyle,
                    preset: presetId,
                    accent: preset.style.highlight_color,
                    base: preset.style.font_color,
                    uppercase: preset.style.uppercase,
                  }}
                />
              ) : (
                <p className="text-xs text-muted-foreground">Belum ada caption.</p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Deskripsi
                </label>
                <textarea
                  value={clip.description ?? ""}
                  onChange={(e) => onSave(clip, { description: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-colors focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Hashtag
                </label>
                <input
                  value={(clip.hashtags ?? []).join(" ")}
                  onChange={(e) =>
                    onSave(clip, { hashtags: e.target.value.split(/\s+/).filter(Boolean) })
                  }
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-colors focus:border-accent"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="accent"
                  size="sm"
                  onClick={renderServerMp4}
                  disabled={rendering}
                  className="min-w-[160px]"
                >
                  {rendering ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  {rendering ? `Merender… ${Math.round(renderProgress * 100)}%` : "Unduh"}
                </Button>
                {rendering ? (
                  <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                    Batalkan
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* ===== 2. SUBTITLE EDITOR (di bawah preview) ===== */}
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Subtitle
              </span>
              {previewBusy ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-accent">
                  <Loader2 className="size-3 animate-spin" /> memperbarui preview…
                </span>
              ) : null}
            </div>
            <div className="mt-3">
              <SubtitleStylePicker value={presetId} onChange={setPresetId} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-[11px] text-muted-foreground">
                  Ukuran · {Math.round(fontScale * 100)}%
                </label>
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.05}
                  value={fontScale}
                  onChange={(e) => setFontScale(parseFloat(e.target.value))}
                  className="mt-1.5 w-full accent-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  Posisi {effPosition <= 50 ? "atas" : "bawah"} · {effPosition}%
                </label>
                <input
                  type="range"
                  min={20}
                  max={80}
                  step={1}
                  value={effPosition}
                  onChange={(e) => setPosition(parseInt(e.target.value))}
                  className="mt-1.5 w-full accent-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  Transparansi · {Math.round(opacity * 100)}%
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="mt-1.5 w-full accent-[var(--color-accent)]"
                />
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
