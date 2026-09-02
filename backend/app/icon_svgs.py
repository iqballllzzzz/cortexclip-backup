"""SVG ikon overlay — DIGENERATE dari src/components/colored-icon.tsx.

JANGAN diedit tangan: jalankan scripts/gen_icon_svgs.py setelah mengubah
colored-icon.tsx supaya artwork RESULT tetap identik dengan PREVIEW.
"""

ICON_SVG: dict[str, str] = {
    "AngryIcon": """<circle cx="32" cy="32" r="26" fill="#F87171" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M20 46c3-6 7-8 12-8s9 2 12 8" stroke="#3D2E00" stroke-width="3.5" fill="none" stroke-linecap="round" />
  <path d="M16 20l10 5M48 20l-10 5" stroke="#3D2E00" stroke-width="3.5" stroke-linecap="round" />
  <circle cx="24" cy="29" r="3.5" fill="#3D2E00" />
  <circle cx="40" cy="29" r="3.5" fill="#3D2E00" />""",
    "BellIcon": """<path d="M32 6a4 4 0 0 1 4 4v2c7 2 11 8 11 16v8l4 6H13l4-6v-8c0-8 4-14 11-16v-2a4 4 0 0 1 4-4z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M26 46a6 6 0 0 0 12 0" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <ellipse cx="27" cy="22" rx="4" ry="5" fill="#FFE08A" opacity="0.7" />""",
    "BrainIcon": """<path d="M32 8c-9 0-14 6-14 12-4 2-6 6-6 10 0 5 3 8 6 9 0 6 5 11 14 11s14-5 14-11c3-1 6-4 6-9 0-4-2-8-6-10 0-6-5-12-14-12z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M32 10v38M24 18c3 2 5 5 5 9M40 18c-3 2-5 5-5 9M23 34c3-1 6-1 9 1M41 34c-3-1-6-1-9 1" stroke="#E8A912" stroke-width="2.5" fill="none" stroke-linecap="round" />
  <ellipse cx="25" cy="20" rx="4" ry="6" fill="#FFE08A" opacity="0.6" />""",
    "CameraIcon": """<rect x="6" y="18" width="52" height="34" rx="6" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M24 18l4-6h8l4 6" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <circle cx="32" cy="35" r="11" fill="#FFE08A" stroke="#3D2E00" stroke-width="2.5" />
  <circle cx="32" cy="35" r="6" fill="#7DD3FC" stroke="#3D2E00" stroke-width="2" />""",
    "ChartUpIcon": """<rect x="8" y="38" width="10" height="18" rx="2" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="22" y="28" width="10" height="28" rx="2" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="36" y="18" width="10" height="38" rx="2" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="50" y="8" width="10" height="48" rx="2" fill="#FFE08A" stroke="#3D2E00" stroke-width="2.5" />""",
    "CheckIcon": """<circle cx="32" cy="32" r="24" fill="#86EFAC" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M20 33l9 9 16-18" stroke="#3D2E00" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" />""",
    "CityIcon": """<rect x="8" y="26" width="18" height="32" rx="2" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="26" y="14" width="18" height="44" rx="2" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="44" y="32" width="14" height="26" rx="2" fill="#FFE08A" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="31" y="20" width="4" height="4" fill="#3D2E00" />
  <rect x="38" y="20" width="4" height="4" fill="#3D2E00" />
  <rect x="31" y="28" width="4" height="4" fill="#3D2E00" />
  <rect x="38" y="28" width="4" height="4" fill="#3D2E00" />""",
    "ClockIcon": """<circle cx="32" cy="32" r="24" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <circle cx="32" cy="32" r="18" fill="#FFE08A" />
  <path d="M32 18v14l10 6" stroke="#3D2E00" stroke-width="3.5" fill="none" stroke-linecap="round" />""",
    "CoinFlipIcon": """<circle cx="32" cy="32" r="22" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <circle cx="32" cy="32" r="15" fill="#FFE08A" stroke="#E8A912" stroke-width="2" stroke-dasharray="4 3" />
  <text x="32" y="40" text-anchor="middle" font-size="18" font-weight="900" fill="#3D2E00">$</text>""",
    "CrownIcon": """<path d="M10 44L6 18l14 10 12-16 12 16 14-10-4 26H10z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <rect x="10" y="46" width="44" height="8" rx="2.5" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <circle cx="32" cy="10" r="4" fill="#FFE08A" stroke="#3D2E00" stroke-width="2" />
  <path d="M14 40l-3-16 10 7 11-14 11 14 10-7-3 16" fill="#FFE08A" opacity="0.5" />""",
    "DiamondIcon": """<path d="M16 10h32l10 16-26 30L6 26l10-16z" fill="#7DD3FC" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M16 10l16 46L48 10M6 26h52" stroke="#3D2E00" stroke-width="2" fill="none" />
  <path d="M16 10l8 16 8-16" fill="#FFE08A" opacity="0.6" />""",
    "FireworkIcon": """<circle cx="32" cy="32" r="6" fill="#FFC53D" stroke="#3D2E00" stroke-width="2" />
  <path d="M32 6v14M32 44v14M6 32h14M44 32h14M13 13l10 10M41 41l10 10M51 13L41 23M23 41L13 51" stroke="#F0ABFC" stroke-width="4" stroke-linecap="round" />""",
    "FlameIcon": """<path d="M32 4C36 14 46 18 46 34a14 14 0 0 1-28 0c0-8 4-12 6-18 2 5 5 7 8 7-1-7 0-13 0-19z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M32 24c2 5 7 7 7 14a7 7 0 0 1-14 0c0-4 2-6 3-9 1 2 2.5 3 4 3-0.5-3-0.5-5 0-8z" fill="#E8A912" />
  <ellipse cx="27" cy="30" rx="3.5" ry="5" fill="#FFE08A" opacity="0.85" />""",
    "FoodIcon": """<path d="M12 34h40c0 12-6 22-20 22S12 46 12 34z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M10 34c0-6 10-10 22-10s22 4 22 10" fill="#FFE08A" stroke="#3D2E00" stroke-width="2.5" />
  <circle cx="24" cy="42" r="2.5" fill="#E8A912" />
  <circle cx="34" cy="47" r="2.5" fill="#E8A912" />
  <circle cx="41" cy="40" r="2.5" fill="#E8A912" />""",
    "GamepadIcon": """<path d="M20 20h24c8 0 14 8 14 18s-6 10-10 6l-6-6H22l-6 6c-4 4-10 4-10-6s6-18 14-18z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M22 28v8M18 32h8" stroke="#3D2E00" stroke-width="3.5" stroke-linecap="round" />
  <circle cx="42" cy="29" r="3" fill="#3D2E00" />
  <circle cx="47" cy="34" r="3" fill="#3D2E00" />""",
    "GiftIcon": """<rect x="10" y="26" width="44" height="10" rx="2" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="14" y="36" width="36" height="20" rx="2" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="28" y="26" width="8" height="30" fill="#F87171" stroke="#3D2E00" stroke-width="2" />
  <path d="M32 26c-8 0-12-4-12-9 0-4 3-6 6-6 4 0 6 6 6 15 0-9 2-15 6-15 3 0 6 2 6 6 0 5-4 9-12 9z" fill="#F87171" stroke="#3D2E00" stroke-width="2.5" />""",
    "GlobeIcon": """<circle cx="32" cy="32" r="24" fill="#7DD3FC" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M8 32h48M32 8c-8 7-8 41 0 48M32 8c8 7 8 41 0 48M14 18c10 6 26 6 36 0M14 46c10-6 26-6 36 0" stroke="#3D2E00" stroke-width="2.5" fill="none" />""",
    "GymIcon": """<rect x="6" y="26" width="8" height="12" rx="2" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="14" y="20" width="8" height="24" rx="2" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="42" y="20" width="8" height="24" rx="2" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="50" y="26" width="8" height="12" rx="2" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="22" y="29" width="20" height="6" fill="#FFE08A" stroke="#3D2E00" stroke-width="2" />""",
    "HeartIcon": """<path d="M32 56S6 40 6 24C6 14 14 8 22 8c4 0 8 2 10 6 2-4 6-6 10-6 8 0 16 6 16 16 0 16-26 32-26 32z" fill="#F87171" stroke="#3D2E00" stroke-width="2.5" />
  <ellipse cx="22" cy="22" rx="6" ry="8" fill="#FFE08A" opacity="0.75" />""",
    "HomeIcon": """<path d="M8 32L32 10l24 22h-6v20H14V32H8z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <rect x="26" y="38" width="12" height="14" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />""",
    "IdeaIcon": """<circle cx="32" cy="26" r="16" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M26 40h12M27 46h10M29 52h6" stroke="#E8A912" stroke-width="3" stroke-linecap="round" />
  <path d="M26 18c1.5-3 5-5 8-4" stroke="#FFE08A" stroke-width="3" fill="none" stroke-linecap="round" />""",
    "LaughIcon": """<circle cx="32" cy="32" r="26" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M18 36c2 8 8 12 14 12s12-4 14-12H18z" fill="#3D2E00" />
  <path d="M20 38h24c-2 6-7 9-12 9s-10-3-12-9z" fill="#F87171" />
  <circle cx="23" cy="25" r="3.5" fill="#3D2E00" />
  <circle cx="41" cy="25" r="3.5" fill="#3D2E00" />""",
    "LeafIcon": """<path d="M52 8C28 8 12 22 12 42c0 6 2 10 4 12 2-14 10-26 24-32-12 10-20 22-22 34 16 4 34-4 34-26 0-8-2-16 0-22z" fill="#86EFAC" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M20 52C26 40 34 32 44 26" stroke="#3D2E00" stroke-width="2.5" fill="none" stroke-linecap="round" />""",
    "MicIcon": """<rect x="24" y="6" width="16" height="28" rx="8" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M16 30c0 9 7 16 16 16s16-7 16-16" fill="none" stroke="#3D2E00" stroke-width="3" stroke-linecap="round" />
  <path d="M32 46v10M24 56h16" stroke="#3D2E00" stroke-width="3.5" stroke-linecap="round" />""",
    "MoneyBagIcon": """<path d="M24 16h16l6 10c4 8 2 28-14 28S12 34 16 26l8-10z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <rect x="22" y="10" width="20" height="8" rx="3" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <text x="32" y="42" text-anchor="middle" font-size="16" font-weight="900" fill="#3D2E00">$</text>""",
    "MoneyIcon": """<ellipse cx="32" cy="44" rx="20" ry="9" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <ellipse cx="32" cy="38" rx="20" ry="9" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <ellipse cx="32" cy="36" rx="14" ry="5.5" fill="#FFE08A" opacity="0.7" />
  <text x="32" y="42.5" text-anchor="middle" font-size="12" font-weight="900" fill="#3D2E00">$</text>""",
    "MuscleIcon": """<path d="M12 40c0-8 6-12 14-12 4 0 7 1 10 3 3-4 9-5 13-2 5 4 5 12 0 17-6 7-18 8-26 6-7-2-11-6-11-12z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M36 31c4-3 9-3 12 0 3 3 3 9-1 12" fill="#FFE08A" opacity="0.55" />""",
    "MusicIcon": """<path d="M46 8v30a8 8 0 1 1-6-7.7V16L24 22v26a8 8 0 1 1-6-7.7V16l28-8z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <ellipse cx="18" cy="48" rx="7" ry="6" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <ellipse cx="40" cy="38" rx="7" ry="6" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />""",
    "PlaneIcon": """<path d="M56 12L8 30l16 6 6 16 8-12 12 4 6-32z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M24 36l24-18" stroke="#E8A912" stroke-width="3" />""",
    "QuestionIcon": """<circle cx="32" cy="32" r="24" fill="#7DD3FC" stroke="#3D2E00" stroke-width="2.5" />
  <text x="32" y="43" text-anchor="middle" font-size="30" font-weight="900" fill="#3D2E00">?</text>""",
    "RocketIcon": """<path d="M32 4c8 6 12 16 12 26l-12 10-12-10C20 20 24 10 32 4z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <circle cx="32" cy="22" r="6" fill="#7DD3FC" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M20 30l-8 10 10-2M44 30l8 10-10-2" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M28 44l4 14 4-14" fill="#FB923C" stroke="#3D2E00" stroke-width="2" />""",
    "SadIcon": """<circle cx="32" cy="32" r="26" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M20 46c3-6 7-8 12-8s9 2 12 8" stroke="#3D2E00" stroke-width="3.5" fill="none" stroke-linecap="round" />
  <circle cx="23" cy="26" r="3.5" fill="#3D2E00" />
  <circle cx="41" cy="26" r="3.5" fill="#3D2E00" />
  <ellipse cx="24" cy="50" rx="3" ry="5" fill="#7DD3FC" />""",
    "StarIcon": """<path d="M32 6l7.6 15.4L57 24l-12.5 12 3 17.5L32 45l-15.5 8.5 3-17.5L7 24l17.4-2.6L32 6z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M32 12l5 10 11 1.6-8 7.6" fill="#FFE08A" opacity="0.6" />""",
    "TargetIcon": """<circle cx="32" cy="32" r="24" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <circle cx="32" cy="32" r="15" fill="#FFE08A" stroke="#3D2E00" stroke-width="2" />
  <circle cx="32" cy="32" r="7" fill="#F87171" stroke="#3D2E00" stroke-width="2" />
  <circle cx="32" cy="32" r="2.5" fill="#FFE08A" />""",
    "TrendUpIcon": """<path d="M6 50L24 32l10 10 22-24" stroke="#86EFAC" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M44 14h14v14" fill="#86EFAC" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <circle cx="24" cy="32" r="4" fill="#FFE08A" stroke="#3D2E00" stroke-width="2" />""",
    "TrophyIcon": """<path d="M18 10h28v14a14 14 0 0 1-28 0V10z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M18 14h-7a9 9 0 0 0 9 12M46 14h7a9 9 0 0 1-9 12" fill="none" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="28" y="37" width="8" height="9" fill="#E8A912" stroke="#3D2E00" stroke-width="2.5" />
  <rect x="20" y="46" width="24" height="7" rx="2.5" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M22 14h20v8a10 10 0 0 1-20 0v-8z" fill="#FFE08A" opacity="0.55" />""",
    "WarningIcon": """<path d="M32 6L60 54H4L32 6z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <rect x="29" y="24" width="6" height="16" rx="3" fill="#3D2E00" />
  <circle cx="32" cy="47" r="3.5" fill="#3D2E00" />""",
    "XIcon": """<circle cx="32" cy="32" r="24" fill="#F87171" stroke="#3D2E00" stroke-width="2.5" />
  <path d="M22 22l20 20M42 22L22 42" stroke="#3D2E00" stroke-width="5" stroke-linecap="round" />""",
    "ZapIcon": """<path d="M36 4L14 36h14l-4 24 22-32H32l4-20z" fill="#FFC53D" stroke="#3D2E00" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M34 10L20 32h9l-3 16 16-24h-10l2-14z" fill="#FFE08A" opacity="0.55" />""",
}

