"use client";
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
  PackageOpen,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { listRenderJobs, type RenderJob } from "@/lib/backend-api";
import { clipFileName } from "@/lib/clip-file";
import { deleteRenderJob } from "@/lib/project-api";
import { useI18n } from "@/lib/i18n";
import { AppNav } from "@/components/app-nav";
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

/* ══════════════════════════════════════════════════════════════════════════
   REDESIGN v2 — "RAK KIRIM" (SHIPPING SHELF)
   Hallmark · macrostructure: Manifest/List-led · tone: utilitarian-editorial
   · anchor hue: matte amber 60° (palet lama dipertahankan)

   Perubahan STRUKTURAL vs halaman lama (grid 3 kolom + bento atas):
   — Bento 4 kotak METRIK dihapus; gantinya SATU baris "label kargo" tipis
     (total / siap / proses / terakhir) menempel di bawah judul — data yang
     sama, tanpa empat kartu kembar.
   — Kartu unduhan jadi BARIS RAK horizontal: thumbnail 9:16 kecil di kiri,
     info di tengah, tombol unduh di kanan — seperti label paket; bukan grid
     kartu poster tinggi. Video tetap bisa diputar di tempat.
   — Baris "sedang merender" punya strip conveyor animasi (garis berjalan).
   — Animasi baru: baris masuk stagger dari kiri; strip conveyor; tombol
     unduh berisi progress-shine saat hover.
   ══════════════════════════════════════════════════════════════════════════ */

function statusMeta(status: RenderJob["status"]) {
  switch (status) {
    case "completed":
      return { label: "Selesai", Icon: CheckCircle2, tone: "text-accent" };
    case "rendering":
    case "pending":
      return { label: "Sedang merender…", Icon: Loader2, tone: "text-muted-foreground", spin: true };
    case "failed":
      return { label: "Gagal", Icon: XCircle, tone: "text-destructive" };
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
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listRenderJobs();
      setJobs(list);
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

  const strip: { label: string; value: string | number }[] = [
    { label: "Total render", value: jobs.length },
    { label: "Siap diunduh", value: completed.length },
    { label: "Sedang proses", value: active.length },
    { label: "Terakhir", value: jobs[0] ? timeAgo(jobs[0].created_at) : "—" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <AppNav displayName="?" themeToggle />

      <main className="mx-auto w-full max-w-[980px] px-4 pb-28 pt-9 sm:px-6 sm:pt-12">
        {/* ==== Kepala rak: judul + baris label kargo tipis ==== */}
        <header>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Kembali ke dashboard
          </Link>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-[30px] font-bold leading-none tracking-tight sm:text-[40px]">
                Rak Unduhan
              </h1>
              <p className="mt-2.5 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
                Semua klip yang pernah kamu render — tersimpan di server, siap diunduh kapan saja.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectMode ? (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-full"
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setSelectMode(false);
                      setSelected(new Set());
                    }}
                  >
                    Batal
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={jobs.length === 0}
                  onClick={() => setSelectMode(true)}
                >
                  <Trash2 className="size-4" /> Pilih & hapus
                </Button>
              )}
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                Muat ulang
              </Button>
            </div>
          </div>

          {/* BARIS LABEL KARGO — angka nyata dari data, satu garis tipis */}
          <dl className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border pb-4">
            {strip.map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </dt>
                <dd className="stat-figure text-[19px] leading-none">{s.value}</dd>
              </div>
            ))}
          </dl>
        </header>

        {/* ==== Rak baris ==== */}
        {loading ? (
          <PageLoading label="Memuat riwayat" />
        ) : jobs.length === 0 ? (
          <div className="mt-12 flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-16 text-center">
            <PackageOpen className="size-10 text-muted-foreground/40" />
            <p className="mt-4 font-display text-base font-bold">Rak masih kosong</p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Buka salah satu proyek, pilih klip, lalu tekan Unduh — hasilnya akan muncul di sini.
            </p>
            <Button variant="accent" size="sm" className="mt-6 rounded-full" asChild>
              <Link to="/dashboard">Lihat proyek saya</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            <AnimatePresence initial={false}>
              {jobs.map((job, i) => {
                const meta = statusMeta(job.status);
                const title = job.clip_title || projectNames[job.project_id] || "Klip";
                const berjalan = job.status === "rendering" || job.status === "pending";
                return (
                  <motion.li
                    key={job.id}
                    initial={{ opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 18, height: 0 }}
                    transition={{ duration: 0.32, delay: Math.min(i * 0.04, 0.32), ease: [0.16, 1, 0.3, 1] }}
                    className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent/40"
                  >
                    {/* STRIP CONVEYOR untuk job yang masih jalan */}
                    {berjalan ? (
                      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
                        <span className="conveyor absolute inset-y-0 w-1/3 bg-accent" />
                      </span>
                    ) : job.status === "completed" ? (
                      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent/60" />
                    ) : (
                      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-destructive/60" />
                    )}

                    <div className="flex items-stretch gap-4 p-3.5 sm:p-4">
                      {/* thumbnail 9:16 — video diputar di tempat */}
                      <div className="relative aspect-[9/16] w-[72px] shrink-0 overflow-hidden rounded-xl bg-surface sm:w-[84px]">
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
                            <meta.Icon className={`size-6 ${meta.tone} ${meta.spin ? "animate-spin" : ""}`} />
                          </div>
                        )}
                        {selectMode ? (
                          <button
                            type="button"
                            onClick={() => {
                              const next = new Set(selected);
                              if (next.has(job.id)) next.delete(job.id);
                              else next.add(job.id);
                              setSelected(next);
                            }}
                            className={`absolute left-1 top-1 z-10 flex size-6 items-center justify-center rounded-md border-2 bg-background/80 backdrop-blur transition-colors ${
                              selected.has(job.id)
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-border"
                            }`}
                            aria-label="Pilih untuk dihapus"
                          >
                            {selected.has(job.id) ? <CheckCircle2 className="size-4" /> : null}
                          </button>
                        ) : null}
                      </div>

                      {/* info tengah */}
                      <div className="min-w-0 flex-1 py-0.5">
                        <p className="truncate text-[14.5px] font-semibold tracking-tight">{title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted-foreground">
                          <span className={`inline-flex items-center gap-1 ${meta.tone}`}>
                            <meta.Icon className={`size-3.5 ${meta.spin ? "animate-spin" : ""}`} />
                            {meta.label}
                          </span>
                          <span className="opacity-40">·</span>
                          <span>{timeAgo(job.created_at)}</span>
                          <span className="opacity-40">·</span>
                          <span className="truncate">{projectNames[job.project_id] ?? "—"}</span>
                        </p>
                        {job.status === "failed" && job.error ? (
                          <p className="mt-1 line-clamp-1 text-[12px] text-destructive/80">{job.error}</p>
                        ) : null}
                      </div>

                      {/* aksi kanan */}
                      {job.status === "completed" && job.rendered_url ? (
                        <div className="flex shrink-0 items-center">
                          <Button
                            variant="accent"
                            size="sm"
                            className="relative overflow-hidden rounded-full shine"
                            onClick={() => {
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
                            <span className="hidden sm:inline">Unduh MP4</span>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </main>
    </div>
  );
}
