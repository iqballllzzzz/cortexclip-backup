import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Pipeline } from "@/components/pipeline";
import { ClipShowcase } from "@/components/clip-showcase";
import { PricingFaq } from "@/components/pricing-faq";
import { supabase } from "@/integrations/supabase/client";

const title = "CortexClip — AI Auto Clipper Video Panjang Jadi Klip Viral";
const description =
  "Ubah podcast, webinar, atau ceramah jadi puluhan klip vertikal siap unggah dengan caption karaoke, virality score, face tracking, dan metadata otomatis.";

export const Route = createFileRoute("/")({
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
        <ClipShowcase />
        <PricingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
