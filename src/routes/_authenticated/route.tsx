import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAccountStatus } from "@/hooks/use-account-status";
import { BannedScreen } from "@/components/banned-screen";
import { PageLoading } from "@/components/page-loading";

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
    return <PageLoading fullscreen label="Menyiapkan akun" />;
  }

  // Backend tidak terjangkau → jangan kunci user; biarkan aplikasi jalan.
  if (status?.ban?.banned) {
    return <BannedScreen ban={status.ban} email={status.user.email ?? user.email} />;
  }
  void error;

  return <Outlet />;
}
