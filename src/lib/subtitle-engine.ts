/**
 * CortexClip Subtitle Engine
 * Ported from OpenShorts subtitles.py - Karaoke-style ASS generation
 * with glow, pop, and box effects for TikTok/Reels/Shorts.
 */

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleStyle {
  accentColor: string;
  baseColor: string;
  borderColor: string;
  borderWidth: number;
  fontSize: number;
  fontName: string;
  alignment: 'top' | 'middle' | 'bottom';
  baseOpacity: number;
  effect: 'none' | 'glow' | 'pop' | 'box';
  uppercase: boolean;
  wordsPerLine: number;
  maxCharsPerLine: number;
  maxDuration: number;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  accentColor: '#FFD400',
  baseColor: '#FFFFFF',
  borderColor: '#000000',
  borderWidth: 2,
  fontSize: 32,
  fontName: 'Montserrat',
  alignment: 'bottom',
  baseOpacity: 0.4,
  effect: 'glow',
  uppercase: false,
  wordsPerLine: 3,
  maxCharsPerLine: 20,
  maxDuration: 2.0,
};

export function collectWordBlocks(
  words: SubtitleWord[],
  maxChars: number = 20,
  maxDuration: number = 2.0
): SubtitleWord[][] {
  const blocks: SubtitleWord[][] = [];
  let currentBlock: SubtitleWord[] = [];
  let charCount = 0;

  for (const word of words) {
    if (currentBlock.length === 0) {
      currentBlock.push(word);
      charCount = word.word.length;
    } else {
      const duration = word.end - currentBlock[0].start;
      const newCharCount = charCount + word.word.length + 1;

      if (newCharCount > maxChars || duration > maxDuration) {
        blocks.push(currentBlock);
        currentBlock = [word];
        charCount = word.word.length;
      } else {
        currentBlock.push(word);
        charCount = newCharCount;
      }
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);
  return blocks;
}

function hexToAssColor(hex: string, opacity: number = 1.0): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const alpha = Math.round((1 - opacity) * 255);
  return `&H${alpha.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${r.toString(16).padStart(2, '0')}`.toUpperCase();
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function formatAssTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export function generateAssSubtitle(words: SubtitleWord[], style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE): string {
  const blocks = collectWordBlocks(words, style.maxCharsPerLine, style.maxDuration);
  if (blocks.length === 0) return '';

  const alignmentMap = { top: 8, middle: 5, bottom: 2 };
  const primaryColour = hexToAssColor(style.baseColor, style.baseOpacity);
  const highlightInline = hexToAssColor(style.accentColor);

  let activePrefix: string;
  switch (style.effect) {
    case 'glow': activePrefix = `{\\c&HFFFFFF&\\3c${highlightInline}\\bord${style.borderWidth + 2}\\blur4}`; break;
    case 'box': activePrefix = `{\\c&HFFFFFF&\\3c${highlightInline}\\bord${style.borderWidth + 3}\\blur0}`; break;
    case 'pop': activePrefix = `{\\c${highlightInline}\\fscx90\\fscy90\\t(0,110,\\fscx108\\fscy108)}`; break;
    default: activePrefix = `{\\c${highlightInline}}`;
  }

  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${style.fontName},${style.fontSize},${primaryColour},${primaryColour},${hexToAssColor(style.borderColor)},&H00000000,-1,0,0,0,100,100,0,0,1,${style.borderWidth},0,${alignmentMap[style.alignment]},80,80,60,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events: string[] = [];
  for (const block of blocks) {
    for (let i = 0; i < block.length; i++) {
      const word = block[i];
      const evStart = i === 0 ? block[0].start : word.start;
      const evEnd = i === block.length - 1 ? block[block.length - 1].end : block[i + 1].start;
      if (evEnd <= evStart) continue;
      const parts = block.map((other, j) => {
        let text = escapeAssText(other.word);
        if (style.uppercase) text = text.toUpperCase();
        return j === i ? `${activePrefix}${text}{\\r}` : text;
      });
      events.push(`Dialogue: 0,${formatAssTime(evStart)},${formatAssTime(evEnd)},Default,,0,0,0,,${parts.join(' ')}`);
    }
  }
  return `${header}\n${events.join('\n')}\n`;
}

export function generateSrtSubtitle(words: SubtitleWord[], wordsPerLine: number = 3): string {
  const blocks = collectWordBlocks(words, wordsPerLine * 8, 2.0);
  return blocks.map((block, index) => {
    const first = block[0], last = block[block.length - 1];
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    return `${index + 1}\n${fmt(first.start)} --> ${fmt(last.end)}\n${block.map(w => w.word).join(' ')}\n`;
  }).join('\n');
}

export function downloadFile(filename: string, content: string, type: string = 'text/plain'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
