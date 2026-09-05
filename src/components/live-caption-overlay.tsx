import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * LIVE CAPTION OVERLAY — subtitle karaoke real-time di atas video preview.
 *
 * Ini "bantuan HTML5" yang diminta: subtitle langsung berubah mengikuti
 * setting (gaya/ukuran/posisi/opacity) TANPA menunggu re-render VPS —
 * karena dirender browser pakai word-level timing JSON (caption_words).
 * Perilaku MIRROR engine Supoclip backend:
 * - kata aktif = ganti warna + optional pill (word_box) + pop scaleY 118%
 *   (HANYA sumbu Y: scaleX/fscx mengubah advance width → baris reflow/getar)
 * - entrance pop one-shot per baris (fscx92→100)
 * - emphasis power-words → warna emphasis
 * Font = file @font-face self-hosted yang sama dengan bundle VPS.
 */

export interface LiveWord {
  word: string;
  start: number;
  end: number;
}

export interface LiveCaptionStyle {
  fontFamily: string;
  fontSize: number; // px pada lebar preview tertentu (basis 360px)
  /** kata per baris — mirror max_words_per_line backend (parity wrap) */
  maxWords?: number;
  fontColor: string;
  highlightColor: string;
  emphasisColor?: string;
  strokeColor?: string;
  strokeWidth: number; // px
  shadow: boolean;
  wordBox: boolean;
  wordBoxColor?: string;
  uppercase: boolean;
  opacity: number; // 0..1
  position: number; // % dari atas
  animation: "karaoke" | "fade" | "pop" | "bounce" | "none";
}

// Power-words (mirror backend) untuk emphasis
const POWER_WORDS = new Set([
  "never", "always", "everything", "nothing", "everyone", "nobody", "anyone",
  "best", "worst", "most", "biggest", "huge", "massive", "tiny", "every",
  "only", "first", "last", "free", "now", "today", "instantly", "forever",
  "guaranteed", "proven", "secret", "truth", "fact", "literally", "actually",
  "exactly", "must", "need", "stop", "warning", "danger", "critical", "key",
  "important", "remember", "mistake", "wrong", "right", "perfect", "ultimate",
  "powerful", "insane", "crazy", "incredible", "amazing", "shocking", "viral",
  "million", "billion", "thousand", "percent", "double", "triple", "ten",
  "jangan", "selalu", "semua", "pasti", "gratis", "sekarang", "rahasia",
  "benar", "salah", "penting", "wajib", "terbaik", "terbesar", "cepat",
]);

/** Emoji per kata kunci (EN + ID) — mirror kecil dari backend overlay_to_ass. */
const WORD_EMOJI: Record<string, string> = {
  money: "💰", cash: "💰", rich: "💰", uang: "💰", duit: "💰", cuan: "💰",
  kaya: "💰", juta: "💰", miliar: "💰", rupiah: "💰", gaji: "💰", harga: "💰",
  fire: "🔥", api: "🔥", panas: "🔥", viral: "🔥", gila: "🔥", heboh: "🔥",
  win: "🏆", menang: "🏆", juara: "🏆", sukses: "🏆", berhasil: "🏆",
  best: "⭐", terbaik: "⭐", bagus: "⭐", keren: "⭐", top: "⭐",
  love: "❤️", cinta: "❤️", hati: "❤️",
  rocket: "🚀", naik: "🚀", gas: "🚀", terbang: "🚀",
  brain: "🧠", pintar: "🧠", cerdas: "🧠", pikir: "🧠",
  fast: "⚡", cepat: "⚡", kilat: "⚡",
  strong: "💪", kuat: "💪", otot: "💪",
  laugh: "😂", lucu: "😂", haha: "😂", ketawa: "😂",
  sad: "😢", nangis: "😢", sedih: "😢",
  angry: "😡", marah: "😡", emosi: "😡",
  food: "🍽️", makan: "🍽️", makanan: "🍽️", enak: "🍽️",
  gym: "🏋️", olahraga: "🏋️", latihan: "🏋️",
  travel: "✈️", liburan: "✈️", jalan: "✈️",
  king: "👑", raja: "👑", boss: "👑",
  idea: "💡", solusi: "💡", trik: "💡",
  warning: "⚠️", hatihati: "⚠️", bahaya: "⚠️", awas: "⚠️",
  yes: "✅", bener: "✅", betul: "✅", setuju: "✅",
  no: "❌", salah: "❌", jangan: "❌",
  shock: "😱", kaget: "😱", kagetbanget: "😱",
};

