import { useCallback, useEffect, useState } from "react";
import { fetchMeStatus, type MeStatus } from "@/lib/admin-api";

/**
 * Status akun terpusat: admin?, diban?, kuota harian.
 * Dipakai layout _authenticated (gerbang ban) dan halaman /admin (gerbang admin).
 */
export function useAccountStatus() {
  const [status, setStatus] = useState<MeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setStatus(await fetchMeStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat status akun");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // segarkan tiap 60 detik supaya ban/unban terasa tanpa reload manual
    const iv = setInterval(() => void reload(), 60_000);
    return () => clearInterval(iv);
  }, [reload]);

  return { status, loading, error, reload };
}
