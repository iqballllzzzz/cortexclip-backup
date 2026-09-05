"use client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  BadgeX,
  ChevronDown,
  Clock,
  Download,
  Hash,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Subtitles,
  Sticker,
  X,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getPreset, SubtitleStylePicker, DEFAULT_SUBTITLE_PRESET } from "@/components/subtitle-styles";
import { ColoredIcon } from "@/components/colored-icon";
import { BrollPip } from "@/components/broll-pip";
import { PreviewLoading } from "@/components/preview-loading";
import { PageLoading } from "@/components/page-loading";
import { AdFullscreen } from "@/components/ad-fullscreen";
import { useCameraFraming, useCameraTrack } from "@/lib/camera-framing";
import { LiveCaptionOverlay, type LiveCaptionStyle, type LiveWord } from "@/components/live-caption-overlay";
import { startRenderJob, getAccessToken } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ClipBase = Database["public"]["Tables"]["clips"]["Row"];
type Clip = ClipBase & {
  preview_url?: string | null;
  preview_ready?: boolean;
};

export const Route = createFileRoute("/_authenticated/editor/$clipId")({
  head: () => ({
    meta: [
      { title: "Editor Klip — CortexClip" },
      { name: "description", content: "Editor klip vertikal — subtitle karaoke, ikon & b-roll, emoji." },
    ],
  }),
  component: EditorPage,
});

/* ══════════════════════════════════════════════════════════════════════════
   REDESIGN v2 — "ORBIT"
   Hallmark · macrostructure: Workbench-hub · tone: utilitarian-editorial
   · anchor hue: matte amber 60° (palet lama dipertahankan)

   Struktur BARU vs lama (canvas kiri + aside kanan 272px + tab grid):
   — Canvas 9:16 jadi HUB yang dominan, DI TENGAH, lebih besar.
   — 4 tool (Subtitle/Transkrip/Deskripsi/Ikon) jadi DOCK CHIP mengambang
     di BAWAH canvas — bukan tab grid di panel samping.
   — Panel tool = SHEET mengambang dengan tombol X, overlay DI ATAS canvas
     (desktop: kanan canvas; mobile: bawah) — bukan kolom yang selalu
     memakan ruang.
   — Timeline jadi "PITA WORDS": strip katalah scrubber (ADHD winner
     "transcript-as-timeline" versi ringan) — tiap kata = segmen klik,
     panjang proporsional durasi kata; di atasnya bar progres.
   — Header jadi command-bar tipis ala aplikasi pro: back | judul | skor |
     aksi.
   Logika 1:1 dipertahankan: basis waktu turunan, preview gating, anti-gelap,
   polling preview 25 menit, auto split, ads, render job — jangan disentuh.
   ══════════════════════════════════════════════════════════════════════════ */

type ToolId = "subtitle" | "info" | "broll" | "teks";

const TOOLS: { id: ToolId; label: string; Icon: typeof Hash }[] = [
  { id: "subtitle", label: "Subtitle", Icon: Subtitles },
  { id: "teks", label: "Transkrip", Icon: Type },
  { id: "info", label: "Deskripsi", Icon: Hash },
  { id: "broll", label: "Ikon", Icon: Sticker },
];

interface Placement {
  time_start: number;
  time_end: number;
  category: string;
  icon?: string | null;
  /** id ikon katalog (mis. 'MoneyIcon-blue') — PNG dari /api/icons/{id} */
  icon_id?: string;
  iconEmoji?: string;
  side: string;
  animation: string;
  broll_url?: string | null;
  genre?: string;
  icon_cx?: number;
  icon_cy?: number;
  broll_start?: number;
  broll_end?: number;
  broll_cx?: number;
  broll_cy?: number;
  broll_scale?: number;
}

/* ------------------------------------------------------------------- page */

