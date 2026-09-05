/**
 * Client API panel admin + status akun (ban/kuota/flag admin).
 * Semua endpoint memakai JWT Supabase user — backend yang memverifikasi
 * bahwa profiles.is_admin = true, jadi tidak ada rahasia di sisi browser.
 */
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ tipe */

export interface BanInfo {
  banned: boolean;
  permanent: boolean;
  banned_until: string | null;
  duration_left: string;
  reason: string;
  banned_at: string | null;
  message: string;
}

export interface MeStatus {
  user: { id: string; email: string };
  is_admin: boolean;
  ban: BanInfo | null;
  quota: {
    ok: boolean;
    plan: string;
    used: number;
    limit: number;
    clips_per_video: number;
    message: string | null;
  };
}

export interface AdminUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  plan: "free" | "premium";
  premium_until: string | null;
  is_admin: boolean;
  banned: boolean;
  ban_permanent: boolean;
  banned_until: string | null;
  ban_left: string | null;
  ban_reason: string | null;
  joined_at: string | null;
  account_age_days: number | null;
  last_active_at: string | null;
  inactive_days: number | null;
  login_count: number;
  total_projects: number;
  total_clips: number;
  total_requests: number;
  requests_30d: number;
  quota_used_today: number;
  quota_limit_today: number;
  quota_left_today: number;
  favorite_model: string | null;
}

export interface AdminStats {
  kpi: {
    total_users: number;
    new_users_7d: number;
    premium_active: number;
    banned_now: number;
    total_projects: number;
    projects_today: number;
    total_clips: number;
    total_requests: number;
    requests_24h: number;
    requests_7d: number;
    logins_7d: number;
    renders_total: number;
  };
  series: { date: string; label: string; projects: number; requests: number; logins: number }[];
  top_models: {
    model: string;
    success: number;
    error: number;
    reliability: number;
    /** Kegagalan TERBARU model ini (kalau ada) — supaya admin melihat sebabnya,
     *  bukan hanya angka. Diisi backend dari usage_log.meta.error. */
    last_error?: { waktu?: string; kind?: string; pesan?: string };
  }[];
  by_kind: { kind: string; count: number }[];
  project_status: { status: string; count: number }[];
  resources: Record<string, number | string | string[]>;
  ban_durations: { key: string; label: string }[];
  generated_at: string;
}

export interface AdminUserDetail {
  profile: AdminUser;
  recent_activity: {
    kind: string;
    model: string | null;
    provider: string | null;
    status: string;
    latency_ms: number | null;
    created_at: string;
  }[];
  projects: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    duration_seconds: number | null;
  }[];
  models: { model: string; success: number; error: number }[];
}

export type BanDuration = "1d" | "5d" | "1mo" | "permanent";

/* ------------------------------------------------------------- transport */

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sesi login habis — masuk ulang.");
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") throw new Error(detail);
    if (detail && typeof detail === "object") {
      const d = detail as { message?: string; code?: string };
      throw new Error(d.message ?? d.code ?? `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ akun */

/** Status akun sendiri — tidak pernah 403 walau akun diban. */
export async function fetchMeStatus(): Promise<MeStatus> {
  return json<MeStatus>(await authFetch("/api/me/status"));
}

/** Catat event login (dipanggil sekali setelah sign-in berhasil). */
export async function recordLoginEvent(): Promise<void> {
  try {
    await authFetch("/api/me/login-event", { method: "POST" });
  } catch {
    /* analitik — jangan ganggu alur login */
  }
}

/* ----------------------------------------------------------------- admin */

export async function fetchAdminStats(): Promise<AdminStats> {
  return json<AdminStats>(await authFetch("/api/admin/stats"));
}

export async function fetchAdminUsers(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ users: AdminUser[]; count: number }> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const suffix = q.toString() ? `?${q}` : "";
  return json<{ users: AdminUser[]; count: number }>(await authFetch(`/api/admin/users${suffix}`));
}

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  return json<AdminUserDetail>(await authFetch(`/api/admin/users/${userId}`));
}

export async function banUser(
  userId: string,
  duration: BanDuration,
  reason: string,
): Promise<{ ok: boolean; label: string }> {
  return json(
    await authFetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      body: JSON.stringify({ duration, reason }),
    }),
  );
}

export async function unbanUser(userId: string): Promise<{ ok: boolean }> {
  return json(await authFetch(`/api/admin/users/${userId}/unban`, { method: "POST" }));
}

export async function setUserPlan(userId: string, plan: string): Promise<{ ok: boolean }> {
  return json(
    await authFetch(`/api/admin/users/${userId}/plan`, {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  );
}

export async function setUserAdmin(userId: string, isAdmin: boolean): Promise<{ ok: boolean }> {
  return json(
    await authFetch(`/api/admin/users/${userId}/admin-flag`, {
      method: "POST",
      body: JSON.stringify({ is_admin: isAdmin }),
    }),
  );
}
