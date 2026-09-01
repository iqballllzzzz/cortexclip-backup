import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Film,
  LogOut,
  Plus,
  Sparkles,
  Clock,
  Upload,
  Link2,
  Loader2,
  ArrowUpRight,
  Video,
  CheckCircle2,
  Wand2,
  Download,
  ArrowRight,
  FolderOpen,
  Youtube,
  FileVideo,
  MoreVertical,
  Share2,
  Pencil,
  Trash2,
  Crown,
} from "lucide-react";

import { PremiumDialog } from "@/components/premium-dialog";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { shareProject, renameProject, deleteProject, processYoutube } from "@/lib/project-api";
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

/* ---------- util ---------- */
function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function projectMeta(p: Project) {
  const status = p.status as string;
  const map: Record<string, { label: string; dot: string; icon: typeof Clock }> = {
    completed: { label: "Selesai", dot: "bg-emerald-500", icon: CheckCircle2 },
    processing: { label: "Memproses", dot: "bg-amber-500", icon: Clock },
    uploading: { label: "Mengunggah", dot: "bg-amber-500", icon: Upload },
    failed: { label: "Gagal", dot: "bg-red-500", icon: Clock },
  };
  return map[status] ?? { label: status, dot: "bg-neutral-400", icon: Clock };
}

function Dashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  // menu konteks per project (titik tiga)
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharing, setSharing] = useState(false);
  const [sharedLink, setSharedLink] = useState<string | null>(null);
  // premium
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [quota, setQuota] = useState<{ plan: string; used: number; limit: number; clips_per_video: number } | null>(null);

  async function copyText(text: string): Promise<boolean> {
    // navigator.clipboard butuh HTTPS — di HTTP (IP:8080) pakai fallback
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
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<XMLHttpRequest | null>(null);

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

  async function fetchQuota(): Promise<{ ok: boolean; plan: string; used: number; limit: number; clips_per_video: number; message: string | null }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/quota", {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (!res.ok) throw new Error("Gagal cek kuota");
    const d = await res.json();
    setQuota(d);
    return d;
  }

  useEffect(() => {
    fetchQuota().catch(() => {});
  }, []);

  async function createFromFile(file: File) {
    setCreating(true);
    setUploadPct(0);
    let projectId: string | null = null;
    try {
      // limit harian (free 2/hari, premium 10/hari) — cek SEBELUM apa pun
      const q = await fetchQuota();
      if (!q.ok) {
        setPremiumOpen(true);
        throw new Error(q.message ?? "Limit harian tercapai — upgrade ke Premium.");
      }
      const ext = file.name.split(".").pop() ?? "mp4";
      const { data: project, error } = await supabase
        .from("projects")
        .insert({ user_id: user.id, title: file.name.replace(/\.[^.]+$/, ""), source_type: "upload", status: "uploading" })
        .select()
        .single();
      if (error || !project) throw error ?? new Error("Gagal membuat proyek");
      projectId = project.id;

      const { data: signed, error: su } = await supabase.storage
        .from("video-uploads")
        .createSignedUploadUrl(`${user.id}/sources/${project.id}.${ext}`);
      if (su || !signed) throw su ?? new Error("Gagal menyiapkan unggahan");
      await putWithProgress(signed.signedUrl, file, setUploadPct);

      // pipeline server-side mulai — JANGAN reload, navigasi ke halaman proyek
      const storagePath = `${user.id}/sources/${project.id}.${ext}`;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/projects/upload-done", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ project_id: project.id, storage_path: storagePath }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? "Gagal memulai pemrosesan");
      }
      toast.success("Terunggah — AI mulai memproses. Pantau progresnya di halaman proyek.");
      setCreating(false);
      setUploadPct(null);
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unggahan gagal");
      if (projectId) {
        await supabase.from("projects").update({ status: "failed" }).eq("id", projectId);
      }
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
    setYtBusy(true);
    try {
      // limit harian — cek SEBELUM request (free 2/hari, premium 10/hari)
      const q = await fetchQuota();
      if (!q.ok) {
        setPremiumOpen(true);
        throw new Error(q.message ?? "Limit harian tercapai — upgrade ke Premium.");
      }
      const r = await processYoutube(url);
      toast.success("Sedang diproses di server — pantau progresnya di halaman proyek.");
      setYoutubeUrl("");
      setYtBusy(false);
      // TANPA reload — langsung ke halaman proyek yang punya indikator progres
      navigate({ to: "/projects/$projectId", params: { projectId: r.project_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses YouTube");
      setYtBusy(false);
    }
  }

  async function handleShare(p: Project) {
    setSharing(true);
    try {
      const r = await shareProject(p.id);
      const ok = await copyText(r.url);
      setSharedLink(r.url);
      if (ok) {
        toast.success("Link dibuat (berlaku 1 minggu) & tersalin ke clipboard!");
      } else {
        toast.info("Link siap — salin manual dari kotak yang muncul.");
      }
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
      await renameProject(renameTarget.id, renameValue.trim() || renameTarget.title);
      toast.success("Nama proyek diubah.");
      setRenameTarget(null);
      window.location.reload();
    } catch {
      toast.error("Gagal mengubah nama");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteProject(confirmDelete.id);
      toast.success("Proyek dihapus sepenuhnya dari server.");
      setConfirmDelete(null);
      window.location.reload();
    } catch {
      toast.error("Gagal menghapus proyek");
    }
  }

  useEffect(() => {
    async function loadData() {
      const [profileRes, projectsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("projects").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (projectsRes.data) setProjects(projectsRes.data);
      setLoading(false);
    }
    loadData();
  }, [user.id]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Berhasil keluar.");
    navigate({ to: "/", replace: true });
  }

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Creator";
  const doneCount = projects.filter((p) => p.status === "completed").length;
  const activeCount = projects.filter((p) => p.status !== "completed" && p.status !== "failed").length;

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
            <Link
              to="/unduh"
              className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">Unduhan</span>
            </Link>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="size-8 rounded-full border border-border" />
            ) : (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex size-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              title="Keluar"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-24 sm:px-5 sm:pt-28">
        {/* ===== Hero ===== */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            <span className="size-1.5 rounded-full bg-accent" />
            Dashboard
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mt-5">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-5xl">
              Halo, <span className="text-accent">{displayName}</span>
            </h1>
            <p className="max-w-xs pb-1 text-[13px] leading-relaxed text-muted-foreground sm:pb-1.5 sm:text-sm">
              Ubah video panjang jadi klip viral. AI memilih momen terbaik, menulis caption & hashtag.
            </p>
          </div>
        </motion.div>

        {/* ===== Bento grid ===== */}
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-6">
          {/* Stat besar — kiri atas */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="flex flex-col justify-between rounded-3xl border border-white/8 bg-card p-6 md:col-span-2"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <FolderOpen className="size-3.5 text-accent" /> Total Proyek
            </div>
            <p className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-6xl">{projects.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">semua proyek kamu</p>
          </motion.div>

          {/* Stat aktif — tengah */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="rounded-3xl border border-white/8 bg-card p-6 md:col-span-2"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Wand2 className="size-3.5 text-accent" /> Sedang Diproses
            </div>
            <p className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-6xl">{activeCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">diproses AI saat ini</p>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: projects.length ? `${(activeCount / projects.length) * 100}%` : "0%" }} />
            </div>
          </motion.div>

          {/* Stat selesai — kanan */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="rounded-3xl border border-white/8 bg-card p-6 md:col-span-2"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-accent" /> Klip Selesai
            </div>
            <p className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-6xl">{doneCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">siap didownload</p>
            <Link
              to="/unduh"
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent transition-opacity hover:opacity-75"
            >
              <Download className="size-3.5" /> Riwayat unduhan <ArrowRight className="size-3" />
            </Link>
          </motion.div>

          {/* ===== New project — bento besar ===== */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="relative overflow-hidden rounded-3xl border border-white/8 bg-card p-6 md:col-span-4 md:p-8"
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-bold tracking-tight sm:text-xl">Mulai Proyek Baru</h2>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Unggah video atau tempel link YouTube. AI mentranskrip, memilih momen terbaik, lalu
                  menulis judul, deskripsi, hashtag, dan skor viralitas.
                </p>

                <input
                  ref={fileInput}
                  type="file"
                  accept="video/*,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void createFromFile(file);
                    e.target.value = "";
                  }}
                />

                <div className="mt-5 flex flex-col gap-3 lg:flex-row">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => fileInput.current?.click()}
                    className="group flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-background px-4 py-5 text-center transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                      {creating ? <Loader2 className="size-5 animate-spin" /> : <FileVideo className="size-5" />}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-sm font-semibold">
                        {creating ? "Memproses…" : "Unggah Video"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">Klik untuk pilih file video/audio</span>
                    </span>
                  </button>

                  <div className="flex min-w-0 flex-col gap-2 lg:flex-1">
                    <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3.5 py-2.5 transition-colors focus-within:border-accent">
                      <Youtube className="size-4 shrink-0 text-muted-foreground" />
                      <input
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        placeholder="https://youtube.com/watch?v=…"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <Button variant="accent" size="sm" disabled={creating} onClick={() => void createFromYoutube()} className="w-full">
                      <ArrowUpRight className="size-4" /> Buat dari Link
                    </Button>
                  </div>
                </div>

                {uploadPct !== null ? (
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="size-3 animate-spin" /> Mengunggah… {Math.round(uploadPct * 100)}%
                      </span>
                      <button type="button" onClick={() => uploadRef.current?.abort()} className="font-medium text-foreground underline">
                        Batalkan
                      </button>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(uploadPct * 100)}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Panel mini sisa kolom — asimetri bento */}
              <div className="hidden shrink-0 flex-col gap-3 md:flex md:w-52">
                <div className="rounded-2xl border border-white/8 bg-background p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline AI</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Transkripsi → seleksi klip → subtitle karaoke → face tracking → render.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-background p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {quota?.plan === "premium" ? "Premium 👑" : "Kuota Gratis"}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {quota
                      ? `${quota.used}/${quota.limit} video hari ini · maks ${quota.clips_per_video} klip/video`
                      : "Memuat kuota…"}
                  </p>
                  {quota?.plan !== "premium" && (
                    <Button variant="accent" size="sm" className="mt-3 w-full" onClick={() => setPremiumOpen(true)}>
                      <Crown className="size-3.5" /> Upgrade Premium
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* ===== Tip cepat — kartu sisa ===== */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.25 }}
            className="flex flex-col justify-between rounded-3xl border border-white/8 bg-card p-6 md:col-span-2"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="size-3.5 text-accent" /> Pro Tip
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Klip terbaik biasanya ada di momen dengan emosi kuat & angka. AI memilihkannya otomatis untuk kamu.
            </p>
            <div className="mt-5 h-px bg-border" />
            <p className="mt-3 text-[11px] text-muted-foreground/70">Rendering berjalan di cloud — kamu bisa keluar kapan saja.</p>
          </motion.div>
        </div>

        {/* ===== Projects list ===== */}
        <section className="mt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold tracking-tight">Proyek Terbaru</h2>
            <span className="text-xs text-muted-foreground">{projects.length} total</span>
          </div>

          {loading ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/8 bg-card" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="mt-5 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-5 py-16 text-center">
              <Film className="size-10 text-muted-foreground/40" />
              <p className="mt-4 font-medium">Belum ada proyek</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Mulai unggah video atau tempel link YouTube untuk membuat klip pertama kamu.
              </p>
              <Button variant="accent" size="sm" className="mt-5 rounded-full" onClick={() => fileInput.current?.click()}>
                <Plus className="size-4" /> Buat Proyek Pertama
              </Button>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {projects.map((p, i) => {
                const meta = projectMeta(p);
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.04 * i }}
                    className="relative min-w-0"
                  >
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-card p-4 pr-1 transition-all hover:border-accent/40 hover:bg-accent/3 sm:gap-4 sm:pr-4"
                    >
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-accent">
                        {p.source_type === "youtube" ? <Youtube className="size-5" /> : <Film className="size-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold tracking-tight" title={p.title}>{p.title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className={`size-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          <span className="opacity-50">·</span>
                          <span>{p.source_type === "youtube" ? "YouTube" : "Unggahan"}</span>
                          <span className="opacity-50">·</span>
                          <span>{timeAgo(p.created_at)}</span>
                          {p.shared_from ? (
                            <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold text-accent">
                              Proyek yang dibagikan
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuFor(menuFor === p.id ? null : p.id); }}
                        className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                        aria-label="Menu proyek"
                      >
                        <MoreVertical className="size-5" />
                      </button>
                    </Link>
                    {/* dropdown titik tiga — ABSOLUTE dalam card (anti kepotong) */}
                    {menuFor === p.id ? (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute right-2 top-14 z-30 w-48 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-xl"
                        >
                        {[
                          { label: sharing ? "Membuat link…" : "Bagikan proyek", icon: Share2, fn: () => void handleShare(p), disabled: sharing },
                          { label: "Ubah nama proyek", icon: Pencil, fn: () => { setRenameTarget(p); setRenameValue(p.title); setMenuFor(null); } },
                          { label: "Hapus proyek", icon: Trash2, fn: () => { setConfirmDelete(p); setMenuFor(null); }, danger: true },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            disabled={item.disabled}
                            onClick={item.fn}
                            className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] transition-colors ${
                              item.danger ? "text-red-400 hover:bg-red-500/10" : "text-neutral-200 hover:bg-white/8"
                            } disabled:opacity-50`}
                          >
                            <item.icon className="size-4" /> {item.label}
                          </button>
                        ))}
                        </motion.div>
                      </>
                    ) : null}
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ===== Dialog: link share siap ===== */}
      {sharedLink ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setSharedLink(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900 p-6"
          >
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Share2 className="size-6" />
            </span>
            <h3 className="mt-4 text-center font-display text-lg font-bold">Link share dibuat</h3>
            <p className="mt-1 text-center text-xs text-muted-foreground">Berlaku 1 minggu — kirim ke siapa saja</p>
            <div className="mt-4 flex gap-2">
              <input
                readOnly
                value={sharedLink}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-950 p-3 text-xs text-neutral-300 outline-none"
              />
              <Button variant="accent" size="sm" onClick={() => void copyText(sharedLink).then((ok) => toast[ok ? "success" : "error"](ok ? "Tersalin!" : "Salin manual: tekan lama link"))}>
                Salin
              </Button>
            </div>
            <Button variant="outline" className="mt-3 w-full" onClick={() => setSharedLink(null)}>Tutup</Button>
          </motion.div>
        </div>
      ) : null}

      {/* ===== Dialog: hapus proyek ===== */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setConfirmDelete(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900 p-6"
          >
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-500/15 text-red-500">
              <Trash2 className="size-6" />
            </span>
            <h3 className="mt-4 text-center font-display text-lg font-bold">Apakah anda setuju ingin menghapus proyek ini?</h3>
            <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
              Jika anda menghapusnya, proyek ini akan dihapus sepenuhnya di server kami dan tidak bisa dikembalikan —
              semua klip, video panjang, cache, dan data proyek akan hilang. Ini dilakukan untuk menjaga kestabilan server.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>Batalkan</Button>
              <Button variant="destructive" className="flex-1" onClick={() => void handleDelete()}>Setuju</Button>
            </div>
          </motion.div>
        </div>
      ) : null}

      {/* ===== Dialog: ubah nama proyek ===== */}
      {renameTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setRenameTarget(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-900 p-6"
          >
            <h3 className="text-center font-display text-lg font-bold">Ubah nama proyek</h3>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="mt-4 w-full rounded-xl border border-white/10 bg-neutral-950 p-3 text-sm outline-none focus:border-amber-500/60"
              placeholder="Judul proyek"
            />
            <div className="mt-5 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRenameTarget(null)}>Batalkan</Button>
              <Button variant="accent" className="flex-1" onClick={() => void handleRename()}>Simpan</Button>
            </div>
          </motion.div>
        </div>
      ) : null}

      <PremiumDialog
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
        onUpgraded={() => {
          fetchQuota().catch(() => {});
        }}
      />
    </div>
  );
}