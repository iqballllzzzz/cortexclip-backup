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
  Lock,
  Crown,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppNav } from "@/components/app-nav";
import { PageLoading } from "@/components/page-loading";
import { PremiumDialog } from "@/components/premium-dialog";
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
  /** gambar potongan klip (dibuat backend via ffmpeg range-read) */
  thumb_url?: string | null;
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
  const { status: account, reload: reloadAccount } = useAccountStatus();
  const isPremium = account?.quota?.plan === "premium";

  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [renderDoneCount, setRenderDoneCount] = useState(0);
  const [premiumOpen, setPremiumOpen] = useState(false);
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

  /* --- THUMBNAIL KARTU KLIP ---
     Permintaan pengguna: kartu klip jangan kotak polos dengan angka skor —
     isi dengan gambar potongan klipnya. Backend mengambil satu frame lewat
     ffmpeg HTTP-range (tidak mengunduh video penuh) lalu menyimpan URL-nya
     ke clips.thumb_url. Di sini kita cuma MEMICU pembuatan lalu memuat ulang
     daftar klip ketika sudah jadi. Sekali saja per kunjungan; kalau semua
     klip sudah punya thumb, backend balas queued:0 dan tidak ada polling. */
  const thumbMintaRef = useRef(false);
  useEffect(() => {
    if (loading || clips.length === 0 || thumbMintaRef.current) return;
    const kurang = clips.filter((c) => !c.thumb_url).length;
    if (kurang === 0) return;
    thumbMintaRef.current = true;
    let batal = false;
    let iv: ReturnType<typeof setInterval> | null = null;
    void (async () => {
      try {
        const { getAccessToken } = await import("@/lib/backend-api");
        const token = await getAccessToken();
        const res = await fetch(`/api/projects/${projectId}/thumbnails`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const d = (await res.json()) as { queued?: number };
        if (!d.queued || batal) return;
        // muat ulang berkala sampai thumbnail muncul (maks ~1 menit)
        let putaran = 0;
        iv = setInterval(() => {
          putaran += 1;
          if (batal || putaran > 12) {
            if (iv) clearInterval(iv);
            return;
          }
          void load();
        }, 5000);
      } catch {
        /* thumbnail hanya hiasan — kegagalan tidak boleh mengganggu halaman */
      }
    })();
    return () => {
      batal = true;
      if (iv) clearInterval(iv);
    };
  }, [loading, clips, projectId, load]);

  const busy =
    project?.status === "downloading" ||
    project?.status === "transcribing" ||
    project?.status === "analyzing";

  useEffect(() => {
    if (!busy) return;
    const iv = setInterval(() => void load(), 6000);
    return () => clearInterval(iv);
  }, [busy, load]);

  const rawPct = persenTampil(project?.status, project?.progress);
  const [visualPct, setVisualPct] = useState(rawPct);

  useEffect(() => {
    setVisualPct((prev) => Math.max(prev, rawPct));
  }, [rawPct]);

  useEffect(() => {
    if (!busy || visualPct >= 99) return;
    // Di atas 90%, interval diperlambat secara asimtotik agar terus bergerak dan tidak macet di 92%
    const delay = visualPct >= 96 ? 2800 : visualPct >= 92 ? 1500 : 900;
    const timer = setTimeout(() => {
      setVisualPct((v) => (v < 99 ? v + 1 : v));
    }, delay);
    return () => clearTimeout(timer);
  }, [busy, visualPct]);

  const pct = busy ? visualPct : rawPct;

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

        {/* ==== KLIP TERKUAT — DIKECILKAN.
             KELUHAN: "momen terkuat menurut ai itu dikecilin lagi karena
             gaenak banget gede banget di handphone". Dulu posternya 300px
             lebar penuh 9:16 (≈533px tinggi) dan mendominasi layar HP.
             Sekarang: baris ringkas — thumbnail kecil 9:16 (72px mobile /
             84px desktop) di kiri, judul + waktu + aksi di kanan. Gambarnya
             memakai thumb_url yang sama dengan kartu deck. ==== */}
        {clips.length > 0 && best ? (
          <section className="mt-8" aria-label="Klip terkuat">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Flame className="size-3.5 text-accent" /> Momen terkuat menurut AI
            </p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3 flex max-w-xl items-stretch gap-3.5 rounded-2xl border border-accent/30 bg-accent/5 p-3 sm:gap-4 sm:p-3.5"
            >
              {/* thumbnail 9:16 kecil */}
              <Link
                to="/editor/$clipId"
                params={{ clipId: best.id }}
                className="relative aspect-[9/16] w-[72px] shrink-0 overflow-hidden rounded-xl border border-border bg-surface sm:w-[84px]"
                aria-label={`Buka ${best.title}`}
              >
                {best.thumb_url ? (
                  <img
                    src={best.thumb_url}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 grid place-items-center">
                    <Clapperboard className="size-5 text-muted-foreground/50" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                <div className="min-w-0">
                  <p className="line-clamp-2 font-display text-[14px] font-bold leading-snug tracking-tight sm:text-[15.5px]">
                    {best.title}
                  </p>
                  <p className="mt-1 font-mono text-[11.5px] text-muted-foreground">
                    {formatClock(best.start_time)} – {formatClock(best.end_time)} ·{" "}
                    {Math.floor(best.end_time - best.start_time)}s
                  </p>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Button variant="accent" size="sm" className="rounded-full" asChild>
                    <Link to="/editor/$clipId" params={{ clipId: best.id }}>
                      <Clapperboard className="size-3.5" /> Edit
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={runPipeline}
                    disabled={running}
                  >
                    {running ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                    Proses ulang
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-full" asChild>
                    <Link to="/unduh">
                      <Download className="size-3.5" /> Unduhan
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          </section>
        ) : null}

        {/* ==== DECK KLIP: baris poster 9:16 scroll horizontal ==== */}
        <section className="mt-12" aria-label={t("proyek.klip_terdeteksi")}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              {t("proyek.klip_terdeteksi")}
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {clips.length > 0 ? t("proyek.urut_skor") : t("proyek.belum_ada")}
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
            <>
              {/* Banner Penawaran Buka Kunci Klip (Cash Flow Booster) */}
              {!isPremium && clips.length > 3 ? (
                <div className="mt-6 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 p-5 text-center shadow-lg">
                  <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
                    <Crown className="size-6 animate-bounce" />
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold text-foreground sm:text-xl">
                    Buka Kunci {clips.length - 3} Klip Viral Lainnya
                  </h3>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    AI telah mendeteksi total {clips.length} momen terbaik dari videomu. Akun gratis hanya membuka 3 klip pertama. Upgrade mulai <strong>Rp5.000 (QRIS)</strong> untuk membuka seluruh klip & 100% bebas watermark!
                  </p>
                  <Button
                    variant="accent"
                    className="mt-4 rounded-xl px-6 py-2.5 text-xs font-bold text-white shadow-md hover:scale-105 active:scale-95 transition-all"
                    onClick={() => setPremiumOpen(true)}
                  >
                    <Crown className="size-4" /> Buka Kunci Semua Klip Sekarang (Rp5.000)
                  </Button>
                </div>
              ) : null}

              <ul className="snap-strip mt-6 flex gap-5 overflow-x-auto pb-5 [scrollbar-width:thin]">
                {clips.map((clip, i) => {
                  const isLocked = !isPremium && i >= 3;
                  return (
                    <DeckCard
                      key={clip.id}
                      clip={clip}
                      onSave={saveClip}
                      index={i}
                      isLocked={isLocked}
                      onUnlock={() => setPremiumOpen(true)}
                    />
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </main>

      <PremiumDialog
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
        onUpgraded={() => {
          void reloadAccount();
          void load();
        }}
      />
    </div>
  );
}

/* ------------------- DECK CARD: poster 9:16 berisi GAMBAR klip

   KELUHAN PENGGUNA: "skor yang ditengah itu kamu hapus terus isi background
   polosan itu dengan gambar potongan klip itu ... yang dihilangkan cuma
   skor nya, tulisan hot sama deskripsi dibagian bawah masih ada".

   Jadi: angka skor besar di tengah DIHAPUS; latar poster kini gambar frame
   klip (clips.thumb_url, dibuat backend lewat ffmpeg range-read). Badge
   "hot", rentang waktu, hook_type, dan judul di bawah TETAP.
   Saat thumbnail belum jadi: kotak shimmer (bukan angka), lalu gambar muncul
   sendiri setelah halaman memuat ulang daftar klip.                       */

function DeckCard({
  clip,
  onSave,
  index,
  isLocked = false,
  onUnlock,
}: {
  clip: Clip;
  onSave: (clip: Clip, patch: Partial<Clip>) => void;
  index: number;
  isLocked?: boolean;
  onUnlock?: () => void;
}) {
  const duration = clip.end_time - clip.start_time;
  const hot = clip.virality_score >= 85;

  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.45), ease: [0.16, 1, 0.3, 1] }}
      className="group w-[168px] shrink-0 snap-start sm:w-[200px]"
    >
      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/10 ${
          isLocked
            ? "border-amber-500/30 bg-amber-500/5"
            : hot
            ? "border-accent/40 hover:border-accent/70"
            : "border-border hover:border-accent/40"
        }`}
      >
        {/* poster 9:16 — GAMBAR potongan klip */}
        {isLocked ? (
          <div
            onClick={onUnlock}
            className="relative block overflow-hidden bg-surface cursor-pointer group"
            style={{ aspectRatio: "9/16" }}
          >
            {clip.thumb_url ? (
              <img
                src={clip.thumb_url}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover blur-[4px] opacity-35"
              />
            ) : (
              <span className="absolute inset-0 grid place-items-center bg-border/40">
                <Clapperboard className="size-6 text-muted-foreground/50" />
              </span>
            )}

            {/* Tirai Gembok Kunci */}
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/60 p-3 text-center backdrop-blur-[2px]">
              <div className="grid size-10 place-items-center rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-md">
                <Lock className="size-5" />
              </div>
              <p className="font-display text-[12px] font-bold text-white">Klip Terkunci</p>
              <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-[10px] font-bold text-white shadow-md hover:scale-105 active:scale-95 transition-all">
                Buka Kunci (Rp5k)
              </span>
            </div>
          </div>
        ) : (
          <Link
            to="/editor/$clipId"
            params={{ clipId: clip.id }}
            className="relative block overflow-hidden bg-surface"
            style={{ aspectRatio: "9/16" }}
            aria-label={`Buka editor ${clip.title}`}
          >
            {clip.thumb_url ? (
              <img
                src={clip.thumb_url}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
              />
            ) : (
              /* thumbnail belum jadi: shimmer berbentuk poster, bukan angka */
              <span className="absolute inset-0 grid animate-pulse place-items-center bg-border/40">
                <Clapperboard className="size-6 text-muted-foreground/50" />
              </span>
            )}

            {/* gradien bawah supaya teks terbaca di atas gambar apa pun */}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-background via-background/75 to-transparent"
            />

            {hot ? (
              <span className="absolute left-2.5 top-2.5 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground shadow">
                hot
              </span>
            ) : null}

            <span className="absolute inset-x-0 bottom-0 px-3 pb-3">
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-foreground/80">
                {formatClock(clip.start_time)} – {formatClock(clip.end_time)}
                <span className="opacity-40">·</span>
                {Math.floor(duration)}s
              </span>
              {clip.hook_type ? (
                <Badge variant="secondary" className="mt-1.5 text-[10px]">
                  {clip.hook_type}
                </Badge>
              ) : null}
            </span>

            {/* isyarat play saat hover/sentuh */}
            <span className="absolute left-1/2 top-[42%] grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition-all duration-300 group-hover:scale-110 group-hover:opacity-100">
              <Clapperboard className="size-5" />
            </span>
          </Link>
        )}

        <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
          <input
            value={clip.title}
            disabled={isLocked}
            onChange={(e) => onSave(clip, { title: e.target.value })}
            aria-label="Judul klip"
            title={clip.title}
            className={`min-w-0 bg-transparent text-[12.5px] font-semibold leading-snug tracking-tight outline-none transition-colors ${
              isLocked ? "text-muted-foreground opacity-60 cursor-not-allowed" : "focus:text-accent"
            }`}
          />
          {isLocked ? (
            <Button
              variant="accent"
              size="sm"
              onClick={onUnlock}
              className="mt-2.5 w-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-[11px] font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-600 active:scale-98"
            >
              <Lock className="size-3.5" /> Buka Kunci (Rp5k)
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild className="mt-2.5 w-full rounded-full">
              <Link to="/editor/$clipId" params={{ clipId: clip.id }}>
                <Clapperboard className="size-4" /> Buka editor
              </Link>
            </Button>
          )}
        </div>
      </div>
    </motion.li>
  );
}
