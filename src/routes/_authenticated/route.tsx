import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountStatus } from "@/hooks/use-account-status";
import { BannedScreen } from "@/components/banned-screen";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

/**
 * Gerbang ban: seluruh area login dibungkus di sini. Kalau backend melaporkan
 * akun sedang diban, tidak ada route anak yang dirender — hanya BannedScreen.
 */
function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const { status, loading, error } = useAccountStatus();

  if (loading && !status) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Backend tidak terjangkau → jangan kunci user; biarkan aplikasi jalan.
  if (status?.ban?.banned) {
    return <BannedScreen ban={status.ban} email={status.user.email ?? user.email} />;
  }
  void error;

  return <Outlet />;
}