function normalizeToken(text: string) {
  return (text || "").toLowerCase().replace(/[^a-z0-9%]/g, "");
}

function isEmphasis(word: string) {
  const t = normalizeToken(word);
  if (!t) return false;
  return POWER_WORDS.has(t) || /\d/.test(t);
}

/** Emoji utk kata (kalau ada di map), null kalau bukan kata kunci. */
export function wordEmoji(word: string): string | null {
  const t = normalizeToken(word);
  return WORD_EMOJI[t] ?? null;
}

/** Bagi kata jadi baris (maxWords per baris — mirror backend). */
function chunkWords<T>(words: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < words.length; i += Math.max(1, size)) {
    out.push(words.slice(i, i + Math.max(1, size)));
  }
  return out;
}

export function LiveCaptionOverlay({
  words,
  time,
  style,
  containerWidth = 360,
  className,
  showEmoji = false,
  splitRanges,
}: {
  words: LiveWord[];
  /** waktu video saat ini (detik, relatif klip) */
  time: number;
  style: LiveCaptionStyle;
  /** lebar container preview (px) — untuk skala font */
  containerWidth?: number;
  className?: string;
  /** tampilkan emoji di samping kata kunci (fitur "Tambahkan Emoji") */
  showEmoji?: boolean;
  /** Rentang AUTO SPLIT (detik, relatif klip). Di dalamnya layar terbagi dua
   *  panel, jadi caption pindah ke GARIS BATAS (50% tinggi, anchor tengah) —
   *  persis seperti \an5 di ASS yang dibakar ke unduhan. Tanpa ini preview
   *  menaruh caption di wajah orang panel bawah sementara unduhan tidak. */
  splitRanges?: { start: number; end: number }[];
}) {
  const scale = containerWidth / 360;

  // maxWords per baris — mirror max_words_per_line backend (parity persis)
  const maxWords = style.maxWords ?? (style.uppercase ? 4 : 5);
  const lines = useMemo(() => chunkWords(words, maxWords), [words, maxWords]);

  // cari baris aktif berdasarkan waktu
  const activeLine = useMemo(() => {
    const found = lines.find(
      (l) => time >= l[0].start && time <= l[l.length - 1].end,
    );
    return found ?? lines.find((l) => time < l[0].start) ?? null;
  }, [lines, time]);

  if (!activeLine || !words.length) return null;

  const fontSize = style.fontSize * scale;
  const strokeWidth = style.strokeWidth * scale;

  // PARITY seam: build_ass memutuskan per EVENT dengan titik tengah event.
  // Di sini padanan event adalah baris aktif, jadi patokannya titik tengah
  // baris — bukan `time` — supaya caption tidak melompat di tengah baris.
  const lineMid =
    ((activeLine[0]?.start ?? 0) + (activeLine[activeLine.length - 1]?.end ?? 0)) / 2;
  const diSeam = (splitRanges ?? []).some((r) => lineMid >= r.start && lineMid <= r.end);

  return (
    <div
      className={cn("pointer-events-none absolute inset-x-0 flex justify-center px-[6%]", className)}
      style={{
        // di rentang split: garis batas dua panel = 50% tinggi. Anchor sudah
        // tengah (translateY(-50%) di bawah), jadi 50% = persis \an5 di ASS.
        top: `${diSeam ? 50 : style.position}%`,
        opacity: style.opacity,
      }}
    >
      <div
        className="flex flex-wrap items-center justify-center gap-x-[0.3em] gap-y-[0.15em] text-center"
        style={{
          transform: "translateY(-50%)",
          fontFamily: `${style.fontFamily}, sans-serif`,
          fontSize: `${fontSize}px`,
          lineHeight: 1.15,
          fontWeight: 700,
          maxWidth: "100%",
        }}
      >
        {activeLine.map((w, i) => {
          const isActive = time >= w.start && time < w.end;
          const emphasized = isEmphasis(w.word);
          const text = style.uppercase ? w.word.toUpperCase() : w.word;
          const color = isActive
            ? style.highlightColor
            : emphasized && style.emphasisColor
              ? style.emphasisColor
              : style.fontColor;

          return (
            <span
              key={`${w.word}-${i}`}
              style={{
                color,
                WebkitTextStroke: strokeWidth > 0 && style.strokeColor
                  ? `${strokeWidth}px ${style.strokeColor}`
                  : undefined,
                paintOrder: "stroke fill",
                textShadow: style.shadow
                  ? `0 ${2 * scale}px ${4 * scale}px rgba(0,0,0,0.75)`
                  : undefined,
                backgroundColor: isActive && style.wordBox && style.wordBoxColor
                  ? style.wordBoxColor
                  : undefined,
                padding: isActive && style.wordBox ? `${0.06 * fontSize}px ${0.18 * fontSize}px` : undefined,
                borderRadius: isActive && style.wordBox ? `${0.15 * fontSize}px` : undefined,
                display: "inline-block",
                // PARITY animasi: backend memakai \fscy118 selama 90ms lalu
                // kembali 100 dalam 130ms (subtitles.py active_span). Di sini
                // padanannya scaleY — hanya sumbu Y, jadi lebar kata tidak
                // berubah dan baris tidak reflow (itu alasan \fscx dilarang).
                transform: isActive ? "scaleY(1.18)" : "scaleY(1)",
                transformOrigin: "center",
                transition: "color 80ms linear, transform 90ms ease-out",
              }}
            >
              {text}
            </span>
          );
        })}
      </div>
      {/* Emoji terpisah dari flow teks — subtitle TIDAK bergeser saat muncul */}
      {showEmoji && activeLine
        ? (() => {
            const em = activeLine.find((w) => {
              const e = wordEmoji(w.word);
              return e && time >= w.start && time < w.end;
            });
            if (!em) return null;
            const emoji = wordEmoji(em.word);
            return (
              <span
                className="pointer-events-none absolute"
                style={{
                  right: "4%",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: `${fontSize * 1.1}px`,
                }}
              >
                {emoji}
              </span>
            );
          })()
        : null}
    </div>
  );
}

