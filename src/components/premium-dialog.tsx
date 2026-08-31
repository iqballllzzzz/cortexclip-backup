import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Crown, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    if (open && plans.length === 0) {
      fetch("/api/premium/plans")
        .then((r) => r.json())
        .then((d) => setPlans(d.plans ?? []))
        .catch(() => {});
    }
  }, [open, plans.length]);

  useEffect(() => {
    if (!order) return;
    const iv = setInterval(async () => {
      try {
        const d = await api(`/api/premium/order/${order.order_id}`);
        if (d.order?.status === "completed") {
          clearInterval(iv);
          setWaiting(false);
          toast.success("Pembayaran diterima — Premium aktif! 🎉");
          onUpgraded?.();
          onClose();
        }
      } catch {
        /* keep polling */
      }
    }, 3500);
    return () => clearInterval(iv);
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function pay(p: Plan) {
    setLoading(true);
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
          </>
        ) : (
          <div className="space-y-3 text-center">
            <p className="font-semibold">
              {order.label} — Rp{order.total_payment.toLocaleString("id-ID")}
            </p>
            <img
              src={`/api/premium/qr/${order.order_id}`}
              alt="QRIS"
              className="mx-auto size-56 rounded-xl border border-border bg-white p-2"
            />
            <p className="text-xs text-muted-foreground">
              Scan pakai aplikasi bank / e-wallet apa pun (QRIS). Halaman ini otomatis mendeteksi
              pembayaran — jangan tutup sebelum berhasil.
            </p>
            {waiting && (
              <p className="flex items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Menunggu pembayaran…
              </p>
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
