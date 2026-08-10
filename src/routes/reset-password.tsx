import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { Lock, ArrowRight, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/cortexclip-logo.png";

const title = "Reset Password — CortexClip";
const description = "Atur password baru untuk akun CortexClip kamu.";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Password tidak cocok.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password minimal 6 karakter.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password berhasil diubah!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5">
        <div className="absolute inset-0 aurora" aria-hidden="true" />
        <div className="absolute inset-0 grid-lines opacity-30" aria-hidden="true" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lift"
        >
          <div className="flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-accent/15">
              <CheckCircle2 className="size-7 text-accent" />
            </div>
          </div>
          <h1 className="mt-5 text-2xl font-bold">Password diperbarui</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Password kamu sudah berhasil diubah. Silakan masuk dengan password baru.
          </p>
          <Button
            variant="accent"
            className="mt-6 w-full"
            onClick={() => navigate({ to: "/auth", replace: true })}
          >
            Masuk Sekarang <ArrowRight className="size-4" />
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5">
      <div className="absolute inset-0 aurora" aria-hidden="true" />
      <div className="absolute inset-0 grid-lines opacity-30" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lift"
      >
        <div className="flex items-center justify-center gap-2">
          <img
            src={logo}
            alt="Logo CortexClip"
            width={36}
            height={36}
            className="h-9 w-9 dark:invert"
          />
          <span className="font-display text-xl font-bold tracking-tight">CortexClip</span>
        </div>

        <h1 className="mt-6 text-2xl font-bold">Atur password baru</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Masukkan password baru untuk akun CortexClip kamu.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">
              Password baru
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-xs">
              Konfirmasi password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirm"
                type="password"
                required
                minLength={6}
                placeholder="Ulangi password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Button type="submit" variant="accent" className="w-full" disabled={busy}>
            {busy ? "Memproses…" : "Simpan Password Baru"}
            {!busy && <ArrowRight className="size-4" />}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