function EditorPage() {
  const { clipId } = Route.useParams();
  const navigate = useNavigate();

  const [clip, setClip] = useState<Clip | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // player
  const videoRef = useRef<HTMLVideoElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fit, setFit] = useState({ w: 216, h: 384 });

  // tools — sheet mengambang, null = tertutup
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [presetId, setPresetId] = useState(DEFAULT_SUBTITLE_PRESET);
  const [fontScale, setFontScale] = useState(1);
  const [position, setPosition] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [brollEnabled, setBrollEnabled] = useState(false);
  const [brollSearching, setBrollSearching] = useState(false);
  const [emojiEnabled, setEmojiEnabled] = useState(false);
  const [livePlacements, setLivePlacements] = useState<Placement[]>([]);
  const [iconListOpen, setIconListOpen] = useState(false);

  // AUTO SPLIT
  const [layoutEnabled, setLayoutEnabled] = useState(false);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutPlan, setLayoutPlan] = useState<
    { start: number; end: number; layout: string }[] | null
  >(null);
  const [layoutListOpen, setLayoutListOpen] = useState(false);

  // watermark ads
  const [adsWatched, setAdsWatched] = useState(0);
  const [watermarkRemoved, setWatermarkRemoved] = useState(false);
  const [adPlaying, setAdPlaying] = useState(false);

  // unduhan
  const [downloadLocked, setDownloadLocked] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<string | null>(null);

  // kemajuan preview server
  const [prevPct, setPrevPct] = useState(0);
  const [prevStage, setPrevStage] = useState<string>("");
  const [prevEta, setPrevEta] = useState<number | null>(null);
  const [prevElapsed, setPrevElapsed] = useState(0);

  const cameraTrack = useCameraTrack(clipId, getAccessToken);

  const clipRef = useRef<Clip | null>(null);
  clipRef.current = clip;
  const pollAbortRef = useRef<(() => void) | null>(null);
  const startNum = Number(clip?.start_time ?? 0);
  const duration = clip ? Math.max(0.1, Number(clip.end_time) - Number(clip.start_time)) : 0.1;

  useCameraFraming(videoRef, cameraTrack, {
    enabled: false,
    clipStart: startNum,
  });

  /* --- memori editor per-klip --- */
  const memKey = `cc_editor_mem_${clipId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(memKey);
      if (!raw) return;
      const m = JSON.parse(raw) as Record<string, unknown>;
      if (typeof m["presetId"] === "string") setPresetId(m["presetId"]);
      if (typeof m["fontScale"] === "number") setFontScale(m["fontScale"]);
      if (typeof m["position"] === "number") setPosition(m["position"]);
      if (typeof m["opacity"] === "number") setOpacity(m["opacity"]);
      if (typeof m["brollEnabled"] === "boolean") {
        setBrollEnabled(m["brollEnabled"]);
        if (m["brollEnabled"] && Array.isArray(m["livePlacements"]))
          setLivePlacements(m["livePlacements"] as Placement[]);
      }
      if (typeof m["emojiEnabled"] === "boolean") setEmojiEnabled(m["emojiEnabled"]);
    } catch {
      /* korup → abaikan */
    }
  }, [memKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          memKey,
          JSON.stringify({ presetId, fontScale, position, opacity, brollEnabled, emojiEnabled, livePlacements, savedAt: Date.now() }),
        );
      } catch {
        /* storage penuh → abaikan */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [memKey, presetId, fontScale, position, opacity, brollEnabled, emojiEnabled, livePlacements]);

  /* --- load clip + project + sumber (preview INSTAN) --- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("clips").select("*").eq("id", clipId).single();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Klip tidak ditemukan");
        navigate({ to: "/dashboard" });
        return;
      }
      const c = data as Clip;
      setClip(c);
      if (c.project_id) {
        const { data: p } = await supabase.from("projects").select("*").eq("id", c.project_id).single();
        if (!cancelled && p) {
          const proj = p as Project;
          setProject(proj);
          if (proj.storage_path) {
            supabase.storage
              .from("video-uploads")
              .createSignedUrl(proj.storage_path, 60 * 60)
              .then(({ data: s }) => {
                if (!cancelled && s?.signedUrl) setSourceUrl(s.signedUrl);
              });
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clipId, navigate]);

  /* --- status iklan/watermark --- */
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/ads/status", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setAdsWatched(d.ads_watched);
          setWatermarkRemoved(d.watermark_removed);
        }
      } catch {
        /* offline ok */
      }
    })();
  }, []);

  const muatRencanaLayout = useCallback(async () => {
    if (!clip) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/layout-plan/${clip.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.segments)) setLayoutPlan(d.segments);
    } catch {
      /* rencana hanya informasi; kegagalan tidak boleh mengganggu editor */
    }
  }, [clip]);

  /* --- AUTO SPLIT: muat status tersimpan + rentang split --- */
  useEffect(() => {
    if (!clip) return;
    const prefs = (clip as unknown as { layout_prefs?: { enabled?: boolean } } | null)
      ?.layout_prefs;
    const aktif = !!prefs?.enabled;
    setLayoutEnabled(aktif);
    if (aktif) void muatRencanaLayout();
    else setLayoutPlan(null);
  }, [clip, muatRencanaLayout]);

  /** Simpan status Auto Split — state lokal berubah seketika (optimistis). */
  const simpanLayout = useCallback(
    async (enabled: boolean) => {
      if (!clip) return;
      setLayoutSaving(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/layout-prefs/${clip.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) {
          toast.error("Gagal menyimpan Auto Split");
          return;
        }
        const d = await res.json();
        if (d.preview_direset) {
          setClip((c) => (c ? { ...c, preview_url: null, preview_ready: false } : c));
          setPrevPct(0);
          setPrevStage("Menyiapkan");
          toast.success(enabled ? "Auto Split aktif — preview dibuat ulang" : "Auto Split mati");
        }
        if (enabled) void muatRencanaLayout();
        else setLayoutPlan(null);
      } catch {
        toast.error("Gagal menyimpan Auto Split");
      } finally {
        setLayoutSaving(false);
      }
    },
    [clip?.id, muatRencanaLayout],
  );

  /* --- pemanasan preview server + polling status (TAHAN keluar-masuk) --- */
  const warmServerPreview = useCallback(async () => {
    const c0 = clipRef.current;
    if (!c0 || c0.preview_ready) return;
    const clipId = c0.id;
    const projectId = c0.project_id;
    const batalRef = { batal: false };
    pollAbortRef.current?.();
    pollAbortRef.current = () => {
      batalRef.batal = true;
    };

    const mulaiRender = async (): Promise<"jalan" | "siap" | "gagal"> => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/preview-clip", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ project_id: projectId, clip_id: clipId }),
        });
        if (!res.ok) return "gagal";
        const d = await res.json();
        if (d.url) {
          setClip((c) => (c && c.id === clipId ? { ...c, preview_url: d.url, preview_ready: true } : c));
          return "siap";
        }
        return "jalan";
      } catch {
        return "gagal";
      }
    };

    const hasilAwal = await mulaiRender();
    if (hasilAwal === "siap" || batalRef.batal) return;
    if (hasilAwal === "gagal") {
      setPrevStage("Gagal memulai — coba muat ulang halaman");
      return;
    }
    if (!prevStage) setPrevStage("Menyiapkan");

    const batasWaktu = Date.now() + 25 * 60 * 1000;
    let restart = 0;
    while (!batalRef.batal && Date.now() < batasWaktu) {
      await new Promise((r) => setTimeout(r, 1500));
      if (batalRef.batal) return;
      try {
        const t2 = await getAccessToken();
        const st = await fetch(`/api/preview-clip/status/${clipId}`, {
          headers: { Authorization: `Bearer ${t2}` },
        });
        if (!st.ok) continue;
        const sd = await st.json();
        if (batalRef.batal) return;
        if (typeof sd.progress === "number" && sd.progress > 0) setPrevPct(sd.progress);
        if (typeof sd.stage === "string" && sd.stage) setPrevStage(sd.stage);
        setPrevEta(typeof sd.eta_s === "number" ? sd.eta_s : null);
        if (typeof sd.elapsed_s === "number") setPrevElapsed(sd.elapsed_s);
        if (sd.status === "ready" && sd.url) {
          setPrevPct(100);
          setPrevEta(0);
          setClip((c) => (c && c.id === clipId ? { ...c, preview_url: sd.url, preview_ready: true } : c));
          if (clipRef.current) {
            const prefs = (clipRef.current as unknown as {
              layout_prefs?: { enabled?: boolean };
            })?.layout_prefs;
            if (prefs?.enabled) void muatRencanaLayout();
          }
          return;
        }
        if (sd.status === "failed") {
          setPrevStage(sd.stage || "Render gagal");
          setPrevEta(null);
          toast.error(sd.stage || "Render preview gagal di server");
          return;
        }
        if (sd.status === "idle") {
          if (restart >= 3) {
            setPrevStage("Render terhenti — tekan muat ulang halaman");
            return;
          }
          restart += 1;
          setPrevStage("Melanjutkan render…");
          const ulang = await mulaiRender();
          if (ulang === "siap" || batalRef.batal) return;
          if (ulang === "gagal") {
            setPrevStage("Gagal memulai — coba muat ulang halaman");
            return;
          }
        }
      } catch {
        /* jaringan sekejap gagal — coba lagi pada iterasi berikutnya */
      }
    }
  }, [clip?.id, clip?.preview_ready, muatRencanaLayout]);

  useEffect(() => {
    const t = setTimeout(() => void warmServerPreview(), 600);
    return () => {
      clearTimeout(t);
      pollAbortRef.current?.();
    };
  }, [warmServerPreview]);

  const words = useMemo<LiveWord[]>(
    () =>
      ((clip?.caption_words as unknown as { word: string; start: number; end: number }[]) ?? []).map(
        (w) => ({ word: w.word, start: Number(w.start), end: Number(w.end) }),
      ),
    [clip],
  );

  /* --- fit canvas 9:16 ke area hub --- */
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (availW < 40 || availH < 40) return;
      const h = Math.min(availH - 8, (availW * 16) / 9);
      const w = (h * 9) / 16;
      setFit({ w: Math.round(w), h: Math.round(h) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  /* --- WAKTU VIDEO: rAF loop (anti-stuck) — basis turunan dari preview_url --- */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const c = clipRef.current;
      if (v && c && !v.paused && v.readyState >= 2) {
        const raw = c.preview_url ? v.currentTime : v.currentTime - Number(c.start_time);
        if (raw >= duration) {
          v.pause();
          setPlaying(false);
          setTime(duration);
        } else {
          setTime(Math.max(0, raw));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  function handleLoadedMetadata() {
    const v = videoRef.current;
    const c = clipRef.current;
    if (!v || !c) return;
    if (!c.preview_url) {
      try {
        v.currentTime = Number(c.start_time);
      } catch {
        /* seek gagal → biarkan */
      }
    }
  }

  // STOP OTOMATIS di akhir klip (video sumber penuh jangan lanjut)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const check = () => {
      const c = clipRef.current;
      if (!v.paused && c && !c.preview_url) {
        const rel = v.currentTime - Number(c.start_time);
        if (rel >= duration - 0.05) {
          v.pause();
          setPlaying(false);
          setTime(duration);
        }
      }
    };
    const iv = setInterval(check, 250);
    return () => clearInterval(iv);
  }, [duration]);

  const preset = getPreset(presetId);
  const effPosition = position ?? preset.style.position;
  const effFontSize = Math.round(preset.style.font_size * fontScale);

  const liveStyle: LiveCaptionStyle = {
    fontFamily: preset.cssFontFamily,
    fontSize: effFontSize * 0.42,
    ...(preset.style.max_words ? { maxWords: preset.style.max_words } : {}),
    fontColor: preset.style.font_color,
    highlightColor: preset.style.highlight_color,
    emphasisColor: preset.style.highlight_color,
    strokeColor: "#000000",
    strokeWidth: preset.style.word_box ? 0 : 3,
    shadow: true,
    wordBox: preset.style.word_box ?? false,
    wordBoxColor: preset.style.word_box_color ?? "#000000",
    uppercase: preset.style.uppercase ?? false,
    opacity,
    position: effPosition,
    animation: "karaoke",
  };

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(duration - 0.05, t));
    v.currentTime = clip?.preview_url
      ? clamped
      : Number(clip?.start_time ?? 0) + clamped;
    setTime(clamped);
  }

  /** Maju/mundur relatif — dipakai tap kiri/kanan preview & tombol panah. */
  function nudge(delta: number) {
    setTime((t) => {
      const target = Math.max(0, Math.min(duration - 0.05, t + delta));
      const v = videoRef.current;
      if (v) {
        v.currentTime = clipRef.current?.preview_url
          ? target
          : Number(clipRef.current?.start_time ?? 0) + target;
      }
      return target;
    });
  }

  function buildCaptionStyle() {
    return {
      preset: presetId,
      font_family: preset.style.font_family,
      font_size: effFontSize,
      font_color: preset.style.font_color,
      highlight_color: preset.style.highlight_color,
      position: effPosition,
      word_box: preset.style.word_box ?? false,
      word_box_color: preset.style.word_box_color,
      emoji: emojiEnabled || preset.style.emoji,
      uppercase: preset.style.uppercase ?? false,
      opacity,
      broll: brollEnabled,
    };
  }

  async function handleDownload() {
    if (!clip || submitting || downloadLocked) return;
    setSubmitting(true);
    try {
      let queueNote = "";
      try {
        const tokenQ = await getAccessToken();
        const res = await fetch("/api/render-jobs/queue", {
          headers: { Authorization: `Bearer ${tokenQ}` },
        });
        if (res.ok) {
          const d = await res.json();
          if (d.total_active > 0) queueNote = ` Anda ada di nomor antrean ke ${d.total_active + 1}.`;
        }
      } catch {
        /* abaikan */
      }
      await startRenderJob({
        projectId: clip.project_id,
        clipId: clip.id,
        clipTitle: clip.title,
        captionStyle: buildCaptionStyle(),
      });
      setDownloadLocked(true);
      pollRenderDone();
      setDownloadInfo(queueNote);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memulai render");
    } finally {
      setSubmitting(false);
    }
  }

  function pollRenderDone() {
    const iv = setInterval(async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/render-jobs/project/${clip!.project_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const d = await res.json();
        const mine = (d.jobs ?? []).filter((j: { clip_id?: string }) => j.clip_id === clip!.id);
        const latest = mine[0];
        if (latest && (latest.status === "completed" || latest.status === "failed")) {
          clearInterval(iv);
          setDownloadLocked(false);
        }
      } catch {
        /* keep polling */
      }
    }, 8000);
  }

  async function handleAdWatched() {
    setAdPlaying(false);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/ads/watched", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setAdsWatched(d.ads_watched);
        setWatermarkRemoved(d.watermark_removed);
        toast.success(d.message);
      }
    } catch {
      toast.error("Gagal mencatat iklan");
    }
  }

  /** Muat placement ikon/b-roll. refresh=true memaksa AI merencanakan ulang. */
  async function loadPlacements(refresh = false) {
    if (!clip) return;
    setBrollSearching(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/broll/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ project_id: clip.project_id, clip_id: clip.id, refresh }),
      });
      if (res.ok) {
        const d = await res.json();
        setLivePlacements(d.placements ?? []);
        if ((d.placements ?? []).length === 0) toast.info("AI tidak menemukan momen ikon yang cocok di klip ini.");
        else if (refresh) toast.success("Ikon & b-roll diperbarui.");
      } else {
        toast.error("Gagal memuat placement b-roll.");
      }
    } catch {
      toast.error("Gagal memuat placement b-roll.");
    } finally {
      setTimeout(() => setBrollSearching(false), 600);
    }
  }

  const refreshPlacements = () => loadPlacements(true);

  async function toggleBroll(v: boolean) {
    setBrollEnabled(v);
    if (v && clip) {
      await loadPlacements(false);
    } else {
      setLivePlacements([]);
    }
  }

  /* ------------------------------------------------------------- render */

  // ANTI-GELAP: WAJIB di atas early-return `if (loading || !clip)` —
  // hook harus jalan di setiap render; dulu taruh di bawah → React #310.
  const videoSrc = clip?.preview_ready && clip.preview_url ? clip.preview_url : null;
  const [urlTampil, setUrlTampil] = useState<string | null>(null);
  const urlBaruRef = useRef<string | null>(null);
  useEffect(() => {
    if (videoSrc && videoSrc !== urlTampil) {
      urlBaruRef.current = videoSrc;
      if (!urlTampil) setUrlTampil(videoSrc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc]);
  const videoSiapBaru = () => {
    if (urlBaruRef.current && urlBaruRef.current !== urlTampil) {
      setUrlTampil(urlBaruRef.current);
      urlBaruRef.current = null;
    }
  };

  if (loading || !clip) {
    return <PageLoading fullscreen label="Memuat editor" />;
  }

  const sedangDiproses = !clip.preview_ready;
  const totalWords = words.length;
  // PITA KATA: total lebar pita dibagi proporsional durasi tiap kata
  const ribbonPx = Math.max(totalWords * 26, 600);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* ═══ COMMAND BAR ala aplikasi pro: back | judul + skor | aksi ═══ */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:h-14 sm:px-4">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: clip.project_id } })}
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Kembali</span>
        </Button>

        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[13px] font-semibold tracking-tight sm:text-[14px]" title={clip.title}>
            {clip.title}
          </p>
          <p className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
            <Sparkles className="size-3 text-accent" />
            skor <span className="stat-figure text-[13px] text-accent">{clip.virality_score}</span>
            <span className="opacity-40">·</span>
            <span className="font-mono">{clock(duration)}</span>
          </p>
        </div>

        {watermarkRemoved ? (
          <span className="hidden items-center gap-1.5 rounded-full border border-[var(--color-success)]/30 bg-[color-mix(in_oklab,var(--color-success)_10%,transparent)] px-2.5 py-1.5 text-[11px] font-semibold md:inline-flex">
            <span className="max-w-[96px] truncate">Tanpa watermark</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdPlaying(true)}
            title="Tonton 4 iklan untuk menghapus watermark"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-accent-foreground transition-transform hover:-translate-y-px sm:gap-1.5 sm:px-3.5 sm:text-[12px]"
          >
            <BadgeX className="size-3.5 shrink-0" />
            <span className="hidden max-w-[96px] truncate md:inline">Hapus watermark</span>
            <span className="shrink-0 rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] tabular-nums">{adsWatched}/4</span>
          </button>
        )}

        <Button
          variant="accent"
          size="sm"
          className="shrink-0 rounded-full px-3.5"
          onClick={handleDownload}
          disabled={submitting || downloadLocked}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : downloadLocked ? <Clock className="size-4" /> : <Download className="size-4" />}
          {downloadLocked ? "Merender…" : "Unduh"}
        </Button>
      </header>

      {/* ═══ HUB: canvas 9:16 di tengah, tool sheet mengambang ═══ */}
      <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden">
        {/* area canvas — selalu center */}
        <div ref={fitRef} className="relative flex min-w-0 flex-1 justify-center overflow-hidden p-2 lg:p-4">
          <div className="flex flex-col items-center justify-center gap-3">
            <div
              className="relative shrink-0 overflow-hidden rounded-[1.4rem] border border-border bg-black shadow-2xl shadow-black/40 ring-1 ring-white/5"
              style={{ width: fit.w, height: fit.h }}
            >
              {urlTampil ? (
                <>
                  {videoSrc && videoSrc !== urlTampil ? (
                    <video
                      key={videoSrc}
                      src={videoSrc}
                      playsInline
                      preload="auto"
                      muted
                      className="absolute inset-0 size-full object-cover opacity-0"
                      onLoadedData={videoSiapBaru}
                      aria-hidden
                    />
                  ) : null}
                  <video
                    ref={videoRef}
                    src={urlTampil}
                    playsInline
                    preload="auto"
                    className="absolute inset-0 size-full object-cover"
                    onClick={togglePlay}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setPlaying(false)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                  />
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-xs text-muted-foreground">
                  <Loader2 className="size-6 animate-spin" />
                  Menyiapkan video…
                </div>
              )}

              {/* ZONA TAP kiri/kanan: mundur/maju 5 detik */}
              {videoSrc ? (
                <>
                  <button
                    type="button"
                    onClick={() => nudge(-5)}
                    className="absolute left-0 top-0 z-10 h-full w-[28%] cursor-w-resize bg-transparent active:bg-white/5"
                    aria-label="Mundur 5 detik"
                  />
                  <button
                    type="button"
                    onClick={() => nudge(5)}
                    className="absolute right-0 top-0 z-10 h-full w-[28%] cursor-e-resize bg-transparent active:bg-white/5"
                    aria-label="Maju 5 detik"
                  />
                </>
              ) : null}

              {/* TIRAI PEMROSESAN */}
              {sedangDiproses ? (
                <PreviewLoading
                  pct={prevPct}
                  stage={prevStage}
                  etaS={prevEta}
                  elapsedS={prevElapsed}
                />
              ) : null}

              {!sedangDiproses ? (
                <LiveCaptionOverlay
                  words={words}
                  time={time}
                  style={liveStyle}
                  containerWidth={fit.w}
                  showEmoji={emojiEnabled}
                  {...(layoutEnabled && layoutPlan ? { splitRanges: layoutPlan } : {})}
                />
              ) : null}

              {/* B-ROLL PiP — parity dengan render unduhan */}
              {brollEnabled
                ? livePlacements
                    .filter((p) => !!p.broll_url)
                    .map((p, idx) => {
                      const b0 = p.broll_start ?? p.time_start;
                      const b1 = p.broll_end ?? p.time_end;
                      const active = time >= b0 && time <= b1;
                      const sk = p.broll_scale ?? 1;
                      const w = fit.w * 0.74 * sk;
                      const hgt = w * (9 / 16);
                      const cy = p.broll_cy ?? 0.44;
                      return (
                        <BrollPip
                          key={`broll-${b0}-${idx}`}
                          url={p.broll_url as string}
                          active={active}
                          localTime={Math.max(0, time - b0)}
                          width={w}
                          top={fit.h * cy - hgt / 2}
                        />
                      );
                    })
                : null}

              {/* Ikon & b-roll live */}
              {brollEnabled && livePlacements.length > 0
                ? livePlacements.map((p, idx) => {
                    const active = time >= p.time_start && time <= p.time_end;
                    const dist = fit.w * 0.7;
                    let hidden = "translate(-50%, -50%) ";
                    switch (p.animation) {
                      case "slide-right": hidden += `translateX(${-dist}px)`; break;
                      case "slide-up": hidden += `translateY(${dist}px)`; break;
                      case "slide-down": hidden += `translateY(${-dist}px)`; break;
                      case "zoom-in": hidden += "scale(0) rotate(-90deg)"; break;
                      case "pop-bounce": hidden += "scale(0)"; break;
                      case "flip-in": hidden += "perspective(600px) rotateY(90deg)"; break;
                      case "drop-in": hidden += `translateY(${-fit.h * 0.5}px) rotate(-20deg)`; break;
                      case "swing-in": hidden += `translateX(${dist}px) rotate(25deg)`; break;
                      case "rotate-in": hidden += "scale(0) rotate(270deg)"; break;
                      default: hidden += `translateX(${dist}px)`;
                    }
                    return (
                      <div
                        key={`${p.time_start}-${idx}`}
                        className="pointer-events-none absolute flex items-center justify-center transition-[transform,opacity] duration-500 ease-out"
                        style={{
                          left: `${(p.icon_cx ?? (p.side === "left" ? 0.2 : p.side === "center" ? 0.5 : 0.8)) * 100}%`,
                          top: `${(p.icon_cy ?? 0.26) * 100}%`,
                          transform: active ? "translate(-50%, -50%)" : hidden,
                          opacity: active ? 1 : 0,
                        }}
                      >
                        <div style={{ width: fit.w * 0.24, height: fit.w * 0.24 }}>
                          {p.icon_id ? (
                            <img
                              src={`/api/icons/${p.icon_id}`}
                              alt=""
                              className="size-full object-contain"
                              style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.45))" }}
                            />
                          ) : (
                            <ColoredIcon category={p.category} icon={p.icon ?? null} />
                          )}
                        </div>
                      </div>
                    );
                  })
                : null}

              {/* PARITY watermark: x=3%, y=4.5% — WAJIB sama dgn ffmpeg */}
              {!watermarkRemoved ? (
                <div className="pointer-events-none absolute left-[3%] top-[4.5%] flex items-center opacity-65" style={{ gap: Math.max(2, fit.w * 0.012) }}>
                  <img src="/watermark-logo.png" alt="" className="shrink-0 object-contain" style={{ width: fit.w * 0.095, height: fit.w * 0.095 }} />
                  <div className="min-w-0 leading-tight">
                    <p className="font-bold text-white" style={{ fontSize: Math.max(7, fit.w * 0.036) }}>CortexClipAI</p>
                    <p className="text-white/90" style={{ fontSize: Math.max(4, fit.w * 0.017) }}>AI that can help many people, made in Indonesia</p>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={togglePlay}
                className={`absolute left-1/2 top-1/2 z-20 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 backdrop-blur transition-all duration-200 hover:scale-105 hover:bg-black/60 ${playing ? "opacity-0 focus-visible:opacity-100" : "opacity-100"}`}
                aria-label={playing ? "Jeda" : "Putar"}
              >
                {playing ? <Pause className="size-6 text-white" /> : <Play className="size-6 translate-x-0.5 text-white" />}
              </button>
            </div>

            {/* ═══ PITA KATA: transcript-as-timeline — kata = scrubber ═══ */}
            <div className="w-full max-w-[520px] px-1" data-editor-scroll>
              {/* bar waktu tipis di atas pita */}
              <div className="mb-1.5 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>{clock(time)}</span>
                <span className={playing ? "inline-block size-1.5 animate-pulse rounded-full bg-accent" : "text-muted-foreground/70"}>{playing ? "" : "jeda"}</span>
                <span>{clock(duration)}</span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-150"
                  style={{ width: `${(time / duration) * 100}%` }}
                />
              </div>
              {totalWords > 0 ? (
                <div className="mt-2 flex gap-[3px] overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {words.map((w, wi) => {
                    const aktif = time >= w.start && time < w.end;
                    const lewat = time >= w.end;
                    return (
                      <button
                        key={wi}
                        type="button"
                        onClick={() => seek(w.start + 0.01)}
                        title={`${w.word} · ${clock(w.start)}`}
                        aria-label={`Lompat ke ${w.word}`}
                        className={`shrink-0 rounded-[4px] px-1.5 py-1 text-[11px] font-medium leading-none transition-all duration-150 ${
                          aktif
                            ? "scale-110 bg-accent text-accent-foreground shadow"
                            : lewat
                              ? "bg-accent/15 text-foreground/50 hover:bg-accent/25"
                              : "bg-surface text-foreground/80 hover:bg-accent/20 hover:text-foreground"
                        }`}
                      >
                        {w.word}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* ═══ DOCK: 4 chip tool mengambang di bawah ═══ */}
            <div className="flex w-full max-w-[520px] items-center justify-center gap-1.5 px-1">
              {TOOLS.map((t) => {
                const aktif = activeTool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={aktif}
                    onClick={() => setActiveTool(aktif ? null : t.id)}
                    className={`group flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-all duration-200 sm:px-3.5 sm:text-[12.5px] ${
                      aktif
                        ? "border-accent bg-accent text-accent-foreground shadow-md shadow-accent/20"
                        : "border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground"
                    }`}
                  >
                    <t.Icon className="size-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══ SHEET TOOL mengambang (desktop: dock kanan; mobile: sheet bawah) ═══ */}
        <AnimatePresence>
          {activeTool ? (
            <motion.aside
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 bottom-0 z-30 max-h-[52dvh] overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl shadow-black/25 md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:max-h-none md:w-[300px] md:rounded-3xl md:border"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-[13px] font-semibold tracking-tight">
                  {TOOLS.find((t) => t.id === activeTool)?.label}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTool(null)}
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                  aria-label="Tutup panel"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto overscroll-contain p-4" data-editor-scroll>
                <AnimatePresence mode="wait">
                  {activeTool === "info" ? (
                    <ToolPane key="info">
                      <FieldLabel>Deskripsi</FieldLabel>
                      <textarea
                        value={clip.description ?? ""}
                        onChange={(e) => setClip({ ...clip, description: e.target.value })}
                        onBlur={() => void supabase.from("clips").update({ description: clip.description }).eq("id", clip.id)}
                        rows={4}
                        className="w-full rounded-xl border border-border bg-background p-2.5 text-[13px] outline-none transition-colors focus:border-accent"
                      />
                      <FieldLabel>Hashtag</FieldLabel>
                      <input
                        value={(clip.hashtags ?? []).join(" ")}
                        onChange={(e) => setClip({ ...clip, hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
                        onBlur={() => void supabase.from("clips").update({ hashtags: clip.hashtags }).eq("id", clip.id)}
                        className="w-full rounded-xl border border-border bg-background p-2.5 text-[13px] outline-none transition-colors focus:border-accent"
                      />
                    </ToolPane>
                  ) : activeTool === "subtitle" ? (
                    <ToolPane key="subtitle">
                      <FieldLabel>Gaya subtitle</FieldLabel>
                      <SubtitleStylePicker value={presetId} onChange={setPresetId} />
                      <div className="mt-3 space-y-3">
                        <SliderRow label={`Ukuran · ${Math.round(fontScale * 100)}%`} min={0.6} max={1.8} step={0.05} value={fontScale} onChange={setFontScale} />
                        <SliderRow label={`Posisi · ${effPosition}%`} min={20} max={80} step={1} value={effPosition} onChange={(v) => setPosition(Math.round(v))} />
                        <SliderRow label={`Transparansi · ${Math.round(opacity * 100)}%`} min={0.1} max={1} step={0.05} value={opacity} onChange={setOpacity} />
                      </div>
                    </ToolPane>
                  ) : activeTool === "teks" ? (
                    <ToolPane key="teks">
                      {words.length === 0 ? (
                        <p className="text-[12px] leading-relaxed text-muted-foreground">
                          Transkrip belum tersedia untuk klip ini.
                        </p>
                      ) : (
                        <p className="flex flex-wrap gap-x-1 gap-y-1.5 text-[14px] leading-relaxed">
                          {words.map((w, wi) => {
                            const aktif = time >= w.start && time < w.end;
                            const lewat = time >= w.end;
                            return (
                              <button
                                key={wi}
                                type="button"
                                onClick={() => seek(w.start + 0.01)}
                                className={`rounded px-0.5 transition-colors ${
                                  aktif
                                    ? "bg-accent text-accent-foreground"
                                    : lewat
                                      ? "text-foreground/60 hover:text-foreground"
                                      : "text-foreground/90 hover:text-accent"
                                }`}
                                aria-label={`Putar dari kata ${w.word}`}
                              >
                                {w.word}
                              </button>
                            );
                          })}
                        </p>
                      )}
                      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                        Ketuk kata untuk melompat ke momennya. Sorotan mengikuti video secara real-time.
                      </p>
                    </ToolPane>
                  ) : (
                    <ToolPane key="broll">
                      <ToggleRow
                        label="Ikon & B-Roll"
                        desc="AI menyisipkan ikon animasi di momen tepat."
                        enabled={brollEnabled}
                        onChange={(v) => void toggleBroll(v)}
                      />
                      {brollSearching ? (
                        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1 text-[10px] text-accent">
                          <Loader2 className="size-3 animate-spin" /> Mencari momen ikon…
                        </div>
                      ) : null}
                      {brollEnabled && !brollSearching && livePlacements.length > 0 ? (
                        <>
                          <div className="mt-1.5 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setIconListOpen((v) => !v)}
                              aria-expanded={iconListOpen}
                              className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-medium transition-colors hover:text-foreground"
                            >
                              <span>Momen ikon ({livePlacements.length})</span>
                              <ChevronDown
                                className={`size-3 shrink-0 transition-transform ${iconListOpen ? "rotate-180" : ""}`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => void refreshPlacements()}
                              title="Cari ikon & b-roll lain"
                              className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              Cari lain
                            </button>
                          </div>
                          {iconListOpen ? (
                            <ul className="mt-1 space-y-0.5">
                              {livePlacements.map((p, i) => (
                                <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1 text-[10px]">
                                  <span className="min-w-0 truncate capitalize">{p.category}</span>
                                  <button type="button" onClick={() => seek(Math.max(0, p.time_start - 1))} className="shrink-0 font-mono text-accent">
                                    {clock(p.time_start)}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </>
                      ) : null}
                      <div className="mt-1.5">
                        <ToggleRow
                          label="Emoji pada subtitle"
                          desc="Emoji di beberapa kata kunci."
                          enabled={emojiEnabled}
                          onChange={setEmojiEnabled}
                        />
                      </div>

                      {/* AUTO SPLIT */}
                      <div className="mt-1.5">
                        <ToggleRow
                          label="Auto Split"
                          desc="Layar dibagi dua saat dua orang bergiliran bicara."
                          enabled={layoutEnabled}
                          onChange={(v) => {
                            setLayoutEnabled(v);
                            void simpanLayout(v);
                          }}
                        />

                        {layoutEnabled ? (
                          <>
                            <p className="mt-1.5 flex items-center gap-1.5 text-[10px] leading-tight text-muted-foreground">
                              {layoutSaving ? (
                                <>
                                  <Loader2 className="size-3 shrink-0 animate-spin text-accent" />
                                  Menyimpan &amp; menyiapkan preview…
                                </>
                              ) : (
                                "Sistem memilih sendiri momennya — subtitle ikut pindah ke tengah."
                              )}
                            </p>

                            {layoutPlan && layoutPlan.length > 0 ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setLayoutListOpen((v) => !v)}
                                  aria-expanded={layoutListOpen}
                                  className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-medium transition-colors hover:text-foreground"
                                >
                                  <span>Momen split ({layoutPlan.length})</span>
                                  <ChevronDown
                                    className={`size-3 shrink-0 transition-transform ${layoutListOpen ? "rotate-180" : ""}`}
                                  />
                                </button>
                                {layoutListOpen ? (
                                  <ul className="mt-1 space-y-0.5">
                                    {layoutPlan.map((s, i) => (
                                      <li
                                        key={i}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1 text-[10px]"
                                      >
                                        <span className="min-w-0 truncate">
                                          {(s.end - s.start).toFixed(1)}s dua orang
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => seek(Math.max(0, s.start))}
                                          className="shrink-0 font-mono text-accent"
                                        >
                                          {clock(s.start)}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={layoutSaving}
                                onClick={() => void muatRencanaLayout()}
                                className="mt-1.5 w-full rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                              >
                                Lihat momen split
                              </button>
                            )}
                          </>
                        ) : null}
                      </div>
                    </ToolPane>
                  )}
                </AnimatePresence>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ===== modal konfirmasi unduh ===== */}
      <AnimatePresence>
        {downloadInfo !== null ? (
          <Overlay onClose={() => setDownloadInfo(null)}>
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/12 text-accent">
              <Download className="size-6" />
            </span>
            <h3 className="mt-4 text-center font-display text-lg font-bold tracking-tight">
              Video tersedia di halaman{" "}
              <button
                type="button"
                onClick={() => {
                  setDownloadInfo(null);
                  navigate({ to: "/unduh" });
                }}
                className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent/80"
              >
                Unduhan
              </button>
            </h3>
            <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
              {downloadInfo
                ? `Sedang mengantri untuk merender video.${downloadInfo}`
                : "Merender video agar siap diunduh — proses berjalan di cloud meski kamu keluar dari halaman ini."}
            </p>
            <Button variant="accent" size="sm" className="mt-5 w-full rounded-full" onClick={() => setDownloadInfo(null)}>
              Mengerti
            </Button>
          </Overlay>
        ) : null}
      </AnimatePresence>

      {/* ===== popup iklan full-screen (AdSense) ===== */}
      {adPlaying ? (
        <AdFullscreen
          client="ca-pub-6841543975898069"
          index={adsWatched + 1}
          total={4}
          onDone={() => void handleAdWatched()}
          onCancel={() => setAdPlaying(false)}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- komponen */

function ToolPane({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-2.5"
    >
      {children}
    </motion.div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function SliderRow({ label, min, max, step, value, onChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

function ToggleRow({ label, desc, enabled, onChange }: {
  label: string;
  desc: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-2.5 py-2">
      <div className="min-w-0">
        <p className="text-[12px] font-medium leading-tight">{label}</p>
        <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-accent" : "bg-border"}`}
        style={{ height: 20 }}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${enabled ? "left-[19px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center p-4">
      <motion.button
        aria-label="Tutup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/30 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-3xl border border-border bg-background p-6 shadow-lg"
      >
        {children}
      </motion.div>
    </div>
  );
}

function clock(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
