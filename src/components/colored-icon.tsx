/**
 * ColoredIcon — ikon SVG multi-warna untuk overlay ikon & b-roll (30+ desain).
 *
 * Warna utama KUNING (ciri khas CortexClip) + variasi per kategori.
 * Semua 64x64, outline gelap hangat + gradient/highlight = glossy 3D-ish.
 */

const Y = "#FFC53D";   // kuning utama CortexClip
const YD = "#E8A912";  // kuning gelap (shading)
const YL = "#FFE08A";  // kuning terang (highlight)
const OUT = "#3D2E00"; // outline gelap hangat
const R = "#F87171";   // merah lembut
const B = "#7DD3FC";   // biru langit
const G = "#86EFAC";   // hijau lembut
const P = "#F0ABFC";   // pink lembut

function Base({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.45))" }}>
      {children}
    </svg>
  );
}

/* ===== KUNING (utama) ===== */
function FlameIcon() {
  return (
    <Base>
      <path d="M32 4C36 14 46 18 46 34a14 14 0 0 1-28 0c0-8 4-12 6-18 2 5 5 7 8 7-1-7 0-13 0-19z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 24c2 5 7 7 7 14a7 7 0 0 1-14 0c0-4 2-6 3-9 1 2 2.5 3 4 3-0.5-3-0.5-5 0-8z" fill={YD} />
      <ellipse cx="27" cy="30" rx="3.5" ry="5" fill={YL} opacity="0.85" />
    </Base>
  );
}
function MoneyIcon() {
  return (
    <Base>
      <ellipse cx="32" cy="44" rx="20" ry="9" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="32" cy="38" rx="20" ry="9" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="32" cy="36" rx="14" ry="5.5" fill={YL} opacity="0.7" />
      <text x="32" y="42.5" textAnchor="middle" fontSize="12" fontWeight="900" fill={OUT}>$</text>
    </Base>
  );
}
function MoneyBagIcon() {
  return (
    <Base>
      <path d="M24 16h16l6 10c4 8 2 28-14 28S12 34 16 26l8-10z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="22" y="10" width="20" height="8" rx="3" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <text x="32" y="42" textAnchor="middle" fontSize="16" fontWeight="900" fill={OUT}>$</text>
    </Base>
  );
}
function TrophyIcon() {
  return (
    <Base>
      <path d="M18 10h28v14a14 14 0 0 1-28 0V10z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M18 14h-7a9 9 0 0 0 9 12M46 14h7a9 9 0 0 1-9 12" fill="none" stroke={OUT} strokeWidth="2.5" />
      <rect x="28" y="37" width="8" height="9" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <rect x="20" y="46" width="24" height="7" rx="2.5" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M22 14h20v8a10 10 0 0 1-20 0v-8z" fill={YL} opacity="0.55" />
    </Base>
  );
}
function RocketIcon() {
  return (
    <Base>
      <path d="M32 4c8 6 12 16 12 26l-12 10-12-10C20 20 24 10 32 4z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="32" cy="22" r="6" fill={B} stroke={OUT} strokeWidth="2.5" />
      <path d="M20 30l-8 10 10-2M44 30l8 10-10-2" fill={YD} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M28 44l4 14 4-14" fill="#FB923C" stroke={OUT} strokeWidth="2" />
    </Base>
  );
}
function BrainIcon() {
  return (
    <Base>
      <path d="M32 8c-9 0-14 6-14 12-4 2-6 6-6 10 0 5 3 8 6 9 0 6 5 11 14 11s14-5 14-11c3-1 6-4 6-9 0-4-2-8-6-10 0-6-5-12-14-12z" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M32 10v38M24 18c3 2 5 5 5 9M40 18c-3 2-5 5-5 9M23 34c3-1 6-1 9 1M41 34c-3-1-6-1-9 1" stroke={YD} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="25" cy="20" rx="4" ry="6" fill={YL} opacity="0.6" />
    </Base>
  );
}
function StarIcon() {
  return (
    <Base>
      <path d="M32 6l7.6 15.4L57 24l-12.5 12 3 17.5L32 45l-15.5 8.5 3-17.5L7 24l17.4-2.6L32 6z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 12l5 10 11 1.6-8 7.6" fill={YL} opacity="0.6" />
    </Base>
  );
}
function ZapIcon() {
  return (
    <Base>
      <path d="M36 4L14 36h14l-4 24 22-32H32l4-20z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M34 10L20 32h9l-3 16 16-24h-10l2-14z" fill={YL} opacity="0.55" />
    </Base>
  );
}
function CrownIcon() {
  return (
    <Base>
      <path d="M10 44L6 18l14 10 12-16 12 16 14-10-4 26H10z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="10" y="46" width="44" height="8" rx="2.5" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <circle cx="32" cy="10" r="4" fill={YL} stroke={OUT} strokeWidth="2" />
      <path d="M14 40l-3-16 10 7 11-14 11 14 10-7-3 16" fill={YL} opacity="0.5" />
    </Base>
  );
}
function MuscleIcon() {
  return (
    <Base>
      <path d="M12 40c0-8 6-12 14-12 4 0 7 1 10 3 3-4 9-5 13-2 5 4 5 12 0 17-6 7-18 8-26 6-7-2-11-6-11-12z" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M36 31c4-3 9-3 12 0 3 3 3 9-1 12" fill={YL} opacity="0.55" />
    </Base>
  );
}
function WarningIcon() {
  return (
    <Base>
      <path d="M32 6L60 54H4L32 6z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="29" y="24" width="6" height="16" rx="3" fill={OUT} />
      <circle cx="32" cy="47" r="3.5" fill={OUT} />
    </Base>
  );
}
function IdeaIcon() {
  return (
    <Base>
      <circle cx="32" cy="26" r="16" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M26 40h12M27 46h10M29 52h6" stroke={YD} strokeWidth="3" strokeLinecap="round" />
      <path d="M26 18c1.5-3 5-5 8-4" stroke={YL} strokeWidth="3" fill="none" strokeLinecap="round" />
    </Base>
  );
}
function BellIcon() {
  return (
    <Base>
      <path d="M32 6a4 4 0 0 1 4 4v2c7 2 11 8 11 16v8l4 6H13l4-6v-8c0-8 4-14 11-16v-2a4 4 0 0 1 4-4z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M26 46a6 6 0 0 0 12 0" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="27" cy="22" rx="4" ry="5" fill={YL} opacity="0.7" />
    </Base>
  );
}
function TargetIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="24" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="15" fill={YL} stroke={OUT} strokeWidth="2" />
      <circle cx="32" cy="32" r="7" fill={R} stroke={OUT} strokeWidth="2" />
      <circle cx="32" cy="32" r="2.5" fill={YL} />
    </Base>
  );
}
function GiftIcon() {
  return (
    <Base>
      <rect x="10" y="26" width="44" height="10" rx="2" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <rect x="14" y="36" width="36" height="20" rx="2" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <rect x="28" y="26" width="8" height="30" fill={R} stroke={OUT} strokeWidth="2" />
      <path d="M32 26c-8 0-12-4-12-9 0-4 3-6 6-6 4 0 6 6 6 15 0-9 2-15 6-15 3 0 6 2 6 6 0 5-4 9-12 9z" fill={R} stroke={OUT} strokeWidth="2.5" />
    </Base>
  );
}
function ChartUpIcon() {
  return (
    <Base>
      <rect x="8" y="38" width="10" height="18" rx="2" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <rect x="22" y="28" width="10" height="28" rx="2" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <rect x="36" y="18" width="10" height="38" rx="2" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <rect x="50" y="8" width="10" height="48" rx="2" fill={YL} stroke={OUT} strokeWidth="2.5" />
    </Base>
  );
}
function ClockIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="24" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="18" fill={YL} />
      <path d="M32 18v14l10 6" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </Base>
  );
}
function CheckIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="24" fill={G} stroke={OUT} strokeWidth="2.5" />
      <path d="M20 33l9 9 16-18" stroke={OUT} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}
function XIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="24" fill={R} stroke={OUT} strokeWidth="2.5" />
      <path d="M22 22l20 20M42 22L22 42" stroke={OUT} strokeWidth="5" strokeLinecap="round" />
    </Base>
  );
}
function QuestionIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="24" fill={B} stroke={OUT} strokeWidth="2.5" />
      <text x="32" y="43" textAnchor="middle" fontSize="30" fontWeight="900" fill={OUT}>?</text>
    </Base>
  );
}
/* ===== VARIASI WARNA ===== */
function HeartIcon() {
  return (
    <Base>
      <path d="M32 56S6 40 6 24C6 14 14 8 22 8c4 0 8 2 10 6 2-4 6-6 10-6 8 0 16 6 16 16 0 16-26 32-26 32z" fill={R} stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="22" cy="22" rx="6" ry="8" fill={YL} opacity="0.75" />
    </Base>
  );
}
function LaughIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="26" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M18 36c2 8 8 12 14 12s12-4 14-12H18z" fill={OUT} />
      <path d="M20 38h24c-2 6-7 9-12 9s-10-3-12-9z" fill={R} />
      <circle cx="23" cy="25" r="3.5" fill={OUT} />
      <circle cx="41" cy="25" r="3.5" fill={OUT} />
    </Base>
  );
}
function SadIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="26" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M20 46c3-6 7-8 12-8s9 2 12 8" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <circle cx="23" cy="26" r="3.5" fill={OUT} />
      <circle cx="41" cy="26" r="3.5" fill={OUT} />
      <ellipse cx="24" cy="50" rx="3" ry="5" fill={B} />
    </Base>
  );
}
function AngryIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="26" fill={R} stroke={OUT} strokeWidth="2.5" />
      <path d="M20 46c3-6 7-8 12-8s9 2 12 8" stroke={OUT} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M16 20l10 5M48 20l-10 5" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="24" cy="29" r="3.5" fill={OUT} />
      <circle cx="40" cy="29" r="3.5" fill={OUT} />
    </Base>
  );
}
function GymIcon() {
  return (
    <Base>
      <rect x="6" y="26" width="8" height="12" rx="2" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <rect x="14" y="20" width="8" height="24" rx="2" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <rect x="42" y="20" width="8" height="24" rx="2" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <rect x="50" y="26" width="8" height="12" rx="2" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <rect x="22" y="29" width="20" height="6" fill={YL} stroke={OUT} strokeWidth="2" />
    </Base>
  );
}
function FoodIcon() {
  return (
    <Base>
      <path d="M12 34h40c0 12-6 22-20 22S12 46 12 34z" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M10 34c0-6 10-10 22-10s22 4 22 10" fill={YL} stroke={OUT} strokeWidth="2.5" />
      <circle cx="24" cy="42" r="2.5" fill={YD} />
      <circle cx="34" cy="47" r="2.5" fill={YD} />
      <circle cx="41" cy="40" r="2.5" fill={YD} />
    </Base>
  );
}
function PlaneIcon() {
  return (
    <Base>
      <path d="M56 12L8 30l16 6 6 16 8-12 12 4 6-32z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 36l24-18" stroke={YD} strokeWidth="3" />
    </Base>
  );
}
function HomeIcon() {
  return (
    <Base>
      <path d="M8 32L32 10l24 22h-6v20H14V32H8z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="26" y="38" width="12" height="14" fill={YD} stroke={OUT} strokeWidth="2.5" />
    </Base>
  );
}
function GlobeIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="24" fill={B} stroke={OUT} strokeWidth="2.5" />
      <path d="M8 32h48M32 8c-8 7-8 41 0 48M32 8c8 7 8 41 0 48M14 18c10 6 26 6 36 0M14 46c10-6 26-6 36 0" stroke={OUT} strokeWidth="2.5" fill="none" />
    </Base>
  );
}
function GamepadIcon() {
  return (
    <Base>
      <path d="M20 20h24c8 0 14 8 14 18s-6 10-10 6l-6-6H22l-6 6c-4 4-10 4-10-6s6-18 14-18z" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M22 28v8M18 32h8" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="42" cy="29" r="3" fill={OUT} />
      <circle cx="47" cy="34" r="3" fill={OUT} />
    </Base>
  );
}
function MusicIcon() {
  return (
    <Base>
      <path d="M46 8v30a8 8 0 1 1-6-7.7V16L24 22v26a8 8 0 1 1-6-7.7V16l28-8z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="18" cy="48" rx="7" ry="6" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="40" cy="38" rx="7" ry="6" fill={YD} stroke={OUT} strokeWidth="2.5" />
    </Base>
  );
}
function CameraIcon() {
  return (
    <Base>
      <rect x="6" y="18" width="52" height="34" rx="6" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M24 18l4-6h8l4 6" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <circle cx="32" cy="35" r="11" fill={YL} stroke={OUT} strokeWidth="2.5" />
      <circle cx="32" cy="35" r="6" fill={B} stroke={OUT} strokeWidth="2" />
    </Base>
  );
}
function CityIcon() {
  return (
    <Base>
      <rect x="8" y="26" width="18" height="32" rx="2" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <rect x="26" y="14" width="18" height="44" rx="2" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <rect x="44" y="32" width="14" height="26" rx="2" fill={YL} stroke={OUT} strokeWidth="2.5" />
      <rect x="31" y="20" width="4" height="4" fill={OUT} />
      <rect x="38" y="20" width="4" height="4" fill={OUT} />
      <rect x="31" y="28" width="4" height="4" fill={OUT} />
      <rect x="38" y="28" width="4" height="4" fill={OUT} />
    </Base>
  );
}
function LeafIcon() {
  return (
    <Base>
      <path d="M52 8C28 8 12 22 12 42c0 6 2 10 4 12 2-14 10-26 24-32-12 10-20 22-22 34 16 4 34-4 34-26 0-8-2-16 0-22z" fill={G} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M20 52C26 40 34 32 44 26" stroke={OUT} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Base>
  );
}
function MicIcon() {
  return (
    <Base>
      <rect x="24" y="6" width="16" height="28" rx="8" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M16 30c0 9 7 16 16 16s16-7 16-16" fill="none" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
      <path d="M32 46v10M24 56h16" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />
    </Base>
  );
}
function FireworkIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="6" fill={Y} stroke={OUT} strokeWidth="2" />
      <path d="M32 6v14M32 44v14M6 32h14M44 32h14M13 13l10 10M41 41l10 10M51 13L41 23M23 41L13 51" stroke={P} strokeWidth="4" strokeLinecap="round" />
    </Base>
  );
}
function DiamondIcon() {
  return (
    <Base>
      <path d="M16 10h32l10 16-26 30L6 26l10-16z" fill={B} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M16 10l16 46L48 10M6 26h52" stroke={OUT} strokeWidth="2" fill="none" />
      <path d="M16 10l8 16 8-16" fill={YL} opacity="0.6" />
    </Base>
  );
}
function CoinFlipIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="22" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="15" fill={YL} stroke={YD} strokeWidth="2" strokeDasharray="4 3" />
      <text x="32" y="40" textAnchor="middle" fontSize="18" fontWeight="900" fill={OUT}>$</text>
    </Base>
  );
}
function TrendUpIcon() {
  return (
    <Base>
      <path d="M6 50L24 32l10 10 22-24" stroke={G} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M44 14h14v14" fill={G} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="24" cy="32" r="4" fill={YL} stroke={OUT} strokeWidth="2" />
    </Base>
  );
}

