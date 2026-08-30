/**
 * ColoredIcon — ikon SVG multi-warna untuk overlay ikon & b-roll.
 *
 * Riset standar industri (Noto Emoji, Fantasy Icon, streamer icon packs):
 * icon pack bagus = SVG multi-color dengan gradient + highlight + shading,
 * bukan monochrome. Warna utama KUNING (ciri khas CortexClip), variasi per kategori.
 */

const Y = "#FFC53D"; // kuning utama CortexClip
const YD = "#E8A912"; // kuning gelap (shading)
const YL = "#FFE08A"; // kuning terang (highlight)
const OUT = "#3D2E00"; // outline gelap hangat

/** Bungkus SVG 64x64 dgn drop-shadow lembut (glossy look). */
function Base({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.45))" }}>
      {children}
    </svg>
  );
}

/** Flame — api kuning-oranye glossy (kategori fire/hype). */
function FlameIcon() {
  return (
    <Base>
      <path d="M32 4C36 14 46 18 46 34a14 14 0 0 1-28 0c0-8 4-12 6-18 2 5 5 7 8 7-1-7 0-13 0-19z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 24c2 5 7 7 7 14a7 7 0 0 1-14 0c0-4 2-6 3-9 1 2 2.5 3 4 3-0.5-3-0.5-5 0-8z" fill={YD} />
      <ellipse cx="27" cy="30" rx="3.5" ry="5" fill={YL} opacity="0.85" />
    </Base>
  );
}

/** Money — koin tumpuk kuning + simbol (money/cuan). */
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

/** Trophy — piala kuning (success/menang). */
function TrophyIcon() {
  return (
    <Base>
      <path d="M18 10h28v14a14 14 0 0 1-28 0V10z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M18 14h-7a9 9 0 0 0 9 12" fill="none" stroke={OUT} strokeWidth="2.5" />
      <path d="M46 14h7a9 9 0 0 1-9 12" fill="none" stroke={OUT} strokeWidth="2.5" />
      <rect x="28" y="37" width="8" height="9" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <rect x="20" y="46" width="24" height="7" rx="2.5" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M22 14h20v8a10 10 0 0 1-20 0v-8z" fill={YL} opacity="0.55" />
    </Base>
  );
}

/** Rocket — roket kuning (naik/viral). */
function RocketIcon() {
  return (
    <Base>
      <path d="M32 4c8 6 12 16 12 26l-12 10-12-10C20 20 24 10 32 4z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="32" cy="22" r="6" fill="#7DD3FC" stroke={OUT} strokeWidth="2.5" />
      <path d="M20 30l-8 10 10-2M44 30l8 10-10-2" fill={YD} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M28 44l4 14 4-14" fill="#FB923C" stroke={OUT} strokeWidth="2" />
    </Base>
  );
}

/** Brain — otak kuning (pintar/ide). */
function BrainIcon() {
  return (
    <Base>
      <path d="M32 8c-9 0-14 6-14 12-4 2-6 6-6 10 0 5 3 8 6 9 0 6 5 11 14 11s14-5 14-11c3-1 6-4 6-9 0-4-2-8-6-10 0-6-5-12-14-12z" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M32 10v38M24 18c3 2 5 5 5 9M40 18c-3 2-5 5-5 9M23 34c3-1 6-1 9 1M41 34c-3-1-6-1-9 1" stroke={YD} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="25" cy="20" rx="4" ry="6" fill={YL} opacity="0.6" />
    </Base>
  );
}

/** Star — bintang kuning (best/terbaik). */
function StarIcon() {
  return (
    <Base>
      <path d="M32 6l7.6 15.4L57 24l-12.5 12 3 17.5L32 45l-15.5 8.5 3-17.5L7 24l17.4-2.6L32 6z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M32 12l5 10 11 1.6-8 7.6" fill={YL} opacity="0.6" />
    </Base>
  );
}

/** Zap — petir kuning (cepat). */
function ZapIcon() {
  return (
    <Base>
      <path d="M36 4L14 36h14l-4 24 22-32H32l4-20z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M34 10L20 32h9l-3 16 16-24h-10l2-14z" fill={YL} opacity="0.55" />
    </Base>
  );
}

