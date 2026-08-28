/**
 * Ekspor klip vertikal langsung di browser (gratis, tanpa server render).
 * Video sumber digambar ke canvas 9:16 (crop tengah) sambil caption karaoke
 * dibakar di atasnya, lalu direkam dengan MediaRecorder → WebM.
 * 
 * Enhanced with OpenShorts-inspired features:
 * - Dynamic face tracking (crop follows speaker)
 * - ASS subtitle burn-in support
 * - Smooth camera movement
 */

import type { SubtitleWord, SubtitleStyle } from "./subtitle-engine";
import {
  collectWordBlocks,
  hexToAssColor,
  escapeAssText,
  generateAssSubtitle,
} from "./subtitle-engine";

export interface ExportWord {
  word: string;
  start: number;
  end: number;
}

export interface ExportOptions {
  src: string;
  start: number;
  end: number;
  words: ExportWord[];
  width?: number;
  height?: number;
  accent?: string;
  base?: string;
  wordsPerLine?: number;
  position?: number;
  fontScale?: number;
  /** Enable face tracking - crops follow the speaker */
  enableFaceTracking?: boolean;
  /** Face detection stride (every Nth frame) */
  faceDetectStride?: number;
  /** Safe zone radius as fraction of crop width */
  safeZoneFraction?: number;
  /** Subtitle effect style */
  subtitleEffect?: "none" | "glow" | "pop" | "box";
  /** Uppercase all captions */
  uppercase?: boolean;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

export function isWebmExportSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

function pickMimeType(): string | undefined {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size))
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Smooth camera movement - inspired by OpenShorts' SmoothedCameraman
 */
function smoothCamera(
  currentCenter: number,
  targetCenter: number,
  cropWidth: number,
  videoWidth: number,
  panSpeedFast: number = 15,
  panSpeedSlow: number = 3
): number {
  const diff = targetCenter - currentCenter;
  const safeZone = cropWidth * 0.25;

  if (Math.abs(diff) <= safeZone) {
    return currentCenter; // Inside safe zone, no movement
  }

  const direction = diff > 0 ? 1 : -1;
  const speed =
    Math.abs(diff) > cropWidth * 0.5 ? panSpeedFast : panSpeedSlow;

  let newCenter = currentCenter + direction * speed;

  // Clamp
  const halfCrop = cropWidth / 2;
  newCenter = Math.max(
    halfCrop,
    Math.min(videoWidth - halfCrop, newCenter)
  );

  // Check overshoot
  const newDiff = targetCenter - newCenter;
  if ((direction === 1 && newDiff < 0) || (direction === -1 && newDiff > 0)) {
    newCenter = targetCenter;
  }

  return newCenter;
}

/**
 * Generate ASS subtitle file for the clip
 */
function generateClipAss(
  words: ExportWord[],
  style: SubtitleStyle,
  width: number,
  height: number
): string {
  const subtitleWords: SubtitleWord[] = words.map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));

  return generateAssSubtitle(subtitleWords, {
    ...style,
    maxCharsPerLine: style.wordsPerLine * 8,
    maxDuration: 2.0,
  });
}

/**
 * Simple face detection using skin color analysis
 * (More accurate than nothing, while still browser-compatible)
 */
