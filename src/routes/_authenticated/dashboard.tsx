import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Film,
  LogOut,
  Plus,
  Sparkles,
  Clock,
  TrendingUp,
  Upload,
  Link2,
  Loader2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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

function Dashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<XMLHttpRequest | null>(null);

  /** Unggah via signed URL + XHR supaya progres byte-per-byte terlihat dan bisa dibatalkan. */
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

  async function createFromFile(file: File) {
    setCreating(true);
    setUploadPct(0);
    let projectId: string | null = null;
    try {
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
      if (error || !project) throw new Error(error?.message ?? "Gagal membuat proyek.");
      projectId = project.id;

      const path = `${user.id}/${project.id}.${ext}`;
      const { data: signed, error: signError } = await supabase.storage
        .from("video-uploads")
        .createSignedUploadUrl(path, { upsert: true });
      if (signError || !signed) throw new Error(signError?.message ?? "Gagal menyiapkan unggahan.");

      await putWithProgress(signed.signedUrl, file, setUploadPct);

      await supabase
        .from("projects")
        .update({ storage_path: path, status: "pending" })
        .eq("id", project.id);

      toast.success("Video terunggah. Lanjut ke proses AI.");
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Gagal mengunggah video.";
      if (projectId) {
        await supabase
          .from("projects")
          .update({ status: "failed", error_message: message })
          .eq("id", projectId);
      }
      toast.error(message);
      /* biarkan daftar proyek menampilkan status gagal saat dimuat ulang */
    } finally {
      uploadRef.current = null;
      setUploadPct(null);
      setCreating(false);
    }
  }


  async function createFromYoutube() {
    const url = youtubeUrl.trim();
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
      toast.error("Masukkan link YouTube yang valid.");
      return;
    }
    setCreating(true);
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: "Proyek YouTube",
        source_type: "youtube",
        source_url: url,
        status: "pending",
      })
      .select()
      .single();
    setCreating(false);
    if (error || !project) {
      toast.error(error?.message ?? "Gagal membuat proyek.");
      return;
    }
    setYoutubeUrl("");
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  }


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
    loadData();
  }, [user.id]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Berhasil keluar.");
    navigate({ to: "/", replace: true });
  }

  const displayName = profile?.display_name ?? user.email?.split("@")[0] ?? "Creator";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Halo, {displayName} 👋
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Siap mengubah video panjang kamu jadi klip viral?
            </p>
          </div>
          <div className="flex items-center gap-2">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="size-9 rounded-full border border-border"
              />
            ) : (
              <div className="flex size-9 items-center justify-center rounded-full bg-accent/15 font-display text-sm font-bold text-accent">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" /> Keluar
            </Button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Film, label: "Total Proyek", value: projects.length },
            {
              icon: Clock,
              label: "Proses Aktif",
              value: projects.filter((p) => p.status !== "completed" && p.status !== "failed").length,
            },
            {
              icon: TrendingUp,
              label: "Klip Selesai",
              value: projects.filter((p) => p.status === "completed").length,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <s.icon className="size-4" />
                <span className="text-xs font-medium uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="mt-2 font-display text-3xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* New Project Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-8 rounded-2xl border-2 border-dashed border-accent/40 bg-accent/5 p-6"
        >
          <div className="flex items-start gap-4">
            <div className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 sm:flex">
              <Sparkles className="size-6 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Mulai Proyek Baru</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Unggah video atau tempel link YouTube. AI akan mentranskrip, mencari momen terbaik,
                lalu menulis judul, deskripsi, hashtag, dan skor viralitas.
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

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="accent"
                  size="sm"
                  disabled={creating}
                  onClick={() => fileInput.current?.click()}
                >
                  {creating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Unggah Video
                </Button>
                <div className="flex flex-1 gap-2">
                  <input
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={creating}
                    onClick={() => void createFromYoutube()}
                  >
                    <Link2 className="size-4" /> Buat
                  </Button>
                </div>
              </div>

              {uploadPct !== null ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Mengunggah… {Math.round(uploadPct * 100)}%</span>
                    <button
                      type="button"
                      onClick={() => uploadRef.current?.abort()}
                      className="font-medium text-foreground underline"
                    >
                      Batalkan
                    </button>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${Math.round(uploadPct * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>


        {/* Projects List */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Proyek Terbaru
          </h2>

          {loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl border border-border bg-card"
                />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center">
              <Film className="size-10 text-muted-foreground/50" />
              <p className="mt-4 font-medium">Belum ada proyek</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Mulai unggah video atau tempel link YouTube untuk membuat klip pertama kamu.
              </p>
              <Button
                variant="accent"
                size="sm"
                className="mt-5"
                onClick={() => fileInput.current?.click()}
              >
                <Plus className="size-4" /> Buat Proyek Pertama
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-accent/50"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <Film className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">{p.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {p.source_type === "youtube" ? "YouTube" : "Unggah"} ·{" "}
                      {new Date(p.created_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </div>

          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { label: string; className: string }> = {
    pending: { label: "Menunggu", className: "bg-secondary text-muted-foreground" },
    uploading: { label: "Mengunggah", className: "bg-blue-500/15 text-blue-500" },
    transcribing: { label: "Transkripsi", className: "bg-amber-500/15 text-amber-500" },
    analyzing: { label: "Analisis AI", className: "bg-purple-500/15 text-purple-500" },
    completed: { label: "Selesai", className: "bg-green-500/15 text-green-500" },
    failed: { label: "Gagal", className: "bg-red-500/15 text-red-500" },
  };
  const s = styles[status] ?? { label: "Menunggu", className: "bg-secondary text-muted-foreground" };
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}
