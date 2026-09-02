import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Crown, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdPremiumPanel } from "@/components/ad-premium-panel";

interface Plan {
  key: string;
  label: string;
  amount: number;
  days: number;
}

interface Order {
  order_id: string;
  amount: number;
  total_payment: number;
  label: string;
  /** ISO 8601 UTC dari Pakasir (transactioncreate.payment.expired_at). */
  expired_at?: string | null;
}

/** Sisa waktu QRIS dalam mm:ss, atau null kalau tidak diketahui. */
function useCountdown(expiredAt?: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiredAt) {
      setLeft(null);
      return;
    }
    const target = new Date(expiredAt).getTime();
    if (!Number.isFinite(target)) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiredAt]);
  return left;
}

function fmtLeft(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function api(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 300) || `HTTP ${res.status}`);
  }
  return res.json();
}

export function PremiumDialog({
  open,
  onClose,
  onUpgraded,
}: {
  open: boolean;
  onClose: () => void;
  onUpgraded?: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [expired, setExpired] = useState(false);
  const left = useCountdown(order?.expired_at);

  // QRIS kadaluarsa saat hitungan habis → hentikan polling & minta buat ulang
  useEffect(() => {
    if (left === 0 && order) {
      setExpired(true);
      setWaiting(false);
    }
  }, [left, order]);

  useEffect(() => {
    if (open && plans.length === 0) {
      fetch("/api/premium/plans")
        .then((r) => r.json())
        .then((d) => setPlans(d.plans ?? []))
        .catch(() => {});
    }
  }, [open, plans.length]);

  useEffect(() => {
    if (!order || expired) return;
    const iv = setInterval(async () => {
      try {
        const d = await api(`/api/premium/order/${order.order_id}`);
        const st = d.order?.status;
        if (st === "completed") {
          clearInterval(iv);
          setWaiting(false);
          toast.success("Pembayaran diterima — Premium aktif! 🎉");
          onUpgraded?.();
          onClose();
        } else if (st === "expired" || st === "canceled") {
          // Pakasir memakai 'canceled' untuk QRIS yang lewat waktu
          clearInterval(iv);
          setExpired(true);
          setWaiting(false);
        }
      } catch {
        /* keep polling */
      }
    }, 3500);
    return () => clearInterval(iv);
  }, [order, expired]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function pay(p: Plan) {
    setLoading(true);
    setExpired(false);
    try {
      const d = await api("/api/premium/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: p.key }),
      });
      setOrder(d);
      setWaiting(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat pembayaran");
    } finally {
      setLoading(false);
    }
  }

  /** QRIS kadaluarsa tidak bisa dipakai lagi — harus order baru. */
  function reset() {
    setOrder(null);
    setExpired(false);
    setWaiting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-background p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Crown className="size-5 text-accent" /> Upgrade Premium
          </h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Tutup">
            <X className="size-4" />
          </button>
        </div>

        {!order ? (
          <>
            <ul className="mb-4 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="size-4 text-accent" /> 10 video panjang per hari (free: 2)
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-accent" /> Maks 40 klip per video (free: 10)
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-accent" /> Bayar sekali, aktif langsung
              </li>
            </ul>
            <div className="space-y-2">
              {plans.map((p) => (
                <button
                  key={p.key}
                  onClick={() => void pay(p)}
                  disabled={loading}
                  className="flex w-full items-center justify-between rounded-2xl border border-border px-4 py-3 text-left transition-colors hover:border-accent disabled:opacity-60"
                >
                  <span>
                    <span className="block font-semibold">{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.days} hari premium</span>
                  </span>
                  <span className="font-bold text-accent">Rp{p.amount.toLocaleString("id-ID")}</span>
                </button>
              ))}
            </div>
            {loading && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Menyiapkan QRIS…
              </p>
            )}

            {/* Jalur GRATIS: premium lewat menonton iklan */}
            <div className="mt-4">
              <AdPremiumPanel
                onUpgraded={() => {
                  onUpgraded?.();
                  onClose();
                }}
              />
            </div>
          </>
        ) : (
          <div className="space-y-3 text-center">
            <p className="font-semibold">
              {order.label} — Rp{order.total_payment.toLocaleString("id-ID")}
            </p>
            <div className="relative mx-auto w-fit">
              <img
                src={`/api/premium/qr/${order.order_id}`}
                alt="QRIS"
                className={`mx-auto size-56 rounded-xl border border-border bg-white p-2 transition ${
                  expired ? "opacity-30 blur-[2px]" : ""
                }`}
              />
              {expired ? (
                <div className="absolute inset-0 grid place-items-center">
                  <span className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
                    QRIS KADALUARSA
                  </span>
                </div>
              ) : null}
            </div>

            {expired ? (
              <>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  Waktu pembayaran habis. QRIS ini tidak bisa dipakai lagi.
                </p>
                <p className="text-xs text-muted-foreground">
                  Buat pesanan baru untuk mendapatkan QRIS yang masih berlaku.
                </p>
                <Button variant="accent" size="sm" onClick={reset}>
                  Buat QRIS baru
                </Button>
              </>
            ) : (
              <>
                {left !== null ? (
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      left <= 300 ? "text-red-600 dark:text-red-400" : "text-foreground"
                    }`}
                  >
                    Bayar sebelum {fmtLeft(left)}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({new Date(order.expired_at!).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      WIB)
                    </span>
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Scan pakai aplikasi bank / e-wallet apa pun (QRIS). Halaman ini otomatis
                  mendeteksi pembayaran — jangan tutup sebelum berhasil.
                </p>
                {waiting && (
                  <p className="flex items-center justify-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" /> Menunggu pembayaran…
                  </p>
                )}
              </>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Tutup
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
