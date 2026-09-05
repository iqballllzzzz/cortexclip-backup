"use client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
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
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildAss, buildSrt, download } from "@/lib/srt";
import { useI18n } from "@/lib/i18n";
import { getPreset, DEFAULT_SUBTITLE_PRESET } from "@/components/subtitle-styles";
import { useAccountStatus } from "@/hooks/use-account-status";
import type { Database } from "@/integrations/supabase/types";

type Project = Database["public"]["Tables"]["projects"]["Row"] & {
  progress?: number | null;
};
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

/* ══════════════════════════════════════════════════════════════════════════
   REDESIGN v2 — "KLIP DECK"
   Hallmark · macrostructure: Catalogue-card · tone: utilitarian-editorial
   · anchor hue: matte amber 60° (palet lama dipertahankan)

   Perubahan STRUKTURAL vs halaman lama:
   — Klip terkuat jadi POSTER DEPAN besar 9:16 (hero kiri), bukan dua panel
     kecil berdampingan.
   — Daftar klip jadi DECK: baris poster 9:16 scroll horizontal dengan ring
     skor viral besar di tiap kartu — bukan grid 3 kolom datar.
   — Progres pipeline jadi "jam peron" vertikal di samping judul, bukan panel
     terpisah di bawah.
   — Animasi baru: kartu deck muncul stagger + hover poster zoom + ring skor
     terisi saat mount.
   Prinsip ADHD: SHOW THE AI'S HAND — skor virality jadi elemen visual utama
   di SEMUA tingkat (hero, deck, tombol).
   ══════════════════════════════════════════════════════════════════════════ */

const PHASES = [
  { key: "downloading", labelKey: "proyek.tahap_ambil", label: "Ambil media", pct: 12 },
  { key: "transcribing", labelKey: "proyek.tahap_transkripsi", label: "Transkripsi", pct: 45 },
  { key: "analyzing", labelKey: "proyek.tahap_pilih_momen", label: "Pilih momen", pct: 78 },
  { key: "completed", labelKey: "proyek.tahap_selesai", label: "Selesai", pct: 100 },
] as const;

function persenTampil(status: string | undefined, progress: number | null | undefined): number {
  const i = PHASES.findIndex((p) => p.key === status);
  if (i < 0) return 0;
  const dasar = PHASES[i]?.pct ?? 0;
  const atas = PHASES[i + 1]?.pct ?? 100;
  const p = typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : 0;
  return Math.round(dasar + ((atas - dasar) * p) / 100);
}

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

