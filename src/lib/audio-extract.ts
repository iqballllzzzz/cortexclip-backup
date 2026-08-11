/**
 * Browser-side audio extraction.
 * Decodes any media file the browser can decode (mp4/mov/webm/mp3/wav),
 * downmixes to 16 kHz mono and slices it into WAV chunks that can be sent
 * to the speech-to-text model. Runs fully client-side — no server compute.
 */

export interface AudioChunk {
  /** Chunk offset (seconds) relative to the full media timeline. */
  offset: number;
  /** Chunk duration in seconds. */
  duration: number;
  /** Base64-encoded 16 kHz mono WAV payload (no data: prefix). */
  base64: string;
}

const TARGET_RATE = 16000;

function toMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) out[i] = (out[i] ?? 0) + (data[i] ?? 0) / buffer.numberOfChannels;
  }
  return out;
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
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

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
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
 * Decode a media file and return WAV chunks ready for transcription.
 * @param chunkSeconds length of each chunk (default 90s keeps payloads ~3 MB)
 */
export async function extractAudioChunks(
  file: Blob,
  chunkSeconds = 90,
  onProgress?: (ratio: number) => void,
): Promise<{ chunks: AudioChunk[]; duration: number }> {
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("Browser ini tidak mendukung Web Audio API.");

  const ctx = new AudioCtx();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const mono = resample(toMono(decoded), decoded.sampleRate, TARGET_RATE);
    const duration = mono.length / TARGET_RATE;

    const chunks: AudioChunk[] = [];
    const samplesPerChunk = chunkSeconds * TARGET_RATE;
    const total = Math.max(1, Math.ceil(mono.length / samplesPerChunk));

    for (let i = 0; i < total; i += 1) {
      const slice = mono.subarray(i * samplesPerChunk, (i + 1) * samplesPerChunk);
      if (slice.length === 0) break;
      chunks.push({
        offset: (i * samplesPerChunk) / TARGET_RATE,
        duration: slice.length / TARGET_RATE,
        base64: toBase64(encodeWav(slice, TARGET_RATE)),
      });
      onProgress?.((i + 1) / total);
    }

    return { chunks, duration };
  } finally {
    void ctx.close();
  }
}