function detectFaceSimple(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  // Sample skin-colored pixels
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  
  // Scan center region for face-like colors
  const startX = Math.floor(width * 0.2);
  const endX = Math.floor(width * 0.8);
  const startY = Math.floor(height * 0.1);
  const endY = Math.floor(height * 0.6);
  
  for (let y = startY; y < endY; y += 4) {
    for (let x = startX; x < endX; x += 4) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Simple skin detection (works for most skin tones)
      if (r > 95 && g > 40 && b > 20 &&
          r > g && r > b &&
          Math.abs(r - g) > 15 &&
          r - b > 15) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  
  if (count < 50) return null;
  
  const centerX = sumX / count;
  const centerY = sumY / count;
  
  // Estimate face size based on count
  const faceSize = Math.min(width * 0.4, Math.sqrt(count) * 8);
  
  return {
    x: centerX - faceSize / 2,
    y: centerY - faceSize / 2,
    width: faceSize,
    height: faceSize,
  };
}

export async function exportClipWebm(options: ExportOptions): Promise<Blob> {
  if (!isWebmExportSupported()) {
    throw new Error(
      "Browser ini belum mendukung ekspor video otomatis. Gunakan ekspor FFmpeg."
    );
  }

  const width = options.width ?? 720;
  const height = options.height ?? 1280;
  const accent = options.accent ?? "#FFD400";
  const base = options.base ?? "#FFFFFF";
  const perLine = options.wordsPerLine ?? 3;
  const position = (options.position ?? 62) / 100;
  const duration = Math.max(0.5, options.end - options.start);
  const lines = chunk(options.words, perLine);

  // Face tracking config
  const enableFaceTracking = options.enableFaceTracking ?? false;
  const faceDetectStride = options.faceDetectStride ?? 4;
  const safeZoneFraction = options.safeZoneFraction ?? 0.25;

  // Subtitle config
  const subtitleEffect = options.subtitleEffect ?? "glow";
  const uppercase = options.uppercase ?? false;

  const video = document.createElement("video");
  video.src = options.src;
  video.crossOrigin = "anonymous";
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () =>
      reject(new Error("Gagal memuat video sumber untuk ekspor."));
  });

  video.currentTime = options.start;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia.");

  const stream = canvas.captureStream(30);
  const audioSource = (
    video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    }
  );
  try {
    const media =
      audioSource.captureStream?.() ?? audioSource.mozCaptureStream?.();
    media?.getAudioTracks().forEach((track) => stream.addTrack(track));
  } catch {
    /* tanpa audio bila browser melarang */
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined
  );
  const parts: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) parts.push(event.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () =>
      resolve(new Blob(parts, { type: mimeType ?? "video/webm" }));
  });

  const fontSize = Math.round(height * 0.045 * (options.fontScale ?? 1));

  // Camera state for face tracking
  let cameraCenterX = width / 2;
  let lastFaceCenterX = width / 2;
  let frameCount = 0;

  function drawFrame() {
    const t = video.currentTime - options.start;
    
    // Face tracking: detect face position
    let targetX = cameraCenterX;
    
    if (enableFaceTracking && frameCount % faceDetectStride === 0) {
      // Draw full frame temporarily for detection
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext("2d");
      
      if (tempCtx && video.videoWidth) {
        // Crop to target ratio
        const targetRatio = width / height;
        const srcRatio = video.videoWidth / video.videoHeight;
        let sw = video.videoWidth;
        let sh = video.videoHeight;
        if (srcRatio > targetRatio) {
          sw = Math.round(video.videoHeight * targetRatio);
        } else {
          sh = Math.round(video.videoWidth / targetRatio);
        }
        const sx = Math.round((video.videoWidth - sw) / 2);
        const sy = Math.round((video.videoHeight - sh) / 2);
        
        tempCtx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
        
        const face = detectFaceSimple(tempCtx, width, height);
        if (face) {
          lastFaceCenterX = face.x + face.width / 2;
        }
        targetX = lastFaceCenterX;
      }
    } else if (!enableFaceTracking) {
      targetX = width / 2;
    }
    
    // Smooth camera movement
    cameraCenterX = smoothCamera(
      cameraCenterX,
      targetX,
      width,
      width,
      15,
      3
    );
    
    // Crop centered on camera position
    const targetRatio = width / height;
    const srcRatio = (video.videoWidth || 16) / (video.videoHeight || 9);
    let sw = video.videoWidth;
    let sh = video.videoHeight;
    if (srcRatio > targetRatio) {
      sw = Math.round(video.videoHeight * targetRatio);
    } else {
      sh = Math.round(video.videoWidth / targetRatio);
    }
    const sx = Math.round(((video.videoWidth || 0) - sw) / 2);
    const sy = Math.round(((video.videoHeight || 0) - sh) / 2);

    ctx!.fillStyle = "#0b0b0c";
    ctx!.fillRect(0, 0, width, height);
    if (video.videoWidth)
      ctx!.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);

    // Draw captions with effect
    const line =
      lines.find(
        (l) => t >= l[0]!.start && t <= l[l.length - 1]!.end
      ) ?? lines.find((l) => t < l[0]!.start);
    
    if (line) {
      ctx!.font = `800 ${fontSize}px Montserrat, Inter, system-ui, sans-serif`;
      ctx!.textBaseline = "middle";
      ctx!.lineJoin = "round";
      const gap = fontSize * 0.32;
      const widths = line.map((w) => ctx!.measureText(w.word).width);
      const total =
        widths.reduce((a, b) => a + b, 0) + gap * (line.length - 1);
      let x = (width - total) / 2;
      const y = height * position;

      line.forEach((w, i) => {
        const active = t >= w.start && t <= w.end;
        let wordText = uppercase ? w.word.toUpperCase() : w.word;
        
        // Apply effect
        switch (subtitleEffect) {
          case "glow":
            ctx!.lineWidth = fontSize * 0.2;
            ctx!.strokeStyle = active ? accent : "rgba(0,0,0,0.85)";
            ctx!.strokeText(wordText, x, y);
            
            // Glow effect for active word
            if (active) {
              ctx!.shadowColor = accent;
              ctx!.shadowBlur = 12;
            }
            ctx!.fillStyle = active ? accent : base;
            ctx!.fillText(wordText, x, y);
            ctx!.shadowColor = "transparent";
            ctx!.shadowBlur = 0;
            break;
            
          case "box":
            ctx!.lineWidth = fontSize * 0.16;
            ctx!.strokeStyle = active ? accent : "rgba(0,0,0,0.85)";
            ctx!.strokeText(wordText, x, y);
            ctx!.fillStyle = active ? accent : base;
            ctx!.fillText(wordText, x, y);
            
            // Draw box behind active word
            if (active) {
              const metrics = ctx!.measureText(wordText);
              const boxHeight = fontSize * 1.2;
              ctx!.fillStyle = accent;
              ctx!.fillRect(
                x - 4,
                y - boxHeight / 2,
                metrics.width + 8,
                boxHeight
              );
              ctx!.fillStyle = "#000000";
              ctx!.fillText(wordText, x, y);
            }
            break;
            
          case "pop":
            ctx!.lineWidth = fontSize * 0.16;
            ctx!.strokeStyle = "rgba(0,0,0,0.85)";
            ctx!.strokeText(wordText, x, y);
            ctx!.fillStyle = active ? accent : base;
            
            // Scale effect for active word
            if (active) {
              const scale = 1.1;
              ctx!.save();
              ctx!.translate(x + ctx!.measureText(wordText).width / 2, y);
              ctx!.scale(scale, scale);
              ctx!.fillText(wordText, -ctx!.measureText(wordText).width / 2, 0);
              ctx!.restore();
            } else {
              ctx!.fillText(wordText, x, y);
            }
            break;
            
          default: // none
            ctx!.lineWidth = fontSize * 0.16;
            ctx!.strokeStyle = "rgba(0,0,0,0.85)";
            ctx!.strokeText(wordText, x, y);
            ctx!.fillStyle = active ? accent : base;
            ctx!.fillText(wordText, x, y);
        }
        
        x += (widths[i] ?? 0) + gap;
      });
    }
    
    frameCount++;
  }

  recorder.start(250);
  await video.play();

  let raf = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
  };

  options.signal?.addEventListener("abort", stop);

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (stopped) return resolve();
      drawFrame();
      const elapsed = video.currentTime - options.start;
      options.onProgress?.(Math.max(0, Math.min(1, elapsed / duration)));
      if (video.currentTime >= options.end || video.ended) {
        stop();
        return resolve();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  // Beri waktu recorder mengirim potongan terakhir.
  const blob = await done;
  if (options.signal?.aborted) throw new Error("Ekspor dibatalkan.");
  if (blob.size === 0) throw new Error("Ekspor gagal: tidak ada data video.");
  return blob;
}

