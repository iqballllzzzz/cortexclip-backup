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
  is_owner?: boolean;
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
  auth_provider?: string | null;
  plan: "free" | "premium";
  premium_until: string | null;
  is_admin: boolean;
  is_owner?: boolean;
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

/** Satu model AI + hitungan sukses/gagal kumulatifnya (dari Hydra).
 *
 *  Beda dengan `top_models`, yang dihitung dari usage_log dan hanya mencatat
 *  model PEMENANG failover: baris ini menghitung SETIAP percobaan endpoint,
 *  termasuk yang gagal sebelum model lain berhasil. */
export interface ModelStat {
  provider: string;
  model: string;
  kind: string;
  /** jumlah API key yang terpasang untuk model ini */
  keys: number;
  /** false = provider belum punya API key, jadi model ini belum bisa dipakai */
  configured: boolean;
  available: boolean;
  cooldown_remaining: number;
  dead: boolean;
  last_error: string;
  ok_total: number;
  fail_total: number;
  total: number;
  reliability: number;
  avg_latency_ms: number;
  /** epoch detik; 0 = belum pernah */
  last_ok_at: number;
  last_fail_at: number;
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
  /** semua model AI yang dikenal + sukses/gagalnya (panel "Kesehatan model AI") */
  model_stats: ModelStat[];
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

export async function deleteAdminUser(userId: string): Promise<void> {
  await authFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
}

export async function deleteAdminUserProjects(userId: string): Promise<void> {
  await authFetch(`/api/admin/users/${userId}/projects`, { method: "DELETE" });
}

/** Hasil uji semua model (tombol "Uji semua model" di panel admin). */
export interface HasilUjiModel {
  diuji: number;
  hidup: number;
  mati: number;
  detik: number;
  hasil: {
    provider: string;
    model: string;
    ok: boolean;
    latency_ms?: number;
    error?: string;
  }[];
}

/** Picu uji semua model di LATAR BELAKANG — balas seketika. */
export async function picuUjiModel(): Promise<{ jalan: boolean; sudah_berjalan?: boolean }> {
  return json(await authFetch("/api/admin/uji-model", { method: "POST" }));
}

/** Poll status uji latar belakang sampai selesai. */
export async function statusUjiModel(): Promise<{
  jalan: boolean;
  detik_berjalan: number | null;
  hasil: HasilUjiModel | { error: string } | null;
}> {
  return json(await authFetch("/api/admin/uji-model/status"));
}

/* -------------------------------------------------------- free premium admin */

export type FreePremiumStatusType = "open" | "closed" | "hidden";

export async function fetchFreePremiumStatus(): Promise<{ status: FreePremiumStatusType }> {
  return json(await authFetch("/api/admin/free-premium"));
}

export async function updateFreePremiumStatus(
  status: FreePremiumStatusType,
): Promise<{ ok: boolean; status: FreePremiumStatusType }> {
  return json(
    await authFetch("/api/admin/free-premium", {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  );
}

/* ----------------------------------------------------------- live logs admin */

export interface SystemLogEntry {
  id: number;
  timestamp: string;
  time_epoch: number;
  level: "INFO" | "WARN" | "ERROR";
  category: string;
  user: string;
  action: string;
  detail: string;
  ip: string;
}

export interface AILogEntry {
  id: number;
  timestamp: string;
  time_epoch: number;
  provider: string;
  model: string;
  task: string;
  latency_ms: number;
  status: string;
  detail: string;
}

export async function fetchSystemLogs(): Promise<{
  logs: SystemLogEntry[];
  resources: Record<string, number | string | string[]>;
  timestamp: number;
}> {
  return json(await authFetch("/api/admin/logs/system"));
}

export async function fetchAILogs(): Promise<{
  logs: AILogEntry[];
  models_status: Record<string, unknown>;
  timestamp: number;
}> {
  return json(await authFetch("/api/admin/logs/ai"));
}

export async function downloadAdminLogs(
  kind: "all" | "ai" | "error" = "all",
  fmt: "json" | "txt" = "json",
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sesi login habis.");
  const res = await fetch(`/api/admin/logs/export?kind=${kind}&fmt=${fmt}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gagal mengunduh log (${res.status})`);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cortexclip-logs-${kind}-${Date.now()}.${fmt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------- pricing admin */

export interface PlanItemConfig {
  label: string;
  days: number;
  amount: number;
  original_amount: number;
  discount_percent: number;
  discount_label: string;
}

export async function fetchPricingAdmin(): Promise<{
  current: Record<string, PlanItemConfig>;
  defaults: Record<string, PlanItemConfig>;
}> {
  return json(await authFetch("/api/admin/pricing"));
}

export async function updatePricingAdmin(
  plans: Record<string, { amount: number; original_amount: number; discount_label?: string }>,
): Promise<{ ok: boolean; plans: Record<string, PlanItemConfig> }> {
  return json(
    await authFetch("/api/admin/pricing", {
      method: "POST",
      body: JSON.stringify({ plans }),
    }),
  );
}

export async function resetPricingAdmin(): Promise<{
  ok: boolean;
  plans: Record<string, PlanItemConfig>;
}> {
  return json(
    await authFetch("/api/admin/pricing/reset", {
      method: "POST",
    }),
  );
}

/* ------------------------------------------------------------- permission requests */

export interface AdminRequest {
  id: string;
  requester_id: string;
  requester_email: string;
  action_type: string;
  target_user_id: string;
  target_email: string;
  payload: any;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export async function submitAdminRequest(data: {
  action_type: string;
  target_user_id: string;
  target_email?: string;
  payload: any;
  reason: string;
}) {
  return json(
    await authFetch("/api/admin/requests", {
      method: "POST",
      body: JSON.stringify(data),
    })
  );
}

export async function fetchAdminRequests(): Promise<AdminRequest[]> {
  return json(await authFetch("/api/admin/requests/pending"));
}

export async function approveAdminRequest(id: string) {
  return json(await authFetch(`/api/admin/requests/${id}/approve`, { method: "POST" }));
}

export async function rejectAdminRequest(id: string) {
  return json(await authFetch(`/api/admin/requests/${id}/reject`, { method: "POST" }));
}
