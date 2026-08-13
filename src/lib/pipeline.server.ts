import type { DetectedClip, Transcript, TranscriptSegment, TranscriptWord } from "./pipeline-types";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const STT_MODEL = "google/gemini-3.6-flash";
const TEXT_MODEL = "openai/gpt-5.6-sol";

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY tidak tersedia.");
  return key;
}

async function callGateway(body: unknown, attempt = 0): Promise<string> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Lovable AI Gateway authenticates with this header, not `Authorization`.
      "Lovable-API-Key": apiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 402) throw new Error("Kredit AI habis. Tambahkan kredit di workspace kamu.");
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return callGateway(body, attempt + 1);
    }
    if (res.status === 429) throw new Error("Kuota AI sedang penuh. Coba lagi sebentar lagi.");
    if (res.status === 413) throw new Error("Potongan audio terlalu besar. Coba video lebih pendek.");
    console.error("[ai-gateway]", res.status, detail.slice(0, 500));
    if (res.status === 400) throw new Error(`Permintaan AI ditolak (400): ${detail.slice(0, 160)}`);
    throw new Error(`Permintaan AI gagal (${res.status}).`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("AI mengembalikan respons kosong.");
  return content;
}


function parseJsonBlock<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (start === -1 || end === -1) throw new Error("Respons AI tidak berformat JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/** Split segment text into evenly-timed words so karaoke captions have word timings. */
export function wordsFromSegment(segment: {
  start: number;
  end: number;
  text: string;
}): TranscriptWord[] {
  const tokens = segment.text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const span = Math.max(0.2, segment.end - segment.start);
  const per = span / tokens.length;
  return tokens.map((word, i) => ({
    word,
    start: +(segment.start + i * per).toFixed(2),
    end: +(segment.start + (i + 1) * per).toFixed(2),
  }));
}

export async function transcribeChunk(input: {
  audioBase64: string;
  offset: number;
  duration: number;
}): Promise<TranscriptSegment[]> {
  const content = await callGateway({
    model: STT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Kamu adalah mesin transkripsi presisi tinggi. Keluarkan HANYA JSON array, tanpa penjelasan.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Transkripsikan audio ini kata demi kata dalam bahasa aslinya. Pecah menjadi segmen pendek (maksimal 12 kata). Durasi audio ${input.duration.toFixed(1)} detik. Kembalikan JSON array objek: [{"start": detik_mulai, "end": detik_selesai, "text": "..."}]. Timestamp relatif terhadap awal audio ini (mulai dari 0).`,
          },
          {
            type: "input_audio",
            input_audio: { data: input.audioBase64, format: "wav" },
          },
        ],
      },
    ],
  });

  const raw = parseJsonBlock<{ start: number; end: number; text: string }[]>(content);
  return raw
    .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
    .map((s) => {
      const start = +(Number(s.start ?? 0) + input.offset).toFixed(2);
      const end = +(Math.max(Number(s.end ?? 0), Number(s.start ?? 0) + 0.4) + input.offset).toFixed(2);
      const seg = { start, end, text: s.text.trim() };
      return { ...seg, words: wordsFromSegment(seg) };
    });
}

export function transcriptToText(transcript: Transcript): string {
  return transcript.segments
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");
}

export async function detectClips(
  transcript: Transcript,
  targetCount: number,
): Promise<DetectedClip[]> {
  const content = await callGateway({
    model: TEXT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Kamu adalah editor konten viral kelas dunia (setara tim OpusClip). Kamu memilih potongan video pendek yang punya hook kuat, konteks utuh, dan penutup memuaskan. Jawab HANYA dengan JSON array valid, tanpa teks lain. Semua judul/deskripsi/hashtag dalam bahasa transkrip.",
      },
      {
        role: "user",
        content: `Dari transkrip bertimestamp berikut, pilih maksimal ${targetCount} klip terbaik untuk short-form vertikal (durasi 20-75 detik, tidak boleh saling tumpang tindih, urut dari skor tertinggi).

Untuk tiap klip kembalikan objek:
{"title": "judul clickbait tapi jujur, maks 60 karakter", "description": "1-2 kalimat caption siap unggah", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"], "start": detik_mulai, "end": detik_selesai, "score": 0-100 skor potensi viral, "hook": "tipe hook singkat, mis. 'Pertanyaan retoris + angka'"}

Balas maksimal 400 kata total. Transkrip:
${transcriptToText(transcript).slice(0, 60000)}`,
      },
    ],
  });

  const raw = parseJsonBlock<DetectedClip[]>(content);
  return raw
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
    .map((c) => ({
      title: String(c.title ?? "Klip tanpa judul").slice(0, 120),
      description: String(c.description ?? ""),
      hashtags: Array.isArray(c.hashtags) ? c.hashtags.slice(0, 8).map(String) : [],
      start: Math.max(0, +Number(c.start).toFixed(2)),
      end: +Number(c.end).toFixed(2),
      score: Math.max(0, Math.min(100, Math.round(Number(c.score ?? 70)))),
      hook: String(c.hook ?? "Hook kuat di 3 detik pertama"),
    }))
    .slice(0, targetCount);
}

export function wordsInRange(
  transcript: Transcript,
  start: number,
  end: number,
): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  for (const segment of transcript.segments) {
    for (const word of segment.words ?? []) {
      if (word.end <= start || word.start >= end) continue;
      out.push({
        word: word.word,
        start: +(Math.max(0, word.start - start)).toFixed(2),
        end: +(Math.max(0.2, word.end - start)).toFixed(2),
      });
    }
  }
  return out;
}
