import type { CaptionWord } from "@/data/demo-clips";

export interface SrtWord {
  word: string;
  start: number;
  end: number;
}

function pad(n: number, size = 2) {
  return String(Math.floor(n)).padStart(size, "0");
}

export function formatTimestamp(seconds: number, ms = ",") {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const milli = Math.round((s - Math.floor(s)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(sec)}${ms}${String(milli).padStart(3, "0")}`;
}

export function chunkWords<T>(words: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < words.length; i += Math.max(1, size)) out.push(words.slice(i, i + size));
  return out;
}

/** Word-grouped SRT (default 3 words per cue → karaoke-friendly). */
export function buildSrt(words: SrtWord[], wordsPerLine = 3): string {
  const lines = chunkWords(words, wordsPerLine);
  return lines
    .map((line, index) => {
      const first = line[0]!;
      const last = line[line.length - 1]!;
      return `${index + 1}\n${formatTimestamp(first.start)} --> ${formatTimestamp(last.end)}\n${line
        .map((w) => w.word)
        .join(" ")}\n`;
    })
    .join("\n");
}

function toAssColor(hex: string) {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

export interface AssOptions {
  accent: string;
  base: string;
  fontSize: number;
  wordsPerLine: number;
  position: number;
  stroke: boolean;
}

/**
 * ASS subtitles with karaoke highlighting (\k tags + per-word colour swap),
 * ready to be burned in with `ffmpeg -vf ass=captions.ass`.
 */
export function buildAss(words: SrtWord[], options: AssOptions): string {
  const marginV = Math.round(((100 - options.position) / 100) * 1920 * 0.5);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cortex,Montserrat,${Math.round(options.fontSize * 2.6)},${toAssColor(
    options.base,
  )},${toAssColor(options.accent)},&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${
    options.stroke ? 6 : 0
  },3,2,80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines = chunkWords(words, options.wordsPerLine);
  const events = lines.map((line) => {
    const start = line[0]!.start;
    const end = line[line.length - 1]!.end;
    const text = line
      .map((w) => {
        const k = Math.max(1, Math.round((w.end - w.start) * 100));
        return `{\\k${k}}${w.word}`;
      })
      .join(" ");
    return `Dialogue: 0,${formatTimestamp(start, ".")},${formatTimestamp(
      end,
      ".",
    )},Cortex,,0,0,0,,{\\fad(80,80)}${text}`;
  });

  return `${header}\n${events.join("\n")}\n`;
}

export interface FfmpegOptions {
  input: string;
  output: string;
  start: number;
  end: number;
  subtitleFile: string;
  resolution: "1080x1920" | "720x1280" | "1080x1080";
  faceTracking: boolean;
}

/** Human-runnable FFmpeg recipe — free local rendering, no paid render API. */
export function buildFfmpegCommand(options: FfmpegOptions): string {
  const [w, h] = options.resolution.split("x").map(Number) as [number, number];
  const duration = +(options.end - options.start).toFixed(2);
  const crop = options.faceTracking
    ? `crop=ih*${w}/${h}:ih:(iw-ih*${w}/${h})/2:0`
    : `crop=ih*${w}/${h}:ih`;

  return [
    `ffmpeg -ss ${options.start.toFixed(2)} -t ${duration} -i "${options.input}" \\`,
    `  -vf "${crop},scale=${w}:${h},ass=${options.subtitleFile}" \\`,
    `  -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 128k -movflags +faststart \\`,
    `  "${options.output}"`,
  ].join("\n");
}

export function toCaptionWords(words: SrtWord[]): CaptionWord[] {
  return words.map((w, i) => ({
    word: w.word,
    start: w.start,
    end: w.end,
    emphasis: w.word.length > 6 || i % 5 === 0,
  }));
}

export function download(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
