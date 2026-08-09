export interface CaptionWord {
  word: string;
  start: number;
  end: number;
  emphasis?: boolean;
}

export interface DemoClip {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  score: number;
  range: string;
  duration: number;
  hook: string;
  captions: CaptionWord[];
  overlays: { at: number; label: string; icon: "clock" | "trend" | "alert" | "coins" | "spark" }[];
}

export const demoClips: DemoClip[] = [
  {
    id: "clip-01",
    title: "Uang Bukan Tujuan, Tapi Alat",
    description:
      "Potongan paling tajam dari episode ini: kenapa mengejar angka membuatmu berhenti bertumbuh.",
    hashtags: ["#mindset", "#finansial", "#podcastindo"],
    score: 94,
    range: "12:04 - 12:38",
    duration: 5.6,
    hook: "Hook kuat di 3 detik pertama",
    captions: [
      { word: "UANG", start: 0.1, end: 0.55, emphasis: true },
      { word: "ITU", start: 0.58, end: 0.86 },
      { word: "CUMA", start: 0.9, end: 1.28 },
      { word: "ALAT", start: 1.32, end: 1.85, emphasis: true },
      { word: "BUKAN", start: 1.95, end: 2.4 },
      { word: "TUJUAN", start: 2.45, end: 3.0, emphasis: true },
      { word: "KALAU", start: 3.15, end: 3.5 },
      { word: "KAMU", start: 3.54, end: 3.86 },
      { word: "BALIK", start: 3.9, end: 4.3 },
      { word: "URUTANNYA", start: 4.34, end: 4.95 },
      { word: "KAMU", start: 5.0, end: 5.25 },
      { word: "KALAH", start: 5.28, end: 5.6, emphasis: true },
    ],
    overlays: [
      { at: 1.3, label: "ALAT", icon: "coins" },
      { at: 3.2, label: "URUTAN", icon: "trend" },
    ],
  },
  {
    id: "clip-02",
    title: "3 Menit Pertama Menentukan Segalanya",
    description: "Kenapa retensi penonton hancur sebelum detik ke-10, dan cara memperbaikinya.",
    hashtags: ["#contentcreator", "#retensi", "#shorts"],
    score: 89,
    range: "27:41 - 28:16",
    duration: 5.2,
    hook: "Pertanyaan retoris + angka",
    captions: [
      { word: "TIGA", start: 0.1, end: 0.5, emphasis: true },
      { word: "DETIK", start: 0.55, end: 1.0 },
      { word: "PERTAMA", start: 1.05, end: 1.6, emphasis: true },
      { word: "NENTUIN", start: 1.7, end: 2.2 },
      { word: "SEMUANYA", start: 2.25, end: 2.9, emphasis: true },
      { word: "SISANYA", start: 3.05, end: 3.5 },
      { word: "CUMA", start: 3.55, end: 3.85 },
      { word: "BONUS", start: 3.9, end: 4.4, emphasis: true },
      { word: "BUAT", start: 4.5, end: 4.8 },
      { word: "ALGORITMA", start: 4.85, end: 5.2 },
    ],
    overlays: [
      { at: 0.2, label: "0:03", icon: "clock" },
      { at: 3.9, label: "BONUS", icon: "spark" },
    ],
  },
  {
    id: "clip-03",
    title: "Kesalahan Fatal Investor Pemula",
    description: "Satu kebiasaan kecil yang diam-diam menghabiskan portofolio kamu tiap bulan.",
    hashtags: ["#investasi", "#edukasi", "#reels"],
    score: 91,
    range: "44:12 - 44:49",
    duration: 5.4,
    hook: "Kontras masalah - solusi",
    captions: [
      { word: "KEBANYAKAN", start: 0.1, end: 0.75 },
      { word: "ORANG", start: 0.8, end: 1.15 },
      { word: "RUGI", start: 1.2, end: 1.7, emphasis: true },
      { word: "BUKAN", start: 1.8, end: 2.15 },
      { word: "KARENA", start: 2.2, end: 2.6 },
      { word: "PASAR", start: 2.65, end: 3.1, emphasis: true },
      { word: "TAPI", start: 3.2, end: 3.5 },
      { word: "KARENA", start: 3.55, end: 3.95 },
      { word: "PANIK", start: 4.0, end: 4.6, emphasis: true },
      { word: "SENDIRI", start: 4.7, end: 5.4 },
    ],
    overlays: [
      { at: 1.2, label: "-32%", icon: "alert" },
      { at: 4.0, label: "PANIC", icon: "trend" },
    ],
  },
];

export const captionPresets = [
  { id: "hormozi", label: "Hormozi", accent: "#FFD400", base: "#FFFFFF" },
  { id: "neon", label: "Neon Pop", accent: "#7CFF6B", base: "#FFFFFF" },
  { id: "cortex", label: "Cortex", accent: "#FF8A3D", base: "#FFFFFF" },
  { id: "ice", label: "Ice", accent: "#5EC8FF", base: "#FFFFFF" },
  { id: "mono", label: "Mono", accent: "#FFFFFF", base: "#BFBFBF" },
] as const;

export type CaptionPresetId = (typeof captionPresets)[number]["id"];
