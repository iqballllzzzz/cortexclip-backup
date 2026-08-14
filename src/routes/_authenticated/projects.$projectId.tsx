import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { CaptionPreview, defaultCaptionStyle } from "@/components/caption-preview";
import { extractAudio } from "@/lib/audio-extract";
import { ClipVideoPreview } from "@/components/clip-video-preview";
import { exportClipWebm, isWebmExportSupported } from "@/lib/webm-export";
import { transcribeChunkFn, detectClipsFn } from "@/lib/pipeline.functions";
import { buildAss, buildFfmpegCommand, buildSrt, download, toCaptionWords } from "@/lib/srt";
import type { Transcript, TranscriptSegment } from "@/lib/pipeline-types";
import type { Database } from "@/integrations/supabase/types";

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

function ProjectPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("1080x1920");
  const [faceTracking, setFaceTracking] = useState(true);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  // URL preview: pakai file lokal bila ada, kalau tidak ambil signed URL storage.
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
          accent: defaultCaptionStyle.accent,
          base: defaultCaptionStyle.base,
          fontSize: defaultCaptionStyle.fontSize,
          wordsPerLine: defaultCaptionStyle.wordsPerLine,
          position: defaultCaptionStyle.position,
          stroke: defaultCaptionStyle.stroke,
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
        <div className="mx-auto max-w-5xl px-5 py-20">
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-5 py-20 text-center">
          <p className="text-lg font-semibold">Proyek tidak ditemukan.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/dashboard" })}>
            Kembali ke dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Dashboard
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              {project.source_type === "youtube" ? "Sumber YouTube" : "Unggahan"}
            </p>
            <h1 className="mt-2 text-3xl font-bold">{project.title}</h1>
            {project.source_url ? (
              <a
                href={project.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block max-w-full truncate text-sm text-muted-foreground underline"
              >
                {project.source_url}
              </a>
            ) : null}
          </div>
          <Button variant="accent" onClick={runPipeline} disabled={running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {clips.length > 0 ? "Proses Ulang" : "Mulai Proses AI"}
          </Button>
        </motion.header>

        {running ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
            <Loader2 className="size-4 animate-spin text-accent" />
            <span>{progress || "Memproses…"}</span>
          </div>
        ) : null}

        {project.status === "failed" && project.error_message ? (
          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-500">
            {project.error_message}
          </div>
        ) : null}

        {/* Media source */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Upload className="size-4 text-accent" /> File media
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.storage_path
              ? "Pilih ulang file dari perangkat agar preview & ekspor berjalan tanpa mengunduh ulang video dari server."
              : "Untuk sumber YouTube, unduh videonya lalu pilih filenya di sini. Audio diekstrak langsung di browser kamu — tidak ada file besar yang dikirim ke server."}
          </p>
          <input
            type="file"
            accept="video/*,audio/*"
            onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-foreground"
          />
          {localFile ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {localFile.name} · {(localFile.size / 1024 / 1024).toFixed(1)} MB
            </p>
          ) : null}
        </section>


        {/* Render settings */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Terminal className="size-4 text-accent" /> Pengaturan ekspor
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    resolution === r
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "1080x1920" ? "9:16 · 1080p" : r === "720x1280" ? "9:16 · 720p" : "1:1 · 1080p"}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={faceTracking}
                onChange={(e) => setFaceTracking(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              Auto-framing wajah (crop tengah dinamis)
            </label>
            {clips.length > 0 ? (
              <Button variant="secondary" size="sm" className="ml-auto" onClick={exportAll}>
                <Download className="size-4" /> Unduh script render semua klip
              </Button>
            ) : null}
          </div>
        </section>

        {/* Clips */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Klip terdeteksi ({clips.length})
          </h2>

          {clips.length === 0 ? (
            <div className="mt-4 flex flex-col items-center rounded-2xl border border-border bg-card py-16 text-center">
              <Sparkles className="size-10 text-muted-foreground/50" />
              <p className="mt-4 font-medium">Belum ada klip</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Klik “Mulai Proses AI” — CortexClip akan mentranskrip audio, mencari momen paling
                kuat, lalu menulis judul, deskripsi, hashtag, dan skor viralitas untuk tiap klip.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {clips.map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  expanded={activeClip === clip.id}
                  onToggle={() => setActiveClip(activeClip === clip.id ? null : clip.id)}
                  onSave={saveClip}
                  onExport={exportClip}
                />
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
  expanded,
  onToggle,
  onSave,
  onExport,
}: {
  clip: Clip;
  expanded: boolean;
  onToggle: () => void;
  onSave: (clip: Clip, patch: Partial<Clip>) => void;
  onExport: (clip: Clip, kind: "srt" | "ass" | "ffmpeg") => void;
}) {
  const words = (clip.caption_words as unknown as { word: string; start: number; end: number }[]) ?? [];
  const duration = clip.end_time - clip.start_time;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-accent/15">
          <span className="font-display text-lg font-bold text-accent">{clip.virality_score}</span>
          <span className="text-[9px] uppercase text-accent/80">viral</span>
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={clip.title}
            onChange={(e) => onSave(clip, { title: e.target.value })}
            className="w-full bg-transparent text-base font-semibold outline-none focus:underline"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {formatClock(clip.start_time)} – {formatClock(clip.end_time)} · {duration.toFixed(0)} detik ·{" "}
            {clip.hook_type}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle}>
          <Play className="size-4" /> {expanded ? "Tutup" : "Buka editor"}
        </Button>
      </div>

      {expanded ? (
        <div className="mt-5 grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="mx-auto w-[200px]">
            {words.length > 0 ? (
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
                style={defaultCaptionStyle}
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
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-accent"
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
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onExport(clip, "srt")}>
                <FileText className="size-4" /> .srt
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onExport(clip, "ass")}>
                <FileText className="size-4" /> .ass karaoke
              </Button>
              <Button variant="accent" size="sm" onClick={() => onExport(clip, "ffmpeg")}>
                <Terminal className="size-4" /> Salin perintah FFmpeg
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
