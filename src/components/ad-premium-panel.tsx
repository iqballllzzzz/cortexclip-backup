/**
 * Panel "Premium GRATIS dengan menonton iklan" — satu klik langsung tayang.
 *
 * Alur: pencet paket → popup iklan full-screen muncul SEKETIKA → setelah iklan
 * selesai, otomatis lanjut ke iklan berikutnya sampai target terpenuhi → premium
 * langsung aktif tanpa tombol tambahan. User bisa berhenti kapan saja (tombol X);
 * progres paket bulanan tersimpan dan bisa dilanjut nanti.
 *
 * Aturan ditegakkan di server (backend/app/ad_premium.py):
 *   1 hari  = 8 iklan    — sekali jalan, tidak bisa dicicil
 *   7 hari  = 45 iklan   — sekali jalan, tidak bisa dicicil
 *   30 hari = 340 iklan  — BOLEH dicicil, progres tersimpan
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
  // kredit yang dipakai untuk label "Iklan n/N" di popup — dipegang di ref
  // supaya popup berikutnya memakai angka terbaru tanpa menunggu render
  const kreditRef = useRef(0);

  const muat = useCallback(async () => {
    try {
      const d = (await apiAds("/api/ads/premium")) as AdStatus;
      setSt(d);
      return d;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const paket = st?.plans.find((p) => p.key === plan) ?? null;
  const kredit = st && st.target === plan ? st.credits : 0;

  /** Pencet paket → langsung tayangkan iklan (atau tukar kalau kredit cukup). */
  async function mulai(p: AdPlan) {
    const sudah = st?.target === p.key ? (st?.credits ?? 0) : 0;
    setPlan(p.key);
    kreditRef.current = sudah;
    if (sudah >= p.ads) {
      await tukar(p.key);
      return;
    }
    setShowAd(true);
  }

  async function tukar(key: string) {
    setBusy(true);
    try {
      const d = await apiAds("/api/ads/premium/redeem", {
        method: "POST",
        body: JSON.stringify({ plan: key }),
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

  /** Satu iklan selesai → catat, lalu lanjut otomatis sampai target terpenuhi. */
  async function selesaiSatuIklan() {
    setShowAd(false);
    if (!plan) return;
    setBusy(true);
    try {
      const d = await apiAds("/api/ads/premium/watch", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      await muat();
      if (d.ok === false) {
        toast.error(`Tunggu ${d.tunggu_detik ?? 8}s sebelum iklan berikutnya`);
        return;
      }
      kreditRef.current = d.credits;
      if (d.ready) {
        await tukar(plan);           // target terpenuhi → premium aktif
        return;
      }
      toast.success(`Iklan ${d.credits}/${d.needed} — lanjut…`);
      // jeda kecil supaya tidak menabrak batas anti-spam server
      setTimeout(() => setShowAd(true), 900);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mencatat iklan");
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
        Pencet salah satu paket di bawah — iklannya langsung tayang. Setelah
        target terpenuhi, premium aktif otomatis dan watermark hilang.
      </p>

      <div className="mt-3 space-y-2">
        {st.plans.map((p) => {
          const progres = st.target === p.key ? st.credits : 0;
          const jalan = busy && plan === p.key;
          return (
            <button
              key={p.key}
              type="button"
              disabled={busy}
              onClick={() => void mulai(p)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent/10 disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {p.label} premium — gratis
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {p.ads} iklan
                  {p.installment ? " · bisa dicicil" : " · harus sekali jalan"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {progres > 0 ? (
                  <span className="text-xs font-bold tabular-nums text-accent">
                    {progres}/{p.ads}
                  </span>
                ) : null}
                {jalan ? (
                  <Loader2 className="size-4 animate-spin text-accent" />
                ) : (
                  <PlayCircle className="size-4 text-accent" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {st.target && st.credits > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Progres tersimpan: {st.credits} iklan untuk paket{" "}
          {st.plans.find((p) => p.key === st.target)?.label ?? st.target}.
        </p>
      ) : null}

      {showAd && paket ? (
        <AdFullscreen
          client={st.adsense_client}
          index={Math.min(paket.ads, kreditRef.current + 1)}
          total={paket.ads}
          onDone={() => void selesaiSatuIklan()}
          onCancel={() => setShowAd(false)}
        />
      ) : null}
    </div>
  );
}
