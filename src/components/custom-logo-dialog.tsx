"use client";
/**
 * CUSTOM LOGO (PREMIUM) — logo brand pengguna di klip.
 *
 * Alur sesuai permintaan:
 *  1. Pilih gambar → preview.
 *  2. Tombol "Hapus Background" → POST /api/logo/removebg
 *     (backend: gambar → URL catbox.moe → API removebg v1 → gagal → v2).
 *  3. "Setuju" → POST /api/logo/{clip_id} → logo muncul di preview,
 *     bisa di-DRAG langsung di preview (posisi tersimpan per klip).
 *
 * GATING PREMIUM (permintaan: "kalau user bukan premium mencet tambah logo
 * custom maka langsung muncul GUI premium"): cek status saat dialog dibuka —
 * non-premium langsung disodori PremiumDialog (harga + versi iklan), bukan
 * cuma ditolak saat menekan Setuju.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Crown, Eraser, ImageIcon, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { getAccessToken } from "@/lib/backend-api";
import { PremiumDialog } from "@/components/premium-dialog";

export function CustomLogoDialog({
  clipId,
  onClose,
  onAgree,
}: {
  clipId: string;
  onClose: () => void;
  onAgree: (pngUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [asli, setAsli] = useState<string | null>(null);
  const [hasil, setHasil] = useState<string | null>(null);
  const [versi, setVersi] = useState<string | null>(null);
  const [proses, setProses] = useState<"idle" | "removebg" | "setuju">("idle");
  const [butuhPremium, setButuhPremium] = useState(false);
  const [statusCek, setStatusCek] = useState<"cek" | "premium" | "free">("cek");

  /* cek status premium SEKALI saat dialog dibuka */
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/ads/premium", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          const prem = !!d.premium_until && new Date(d.premium_until) > new Date();
          setStatusCek(prem || d.ad_premium?.active ? "premium" : "free");
          if (!prem) setButuhPremium(true);
          return;
        }
      } catch { /* offline */ }
      setStatusCek("free");
      setButuhPremium(true);
    })();
  }, []);

  function pilihFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/image\/(png|jpeg|jpg|webp)/.test(f.type)) {
      toast.error("Pilih gambar PNG/JPG/WebP");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error("Maksimal 25 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAsli(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function hapusBackground() {
    if (!asli) return;
    setProses("removebg");
    try {
      const blob = await (await fetch(asli)).blob();
      const fd = new FormData();
      fd.append("file", blob, "logo.png");
      const token = await getAccessToken();
      const res = await fetch("/api/logo/removebg", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Gagal hapus background");
      const blob2 = await res.blob();
      setVersi(res.headers.get("X-Removebg-Version"));
      setHasil(URL.createObjectURL(blob2));
      toast.success(`Background dihapus (${res.headers.get("X-Removebg-Version") ?? "v1"})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal hapus background");
    } finally {
      setProses("idle");
    }
  }

  async function setuju() {
    const b64 = hasil ?? asli;
    if (!b64) return;
    setProses("setuju");
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/logo/${clipId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ png_b64: b64, cx: 0.87, cy: 0.05, scale: 0.18 }),
      });
      if (res.status === 402) {
        setButuhPremium(true);
        throw new Error("Custom Logo khusus Premium");
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Gagal menyimpan logo");
      const d = await res.json();
      onAgree(d.logo?.url ?? "");
      toast.success("Logo terpasang — geser di preview untuk atur posisinya");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan logo");
    } finally {
      setProses("idle");
    }
  }

  /* NON-PREMIUM → langsung GUI beli premium (harga + versi iklan) */
  if (butuhPremium) {
    return (
      <PremiumDialog
        open
        onClose={onClose}
      />
    );
  }

  if (statusCek === "cek") {
    return (
      <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memeriksa status akun…
        </div>
      </div>
    );
  }

  const tampil = hasil ?? asli;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-4">
      <motion.button
        aria-label="Tutup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <ImageIcon className="size-4 shrink-0 text-accent" />
          <p className="flex-1 truncate font-display text-sm font-bold tracking-tight">
            Add Custom Logo
          </p>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
            <Crown className="size-2.5" /> Premium
          </span>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {butuhPremium ? (
            <div className="rounded-xl border border-accent/30 bg-accent/8 px-3 py-2.5 text-[11.5px] leading-relaxed text-foreground">
              <p className="flex items-center gap-1.5 font-semibold">
                <Crown className="size-3.5 text-accent" /> Khusus Premium
              </p>
              <p className="mt-1 text-muted-foreground">
                Premium bebas watermark, jadi kamu bebas pasang logo brand
                sendiri. Upgrade lewat tombol Upgrade di atas.
              </p>
            </div>
          ) : null}

          {/* zona upload / preview */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-background transition-colors hover:border-accent/50"
          >
            {tampil ? (
              <img src={tampil} alt="Logo" className="max-h-full max-w-full object-contain p-3" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="size-6" />
                <span className="text-[12px] font-medium">Pilih gambar logo</span>
                <span className="text-[10px]">PNG / JPG / WebP · maks 25 MB</span>
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pilihFile} className="hidden" />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!asli || proses !== "idle"}
              onClick={() => void hapusBackground()}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-50"
            >
              {proses === "removebg" ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />}
              Hapus Background
            </button>
            <button
              type="button"
              disabled={!asli || proses !== "idle"}
              onClick={() => void setuju()}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-accent-foreground transition-all hover:brightness-105 active:scale-95 disabled:opacity-50"
            >
              {proses === "setuju" ? <Loader2 className="size-4 animate-spin" /> : null}
              Setuju
            </button>
          </div>
          {versi ? (
            <p className="text-center text-[10px] text-muted-foreground">
              Background dihapus via removebg {versi}
            </p>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
