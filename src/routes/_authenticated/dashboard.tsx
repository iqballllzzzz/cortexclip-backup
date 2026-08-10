import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Film, LogOut, Plus, Sparkles, Clock, TrendingUp, Upload, Link2 } from "lucide-react";

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
          <div className="flex flex-col items-center text-center sm:flex-row sm:text-left">
            <div className="flex size-12 items-center justify-center rounded-xl bg-accent/15">
              <Sparkles className="size-6 text-accent" />
            </div>
            <div className="mt-3 sm:ml-4 sm:mt-0">
              <h2 className="text-lg font-semibold">Mulai Proyek Baru</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Unggah video atau tempel link YouTube. AI akan otomatis mencari momen terbaik.
              </p>
            </div>
            <div className="mt-4 flex w-full gap-2 sm:ml-auto sm:mt-0 sm:w-auto">
              <Button variant="accent" size="sm" className="flex-1 sm:flex-none">
                <Upload className="size-4" /> Unggah Video
              </Button>
              <Button variant="secondary" size="sm" className="flex-1 sm:flex-none">
                <Link2 className="size-4" /> Link YouTube
              </Button>
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
              <Button variant="accent" size="sm" className="mt-5">
                <Plus className="size-4" /> Buat Proyek Pertama
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4"
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
                </div>
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
