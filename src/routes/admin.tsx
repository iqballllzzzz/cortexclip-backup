import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Cpu,
  Gauge,
  HardDrive,
  Loader2,
  Search,
  ShieldCheck,
  Users,
  Video,
  Crown,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccountStatus } from "@/hooks/use-account-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageLoading } from "@/components/page-loading";
import { fetchAdminStats, fetchAdminUsers, type AdminStats, type AdminUser } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { UserDrawer } from "@/components/admin/user-drawer";
import { ActivityLines, ModelBars, RequestsArea, StatusDonut } from "@/components/admin/admin-charts";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  head: () => ({ meta: [{ title: "Panel Admin — CortexClip" }] }),
  component: AdminPage,
});

/* --------------------------------------------------------------- helpers */

function num(n: number): string {
  return n.toLocaleString("id-ID");
}

function relative(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "hari ini";
  if (days === 1) return "1 hari lalu";
  return `${days} hari lalu`;
}

/* ------------------------------------------------------------------ page */

function AdminPage() {
  const { status, loading: statusLoading } = useAccountStatus();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<"semua" | "premium" | "diban" | "admin">("semua");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      try {
        setErr(null);
        const [s, u] = await Promise.all([fetchAdminStats(), fetchAdminUsers({ search: q, limit: 200 })]);
        setStats(s);
        setUsers(u.users);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Gagal memuat data admin");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (status?.is_admin) void load("");
  }, [status?.is_admin, load]);

  // debounce pencarian
  useEffect(() => {
    if (!status?.is_admin) return;
    const t = setTimeout(() => void load(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search, status?.is_admin, load]);

  const shown = useMemo(() => {
    if (tab === "premium") return users.filter((u) => u.plan === "premium");
    if (tab === "diban") return users.filter((u) => u.banned);
    if (tab === "admin") return users.filter((u) => u.is_admin);
    return users;
  }, [users, tab]);

  if (statusLoading) {
    return <PageLoading fullscreen label="Memeriksa akses admin" />;
  }

  /* --- gerbang: bukan admin --- */
  if (!status?.is_admin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-5">
        <div className="panel max-w-md p-8 text-center">
          <Ban className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-5 font-display text-xl font-bold tracking-tight">Halaman khusus admin</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Akun{" "}
            <span className="font-medium text-foreground">{status?.user.email ?? "kamu"}</span> tidak
            punya akses ke panel administrasi.
          </p>
          <Button variant="accent" className="mt-6" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="size-4" /> Kembali ke dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const k = stats?.kpi;

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* ===== Bar admin: sticky, tanpa glass berat ===== */}
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
            <img src="/favicon.png" alt="" className="size-7 shrink-0 object-contain" />
            <span className="truncate font-display text-[15px] font-bold tracking-tight">
              CortexClip
            </span>
          </Link>
          <span className="hidden items-center gap-1.5 rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent sm:inline-flex">
            <ShieldCheck className="size-3" /> Admin
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRefreshing(true);
                void load(search.trim());
              }}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="hidden sm:inline">Segarkan</span>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        {/* ===== Judul: kiri berat, kanan ringan (asimetris) ===== */}
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div className="reveal" style={{ ["--i" as string]: 0 }}>
            <h1 className="font-display text-[30px] leading-[1.05] font-bold tracking-tight sm:text-[44px]">
              Kendali penuh
              <br />
              atas platform.
            </h1>
            <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
              Statistik pemakaian, kesehatan model AI, dan moderasi akun dalam satu tempat. Data
              disegarkan tiap kali halaman ini dibuka.
            </p>
          </div>
          <div
            className="reveal grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-border"
            style={{ ["--i" as string]: 1 }}
          >
            {[
              ["Pengguna", k ? num(k.total_users) : "—"],
              ["Premium", k ? num(k.premium_active) : "—"],
              ["Diban", k ? num(k.banned_now) : "—"],
            ].map(([label, val]) => (
              <div key={label} className="bg-card px-4 py-5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <p className="stat-figure mt-2 text-3xl">{val}</p>
              </div>
            ))}
          </div>
        </div>

        {err ? (
          <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/6 px-4 py-3 text-sm text-destructive">
            {err}
          </div>
        ) : null}

        {loading && !stats ? (
          <PageLoading label="Memuat data pengguna" />
        ) : null}

        {stats ? (
          <>
            {/* ===== KPI: 6 kartu, lebar tidak sama (1.2fr 1fr 0.9fr) ===== */}
            <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                i={2}
                icon={Users}
                label="Pengguna baru (7 hari)"
                value={num(stats.kpi.new_users_7d)}
                sub={`${num(stats.kpi.logins_7d)} login sepekan`}
                span
              />
              <KpiCard
                i={3}
                icon={Activity}
                label="Request AI berhasil"
                value={num(stats.kpi.total_requests)}
                sub={`${num(stats.kpi.requests_24h)} dalam 24 jam`}
              />
              <KpiCard
                i={4}
                icon={Video}
                label="Proyek dibuat"
                value={num(stats.kpi.total_projects)}
                sub={`${num(stats.kpi.projects_today)} hari ini`}
              />
              <KpiCard
                i={5}
                icon={Sparkles}
                label="Klip dihasilkan"
                value={num(stats.kpi.total_clips)}
                sub={`${num(stats.kpi.renders_total)} render diminta`}
              />
              <KpiCard
                i={6}
                icon={Crown}
                label="Premium aktif"
                value={num(stats.kpi.premium_active)}
                sub={`dari ${num(stats.kpi.total_users)} akun`}
              />
              <KpiCard
                i={7}
                icon={Gauge}
                label="Request 7 hari"
                value={num(stats.kpi.requests_7d)}
                sub="tanpa error"
              />
            </section>

            {/* ===== Grafik: kolom lebar + kolom sempit (asimetris) ===== */}
            <section className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <Panel i={8} title="Request AI per hari" hint="14 hari terakhir · hanya yang berhasil">
                <RequestsArea data={stats.series} />
              </Panel>
              <Panel i={9} title="Status proyek" hint="komposisi seluruh proyek">
                <StatusDonut data={stats.project_status} />
                <ul className="mt-4 space-y-1.5">
                  {stats.project_status.slice(0, 5).map((s, idx) => (
                    <li key={s.status} className="flex items-center gap-2 text-[13px]">
                      <span
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ background: `var(--chart-${(idx % 5) + 1})` }}
                      />
                      <span className="min-w-0 flex-1 truncate capitalize text-muted-foreground">
                        {s.status}
                      </span>
                      <span className="font-semibold tabular-nums">{num(s.count)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.35fr]">
              <Panel i={10} title="Proyek vs login" hint="aktivitas harian">
                <ActivityLines data={stats.series} />
              </Panel>
              <Panel
                i={11}
                title="Model paling andal"
                hint="model yang gagal ikut ditampilkan"
              >
                {stats.top_models.length === 0 ? (
                  <EmptyHint text="Belum ada request AI yang tercatat. Jalankan satu proyek untuk mengisi grafik ini." />
                ) : (
                  <>
                    <ModelBars data={stats.top_models} />
                    <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
                      {stats.top_models.slice(0, 6).map((m) => {
                        // 0 sukses = model ini SELALU gagal. Ini keadaan yang
                        // paling perlu terlihat admin, jadi diberi warna
                        // destruktif + pesan error terakhirnya.
                        const mati = m.success === 0 && m.error > 0;
                        return (
                          <li key={m.model} className="bg-card px-3.5 py-2.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <Cpu
                                className={`size-3.5 shrink-0 ${
                                  mati ? "text-destructive" : "text-muted-foreground"
                                }`}
                              />
                              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                                {m.model}
                              </span>
                              <span className="text-[12px] text-muted-foreground">
                                {num(m.success)} sukses · {num(m.error)} error
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  mati
                                    ? "bg-destructive/12 text-destructive"
                                    : m.reliability >= 95
                                      ? "bg-accent/12 text-accent"
                                      : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {mati ? "GAGAL TOTAL" : `${m.reliability}%`}
                              </span>
                            </div>
                            {m.last_error?.pesan ? (
                              <p className="mt-1.5 break-words pl-6 font-mono text-[11px] leading-snug text-destructive/85">
                                {m.last_error.kind ? `[${m.last_error.kind}] ` : ""}
                                {m.last_error.pesan}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </Panel>
            </section>

            {/* ===== Resource server ===== */}
            {stats.resources && Object.keys(stats.resources).length > 0 ? (
              <section className="reveal mt-4" style={{ ["--i" as string]: 12 }}>
                <div className="panel px-5 py-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <HardDrive className="size-3.5" /> Kesehatan server
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                    {[
                      ["RAM bebas", `${stats.resources["free_ram_gb"] ?? "—"} GB`],
                      ["Disk bebas", `${stats.resources["free_disk_gb"] ?? "—"} GB`],
                      [
                        "Render aktif",
                        `${stats.resources["active_renders"] ?? 0} / ${stats.resources["max_concurrent_renders"] ?? "—"}`,
                      ],
                      [
                        "Transkripsi paralel",
                        String(stats.resources["max_concurrent_transcribes"] ?? "—"),
                      ],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <p className="text-[11px] text-muted-foreground">{label}</p>
                        <p className="mt-0.5 font-display text-lg font-bold tabular-nums">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {/* ===== Tabel pengguna ===== */}
            <section className="reveal mt-10" style={{ ["--i" as string]: 13 }}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                    Pengguna
                  </h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Klik satu baris untuk melihat detail, mengatur plan, atau menerapkan ban.
                  </p>
                </div>
                <label className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 transition-colors focus-within:border-accent">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari email atau nama…"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {(
                  [
                    ["semua", `Semua (${users.length})`],
                    ["premium", `Premium (${users.filter((u) => u.plan === "premium").length})`],
                    ["diban", `Diban (${users.filter((u) => u.banned).length})`],
                    ["admin", `Admin (${users.filter((u) => u.is_admin).length})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                      tab === key
                        ? "bg-foreground text-background"
                        : "border border-border text-muted-foreground hover:border-accent/40 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Desktop: tabel. Mobile: kartu (tanpa scroll horizontal) */}
              <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border lg:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Akun</th>
                      <th className="px-4 py-3 font-medium">Plan</th>
                      <th className="px-4 py-3 font-medium">Sisa limit</th>
                      <th className="px-4 py-3 font-medium">Request</th>
                      <th className="px-4 py-3 font-medium">Model favorit</th>
                      <th className="px-4 py-3 font-medium">Umur</th>
                      <th className="px-4 py-3 font-medium">Aktif</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((u) => (
                      <tr
                        key={u.user_id}
                        onClick={() => setSelected(u)}
                        className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface/50"
                      >
                        <td className="max-w-[240px] px-4 py-3">
                          <span className="block truncate font-medium">
                            {u.display_name || u.email}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {u.email}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.plan === "premium" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[12px] font-semibold text-accent">
                              <Crown className="size-3" /> Premium
                            </span>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">Free</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {u.quota_left_today}/{u.quota_limit_today}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{num(u.total_requests)}</td>
                        <td className="max-w-[170px] px-4 py-3">
                          <span className="block truncate font-mono text-[12px] text-muted-foreground">
                            {u.favorite_model ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {u.account_age_days === null ? "—" : `${u.account_age_days}h`}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-muted-foreground">
                          {relative(u.inactive_days)}
                        </td>
                        <td className="px-4 py-3">
                          {u.banned ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[12px] font-semibold text-destructive">
                              <Ban className="size-3" />
                              {u.ban_permanent ? "Permanen" : u.ban_left}
                            </span>
                          ) : u.is_admin ? (
                            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
                              <BadgeCheck className="size-3.5" /> Admin
                            </span>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">Aktif</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length === 0 ? (
                  <p className="bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                    Tidak ada pengguna di filter ini.
                  </p>
                ) : null}
              </div>

              <div className="mt-4 grid gap-2.5 lg:hidden">
                {shown.map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => setSelected(u)}
                    className="panel px-4 py-3.5 text-left transition-colors hover:border-accent/40"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {u.display_name || u.email}
                        </span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                      {u.banned ? (
                        <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                          Diban
                        </span>
                      ) : u.plan === "premium" ? (
                        <span className="shrink-0 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">
                          Premium
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                      <span>
                        Limit {u.quota_left_today}/{u.quota_limit_today}
                      </span>
                      <span>{num(u.total_requests)} request</span>
                      <span>{relative(u.inactive_days)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </main>

      {selected ? (
        <UserDrawer
          user={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            void load(search.trim()).then(() => setSelected(null));
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ komponen UI */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  i,
  span,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  i: number;
  span?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={`reveal panel px-5 py-5 ${span ? "sm:col-span-2 lg:col-span-1" : ""}`}
      style={{ ["--i" as string]: i }}
    >
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5 text-accent" /> {label}
      </p>
      <p className="stat-figure mt-4 text-[34px]">{value}</p>
      {sub ? <p className="mt-1.5 text-[12px] text-muted-foreground">{sub}</p> : null}
    </motion.div>
  );
}

function Panel({
  title,
  hint,
  children,
  i,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  i: number;
}) {
  return (
    <div className="reveal panel px-5 py-5" style={{ ["--i" as string]: i }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[15px] font-bold tracking-tight">{title}</h3>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
