import { motion } from "motion/react";
import { ShieldOff, Mail, LogOut, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { BanInfo } from "@/lib/admin-api";

/**
 * Layar yang menggantikan SELURUH aplikasi ketika akun sedang diban.
 * Ditampilkan oleh layout /_authenticated sebelum route anak dirender,
 * jadi user yang diban tidak bisa menyentuh fitur apa pun.
 */
export function BannedScreen({ ban, email }: { ban: BanInfo; email?: string | null }) {
  const cs = "cs@cortexclip.app";

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-5 py-16 text-foreground">
      {/* latar: satu gradasi tipis, tanpa mesh berat */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 0%, color-mix(in oklab, var(--color-destructive) 12%, transparent), transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-xl"
      >
        <div className="panel p-7 sm:p-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-destructive">
            <ShieldOff className="size-3.5" /> Akses ditangguhkan
          </span>

          <h1 className="mt-6 font-display text-[26px] leading-[1.1] font-bold tracking-tight sm:text-[34px]">
            Akun anda telah di ban
            <br />
            <span className="text-destructive">
              {ban.permanent ? "selamanya" : `selama ${ban.duration_left}`}
            </span>
          </h1>

          <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
            Tolong hubungi customer service kami untuk memohon pengembalian akun atau buat akun
            baru.
          </p>

          <dl className="mt-7 grid gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-2">
            <div className="bg-card px-4 py-3.5">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Akun
              </dt>
              <dd className="mt-1 truncate text-sm font-medium">{email ?? "—"}</dd>
            </div>
            <div className="bg-card px-4 py-3.5">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Durasi
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                <Clock className="size-3.5 text-muted-foreground" />
                {ban.permanent ? "Permanen" : ban.duration_left}
              </dd>
            </div>
            {ban.reason ? (
              <div className="bg-card px-4 py-3.5 sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Alasan
                </dt>
                <dd className="mt-1 text-sm">{ban.reason}</dd>
              </div>
            ) : null}
            {!ban.permanent && ban.banned_until ? (
              <div className="bg-card px-4 py-3.5 sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Aktif kembali
                </dt>
                <dd className="mt-1 text-sm">
                  {new Date(ban.banned_until).toLocaleString("id-ID", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <Button variant="accent" asChild className="sm:w-auto">
              <a href={`mailto:${cs}?subject=Permohonan%20pengembalian%20akun%20CortexClip`}>
                <Mail className="size-4" /> Hubungi customer service
              </a>
            </Button>
            <Button variant="outline" onClick={() => void signOut()} className="sm:w-auto">
              <LogOut className="size-4" /> Keluar
            </Button>
          </div>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Email CS: <span className="font-medium text-foreground">{cs}</span> · Sertakan alamat
            email akun kamu agar pengajuan bisa diproses lebih cepat.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
