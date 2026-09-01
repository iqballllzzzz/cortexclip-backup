import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  Clock,
  Download,
  Flame,
  Link2,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildAss, buildSrt, download } from "@/lib/srt";
import { getPreset, DEFAULT_SUBTITLE_PRESET } from "@/components/subtitle-styles";
import { useAccountStatus } from "@/hooks/use-account-status";
import type { Database } from "@/integrations/supabase/types";

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

/* ---------------------------------------------------------------- tahapan */

const PHASES = [
  { key: "downloading", label: "Ambil media", pct: 12 },
  { key: "transcribing", label: "Transkripsi", pct: 45 },
  { key: "analyzing", label: "Pilih momen", pct: 78 },
  { key: "completed", label: "Selesai", pct: 100 },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  uploading: "Mengunggah",
  downloading: "Mengunduh media",
  transcribing: "Transkripsi audio",
  analyzing: "Analisis AI",
  rendering: "Render",
  completed: "Selesai",
  failed: "Gagal",
};

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------- page */

function ProjectPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { status: account } = useAccountStatus();

  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [renderDoneCount, setRenderDoneCount] = useState(0);
  const seenJobsRef = useRef<Set<string>>(new Set());

  /* --- deteksi render yang selesai selagi user pergi --- */
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { listProjectRenderJobs } = await import("@/lib/backend-api");
        const jobs = await listProjectRenderJobs(projectId);
        if (cancelled) return;
        const fresh = jobs.filter((j) => j.status === "completed" && !seenJobsRef.current.has(j.id));
        if (seenJobsRef.current.size > 0 || jobs.some((j) => j.status === "completed")) {
          setRenderDoneCount(fresh.length);
          for (const j of jobs) seenJobsRef.current.add(j.id);
        }
      } catch {
        /* backend mungkin belum siap */
      }
    };
    void check();
    const iv = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [projectId]);

  /* --- URL media (file lokal atau signed URL storage) --- */
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

  const busy =
    project?.status === "downloading" ||
    project?.status === "transcribing" ||
    project?.status === "analyzing";

  useEffect(() => {
    if (!busy) return;
    const iv = setInterval(() => void load(), 6000);
    return () => clearInterval(iv);
  }, [busy, load]);

  const pct = (() => {
    const st = project?.status;
    const found = PHASES.find((p) => p.key === st);
    return found?.pct ?? 0;
  })();

  /* --- WATCHDOG: status proses tanpa perubahan >10 menit = macet.
     (Jejak pipeline browser lama / task server crash tanpa update.)
     Tandai failed supaya tombol Proses Ulang bisa dipakai lagi. --- */
  useEffect(() => {
    if (!project || !busy) return;
    const started = new Date(project.updated_at).getTime();
    if (Date.now() - started > 10 * 60 * 1000) {
      void supabase
        .from("projects")
        .update({
          status: "failed",
          error_message:
            "Proses macet (tidak ada kemajuan lebih dari 10 menit). Tekan Proses Ulang untuk mencoba lagi — sekarang berjalan penuh di server.",
        })
        .eq("id", projectId);
      toast.error("Proses sebelumnya macet — ditandai gagal. Tekan Proses Ulang.");
    }
  }, [project, busy, projectId]);

  async function runPipeline() {
    setRunning(true);
    try {
      setProgress("Memulai proses di server…");
      // PROSES ULANG via SERVER — bukan lagi pipeline browser.
      // Dulu: pipeline jalan di tab browser; tab ditutup → project nyangkut
      // "transcribing" selamanya. Sekarang server yang mengerjakan semuanya.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/projects/${projectId}/reprocess`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(d.detail ?? "Gagal memulai proses ulang");
      }
      setProgress("");
      setRunning(false);
      toast.success("Proses ulang dimulai di server — pantau progresnya di halaman ini.");
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proses gagal dimulai.";
      toast.error(message);
      setRunning(false);
      setProgress("");
    }
  }

  async function saveClip(clip: Clip, patch: Partial<Clip>) {
    setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("clips").update(patch as never).eq("id", clip.id);
    if (error) toast.error("Gagal menyimpan perubahan.");
  }

  function exportClip(clip: Clip, kind: "srt" | "ass") {
    const words =
      (clip.caption_words as unknown as { word: string; start: number; end: number }[]) ?? [];
    const slug = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "clip";

    if (kind === "srt") {
      download(`${slug}.srt`, clip.srt_content ?? buildSrt(words));
      return;
    }
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
  }

  /* ------------------------------------------------------------- render */

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav displayName="?" isAdmin={account?.is_admin} />
        <div className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav displayName="?" isAdmin={account?.is_admin} />
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="font-display text-lg font-bold">Proyek tidak ditemukan.</p>
          <Button variant="accent" className="mt-5" onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="size-4" /> Kembali ke dashboard
          </Button>
        </div>
      </div>
    );
  }

  const avgScore = clips.length
    ? Math.round(clips.reduce((s, c) => s + (c.virality_score ?? 0), 0) / clips.length)
    : 0;
  const best = clips[0];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <AppNav
        displayName={project.title.slice(0, 1) || "P"}
        isAdmin={account?.is_admin}
        themeToggle
        right={
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
            {busy ? <Loader2 className="size-3 animate-spin text-accent" /> : null}
            {STATUS_LABEL[project.status] ?? project.status}
            {busy ? ` · ${pct}%` : ""}
          </span>
        }
      />

      <main className="mx-auto max-w-[1180px] px-4 pb-28 pt-9 sm:px-6 sm:pt-12">
        {/* ==== Kepala proyek: judul besar kiri, metrik kanan bawah ==== */}
        <header className="reveal" style={{ ["--i" as string]: 0 }}>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Semua proyek
          </Link>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {project.source_type === "youtube" ? (
                  <Link2 className="size-3" />
                ) : (
                  <Upload className="size-3" />
                )}
                {project.source_type === "youtube" ? "Sumber YouTube" : "Unggahan"}
              </p>
              <h1
                className="mt-3 font-display text-[26px] leading-[1.08] font-bold tracking-tight sm:text-[40px]"
                style={{ overflowWrap: "anywhere", minWidth: 0 }}
              >
                {project.title}
              </h1>
            </div>

            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-border">
              {[
                ["Durasi", project.duration_seconds ? formatClock(project.duration_seconds) : "—"],
                ["Klip", String(clips.length)],
                ["Skor rerata", clips.length ? String(avgScore) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-3.5 py-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {k}
                  </p>
                  <p className="stat-figure mt-2 text-2xl">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* ==== Progres pipeline: rel bertahap, bukan bar polos ==== */}
        {busy || running ? (
          <section className="reveal mt-8 panel px-5 py-5" style={{ ["--i" as string]: 1 }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Loader2 className="size-4 animate-spin text-accent" />
              <p className="text-sm font-semibold">
                {running ? progress || "Memproses…" : (STATUS_LABEL[project.status] ?? "Memproses…")}
              </p>
              <p className="ml-auto stat-figure text-lg text-accent">{running ? "" : `${pct}%`}</p>
            </div>

            <ol className="mt-5 grid gap-2 sm:grid-cols-4">
              {PHASES.map((ph) => {
                const done = pct > ph.pct;
                const current = project.status === ph.key;
                return (
                  <li key={ph.key} className="min-w-0">
                    <div
                      className={`h-1 rounded-full transition-colors ${
                        done || current ? "bg-accent" : "bg-border"
                      }`}
                    />
                    <p
                      className={`mt-2 truncate text-[12px] ${
                        current
                          ? "font-semibold text-foreground"
                          : done
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60"
                      }`}
                    >
                      {ph.label}
                    </p>
                  </li>
                );
              })}
            </ol>

            <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
              Proses berjalan di server — halaman boleh ditutup, klip muncul otomatis saat selesai.
            </p>
          </section>
        ) : null}

        {/* ==== Notifikasi render selesai ==== */}
        {renderDoneCount > 0 ? (
          <div className="reveal mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/30 bg-accent/6 px-4 py-3.5 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-accent" />
            <span className="min-w-0">
              {renderDoneCount > 1 ? `${renderDoneCount} klip` : "Satu klip"} selesai dirender.
            </span>
            <Link
              to="/unduh"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              Buka halaman unduhan
            </Link>
          </div>
        ) : null}

        {project.status === "failed" && project.error_message ? (
          <div className="reveal mt-4 rounded-2xl border border-destructive/30 bg-destructive/6 px-4 py-3.5 text-sm text-destructive">
            {project.error_message}
          </div>
        ) : null}

        {/* ==== Sorotan klip terbaik + aksi proses ==== */}
        {clips.length > 0 && best ? (
          <section
            className="reveal mt-10 grid gap-3 lg:grid-cols-[1fr_1.4fr]"
            style={{ ["--i" as string]: 2 }}
          >
            <div className="panel px-5 py-5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Flame className="size-3.5 text-accent" /> Klip terkuat
              </p>
              <p className="stat-figure mt-4 text-[44px] text-accent">{best.virality_score}</p>
              <p className="mt-2 line-clamp-2 text-sm font-medium">{best.title}</p>
              <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                {formatClock(best.start_time)} – {formatClock(best.end_time)}
              </p>
            </div>

            <div className="panel flex flex-col justify-between px-5 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Langkah berikutnya
                </p>
                <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
                  Buka satu klip untuk menyetel gaya subtitle, ukuran, dan posisi. Preview memakai
                  pipeline yang sama dengan hasil unduhan, jadi apa yang kamu lihat itulah hasilnya.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="accent" onClick={runPipeline} disabled={running}>
                  {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  Proses ulang
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/unduh">
                    <Download className="size-4" /> Riwayat unduhan
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {/* ==== Daftar klip ==== */}
        <section className="reveal mt-12" style={{ ["--i" as string]: 3 }}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              Klip terdeteksi
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {clips.length > 0 ? "diurutkan dari skor tertinggi" : "belum ada"}
            </span>
          </div>

          {clips.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
              <Sparkles className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-4 font-display text-base font-bold">Belum ada klip</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                CortexClip akan mentranskrip audio, mencari momen paling kuat, lalu menulis judul,
                deskripsi, hashtag, dan skor viralitas untuk tiap klip.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="accent" onClick={runPipeline} disabled={running}>
                  {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  Mulai proses AI
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/50">
                  <Upload className="size-4" />
                  {localFile ? localFile.name.slice(0, 22) : "Pilih file lokal"}
                  <input
                    type="file"
                    accept="video/*,audio/*"
                    onChange={(e) => setLocalFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {clips.map((clip, i) => (
                <div
                  key={clip.id}
                  className="reveal"
                  style={{ ["--i" as string]: Math.min(8, 4 + i) }}
                >
                  <ClipRow clip={clip} onSave={saveClip} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* --------------------------------------------------------------- ClipRow */

function ClipRow({
  clip,
  onSave,
}: {
  clip: Clip;
  onSave: (clip: Clip, patch: Partial<Clip>) => void;
}) {
  const duration = clip.end_time - clip.start_time;
  const hot = clip.virality_score >= 85;

  return (
    <article
      className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent/25"
    >
      {/* baris ringkas */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:flex-nowrap sm:gap-4 sm:px-5">
        <div
          className={`grid size-14 shrink-0 place-items-center rounded-xl border transition-colors ${
            hot ? "border-accent/40 bg-accent/10" : "border-border bg-surface"
          }`}
        >
          <span className="stat-figure text-xl text-accent">{clip.virality_score}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            viral
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <input
            value={clip.title}
            onChange={(e) => onSave(clip, { title: e.target.value })}
            aria-label="Judul klip"
            className="w-full bg-transparent text-[15px] font-semibold tracking-tight outline-none transition-colors focus:text-accent"
          />
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
            <span className="font-mono">
              {formatClock(clip.start_time)} – {formatClock(clip.end_time)}
            </span>
            <span className="opacity-40">·</span>
            <span>{duration.toFixed(0)} detik</span>
            {clip.hook_type ? (
              <Badge variant="secondary" className="ml-0.5 text-[10px]">
                {clip.hook_type}
              </Badge>
            ) : null}
          </p>
        </div>

        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <Link to="/editor/$clipId" params={{ clipId: clip.id }}>
              <Clapperboard className="size-4" /> Buka editor
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}
