/** API client Social Auto Publishing (TikTok / YouTube). */

import { authHeaders } from "./project-api";

export type SocialPlatform = "youtube" | "tiktok";

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  profile_name: string;
  account_name?: string | null;
  avatar_url?: string | null;
  status: "pending" | "connected" | "expired" | "revoked";
  login_method?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface PublishJob {
  id: string;
  platform: SocialPlatform;
  title?: string | null;
  scheduled_at: string;
  status: "scheduled" | "rendering" | "uploading" | "published" | "failed" | "canceled";
  remote_url?: string | null;
  error_message?: string | null;
  clip_id?: string | null;
  project_id?: string | null;
  published_at?: string | null;
}

export interface PlatformStatus {
  siap: boolean;
  alasan?: string | null;
  login_methods?: string[];
}

export async function socialPlatforms(): Promise<Record<SocialPlatform, PlatformStatus>> {
  const res = await fetch("/api/social/platforms");
  if (!res.ok) throw new Error("Gagal memuat status platform");
  return res.json();
}

export async function socialList(): Promise<{ accounts: SocialAccount[]; jobs: PublishJob[] }> {
  const h = await authHeaders();
  const res = await fetch("/api/social/list", { headers: h });
  if (!res.ok) throw new Error("Gagal memuat akun sosial");
  return res.json();
}

export async function socialConnect(
  platform: SocialPlatform,
  profileName: string,
  loginMethod?: string,
): Promise<{ auth_url: string; account_id: string }> {
  const h = await authHeaders();
  const res = await fetch("/api/social/connect", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      platform,
      profile_name: profileName,
      ...(loginMethod ? { login_method: loginMethod } : {}),
    }),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(d.detail ?? "Gagal memulai koneksi");
  }
  return res.json();
}

export async function socialDisconnect(accountId: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`/api/social/accounts/${accountId}`, { method: "DELETE", headers: h });
  if (!res.ok) throw new Error("Gagal memutuskan akun");
}

export interface SocialProject {
  id: string;
  title: string;
  status: string;
  created_at: string;
}
export interface SocialClip {
  id: string;
  project_id: string;
  title?: string | null;
  start_time: number;
  end_time: number;
  rendered_url?: string | null;
}

export async function socialClips(): Promise<{ projects: SocialProject[]; clips: SocialClip[] }> {
  const h = await authHeaders();
  const res = await fetch("/api/social/clips", { headers: h });
  if (!res.ok) throw new Error("Gagal memuat proyek");
  return res.json();
}

export async function socialSchedule(
  accountIds: string[],
  clipIds: string[],
  hours?: number[],
): Promise<{ dibuat: number; jobs: PublishJob[] }> {
  const h = await authHeaders();
  const res = await fetch("/api/social/schedule", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      account_ids: accountIds,
      clip_ids: clipIds,
      ...(hours && hours.length > 0 ? { hours } : {}),
    }),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(d.detail ?? "Gagal menjadwalkan");
  }
  return res.json();
}

export async function socialCancel(jobId: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`/api/social/jobs/${jobId}/cancel`, { method: "POST", headers: h });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(d.detail ?? "Gagal membatalkan");
  }
}
