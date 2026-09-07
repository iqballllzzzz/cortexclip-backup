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
  SkipBack,
  SkipForward,
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
import { EditorMoreMenu, type MoreAction } from "@/components/editor-more-menu";
import { ManualTrackDialog } from "@/components/manual-track-dialog";
import { EditTranscriptDialog } from "@/components/edit-transcript-dialog";
import { CustomLogoDialog } from "@/components/custom-logo-dialog";
import { DraggableLogoLayer, type LogoState } from "@/components/draggable-logo-layer";
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

  // tools — panel SELALU TERBUKA (keluhan: "tombol tombol gak kelihatan sama
  // sekali"). Dulu null = tertutup, jadi pengguna harus menebak untuk mengetuk
  // chip dulu sebelum ada kontrol yang muncul. Sekarang tab default terpilih.
  const [activeTool, setActiveTool] = useState<ToolId>("subtitle");
  const [presetId, setPresetId] = useState(DEFAULT_SUBTITLE_PRESET);
  const [fontScale, setFontScale] = useState(1);
  const [position, setPosition] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(1);
  // PISAH (permintaan pengguna): ikon & b-roll jadi dua tombol berbeda —
  // "takutnya ada yang cuma suka ikon dan ada yang cuma suka b-roll".
  // iconsEnabled = ikon PNG animasi; brollEnabled = video b-roll PiP.
  const [iconsEnabled, setIconsEnabled] = useState(false);
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

  // MENU TITIK-TIGA (di kanan preview): manual tracking / edit transkrip /
  // custom logo — plus logo draggable di atas preview.
  const [moreDialog, setMoreDialog] = useState<MoreAction | null>(null);
  const [logo, setLogo] = useState<LogoState | null>(null);
  const [wordsOverride, setWordsOverride] = useState<LiveWord[] | null>(null);

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

  /* --- memori editor per-klip: SERVER dulu, localStorage cadangan ---
     Permintaan pengguna: semua pengaturan tersimpan di SERVER — keluar dari
     editor, ganti perangkat, semuanya ikut. localStorage tetap dipakai
     sebagai cache instan supaya layar tidak "kedip" saat menunggu jaringan. */
  const memKey = `cc_editor_mem_${clipId}`;
  const prefsServerRef = useRef(false);   // sudah muat dari server?
  useEffect(() => {
    let mati = false;
    (async () => {
      // 1) instan: cache lokal dulu (kalau ada)
      try {
        const raw = localStorage.getItem(memKey);
        if (raw) {
          const m = JSON.parse(raw) as Record<string, unknown>;
          terapkanMem(m);
        }
      } catch { /* korup → abaikan */ }
      // 2) sumber kebenaran: server
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/editor-prefs/${clipId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !mati) {
          const d = await res.json();
          const m = (d.prefs ?? {}) as Record<string, unknown>;
          if (Object.keys(m).length > 0) {
            terapkanMem(m);
          }
        }
      } catch { /* offline: pakai cache lokal */ }
      if (!mati) prefsServerRef.current = true;
    })();
    function terapkanMem(m: Record<string, unknown>) {
      if (typeof m["presetId"] === "string") setPresetId(m["presetId"]);
      if (typeof m["fontScale"] === "number") setFontScale(m["fontScale"]);
      if (typeof m["position"] === "number") setPosition(m["position"]);
      if (typeof m["opacity"] === "number") setOpacity(m["opacity"]);
      if (typeof m["brollEnabled"] === "boolean") {
        setBrollEnabled(m["brollEnabled"]);
      }
      if (typeof m["iconsEnabled"] === "boolean") setIconsEnabled(m["iconsEnabled"]);
      if (typeof m["emojiEnabled"] === "boolean") setEmojiEnabled(m["emojiEnabled"]);
      if (Array.isArray(m["livePlacements"]) && (m["iconsEnabled"] || m["brollEnabled"]))
        setLivePlacements(m["livePlacements"] as Placement[]);
    }
    return () => { mati = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memKey]);

  /* AUTO-SAVE: debounce 1.5s — tulis cache lokal + kirim ke server.
     Jangan spam server saat slider digeser; jangan kirim sebelum muat
     pertama selesai (supaya prefs lama tidak tertimpa nilai default). */
  useEffect(() => {
    const t = setTimeout(() => {
      const isi = {
        presetId, fontScale, position, opacity,
        brollEnabled, iconsEnabled, emojiEnabled, livePlacements,
        savedAt: Date.now(),
      };
      try {
        localStorage.setItem(memKey, JSON.stringify(isi));
      } catch { /* storage penuh → server tetap dapat */ }
      if (!prefsServerRef.current) return; // belum siap — jangan timpa
      (async () => {
        try {
          const token = await getAccessToken();
          await fetch(`/api/editor-prefs/${clipId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(isi),
          });
        } catch { /* offline: cache lokal sudah cukup */ }
      })();
    }, 1500);
    return () => clearTimeout(t);
  }, [memKey, clipId, presetId, fontScale, position, opacity, brollEnabled, iconsEnabled, emojiEnabled, livePlacements]);

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
      // logo tersimpan? (camera_track.logo) → tampilkan di preview
      const ct = (c as unknown as { camera_track?: { logo?: LogoState } }).camera_track;
      if (ct?.logo?.url) setLogo(ct.logo);
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

  /* --- AUTO SPLIT: sinkron status tersimpan HANYA SEKALI per klip ---
     BUG "toggle balik ke OFF sendiri": simpanLayout sukses lalu setClip(...)
     membuat objek clip baru, useEffect[clip] berjalan lagi dan membaca
     layout_prefs LAMA (stale — klien tidak pernah menulis hasil PATCH),
     lalu menimpa toggle menjadi false padahal barusan dinyalakan.
     Sekarang: sinkron hanya sekali per id klip; setelah itu state lokal
     yang memegang kebenaran (user sudah jelas melihat toggle yang ia klik). */
  const splitSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (!clip) return;
    if (splitSyncRef.current === clip.id) return; // sudah disinkron untuk klip ini
    splitSyncRef.current = clip.id;
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
        const d = (await res.json()) as { preview_direset?: boolean; layout_prefs?: { enabled?: boolean } };
        // tulis prefs hasil PATCH ke state clip supaya data lokal tidak stale
        setClip((c) => (c
          ? { ...c,
              layout_prefs: d.layout_prefs ?? { enabled },
              ...(d.preview_direset ? { preview_url: null, preview_ready: false } : {}) }
          : c));
        if (d.preview_direset) {
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
      (wordsOverride ??
        ((clip?.caption_words as unknown as { word: string; start: number; end: number }[]) ?? [])
      ).map(
        (w) => ({ word: w.word, start: Number(w.start), end: Number(w.end) }),
      ),
    [clip, wordsOverride],
  );

  /* --- fit canvas 9:16 --- KELUHAN PENGGUNA: "previewnya gede banget hampir
     menuhin layar jadi tombol tombol tak terlihat". Dulu tingginya = seluruh
     ruang tersisa, jadi preview memakan layar dan kontrol terdorong keluar.
     Sekarang tinggi preview DIBATASI TEGAS oleh plafon viewport:
       mobile  : maks 44dvh  (sisanya untuk panel tool yang selalu terbuka)
       desktop : maks 62vh   (panel tool jadi kolom kanan permanen)
     Plafon dihitung dari innerHeight, bukan dari tinggi kontainer, supaya
     kontainer tidak bisa "menang" dan mengembalikan preview jadi raksasa. */
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => {
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (availW < 40 || availH < 40) return;
      const vh = window.innerHeight || 800;
      const desktop = window.innerWidth >= 1024;
      // desktop: plafon 62vh menahan preview agar panel kanan tetap lega.
      // mobile: kolom kiri sudah dipatok 47dvh lewat CSS, jadi plafon di sini
      // hanya jaring pengaman (58dvh) — availH yang menentukan.
      // Desktop 80vh / HP 72vh dari tinggi layar (permintaan pengguna:
      // "preview harus lebih besar, yang sekarang terlalu kecil") — masih
      // menyisakan ruang transport bar + pita kata + panel tool.
      const plafon = desktop ? vh * 0.80 : vh * 0.72;
      const h = Math.min(availH - 8, (availW * 16) / 9, plafon);
      const w = (h * 9) / 16;
      setFit({ w: Math.round(w), h: Math.round(h) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
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
      // PARITY RENDER: kirim keduanya supaya render unduhan tahu persis
      // mana yang aktif (ikon, b-roll, atau keduanya).
      broll: iconsEnabled || brollEnabled ? {
        icons: iconsEnabled,
        broll: brollEnabled,
      } : false,
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
    if (v && clip && livePlacements.length === 0) {
      await loadPlacements(false);
    } else if (!v && !iconsEnabled) {
      setLivePlacements([]);
    }
  }

  async function toggleIcons(v: boolean) {
    setIconsEnabled(v);
    if (v && clip && livePlacements.length === 0) {
      await loadPlacements(false);
    } else if (!v && !brollEnabled) {
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
      const urlLama = urlTampil;
      setUrlTampil(urlBaruRef.current);
      urlBaruRef.current = null;
      // AUTO-REFRESH (permintaan pengguna): preview baru (mis. setelah Auto
      // Split dinyalakan) langsung diputar dari awal — pengguna tidak perlu
      // memuat ulang halaman lagi untuk melihat hasil splitnya.
      if (urlLama) {
        const v = videoRef.current;
        if (v) {
          v.currentTime = 0;
          v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        }
        toast.success("Preview diperbarui");
      }
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
            <span className="hidden whitespace-nowrap md:inline">Hapus watermark</span>
            <span className="shrink-0 rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] tabular-nums">{adsWatched}/4</span>
          </button>
        )}

        <Button
          variant="accent"
          size="sm"
          className="shrink-0 rounded-full px-2.5 xs:px-3.5"
          onClick={handleDownload}
          disabled={submitting || downloadLocked}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : downloadLocked ? <Clock className="size-4" /> : <Download className="size-4" />}
          {/* teks disembunyikan di HP sempit supaya judul klip tidak terpotong */}
          <span className="hidden xs:inline">{downloadLocked ? "Merender…" : "Unduh"}</span>
        </Button>
      </header>

      {/* ═══ RUANG KERJA — dua kolom di desktop, dua baris di mobile.
           KELUHAN: "preview menguasai hampir sepenuhnya layar jadi tombol
           tombol tak terlihat" + "tombol tombol fitur nya kecil banget".
           Perbaikan struktural:
             · preview dijepit plafon 44dvh (mobile) / 62vh (desktop)
             · panel tool JADI KOLOM PERMANEN (desktop 340px) dan PANEL BAWAH
               permanen di mobile — tidak lagi sheet yang harus dibuka
             · tab tool jadi baris tinggi 44px (target sentuh Apple/Google),
               teks 13px, bukan chip 11px
             · pita kata jadi 32px tinggi dengan teks 12.5px
           ═══ */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* ————— KOLOM KIRI: preview + transport + pita kata ————— */}
        {/* MOBILE: tinggi kolom kiri DIPATOK 66dvh supaya (a) preview punya
            ruang nyata — dulu `shrink-0` + anak `flex-1` menghasilkan tinggi
            konten 38px alias preview mini — dan (b) panel tool dapat sisa
            layar yang pasti. DESKTOP: kolom mengisi sisa lebar seperti biasa. */}
        <div className="flex h-[74dvh] shrink-0 flex-col items-center gap-2 border-b border-border bg-surface/30 px-2 py-2 lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1 lg:border-b-0 lg:border-r lg:px-4 lg:py-4">
          {/* PREVIEW + TOMBOL TITIK-TIGA DI KANANNYA (di luar kotak video):
              permintaan pengguna: "kasih tombol titik tiga di kanan nya
              preview alias diluar preview" — tombol edit di kolom sempit
              di sebelah kanan kotak 9:16, selalu terlihat. */}
          <div className="flex min-h-0 w-full flex-1 items-stretch justify-center gap-2">
            <div ref={fitRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
              <div
                className="relative shrink-0 overflow-hidden rounded-2xl border border-border bg-black shadow-xl shadow-black/30"
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

              {/* B-ROLL PiP — parity dengan render unduhan (toggle sendiri) */}
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

              {/* IKON live — toggle sendiri "Ikon" (bukan lagi satu paket
                  dengan b-roll): pengguna bisa suka ikon saja atau b-roll
                  saja; keduanya nyala → keduanya tampil. */}
              {iconsEnabled && livePlacements.length > 0
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

              {/* Tombol play besar ada di TRANSPORT BAR di bawah preview.
                  Di atas video: seluruh bidang jadi target ketuk (perilaku
                  pemutar yang lazim) dengan lencana kecil di sudut kiri-bawah.
                  Lencana TIDAK di tengah supaya tidak menutupi subtitle —
                  justru subtitle itu yang sedang dinilai penggunanya saat
                  memilih gaya. */}
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 z-20 cursor-pointer bg-transparent"
                aria-label={playing ? "Jeda" : "Putar"}
              >
                <span
                  className={`absolute bottom-2 left-2 grid size-9 place-items-center rounded-full bg-black/55 backdrop-blur transition-opacity duration-200 ${
                    playing ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <Play className="size-4 translate-x-px text-white" />
                </span>
              </button>

              {/* LOGO CUSTOM (premium) — draggable + resize di atas preview.
                  z di atas tombol play supaya bisa dipegang. */}
              {logo && !sedangDiproses ? (
                <DraggableLogoLayer
                  clipId={clip.id}
                  boxW={fit.w}
                  boxH={fit.h}
                  logo={logo}
                  onChange={setLogo}
                />
              ) : null}
            </div>
            </div>

            {/* TOMBOL TITIK-TIGA di kanan preview (di luar kotak video) */}
            <div className="flex shrink-0 flex-col items-center justify-center gap-2">
              <EditorMoreMenu
                onAction={(a) => {
                  if (a === "manual-track" && !sourceUrl) {
                    toast.error("Video sumber belum siap — coba lagi sebentar");
                    return;
                  }
                  setMoreDialog(a);
                }}
              />
            </div>
          </div>

          {/* ————— TRANSPORT BAR: tombol BESAR & JELAS (permintaan: "toolbar
              nya naikin biar lebih keliatan") — play 56px, ±5s 48px ————— */}
          <div className="flex w-full max-w-[560px] shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => nudge(-5)}
              className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-card text-[13px] font-bold tabular-nums text-foreground transition-colors hover:border-accent/60 hover:text-accent active:scale-95"
              aria-label="Mundur 5 detik"
            >−5s</button>
            <button
              type="button"
              onClick={togglePlay}
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition-transform hover:brightness-105 active:scale-95"
              aria-label={playing ? "Jeda" : "Putar"}
            >
              {playing ? <Pause className="size-7" /> : <Play className="size-7 translate-x-0.5" />}
            </button>
            <button
              type="button"
              onClick={() => nudge(5)}
              className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-card text-[13px] font-bold tabular-nums text-foreground transition-colors hover:border-accent/60 hover:text-accent active:scale-95"
              aria-label="Maju 5 detik"
            >+5s</button>

            {/* scrubber + jam */}
            <div className="ml-1 min-w-0 flex-1">
              <div className="flex items-center justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
                <span>{clock(time)}</span>
                <span>{clock(duration)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={Math.min(time, duration)}
                onChange={(e) => seek(Number(e.target.value))}
                className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-[var(--color-accent)]"
                aria-label="Garis waktu klip"
              />
            </div>
          </div>

          {/* PITA KATA DIHAPUS (permintaan pengguna: "dibawah progress bar dan
              pause/unpause itu ada transkrip panjang, hapus aja karena menuh
              menuhin tempat — transkrip bisa diakses lewat tombol Transkrip").
              Semua fitur kini murni lewat tab tool di panel kanan. */}
        </div>

        {/* ————— KOLOM KANAN (desktop) / PANEL BAWAH (mobile): tool ————— */}
        <aside className="flex min-h-0 flex-1 flex-col bg-card lg:w-[340px] lg:flex-none">
          {/* TAB TOOLBAR — DIBESARKAN TOTAL (permintaan: "naikin biar lebih
              keliatan") — h-16 (64px), ikon 26px, teks 13.5px bold, gap 1.5,
              indikator 3px, background aktif solid + border tebal */}
          <div className="grid shrink-0 grid-cols-4 border-b-2 border-border bg-card" role="tablist">
            {TOOLS.map((t) => {
              const aktif = activeTool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={aktif}
                  onClick={() => setActiveTool(t.id)}
                  className={`relative flex h-16 flex-col items-center justify-center gap-1.5 border-r border-border/50 px-1 text-[13px] font-bold leading-none transition-all sm:text-[13.5px] last:border-r-0 ${
                    aktif
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "bg-card text-muted-foreground hover:bg-accent/10 hover:text-accent"
                  }`}
                >
                  <t.Icon className="size-[26px] shrink-0" strokeWidth={aktif ? 2.6 : 2} />
                  <span className="max-w-full truncate tracking-tight">{t.label}</span>
                  <span
                    aria-hidden
                    className={`absolute inset-x-1 bottom-0 h-[3px] rounded-full transition-colors ${
                      aktif ? "bg-accent-foreground/30" : "bg-transparent"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* satu-satunya area yang scroll */}
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3.5"
            data-editor-scroll
          >
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
                      {/* 4 TOGGLE DALAM GRID 2 KOLOM (permintaan: "biar di satu
                          baris bisa nyimpen 2 tombol toggle dan bikin lebih
                          terlihat semua tombolnya") — semua toggle terlihat
                          sekaligus tanpa scroll. */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <ToggleRow
                          label="Ikon"
                          enabled={iconsEnabled}
                          onChange={(v) => void toggleIcons(v)}
                        />
                        <ToggleRow
                          label="B-Roll"
                          enabled={brollEnabled}
                          onChange={(v) => void toggleBroll(v)}
                        />
                        <ToggleRow
                          label="Emoji"
                          enabled={emojiEnabled}
                          onChange={setEmojiEnabled}
                        />
                        <ToggleRow
                          label="Auto Split"
                          enabled={layoutEnabled}
                          onChange={(v) => {
                            setLayoutEnabled(v);
                            void simpanLayout(v);
                          }}
                        />
                      </div>
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

                      {/* detail AUTO SPLIT (toggle sudah di grid atas) */}
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
                    </ToolPane>
                  )}
            </AnimatePresence>
          </div>
        </aside>
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

      {/* ===== DIALOG MENU TITIK-TIGA ===== */}
      {moreDialog === "manual-track" ? (
        <ManualTrackDialog
          clipId={clip.id}
          sourceUrl={sourceUrl}
          duration={duration}
          clipStart={startNum}
          onClose={() => setMoreDialog(null)}
          onApplied={() => {
            // preview reset oleh backend → paksa render ulang lewat polling
            setClip((c) => (c ? { ...c, preview_ready: false, preview_url: null } : c));
            setPrevPct(0);
            setPrevStage("Menyiapkan");
          }}
        />
      ) : null}
      {moreDialog === "edit-transkrip" ? (
        <EditTranscriptDialog
          clipId={clip.id}
          words={words}
          onClose={() => setMoreDialog(null)}
          onSaved={(w) => {
            setWordsOverride(w);
            setClip((c) => (c ? { ...c, caption_words: w as unknown as Clip["caption_words"] } : c));
          }}
        />
      ) : null}
      {moreDialog === "custom-logo" ? (
        <CustomLogoDialog
          clipId={clip.id}
          onClose={() => setMoreDialog(null)}
          onAgree={(url) => {
            setLogo({ url, cx: 0.87, cy: 0.05, scale: 0.18 });
            // logo terpasang → preview dirender ulang (logo dibakar di
            // unduhan; layer DOM menunjukkan posisinya di preview)
            setClip((c) => (c ? { ...c, preview_ready: false, preview_url: null } : c));
            setPrevPct(0);
            setPrevStage("Menyiapkan");
          }}
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
  desc?: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-xl border border-border bg-background px-3 py-2">
      <p className="min-w-0 truncate text-[12px] font-medium leading-tight">{label}</p>
      {/* LABEL↔TOGGLE DIRAPATKAN (permintaan pengguna: "jarak antara nama
          dengan toggle kamu deketin biar di satu baris bisa nyimpen 2 tombol
          toggle") — px-3 (bukan 2.5) supaya 2 baris muat di kolom 340px. */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
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
