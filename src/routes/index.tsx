import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Pipeline } from "@/components/pipeline";
import { PricingFaq } from "@/components/pricing-faq";
import { supabase } from "@/integrations/supabase/client";
import { FAQS } from "@/components/pricing-faq";
import {
  SITE_URL,
  faqLd,
  howToLd,
  ldScript,
  organizationLd,
  productLd,
  softwareLd,
  websiteLd,
} from "@/lib/seo-jsonld";

const title = "CortexClip AI — Auto Clipper Video Panjang Jadi Klip Viral";
const description =
  "CortexClip AI (CortexclipAI) mengubah podcast, webinar, atau ceramah jadi puluhan klip vertikal siap unggah: subtitle karaoke, virality score, face tracking, ikon & b-roll otomatis.";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window !== "undefined") {
      const tokenKey = Object.keys(localStorage).find(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
      );
      if (tokenKey) {
        try {
          const raw = localStorage.getItem(tokenKey);
          if (raw && raw.includes("access_token")) {
            throw redirect({ to: "/dashboard" });
          }
        } catch (e: any) {
          if (e?.to) throw e;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        throw redirect({ to: "/dashboard" });
      }
    }
  },
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
    // JSON-LD: Organization + WebSite + SoftwareApplication (identitas brand),
    // Product (rentang harga bisa muncul di hasil pencarian), FAQPage (kotak
    // pertanyaan), HowTo (kueri "cara memotong video jadi shorts").
    // FAQ memakai daftar yang SAMA dengan yang tampil di halaman — Google
    // menolak FAQ terstruktur yang isinya tidak terlihat pengunjung.
    scripts: [
      ldScript(organizationLd),
      ldScript(websiteLd),
      ldScript(softwareLd),
      ldScript(productLd),
      ldScript(faqLd(FAQS)),
      ldScript(howToLd),
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
        <PricingFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
