import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MessageSquare, Mail, Phone, Clock, Send, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/kontak")({
  head: () => ({
    meta: [
      { title: "Hubungi Kami — Layanan Bantuan CortexClip AI" },
      {
        name: "description",
        content:
          "Pusat bantuan dan kontak resmi CortexClip AI. Hubungi tim teknis dan customer service melalui WhatsApp resmi, email, atau saluran komunitas pengguna.",
      },
    ],
  }),
  component: KontakPage,
});

function KontakPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[860px] px-4 pb-24 pt-12 sm:px-6">
        <header className="border-b border-border pb-8">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            <MessageSquare className="size-4" /> Bantuan & Dukungan Pengguna
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Hubungi Kami
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Punya kendala teknis, pertanyaan paket premium, atau tawaran kerja sama bisnis? Tim kami siap membantu Anda.
          </p>
        </header>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {/* Card WhatsApp */}
          <div className="flex flex-col justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Phone className="size-6" />
              </div>
              <h2 className="mt-4 font-display text-lg font-bold text-foreground">Customer Service WhatsApp</h2>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Respon cepat untuk pertanyaan pembayaran QRIS, aktivasi akun, dan bantuan pemrosesan klip video.
              </p>
              <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                <p><strong>Nomor:</strong> 0851-8331-7385</p>
                <p><strong>Jam Operasional:</strong> 08.00 – 22.00 WIB (Setiap Hari)</p>
              </div>
            </div>
            <a
              href="https://wa.me/6285183317385?text=Halo%20Admin%20CortexClip,%20saya%20butuh%20bantuan%20terkait..."
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Send className="size-3.5" /> Chat WhatsApp Sekarang
            </a>
          </div>

          {/* Card Email */}
          <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6">
            <div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Mail className="size-6" />
              </div>
              <h2 className="mt-4 font-display text-lg font-bold text-foreground">Email Dukungan Resmi</h2>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Untuk pertanyaan seputar kemitraan B2B, pelaporan celah keamanan (bug bounty), atau permintaan penghapusan data.
              </p>
              <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                <p><strong>Email:</strong> verifikasi@aqualibrya.my.id</p>
                <p><strong>Dukungan Admin:</strong> admin@cortexclip.app</p>
              </div>
            </div>
            <a
              href="mailto:admin@cortexclip.app"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50"
            >
              <Mail className="size-3.5 text-accent" /> Kirim Email
            </a>
          </div>
        </div>

        {/* Komunitas */}
        <div className="mt-8 rounded-2xl border border-border bg-card/60 p-6">
          <div className="flex items-center gap-3">
            <Clock className="size-5 text-accent" />
            <h3 className="font-display text-base font-bold text-foreground">Grup Diskusi & Komunitas Kreator</h3>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Bergabunglah dengan ratusan kreator konten pendek, podcaster, dan affiliator Indonesia di grup WhatsApp resmi kami untuk berbagi tips konten viral dan pembaruan fitur terbaru.
          </p>
          <div className="mt-4">
            <a
              href="https://chat.whatsapp.com/EQBUHFIuOTG4ziEGLWhZG5"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:underline"
            >
              Gabung Grup Komunitas CortexClip ↗
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
