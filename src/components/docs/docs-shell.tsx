import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/** Halaman docs umum: header, judul, breadcrumb, konten, footer. */
export function DocsShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[860px] px-4 pb-24 pt-10 sm:px-6">
        <Link
          to="/docs"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Semua dokumentasi
        </Link>
        <header className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Dokumentasi
          </p>
          <h1 className="mt-3 font-display text-[28px] leading-[1.1] font-bold tracking-tight sm:text-[36px]">
            {title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{lead}</p>
        </header>
        <article className="mt-8 space-y-8 text-[14.5px] leading-relaxed text-foreground/90 [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:tracking-tight [&_h3]:font-display [&_h3]:text-[15.5px] [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5 [&_p]:text-muted-foreground">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
