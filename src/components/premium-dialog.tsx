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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-background p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tombol tutup DIJADIKAN sticky: dialog ini bisa lebih tinggi dari
            layar HP, dan saat isinya digulir tombol X ikut hilang ke atas
            sehingga dialog terasa tidak bisa ditutup. */}
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between gap-2 border-b border-border bg-background px-4 pb-2.5 pt-4 sm:-mx-5 sm:-mt-5 sm:px-5 sm:pt-5">
          <h2 className="flex min-w-0 items-center gap-2 text-[17px] font-bold">
            <Crown className="size-4 shrink-0 text-accent" />
            <span className="truncate">Upgrade Premium</span>
          </h2>
          <button
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Tutup"
          >
            <X className="size-4" />
          </button>
        </div>

        {!order ? (
          <>
            {/* MANFAAT — dulu tiga baris <li> setinggi ~66px. Dipadatkan jadi
                satu baris chip: isinya sama (10 video/hari, 40 klip, aktif
                langsung) tapi hemat ~44px sehingga panel "atau gratis" ikut
                terlihat tanpa menggulir di layar HP. */}
            <ul className="mb-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <li className="flex items-center gap-1">
                <Check className="size-3.5 shrink-0 text-accent" />
                10 video/hari <span className="opacity-60">(free 2)</span>
              </li>
              <li className="flex items-center gap-1">
                <Check className="size-3.5 shrink-0 text-accent" />
                40 klip/video <span className="opacity-60">(free 10)</span>
              </li>
              <li className="flex items-center gap-1">
                <Check className="size-3.5 shrink-0 text-accent" />
                aktif langsung
              </li>
            </ul>

            {/* PERBANDINGAN HARGA — angka pesaing dari halaman harga resmi
                OpusClip (Juni 2026), bukan klaim kosong. Dipadatkan dari kotak
                3 baris + paragraf jadi SATU baris: dua harga bersebelahan
                sudah menyampaikan seluruh argumennya. */}
            <p className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2 text-[12px]">
              <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                OpusClip ±Rp240rb/bln
              </span>
              <span className="font-bold text-accent">→ di sini Rp70rb/bln</span>
              <span className="text-[11px] text-muted-foreground">
                tanpa kredit per menit
              </span>
            </p>

            {/* PAKET 2 KOLOM — dulu 4 tombol bertumpuk (~57px each = 228px).
                Grid 2x2 memangkasnya jadi ~150px tanpa menghilangkan satu pun
                harga, label, atau jumlah hari. Harga per hari ditampilkan
                supaya pengguna bisa membandingkan paket tanpa berhitung. */}
            <div className="grid grid-cols-2 gap-2">
              {plans.map((p) => {
                const perHari = p.days > 0 ? Math.round(p.amount / p.days) : p.amount;
                const termurah =
                  plans.length > 1 &&
                  plans.every(
                    (q) =>
                      q.key === p.key ||
                      (q.days > 0 ? q.amount / q.days : q.amount) >= perHari,
                  );
                return (
                  <button
                    key={p.key}
                    onClick={() => void pay(p)}
                    disabled={loading}
                    className={`relative rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                      termurah
                        ? "border-accent bg-accent/[0.06]"
                        : "border-border hover:border-accent"
                    }`}
                  >
                    {termurah ? (
                      <span className="absolute -top-1.5 right-2 rounded-full bg-accent px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-accent-foreground">
                        hemat
                      </span>
                    ) : null}
                    <span className="block text-[13px] font-semibold leading-tight">
                      {p.label}
                    </span>
                    <span className="mt-0.5 block font-bold tabular-nums text-accent">
                      Rp{p.amount.toLocaleString("id-ID")}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                      {p.days} hari · Rp{perHari.toLocaleString("id-ID")}/hari
                    </span>
                  </button>
                );
              })}
            </div>
            {loading && (
              <p className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Menyiapkan QRIS…
              </p>
            )}

            {/* Jalur GRATIS: premium lewat menonton iklan */}
            <div className="my-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                atau gratis
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <AdPremiumPanel
              onUpgraded={() => {
                onUpgraded?.();
                onClose();
              }}
            />
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
