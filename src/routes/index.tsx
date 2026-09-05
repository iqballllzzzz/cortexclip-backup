import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Pipeline } from "@/components/pipeline";
import { ClipShowcase } from "@/components/clip-showcase";
import { ResultShowcase } from "@/components/result-showcase";
import { PricingFaq } from "@/components/pricing-faq";
import { supabase } from "@/integrations/supabase/client";
import {
  SITE_URL,
  ldScript,
  organizationLd,
  softwareLd,
  websiteLd,
} from "@/lib/seo-jsonld";

const title = "CortexClip AI — Auto Clipper Video Panjang Jadi Klip Viral";
const description =
  "CortexClip AI (CortexclipAI) mengubah podcast, webinar, atau ceramah jadi puluhan klip vertikal siap unggah: subtitle karaoke, virality score, face tracking, ikon & b-roll otomatis.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: "CortexClip" },
      { property: "og:locale", content: "id_ID" },
      { property: "og:image", content: `${SITE_URL}/favicon.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "application-name", content: "CortexClip" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [ldScript(organizationLd), ldScript(websiteLd), ldScript(softwareLd)],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  // Sudah login → jangan tampilkan landing page, langsung dashboard
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

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <Pipeline />
        {/* Hasil render NYATA (dari /api/showcase) diletakkan SEBELUM contoh
            gaya subtitle: pengunjung baru mencari bukti dulu, baru variasi. */}
        <ResultShowcase />
        <ClipShowcase />
        <PricingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
