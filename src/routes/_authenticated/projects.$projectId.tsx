import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Play,
  Sparkles,
  Terminal,
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
import { exportClipWebm, isWebmExportSupported } from "@/lib/webm-export";
import { transcribeChunkFn, detectClipsFn } from "@/lib/pipeline.functions";
import { buildAss, buildFfmpegCommand, buildSrt, download, toCaptionWords } from "@/lib/srt";
import type { Transcript, TranscriptSegment } from "@/lib/pipeline-types";
import type { Database } from "@/integrations/supabase/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Clip = Database["public"]["Tables"]["clips"]["Row"];

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

const RESOLUTIONS = ["1080x1920", "720x1280", "1080x1080"] as const;

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
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("1080x1920");
  const [faceTracking, setFaceTracking] = useState(true);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(defaultCaptionStyle);

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
      download(
        `${slug}.ass`,
        buildAss(words, {
          accent: captionStyle.accent,
          base: captionStyle.base,
          fontSize: captionStyle.fontSize,
          wordsPerLine: captionStyle.wordsPerLine,
          position: captionStyle.position,
          stroke: captionStyle.stroke,
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
      resolution,
      faceTracking,
    });
    void navigator.clipboard.writeText(command);
    toast.success("Perintah FFmpeg disalin ke clipboard.");
  }

  function exportAll() {
    const script = clips
      .map((clip) => {
        const slug = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "clip";
        return `# ${clip.title} (skor ${clip.virality_score})\n${buildFfmpegCommand({
          input: "source.mp4",
          output: `${slug}.mp4`,
          start: clip.start_time,
          end: clip.end_time,
          subtitleFile: `${slug}.ass`,
          resolution,
          faceTracking,
        })}`;
      })
      .join("\n\n");
    download("cortexclip-render.sh", `#!/usr/bin/env bash\nset -e\n\n${script}\n`, "text/x-sh");
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
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-28">

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Dashboard
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex flex-wrap items-end justify-between gap-4"
        >
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              {project.source_type === "youtube" ? <Link2 className="size-3.5" /> : <Upload className="size-3.5" />}
              {project.source_type === "youtube" ? "Sumber YouTube" : "Unggahan"}
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{project.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                <span className={`size-1.5 rounded-full ${status.dot} ${project.status === "transcribing" || project.status === "analyzing" ? "animate-pulse" : ""}`} />
                {status.label}
              </span>
              {project.duration_seconds ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {formatClock(project.duration_seconds)}
                </span>
              ) : null}
              {clips.length > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                    <Clapperboard className="size-3" /> {clips.length} klip
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    <Flame className="size-3" /> Rerata skor {avgScore}
                  </span>
                </>
              ) : null}
            </div>
            {project.source_url ? (
              <a
                href={project.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block max-w-full truncate text-sm text-muted-foreground underline transition-colors hover:text-accent"
              >
                {project.source_url}
              </a>
            ) : null}
          </div>
          <Button variant="accent" onClick={runPipeline} disabled={running} className="group">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4 transition-transform group-hover:rotate-12" />}
            {clips.length > 0 ? "Proses Ulang" : "Mulai Proses AI"}
          </Button>
        </motion.header>

        {running ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm shadow-sm"
          >
            <Loader2 className="size-4 animate-spin text-accent" />
            <span>{progress || "Memproses…"}</span>
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

          {/* Render settings */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <Terminal className="size-3.5" />
              </span>
              Pengaturan ekspor
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <Label className="text-xs">Resolusi</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RESOLUTIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setResolution(r)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                        resolution === r
                          ? "border-accent bg-accent/15 text-accent shadow-sm"
                          : "border-border text-muted-foreground hover:border-accent/40 hover:text-foreground"
                      }`}
                    >
                      {r === "1080x1920" ? "9:16 · 1080p" : r === "720x1280" ? "9:16 · 720p" : "1:1 · 1080p"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={faceTracking}
                  onCheckedChange={setFaceTracking}
                />
                <Eye className="size-3.5 text-accent" /> Auto-framing wajah
              </label>
              {clips.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={exportAll} className="w-full">
                  <Download className="size-4" /> Unduh script render semua klip
                </Button>
              ) : null}
            </div>
          </section>
        </div>

        {/* Caption Style Settings */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Type className="size-3.5" />
            </span>
            Pengaturan Caption
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-xs">Warna Aktif</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={captionStyle.accent}
                  onChange={(e) => setCaptionStyle(s => ({ ...s, accent: e.target.value }))}
                  className="size-8 cursor-pointer rounded-lg border border-border"
                />
                <span className="font-mono text-xs text-muted-foreground">{captionStyle.accent}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Efek Subtitle</Label>
              <select
                value={captionStyle.effect}
                onChange={(e) => setCaptionStyle(s => ({ ...s, effect: e.target.value as CaptionStyle["effect"] }))}
                className="w-full cursor-pointer rounded-xl border border-border bg-background p-2 text-xs outline-none focus:border-accent"
              >
                <option value="none">Tanpa Efek</option>
                <option value="glow">Glow</option>
                <option value="pop">Pop</option>
                <option value="box">Box</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Kata per Baris · {captionStyle.wordsPerLine}</Label>
              <input
                type="range"
                min={1}
                max={5}
                value={captionStyle.wordsPerLine}
                onChange={(e) => setCaptionStyle(s => ({ ...s, wordsPerLine: parseInt(e.target.value) }))}
                className="w-full accent-[var(--color-accent)]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Ukuran Font · {captionStyle.fontSize}px</Label>
              <input
                type="range"
                min={18}
                max={48}
                value={captionStyle.fontSize}
                onChange={(e) => setCaptionStyle(s => ({ ...s, fontSize: parseInt(e.target.value) }))}
                className="w-full accent-[var(--color-accent)]"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={captionStyle.uppercase}
                onCheckedChange={(v) => setCaptionStyle(s => ({ ...s, uppercase: v }))}
              />
              Huruf Kapital
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={captionStyle.stroke}
                onCheckedChange={(v) => setCaptionStyle(s => ({ ...s, stroke: v }))}
              />
              Garis Tepi
            </label>
          </div>
        </section>

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
            <div className="mt-4 space-y-4">
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
                    captionStyle={captionStyle}
                    faceTracking={faceTracking}
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
  captionStyle,
  faceTracking,
}: {
  clip: Clip;
  mediaUrl: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSave: (clip: Clip, patch: Partial<Clip>) => void;
  onExport: (clip: Clip, kind: "srt" | "ass" | "ffmpeg") => void;
  captionStyle: CaptionStyle;
  faceTracking: boolean;
}) {
  const words = (clip.caption_words as unknown as { word: string; start: number; end: number }[]) ?? [];
  const duration = clip.end_time - clip.start_time;
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  async function renderServerMp4() {
    if (rendering) return;
    setRendering(true);
    setRenderProgress(0);
    try {
      toast.info("Mengirim klip ke server untuk render MP4…");
      const { renderClipServerSide } = await import("@/lib/backend-api");
      const result = await renderClipServerSide({
        projectId: clip.project_id,
        clipId: clip.id,
        captionStyle: {
          accent: captionStyle.accent,
          base: captionStyle.base,
          outline: "#000000",
          fontSize: Math.round((captionStyle.fontSize / 30) * 32),
          fontName: "Anton",
          wordsPerLine: captionStyle.wordsPerLine,
          position: captionStyle.position,
          stroke: captionStyle.stroke,
          bold: true,
          uppercase: captionStyle.uppercase,
          effect: captionStyle.effect === "none" ? "classic" : captionStyle.effect,
          opacity: 0.45,
        },
        faceTracking,
      });
      setRenderProgress(1);
      toast.success("MP4 berhasil dirender di server!");
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.file;
      a.target = "_blank";
      a.click();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Render server gagal.");
    } finally {
      setRendering(false);
      setRenderProgress(0);
    }
  }

  async function renderWebm() {
    if (!mediaUrl) {
      toast.error("Pilih file video dulu supaya bisa merender di browser.");
      return;
    }
    if (!isWebmExportSupported()) {
      toast.error("Browser ini belum mendukung ekspor otomatis. Gunakan ekspor FFmpeg.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRendering(true);
    setRenderProgress(0);
    try {
      const blob = await exportClipWebm({
        src: mediaUrl,
        start: clip.start_time,
        end: clip.end_time,
        words,
        accent: captionStyle.accent,
        base: captionStyle.base,
        wordsPerLine: captionStyle.wordsPerLine,
        position: captionStyle.position,
        enableFaceTracking: faceTracking,
        subtitleEffect: captionStyle.effect,
        uppercase: captionStyle.uppercase,
        onProgress: setRenderProgress,
        signal: controller.signal,
      });
      const slug = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "clip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Klip berhasil dirender dengan efek subtitle & face tracking!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Render gagal.");
    } finally {
      abortRef.current = null;
      setRendering(false);
      setRenderProgress(0);
    }
  }

  return (
    <div className={`rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md ${expanded ? "border-accent/50 shadow-md" : "border-border"}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className={`relative flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border border-accent/20 bg-accent/10 ${clip.virality_score >= 85 ? "ring-1 ring-accent/40" : ""}`}>
          <span className="font-display text-xl font-bold text-accent">{clip.virality_score}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">viral</span>
          {clip.virality_score >= 85 ? (
            <Flame className="absolute -right-1.5 -top-1.5 size-4 rounded-full bg-background p-0.5 text-accent" />
          ) : null}
        </div>
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
          variant={expanded ? "secondary" : "ghost"}
          size="sm"
          onClick={onToggle}
          className="group"
        >
          <Play className="size-4" /> {expanded ? "Tutup" : "Buka editor"}
          <ChevronDown className={`ml-0.5 size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </Button>
      </div>

      {expanded ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3 }}
          className="mt-5 grid gap-6 md:grid-cols-[220px_1fr]"
        >
          <div className="mx-auto w-[200px]">
            {mediaUrl ? (
              <ClipVideoPreview
                src={mediaUrl}
                start={clip.start_time}
                end={clip.end_time}
                words={words}
                style={captionStyle}
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
                style={captionStyle}
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
            <div className="flex flex-wrap gap-2">
              <Button variant="accent" size="sm" onClick={renderWebm} disabled={rendering || !mediaUrl} title="Render di browser (WebM)">
                {rendering ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {rendering ? `Merender ${Math.round(renderProgress * 100)}%` : "Render video (WebM)"}
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={renderServerMp4}
                disabled={rendering}
                className="bg-accent/90"
                title="Render MP4 720x1280 di server VPS (ffmpeg + karaoke + face tracking)"
              >
                {rendering ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {rendering ? "Merender MP4…" : "Render MP4 (server)"}
              </Button>
              {rendering ? (
                <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                  Batalkan
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => onExport(clip, "srt")}>
                <FileText className="size-4" /> .srt
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onExport(clip, "ass")}>
                <FileText className="size-4" /> .ass karaoke
              </Button>
              <Button variant="outline" size="sm" onClick={() => onExport(clip, "ffmpeg")}>
                <Terminal className="size-4" /> Salin FFmpeg
              </Button>
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
