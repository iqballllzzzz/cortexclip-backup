
import { useEffect, useState } from "react";
import { Copy, RefreshCw, Save, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchPricingAdmin,
  updatePricingAdmin,
  resetPricingAdmin,
  type PlanItemConfig,
} from "@/lib/admin-api";

export function AdminPricingPanel({ isOwner }: { isOwner: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Record<string, PlanItemConfig>>({});

  useEffect(() => {
    fetchPricingAdmin()
      .then((res) => {
        setPlans(res.current);
        setLoading(false);
      })
      .catch((err) => {
        toast.error("Gagal memuat config harga: " + err.message);
        setLoading(false);
      });
  }, []);

  function handleChange(key: string, field: keyof PlanItemConfig, value: string | number) {
    setPlans((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    if (!isOwner) return toast.error("Hanya Owner yang dapat mengubah harga.");
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(plans)) {
        payload[k] = {
          amount: Number(v.amount),
          original_amount: Number(v.original_amount),
          discount_label: v.discount_label,
        };
      }
      const res = await updatePricingAdmin(payload);
      setPlans(res.plans);
      toast.success("Harga paket berhasil diperbarui!");
    } catch (err: any) {
      toast.error(err.message || "Gagal menyimpan harga");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!isOwner) return toast.error("Hanya Owner yang dapat mengubah harga.");
    if (!confirm("Kembalikan semua harga ke default bawaan sistem?")) return;
    setSaving(true);
    try {
      const res = await resetPricingAdmin();
      setPlans(res.plans);
      toast.success("Harga dikembalikan ke default!");
    } catch (err: any) {
      toast.error(err.message || "Gagal mereset harga");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-5 text-sm text-muted-foreground animate-pulse">Memuat konfigurasi harga...</div>;
  }

  return (
    <div className="panel space-y-5 border border-border bg-card p-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Tag className="size-4 text-accent" />
          Pengaturan Harga & Diskon Premium
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Atur harga asli (dicoret) dan harga diskon saat ini. Jika harga asli lebih besar, persentase diskon akan dihitung otomatis.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(plans).map(([key, plan]) => (
          <div key={key} className="rounded-xl border border-border p-3 space-y-3 bg-background/50 relative overflow-hidden">
            {!isOwner && (
               <div className="absolute inset-0 bg-background/40 z-10 flex items-center justify-center backdrop-blur-[1px]">
                  <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-1 bg-black/50 border border-white/10 rounded">Hanya Owner</span>
               </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-accent">{plan.label}</p>
              {plan.original_amount > plan.amount && (
                 <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                   {plan.discount_label || `Diskon ${Math.round((1 - plan.amount / plan.original_amount) * 100)}%`}
                 </span>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Harga Saat Ini (Rp)</Label>
              <Input
                type="number"
                value={plan.amount}
                onChange={(e) => handleChange(key, "amount", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Harga Asli / Dicoret (Rp)</Label>
              <Input
                type="number"
                value={plan.original_amount}
                onChange={(e) => handleChange(key, "original_amount", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Label Diskon Kustom (opsional)</Label>
              <Input
                type="text"
                placeholder="cth: Hemat 50%"
                value={plan.discount_label}
                onChange={(e) => handleChange(key, "discount_label", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !isOwner} variant="accent" size="sm" className="gap-1.5 text-xs">
          <Save className="size-3.5" /> Simpan Perubahan
        </Button>
        <Button onClick={handleReset} disabled={saving || !isOwner} variant="outline" size="sm" className="gap-1.5 text-xs">
          <RefreshCw className="size-3.5" /> Reset Default
        </Button>
      </div>
    </div>
  );
}
