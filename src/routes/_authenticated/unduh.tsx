
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  Film,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { listRenderJobs, type RenderJob } from "@/lib/backend-api";
import { clipFileName } from "@/lib/clip-file";
import { deleteRenderJob } from "@/lib/project-api";
import { useI18n } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageLoading } from "@/components/page-loading";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/unduh")({
  head: () => ({
    meta: [
      { title: "Unduhan — CortexClip" },
      { name: "description", content: "Riwayat klip yang telah dirender — unduh MP4 vertikal siap unggah." },
    ],
  }),
  component: DownloadsPage,
});

function statusMeta(status: RenderJob["status"]) {
  switch (status) {
    case "completed":
      return { label: "Selesai", Icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" };
    case "rendering":
    case "pending":
      return { label: "Sedang merender…", Icon: Loader2, tone: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", spin: true };
    case "failed":
      return { label: "Gagal", Icon: XCircle, tone: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" };
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function DownloadsPage() {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  // mode hapus: pilih klip utk dihapus
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listRenderJobs();
      setJobs(list);
      // nama project utk tiap job
      const ids = [...new Set(list.map((j) => j.project_id))];
      if (ids.length) {
        const { data } = await supabase
          .from("projects")
          .select("id,title")
          .in("id", ids);
        const map: Record<string, string> = {};
        for (const p of data ?? []) map[p.id] = p.title;
        setProjectNames(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // auto-poll saat ada job yang masih rendering
    const iv = setInterval(() => {
      setJobs((prev) => {
        if (prev.some((j) => j.status === "rendering" || j.status === "pending")) {
          void refresh();
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(iv);
  }, [refresh]);

  const completed = jobs.filter((j) => j.status === "completed");
  const active = jobs.filter((j) => j.status === "rendering" || j.status === "pending");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Kembali ke dashboard
            </Link>
            <h1 className="font-display mt-3 text-3xl font-bold tracking-tight">
              Riwayat Unduhan
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Semua klip yang pernah kamu render — siap diunduh kapan saja.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selected.size === 0 || deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      for (const id of selected) await deleteRenderJob(id);
                      toast.success(`${selected.size} unduhan dihapus dari server.`);
                      setSelected(new Set());
                      setSelectMode(false);
                      await refresh();
                    } catch {
                      toast.error("Gagal menghapus sebagian unduhan");
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Hapus {selected.size > 0 ? `(${selected.size})` : ""}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setSelectMode(false); setSelected(new Set()); }}>
                  Batal
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={jobs.length === 0}
                onClick={() => setSelectMode(true)}
              >
                <Trash2 className="size-4" /> Hapus unduhan
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Muat ulang
            </Button>
          </div>
        </div>

        {/* Bento ringkasan */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total render", value: jobs.length, Icon: Film },
            { label: "Siap diunduh", value: completed.length, Icon: Download },
            { label: "Sedang proses", value: active.length, Icon: Clock3 },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <s.Icon className="size-4" />
                <span className="text-[11px] font-medium uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="font-display mt-2 text-2xl font-bold tabular-nums">{s.value}</p>
            </motion.div>
          ))}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock3 className="size-4" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Terakhir</span>
            </div>
            <p className="mt-2 text-sm font-semibold">
              {jobs[0] ? timeAgo(jobs[0].created_at) : "—"}
            </p>
          </motion.div>
        </div>

        {/* Daftar */}
        {loading ? (
          <PageLoading label="Memuat riwayat" />
        ) : jobs.length === 0 ? (
          <div className="mt-12 flex flex-col items-center rounded-3xl border border-dashed border-border py-16 text-center">
            <Download className="size-10 text-muted-foreground/40" />
            <p className="mt-4 font-medium">Belum ada klip yang dirender</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Buka salah satu project, pilih klip, lalu tekan Unduh — hasilnya akan muncul di sini.
            </p>
            <Button variant="accent" size="sm" className="mt-5" asChild>
              <Link to="/dashboard">Lihat project saya</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {jobs.map((job, i) => {
                const meta = statusMeta(job.status);
                const title = job.clip_title || projectNames[job.project_id] || "Klip";
                return (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg"
                  >
                    {/* THUMBNAIL VIDEO 9:16 — frame pertama tampil tanpa unduh
                        penuh (preload=metadata), klik memutar langsung di
                        kartu. Untuk job yang belum selesai: band ikon status. */}
                    <div className="relative aspect-[9/16] w-full bg-surface">
                      {job.status === "completed" && job.rendered_url ? (
                        <video
                          src={`${job.rendered_url}#t=0.5`}
                          className="absolute inset-0 size-full object-cover"
                          preload="metadata"
                          muted
                          playsInline
                          controls
                          aria-label={title}
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center">
                          <meta.Icon className={`size-8 ${meta.tone} ${meta.spin ? "animate-spin" : ""}`} />
                        </div>
                      )}
                      {selectMode && job.status === "completed" ? (
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selected);
                            if (next.has(job.id)) next.delete(job.id);
                            else next.add(job.id);
                            setSelected(next);
                          }}
                          className={`absolute left-2 top-2 flex size-6 items-center justify-center rounded-md border-2 bg-background/80 backdrop-blur transition-colors ${
                            selected.has(job.id) ? "border-accent bg-accent text-accent-foreground" : "border-border"
                          }`}
                          aria-label="Pilih untuk dihapus"
                        >
                          {selected.has(job.id) ? <CheckCircle2 className="size-4" /> : null}
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                    {selectMode && job.status !== "completed" ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(selected);
                          if (next.has(job.id)) next.delete(job.id);
                          else next.add(job.id);
                          setSelected(next);
                        }}
                        className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                          selected.has(job.id) ? "border-accent bg-accent text-accent-foreground" : "border-border"
                        }`}
                        aria-label="Pilih untuk dihapus"
                      >
                        {selected.has(job.id) ? <CheckCircle2 className="size-4" /> : null}
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`inline-flex items-center gap-1 ${meta.tone}`}>
                          <meta.Icon className={`size-3.5 ${meta.spin ? "animate-spin" : ""}`} />
                          {meta.label}
                        </span>
                        <span>·</span>
                        <span>{timeAgo(job.created_at)}</span>
                      </p>
                      {job.status === "failed" && job.error ? (
                        <p className="mt-1 line-clamp-1 text-xs text-red-500/80">{job.error}</p>
                      ) : null}
                    </div>
                    {job.status === "completed" && job.rendered_url ? (
                      <Button
                        variant="accent"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          // Nama file = potongan JUDUL KLIP (tiap klip beda).
                          // Pakai parameter ?download= milik Supabase Storage:
                          // server yang mengirim Content-Disposition, jadi nama
                          // file tetap benar walau URL beda origin.
                          const name = clipFileName(title);
                          const url = new URL(job.rendered_url!);
                          url.searchParams.set("download", name);
                          const a = document.createElement("a");
                          a.href = url.toString();
                          a.download = name;
                          a.rel = "noopener";
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                        }}
                      >
                        <Download className="size-4" />
                        Unduh MP4
                      </Button>
                    ) : null}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