/** Map: icon lucide/AI + kategori → komponen (30+ desain, semua berwarna). */
const ICON_MAP: Record<string, () => React.ReactElement> = {
  // fire
  flame: FlameIcon, fire: FlameIcon,
  // money
  "dollar-sign": MoneyIcon, banknote: MoneyIcon, coins: MoneyIcon, money: MoneyBagIcon, wallet: MoneyBagIcon, "coin-flip": CoinFlipIcon,
  // success
  trophy: TrophyIcon, medal: TrophyIcon, flag: TrophyIcon, "party-popper": TrophyIcon, "trending-up": TrendUpIcon,
  rocket: RocketIcon, plane: PlaneIcon,
  // tech
  brain: BrainIcon, lightbulb: IdeaIcon, bulb: IdeaIcon,
  star: StarIcon, sparkles: StarIcon, gem: DiamondIcon, diamond: DiamondIcon,
  zap: ZapIcon, bolt: ZapIcon, "trending-up-icon": ZapIcon,
  crown: CrownIcon, king: CrownIcon, award: TrophyIcon,
  // city
  building: CityIcon, "building-2": CityIcon, city: CityIcon, home: HomeIcon, house: HomeIcon,
  // nature
  leaf: LeafIcon, trees: LeafIcon, mountain: LeafIcon, sun: LeafIcon,
  // fitness
  muscle: MuscleIcon, dumbbell: GymIcon, gym: GymIcon,
  // food
  "utensils": FoodIcon, "fork-and-knife": FoodIcon, pizza: FoodIcon, food: FoodIcon,
  // travel
  globe: GlobeIcon, map: GlobeIcon, compass: GlobeIcon, car: PlaneIcon,
  // people
  users: LaughIcon, laugh: LaughIcon, smile: LaughIcon,
  "frown": SadIcon, sad: SadIcon, "angry": AngryIcon,
  // misc/emotion/utility
  heart: HeartIcon, warning: WarningIcon, "triangle-alert": WarningIcon,
  bell: BellIcon, clock: ClockIcon, timer: ClockIcon,
  check: CheckIcon, "circle-check": CheckIcon, x: XIcon, "circle-x": XIcon,
  "help-circle": QuestionIcon, "message-circle-question": QuestionIcon,
  target: TargetIcon, crosshair: TargetIcon,
  gift: GiftIcon, present: GiftIcon,
  "chart-column-big": ChartUpIcon, "chart-no-axes-column": ChartUpIcon, "bar-chart-3": ChartUpIcon,
  "gamepad-2": GamepadIcon, gamepad: GamepadIcon,
  music: MusicIcon, headphones: MusicIcon, mic: MicIcon, microphone: MicIcon,
  camera: CameraIcon, video: CameraIcon, clapperboard: CameraIcon,
  "lightbulb-off": IdeaIcon,
  firework: FireworkIcon, "party": FireworkIcon, spark: FireworkIcon,
};

/** Kategori → ikon default (kalau AI gak ngasih icon). */
const CATEGORY_ICON: Record<string, () => React.ReactElement> = {
  money: MoneyIcon, fire: FlameIcon, success: TrophyIcon, tech: BrainIcon,
  city: CityIcon, nature: LeafIcon, fitness: GymIcon, food: FoodIcon,
  travel: PlaneIcon, people: LaughIcon,
};

export function getColoredIcon(category: string | undefined, icon: string | null | undefined): () => React.ReactElement {
  if (icon && ICON_MAP[icon]) return ICON_MAP[icon];
  if (category && CATEGORY_ICON[category]) return CATEGORY_ICON[category];
  if (category && ICON_MAP[category]) return ICON_MAP[category];
  return StarIcon;
}

export function ColoredIcon({ category, icon, size }: { category?: string; icon?: string | null; size?: number }) {
  const Cmp = getColoredIcon(category, icon);
  return (
    <div style={size ? { width: size, height: size } : undefined}>
      <Cmp />
    </div>
  );
}