function sisaWaktu(sec: number): string {
  if (sec >= 3600) {
    const j = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m > 0 ? `${j} jam ${m} menit` : `${j} jam`;
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s > 0 ? `${m} menit ${s} detik` : `${m} menit`;
  }
  return `${Math.max(1, Math.round(sec))} detik`;
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------- page */

function ProjectPage() {
  const { t } = useI18n();
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

  const pct = persenTampil(project?.status, project?.progress);

  /* --- ESTIMASI SELESAI: dari LAJU NYATA (EMA 0.3), bukan karangan --- */
  const lajuRef = useRef<number | null>(null);
  const sampelRef = useRef<{ pct: number; t: number } | null>(null);
  const [etaS, setEtaS] = useState<number | null>(null);

  useEffect(() => {
    if (!busy) {
      lajuRef.current = null;
      sampelRef.current = null;
      setEtaS(null);
      return;
    }
    const now = Date.now() / 1000;
    const prev = sampelRef.current;
    if (prev && pct > prev.pct) {
      const dt = now - prev.t;
      const dp = pct - prev.pct;
      if (dt > 0.5) {
        const laju = dp / dt;
        const alpha = 0.3;
        lajuRef.current = lajuRef.current
          ? lajuRef.current * (1 - alpha) + laju * alpha
          : laju;
        setEtaS(Math.max(1, Math.round((100 - pct) / lajuRef.current)));
      }
    }
    sampelRef.current = { pct, t: now };
  }, [busy, pct]);

  /* --- WATCHDOG: macet >10 menit = failed supaya bisa proses ulang --- */
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
        <PageLoading label="Memuat proyek" />
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

      <main className="mx-auto max-w-[1240px] px-4 pb-28 pt-9 sm:px-6 sm:pt-12">
        {/* ==== Kepala proyek: "tiket peron" — judul menumpuk di atas info
             rute, bukan dua kolom seragam ==== */}
        <header>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Semua proyek
          </Link>

          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                {project.source_type === "youtube" ? (
                  <Link2 className="size-3" />
                ) : (
                  <Upload className="size-3" />
                )}
                {project.source_type === "youtube" ? "Sumber YouTube" : "Unggahan"}
              </p>
              <h1
                className="mt-2.5 font-display text-[28px] leading-[1.06] font-bold tracking-tight sm:text-[44px]"
                style={{ overflowWrap: "anywhere", minWidth: 0 }}
              >
                {project.title}
              </h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                <span className="font-mono">
                  {project.duration_seconds ? formatClock(project.duration_seconds) : "—"} durasi
                </span>
                <span className="opacity-40">·</span>
                <span>{clips.length} klip</span>
                {clips.length > 0 ? (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="font-semibold text-foreground">skor rerata {avgScore}</span>
                  </>
                ) : null}
              </p>
            </div>

            {(busy || running) && (
              /* JAM PERON: ring besar + fase — menempel di kepala */
              <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4">
                <div className="relative grid size-14 place-items-center">
                  <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden>
                    <circle cx="28" cy="28" r="24" fill="none" strokeWidth="4" className="stroke-border" />
                    <circle
                      cx="28"
                      cy="28"
                      r="24"
                      fill="none"
                      strokeWidth="4"
                      strokeLinecap="round"
                      className="stroke-accent"
                      strokeDasharray={2 * Math.PI * 24}
                      strokeDashoffset={2 * Math.PI * 24 * (1 - pct / 100)}
                      style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
                    />
                  </svg>
                  <span className="font-display text-[15px] font-bold leading-none">{pct}%</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">
                    {running ? progress || "Memproses…" : (STATUS_LABEL[project.status] ?? "Memproses…")}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {etaS !== null ? (
                      <span className="font-medium text-foreground">~{sisaWaktu(etaS)} lagi</span>
                    ) : (
                      "menghitung estimasi…"
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    berjalan di server — halaman boleh ditutup
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* REL FASE mini di bawah judul (hanya saat proses) */}
          {(busy || running) && (
            <ol className="mt-5 flex items-center gap-2">
              {PHASES.map((ph, i) => {
                const done = pct > ph.pct;
                const current = project.status === ph.key;
                return (
                  <li key={ph.key} className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                        current ? "text-accent" : done ? "text-muted-foreground" : "text-muted-foreground/50"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          current ? "animate-pulse bg-accent" : done ? "bg-accent/60" : "bg-border"
                        }`}
                      />
                      <span className="truncate">{ph.label}</span>
                    </span>
                    {i < PHASES.length - 1 ? (
                      <span className={`h-px w-6 sm:w-10 ${done ? "bg-accent/50" : "bg-border"}`} />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </header>

        {/* ==== Notifikasi render selesai ==== */}
        <AnimatePresence>
          {renderDoneCount > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/30 bg-accent/6 px-4 py-3.5 text-sm"
            >
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
            </motion.div>
          ) : null}
        </AnimatePresence>

        {project.status === "failed" && project.error_message ? (
          <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/6 px-4 py-3.5 text-sm text-destructive">
            {project.error_message}
          </div>
        ) : null}

        {/* ==== KLIP TERKUAT: POSTER DEPAN besar 9:16 ==== */}
        {clips.length > 0 && best ? (
          <section className="mt-10" aria-label="Klip terkuat">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Flame className="size-3.5 text-accent" /> Momen terkuat menurut AI
            </p>
            <div className="mt-4 grid gap-6 lg:grid-cols-[300px_1fr] lg:items-center">
              {/* poster 9:16 dengan skor raksasa */}
              <motion.div
                initial={{ opacity: 0, scale: 0.94, rotate: -1 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-3xl border border-accent/30 bg-card shadow-xl shadow-black/10"
                style={{ aspectRatio: "9/16" }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-accent/12 via-transparent to-accent/6" />
                <div className="absolute inset-x-0 top-6 flex flex-col items-center">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                    skor viral
                  </span>
                  <span className="stat-figure mt-1 text-[84px] leading-none text-accent">
                    {best.virality_score}
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-background/95 via-background/70 to-transparent px-5 pb-5 pt-16">
                  <p className="line-clamp-3 font-display text-[15px] font-bold leading-snug tracking-tight">
                    {best.title}
                  </p>
                  <p className="font-mono text-[12px] text-muted-foreground">
                    {formatClock(best.start_time)} – {formatClock(best.end_time)} ·{" "}
                    {(best.end_time - best.start_time).toFixed(0)} detik
                  </p>
                </div>
              </motion.div>

              <div className="min-w-0">
                <p className="max-w-prose text-[14px] leading-relaxed text-muted-foreground">
                  Buka satu klip untuk menyetel gaya subtitle, ukuran, dan posisi. Preview memakai
                  pipeline yang sama dengan hasil unduhan, jadi apa yang kamu lihat itulah hasilnya.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="accent" className="rounded-full" asChild>
                    <Link to="/editor/$clipId" params={{ clipId: best.id }}>
                      <Clapperboard className="size-4" /> Edit klip terkuat
                    </Link>
                  </Button>
                  <Button variant="outline" className="rounded-full" onClick={runPipeline} disabled={running}>
                    {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                    Proses ulang
                  </Button>
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link to="/unduh">
                      <Download className="size-4" /> Riwayat unduhan
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ==== DECK KLIP: baris poster 9:16 scroll horizontal ==== */}
        <section className="mt-12" aria-label={t("proyek.klip_terdeteksi")}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              {t("proyek.klip_terdeteksi")}
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {clips.length > 0 ? "diurutkan dari skor tertinggi" : t("proyek.belum_ada")}
            </span>
          </div>

          {clips.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-border px-6 py-16 text-center">
              <Sparkles className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-4 font-display text-base font-bold">Belum ada klip</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                CortexClip akan mentranskrip audio, mencari momen paling kuat, lalu menulis judul,
                deskripsi, hashtag, dan skor viralitas untuk tiap klip.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Button variant="accent" className="rounded-full" onClick={runPipeline} disabled={running}>
                  {running ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                  Mulai proses AI
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent/50">
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
            <ul className="mt-6 flex snap-x gap-5 overflow-x-auto pb-5 [scrollbar-width:thin]">
              {clips.map((clip, i) => (
                <DeckCard key={clip.id} clip={clip} onSave={saveClip} index={i} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

/* ------------------------------- DECK CARD: poster 9:16 + ring skor */

function DeckCard({
  clip,
  onSave,
  index,
}: {
  clip: Clip;
  onSave: (clip: Clip, patch: Partial<Clip>) => void;
  index: number;
}) {
  const duration = clip.end_time - clip.start_time;
  const hot = clip.virality_score >= 85;

  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.45), ease: [0.16, 1, 0.3, 1] }}
      className="group w-[190px] shrink-0 snap-start sm:w-[210px]"
    >
      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/10 ${
          hot ? "border-accent/40 hover:border-accent/70" : "border-border hover:border-accent/40"
        }`}
      >
        {/* poster 9:16 dengan angka skor besar */}
        <Link
          to="/editor/$clipId"
          params={{ clipId: clip.id }}
          className="relative block overflow-hidden"
          style={{ aspectRatio: "9/16" }}
          aria-label={`Buka editor ${clip.title}`}
        >
          <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/85" />
          <span
            className={`stat-figure absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-[44px] leading-none transition-transform duration-300 group-hover:scale-110 ${
              hot ? "text-accent" : "text-foreground/80"
            }`}
          >
            {clip.virality_score}
          </span>
          {hot ? (
            <span className="absolute left-3 top-3 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground">
              hot
            </span>
          ) : null}
          <span className="absolute inset-x-0 bottom-0 px-3.5 pb-3.5 pt-10">
            <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-muted-foreground">
              {formatClock(clip.start_time)} – {formatClock(clip.end_time)}
              <span className="opacity-40">·</span>
              {duration.toFixed(0)}s
            </span>
            {clip.hook_type ? (
              <Badge variant="secondary" className="mt-2 text-[10px]">
                {clip.hook_type}
              </Badge>
            ) : null}
          </span>
          {/* tombol play mengambang saat hover */}
          <span className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/85 text-foreground opacity-0 backdrop-blur transition-all duration-300 group-hover:scale-110 group-hover:opacity-100">
            <Clapperboard className="size-5" />
          </span>
        </Link>

        <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
          <input
            value={clip.title}
            onChange={(e) => onSave(clip, { title: e.target.value })}
            aria-label="Judul klip"
            className="min-w-0 bg-transparent text-[13px] font-semibold leading-snug tracking-tight outline-none transition-colors focus:text-accent"
          />
          <Button variant="outline" size="sm" asChild className="mt-3 w-full rounded-full">
            <Link to="/editor/$clipId" params={{ clipId: clip.id }}>
              <Clapperboard className="size-4" /> Buka editor
            </Link>
          </Button>
        </div>
      </div>
    </motion.li>
  );
}
