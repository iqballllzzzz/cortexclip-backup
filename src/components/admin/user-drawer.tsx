import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, ShieldOff, ShieldCheck, X, Crown, Activity, Cpu, Trash2, FolderX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  banUser,
  unbanUser,
  setUserPlan,
  setUserAdmin,
  deleteAdminUser,
  deleteAdminUserProjects,
  fetchAdminUserDetail,
  submitAdminRequest,
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
  const [confirmDelUser, setConfirmDelUser] = useState(false);
  const [confirmDelProjects, setConfirmDelProjects] = useState(false);

  const [requestModal, setRequestModal] = useState<{ isOpen: boolean; action: string; payload: any } | null>(null);
  const [requestReason, setRequestReason] = useState("");


  useEffect(() => {
    let alive = true;
    void fetchAdminUserDetail(user.user_id)
      .then((d) => alive && setDetail(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.user_id]);

  
  async function act(action: string, payload: any, fn: () => Promise<unknown>, okMsg: string) {
    if (user.is_owner) {
      toast.error("Tidak dapat mengubah akun Owner / Superadmin.");
      return;
    }
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      onChanged();
    } catch (err: any) {
      if (err.message && err.message.includes("Owner")) {
        setRequestModal({ isOpen: true, action, payload });
      } else {
        toast.error(err.message || "Aksi gagal");
      }
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
            <div className="flex items-center gap-2">
              <p className="truncate font-display text-base font-bold tracking-tight">
                {user.display_name || user.email || "Tanpa nama"}
              </p>
              {user.auth_provider === "google" && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 text-[10px] font-bold text-blue-400">
                  <svg className="size-2.5" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  Google
                </span>
              )}
            </div>
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
              ["Metode login", user.auth_provider === "google" ? "Google" : "Email"],
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

          {!user.is_owner && (user.banned ? (
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
                onClick={() => void act('unban_user', {}, () => unbanUser(user.user_id), "Ban dicabut.")}
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
                          'ban_user', { duration, reason },
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
          ))}

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
                  onClick={() => void act('set_plan', { plan: p.key }, () => setUserPlan(user.user_id, p.key), `Plan → ${p.label}`)}
                >
                  {p.key !== "free" ? <Crown className="size-3.5" /> : null}
                  {p.label}
                </Button>
              ))}
            </div>
            {user.is_owner ? (
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 rounded-lg">
                <Crown className="size-4 shrink-0 text-amber-400" />
                <span>Akun Owner / Superadmin (Permanen &amp; Terlindungi)</span>
              </div>
            ) : (
              <Button
                size="sm"
                variant={user.is_admin ? "outline" : "ghost"}
                className="mt-3"
                disabled={busy}
                onClick={() =>
                  void act(
                    'set_admin', { is_admin: !user.is_admin },
                    () => setUserAdmin(user.user_id, !user.is_admin),
                    user.is_admin ? "Akses admin dicabut." : "Akses admin diberikan.",
                  )
                }
              >
                <ShieldCheck className="size-4" />
                {user.is_admin ? "Cabut akses admin" : "Jadikan admin"}
              </Button>
            )}
          </section>

          {/* Tindakan Akun: Hapus Proyek & Hapus Akun */}
          {!user.is_owner && (
            <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                Tindakan Akun & Server
              </p>

              {/* Hapus Semua Proyek */}
              <div>
                {confirmDelProjects ? (
                  <div className="space-y-2 rounded-lg border border-destructive/40 bg-card p-3">
                    <p className="text-xs font-medium text-destructive">
                      Yakin hapus SEMUA proyek akun ini? Proyek dan klip user akan kosong kembali.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() =>
                          void act('delete_projects', {}, async () => {
                            await deleteAdminUserProjects(user.user_id);
                            setConfirmDelProjects(false);
                          }, "Semua proyek user berhasil dikosongkan.")
                        }
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Ya, Hapus Semua Proyek"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelProjects(false)}>
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-start text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                    disabled={busy}
                    onClick={() => setConfirmDelProjects(true)}
                  >
                    <FolderX className="size-3.5 mr-1.5" /> Hapus Semua Proyek Akun
                  </Button>
                )}
              </div>

              {/* Hapus Akun Permanen */}
              <div>
                {confirmDelUser ? (
                  <div className="space-y-2 rounded-lg border border-destructive/40 bg-card p-3">
                    <p className="text-xs font-medium text-destructive">
                      PERINGATAN: Yakin hapus akun ini secara permanen dari server? Tindakan tidak bisa dibatalkan.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() =>
                          void act('delete_user', {}, async () => {
                            await deleteAdminUser(user.user_id);
                            onClose();
                          }, "Akun user berhasil dihapus permanen dari server.")
                        }
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Ya, Hapus Akun Permanen"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelUser(false)}>
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full justify-start text-xs"
                    disabled={busy}
                    onClick={() => setConfirmDelUser(true)}
                  >
                    <Trash2 className="size-3.5 mr-1.5" /> Hapus Akun Permanen
                  </Button>
                )}
              </div>
            </section>
          )}

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

      {requestModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground">Permintaan Izin Terkunci</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Aksi ini memerlukan izin dari Owner (Iqbal). Tulis alasan mengapa Anda ingin melakukan ini.
            </p>
            <textarea
              className="mt-4 w-full rounded-md border border-border bg-surface p-3 text-sm focus:border-accent focus:outline-none"
              rows={3}
              placeholder="Berikan alasan..."
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-3">
              <Button size="sm" variant="ghost" onClick={() => setRequestModal(null)}>Batal</Button>
              <Button size="sm" variant="accent" disabled={busy || !requestReason.trim()} onClick={async () => {
                setBusy(true);
                try {
                  await submitAdminRequest({
                    action_type: requestModal.action,
                    target_user_id: user.user_id,
                    target_email: user.email || "",
                    payload: requestModal.payload,
                    reason: requestReason,
                  });
                  toast.success("Permohonan berhasil dikirim ke Owner.");
                  setRequestModal(null);
                  setRequestReason("");
                } catch(e:any) {
                  toast.error(e.message || "Gagal mengirim permohonan");
                } finally {
                  setBusy(false);
                }
              }}>Kirim Permohonan</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
