export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

export interface Transcript {
  language: string;
  duration: number;
  segments: TranscriptSegment[];
}

export interface DetectedClip {
  title: string;
  description: string;
  hashtags: string[];
  start: number;
  end: number;
  score: number;
  hook: string;
}

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  uploading: "Mengunggah",
  transcribing: "Transkripsi",
  analyzing: "Analisis AI",
  completed: "Selesai",
  failed: "Gagal",
};
