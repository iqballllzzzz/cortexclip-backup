/**
 * CortexClip backend API client (Python FastAPI render service on the VPS).
 * Used for server-side MP4 rendering with ffmpeg (karaoke burn, face tracking).
 */
import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "";

export interface RenderResult {
  file: string;
  storage_path: string;
  url: string;
}

export interface RenderJob {
  id: string;
  project_id: string;
  clip_id: string;
  clip_title: string | null;
  status: "pending" | "rendering" | "completed" | "failed";
  rendered_url: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Mulai render klip di BACKGROUND — user boleh keluar halaman. */
export async function startRenderJob(params: {
  projectId: string;
  clipId: string;
  clipTitle?: string;
  captionStyle?: Record<string, unknown>;
}): Promise<{ job_id: string; status: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_URL}/api/render-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      project_id: params.projectId,
      clip_id: params.clipId,
      clip_title: params.clipTitle,
      caption_style: params.captionStyle,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 300) || "Gagal memulai render.");
  }
  return res.json();
}

/** Daftar job render milik user (terbaru dulu) — halaman /unduh. */
export async function listRenderJobs(): Promise<RenderJob[]> {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_URL}/api/render-jobs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.jobs ?? [];
}

/** Job render satu project — deteksi render selesai saat balik ke halaman project. */
export async function listProjectRenderJobs(projectId: string): Promise<RenderJob[]> {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_URL}/api/render-jobs/project/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.jobs ?? [];
}

export async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sesi login habis. Login dulu.");
  return session.access_token;
}

/**
 * Render satu klip ke MP4 vertikal di server (ffmpeg + karaoke ASS + face tracking).
 */
export async function renderClipServerSide(params: {
  projectId: string;
  clipId: string;
  captionStyle?: Record<string, unknown>;
  resolution?: string;
  faceTracking?: boolean;
  hookText?: string;
}): Promise<RenderResult> {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_URL}/api/render-clip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    body: JSON.stringify({
      project_id: params.projectId,
      clip_id: params.clipId,
      caption_style: params.captionStyle,
      resolution: params.resolution ?? "720x1280",
      face_tracking: params.faceTracking ?? true,
      hook_text: params.hookText,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 300) || "Render server gagal.");
  }
  return (await res.json()) as RenderResult;
}

/**
 * Render preview klip resolusi rendah (360x640, potong cepat) di VPS.
 * Hasilnya file kecil (~100-500KB) yang diputar browser di editor → instan.
 */
export async function renderClipPreview(params: {
  projectId: string;
  clipId: string;
  captionStyle?: Record<string, unknown>;
}): Promise<RenderResult> {
  const token = await getAccessToken();
  const res = await fetch(`${BACKEND_URL}/api/preview-clip`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      project_id: params.projectId,
      clip_id: params.clipId,
      caption_style: params.captionStyle,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 300) || "Render preview gagal.");
  }
  return (await res.json()) as RenderResult;
}
