/**
 * CortexClip backend API client (Python FastAPI render service on the VPS).
 * Used for server-side MP4 rendering with ffmpeg (karaoke burn, face tracking).
 */
import { supabase } from "@/integrations/supabase/client";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "http://178.128.82.140:8787";

export interface RenderResult {
  file: string;
  storage_path: string;
  url: string;
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
