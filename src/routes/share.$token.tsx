import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Clock, XCircle, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { shareInfo, acceptShare } from "@/lib/project-api";
import { Button } from "@/components/ui/button";

const title = "Proyek Dibagikan — CortexClip";

export const Route = createFileRoute("/share/$token")({
  head: () => ({ meta: [{ title }] }),
  component: SharePage,
});

function SharePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ project_title: string; owner_name: string; expired: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await shareInfo(token);
        setInfo(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Link tidak valid");
      }
    })();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    try {
      // pastikan login
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast.error("Login dulu untuk menerima proyek");
        navigate({ to: "/auth" });
        return;
      }
      const r = await acceptShare(token);
      setDone(true);
      toast.success(`Proyek "${r.title}" diterima!`);
      setTimeout(() => navigate({ to: "/dashboard" }), 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menerima");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5 text-foreground antialiased">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-white/8 bg-card p-8 text-center"
      >
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <Share2 className="size-7" />
        </span>

        {error ? (
          <>
            <h1 className="mt-5 font-display text-xl font-bold">Link tidak valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button variant="accent" className="mt-6 w-full" onClick={() => navigate({ to: "/" })}>
              Ke Beranda
            </Button>
          </>
        ) : done ? (
          <>
            <span className="mx-auto mt-5 flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <CheckCircle2 className="size-7" />
            </span>
            <h1 className="mt-4 font-display text-xl font-bold">Proyek diterima!</h1>
            <p className="mt-2 text-sm text-muted-foreground">Mengalihkan ke dashboard…</p>
          </>
        ) : !info ? (
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat…
          </p>
        ) : info.expired ? (
          <>
            <span className="mx-auto mt-5 flex size-12 items-center justify-center rounded-full bg-red-500/15 text-red-500">
              <XCircle className="size-7" />
            </span>
            <h1 className="mt-4 font-display text-xl font-bold leading-snug">
              Proyek yang dibagikan oleh {info.owner_name} telah kadaluarsa
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tolong minta {info.owner_name} untuk mengirimkan yang baru.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-xl font-bold leading-snug">
              {info.owner_name} mengirimkan anda proyek ini
            </h1>
            <p className="mt-3 rounded-2xl border border-white/8 bg-background px-4 py-3 text-sm font-semibold">
              {info.project_title}
            </p>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> Link berlaku 1 minggu sejak dibagikan
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate({ to: "/" })} disabled={accepting}>
                Batalkan
              </Button>
              <Button variant="accent" className="flex-1" onClick={() => void handleAccept()} disabled={accepting}>
                {accepting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Terima
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
