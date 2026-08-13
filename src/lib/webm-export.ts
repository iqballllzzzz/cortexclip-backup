/**
 * Ekspor klip vertikal langsung di browser (gratis, tanpa server render).
 * Video sumber digambar ke canvas 9:16 (crop tengah) sambil caption karaoke
 * dibakar di atasnya, lalu direkam dengan MediaRecorder → WebM.
 */

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
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + size));
  return out;
}

export async function exportClipWebm(options: ExportOptions): Promise<Blob> {
  if (!isWebmExportSupported()) {
    throw new Error("Browser ini belum mendukung ekspor video otomatis. Gunakan ekspor FFmpeg.");
  }

  const width = options.width ?? 720;
  const height = options.height ?? 1280;
  const accent = options.accent ?? "#FFD400";
  const base = options.base ?? "#FFFFFF";
  const perLine = options.wordsPerLine ?? 3;
  const position = (options.position ?? 62) / 100;
  const duration = Math.max(0.5, options.end - options.start);
  const lines = chunk(options.words, perLine);

  const video = document.createElement("video");
  video.src = options.src;
  video.crossOrigin = "anonymous";
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Gagal memuat video sumber untuk ekspor."));
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
    video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
  );
  try {
    const media = audioSource.captureStream?.() ?? audioSource.mozCaptureStream?.();
    media?.getAudioTracks().forEach((track) => stream.addTrack(track));
  } catch {
    /* tanpa audio bila browser melarang */
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
  const parts: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) parts.push(event.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(parts, { type: mimeType ?? "video/webm" }));
  });

  const fontSize = Math.round(height * 0.045 * (options.fontScale ?? 1));

  function drawFrame() {
    const t = video.currentTime - options.start;
    // Crop tengah ke rasio target.
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
    if (video.videoWidth) ctx!.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);

    const line =
      lines.find((l) => t >= l[0]!.start && t <= l[l.length - 1]!.end) ??
      lines.find((l) => t < l[0]!.start);
    if (line) {
      ctx!.font = `800 ${fontSize}px Montserrat, Inter, system-ui, sans-serif`;
      ctx!.textBaseline = "middle";
      ctx!.lineJoin = "round";
      const gap = fontSize * 0.32;
      const widths = line.map((w) => ctx!.measureText(w.word).width);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (line.length - 1);
      let x = (width - total) / 2;
      const y = height * position;
      line.forEach((w, i) => {
        const active = t >= w.start && t <= w.end;
        ctx!.lineWidth = fontSize * 0.16;
        ctx!.strokeStyle = "rgba(0,0,0,0.85)";
        ctx!.strokeText(w.word, x, y);
        ctx!.fillStyle = active ? accent : base;
        ctx!.fillText(w.word, x, y);
        x += (widths[i] ?? 0) + gap;
      });
    }
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
