/**
 * Browser-side audio extraction.
 * Decodes any media file the browser can decode (mp4/mov/webm/mp3/wav),
 * downmixes to 16 kHz mono and exposes it as WAV chunks that can be sent
 * to the speech-to-text model. Runs fully client-side — no server compute.
 *
 * Memory notes (penting untuk ponsel):
 * - Decode dilakukan lewat OfflineAudioContext 16 kHz supaya browser
 *   me-resample saat decode (hemat ~3x dibanding 48 kHz).
 * - Sampel disimpan sebagai Int16Array (2 byte/sample ≈ 115 MB per jam),
 *   dan base64 hanya dibuat per potongan saat dibutuhkan lalu dibuang.
 */

export interface AudioChunk {
  /** Chunk offset (seconds) relative to the full media timeline. */
  offset: number;
  /** Chunk duration in seconds. */
  duration: number;
  /** Base64-encoded 16 kHz mono WAV payload (no data: prefix). */
  base64: string;
}

export interface ExtractedAudio {
  duration: number;
  count: number;
  chunkSeconds: number;
  getChunk: (index: number) => AudioChunk;
}

const TARGET_RATE = 16000;
/** Batas aman payload per request (~45 detik ≈ 1,4 MB WAV ≈ 1,9 MB base64). */
export const DEFAULT_CHUNK_SECONDS = 45;

function createDecodeContext(): BaseAudioContext {
  const Offline =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (Offline) {
    try {
      return new Offline(1, TARGET_RATE, TARGET_RATE);
    } catch {
      /* beberapa browser menolak 16 kHz — jatuh ke AudioContext biasa */
    }
  }
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Browser ini tidak mendukung Web Audio API.");
  return new Ctx();
}

/** Downmix + resample langsung ke Int16 mono agar hemat memori. */
function toMono16k(buffer: AudioBuffer): Int16Array {
  const ratio = buffer.sampleRate / TARGET_RATE;
  const outLength = Math.max(1, Math.floor(buffer.length / ratio));
  const out = new Int16Array(outLength);
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));

  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    let sample = 0;
    for (const data of channels) {
      const a = data[idx] ?? 0;
      const b = data[idx + 1] ?? a;
      sample += a + (b - a) * frac;
    }
    sample /= channels.length || 1;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

function encodeWav(samples: Int16Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  new Int16Array(buffer, 44).set(samples);
  return buffer;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/**
 * Decode a media file once, then hand out WAV chunks lazily.
 * Chunk base64 dibuat saat diminta sehingga tidak semua potongan
 * menumpuk di memori pada video panjang.
 */
export async function extractAudio(
  file: Blob,
  chunkSeconds = DEFAULT_CHUNK_SECONDS,
  onProgress?: (ratio: number) => void,
): Promise<ExtractedAudio> {
  if (file.size > 1024 * 1024 * 1024) {
    throw new Error("File di atas 1 GB tidak bisa diproses di browser. Kompres dulu videonya.");
  }

  const ctx = createDecodeContext();
  onProgress?.(0.1);
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(0.4);

  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error(
      "Browser tidak bisa membaca audio dari file ini (format tidak didukung atau memori tidak cukup). Coba MP4/H.264 atau file lebih kecil.",
    );
  }
  onProgress?.(0.8);

  const mono = toMono16k(decoded);
  onProgress?.(1);
  if (ctx instanceof AudioContext) void ctx.close();

  const duration = mono.length / TARGET_RATE;
  if (duration < 1) throw new Error("Audio terlalu pendek atau tidak ada suara di file ini.");

  const samplesPerChunk = Math.max(1, Math.round(chunkSeconds * TARGET_RATE));
  const count = Math.max(1, Math.ceil(mono.length / samplesPerChunk));

  return {
    duration,
    count,
    chunkSeconds,
    getChunk: (index: number) => {
      const slice = mono.subarray(index * samplesPerChunk, (index + 1) * samplesPerChunk);
      return {
        offset: (index * samplesPerChunk) / TARGET_RATE,
        duration: slice.length / TARGET_RATE,
        base64: toBase64(encodeWav(slice, TARGET_RATE)),
      };
    },
  };
}

/** Kompatibilitas lama: kembalikan semua potongan sekaligus. */
export async function extractAudioChunks(
  file: Blob,
  chunkSeconds = DEFAULT_CHUNK_SECONDS,
  onProgress?: (ratio: number) => void,
): Promise<{ chunks: AudioChunk[]; duration: number }> {
  const audio = await extractAudio(file, chunkSeconds, onProgress);
  const chunks: AudioChunk[] = [];
  for (let i = 0; i < audio.count; i += 1) chunks.push(audio.getChunk(i));
  return { chunks, duration: audio.duration };
}
