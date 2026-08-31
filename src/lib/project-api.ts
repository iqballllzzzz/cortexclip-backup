/** API client untuk fitur project management (share/rename/delete/touch/queue). */

const API = "";

export async function authHeaders(): Promise<Record<string, string>> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Belum login");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function shareProject(projectId: string): Promise<{ url: string; expires_at: string }> {
  const h = await authHeaders();
  const res = await fetch(`${API}/api/projects/${projectId}/share`, { method: "POST", headers: h });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Gagal membuat link");
  return res.json();
}

export async function renameProject(projectId: string, title: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API}/api/projects/${projectId}`, { method: "PATCH", headers: h, body: JSON.stringify({ title }) });
  if (!res.ok) throw new Error("Gagal mengubah nama");
}

export async function deleteProject(projectId: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API}/api/projects/${projectId}`, { method: "DELETE", headers: h });
  if (!res.ok) throw new Error("Gagal menghapus proyek");
}

export async function touchProject(projectId: string): Promise<void> {
  try {
    const h = await authHeaders();
    await fetch(`${API}/api/projects/${projectId}/touch`, { method: "POST", headers: h });
  } catch { /* silent */ }
}

export async function shareInfo(token: string): Promise<{ project_title: string; owner_name: string; expired: boolean }> {
  // endpoint PUBLIK — penerima belum tentu login
  const res = await fetch(`${API}/api/share/${token}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Link tidak ditemukan");
  return res.json();
}

export async function acceptShare(token: string): Promise<{ project_id: string; title: string }> {
  const h = await authHeaders();
  const res = await fetch(`${API}/api/share/${token}/accept`, { method: "POST", headers: h });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail ?? "Gagal menerima proyek");
  }
  return res.json();
}

export async function processYoutube(url: string): Promise<{ project_id: string }> {
  const h = await authHeaders();
  const res = await fetch(`${API}/api/youtube/process`, { method: "POST", headers: h, body: JSON.stringify({ url }) });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail ?? "Gagal memproses YouTube");
  }
  return res.json();
}

export async function deleteRenderJob(jobId: string): Promise<void> {
  const h = await authHeaders();
  const res = await fetch(`${API}/api/render-jobs/${jobId}`, { method: "DELETE", headers: h });
  if (!res.ok) throw new Error("Gagal menghapus unduhan");
}
