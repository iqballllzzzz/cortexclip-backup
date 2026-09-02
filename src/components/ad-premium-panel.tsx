/**
 * Panel "Premium GRATIS dengan menonton iklan".
 *
 * Aturan (ditegakkan di server, lihat backend/app/ad_premium.py):
 *   1 hari  = 8 iklan    — sekali jalan, tidak bisa dicicil
 *   7 hari  = 45 iklan   — sekali jalan, tidak bisa dicicil
 *   30 hari = 340 iklan  — BOLEH dicicil, progres tersimpan
 */
import { useCallback, useEffect, useState } from "react";
import { Gift, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { AdFullscreen } from "@/components/ad-fullscreen";
import { getAccessToken } from "@/lib/backend-api";

type AdPlan = {
  key: string;
  label: string;
  ads: number;
  days: number;
  installment: boolean;
};

type AdStatus = {
  adsense_client: string;
  plans: AdPlan[];
  target: string | null;
  credits: number;
  needed: number;
  remaining?: number;
};

async function apiAds(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `HTTP ${res.status}`);
  return res.json();
}

export function AdPremiumPanel({ onUpgraded }: { onUpgraded?: () => void }) {
  const [st, setSt] = useState<AdStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      setSt(await apiAds("/api/ads/premium"));
    } catch {
      /* tidak login / offline */
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const aktif = st?.plans.find((p) => p.key === (plan ?? st?.target));
  const kredit = st?.target === (plan ?? st?.target) ? (st?.credits ?? 0) : 0;
  const butuh = aktif?.ads ?? 0;
  const siap = butuh > 0 && kredit >= butuh;

  async function tontonSelesai() {
    setShowAd(false);
    if (!plan) return;
    setBusy(true);
    try {
      const d = await apiAds("/api/ads/premium/watch", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      if (d.ok === false) {
        toast.error(`Tunggu ${d.tunggu_detik ?? 8}s sebelum iklan berikutnya`);
      } else {
        toast.success(`Iklan ${d.credits}/${d.needed} tercatat`);
      }
      await muat();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mencatat iklan");
    } finally {
      setBusy(false);
    }
  }

  async function tukar() {
    if (!plan) return;
    setBusy(true);
    try {
      const d = await apiAds("/api/ads/premium/redeem", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      toast.success(`Premium ${d.label} aktif! Watermark hilang 🎉`);
      onUpgraded?.();
      await muat();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menukar");
    } finally {
      setBusy(false);
    }
  }

  if (!st) return null;

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Gift className="size-4 shrink-0 text-accent" />
        Premium bisa didapatkan secara GRATIS melalui menonton iklan!
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Pilih paket, tonton iklannya, premium langsung aktif — tanpa bayar.
        Premium juga menghilangkan watermark.
      </p>

      <div className="mt-3 space-y-2">
        {st.plans.map((p) => {
          const dipilih = (plan ?? st.target) === p.key;
          const progres = st.target === p.key ? st.credits : 0;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPlan(p.key)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                dipilih ? "border-accent bg-accent/10" : "border-border hover:border-accent/60"
              }`}
            >
              <span>
                <span className="block text-sm font-semibold">
                  {p.label} premium
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {p.ads} iklan
                  {p.installment ? " · bisa dicicil" : " · harus sekali jalan"}
                </span>
              </span>
              <span className="text-xs font-bold tabular-nums text-accent">
                {progres}/{p.ads}
              </span>
            </button>
          );
        })}
      </div>

      {aktif ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${Math.min(100, (kredit / butuh) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {siap
              ? "Kredit cukup — tukar sekarang!"
              : `Sisa ${butuh - kredit} iklan lagi${aktif.installment ? " (boleh dilanjut nanti)" : " tanpa jeda lama"}`}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => (siap ? void tukar() : setShowAd(true))}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PlayCircle className="size-4" />
            )}
            {siap ? "Tukar jadi premium" : "Tonton iklan"}
          </button>
        </div>
      ) : null}

      {showAd && plan ? (
        <AdFullscreen
          client={st.adsense_client}
          index={kredit + 1}
          total={butuh}
          onDone={() => void tontonSelesai()}
          onCancel={() => setShowAd(false)}
        />
      ) : null}
    </div>
  );
}