/** Crown — mahkota kuning (king/raja/boss). */
function CrownIcon() {
  return (
    <Base>
      <path d="M10 44L6 18l14 10 12-16 12 16 14-10-4 26H10z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="10" y="46" width="44" height="8" rx="2.5" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <path d="M14 40l-3-16 10 7 11-14 11 14 10-7-3 16" fill={YL} opacity="0.5" />
    </Base>
  );
}

/** Muscle — lengan kuat (strong/fitness). */
function MuscleIcon() {
  return (
    <Base>
      <path d="M12 40c0-8 6-12 14-12 4 0 7 1 10 3 3-4 9-5 13-2 5 4 5 12 0 17-6 7-18 8-26 6-7-2-11-6-11-12z" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M36 31c4-3 9-3 12 0 3 3 3 9-1 12" fill={YL} opacity="0.55" />
    </Base>
  );
}

/** Warning — segitiga kuning (hati-hati). */
function WarningIcon() {
  return (
    <Base>
      <path d="M32 6L60 54H4L32 6z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="29" y="24" width="6" height="16" rx="3" fill={OUT} />
      <circle cx="32" cy="47" r="3.5" fill={OUT} />
    </Base>
  );
}

/** Heart — hati merah-kuning (love). */
function HeartIcon() {
  return (
    <Base>
      <path d="M32 56S6 40 6 24C6 14 14 8 22 8c4 0 8 2 10 6 2-4 6-6 10-6 8 0 16 6 16 16 0 16-26 32-26 32z" fill="#F87171" stroke={OUT} strokeWidth="2.5" />
      <ellipse cx="22" cy="22" rx="6" ry="8" fill={YL} opacity="0.75" />
    </Base>
  );
}

/** Laugh — ketawa kuning (lucu). */
function LaughIcon() {
  return (
    <Base>
      <circle cx="32" cy="32" r="26" fill={Y} stroke={OUT} strokeWidth="2.5" />
      <path d="M18 36c2 8 8 12 14 12s12-4 14-12H18z" fill={OUT} />
      <path d="M20 38h24c-2 6-7 9-12 9s-10-3-12-9z" fill="#F87171" />
      <circle cx="23" cy="25" r="3.5" fill={OUT} />
      <circle cx="41" cy="25" r="3.5" fill={OUT} />
    </Base>
  );
}

/** MoneyBag — karung uang (rugi/untung/modal). */
function MoneyBagIcon() {
  return (
    <Base>
      <path d="M24 16h16l6 10c4 8 2 28-14 28S12 34 16 26l8-10z" fill={Y} stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="22" y="10" width="20" height="8" rx="3" fill={YD} stroke={OUT} strokeWidth="2.5" />
      <text x="32" y="42" textAnchor="middle" fontSize="16" fontWeight="900" fill={OUT}>$</text>
    </Base>
  );
}

/** Map ikon: icon lucide/AI → komponen SVG berwarna */
const ICON_MAP: Record<string, () => React.ReactElement> = {
  flame: FlameIcon, fire: FlameIcon,
  "dollar-sign": MoneyIcon, banknote: MoneyIcon, coins: MoneyIcon, money: MoneyBagIcon,
  "trending-up": ZapIcon, zap: ZapIcon, "chart-column-big": ZapIcon, "chart-no-axes-column": ZapIcon,
  trophy: TrophyIcon, medal: TrophyIcon, flag: TrophyIcon, "party-popper": TrophyIcon,
  rocket: RocketIcon, "plane": RocketIcon,
  brain: BrainIcon, lightbulb: BrainIcon,
  star: StarIcon, sparkles: StarIcon, gem: StarIcon,
  crown: CrownIcon, king: CrownIcon,
  muscle: MuscleIcon, dumbbell: MuscleIcon,
  warning: WarningIcon, "triangle-alert": WarningIcon,
  heart: HeartIcon,
  laugh: LaughIcon, smile: LaughIcon,
};

/** Ambil komponen ikon berwarna utk (category, icon); fallback Star kuning. */
export function getColoredIcon(category: string | undefined, icon: string | null | undefined): () => React.ReactElement {
  if (icon && ICON_MAP[icon]) return ICON_MAP[icon];
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