/**
 * VIDEO PREVIEW + LIVE CAPTION: video (VPS-rendered, audio jalan) sebagai
 * dasar + subtitle HTML5 live overlay yang instan berubah mengikuti setting.
 * Saat setting berubah: overlay langsung update (tanpa render) — user lihat
 * perubahan gaya/ukuran/posisi/opacity SEKETIKA. Render VPS tetap jalan di
 * background untuk sinkron preview == hasil MP4.
 */
export function VideoWithLiveCaption({
  videoSrc,
  words,
  start,
  end,
  style,
  onTime,
  className,
}: {
  videoSrc: string | null;
  words: LiveWord[];
  start: number;
  end: number;
  style: LiveCaptionStyle;
  onTime?: (t: number) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [containerW, setContainerW] = useState(360);

  const usingPreview = videoSrc !== null;
  const duration = Math.max(0.1, end - start);

  // ukur lebar container utk skala font
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth || 360);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // loop timeupdate → state (untuk overlay sinkron)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    const onTime = () => {
      const rel = usingPreview ? video.currentTime : video.currentTime - start;
      setTime(Math.max(0, rel));
      onTime?.(Math.max(0, rel));
    };
    video.addEventListener("timeupdate", onTime);
    // requestAnimationFrame untuk update halus (karaoke presisi)
    let raf = 0;
    const tick = () => {
      if (!video.paused) onTime();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc, start, usingPreview]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function seek(rel: number) {
    const video = videoRef.current;
    const clamped = Math.max(0, Math.min(duration, rel));
    setTime(clamped);
    if (video) {
      if (usingPreview) video.currentTime = clamped;
      else video.currentTime = start + clamped;
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        ref={containerRef}
        className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-primary"
      >
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover"
            onClick={toggle}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
            Preview belum tersedia.
          </div>
        )}

        {/* LIVE subtitle overlay — instan ikut setting */}
        <LiveCaptionOverlay
          words={words}
          time={time}
          style={style}
          containerWidth={containerW}
        />

        <button
          type="button"
          onClick={toggle}
          disabled={!videoSrc}
          aria-label={playing ? "Jeda" : "Putar"}
          className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-full bg-background/85 disabled:opacity-40"
        >
          {playing ? "❚❚" : "▶"}
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
        <span>{clock(time)}</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={Math.min(time, duration)}
          disabled={!videoSrc}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-[var(--color-accent,#FFD400)]"
          aria-label="Garis waktu klip"
        />
        <span>{clock(duration)}</span>
      </div>
    </div>
  );
}

function clock(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
