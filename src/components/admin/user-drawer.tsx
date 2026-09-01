import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, ShieldOff, ShieldCheck, X, Crown, Activity, Cpu } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  banUser,
  unbanUser,
  setUserPlan,
  setUserAdmin,
  fetchAdminUserDetail,
  type AdminUser,
  type AdminUserDetail,
  type BanDuration,
} from "@/lib/admin-api";

const DURATIONS: { key: BanDuration; label: string; hint: string }[] = [
  { key: "1d", label: "1 Hari", hint: "peringatan ringan" },
  { key: "5d", label: "5 Hari", hint: "pelanggaran berulang" },
  { key: "1mo", label: "1 Bulan", hint: "penyalahgunaan berat" },
  { key: "permanent", label: "Selamanya", hint: "tidak bisa kembali" },
];

const PLAN_OPTIONS = [
  { key: "free", label: "Free" },
  { key: "day", label: "Premium 1 hari" },
  { key: "5day", label: "Premium 5 hari" },
  { key: "month", label: "Premium 1 bulan" },
  { key: "year", label: "Premium 1 tahun" },
];

function fmt(dt: string | null | undefined) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Panel samping detail user: aktivitas, model yang dipakai, aksi ban/unban,
 * ubah plan, dan toggle admin. Semua aksi konfirmasi lewat state lokal.
 */
export function UserDrawer({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [duration, setDuration] = useState<BanDuration>("1d");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchAdminUserDetail(user.user_id)
      .then((d) => alive && setDetail(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.user_id]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aksi gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex justify-end">
      <button
        aria-label="Tutup panel"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <motion.aside
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background"
      >
        <header className="sticky top-0 z-[var(--z-raised)] flex items-start justify-between gap-3 border-b border-border bg-background/92 px-5 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold tracking-tight">
              {user.display_name || user.email || "Tanpa nama"}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Tutup"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 px-5 py-5">
          {/* status ringkas */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border">
            {[
              ["Plan", user.plan === "premium" ? "Premium" : "Free"],
              ["Kuota hari ini", `${user.quota_used_today}/${user.quota_limit_today}`],
              ["Total request", String(user.total_requests)],
              ["Proyek", String(user.total_projects)],
              ["Umur akun", user.account_age_days === null ? "—" : `${user.account_age_days} hari`],
              [
                "Terakhir aktif",
                user.inactive_days === null
                  ? "—"
                  : user.inactive_days === 0
                    ? "hari ini"
                    : `${user.inactive_days} hari lalu`,
              ],
            ].map(([k, v]) => (
              <div key={k} className="bg-card px-3.5 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {k}
                </p>
                <p className="mt-1 text-sm font-semibold">{v}</p>
              </div>
            ))}
          </div>

          {user.banned ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/6 px-4 py-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <ShieldOff className="size-4" /> Sedang diban
                {user.ban_permanent ? " (permanen)" : ` — sisa ${user.ban_left}`}
              </p>
              {user.ban_reason ? (
                <p className="mt-1 text-xs text-muted-foreground">Alasan: {user.ban_reason}</p>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                disabled={busy}
                onClick={() => void act(() => unbanUser(user.user_id), "Ban dicabut.")}
              >
                <ShieldCheck className="size-4" /> Buka ban (unban)
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card px-4 py-3.5">
              {!banOpen ? (
                <Button size="sm" variant="outline" onClick={() => setBanOpen(true)}>
                  <ShieldOff className="size-4" /> Ban akun ini
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Pilih durasi ban
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d.key}
                        onClick={() => setDuration(d.key)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          duration === d.key
                            ? "border-accent bg-accent/8"
                            : "border-border hover:border-accent/40"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{d.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{d.hint}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Alasan (opsional, tampil di panel admin)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => banUser(user.user_id, duration, reason),
                          `Akun diban (${DURATIONS.find((d) => d.key === duration)?.label}).`,
                        ).then(() => {
                          setBanOpen(false);
                          setReason("");
                        })
                      }
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
                      Terapkan ban
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setBanOpen(false)}>
                      Batal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* plan & admin */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Plan & peran
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act(() => setUserPlan(user.user_id, p.key), `Plan → ${p.label}`)}
                >
                  {p.key !== "free" ? <Crown className="size-3.5" /> : null}
                  {p.label}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant={user.is_admin ? "outline" : "ghost"}
              className="mt-3"
              disabled={busy}
              onClick={() =>
                void act(
                  () => setUserAdmin(user.user_id, !user.is_admin),
                  user.is_admin ? "Akses admin dicabut." : "Akses admin diberikan.",
                )
              }
            >
              <ShieldCheck className="size-4" />
              {user.is_admin ? "Cabut akses admin" : "Jadikan admin"}
            </Button>
          </section>

          {/* model dipakai */}
          <section>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Cpu className="size-3.5" /> Model dipakai (sukses)
            </p>
            {!detail ? (
              <p className="mt-3 text-sm text-muted-foreground">Memuat…</p>
            ) : detail.models.filter((m) => m.success > 0).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Belum ada request sukses.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {detail.models
                  .filter((m) => m.success > 0)
                  .slice(0, 8)
                  .map((m) => (
                    <li
                      key={m.model}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-mono text-[12px]">{m.model}</span>
                      <span className="shrink-0 font-semibold text-accent">{m.success}×</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* aktivitas terakhir */}
          <section>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Activity className="size-3.5" /> Aktivitas terakhir
            </p>
            {!detail ? (
              <p className="mt-3 text-sm text-muted-foreground">Memuat…</p>
            ) : detail.recent_activity.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                {detail.recent_activity.slice(0, 12).map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 bg-card px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{a.kind}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {a.model ?? a.provider ?? "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {fmt(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="pb-2 text-[11px] leading-relaxed text-muted-foreground">
            Bergabung {fmt(user.joined_at)} · {user.login_count}× login · {user.total_clips} klip
            dibuat.
          </p>
        </div>
      </motion.aside>
    </div>
  );
}
