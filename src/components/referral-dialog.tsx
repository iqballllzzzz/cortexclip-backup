import { useState, useEffect } from "react";
import { Gift, Copy, Check, Users, Sparkles, X, Share2 } from "lucide-react";
import { toast } from "sonner";
import { getAccessToken } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";

interface ReferralData {
  referral_code: string;
  referral_count: number;
  bonus_credits: number;
  referred_by: string | null;
  share_url: string;
  reward_info: string;
}

export function ReferralDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/referral/my-code", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        /* ignore */
      }
    })();
  }, [open]);

  const handleCopy = () => {
    const url = data?.share_url;
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link referral berhasil disalin ke clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Gift className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Program Undangan & Bonus</h2>
            <p className="text-xs text-muted-foreground">Ajak teman, dapatkan tiket bebas watermark gratis!</p>
          </div>
        </div>

        {/* STATS KARTU */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-surface/50 p-3.5 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Teman Bergabung</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">
              {data?.referral_count ?? 0}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-center">
            <p className="text-[11px] font-medium text-amber-300">Tiket Bebas Watermark</p>
            <p className="mt-1 font-display text-2xl font-bold text-amber-400">
              {data?.bonus_credits ?? 0}
            </p>
          </div>
        </div>

        {/* LINK SHARE */}
        <div className="mt-5 space-y-2">
          <label className="text-xs font-semibold text-foreground">Link Referral Kamu:</label>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background p-2">
            <input
              type="text"
              readOnly
              value={data?.share_url || "Menyiapkan link..."}
              className="min-w-0 flex-1 bg-transparent px-1 text-xs text-foreground outline-none font-mono"
            />
            <Button
              size="sm"
              variant="accent"
              disabled={!data?.share_url}
              onClick={handleCopy}
              className="h-8 gap-1 rounded-lg px-3 text-xs"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Tersalin" : "Salin"}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            🎁 Setiap 1 teman baru yang mendaftar lewat tautanmu, kamu langsung mendapatkan <strong>1 tiket unduh bebas watermark</strong>!
          </p>
        </div>
      </div>
    </div>
  );
}
