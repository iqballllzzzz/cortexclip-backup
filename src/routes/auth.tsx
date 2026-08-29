import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Lock, Mail, Sparkles, User, CheckCircle2, Film, Captions, TrendingUp, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import logo from "@/assets/cortexclip-logo.png";

const title = "Masuk atau Daftar — CortexClip";
const description =
  "Buat akun CortexClip untuk mulai mengubah video panjang jadi klip viral otomatis.";

export const Route = createFileRoute("/auth")({
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
  component: AuthPage,
});

const perks = [
  { icon: Captions, text: "Caption karaoke tanpa delay" },
  { icon: TrendingUp, text: "Virality score tiap potongan" },
  { icon: Zap, text: "Siap unggah dalam menit" },
];

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || undefined },
          },
        });
        if (error) throw error;
        setConfirmSent(true);
        toast.success("Akun dibuat! Cek email kamu untuk konfirmasi.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Berhasil masuk!");
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      toast.error("Masukkan email kamu dulu.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Link reset password telah dikirim ke email kamu.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (confirmSent) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5">
        <div className="absolute inset-0 mesh-gradient" aria-hidden="true" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full max-w-md rounded-2xl border border-border bg-card/80 p-8 shadow-lift backdrop-blur-xl"
        >
          <div className="flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-accent/15">
              <CheckCircle2 className="size-7 text-accent" />
            </div>
          </div>
          <h1 className="mt-5 text-center text-2xl font-bold">Cek email kamu</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Kami sudah mengirim link konfirmasi ke{" "}
            <span className="font-semibold text-foreground">{email}</span>. Klik link tersebut
            untuk mengaktifkan akun kamu.
          </p>
          <Link
            to="/auth"
            className="mt-6 block text-center text-sm text-accent hover:underline"
            onClick={() => {
              setConfirmSent(false);
              setMode("login");
            }}
          >
            Sudah konfirmasi? Masuk di sini
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-stretch overflow-hidden">
      {/* Left: branding panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-card/40 p-12 lg:flex">
        <div className="absolute inset-0 mesh-gradient" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-16 top-1/3 size-72 rounded-full bg-accent/15 blur-3xl animate-pulse-glow" aria-hidden="true" />

        <div className="relative">
          <Link to="/" className="flex items-center gap-2">
            <img
              src={logo}
              alt="Logo CortexClip"
              width={36}
              height={36}
              className="h-9 w-9 dark:invert"
            />
            <span className="font-display text-xl font-bold tracking-tight">
              Cortex<span className="text-gradient-amber">Clip</span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex size-14 items-center justify-center rounded-2xl bg-accent/15"
          >
            <Film className="size-7 text-accent" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-4xl font-bold leading-tight"
          >
            Satu video panjang,{" "}
            <span className="text-gradient-amber">puluhan klip viral.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-4 text-muted-foreground"
          >
            AI memotong, menulis judul, memberi skor, dan menempelkan caption karaoke secara otomatis.
          </motion.p>

          <div className="mt-8 space-y-3">
            {perks.map((p, i) => (
              <motion.div
                key={p.text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <p.icon className="size-4" />
                </span>
                {p.text}
              </motion.div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-muted-foreground">
          © {new Date().getFullYear()} CortexClip — dibuat oleh M Iqbal
        </p>
      </div>

      {/* Right: form panel */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-12">
        <div className="absolute inset-0 mesh-gradient lg:hidden" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-20 top-20 size-64 rounded-full bg-accent/10 blur-3xl animate-pulse-glow" aria-hidden="true" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative w-full max-w-md rounded-2xl border border-border bg-card/80 p-8 shadow-lift backdrop-blur-xl"
        >
          {/* Mobile logo */}
          <div className="mb-6 flex justify-center lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <img
                src={logo}
                alt="Logo CortexClip"
                width={32}
                height={32}
                className="h-8 w-8 dark:invert"
              />
              <span className="font-display text-lg font-bold tracking-tight">
                Cortex<span className="text-gradient-amber">Clip</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-accent" />
            AI auto-clipper untuk podcast & webinar
          </div>

          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "login" | "signup")}
            className="mt-6"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Masuk</TabsTrigger>
              <TabsTrigger value="signup">Daftar</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <p className="text-sm text-muted-foreground">
                Selamat datang kembali. Masuk untuk lanjut mengubah video jadi klip viral.
              </p>
            </TabsContent>
            <TabsContent value="signup" className="mt-6">
              <p className="text-sm text-muted-foreground">
                Gratis, tanpa kartu kredit. Buat akun untuk mulai klip video.
              </p>
            </TabsContent>
          </Tabs>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  Nama tampilan
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Nama kamu"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="kamu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs">
                  Password
                </Label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-accent hover:underline"
                  >
                    Lupa password?
                  </button>
                )}
              </div>
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

            <Button type="submit" variant="accent" className="w-full group" disabled={busy}>
              {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Buat Akun"}
              {!busy && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Dengan mendaftar, kamu menyetujui syarat layanan dan kebijakan privasi CortexClip.
          </p>
        </motion.div>
      </div>
    </div>
  );
}