import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowUpRight,
  CheckCircle2,
  Crown,
  Download,
  FileVideo,
  Film,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Share2,
  Trash2,
  TriangleAlert,
  Upload,
  Youtube,
} from "lucide-react";

import { PremiumDialog } from "@/components/premium-dialog";
import { AppNav } from "@/components/app-nav";
import { PageLoading } from "@/components/page-loading";
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

/* ------------------------------------------------------------------ utils */

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
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

/** Tahap pipeline tempat sebuah proyek berada saat ini. */
type Tahap = "jalan" | "selesai" | "gagal";

function tahapOf(p: Project): Tahap {
  const s = String(p.status);
  if (s === "completed") return "selesai";
  if (s === "failed") return "gagal";
  return "jalan";
}

type Filter = "semua" | Tahap;

/* ------------------------------------------------------------------- page */

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
  // Posisi menu titik-tiga dalam koordinat VIEWPORT. Menunya dirender lewat
  // portal ke <body>, jadi tidak bisa lagi terpotong `overflow-hidden` pada
  // <ul> daftar proyek atau tertimpa kartu proyek berikutnya (baris lain punya
  // stacking context sendiri karena animasi .reveal memakai transform).
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

  /* Rel pipeline: tahap NYATA yang dilalui setiap proyek. Angkanya dihitung
     dari data, bukan ditulis tangan — tidak ada metrik yang dikarang. */
  const rel = [
    {
      id: "jalan" as const,
      urut: "01",
      nama: "Sedang diproses",
      nilai: hitung.jalan,
      ket: "transkripsi → analisis → render",
      ikon: Loader2,
      putar: hitung.jalan > 0,
    },
    {
      id: "selesai" as const,
      urut: "02",
      nama: "Siap dipakai",
      nilai: hitung.selesai,
      ket: "klip sudah bisa diedit & diunduh",
      ikon: CheckCircle2,
      putar: false,
    },
    {
      id: "gagal" as const,
      urut: "03",
      nama: "Perlu diulang",
      nilai: hitung.gagal,
      ket: "gagal di tengah jalan",
      ikon: TriangleAlert,
      putar: false,
    },
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

      <main className="mx-auto max-w-[1180px] px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
        {/* ═══ KEPALA: satu band hairline. Sapaan kiri, kuota kanan — tidak ada
             kartu besar, tidak ada hero setinggi layar. ═══ */}
        <section
          className="reveal border-b border-border pb-7"
          style={{ ["--i" as string]: 0 }}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-[27px] font-bold leading-[1.08] tracking-tight sm:text-[38px]">
                Halo, <span className="text-accent">{displayName}</span>
              </h1>
              <p className="mt-2.5 max-w-[46ch] text-[14px] leading-relaxed text-muted-foreground">
                Tempel satu link atau unggah video panjang. Transkripsi, pemilihan momen,
                subtitle karaoke, dan framing wajah dikerjakan di server.
              </p>
            </div>

            {/* Meteran kuota: angka besar + bar, tanpa panel — menempel pada band */}
            <div className="w-full shrink-0 sm:w-[248px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {quota?.plan === "premium" ? "Premium" : "Paket gratis"}
                </span>
                {quota?.plan === "premium" ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-accent">
                    <Crown className="size-3" /> aktif
                  </span>
                ) : null}
              </div>
              <p className="stat-figure mt-2 text-[34px] leading-none">
                {sisa ?? "—"}
                <span className="ml-2 font-sans text-[13px] font-medium tracking-normal text-muted-foreground">
                  video tersisa hari ini
                </span>
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">
                {quota
                  ? `${quota.used}/${quota.limit} terpakai · maks ${quota.clips_per_video} klip per video`
                  : "Memuat kuota…"}
              </p>
            </div>
          </div>

          {/* Tiga tindakan sejajar, lebar tidak sama — Premium paling berat */}
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button
              variant={quota?.plan === "premium" ? "outline" : "accent"}
              onClick={() => setPremiumOpen(true)}
              className="whitespace-nowrap"
            >
              <Crown className="size-4" />
              {quota?.plan === "premium" ? "Perpanjang Premium" : "Beli Premium"}
            </Button>
            <Button variant="outline" asChild className="whitespace-nowrap">
              <Link to="/unduh">
                <Download className="size-4" /> Unduhan
              </Link>
            </Button>
          </div>
        </section>

        {/* ═══ MULAI: satu panel, dua jalur bertumpuk (link dominan, unggah
             sekunder) — bukan dua kartu kembar bersebelahan. ═══ */}
        <section className="reveal mt-10" style={{ ["--i" as string]: 1 }}>
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

          <div className="panel overflow-hidden">
            {/* jalur utama: link YouTube */}
            <div className="px-5 py-5 sm:px-7 sm:py-6">
              <h2 className="font-display text-lg font-bold tracking-tight">Mulai klip baru</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Video diunduh di server kami — koneksi kamu tidak dipakai.
              </p>
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 transition-colors focus-within:border-accent">
                  <Youtube className="size-4 shrink-0 text-accent" />
                  <span className="sr-only">Link YouTube</span>
                  <input
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void createFromYoutube();
                    }}
                    placeholder="https://youtu.be/…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </label>
                <Button
                  variant="accent"
                  disabled={creating}
                  onClick={() => void createFromYoutube()}
                  className="shrink-0 whitespace-nowrap"
                >
                  {creating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUpRight className="size-4" />
                  )}
                  Proses
                </Button>
              </div>
            </div>

            {/* jalur sekunder: unggah file — baris di dalam panel yang sama */}
            <button
              type="button"
              disabled={creating}
              onClick={() => fileInput.current?.click()}
              className="flex w-full items-center gap-3.5 border-t border-border bg-surface/40 px-5 py-4 text-left transition-colors hover:bg-surface/70 disabled:opacity-60 sm:px-7"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-accent">
                {creating && uploadPct !== null ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold tracking-tight">
                  {creating && uploadPct !== null
                    ? `Mengunggah ${Math.round(uploadPct * 100)}%`
                    : "Atau unggah dari perangkat"}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                  MP4, MOV, MKV, atau audio
                </span>
                {uploadPct !== null ? (
                  <span className="mt-2.5 block h-1.5 w-full overflow-hidden rounded-full bg-border">
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
                  className="shrink-0 whitespace-nowrap text-[12px] font-medium text-muted-foreground underline decoration-border underline-offset-2"
                >
                  Batalkan
                </span>
              ) : (
                <FileVideo className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          </div>
        </section>

        {/* ═══ REL PIPELINE: tahap nyata, angkanya dari data. Menekan satu tahap
             menyaring daftar di bawah — jadi angka ini bukan hiasan. ═══ */}
        <section className="reveal mt-10" style={{ ["--i" as string]: 2 }}>
          <div className="grid gap-px overflow-hidden rounded-2xl bg-border sm:grid-cols-3">
            {rel.map((t) => {
              const aktif = filter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={aktif}
                  onClick={() => setFilter(aktif ? "semua" : t.id)}
                  className={`bg-card px-4 py-4 text-left transition-colors hover:bg-surface/60 sm:px-5 sm:py-5 ${
                    aktif ? "bg-surface" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <t.ikon
                      className={`size-3.5 shrink-0 ${
                        t.id === "gagal" ? "text-destructive" : "text-accent"
                      } ${t.putar ? "animate-spin" : ""}`}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t.nama}
                    </span>
                  </span>
                  <span className="stat-figure mt-2.5 block text-[27px] leading-none">
                    {t.nilai}
                  </span>
                  <span className="mt-1.5 block text-[12px] leading-snug text-muted-foreground">
                    {t.ket}
                  </span>
                  <span
                    className={`mt-2.5 block h-0.5 rounded-full transition-all ${
                      aktif ? "w-10 bg-accent" : "w-0 bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* ═══ DAFTAR PROYEK ═══ */}
        <section className="reveal mt-12" style={{ ["--i" as string]: 3 }}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              Proyek kamu
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {filter === "semua" ? (
                `${projects.length} total`
              ) : (
                <>
                  {terlihat.length} ditampilkan ·{" "}
                  <button
                    type="button"
                    onClick={() => setFilter("semua")}
                    className="font-semibold text-accent underline-offset-2 hover:underline"
                  >
                    tampilkan semua
                  </button>
                </>
              )}
            </span>
          </div>

          {loading ? (
            /* SKELETON SHIMMER ala OpusClip: enam kartu berdenyut mengikuti
               grid akhir — bukan spinner. Struktur terlihat sejak awal. */
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label={t("umum.memuat")}>
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <li key={k} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <span className="block h-1 w-full animate-pulse bg-border" />
                  <div className="space-y-3 px-4 py-4">
                    <span className="block h-4 w-3/4 animate-pulse rounded bg-border" />
                    <span className="block h-3 w-1/2 animate-pulse rounded bg-border" style={{ animationDelay: "120ms" }} />
                    <span className="block h-3 w-2/5 animate-pulse rounded bg-border" style={{ animationDelay: "240ms" }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : terlihat.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <p className="font-display text-base font-bold">
                {projects.length === 0 ? t("dash.belum_ada_proyek") : t("dash.belum_ada_proyek")}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {projects.length === 0
                  ? "Tempel link YouTube di atas, atau unggah video dari perangkat untuk membuat klip pertama kamu."
                  : "Coba tahap lain, atau tampilkan semua proyek."}
              </p>
              <Button
                variant={projects.length === 0 ? "accent" : "outline"}
                className="mt-6 whitespace-nowrap"
                onClick={() =>
                  projects.length === 0 ? fileInput.current?.click() : setFilter("semua")
                }
              >
                {projects.length === 0 ? t("dash.buat_baru") : t("dash.lihat_semua")}
              </Button>
            </div>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {terlihat.map((p, i) => {
                const st = statusOf(p);
                const busy = tahapOf(p) === "jalan";
                return (
                  <li
                    key={p.id}
                    className="reveal"
                    style={{ ["--i" as string]: Math.min(8, i) }}
                  >
                    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-black/5">
                      {/* BAND STATUS ATAS: warna mengikuti tahap — hijau selesai,
                          amber berjalan, merah gagal, netral lainnya */}
                      <span
                        aria-hidden
                        className={`h-1 w-full ${
                          tahapOf(p) === "selesai"
                            ? "bg-emerald-500/80"
                            : tahapOf(p) === "gagal"
                              ? "bg-destructive/80"
                              : busy
                                ? "animate-pulse bg-accent"
                                : "bg-border"
                        }`}
                      />
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: p.id }}
                        className="flex min-w-0 flex-1 flex-col px-4 py-4"
                      >
                        <span
                          className="block truncate font-display text-[15px] font-bold tracking-tight"
                          title={p.title}
                        >
                          {p.title}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                          <span className={`inline-flex items-center gap-1 font-medium ${st.tone}`}>
                            {busy ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : null}
                            {st.label}
                          </span>
                          <span className="opacity-40">·</span>
                          <span>{p.source_type === "youtube" ? "YouTube" : "Unggahan"}</span>
                        </span>
                        <span className="mt-auto flex items-center justify-between pt-4 text-[12px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {p.source_type === "youtube" ? (
                              <Youtube className="size-3.5" />
                            ) : (
                              <Film className="size-3.5" />
                            )}
                            {timeAgo(p.created_at)}
                          </span>
                          {busy ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                              proses
                            </span>
                          ) : (
                            <ArrowUpRight className="size-4 text-muted-foreground/50 transition-colors group-hover:text-accent" />
                          )}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          if (menuFor === p.id) {
                            setMenuFor(null);
                            return;
                          }
                          // Posisi menu dihitung dari tombolnya lalu menu
                          // dirender lewat PORTAL ke <body> (lihat di bawah).
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenuAnchor({ top: r.bottom + 6, right: window.innerWidth - r.right });
                          setMenuFor(p.id);
                        }}
                        className="absolute right-2 top-3 grid size-8 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={`Menu untuk ${p.title}`}
                        aria-expanded={menuFor === p.id}
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ═══ PENUTUP: satu paragraf, bukan footer empat kolom ═══ */}
        <p className="mt-12 max-w-prose border-t border-border pt-6 text-[13px] leading-relaxed text-muted-foreground">
          Semua pemrosesan berjalan di server — kamu boleh menutup halaman ini dan pekerjaannya
          tetap lanjut. Hasilnya menunggu di{" "}
          <Link to="/unduh" className="font-semibold text-accent underline-offset-2 hover:underline">
            halaman unduhan
          </Link>
          .
        </p>
      </main>

      {/* ===== Menu titik-tiga (PORTAL ke <body>) =====
           Dulu menu ini anak dari <li>, yang ada di dalam
           <ul class="overflow-hidden rounded-2xl">. Dua akibatnya persis
           seperti keluhan pengguna "tak terlihat kayak terpotong atau kena
           timpa sama project lain":
             1. overflow-hidden pada <ul> MEMOTONG menu baris terakhir;
             2. tiap <li> memakai animasi .reveal (transform), dan transform
                membuat stacking context baru — z-index menu tidak bisa
                mengalahkan baris <li> setelahnya, jadi menu tertimpa.
           Portal ke <body> + koordinat viewport (menuAnchor) menghilangkan
           kedua sebab itu sekaligus. */}
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
          <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>
            Batalkan
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => void handleDelete()}>
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
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent"
        />
        <div className="mt-5 flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={() => setRenameTarget(null)}>
            Batalkan
          </Button>
          <Button variant="accent" className="flex-1" onClick={() => void handleRename()}>
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

/* --------------------------------------------------------------- komponen */

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
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-lg"
          >
            <h3
              className={`font-display text-lg font-bold tracking-tight ${
                tone === "danger" ? "text-destructive" : ""
              }`}
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
