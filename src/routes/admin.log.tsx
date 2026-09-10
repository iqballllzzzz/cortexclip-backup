import { createFileRoute, redirect, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Activity,
  Cpu,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Terminal,
  User,
  Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccountStatus } from "@/hooks/use-account-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageLoading } from "@/components/page-loading";
import { fetchSystemLogs, downloadAdminLogs, type SystemLogEntry } from "@/lib/admin-api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/log")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  head: () => ({ meta: [{ title: "System & User Logs — Admin CortexClip" }] }),
  component: AdminLogLayout,
});

function AdminLogLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/admin/log" || pathname === "/admin/log/") {
    return <AdminSystemLogPage />;
  }
  return <Outlet />;
}

function AdminSystemLogPage() {
  const { status, loading: statusLoading } = useAccountStatus();
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [resources, setResources] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const res = await fetchSystemLogs();
      setLogs(res.logs);
      setResources(res.resources);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal memuat log sistem");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!status?.is_admin) return;
    void load();
  }, [status?.is_admin, load]);

  // Real-Time Auto Refresh (setiap 1.5 detik)
  useEffect(() => {
    if (!status?.is_admin || !autoRefresh) return;
    const iv = setInterval(() => void load(), 1500);
    return () => clearInterval(iv);
  }, [status?.is_admin, autoRefresh, load]);

  if (statusLoading) {
    return <PageLoading fullscreen label="Memeriksa akses admin" />;
  }

  if (!status?.is_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Header Admin */}
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/admin" className="flex items-center gap-2">
            <ArrowLeft className="size-4" />
            <span className="font-display text-sm font-bold">Kembali ke Admin</span>
          </Link>
          <span className="hidden items-center gap-1.5 rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent sm:inline-flex">
            <Terminal className="size-3" /> Live System Logs
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button
              size="sm"
              variant={autoRefresh ? "accent" : "outline"}
              onClick={() => setAutoRefresh((v) => !v)}
              className="text-xs gap-1.5"
            >
              <span className={`size-2 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
              {autoRefresh ? "Live Auto-Refresh (1.5s)" : "Auto-Refresh Paused"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        {/* Title & Navigation to System AI Logs */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-accent">
              <span className="size-2 rounded-full bg-emerald-500 animate-ping" /> REAL-TIME STREAMING
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight">
              System &amp; User Activity Logs
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Memantau aktivitas pengguna, pemanggilan endpoint, dan event sistem secara real-time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.promise(downloadAdminLogs("all", "json"), {
                  loading: "Menyiapkan unduhan log JSON…",
                  success: "File log JSON berhasil diunduh!",
                  error: "Gagal mengunduh log",
                });
              }}
              className="gap-1.5 text-xs"
            >
              <Download className="size-3.5 text-accent" /> Unduh JSON
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.promise(downloadAdminLogs("all", "txt"), {
                  loading: "Menyiapkan unduhan log TXT…",
                  success: "File log TXT berhasil diunduh!",
                  error: "Gagal mengunduh log",
                });
              }}
              className="gap-1.5 text-xs"
            >
              <Download className="size-3.5 text-muted-foreground" /> Unduh TXT
            </Button>

            <Button variant="accent" size="sm" asChild className="gap-1.5 text-xs font-bold">
              <Link to="/admin/log/systemai">
                <Cpu className="size-4" /> Tombol AI: Log Sistem AI (Real-Time)
              </Link>
            </Button>
          </div>
        </div>

        {err ? (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/6 px-4 py-3 text-xs text-destructive">
            {err}
          </div>
        ) : null}

        {loading ? (
          <PageLoading label="Memuat log real-time" />
        ) : (
          <div className="mt-6 space-y-4">
            {/* System Resources Snapshot */}
            {Object.keys(resources).length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-xs">
                {Object.entries(resources).map(([k, v]) => (
                  <div key={k} className="panel bg-card border border-border px-3 py-2">
                    <span className="text-[10px] text-muted-foreground uppercase">{k}</span>
                    <p className="font-bold text-accent truncate">{String(v)}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Stream Table */}
            <div className="panel overflow-hidden border border-border bg-card">
              <div className="border-b border-border bg-surface px-4 py-2.5 text-xs font-mono font-bold flex items-center justify-between">
                <span>RIWAYAT AKTIVITAS (LATEST {logs.length} EVENTS)</span>
                <span className="text-muted-foreground font-normal">Pembaruan tiap 1.5s</span>
              </div>

              {logs.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Belum ada log tercatat.
                </div>
              ) : (
                <div className="divide-y divide-border/60 overflow-x-auto">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 px-4 py-3 text-xs hover:bg-surface/50 transition-colors">
                      <span className="font-mono text-muted-foreground shrink-0 text-[11px]">{log.timestamp}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                        log.level === "ERROR"
                          ? "bg-destructive/15 text-destructive border border-destructive/30"
                          : log.level === "WARN"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : "bg-accent/15 text-accent border border-accent/30"
                      }`}>
                        {log.level}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="text-foreground font-bold">{log.action}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-accent flex items-center gap-1">
                            <User className="size-3" /> {log.user}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-[11px] truncate mt-0.5">{log.detail}</p>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground/70 shrink-0 hidden sm:inline">{log.ip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
