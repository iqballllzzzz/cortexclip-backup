import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sparkles, Users, Code, Award, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/tentang-kami")({
  head: () => ({
    meta: [
      { title: "Tentang Kami — CortexClip AI Indonesia" },
      {
        name: "description",
        content:
          "Mengenal CortexClip AI, platform SaaS otomatisasi klip video vertikal berbasis AI karya anak bangsa Indonesia yang dirancang untuk konten kreator, podcaster, dan affiliator.",
      },
    ],
  }),
  component: TentangKamiPage,
});

function TentangKamiPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[860px] px-4 pb-24 pt-12 sm:px-6">
        <header className="border-b border-border pb-8">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            <Sparkles className="size-4" /> Karya Inovasi Anak Bangsa
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Tentang CortexClip AI
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Mendemokratisasi pembuatan konten video pendek berkualitas tinggi untuk seluruh kreator Indonesia.
          </p>
        </header>

        <article className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground sm:text-base [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_p]:text-muted-foreground">
          <section>
            <h2>Misi Kami</h2>
            <p>
              Di era ledakan konten video pendek (TikTok, Instagram Reels, YouTube Shorts, dan Shopee Video), kreator konten sering kali menghabiskan waktu 4 hingga 8 jam hanya untuk mendengarkan kembali rekaman podcast, memotong bagian menarik secara manual, mengetik ulang takarir (subtitle), dan mengatur posisi kamera agar pas di layar vertikal 9:16.
            </p>
            <p className="mt-3">
              Layanan luar negeri seperti OpusClip atau Vizard membebankan biaya langganan yang sangat mahal ($19–$29 per bulan atau lebih dari Rp450.000) dan mewajibkan kartu kredit internasional yang jarang dimiliki oleh kreator pemula Indonesia.
            </p>
            <p className="mt-3 font-medium text-foreground">
              <strong>CortexClip AI lahir untuk memecahkan masalah ini.</strong> Kami membangun infrastruktur pemrosesan video cerdas berskala penuh di Indonesia dengan harga yang sangat terjangkau (mulai Rp5.000 per hari menggunakan QRIS), dengan akurasi pengenalan bahasa Indonesia lokal yang jauh lebih unggul.
            </p>
          </section>

          <section>
            <h2>Teknologi Unggulan Kami</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-display text-base font-bold text-foreground">Transkripsi Audio 4-Tingkat</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Memanfaatkan model Whisper AI yang disetel khusus untuk mengenali istilah populer, bahasa gaul, dan intonasi percakapan podcast di Indonesia.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-display text-base font-bold text-foreground">Smart Adaptive Camera Stabilizer</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Melacak posisi wajah subjek secara otomatis dengan pergerakan kamera gaya paparazi yang mulus (*smoothstep cubic*) tanpa distorsi horizon.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-display text-base font-bold text-foreground">Subtitle Karaoke Interaktif</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Takarir bergaya Hormozi dan MrBeast dengan sinkronisasi suku kata tanpa jeda kedip mati, mendongkrak retensi penonton hingga 2.4x lipat.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-display text-base font-bold text-foreground">Skor Potensi Viralitas AI</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Analisis sentimen dan hook emosional 3 detik pertama untuk menentukan 10 klip paling bernilai tinggi dari video berdurasi lebih dari 1 jam.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card/60 p-6">
            <h2 className="!mt-0">Tim di Balik Layar</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 border border-accent/20 font-bold text-accent">
                  MI
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Muhammad Iqbal.S</h3>
                  <p className="text-xs text-accent">Founder & Lead Fullstack Software Engineer</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Merancang arsitektur backend asynchronous FastAPI, pipeline rendering ffmpeg berkinerja tinggi, model AI klip selection, serta integrasi antarmuka modern TanStack Start.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 border-t border-border pt-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 font-bold text-emerald-400">
                  SF
                </div>
                <div>
                  <h3 className="font-bold text-foreground">SANNN FORUM</h3>
                  <p className="text-xs text-emerald-400">Head of Community & Growth Marketing</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mengelola hubungan pelanggan, komunitas resmi pengguna di WhatsApp, serta riset kebutuhan kreator konten TikTok dan YouTube Shorts Indonesia.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
