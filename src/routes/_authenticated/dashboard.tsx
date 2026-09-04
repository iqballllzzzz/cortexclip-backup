import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Crown,
  Download,
  FileVideo,
  Film,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Youtube,
} from "lucide-react";

import { PremiumDialog } from "@/components/premium-dialog";
import { AppNav } from "@/components/app-nav";
import { PageLoading } from "@/components/page-loading";
import { supabase } from "@/integrations/supabase/client";
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

/* ------------------------------------------------------------------- page */

function Dashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { status: account, reload: reloadAccount } = useAccountStatus();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharing, setSharing] = useState(false);
  const [sharedLink, setSharedLink] = useState<string | null>(null);
  const [premiumOpen, setPremiumOpen] = useState(false);
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
      toast.success("Nama proyek diubah.");
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
      toast.error("Gagal menghapus proyek");
    }
  }

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Creator";
  const doneCount = projects.filter((p) => p.status === "completed").length;
  const activeCount = projects.filter(
    (p) => p.status !== "completed" && p.status !== "failed",
  ).length;
  const quotaPct = quota ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;

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

      <main className="mx-auto max-w-[1180px] px-4 pb-28 pt-9 sm:px-6 sm:pt-12">
        {/* ==== Kepala: kiri berat (sapaan + tindakan), kanan ringan (meteran) ==== */}
        <div className="grid gap-8 lg:grid-cols-[1.45fr_1fr] lg:gap-12">
          <section className="reveal" style={{ ["--i" as string]: 0 }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Ruang kerja
            </p>
            <h1 className="mt-3 font-display text-[30px] leading-[1.04] font-bold tracking-tight sm:text-[46px]">
              Selamat datang,
              <br />
              <span className="text-accent">{displayName}</span>.
            </h1>
            <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
              Tempel satu link YouTube atau unggah video panjang. Sisanya kami kerjakan: transkripsi,
              pemilihan momen, subtitle karaoke, framing wajah, sampai file siap unggah.
            </p>
          </section>

          {/* meteran kuota — tinggi tak sama dengan kolom kiri (asimetri disengaja) */}
          <aside
            className="reveal self-end panel px-5 py-5"
            style={{ ["--i" as string]: 1 }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {quota?.plan === "premium" ? "Paket Premium" : "Paket Gratis"}
              </p>
              {quota?.plan === "premium" ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent">
                  <Crown className="size-3" /> aktif
                </span>
              ) : null}
            </div>

            <p className="stat-figure mt-4 text-[40px]">
              {quota ? quota.limit - quota.used : "—"}
              <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-muted-foreground">
                video tersisa hari ini
              </span>
            </p>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${quotaPct}%` }}
              />
            </div>
            <p className="mt-2.5 text-[12px] text-muted-foreground">
              {quota
                ? `${quota.used} dari ${quota.limit} terpakai · maks ${quota.clips_per_video} klip per video`
                : "Memuat kuota…"}
            </p>

            {quota?.plan !== "premium" ? (
              <Button variant="accent" className="mt-5 w-full" onClick={() => setPremiumOpen(true)}>
                <Crown className="size-4" /> Upgrade ke Premium
              </Button>
            ) : (
              <Button variant="outline" className="mt-5 w-full" onClick={() => setPremiumOpen(true)}>
                <Crown className="size-4" /> Perpanjang Premium
              </Button>
            )}

            {/* Jalan pintas ke Unduhan: sebelumnya hanya lewat menu hamburger,
                padahal ini tujuan yang paling sering dicari setelah render. */}
            <Button variant="outline" className="mt-2.5 w-full" asChild>
              <Link to="/unduh">
                <Download className="size-4" /> Unduhan
              </Link>
            </Button>
          </aside>
        </div>

        {/* ==== Dua jalur mulai: kolom tidak sama lebar ==== */}
        <section
          className="reveal mt-12 grid gap-3 lg:grid-cols-[1.15fr_1fr]"
          style={{ ["--i" as string]: 2 }}
        >
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

          {/* jalur 1: link YouTube (utama) */}
          <div className="panel flex flex-col justify-between px-5 py-5 sm:px-6 sm:py-6">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Youtube className="size-3.5 text-accent" /> Dari link
              </p>
              <h2 className="mt-3 font-display text-lg font-bold tracking-tight">
                Tempel URL YouTube
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Video diunduh di server kami — koneksi kamu tidak dipakai.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 transition-colors focus-within:border-accent">
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
                className="shrink-0"
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />}
                Proses
              </Button>
            </div>
          </div>

          {/* jalur 2: unggah file */}
          <button
            type="button"
            disabled={creating}
            onClick={() => fileInput.current?.click()}
            className="panel group px-5 py-5 text-left transition-colors hover:border-accent/45 disabled:opacity-60 sm:px-6 sm:py-6"
          >
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Upload className="size-3.5 text-accent" /> Dari perangkat
            </p>
            <h2 className="mt-3 font-display text-lg font-bold tracking-tight">Unggah video</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              MP4, MOV, MKV, atau audio. Progres unggahan tampil di sini.
            </p>
            <span className="mt-5 inline-flex items-center gap-2.5 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-semibold transition-colors group-hover:border-accent/60">
              {creating && uploadPct !== null ? (
                <Loader2 className="size-4 animate-spin text-accent" />
              ) : (
                <FileVideo className="size-4 text-accent" />
              )}
              {creating && uploadPct !== null
                ? `Mengunggah ${Math.round(uploadPct * 100)}%`
                : "Pilih file"}
            </span>

            {uploadPct !== null ? (
              <span className="mt-4 block">
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${Math.round(uploadPct * 100)}%` }}
                  />
                </span>
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
                  className="mt-2 inline-block text-[12px] font-medium text-muted-foreground underline decoration-border underline-offset-2"
                >
                  Batalkan unggahan
                </span>
              </span>
            ) : null}
          </button>
        </section>

        {/* ==== Angka ringkas: satu baris, bukan tiga kartu seragam ==== */}
        <section
          className="reveal mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border sm:grid-cols-4"
          style={{ ["--i" as string]: 3 }}
        >
          {[
            { label: "Total proyek", value: projects.length, icon: Film },
            { label: "Sedang diproses", value: activeCount, icon: Clock },
            { label: "Selesai", value: doneCount, icon: CheckCircle2 },
            {
              label: "Klip siap unduh",
              value: doneCount,
              icon: Download,
              href: "/unduh" as const,
            },
          ].map((s) => (
            <div key={s.label} className="bg-card px-4 py-4 sm:px-5 sm:py-5">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <s.icon className="size-3 text-accent" /> {s.label}
              </p>
              <p className="stat-figure mt-2.5 text-[28px]">{s.value}</p>
              {s.href ? (
                <Link
                  to={s.href}
                  className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-accent transition-opacity hover:opacity-70"
                >
                  Riwayat unduhan
                </Link>
              ) : null}
            </div>
          ))}
        </section>

        {/* ==== Daftar proyek: baris hairline, bukan grid kartu ==== */}
        <section className="reveal mt-14" style={{ ["--i" as string]: 4 }}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              Proyek kamu
            </h2>
            <span className="text-[13px] text-muted-foreground">{projects.length} total</span>
          </div>

          {loading ? (
            <PageLoading label="Memuat proyek" />
          ) : projects.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
              <Sparkles className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-4 font-display text-base font-bold">Belum ada proyek</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Tempel link YouTube di atas, atau unggah video dari perangkat untuk membuat klip
                pertama kamu.
              </p>
              <Button variant="accent" className="mt-6" onClick={() => fileInput.current?.click()}>
                <Plus className="size-4" /> Buat proyek pertama
              </Button>
            </div>
          ) : (
            <ul className="mt-6 overflow-hidden rounded-2xl border border-border">
              {projects.map((p, i) => {
                const st = statusOf(p);
                const busy = !["completed", "failed"].includes(String(p.status));
                return (
                  <li
                    key={p.id}
                    className="reveal relative border-b border-border last:border-0"
                    style={{ ["--i" as string]: Math.min(8, 5 + i) }}
                  >
                    <div className="group flex items-center gap-3 bg-card transition-colors hover:bg-surface/60 sm:gap-4">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: p.id }}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-accent">
                          {p.source_type === "youtube" ? (
                            <Youtube className="size-4" />
                          ) : (
                            <Film className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-[15px] font-semibold tracking-tight"
                            title={p.title}
                          >
                            {p.title}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                            <span className={`font-medium ${st.tone}`}>
                              {busy ? (
                                <Loader2 className="mr-1 inline size-3 animate-spin align-[-1px]" />
                              ) : null}
                              {st.label}
                            </span>
                            <span className="opacity-40">·</span>
                            <span>{p.source_type === "youtube" ? "YouTube" : "Unggahan"}</span>
                            <span className="opacity-40">·</span>
                            <span>{timeAgo(p.created_at)}</span>
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                        className="mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground sm:mr-3"
                        aria-label={`Menu untuk ${p.title}`}
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </div>

                    <AnimatePresence>
                      {menuFor === p.id ? (
                        <>
                          <button
                            aria-label="Tutup menu"
                            className="fixed inset-0 z-[var(--z-dropdown)] cursor-default"
                            onClick={() => setMenuFor(null)}
                          />
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute right-3 top-[58px] z-[calc(var(--z-dropdown)+1)] w-52 overflow-hidden rounded-xl border border-border bg-popover shadow-md"
                          >
                            {[
                              {
                                label: sharing ? "Membuat link…" : "Bagikan proyek",
                                icon: Share2,
                                fn: () => void handleShare(p),
                                disabled: sharing,
                              },
                              {
                                label: "Ubah nama",
                                icon: Pencil,
                                fn: () => {
                                  setRenameTarget(p);
                                  setRenameValue(p.title);
                                  setMenuFor(null);
                                },
                              },
                              {
                                label: "Hapus proyek",
                                icon: Trash2,
                                fn: () => {
                                  setConfirmDelete(p);
                                  setMenuFor(null);
                                },
                                danger: true,
                              },
                            ].map((item) => (
                              <button
                                key={item.label}
                                type="button"
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
                            ))}
                          </motion.div>
                        </>
                      ) : null}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="mt-12 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
          Render berjalan di server — kamu boleh menutup halaman ini. Hasilnya menunggu di{" "}
          <Link to="/unduh" className="font-semibold text-accent underline-offset-2 hover:underline">
            halaman unduhan
          </Link>
          .
        </p>
      </main>

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
        title="Hapus proyek ini?"
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
      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Ubah nama proyek">
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
