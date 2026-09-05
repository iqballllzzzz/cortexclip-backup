import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Lock, Mail, User, CheckCircle2, Captions, TrendingUp, Zap } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { recordLoginEvent } from "@/lib/admin-api";
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
  // Alur verifikasi KODE: pendaftar mengetik 6 digit dari email. Sebelum
  // diverifikasi, GoTrue menolak login dengan error "email_not_confirmed",
  // jadi akun benar-benar belum bisa dipakai.
  const [kode, setKode] = useState("");
  const [kirimUlangSisa, setKirimUlangSisa] = useState(0);

  // Sudah login → langsung dashboard (jangan tampilkan halaman auth lagi)
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // hitung mundur tombol "kirim ulang" (server membatasi 1 email/60 detik —
  // tanpa hitung mundur pengguna menekan berulang lalu melihat error)
  useEffect(() => {
    if (kirimUlangSisa <= 0) return;
    const id = setTimeout(() => setKirimUlangSisa((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [kirimUlangSisa]);

  async function handleVerifikasi(e: React.FormEvent) {
    e.preventDefault();
    const bersih = kode.replace(/\D/g, "");
    if (bersih.length !== 6) {
      toast.error("Kode verifikasi terdiri dari 6 angka.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: bersih,
        type: "signup",
      });
      if (error) throw error;
      toast.success("Email terverifikasi! Selamat datang.");
      void recordLoginEvent();
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Kode tidak cocok";
      toast.error(
        /expired|invalid/i.test(pesan)
          ? "Kode salah atau sudah kedaluwarsa. Minta kode baru."
          : pesan,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleKirimUlang() {
    if (kirimUlangSisa > 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Kode baru dikirim. Cek email kamu.");
      setKirimUlangSisa(60);
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal mengirim ulang";
      toast.error(
        /security purposes|rate/i.test(pesan)
          ? "Tunggu sebentar sebelum minta kode lagi."
          : pesan,
      );
      setKirimUlangSisa(60);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { display_name: displayName || undefined } },
        });
        if (error) throw error;
        setConfirmSent(true);
        setKirimUlangSisa(60);
        toast.success("Kode verifikasi dikirim ke email kamu.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // Akun yang belum diverifikasi DITOLAK server. Tampilkan layar kode
          // alih-alih pesan teknis "Email not confirmed".
          if (/email not confirmed|email_not_confirmed/i.test(error.message)) {
            setConfirmSent(true);
            toast.error("Email belum diverifikasi. Masukkan kode dari email kamu.");
            return;
          }
          throw error;
        }
        toast.success("Berhasil masuk!");
        void recordLoginEvent();
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan");
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
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setBusy(false);
    }
  }

  if (confirmSent) {
    return (
      <AuthShell>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass w-full max-w-md rounded-3xl p-8 text-center shadow-lg"
        >
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10">
            <CheckCircle2 className="size-6 text-accent" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Masukkan kode verifikasi</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Kami mengirim 6 angka ke{" "}
            <span className="font-semibold text-foreground">{email}</span>.
            Akun belum bisa dipakai sebelum kode ini dimasukkan.
          </p>

          <form onSubmit={handleVerifikasi} className="mt-5 space-y-3">
            <Label htmlFor="kode-verifikasi" className="sr-only">
              Kode verifikasi 6 angka
            </Label>
            <Input
              id="kode-verifikasi"
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="000000"
              aria-describedby="kode-bantuan"
              value={kode}
              onChange={(e) => setKode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-mono text-2xl tracking-[0.5em]"
            />
            <p id="kode-bantuan" className="text-xs text-muted-foreground">
              Kode berlaku 1 jam. Periksa folder spam kalau belum masuk.
            </p>
            <Button type="submit" className="w-full" disabled={busy || kode.length !== 6}>
              {busy ? "Memverifikasi…" : "Verifikasi & masuk"}
              <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </form>

          <button
            type="button"
            onClick={handleKirimUlang}
            disabled={busy || kirimUlangSisa > 0}
            className="mt-3 text-sm text-accent hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {kirimUlangSisa > 0
              ? `Kirim ulang kode (${kirimUlangSisa}s)`
              : "Kirim ulang kode"}
          </button>

          <Link
            to="/auth"
            className="mt-4 block text-sm text-muted-foreground hover:underline"
            onClick={() => {
              setConfirmSent(false);
              setKode("");
              setMode("login");
            }}
          >
            Kembali ke halaman masuk
          </Link>
        </motion.div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className="glass w-full max-w-md rounded-3xl p-8 shadow-lg"
      >
        <div className="flex justify-center">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Logo CortexClip" width={28} height={28} className="h-7 w-7 dark:invert" />
            <span className="font-display text-lg font-bold tracking-tight">
              Cortex<span className="text-foreground">Clip</span>
            </span>
          </Link>
        </div>

        <h1 className="mt-6 text-center font-display text-2xl font-bold tracking-tight">
          {mode === "login" ? "Selamat datang kembali" : "Buat akun"}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {mode === "login" ? "Masuk untuk lanjut mengubah video jadi klip." : "Gratis, tanpa kartu kredit."}
        </p>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")} className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Masuk</TabsTrigger>
            <TabsTrigger value="signup">Daftar</TabsTrigger>
          </TabsList>
          <TabsContent value="login" />
          <TabsContent value="signup" />
        </Tabs>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs text-muted-foreground">Nama tampilan</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="name" type="text" placeholder="Nama kamu" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="pl-10" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" type="email" required placeholder="kamu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
              {mode === "login" && (
                <button type="button" onClick={handleForgotPassword} className="text-xs text-accent hover:underline">
                  Lupa password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" type="password" required minLength={6} placeholder="Minimal 6 karakter" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" />
            </div>
          </div>
          <Button type="submit" variant="accent" className="w-full rounded-full" disabled={busy}>
            {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Buat Akun"}
            {!busy && <ArrowRight className="size-4" />}
          </Button>
        </form>

        <div className="mt-6 space-y-2.5 border-t border-border pt-6">
          {perks.map((p) => (
            <div key={p.text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-accent">
                <p.icon className="size-3.5" />
              </span>
              {p.text}
            </div>
          ))}
        </div>
      </motion.div>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div className="absolute inset-0 -z-10 bg-background" />
      {children}
    </div>
  );
}