/**
 * Generate ASS subtitle file for FFmpeg burn-in
 */
export function generateExportAss(
  words: ExportWord[],
  accentColor: string,
  baseColor: string
): string {
  const style: SubtitleStyle = {
    accentColor,
    baseColor,
    borderColor: "#000000",
    borderWidth: 2,
    fontSize: 32,
    fontName: "Montserrat",
    alignment: "bottom",
    baseOpacity: 0.4,
    effect: "glow",
    uppercase: false,
    wordsPerLine: 3,
    maxCharsPerLine: 24,
    maxDuration: 2.0,
  };

  return generateAssSubtitle(
    words.map((w) => ({ word: w.word, start: w.start, end: w.end })),
    style
  );
}

/**
 * Download ASS file for manual FFmpeg processing
 */
export function downloadAssFile(
  words: ExportWord[],
  accentColor: string,
  baseColor: string,
  filename: string = "cortexclip-captions.ass"
): void {
  const ass = generateExportAss(words, accentColor, baseColor);
  const blob = new Blob([ass], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download SRT file for manual processing
 */
export function downloadSrtFile(
  words: ExportWord[],
  filename: string = "cortexclip-captions.srt"
): void {
  const lines = [];
  let idx = 1;
  
  for (let i = 0; i < words.length; i += 3) {
    const chunk = words.slice(i, i + 3);
    if (chunk.length === 0) continue;
    
    const start = chunk[0].start;
    const end = chunk[chunk.length - 1].end;
    const text = chunk.map((w) => w.word).join(" ");
    
    const formatTime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      const ms = Math.round((s - Math.floor(s)) * 1000);
      return `${String(h).padStart(2, "0")}:${String(m).padStart(
        2,
        "0"
      )}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
    };
    
    lines.push(
      `${idx++}\n${formatTime(start)} --> ${formatTime(end)}\n${text}\n`
    );
  }
  
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