ICON_MAP: dict[str, str] = {
    "angry": "AngryIcon",
    "award": "TrophyIcon",
    "banknote": "MoneyIcon",
    "bar-chart-3": "ChartUpIcon",
    "bell": "BellIcon",
    "bolt": "ZapIcon",
    "brain": "BrainIcon",
    "building": "CityIcon",
    "building-2": "CityIcon",
    "bulb": "IdeaIcon",
    "camera": "CameraIcon",
    "car": "PlaneIcon",
    "chart-column-big": "ChartUpIcon",
    "chart-no-axes-column": "ChartUpIcon",
    "check": "CheckIcon",
    "circle-check": "CheckIcon",
    "circle-x": "XIcon",
    "city": "CityIcon",
    "clapperboard": "CameraIcon",
    "clock": "ClockIcon",
    "coin-flip": "CoinFlipIcon",
    "coins": "MoneyIcon",
    "compass": "GlobeIcon",
    "crosshair": "TargetIcon",
    "crown": "CrownIcon",
    "diamond": "DiamondIcon",
    "dollar-sign": "MoneyIcon",
    "dumbbell": "GymIcon",
    "fire": "FlameIcon",
    "firework": "FireworkIcon",
    "flag": "TrophyIcon",
    "flame": "FlameIcon",
    "food": "FoodIcon",
    "fork-and-knife": "FoodIcon",
    "frown": "SadIcon",
    "gamepad": "GamepadIcon",
    "gamepad-2": "GamepadIcon",
    "gem": "DiamondIcon",
    "gift": "GiftIcon",
    "globe": "GlobeIcon",
    "gym": "GymIcon",
    "headphones": "MusicIcon",
    "heart": "HeartIcon",
    "help-circle": "QuestionIcon",
    "home": "HomeIcon",
    "house": "HomeIcon",
    "king": "CrownIcon",
    "laugh": "LaughIcon",
    "leaf": "LeafIcon",
    "lightbulb": "IdeaIcon",
    "lightbulb-off": "IdeaIcon",
    "map": "GlobeIcon",
    "medal": "TrophyIcon",
    "message-circle-question": "QuestionIcon",
    "mic": "MicIcon",
    "microphone": "MicIcon",
    "money": "MoneyBagIcon",
    "mountain": "LeafIcon",
    "muscle": "MuscleIcon",
    "music": "MusicIcon",
    "party": "FireworkIcon",
    "party-popper": "TrophyIcon",
    "pizza": "FoodIcon",
    "plane": "PlaneIcon",
    "present": "GiftIcon",
    "rocket": "RocketIcon",
    "sad": "SadIcon",
    "smile": "LaughIcon",
    "spark": "FireworkIcon",
    "sparkles": "StarIcon",
    "star": "StarIcon",
    "sun": "LeafIcon",
    "target": "TargetIcon",
    "timer": "ClockIcon",
    "trees": "LeafIcon",
    "trending-up": "TrendUpIcon",
    "trending-up-icon": "ZapIcon",
    "triangle-alert": "WarningIcon",
    "trophy": "TrophyIcon",
    "users": "LaughIcon",
    "utensils": "FoodIcon",
    "video": "CameraIcon",
    "wallet": "MoneyBagIcon",
    "warning": "WarningIcon",
    "x": "XIcon",
    "zap": "ZapIcon",
}

CATEGORY_ICON: dict[str, str] = {
    "city": "CityIcon",
    "fire": "FlameIcon",
    "fitness": "GymIcon",
    "food": "FoodIcon",
    "money": "MoneyIcon",
    "nature": "LeafIcon",
    "people": "LaughIcon",
    "success": "TrophyIcon",
    "tech": "BrainIcon",
    "travel": "PlaneIcon",
}

DEFAULT_ICON = "StarIcon"


def resolve_icon(category: str | None, icon: str | None) -> str:
    """Mirror getColoredIcon() di colored-icon.tsx (urutan identik)."""
    if icon and icon in ICON_MAP:
        return ICON_MAP[icon]
    if category and category in CATEGORY_ICON:
        return CATEGORY_ICON[category]
    if category and category in ICON_MAP:
        return ICON_MAP[category]
    return DEFAULT_ICON


def svg_document(component: str, size: int = 256) -> str:
    """SVG lengkap siap diraster (viewBox 0 0 64 64 seperti <Base>)."""
    body = ICON_SVG.get(component) or ICON_SVG[DEFAULT_ICON]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" '
        f'width="{size}" height="{size}">{body}</svg>'
    )
