"use client";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clapperboard,
  Crown,
  Download,
  Loader2,
  MoreVertical,
  Pencil,
  Share2,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  Youtube,
} from "lucide-react";

import { PremiumDialog } from "@/components/premium-dialog";
import { AppNav } from "@/components/app-nav";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { shareProject, renameProject, deleteProject, processYoutube } from "@/lib/project-api";
import { useAccountStatus } from "@/hooks/use-account-status";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];

const title = "Dashboard — CortexClip";
const description = "Kelola proyek klip video kamu dan mulai ubah video panjang jadi klip viral.";

export const Route = createFileRoute("/_authenticated/dashboard")({
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
  component: Dashboard,
});

/* ══════════════════════════════════════════════════════════════════════════
   REDESIGN v2 — "STUDIO DESK"
   Hallmark · macrostructure: Workbench · tone: utilitarian-editorial
   · anchor hue: matte amber 60° (palet lama dipertahankan)

   Prinsip ADHD pemenang yang diterapkan:
   1. HUB-AND-SPOKE      — meja kerja = hub; setiap zona (mulai, rel proses,
                           kartu proyek) adalah spoke yang jarak klik-nya
                           satu gerakan dari pusat.
   2. SHOW THE AI'S HAND — setiap kartu proyek menampilkan BAGIAN data yang
                           benar-benar ada (status pipeline + waktu), bukan
                           metrik karangan.
   3. ONE CLOCK          — tidak ada state waktu paralel di dashboard; semua
                           berasal dari `projects` (sumber tunggal).

   Struktur BARU vs lama (grid kartu 3 kolom):
   — Rail vertikal tahap (kiri, desktop) yang menyaring daftar — bukan
     tiga kartu metrik berjejer.
   — Kartu proyek jadi FILM STRIP: baris scroll horizontal dengan poster
     mini 16:9 + marquee status, BUKAN grid 3 kolom seragam.
   — Zona "Mulai" jadi dock di atas strip, selalu terlihat, satu panel.
   — Animasi baru: strip scroll stagger reveal, ticker status berjalan,
     skeleton strip; hover kartu = tilt 3D ringan + poster zoom.
   ══════════════════════════════════════════════════════════════════════════ */

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  completed: { label: "Selesai", tone: "text-accent" },
  downloading: { label: "Mengunduh", tone: "text-muted-foreground" },
  transcribing: { label: "Transkripsi", tone: "text-muted-foreground" },
  analyzing: { label: "Analisis AI", tone: "text-muted-foreground" },
  uploading: { label: "Mengunggah", tone: "text-muted-foreground" },
  rendering: { label: "Render", tone: "text-muted-foreground" },
  failed: { label: "Gagal", tone: "text-destructive" },
};

function statusOf(p: Project) {
  return STATUS[p.status as string] ?? { label: String(p.status), tone: "text-muted-foreground" };
}

type Tahap = "jalan" | "selesai" | "gagal";
function tahapOf(p: Project): Tahap {
  const s = String(p.status);
  if (s === "completed") return "selesai";
  if (s === "failed") return "gagal";
  return "jalan";
}
type Filter = "semua" | Tahap;

const FASE_IKON = { jalan: Loader2, selesai: CheckCircle2, gagal: TriangleAlert } as const;

function Dashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { status: account, reload: reloadAccount } = useAccountStatus();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharing, setSharing] = useState(false);
  const [sharedLink, setSharedLink] = useState<string | null>(null);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("semua");
  const [quota, setQuota] = useState<{
    plan: string;
    used: number;
    limit: number;
    clips_per_video: number;
  } | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<XMLHttpRequest | null>(null);

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  function putWithProgress(url: string, file: File, onProgress: (ratio: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      uploadRef.current = xhr;
      xhr.open("PUT", url, true);
      xhr.setRequestHeader("content-type", file.type || "video/mp4");
      xhr.setRequestHeader("x-upsert", "true");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Unggahan gagal (${xhr.status}). Coba lagi.`));
      xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah."));
      xhr.onabort = () => reject(new Error("Unggahan dibatalkan."));
      xhr.send(file);
    });
  }

  async function fetchQuota() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/quota", {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (!res.ok) throw new Error("Gagal cek kuota");
    const d = (await res.json()) as {
      ok: boolean;
      plan: string;
      used: number;
      limit: number;
      clips_per_video: number;
      message: string | null;
    };
    setQuota(d);
    return d;
  }

  useEffect(() => {
    fetchQuota().catch(() => {});
  }, []);

  useEffect(() => {
    async function loadData() {
      const [profileRes, projectsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("projects")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (projectsRes.data) setProjects(projectsRes.data);
      setLoading(false);
    }
    void loadData();
  }, [user.id]);

  async function createFromFile(file: File) {
    setCreating(true);
    setUploadPct(0);
    let projectId: string | null = null;
    try {
      const q = await fetchQuota();
      if (!q.ok) {
        setPremiumOpen(true);
        throw new Error(q.message ?? "Limit harian tercapai — upgrade ke Premium.");
      }
      const ext = file.name.split(".").pop() ?? "mp4";
      const { data: project, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          title: file.name.replace(/\.[^.]+$/, ""),
          source_type: "upload",
          status: "uploading",
        })
        .select()
        .single();
      if (error || !project) throw error ?? new Error("Gagal membuat proyek");
      projectId = project.id;

      const { data: signed, error: su } = await supabase.storage
        .from("video-uploads")
        .createSignedUploadUrl(`${user.id}/sources/${project.id}.${ext}`);
      if (su || !signed) throw su ?? new Error("Gagal menyiapkan unggahan");
      await putWithProgress(signed.signedUrl, file, setUploadPct);

      const storagePath = `${user.id}/sources/${project.id}.${ext}`;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/projects/upload-done", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ project_id: project.id, storage_path: storagePath }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(d.detail ?? "Gagal memulai pemrosesan");
      }
      toast.success("Terunggah — AI mulai memproses.");
      setCreating(false);
      setUploadPct(null);
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unggahan gagal");
      if (projectId) await supabase.from("projects").update({ status: "failed" }).eq("id", projectId);
      setCreating(false);
      setUploadPct(null);
    }
  }

  async function createFromYoutube() {
    const url = youtubeUrl.trim();
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
      toast.error("Masukkan link YouTube yang valid.");
      return;
    }
    setCreating(true);
    try {
      const q = await fetchQuota();
      if (!q.ok) {
        setPremiumOpen(true);
        throw new Error(q.message ?? "Limit harian tercapai — upgrade ke Premium.");
      }
      const r = await processYoutube(url);
      toast.success("Sedang diproses di server.");
      setYoutubeUrl("");
      setCreating(false);
      navigate({ to: "/projects/$projectId", params: { projectId: r.project_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses YouTube");
      setCreating(false);
    }
  }

  async function handleShare(p: Project) {
    setSharing(true);
    try {
      const r = await shareProject(p.id);
      const ok = await copyText(r.url);
      setSharedLink(r.url);
      toast[ok ? "success" : "info"](
        ok ? "Link dibuat (berlaku 1 minggu) & tersalin." : "Link siap — salin manual di kotak.",
      );
    } catch {
      toast.error("Gagal membuat link share");
    } finally {
      setSharing(false);
      setMenuFor(null);
    }
  }

  async function handleRename() {
    if (!renameTarget) return;
    try {
      const next = renameValue.trim() || renameTarget.title;
      await renameProject(renameTarget.id, next);
      setProjects((prev) =>
        prev.map((p) => (p.id === renameTarget.id ? { ...p, title: next } : p)),
      );
      toast.success(t("umum.berhasil"));
      setRenameTarget(null);
    } catch {
      toast.error("Gagal mengubah nama");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteProject(confirmDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== confirmDelete.id));
      toast.success("Proyek dihapus sepenuhnya dari server.");
      setConfirmDelete(null);
    } catch {
      toast.error(t("umum.gagal"));
    }
  }

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Creator";
  const quotaPct = quota ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;
  const sisa = quota ? Math.max(0, quota.limit - quota.used) : null;

  const hitung = useMemo(() => {
    const h = { jalan: 0, selesai: 0, gagal: 0 };
    for (const p of projects) h[tahapOf(p)] += 1;
    return h;
  }, [projects]);

  const terlihat = useMemo(
    () => (filter === "semua" ? projects : projects.filter((p) => tahapOf(p) === filter)),
    [projects, filter],
  );

  const railFase: { id: Filter; label: string; ket: string }[] = [
    { id: "jalan", label: "Diproses AI", ket: "transkripsi → analisis → render" },
    { id: "selesai", label: "Siap dipakai", ket: "bisa diedit & diunduh" },
    { id: "gagal", label: "Perlu diulang", ket: "gagal di tengah" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <AppNav
        displayName={displayName}
        avatarUrl={profile?.avatar_url}
        isAdmin={account?.is_admin}
        plan={quota?.plan}
        onUpgrade={() => setPremiumOpen(true)}
        themeToggle
      />

      <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
        {/* ═══ BARIS PEMBUKA: sapaan + jam kuota — tipografi besar, tanpa kartu ═══ */}
        <header className="flex flex-col gap-6 border-b border-border pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              <Sparkles className="size-3.5" /> Studio
            </p>
            <h1 className="mt-2 font-display text-[30px] font-bold leading-[1.05] tracking-tight sm:text-[42px]">
              Meja kerja <span className="text-accent">{displayName}</span>
            </h1>
            <p className="mt-3 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
              Tempel link atau unggah video panjang — sisanya AI yang kerjakan di server.
            </p>
          </div>

          {/* Kuota sebagai "jam dinding studio": lingkaran progres SVG */}
          <div className="flex shrink-0 items-center gap-4 lg:flex-col lg:items-end lg:gap-2">
            <div className="relative grid size-[74px] place-items-center">
              <svg viewBox="0 0 74 74" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle cx="37" cy="37" r="33" fill="none" strokeWidth="5" className="stroke-border" />
                <circle
                  cx="37"
                  cy="37"
                  r="33"
                  fill="none"
                  strokeWidth="5"
                  strokeLinecap="round"
                  className="stroke-accent transition-[stroke-dashoffset] duration-700"
                  strokeDasharray={2 * Math.PI * 33}
                  strokeDashoffset={2 * Math.PI * 33 * (1 - quotaPct / 100)}
                />
              </svg>
              <span className="font-display text-[19px] font-bold leading-none">{sisa ?? "—"}</span>
            </div>
            <div className="text-left lg:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {quota?.plan === "premium" ? "Premium" : "Kuota harian"}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {quota ? `${quota.used}/${quota.limit} terpakai` : "memuat…"}
                {quota?.plan === "premium" ? (
                  <span className="ml-1.5 inline-flex items-center gap-1 font-semibold text-accent">
                    <Crown className="size-3" /> aktif
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </header>

        {/* ═══ DOCK "MULAI": SATU panel dua jalur — seperti mixing console ═══ */}
        <input
          ref={fileInput}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void createFromFile(f);
            e.target.value = "";
          }}
        />

        <section
          aria-label={t("dash.mulai_klip_baru")}
          className="mt-8 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-surface"
        >
          <div className="grid lg:grid-cols-[1fr_auto]">
            {/* jalur 1: YouTube */}
            <div className="px-5 py-5 sm:px-7 sm:py-6">
              <div className="flex items-center gap-2">
                <Youtube className="size-4 text-accent" />
                <h2 className="font-display text-[15px] font-bold tracking-tight">
                  {t("dash.mulai_klip_baru")}
                </h2>
              </div>
              <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row">
                <input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createFromYoutube();
                  }}
                  placeholder="https://youtu.be/…"
                  className="min-w-0 flex-1 rounded-full border border-border bg-background px-4.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-accent"
                />
                <Button
                  variant="accent"
                  disabled={creating}
                  onClick={() => void createFromYoutube()}
                  className="shrink-0 whitespace-nowrap rounded-full"
                >
                  {creating ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />}
                  {t("dash.proses")}
                </Button>
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
                {t("dash.video_di_server")}
              </p>
            </div>

            {/* jalur 2: unggah file — tombol besar bergaya kaset */}
            <button
              type="button"
              disabled={creating}
              onClick={() => fileInput.current?.click()}
              className="group flex items-center gap-3.5 border-t border-border px-5 py-4 text-left transition-colors hover:bg-surface/70 disabled:opacity-60 lg:border-l lg:border-t-0 lg:px-6"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-background text-accent transition-transform group-active:scale-95">
                {creating && uploadPct !== null ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Upload className="size-5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold tracking-tight">
                  {creating && uploadPct !== null ? `Mengunggah ${Math.round(uploadPct * 100)}%` : t("dash.unggah_perangkat")}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  {t("dash.format_file")}
                </span>
                {uploadPct !== null ? (
                  <span className="mt-2 block h-1.5 w-40 overflow-hidden rounded-full bg-border">
                    <span
                      className="block h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${Math.round(uploadPct * 100)}%` }}
                    />
                  </span>
                ) : null}
              </span>
              {uploadPct !== null ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    uploadRef.current?.abort();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") uploadRef.current?.abort();
                  }}
                  className="ml-auto shrink-0 text-[12px] font-medium text-muted-foreground underline decoration-border underline-offset-2"
                >
                  Batal
                </span>
              ) : null}
            </button>
          </div>
        </section>

        {/* ═══ RAIL FASE + FILM STRIP PROYEK ═══ */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[220px_1fr] lg:items-start">
          {/* RAIL: tombol fase vertikal — mobile jadi chips horizontal */}
          <nav aria-label="Filter tahap" className="lg:sticky lg:top-6">
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              <li>
                <FaseTab
                  aktif={filter === "semua"}
                  label="Semua"
                  nilai={projects.length}
                  onClick={() => setFilter("semua")}
                />
              </li>
              {railFase.map((f) => (
                <li key={f.id}>
                  <FaseTab
                    aktif={filter === f.id}
                    label={f.label}
                    ket={f.ket}
                    nilai={hitung[f.id as Tahap]}
                    ikon={FASE_IKON[f.id as Tahap]}
                    jalan={f.id === "jalan"}
                    gagal={f.id === "gagal"}
                    onClick={() => setFilter(filter === f.id ? "semua" : f.id)}
                  />
                </li>
              ))}
            </ul>
          </nav>

          {/* STRIP: baris kartu scroll horizontal ala gulungan film */}
          <section aria-label="Proyek kamu" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                {t("dash.proyek_terbaru")}
              </h2>
              <span className="shrink-0 text-[13px] text-muted-foreground">
                {filter === "semua" ? (
                  `${projects.length} total`
                ) : (
                  <>
                    {terlihat.length} dari {projects.length} ·{" "}
                    <button
                      type="button"
                      onClick={() => setFilter("semua")}
                      className="font-semibold text-accent underline-offset-2 hover:underline"
                    >
                      reset
                    </button>
                  </>
                )}
              </span>
            </div>

            {loading ? (
              /* SKELETON berbentuk strip — meniru struktur akhir */
              <ul className="mt-5 flex snap-x gap-4 overflow-x-auto pb-4" aria-busy="true">
                {[0, 1, 2, 3, 4].map((k) => (
                  <li
                    key={k}
                    className="w-[248px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card"
                  >
                    <div className="relative h-[140px] bg-surface">
                      <span className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-xl bg-border" />
                      <span className="absolute inset-x-0 bottom-0 h-1 animate-pulse bg-border" />
                    </div>
                    <div className="space-y-2.5 px-3.5 py-3.5">
                      <span className="block h-4 w-4/5 animate-pulse rounded bg-border" />
                      <span className="block h-3 w-2/5 animate-pulse rounded bg-border" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : terlihat.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-border px-6 py-16 text-center">
                <Clapperboard className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-4 font-display text-base font-bold">
                  {projects.length === 0 ? t("dash.belum_ada_proyek") : t("dash.tidak_ada_di_tahap")}
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {projects.length === 0 ? t("dash.panduan_pertama") : t("dash.coba_tahap_lain")}
                </p>
                <Button
                  variant={projects.length === 0 ? "accent" : "outline"}
                  className="mt-6 rounded-full whitespace-nowrap"
                  onClick={() =>
                    projects.length === 0 ? fileInput.current?.click() : setFilter("semua")
                  }
                >
                  {projects.length === 0 ? t("dash.buat_baru") : t("dash.lihat_semua")}
                </Button>
              </div>
            ) : (
              <ul className="mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
                {terlihat.map((p, i) => {
                  const st = statusOf(p);
                  const fase = tahapOf(p);
                  const Ikon = FASE_IKON[fase];
                  return (
                    <motion.li
                      key={p.id}
                      initial={{ opacity: 0, x: 28, rotate: 1.5 }}
                      animate={{ opacity: 1, x: 0, rotate: 0 }}
                      transition={{ duration: 0.45, delay: Math.min(i * 0.06, 0.5), ease: [0.16, 1, 0.3, 1] }}
                      className="group relative w-[248px] shrink-0 snap-start"
                    >
                      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl hover:shadow-black/10 active:translate-y-0">
                        {/* Poster 16:9 dengan pola sprocket film */}
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: p.id }}
                          className="block"
                          aria-label={`Buka ${p.title}`}
                        >
                          <span className="relative flex h-[140px] items-center justify-center overflow-hidden bg-surface">
                            {/* lubang sprocket di atas & bawah — motif film */}
                            <span aria-hidden className="absolute inset-x-0 top-0 flex h-3 justify-around">
                              {Array.from({ length: 9 }).map((_, k) => (
                                <span key={k} className="mt-1 size-1.5 rounded-[2px] bg-border" />
                              ))}
                            </span>
                            <span aria-hidden className="absolute inset-x-0 bottom-0 flex h-3 justify-around">
                              {Array.from({ length: 9 }).map((_, k) => (
                                <span key={k} className="mb-1 size-1.5 rounded-[2px] bg-border" />
                              ))}
                            </span>
                            <span className="grid size-12 place-items-center rounded-2xl border border-border bg-background text-accent transition-transform duration-300 group-hover:scale-110">
                              {p.source_type === "youtube" ? (
                                <Youtube className="size-5" />
                              ) : (
                                <Clapperboard className="size-5" />
                              )}
                            </span>
                            {/* band status bawah poster */}
                            <span
                              aria-hidden
                              className={`absolute inset-x-0 bottom-0 h-1 ${
                                fase === "selesai"
                                  ? "bg-emerald-500/80"
                                  : fase === "gagal"
                                    ? "bg-destructive/80"
                                    : "animate-pulse bg-accent"
                              }`}
                            />
                          </span>
                        </Link>

                        {/* badan kartu */}
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: p.id }}
                          className="flex min-w-0 flex-1 flex-col px-3.5 py-3.5"
                        >
                          <span
                            className="line-clamp-2 font-display text-[14.5px] font-bold leading-snug tracking-tight"
                            title={p.title}
                          >
                            {p.title}
                          </span>
                          <span className="mt-2 flex items-center gap-1.5 text-[12px]">
                            <Ikon
                              className={`size-3.5 shrink-0 ${
                                fase === "gagal" ? "text-destructive" : fase === "selesai" ? "text-accent" : "text-muted-foreground"
                              } ${fase === "jalan" ? "animate-spin" : ""}`}
                            />
                            <span className={`truncate font-medium ${st.tone}`}>{st.label}</span>
                          </span>
                          <span className="mt-1 text-[11.5px] text-muted-foreground">
                            {timeAgo(p.created_at)}
                          </span>
                        </Link>

                        <button
                          type="button"
                          onClick={(e) => {
                            if (menuFor === p.id) {
                              setMenuFor(null);
                              return;
                            }
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuAnchor({ top: r.bottom + 6, right: window.innerWidth - r.right });
                            setMenuFor(p.id);
                          }}
                          className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-lg border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:bg-surface hover:text-foreground"
                          aria-label={`Menu untuk ${p.title}`}
                          aria-expanded={menuFor === p.id}
                        >
                          <MoreVertical className="size-4" />
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <p className="mt-14 max-w-prose border-t border-border pt-6 text-[13px] leading-relaxed text-muted-foreground">
          Semua pemrosesan berjalan di server — kamu boleh menutup halaman ini dan pekerjaannya
          tetap lanjut. Hasilnya menunggu di{" "}
          <Link to="/unduh" className="font-semibold text-accent underline-offset-2 hover:underline">
            halaman unduhan
          </Link>
          .
        </p>
      </main>

      {/* ===== Menu titik-tiga (portal ke <body>) ===== */}
      {typeof document !== "undefined" && menuFor && menuAnchor
        ? createPortal(
            <AnimatePresence>
              <>
                <button
                  aria-label="Tutup menu"
                  className="fixed inset-0 z-[9998] cursor-default"
                  onClick={() => {
                    setMenuFor(null);
                    setMenuAnchor(null);
                  }}
                />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  role="menu"
                  style={{
                    position: "fixed",
                    top: Math.min(menuAnchor.top, window.innerHeight - 160),
                    right: Math.max(8, menuAnchor.right),
                  }}
                  className="z-[9999] w-52 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
                >
                  {(() => {
                    const p = projects.find((x) => x.id === menuFor);
                    if (!p) return null;
                    const tutup = () => {
                      setMenuFor(null);
                      setMenuAnchor(null);
                    };
                    const items = [
                      {
                        label: sharing ? "Membuat link…" : "Bagikan proyek",
                        icon: Share2,
                        fn: () => void handleShare(p),
                        disabled: sharing,
                        danger: false,
                      },
                      {
                        label: "Ubah nama",
                        icon: Pencil,
                        fn: () => {
                          setRenameTarget(p);
                          setRenameValue(p.title);
                          tutup();
                        },
                        disabled: false,
                        danger: false,
                      },
                      {
                        label: "Hapus proyek",
                        icon: Trash2,
                        fn: () => {
                          setConfirmDelete(p);
                          tutup();
                        },
                        disabled: false,
                        danger: true,
                      },
                    ];
                    return items.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={item.fn}
                        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] transition-colors disabled:opacity-50 ${
                          item.danger
                            ? "text-destructive hover:bg-destructive/8"
                            : "hover:bg-surface"
                        }`}
                      >
                        <item.icon className="size-4" /> {item.label}
                      </button>
                    ));
                  })()}
                </motion.div>
              </>
            </AnimatePresence>,
            document.body,
          )
        : null}

      {/* ===== Dialog: link share ===== */}
      <Modal open={!!sharedLink} onClose={() => setSharedLink(null)} title="Link berbagi dibuat">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Berlaku 1 minggu. Siapa pun yang membuka link ini bisa menyalin proyek ke akunnya.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            readOnly
            value={sharedLink ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[12px] outline-none"
          />
          <Button
            variant="accent"
            onClick={() =>
              void copyText(sharedLink ?? "").then((ok) =>
                toast[ok ? "success" : "error"](ok ? "Tersalin!" : "Salin manual dari kotak."),
              )
            }
          >
            Salin
          </Button>
        </div>
      </Modal>

      {/* ===== Dialog: hapus ===== */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t("umum.hapus")}
        tone="danger"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Proyek <span className="font-medium text-foreground">{confirmDelete?.title}</span> akan
          dihapus sepenuhnya dari server: semua klip, video sumber, dan cache. Tindakan ini tidak
          bisa dibatalkan.
        </p>
        <div className="mt-6 flex gap-2.5">
          <Button variant="outline" className="flex-1 rounded-full" onClick={() => setConfirmDelete(null)}>
            Batalkan
          </Button>
          <Button variant="destructive" className="flex-1 rounded-full" onClick={() => void handleDelete()}>
            Hapus permanen
          </Button>
        </div>
      </Modal>

      {/* ===== Dialog: ubah nama ===== */}
      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title={t("umum.ubah")}>
        <input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRename();
          }}
          autoFocus
          placeholder="Judul proyek"
          className="w-full rounded-full border border-border bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent"
        />
        <div className="mt-5 flex gap-2.5">
          <Button variant="outline" className="flex-1 rounded-full" onClick={() => setRenameTarget(null)}>
            Batalkan
          </Button>
          <Button variant="accent" className="flex-1 rounded-full" onClick={() => void handleRename()}>
            Simpan
          </Button>
        </div>
      </Modal>

      <PremiumDialog
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
        onUpgraded={() => {
          fetchQuota().catch(() => {});
          void reloadAccount();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------- komponen lokal (baru) */

function FaseTab({
  aktif,
  label,
  ket,
  nilai,
  ikon: Ikon,
  jalan,
  gagal,
  onClick,
}: {
  aktif: boolean;
  label: string;
  ket?: string;
  nilai: number;
  ikon?: typeof Loader2;
  jalan?: boolean;
  gagal?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={aktif}
      onClick={onClick}
      className={`flex w-full shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all lg:rounded-2xl ${
        aktif
          ? "border-accent/60 bg-accent/10 shadow-sm"
          : "border-border bg-card hover:border-accent/30 hover:bg-surface/60"
      }`}
    >
      {Ikon ? (
        <Ikon
          className={`size-4 shrink-0 ${gagal ? "text-destructive" : aktif ? "text-accent" : "text-muted-foreground"} ${jalan && nilai > 0 ? "animate-spin" : ""}`}
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13px] font-semibold tracking-tight ${aktif ? "text-foreground" : ""}`}>
          {label}
        </span>
        {ket ? <span className="mt-0.5 hidden truncate text-[11px] text-muted-foreground lg:block">{ket}</span> : null}
      </span>
      <span
        className={`stat-figure shrink-0 text-[20px] leading-none ${aktif ? "text-accent" : "text-muted-foreground"}`}
      >
        {nilai}
      </span>
    </button>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
  tone,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center px-4">
          <motion.button
            aria-label="Tutup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-foreground/25 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md rounded-3xl border border-border bg-background p-6 shadow-lg"
          >
            <h3
              className={`font-display text-lg font-bold tracking-tight ${tone === "danger" ? "text-destructive" : ""}`}
            >
              {title}
            </h3>
            <div className="mt-3">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
